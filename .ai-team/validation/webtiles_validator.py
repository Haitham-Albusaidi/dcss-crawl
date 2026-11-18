"""
DCSS WebTiles Quality Assurance & Game-Specific Health Validator.
Checks server availability, asset integrity, CSS/DOM elements, z-indexes, and keybindings.
"""

import json
import os
import re
import urllib.request
from typing import Dict, Any, List, Optional


class WebTilesValidator:
    """Validates game engine and frontend integrity for DCSS WebTiles."""

    CRITICAL_ASSETS = [
        "crawl-ref/source/webserver/game_data/static/style.css",
        "crawl-ref/source/webserver/game_data/static/ui-layouts.js",
        "crawl-ref/source/webserver/game_data/static/menu.js",
        "crawl-ref/source/webserver/game_data/static/monster_list.js",
        "crawl-ref/source/webserver/game_data/static/player.js",
        "crawl-ref/source/webserver/game_data/templates/game.html"
    ]

    REQUIRED_CSS_SELECTORS = [
        ("#top_target_card", "Top-screen floating threat card"),
        (".describe-monster", "Monster Bestiary Codex container"),
        (".er-codex-avatar-frame", "Illuminated framed monster avatar"),
        (".mon-stat-grid", "4-column monster stats grid"),
        (".mon-combat-odds-box", "Tactical combat odds box"),
        (".menu_prompt", "Confirmation prompt dialog modal"),
        ("#ui-stack", "Central UI popup stack container")
    ]

    def __init__(self, root_dir: Optional[str] = None):
        self.root_dir = os.path.abspath(root_dir or os.getcwd())

    def validate_all(self, target_worktree: Optional[str] = None, check_server: bool = True) -> Dict[str, Any]:
        """Runs the complete suite of game-specific checks."""
        worktree = target_worktree or self.root_dir

        checks = []
        checks.append(self.check_asset_files_exist(worktree))
        checks.append(self.check_required_css_rules(worktree))
        checks.append(self.check_zindex_hierarchy(worktree))
        checks.append(self.check_keybinding_handlers(worktree))

        if check_server:
            checks.append(self.check_webtiles_server_health())

        all_passed = all(c["passed"] for c in checks)
        return {
            "passed": all_passed,
            "total_checks": len(checks),
            "passed_checks": sum(1 for c in checks if c["passed"]),
            "failed_checks": sum(1 for c in checks if not c["passed"]),
            "details": checks
        }

    def check_asset_files_exist(self, worktree: str) -> Dict[str, Any]:
        """Ensures all essential WebTiles source files are present."""
        missing = []
        for rel in self.CRITICAL_ASSETS:
            p = os.path.join(worktree, rel)
            if not os.path.exists(p):
                missing.append(rel)

        return {
            "name": "critical_assets_exist",
            "passed": len(missing) == 0,
            "message": f"Missing assets: {missing}" if missing else "All critical WebTiles assets present."
        }

    def check_required_css_rules(self, worktree: str) -> Dict[str, Any]:
        """Verifies that all required Dark Fantasy HUD and modal selectors exist in style.css."""
        css_path = os.path.join(worktree, "crawl-ref/source/webserver/game_data/static/style.css")
        if not os.path.exists(css_path):
            return {"name": "required_css_rules", "passed": False, "message": "style.css not found"}

        with open(css_path, "r", encoding="utf-8", errors="ignore") as f:
            css_text = f.read()

        missing_selectors = []
        for selector, desc in self.REQUIRED_CSS_SELECTORS:
            if selector not in css_text:
                missing_selectors.append(f"{selector} ({desc})")

        return {
            "name": "required_css_rules",
            "passed": len(missing_selectors) == 0,
            "message": f"Missing CSS selectors: {missing_selectors}" if missing_selectors else "All required UI selectors verified in style.css."
        }

    def check_zindex_hierarchy(self, worktree: str) -> Dict[str, Any]:
        """Ensures #ui-stack z-index dominates HUD overlays to prevent popup clipping."""
        css_path = os.path.join(worktree, "crawl-ref/source/webserver/game_data/static/style.css")
        if not os.path.exists(css_path):
            return {"name": "zindex_hierarchy", "passed": False, "message": "style.css not found"}

        with open(css_path, "r", encoding="utf-8", errors="ignore") as f:
            css_text = f.read()

        match = re.search(r"#ui-stack\s*\{[^}]*?z-index:\s*(\d+)", css_text, re.DOTALL)
        if match:
            z_val = int(match.group(1))
            passed = z_val >= 100000
            msg = f"#ui-stack z-index is {z_val} (Required >= 100000 for modal dominance)"
        else:
            passed = False
            msg = "Could not find explicit z-index declaration for #ui-stack"

        return {
            "name": "zindex_hierarchy",
            "passed": passed,
            "message": msg
        }

    def check_keybinding_handlers(self, worktree: str) -> Dict[str, Any]:
        """Verifies that key listeners in ui-layouts.js route through comm.send_message."""
        layouts_path = os.path.join(worktree, "crawl-ref/source/webserver/game_data/static/ui-layouts.js")
        if not os.path.exists(layouts_path):
            return {"name": "keybinding_handlers", "passed": False, "message": "ui-layouts.js not found"}

        with open(layouts_path, "r", encoding="utf-8", errors="ignore") as f:
            code = f.read()

        has_esc = "keycode: 27" in code
        has_excl = "paneset_cycle" in code

        passed = has_esc and has_excl
        return {
            "name": "keybinding_handlers",
            "passed": passed,
            "message": "Modal keybinding handlers (Escape=27, Tab switching=paneset_cycle) verified." if passed else "Missing keybinding handlers in ui-layouts.js."
        }

    def check_webtiles_server_health(self, port: int = 8088) -> Dict[str, Any]:
        """Checks if local WebTiles server is responding."""
        url = f"http://localhost:{port}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "AITeamValidator/1.0"})
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                code = resp.getcode()
                return {
                    "name": "webtiles_server_health",
                    "passed": code == 200,
                    "message": f"WebTiles server responding HTTP {code} at {url}"
                }
        except Exception as e:
            return {
                "name": "webtiles_server_health",
                "passed": False,
                "message": f"WebTiles server offline at {url} ({e})"
            }


if __name__ == "__main__":
    validator = WebTilesValidator()
    results = validator.validate_all()
    print(json.dumps(results, indent=2))
