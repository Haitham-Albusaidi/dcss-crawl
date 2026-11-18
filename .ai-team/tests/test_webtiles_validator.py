"""
Unit tests for DCSS WebTilesValidator.
"""

import os
import sys
import unittest

# Add .ai-team root to sys.path
TEST_DIR = os.path.dirname(os.path.abspath(__file__))
AI_TEAM_ROOT = os.path.dirname(TEST_DIR)
if AI_TEAM_ROOT not in sys.path:
    sys.path.insert(0, AI_TEAM_ROOT)

from validation.webtiles_validator import WebTilesValidator


class TestWebTilesValidator(unittest.TestCase):
    """Tests for WebTiles assets, CSS selectors, z-index stack, and keybindings."""

    def setUp(self):
        parent = os.path.dirname(AI_TEAM_ROOT)
        if os.path.exists(os.path.join(parent, "crawl-ref")):
            self.crawl_root = parent
            self.workspace_root = os.path.dirname(parent)
        else:
            self.workspace_root = parent
            self.crawl_root = os.path.join(self.workspace_root, "crawl")
        self.validator = WebTilesValidator(root_dir=self.crawl_root)

    def test_critical_assets_exist(self):
        """All critical WebTiles static files must exist in the repository."""
        res = self.validator.check_asset_files_exist(self.crawl_root)
        self.assertTrue(res["passed"], f"Missing assets: {res.get('missing')}")

    def test_required_css_selectors(self):
        """WebTiles style.css must contain required HUD, monster codex, and modal selectors."""
        res = self.validator.check_required_css_rules(self.crawl_root)
        self.assertTrue(res["passed"], f"Missing selectors: {res.get('missing')}")

    def test_zindex_hierarchy(self):
        """ui-stack modal layer must have z-index >= 100000 so it renders on top of tiles."""
        res = self.validator.check_zindex_hierarchy(self.crawl_root)
        self.assertTrue(res["passed"], f"z-index hierarchy failed: {res.get('message')}")

    def test_keybinding_handlers(self):
        """Keyboard event listeners must exist in player.js and menu.js."""
        res = self.validator.check_keybinding_handlers(self.crawl_root)
        self.assertTrue(res["passed"], f"Keybinding handlers check failed: {res.get('message')}")

    def test_validate_all_offline(self):
        """Full validation run in offline mode must pass all static file checks."""
        res = self.validator.validate_all(target_worktree=self.crawl_root, check_server=False)
        self.assertTrue(res["passed"], f"Validation failed: {res['failed_checks']} checks failed.")
        self.assertEqual(res["passed_checks"], 4)


if __name__ == "__main__":
    unittest.main()
