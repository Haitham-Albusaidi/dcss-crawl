"""
Unit tests for CrossAgentReviewer and review report generation.
"""

import os
import sys
import unittest

# Add .ai-team root to sys.path
TEST_DIR = os.path.dirname(os.path.abspath(__file__))
AI_TEAM_ROOT = os.path.dirname(TEST_DIR)
if AI_TEAM_ROOT not in sys.path:
    sys.path.insert(0, AI_TEAM_ROOT)

from workflows.review_workflow import CrossAgentReviewer


class TestReviewWorkflow(unittest.TestCase):
    """Tests for cross-agent diff inspection, regression detection, and criteria evaluation."""

    def setUp(self):
        parent = os.path.dirname(AI_TEAM_ROOT)
        if os.path.basename(parent) in ("antigravity-dev", "ai-team-dev", "crawl", "integration-dev") or os.path.basename(parent).endswith("-dev"):
            self.workspace_root = os.path.dirname(parent)
        else:
            self.workspace_root = parent
        self.antigravity_worktree = os.path.join(self.workspace_root, "antigravity-dev")
        if not os.path.exists(self.antigravity_worktree):
            self.antigravity_worktree = parent
        self.reviewer = CrossAgentReviewer(root_dir=self.workspace_root)

    def test_evaluate_criteria_success(self):
        """Passes criteria when target keywords or files are present in the diff."""
        task = {
            "task_id": "REV-01",
            "acceptance_criteria": [
                "style.css contains top_target_card selector",
                "monster_list.js handles describe-monster"
            ]
        }
        diff_text = """
+ #top_target_card { position: fixed; }
+ .describe-monster { display: block; }
"""
        files_changed = [
            "crawl-ref/source/webserver/game_data/static/style.css",
            "crawl-ref/source/webserver/game_data/static/monster_list.js"
        ]
        results = self.reviewer._evaluate_criteria(task, diff_text, files_changed)
        self.assertEqual(len(results), 2)
        self.assertTrue(all(r["passed"] for r in results))

    def test_regression_detection(self):
        """Detects merge conflict markers, debug prints, and console logs as potential regressions."""
        diff_text = """
+ <<<<<<< HEAD
+ const bug = true;
+ =======
+ >>>>>>> feature/branch
+ console.log("DEBUG: monster card leaking");
"""
        regressions = self.reviewer._detect_regressions(self.antigravity_worktree, diff_text)
        self.assertGreater(len(regressions), 0)
        issues = [r["issue"] for r in regressions]
        self.assertTrue(any("Merge conflict marker" in i for i in issues))
        self.assertTrue(any("Debug console.log statement" in i for i in issues))

    def test_review_markdown_generation(self):
        """Emits structured markdown review report conforming to QA standards."""
        report = {
            "task_id": "REV-02",
            "reviewer": "antigravity",
            "reviewee": "codex",
            "verdict": "APPROVE",
            "score": 10,
            "summary": "Implementation clean, tests passing, no regressions found.",
            "acceptance_criteria_results": [
                {"criterion": "Spell failure rate calculation verified", "passed": True, "notes": "Covered in diff"}
            ],
            "regressions_detected": [],
            "actionable_recommendations": [
                "Proceed with PR creation"
            ]
        }
        md = self.reviewer.generate_markdown_report(report)
        self.assertIn("# Cross-Agent QA Review: REV-02", md)
        self.assertIn("**Verdict**: APPROVE", md)
        self.assertIn("**Overall Score**: 10 / 10", md)
        self.assertIn("Spell failure rate calculation verified", md)


if __name__ == "__main__":
    unittest.main()
