#!/usr/bin/env python3
"""
Token Skyline — visualize your AI coding agent's token usage as a 3D city.

This server reads local agent logs (READ-ONLY, nothing is modified, nothing
leaves your machine) and serves a small JSON API plus the static frontend.

Supported sources (auto-detected, all optional):
  ZCode        ~/.zcode/cli/db/db.sqlite
  Claude Code  ~/.claude/projects/**/*.jsonl
  Codex CLI    ~/.codex/sessions/**/*.jsonl

Standard library only. Python 3.8+.

Made by LYU Minglei. MIT license.
"""

import argparse
import json
import os
import sqlite3
import threading
import webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".stl": "model/stl",
    ".md": "text/markdown; charset=utf-8",
}

# --------------------------------------------------------------------------
# time helpers


def epoch_ms_to_local_date(ms):
    if not ms:
        return None
    try:
        return datetime.fromtimestamp(ms / 1000.0).strftime("%Y-%m-%d")
    except (OSError, OverflowError, ValueError):
        return None


def iso_to_local_date(s):
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone().strftime("%Y-%m-%d")
    except ValueError:
        return None


# --------------------------------------------------------------------------
# per-day aggregation
# day = {requests, fresh_in, cache_read, cache_write, out, dur_ms,
#        models: {name: [count, tokens]}, contexts: {label: [count, tokens]}}


def blank_day():
    return {
        "requests": 0,
        "fresh_in": 0,
        "cache_read": 0,
        "cache_write": 0,
        "out": 0,
        "dur_ms": 0,
        "models": {},
        "contexts": {},
    }


def day_total(d):
    return d["fresh_in"] + d["cache_read"] + d["cache_write"] + d["out"]


def add_usage(day, date_str, fresh_in, cache_read, cache_write, out,
              dur_ms=0, model=None, context=None, requests=1):
    if not date_str:
        return
    d = day.setdefault(date_str, blank_day())
    tokens = fresh_in + cache_read + cache_write + out
    d["requests"] += requests
    d["fresh_in"] += fresh_in
    d["cache_read"] += cache_read
    d["cache_write"] += cache_write
    d["out"] += out
    d["dur_ms"] += dur_ms or 0
    mrec = d["models"].setdefault(model or "unknown", [0, 0])
    mrec[0] += requests
    mrec[1] += tokens
    if context:
        crec = d["contexts"].setdefault(str(context), [0, 0])
        crec[0] += requests
        crec[1] += tokens


# --------------------------------------------------------------------------
# scanner: ZCode  (SQLite, timestamps are epoch ms, input_tokens INCLUDES cache)


def scan_zcode(db_path):
    con = sqlite3.connect("file:%s?mode=ro" % db_path.as_posix(), uri=True, timeout=3)
    try:
        cur = con.execute(
            "SELECT m.started_at, m.model_id, m.input_tokens, m.output_tokens,"
            " m.reasoning_tokens, m.cache_creation_input_tokens,"
            " m.cache_read_input_tokens, m.duration_ms, m.session_id,"
            " s.title, s.directory"
            " FROM model_usage m LEFT JOIN session s ON s.id = m.session_id"
            " WHERE m.status IN ('completed','cancelled')"
        )
        days = {}
        for (started, model, inp, out, rsn, cw, cr, dur,
             _sid, title, directory) in cur:
            inp, out, rsn = inp or 0, out or 0, rsn or 0
            cw, cr, dur = cw or 0, cr or 0, dur or 0
            if inp == 0 and out == 0:
                continue
            fresh = max(0, inp - cr - cw)
            # this backend reports reasoning as a separate column
            out_all = out + rsn
            ds = epoch_ms_to_local_date(started)
            label = title or (Path(directory).name if directory else None) or "Untitled"
            add_usage(days, ds, fresh, cr, cw, out_all,
                      dur_ms=dur, model=model, context=label)
        return days
    finally:
        con.close()


# --------------------------------------------------------------------------
# scanner: Claude Code  (~/.claude/projects/<project>/*.jsonl)
# assistant lines carry message.usage; input_tokens EXCLUDES cache tokens.


def scan_claude(root):
    days = {}
    seen_ids = set()
    for f in sorted(root.rglob("*.jsonl")):
        try:
            text = f.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for line in text.splitlines():
            if '"assistant"' not in line or '"usage"' not in line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if obj.get("type") != "assistant":
                continue
            msg = obj.get("message") or {}
            usage = msg.get("usage") or {}
            mid = msg.get("id")
            if mid:
                if mid in seen_ids:
                    continue
                seen_ids.add(mid)
            inp = usage.get("input_tokens") or 0
            cr = usage.get("cache_read_input_tokens") or 0
            cw = usage.get("cache_creation_input_tokens") or 0
            out = usage.get("output_tokens") or 0
            if inp == 0 and cr == 0 and cw == 0 and out == 0:
                continue
            ds = iso_to_local_date(obj.get("timestamp"))
            cwd = obj.get("cwd") or ""
            label = Path(cwd).name if cwd else f.parent.name
            add_usage(days, ds, inp, cr, cw, out,
                      model=msg.get("model"), context=label)
    return days


# --------------------------------------------------------------------------
# scanner: Codex CLI  (~/.codex/sessions/**/*.jsonl)
# token_count events carry usage; input_tokens INCLUDES cached_input_tokens.


def scan_codex(root):
    days = {}
    for f in sorted(root.rglob("*.jsonl")):
        cwd = None
        model = None
        prev_total = None
        try:
            fh = f.open(encoding="utf-8", errors="replace")
        except OSError:
            continue
        with fh:
            for line in fh:
                if "token_count" not in line and "session_meta" not in line \
                        and "turn_context" not in line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                t = obj.get("type")
                p = obj.get("payload") or {}
                if t == "session_meta":
                    cwd = p.get("cwd") or cwd
                    continue
                if t == "turn_context":
                    model = p.get("model") or model
                    continue
                if t != "event_msg" or p.get("type") != "token_count":
                    continue
                info = p.get("info")
                if not info:
                    continue
                usage = info.get("last_token_usage")
                if usage:
                    pass
                else:
                    # older builds only expose cumulative totals -> take diffs
                    tot = info.get("total_token_usage") or {}
                    cur = (tot.get("input_tokens") or 0,
                           tot.get("cached_input_tokens") or 0,
                           tot.get("output_tokens") or 0)
                    if prev_total is None:
                        usage = {"input_tokens": cur[0],
                                 "cached_input_tokens": cur[1],
                                 "output_tokens": cur[2]}
                    else:
                        usage = {"input_tokens": cur[0] - prev_total[0],
                                 "cached_input_tokens": cur[1] - prev_total[1],
                                 "output_tokens": cur[2] - prev_total[2]}
                    prev_total = cur
                inp = usage.get("input_tokens") or 0
                cach = usage.get("cached_input_tokens") or 0
                out = usage.get("output_tokens") or 0
                if inp == 0 and out == 0:
                    continue
                fresh = max(0, inp - cach)
                ds = iso_to_local_date(obj.get("timestamp"))
                label = Path(cwd).name if cwd else f.parent.name
                add_usage(days, ds, fresh, cach, 0, out,
                          model=model or "codex", context=label)
    return days


SCANNERS = {"zcode": scan_zcode, "claude": scan_claude, "codex": scan_codex}

# --------------------------------------------------------------------------
# source detection


def default_paths():
    home = Path.home()
    return {
        "zcode": home / ".zcode" / "cli" / "db" / "db.sqlite",
        "claude": home / ".claude" / "projects",
        "codex": home / ".codex" / "sessions",
    }


def resolve_paths(args):
    defaults = default_paths()
    return {
        "zcode": Path(args.zcode_db or os.environ.get("TOKEN_SKYLINE_ZCODE_DB") or defaults["zcode"]),
        "claude": Path(args.claude_dir or os.environ.get("TOKEN_SKYLINE_CLAUDE_DIR") or defaults["claude"]),
        "codex": Path(args.codex_dir or os.environ.get("TOKEN_SKYLINE_CODEX_DIR") or defaults["codex"]),
    }


def fingerprint(tool, path):
    try:
        if path.is_file():
            st = path.stat()
            return (str(path), st.st_mtime_ns, st.st_size)
        items = []
        for f in sorted(path.rglob("*.jsonl")):
            try:
                st = f.stat()
                items.append((str(f), st.st_mtime_ns, st.st_size))
            except OSError:
                pass
        return tuple(items)
    except OSError:
        return None


_CACHE = {}
_LOCK = threading.Lock()


def collect(args):
    sources = []
    merged = {}  # date -> {tool: day}
    paths = resolve_paths(args)
    for tool in ("zcode", "claude", "codex"):
        path = paths[tool]
        if not path.exists():
            sources.append({"tool": tool, "path": str(path), "status": "not_found"})
            continue
        fp = fingerprint(tool, path)
        with _LOCK:
            hit = _CACHE.get(tool)
            if hit and hit[0] == fp:
                days = hit[1]
            else:
                days = SCANNERS[tool](path)
                _CACHE[tool] = (fp, days)
        requests = sum(d["requests"] for d in days.values())
        tokens = sum(day_total(d) for d in days.values())
        sources.append({"tool": tool, "path": str(path), "status": "ok",
                        "days": len(days), "requests": requests,
                        "total_tokens": tokens})
        for ds, d in days.items():
            merged.setdefault(ds, {})[tool] = d

    days_out = []
    for ds in sorted(merged):
        days_out.append({
            "date": ds,
            "tools": {
                tool: {
                    "requests": d["requests"],
                    "input": d["fresh_in"],
                    "cache_read": d["cache_read"],
                    "cache_write": d["cache_write"],
                    "output": d["out"],
                    "total": day_total(d),
                    "duration_ms": d["dur_ms"],
                    "models": [{"name": k, "requests": v[0], "total": v[1]}
                               for k, v in d["models"].items()],
                    "contexts": [{"label": k, "requests": v[0], "tokens": v[1]}
                                 for k, v in d["contexts"].items()],
                }
                for tool, d in merged[ds].items()
            },
        })

    return {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "sources": sources,
        "days": days_out,
    }


# --------------------------------------------------------------------------
# static file server


class Handler(BaseHTTPRequestHandler):
    server_version = "TokenSkyline/1.0"

    def _send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        if path == "/api/data":
            payload = json.dumps(collect(ARGS), ensure_ascii=False).encode("utf-8")
            self._send(200, payload, "application/json; charset=utf-8")
            return
        if path in ("/", "/index.html"):
            path = "/index.html"
        target = (HERE / path.lstrip("/")).resolve()
        if not str(target).startswith(str(HERE)) or not target.is_file():
            self._send(404, b"not found", "text/plain; charset=utf-8")
            return
        ctype = MIME.get(target.suffix.lower(), "application/octet-stream")
        try:
            body = target.read_bytes()
        except OSError:
            self._send(404, b"not found", "text/plain; charset=utf-8")
            return
        self._send(200, body, ctype)

    def log_message(self, fmt, *args):  # keep the console clean
        if "/api/" not in (args[0] if args else ""):
            return


ARGS = None


def main():
    global ARGS
    ap = argparse.ArgumentParser(
        description="Token Skyline - visualize your AI coding tokens in 3D")
    ap.add_argument("--port", type=int,
                    default=int(os.environ.get("TOKEN_SKYLINE_PORT", 8643)))
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--no-open", action="store_true", help="don't open the browser")
    ap.add_argument("--zcode-db", default=None, help="path to ZCode db.sqlite")
    ap.add_argument("--claude-dir", default=None, help="path to ~/.claude/projects")
    ap.add_argument("--codex-dir", default=None, help="path to ~/.codex/sessions")
    ARGS = ap.parse_args()

    httpd = ThreadingHTTPServer((ARGS.host, ARGS.port), Handler)
    url = "http://%s:%d" % (ARGS.host, ARGS.port)
    print()
    print("  Token Skyline  -  your AI tokens, in 3D")
    print("  ----------------------------------------")
    for s in resolve_paths(ARGS).values():
        if s.exists():
            print("  [x] %-8s %s" % ("", s))
        else:
            print("  [ ] %-8s %s  (not found, skipped)" % ("", s))
    print()
    print("  Serving at %s  (Ctrl+C to stop)" % url)
    print("  All data stays on this machine. Made by LYU Minglei.")
    print()
    if not ARGS.no_open:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Bye.")


if __name__ == "__main__":
    main()
