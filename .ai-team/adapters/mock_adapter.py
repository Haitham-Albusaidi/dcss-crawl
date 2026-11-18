"""
Mock Agent Adapter for testing task workflows and offline QA.
"""

import json
import os
import time
from typing import Dict, Any, Optional

try:
    from adapters.base_adapter import BaseAdapter
except ImportError:
    from .base_adapter import BaseAdapter


class MockAdapter(BaseAdapter):
    """Simulates an AI agent execution for testing without invoking external APIs."""

    def __init__(self, allowed_root: Optional[str] = None, should_fail: bool = False):
        super().__init__(agent_name="mock", allowed_root=allowed_root)
        self.should_fail = should_fail

    def execute(self, task: Dict[str, Any]) -> Dict[str, Any]:
        start_time = time.time()
        self.validate_task_input(task)

        task_id = task["task_id"]
        worktree_path = os.path.abspath(task["worktree_path"])

        # Simulate work by touching or updating a mock test file if target_files specified
        changed = []
        if task.get("target_files"):
            for tf in task["target_files"]:
                target_p = os.path.join(worktree_path, tf)
                os.makedirs(os.path.dirname(target_p), exist_ok=True)
                with open(target_p, "a", encoding="utf-8") as f:
                    f.write(f"\n// Mock adapter updated for {task_id}\n")
                changed.append({
                    "path": tf,
                    "status": "modified",
                    "additions": 2,
                    "deletions": 0
                })

        duration = round(time.time() - start_time, 2)
        status = "FAILURE" if self.should_fail else "SUCCESS"
        summary = "Mock failure injected." if self.should_fail else f"Simulated execution for {task['title']} succeeded."

        report = {
            "task_id": task_id,
            "agent": "mock",
            "status": status,
            "summary": summary,
            "changed_files": changed or self.inspect_changed_files(worktree_path),
            "git_commit": self.get_latest_commit(worktree_path),
            "test_results": {
                "passed": 5 if not self.should_fail else 2,
                "failed": 0 if not self.should_fail else 3,
                "errors": 0,
                "details": ["mock_test_1: PASS", "mock_test_2: PASS"]
            },
            "validation": {
                "passed": not self.should_fail,
                "checks": [{"name": "mock_sanity", "passed": not self.should_fail, "message": "OK"}]
            },
            "errors": ["Simulated error"] if self.should_fail else [],
            "warnings": [],
            "duration_seconds": duration,
            "usage": {"input_tokens": 100, "output_tokens": 50, "total_tokens": 150}
        }

        # Save report
        reports_dir = os.path.join(self.allowed_root, ".ai-team", "reports")
        os.makedirs(reports_dir, exist_ok=True)
        with open(os.path.join(reports_dir, f"{task_id}_report.json"), "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)

        return report
