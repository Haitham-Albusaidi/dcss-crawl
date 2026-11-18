"""
Unit tests for TaskGraph, DAG dependency scheduling, and dynamic role assignment.
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

from workflows.task_graph import TaskGraph


class TestTaskGraph(unittest.TestCase):
    """Tests for task decomposition, dependency resolution, and agent assignment."""

    def setUp(self):
        self.workspace_root = os.path.dirname(AI_TEAM_ROOT)
        self.temp_dir = tempfile.mkdtemp()
        self.graph = TaskGraph(root_dir=self.temp_dir)

    def test_spell_system_request_decomposition(self):
        """Decomposes user request into backend (Codex), frontend (Antigravity), and review stages."""
        request = "Improve the spell system and create a better spell selection interface"
        tasks = self.graph.decompose_request(request, base_id="REQ-TEST")

        self.assertEqual(len(tasks), 3)

        # Stage 1: Codex Backend
        task1 = tasks[0]
        self.assertEqual(task1["stage"], 1)
        self.assertEqual(task1["assigned_agent"], "codex")
        self.assertIn("ai-team-dev", task1["worktree_path"])
        self.assertEqual(task1["dependencies"], [])

        # Stage 2: Antigravity UI/UX
        task2 = tasks[1]
        self.assertEqual(task2["stage"], 2)
        self.assertEqual(task2["assigned_agent"], "antigravity")
        self.assertIn("antigravity-dev", task2["worktree_path"])
        self.assertIn(task1["task_id"], task2["dependencies"])

        # Stage 3: Cross QA Review
        task3 = tasks[2]
        self.assertEqual(task3["stage"], 3)
        self.assertEqual(task3["assigned_agent"], "antigravity")
        self.assertIn(task2["task_id"], task3["dependencies"])

    def test_dependency_resolution_and_ready_tasks(self):
        """Only tasks with all dependencies satisfied must be marked ready for execution."""
        request = "Improve the spell system and create a better spell selection interface"
        tasks = self.graph.decompose_request(request, base_id="REQ-DEP")

        # Initial state: only Stage 1 should be ready
        ready = self.graph.get_ready_tasks()
        ready_ids = [t["task_id"] for t in ready]
        self.assertIn("REQ-DEP-01-SPELL-ENGINE", ready_ids)
        self.assertNotIn("REQ-DEP-02-SPELL-UI", ready_ids)
        self.assertNotIn("REQ-DEP-03-CROSS-QA", ready_ids)

        # Mark Stage 1 completed
        self.graph.mark_completed("REQ-DEP-01-SPELL-ENGINE", success=True)
        ready = self.graph.get_ready_tasks()
        ready_ids = [t["task_id"] for t in ready]
        self.assertIn("REQ-DEP-02-SPELL-UI", ready_ids)
        self.assertNotIn("REQ-DEP-03-CROSS-QA", ready_ids)

        # Mark Stage 2 completed
        self.graph.mark_completed("REQ-DEP-02-SPELL-UI", success=True)
        ready = self.graph.get_ready_tasks()
        ready_ids = [t["task_id"] for t in ready]
        self.assertIn("REQ-DEP-03-CROSS-QA", ready_ids)

    def test_custom_assignment_rules(self):
        """Task assignment must be configurable and not hardcoded."""
        custom_rules = [
            {
                "category": "sound_design",
                "keywords": ["music", "audio", "sound"],
                "agent": "sound_bot",
                "worktree_suffix": "audio-dev"
            }
        ]
        graph = TaskGraph(root_dir=self.temp_dir, rules=custom_rules)
        agent = graph._resolve_agent("fix sound and audio files", default="codex")
        self.assertEqual(agent, "sound_bot")

    def test_persistence_save_and_load(self):
        """Tasks saved to disk must be fully restored upon reloading."""
        task = {
            "task_id": "PERSIST-01",
            "title": "Persistent Task",
            "description": "Save test",
            "assigned_agent": "antigravity",
            "worktree_path": os.path.join(self.workspace_root, "antigravity-dev"),
            "status": "PENDING",
            "dependencies": []
        }
        self.graph.add_task(task)
        self.graph.save_all_tasks()

        # Reload in fresh instance
        new_graph = TaskGraph(root_dir=self.temp_dir)
        new_graph.load_all_tasks()
        self.assertIn("PERSIST-01", new_graph.tasks)
        self.assertEqual(new_graph.tasks["PERSIST-01"]["title"], "Persistent Task")


if __name__ == "__main__":
    unittest.main()
