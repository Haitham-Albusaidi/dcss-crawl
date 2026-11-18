"""
Unit tests for BuildValidator syntax and integrity checks.
"""

import os
import sys
import tempfile
import unittest

# Add .ai-team root to sys.path
TEST_DIR = os.path.dirname(os.path.abspath(__file__))
AI_TEAM_ROOT = os.path.dirname(TEST_DIR)
if AI_TEAM_ROOT not in sys.path:
    sys.path.insert(0, AI_TEAM_ROOT)

from validation.build_validator import BuildValidator


class TestBuildValidator(unittest.TestCase):
    """Tests for JavaScript, CSS, HTML, and Python syntax validation."""

    def setUp(self):
        self.validator = BuildValidator()
        self.temp_dir = tempfile.mkdtemp()

    def test_js_validation_valid(self):
        js_file = os.path.join(self.temp_dir, "valid.js")
        with open(js_file, "w", encoding="utf-8") as f:
            f.write("function test() { const arr = [1, 2, 3]; return { a: arr }; }")
        passed, msg = self.validator.validate_js(js_file)
        self.assertTrue(passed, msg)

    def test_js_validation_unbalanced(self):
        js_file = os.path.join(self.temp_dir, "invalid.js")
        with open(js_file, "w", encoding="utf-8") as f:
            f.write("function broken() { const arr = [1, 2, 3; return arr; }")
        passed, msg = self.validator.validate_js(js_file)
        self.assertFalse(passed)
        self.assertTrue("Unmatched" in msg or "Mismatched" in msg, msg)

    def test_css_validation_valid(self):
        css_file = os.path.join(self.temp_dir, "valid.css")
        with open(css_file, "w", encoding="utf-8") as f:
            f.write(".box { margin: 0; padding: [10px]; }")
        passed, msg = self.validator.validate_css(css_file)
        self.assertTrue(passed, msg)

    def test_css_validation_unbalanced(self):
        css_file = os.path.join(self.temp_dir, "invalid.css")
        with open(css_file, "w", encoding="utf-8") as f:
            f.write(".box { margin: 0; padding: 10px; ")
        passed, msg = self.validator.validate_css(css_file)
        self.assertFalse(passed)
        self.assertIn("Mismatched braces", msg)

    def test_python_validation(self):
        py_valid = os.path.join(self.temp_dir, "valid.py")
        with open(py_valid, "w", encoding="utf-8") as f:
            f.write("def foo():\n    return 42\n")
        passed, msg = self.validator.validate_python(py_valid)
        self.assertTrue(passed, msg)

        py_invalid = os.path.join(self.temp_dir, "invalid.py")
        with open(py_invalid, "w", encoding="utf-8") as f:
            f.write("def broken(\n    return 42\n")
        passed, msg = self.validator.validate_python(py_invalid)
        self.assertFalse(passed)
        self.assertIn("SyntaxError", msg)


if __name__ == "__main__":
    unittest.main()
