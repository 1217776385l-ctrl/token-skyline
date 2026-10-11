#!/usr/bin/env python3
"""Parser unit tests for Token Skyline. Run: python3 tests/test_parsers.py"""
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import server  # noqa: E402
from make_fixtures import make  # noqa: E402


class TestParsers(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = Path(cls.tmp.name)
        make(root)
        cls.claude = server.scan_claude(root / "claude")
        cls.codex = server.scan_codex(root / "codex")

    def test_claude_days(self):
        # fixture dates are UTC; in a UTC+8 tz the 16:30Z line lands on 03-03
        self.assertTrue(len(self.claude) >= 2)
        day1 = self.claude["2026-03-01"]
        self.assertEqual(day1["requests"], 2)  # duplicate msg id ignored
        self.assertEqual(day1["fresh_in"], 110)   # 100 + 10
        self.assertEqual(day1["cache_read"], 290)  # 200 + 90
        self.assertEqual(day1["cache_write"], 50)
        self.assertEqual(day1["out"], 25)          # 20 + 5

    def test_claude_context_label(self):
        day1 = self.claude["2026-03-01"]
        self.assertIn("demo-app", day1["contexts"])

    def test_claude_models(self):
        day1 = self.claude["2026-03-01"]
        self.assertEqual(day1["models"]["claude-sonnet-4-5"], [2, 110 + 290 + 50 + 25])

    def test_codex_modern_delta(self):
        day = self.claude and self.codex["2026-03-01"]
        # two deltas: (1000-800 cache,50 out) + (2000,1600 cache,70 out)
        self.assertEqual(day["requests"], 2)
        self.assertEqual(day["fresh_in"], 200 + 400)   # in - cached
        self.assertEqual(day["cache_read"], 800 + 1600)
        self.assertEqual(day["out"], 50 + 70)
        self.assertEqual(day["models"]["gpt-5.2-codex"][0], 2)

    def test_codex_legacy_diff(self):
        self.assertIn("2026-03-02", self.codex)
        day = self.codex["2026-03-02"]
        self.assertEqual(day["requests"], 2)
        self.assertEqual(day["fresh_in"], 500 + 600)    # (500-0) + (1000-400)
        self.assertEqual(day["cache_read"], 0 + 400)
        self.assertEqual(day["out"], 30 + 30)

    def test_time_helpers(self):
        self.assertEqual(server.iso_to_local_date("2026-03-01T23:00:00.000Z"),
                         server.iso_to_local_date("2026-03-01T23:00:00+00:00"))
        self.assertIsNone(server.iso_to_local_date("garbage"))
        self.assertIsNone(server.epoch_ms_to_local_date(None))

    def test_merge_shape(self):
        days = {}
        add = server.add_usage
        add(days, "2026-03-01", 10, 20, 0, 5, model="m", context="proj")
        add(days, "2026-03-01", 1, 2, 0, 1, model="m", context="proj")
        d = days["2026-03-01"]
        self.assertEqual(server.day_total(d), 39)  # (10+20+5) + (1+2+1)
        self.assertEqual(d["requests"], 2)
        self.assertEqual(d["models"]["m"], [2, 39])


if __name__ == "__main__":
    unittest.main(verbosity=2)
