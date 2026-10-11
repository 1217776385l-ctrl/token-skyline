#!/usr/bin/env python3
"""Generate synthetic Claude Code / Codex log fixtures for parser tests.

Usage: python3 tests/make_fixtures.py <target-dir>
"""
import json
import sys
from pathlib import Path


def make(root):
    # ---- Claude Code fixture -------------------------------------------
    claude = root / "claude" / "projects" / "-Users-alice-demo-app"
    claude.mkdir(parents=True)
    lines = [
        # 2026-03-01: one call, 100 fresh + 50 cache-write + 200 cache-read + 20 out
        json.dumps({
            "type": "assistant", "timestamp": "2026-03-01T10:00:00.000Z",
            "cwd": "/Users/alice/demo-app",
            "message": {"id": "msg_a1", "model": "claude-sonnet-4-5",
                        "usage": {"input_tokens": 100,
                                  "cache_creation_input_tokens": 50,
                                  "cache_read_input_tokens": 200,
                                  "output_tokens": 20}},
        }),
        # duplicate message id -> must be ignored
        json.dumps({
            "type": "assistant", "timestamp": "2026-03-01T10:00:01.000Z",
            "cwd": "/Users/alice/demo-app",
            "message": {"id": "msg_a1", "model": "claude-sonnet-4-5",
                        "usage": {"input_tokens": 999, "output_tokens": 999}},
        }),
        # second call same day
        json.dumps({
            "type": "assistant", "timestamp": "2026-03-01T11:30:00.000Z",
            "cwd": "/Users/alice/demo-app",
            "message": {"id": "msg_a2", "model": "claude-sonnet-4-5",
                        "usage": {"input_tokens": 10, "cache_read_input_tokens": 90,
                                  "output_tokens": 5}},
        }),
        # next day (UTC 23:30 on 03-02 stays 03-02 in UTC but 03-03 in UTC+8)
        json.dumps({
            "type": "assistant", "timestamp": "2026-03-02T16:30:00.000Z",
            "cwd": "/Users/alice/other-proj",
            "message": {"id": "msg_a3", "model": "claude-haiku-4",
                        "usage": {"input_tokens": 7, "output_tokens": 3}},
        }),
        # user line with no usage -> ignored
        json.dumps({"type": "user", "timestamp": "2026-03-02T16:31:00.000Z",
                    "message": {"role": "user", "content": "hi"}}),
    ]
    (claude / "sess-1.jsonl").write_text("\n".join(lines) + "\n", encoding="utf-8")

    # ---- Codex fixture ---------------------------------------------------
    codex = root / "codex" / "sessions" / "2026" / "03" / "01"
    codex.mkdir(parents=True)
    codex_lines = [
        json.dumps({"timestamp": "2026-03-01T09:00:00.000Z", "type": "session_meta",
                    "payload": {"id": "s1", "cwd": "/home/alice/rust-proj"}}),
        json.dumps({"timestamp": "2026-03-01T09:01:00.000Z", "type": "turn_context",
                    "payload": {"model": "gpt-5.2-codex"}}),
        # modern format: last_token_usage = per-call delta
        json.dumps({"timestamp": "2026-03-01T09:02:00.000Z", "type": "event_msg",
                    "payload": {"type": "token_count",
                                "info": {"total_token_usage": {
                                    "input_tokens": 1000, "cached_input_tokens": 800,
                                    "output_tokens": 50, "total_tokens": 1050},
                                    "last_token_usage": {
                                        "input_tokens": 1000, "cached_input_tokens": 800,
                                        "output_tokens": 50}}}}),
        json.dumps({"timestamp": "2026-03-01T09:03:00.000Z", "type": "event_msg",
                    "payload": {"type": "token_count",
                                "info": {"total_token_usage": {
                                    "input_tokens": 3000, "cached_input_tokens": 2400,
                                    "output_tokens": 120, "total_tokens": 3120},
                                    "last_token_usage": {
                                        "input_tokens": 2000, "cached_input_tokens": 1600,
                                        "output_tokens": 70}}}}),
        # null info -> ignored
        json.dumps({"timestamp": "2026-03-01T09:04:00.000Z", "type": "event_msg",
                    "payload": {"type": "token_count", "info": None}}),
    ]
    (codex / "rollout-1.jsonl").write_text("\n".join(codex_lines) + "\n", encoding="utf-8")

    # legacy format: cumulative totals only, no last_token_usage
    codex2 = root / "codex" / "sessions" / "2026" / "03" / "02"
    codex2.mkdir(parents=True)
    legacy = [
        json.dumps({"timestamp": "2026-03-02T09:00:00.000Z", "type": "session_meta",
                    "payload": {"id": "s2", "cwd": "/home/alice/web"}}),
        json.dumps({"timestamp": "2026-03-02T09:05:00.000Z", "type": "event_msg",
                    "payload": {"type": "token_count",
                                "info": {"total_token_usage": {
                                    "input_tokens": 500, "cached_input_tokens": 0,
                                    "output_tokens": 30}}}}),
        json.dumps({"timestamp": "2026-03-02T09:06:00.000Z", "type": "event_msg",
                    "payload": {"type": "token_count",
                                "info": {"total_token_usage": {
                                    "input_tokens": 1500, "cached_input_tokens": 400,
                                    "output_tokens": 60}}}}),
    ]
    (codex2 / "rollout-2.jsonl").write_text("\n".join(legacy) + "\n", encoding="utf-8")


if __name__ == "__main__":
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "tests/_fixtures")
    make(target)
    print("fixtures written to", target)
