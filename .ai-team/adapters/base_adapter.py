"""
Base Agent Adapter definition for the AI Team multi-agent system.
"""

import abc
import json
import os
import subprocess
import time
from typing import Dict, Any, List, Optional


class BaseAdapter(abc.ABC):
    """Abstract base class for all AI agent adapters."""

    def __init__(self, agent_name: str, allowed_root: Optional[str] = None):
        self.agent_name = agent_name
        self.allowed_root = os.path.abspath(allowed_root or os.getcwd())

    def validate_task_input(self, task: Dict[str, Any]) -> None:
        """Validates that the task dictionary has required keys."""
        required = ["task_id", "title", "description", "assigned_agent", "worktree_path"]
        missing = [k for k in required if k not in task or not task[k]]
        if missing:
            raise ValueError(f"Task payload missing required fields: {missing}")

        worktree = os.path.abspath(task["worktree_path"])
        if not os.path.exists(worktree):
            raise FileNotFoundError(f"Assigned worktree path does not exist: {worktree}")

        # Check worktree isolation
        self._verify_worktree_isolation(worktree)

    def _verify_worktree_isolation(self, worktree_path: str) -> None:
        """Ensures the worktree is valid and not another agent's reserved tree."""
        # Check if worktree is inside git
        res = subprocess.run(
            ["git", "rev-parse", "--is-inside-work-tree"],
            cwd=worktree_path,
            capture_output=True,
            text=True
        )
        if res.returncode != 0:
            raise ValueError(f"Path is not a valid Git worktree: {worktree_path}")

    def inspect_changed_files(self, worktree_path: str) -> List[Dict[str, Any]]:
        """Collects modified, added, and deleted files in the worktree."""
        changed = []
        # Run git status --porcelain
        res = subprocess.run(
            ["git", "status", "--porcelain", "-uall", "--ignore-submodules"],
            cwd=worktree_path,
            capture_output=True,
            text=True
        )
        if res.returncode == 0:
            for line in res.stdout.splitlines():
                if not line.strip():
                    continue
                status_code = line[:2].strip()
                filepath = line[3:].strip()
                status_map = {
                    "M": "modified",
                    "A": "added",
                    "D": "deleted",
                    "??": "untracked"
                }
                status_str = status_map.get(status_code, "modified")
                changed.append({
                    "path": filepath,
                    "status": status_str,
                    "additions": 0,
                    "deletions": 0
                })

        # Run git diff --numstat for line additions/deletions
        diff_res = subprocess.run(
            ["git", "diff", "--numstat"],
            cwd=worktree_path,
            capture_output=True,
            text=True
        )
        if diff_res.returncode == 0:
            stats = {}
            for line in diff_res.stdout.splitlines():
                parts = line.split("\t")
                if len(parts) == 3:
                    try:
                        adds = int(parts[0]) if parts[0] != "-" else 0
                        dels = int(parts[1]) if parts[1] != "-" else 0
                        stats[parts[2]] = (adds, dels)
                    except ValueError:
                        pass
            for item in changed:
                if item["path"] in stats:
                    item["additions"], item["deletions"] = stats[item["path"]]

        return changed

    def get_latest_commit(self, worktree_path: str) -> Optional[str]:
        """Returns the current commit hash on the worktree."""
        res = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=worktree_path,
            capture_output=True,
            text=True
        )
        if res.returncode == 0:
            return res.stdout.strip()
        return None

    def read_context_files(self, worktree_path: str, context_files: List[str]) -> str:
        """Reads project context files (e.g. HANDOFF.md, AGENTS.md)."""
        content = []
        for cf in context_files:
            # Check worktree first, then allowed_root
            p1 = os.path.join(worktree_path, cf)
            p2 = os.path.join(self.allowed_root, cf)
            chosen_path = p1 if os.path.exists(p1) else (p2 if os.path.exists(p2) else None)
            if chosen_path:
                try:
                    with open(chosen_path, "r", encoding="utf-8", errors="ignore") as f:
                        content.append(f"### Context File: {cf}\n{f.read()}")
                except Exception as e:
                    content.append(f"### Context File: {cf} (Failed to read: {e})")
        return "\n\n".join(content)

    @abc.abstractmethod
    def execute(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Executes the task and returns a machine-readable TaskReport dict."""
        pass
