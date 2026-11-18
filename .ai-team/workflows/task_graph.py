"""
Task Decomposition, Dependency Graph & Assignment Engine for Multi-Agent Collaboration.
"""

import json
import os
import uuid
from typing import Dict, Any, List, Optional


class TaskGraph:
    """Manages decomposition of user requests into parallel and sequential agent tasks."""

    DEFAULT_ASSIGNMENT_RULES = [
        {
            "category": "backend_gameplay",
            "keywords": ["spell mechanics", "damage formula", "monster ai", "backend", "c++", "item logic", "save game"],
            "agent": "codex",
            "worktree_suffix": "ai-team-dev"
        },
        {
            "category": "ui_ux_frontend",
            "keywords": ["interface", "modal", "hud", "menu", "webtiles", "css", "styling", "card", "layout", "visual"],
            "agent": "antigravity",
            "worktree_suffix": "antigravity-dev"
        },
        {
            "category": "cross_qa_review",
            "keywords": ["review", "qa", "verify", "audit", "test"],
            "agent": "antigravity",
            "worktree_suffix": "antigravity-dev"
        }
    ]

    def __init__(self, root_dir: Optional[str] = None, rules: Optional[List[Dict[str, Any]]] = None):
        self.root_dir = os.path.abspath(root_dir or os.getcwd())
        self.rules = rules or self.DEFAULT_ASSIGNMENT_RULES
        self.tasks: Dict[str, Dict[str, Any]] = {}

    def decompose_request(self, user_request: str, base_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Decomposes a broad user request into a phased DAG of tasks."""
        bid = base_id or f"REQ-{uuid.uuid4().hex[:6].upper()}"
        req_lower = user_request.lower()

        generated_tasks = []

        # Example request: "Improve the spell system and create a better spell selection interface"
        has_spell = "spell" in req_lower
        has_ui = any(k in req_lower for k in ["interface", "selection", "ui", "hud", "modal", "menu"])
        has_backend = any(k in req_lower for k in ["system", "mechanic", "backend", "formula", "balance", "improve"])

        if has_spell and has_ui:
            # Stage 1: Backend Spell Engine & Data Model (Codex)
            task1 = {
                "task_id": f"{bid}-01-SPELL-ENGINE",
                "title": "Enhance spell metadata, failure formulas, and school taxonomy",
                "description": f"Refactor spell mechanics based on request: '{user_request}'. Provide clear failure formulas and spell metadata in crawl core.",
                "assigned_agent": self._resolve_agent("spell mechanics backend", default="codex"),
                "worktree_path": os.path.join(self.root_dir, "ai-team-dev"),
                "status": "PENDING",
                "dependencies": [],
                "target_files": [
                    "crawl-ref/source/spl-cast.cc",
                    "crawl-ref/source/spl-util.cc"
                ],
                "acceptance_criteria": [
                    "Spell formulas calculate failure rates accurately",
                    "Spell metadata is exposed cleanly to WebTiles protocol",
                    "No memory leaks or crashes during spellcasting"
                ],
                "context_files": ["HANDOFF.md", "AGENTS.md"],
                "stage": 1
            }

            # Stage 2: WebTiles Arcane Grimoire & Selection Interface (Antigravity)
            task2 = {
                "task_id": f"{bid}-02-SPELL-UI",
                "title": "Modernize Arcane Grimoire and spell selection interface",
                "description": f"Build an illuminated spell selection modal with failure meters, school badges, and keyboard shortcuts.",
                "assigned_agent": self._resolve_agent("interface webtiles styling", default="antigravity"),
                "worktree_path": os.path.join(self.root_dir, "antigravity-dev"),
                "status": "PENDING",
                "dependencies": [task1["task_id"]],
                "target_files": [
                    "crawl-ref/source/webserver/game_data/static/menu.js",
                    "crawl-ref/source/webserver/game_data/static/style.css",
                    "crawl-ref/source/webserver/game_data/static/ui-layouts.js"
                ],
                "acceptance_criteria": [
                    "Spell grimoire opens cleanly with hotkeys a-z",
                    "Failure percentages display color-coded warning chips",
                    "Gold-framed dark fantasy modal design matching Elden Ring codex style",
                    "Escape and click-outside close popup cleanly"
                ],
                "context_files": ["HANDOFF.md", "AGENTS.md"],
                "stage": 2
            }

            # Stage 3: Cross-Agent Quality Assurance & Integration (Antigravity QA)
            task3 = {
                "task_id": f"{bid}-03-CROSS-QA",
                "title": "Cross-agent gameplay, UI and keybinding verification",
                "description": "Perform comprehensive visual QA, syntax validation, and regression testing on spell selection.",
                "assigned_agent": "antigravity",
                "worktree_path": os.path.join(self.root_dir, "antigravity-dev"),
                "status": "PENDING",
                "dependencies": [task2["task_id"]],
                "target_files": [],
                "acceptance_criteria": [
                    "WebTiles server loads without syntax errors",
                    "In-game spell selection test passes without keybinding conflict",
                    "Structured review report generated with APPROVE verdict"
                ],
                "context_files": ["HANDOFF.md", "AGENTS.md"],
                "stage": 3
            }

            generated_tasks = [task1, task2, task3]

        else:
            # Generic decomposition into 2 tasks: Implementation + Review
            primary_agent = self._resolve_agent(user_request, default="antigravity" if has_ui else "codex")
            worktree_dir = "antigravity-dev" if primary_agent == "antigravity" else "ai-team-dev"
            reviewer_agent = "codex" if primary_agent == "antigravity" else "antigravity"
            review_worktree = "ai-team-dev" if reviewer_agent == "codex" else "antigravity-dev"

            t1 = {
                "task_id": f"{bid}-01-IMPL",
                "title": f"Implement: {user_request[:60]}",
                "description": user_request,
                "assigned_agent": primary_agent,
                "worktree_path": os.path.join(self.root_dir, worktree_dir),
                "status": "PENDING",
                "dependencies": [],
                "target_files": [],
                "acceptance_criteria": ["Implementation fulfills request without regressions"],
                "context_files": ["HANDOFF.md", "AGENTS.md"],
                "stage": 1
            }

            t2 = {
                "task_id": f"{bid}-02-REVIEW",
                "title": f"Review & Verify: {user_request[:60]}",
                "description": f"Review implementation of {t1['task_id']} for logic, UI and gameplay correctness.",
                "assigned_agent": reviewer_agent,
                "worktree_path": os.path.join(self.root_dir, review_worktree),
                "status": "PENDING",
                "dependencies": [t1["task_id"]],
                "target_files": [],
                "acceptance_criteria": ["Verify diff, run tests, and check regression safety"],
                "context_files": ["HANDOFF.md", "AGENTS.md"],
                "stage": 2
            }
            generated_tasks = [t1, t2]

        for t in generated_tasks:
            self.tasks[t["task_id"]] = t
            self._save_task(t)

        return generated_tasks

    def _resolve_agent(self, text: str, default: str = "antigravity") -> str:
        """Determines best agent assignment based on keyword matching."""
        tl = text.lower()
        for rule in self.rules:
            for kw in rule["keywords"]:
                if kw in tl:
                    return rule["agent"]
        return default

    def get_ready_tasks(self) -> List[Dict[str, Any]]:
        """Returns tasks whose dependencies have been completed and are ready to run."""
        ready = []
        for tid, t in self.tasks.items():
            if t.get("status") == "PENDING":
                deps = t.get("dependencies", [])
                deps_met = all(
                    self.tasks.get(dep_id, {}).get("status") == "COMPLETED"
                    for dep_id in deps
                )
                if deps_met:
                    ready.append(t)
        return ready

    def mark_completed(self, task_id: str, success: bool = True) -> None:
        """Updates task status in memory and on disk."""
        if task_id in self.tasks:
            self.tasks[task_id]["status"] = "COMPLETED" if success else "FAILED"
            self._save_task(self.tasks[task_id])

    def add_task(self, task: Dict[str, Any]) -> None:
        """Registers a new task in the graph."""
        self.tasks[task["task_id"]] = task

    def save_all_tasks(self) -> None:
        """Saves all currently registered tasks to disk."""
        for t in self.tasks.values():
            self._save_task(t)

    def _save_task(self, task: Dict[str, Any]) -> None:
        """Saves a task record to .ai-team/tasks/<task_id>.json."""
        tasks_dir = os.path.join(self.root_dir, ".ai-team", "tasks")
        os.makedirs(tasks_dir, exist_ok=True)
        path = os.path.join(tasks_dir, f"{task['task_id']}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(task, f, indent=2)

    def load_all_tasks(self) -> None:
        """Loads all existing task records from .ai-team/tasks/."""
        tasks_dir = os.path.join(self.root_dir, ".ai-team", "tasks")
        if not os.path.exists(tasks_dir):
            return
        for fname in os.listdir(tasks_dir):
            if fname.endswith(".json"):
                try:
                    with open(os.path.join(tasks_dir, fname), "r", encoding="utf-8") as f:
                        t = json.load(f)
                        if "task_id" in t:
                            self.tasks[t["task_id"]] = t
                except Exception:
                    pass
