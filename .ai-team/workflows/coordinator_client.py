"""
Coordinator Client Interface.
Connects the shared task queue to agent adapters and review workflows.
"""

import json
import os
import subprocess
from typing import Dict, Any, List, Optional

try:
    from adapters.antigravity_adapter import AntigravityAdapter
    from adapters.mock_adapter import MockAdapter
    from workflows.task_graph import TaskGraph
    from workflows.review_workflow import CrossAgentReviewer
except ImportError:
    from ..adapters.antigravity_adapter import AntigravityAdapter
    from ..adapters.mock_adapter import MockAdapter
    from .task_graph import TaskGraph
    from .review_workflow import CrossAgentReviewer


class CoordinatorClient:
    """Dispatches tasks to the appropriate agent adapter and orchestrates reviews."""

    def __init__(self, root_dir: Optional[str] = None):
        self.root_dir = os.path.abspath(root_dir or os.getcwd())
        self.task_graph = TaskGraph(root_dir=self.root_dir)
        self.reviewer = CrossAgentReviewer(root_dir=self.root_dir)
        self.antigravity_adapter = AntigravityAdapter(allowed_root=self.root_dir)
        self.mock_adapter = MockAdapter(allowed_root=self.root_dir)

    def run_next_ready_task(self) -> Optional[Dict[str, Any]]:
        """Finds and executes the next pending task whose dependencies are satisfied."""
        self.task_graph.load_all_tasks()
        ready = self.task_graph.get_ready_tasks()
        if not ready:
            return None

        task = ready[0]
        task_id = task["task_id"]
        agent = task.get("assigned_agent", "mock")

        print(f"[Coordinator] Starting task: {task_id} -> {agent} ({task['title']})")

        # Dispatch
        if agent == "antigravity":
            report = self.antigravity_adapter.execute(task)
        elif agent == "mock":
            report = self.mock_adapter.execute(task)
        else:
            # Fallback or external agent invocation
            report = self.mock_adapter.execute(task)

        # Update task state
        success = report.get("status") == "SUCCESS"
        self.task_graph.mark_completed(task_id, success=success)

        return report

    def run_review(self, task_id: str, reviewer: str = "antigravity") -> Dict[str, Any]:
        """Runs a cross-agent review for a specified completed task."""
        self.task_graph.load_all_tasks()
        if task_id not in self.task_graph.tasks:
            raise KeyError(f"Task ID not found: {task_id}")

        task = self.task_graph.tasks[task_id]
        return self.reviewer.review_task(task, reviewer=reviewer)
