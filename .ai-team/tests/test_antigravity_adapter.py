"""
Unit tests for AntigravityAdapter, BaseAdapter, and MockAdapter.
"""

import os
import sys
import unittest

# Add .ai-team root to sys.path
TEST_DIR = os.path.dirname(os.path.abspath(__file__))
AI_TEAM_ROOT = os.path.dirname(TEST_DIR)
if AI_TEAM_ROOT not in sys.path:
    sys.path.insert(0, AI_TEAM_ROOT)

from adapters.antigravity_adapter import AntigravityAdapter
from adapters.mock_adapter import MockAdapter
from adapters.base_adapter import BaseAdapter


class TestAntigravityAdapter(unittest.TestCase):
    """Tests for Antigravity execution adapter and security constraints."""

    def setUp(self):
        parent = os.path.dirname(AI_TEAM_ROOT)
        if os.path.basename(parent) in ("antigravity-dev", "ai-team-dev", "crawl", "integration-dev") or os.path.basename(parent).endswith("-dev"):
            self.workspace_root = os.path.dirname(parent)
        else:
            self.workspace_root = parent
        self.antigravity_worktree = os.path.join(self.workspace_root, "antigravity-dev")
        self.codex_worktree = os.path.join(self.workspace_root, "ai-team-dev")

    def test_missing_required_fields_raises_error(self):
        """Adapter must reject task payloads missing mandatory schema fields."""
        adapter = AntigravityAdapter(allowed_root=self.workspace_root)
        invalid_task = {
            "task_id": "TEST-01",
            "title": "Incomplete task"
            # Missing description, assigned_agent, worktree_path
        }
        with self.assertRaises(ValueError):
            adapter.validate_task_input(invalid_task)

    def test_nonexistent_worktree_raises_error(self):
        """Adapter must reject worktrees that do not exist on disk."""
        adapter = AntigravityAdapter(allowed_root=self.workspace_root)
        task = {
            "task_id": "TEST-02",
            "title": "Bad path task",
            "description": "Points to nowhere",
            "assigned_agent": "antigravity",
            "worktree_path": os.path.join(self.workspace_root, "nonexistent-worktree-xyz")
        }
        with self.assertRaises(FileNotFoundError):
            adapter.validate_task_input(task)

    def test_worktree_boundary_enforcement(self):
        """Antigravity MUST NOT be allowed to execute directly in Codex's worktree."""
        adapter = AntigravityAdapter(allowed_root=self.workspace_root)
        task = {
            "task_id": "TEST-03",
            "title": "Cross-boundary violation attempt",
            "description": "Attempting to run in Codex's worktree",
            "assigned_agent": "antigravity",
            "worktree_path": self.codex_worktree
        }
        with self.assertRaises(PermissionError):
            adapter.execute(task)

    def test_build_prompt_structure(self):
        """Prompt assembler must include title, task ID, worktree boundaries, and criteria."""
        adapter = AntigravityAdapter(allowed_root=self.workspace_root)
        task = {
            "task_id": "TEST-04",
            "title": "UI Modernization Task",
            "description": "Modernize the monster details window.",
            "assigned_agent": "antigravity",
            "worktree_path": self.antigravity_worktree,
            "target_files": ["crawl-ref/source/webserver/game_data/static/monster_list.js"],
            "acceptance_criteria": [
                "Monster card displays at top center",
                "Combat odds box formatted nicely"
            ]
        }
        prompt = adapter._build_prompt(task, "Sample Context")
        self.assertIn("TEST-04", prompt)
        self.assertIn("UI Modernization Task", prompt)
        self.assertIn("monster_list.js", prompt)
        self.assertIn("Monster card displays at top center", prompt)
        self.assertIn("Sample Context", prompt)

    def test_mock_adapter_execution(self):
        """MockAdapter must produce a valid TaskReport schema response."""
        adapter = MockAdapter(allowed_root=self.workspace_root)
        task = {
            "task_id": "MOCK-01",
            "title": "Simulated Feature",
            "description": "Simulate running a task",
            "assigned_agent": "mock",
            "worktree_path": self.antigravity_worktree
        }
        report = adapter.execute(task)
        self.assertEqual(report["task_id"], "MOCK-01")
        self.assertEqual(report["agent"], "mock")
        self.assertEqual(report["status"], "SUCCESS")
        self.assertIn("duration_seconds", report)
        self.assertIn("changed_files", report)
        self.assertIn("test_results", report)
        self.assertIsInstance(report["test_results"]["passed"], int)


if __name__ == "__main__":
    unittest.main()
