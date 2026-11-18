#!/usr/bin/env python3
"""
AI Team Developer CLI for Multi-Agent Orchestration (Codex + Antigravity).
"""

import argparse
import json
import os
import sys

# Ensure .ai-team is in sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AI_TEAM_ROOT = os.path.dirname(SCRIPT_DIR)
WORKSPACE_ROOT = os.path.dirname(AI_TEAM_ROOT)

if AI_TEAM_ROOT not in sys.path:
    sys.path.insert(0, AI_TEAM_ROOT)

from adapters.antigravity_adapter import AntigravityAdapter
from adapters.mock_adapter import MockAdapter
from workflows.task_graph import TaskGraph
from workflows.review_workflow import CrossAgentReviewer
from workflows.coordinator_client import CoordinatorClient
from validation.webtiles_validator import WebTilesValidator
from validation.build_validator import BuildValidator


def cmd_task_create(args):
    """Creates a new task specification in .ai-team/tasks/."""
    graph = TaskGraph(root_dir=WORKSPACE_ROOT)
    task_id = args.id or f"TASK-{os.urandom(3).hex().upper()}"
    worktree = args.worktree or (
        os.path.join(WORKSPACE_ROOT, "antigravity-dev") if args.agent == "antigravity" else os.path.join(WORKSPACE_ROOT, "ai-team-dev")
    )

    task = {
        "task_id": task_id,
        "title": args.title,
        "description": args.desc or args.title,
        "assigned_agent": args.agent,
        "worktree_path": worktree,
        "status": "PENDING",
        "dependencies": args.deps or [],
        "target_files": args.files or [],
        "acceptance_criteria": args.criteria or ["Implementation fulfills requirements"],
        "context_files": ["HANDOFF.md", "AGENTS.md"],
        "timeout_seconds": args.timeout or 600,
        "mode": "accept-edits"
    }

    graph._save_task(task)
    print(f"[SUCCESS] Created task {task_id} assigned to '{args.agent}'")
    print(f"Task file: .ai-team/tasks/{task_id}.json")


def cmd_task_list(args):
    """Lists all tasks and their execution statuses."""
    graph = TaskGraph(root_dir=WORKSPACE_ROOT)
    graph.load_all_tasks()

    if not graph.tasks:
        print("No tasks found in .ai-team/tasks/")
        return

    print(f"\n{'TASK ID':<22} | {'AGENT':<12} | {'STATUS':<10} | {'TITLE'}")
    print("-" * 75)
    for tid, t in sorted(graph.tasks.items()):
        print(f"{tid:<22} | {t.get('assigned_agent', 'unknown'):<12} | {t.get('status', 'PENDING'):<10} | {t.get('title', '')[:30]}")
    print()


def cmd_task_run(args):
    """Executes a specific task by ID using its assigned agent adapter."""
    graph = TaskGraph(root_dir=WORKSPACE_ROOT)
    graph.load_all_tasks()

    if args.task_id not in graph.tasks:
        print(f"[ERROR] Task {args.task_id} not found.")
        sys.exit(1)

    task = graph.tasks[args.task_id]
    agent = task.get("assigned_agent", "mock")
    print(f"[AI Team] Running task {args.task_id} with adapter '{agent}'...")

    if agent == "antigravity":
        adapter = AntigravityAdapter(allowed_root=WORKSPACE_ROOT)
    elif agent == "mock":
        adapter = MockAdapter(allowed_root=WORKSPACE_ROOT)
    else:
        # Default fallback
        adapter = AntigravityAdapter(allowed_root=WORKSPACE_ROOT)

    report = adapter.execute(task)
    success = report.get("status") == "SUCCESS"
    graph.mark_completed(args.task_id, success=success)

    print(f"\n[Execution Report - {args.task_id}]")
    print(f"Status:   {report.get('status')}")
    print(f"Duration: {report.get('duration_seconds')}s")
    print(f"Changed:  {len(report.get('changed_files', []))} files")
    for cf in report.get("changed_files", []):
        print(f"  - {cf['status'].upper()}: {cf['path']} (+{cf.get('additions', 0)} / -{cf.get('deletions', 0)})")
    if report.get("errors"):
        print(f"Errors:   {report['errors']}")


def cmd_workflow(args):
    """Decomposes a broad user request into a phased DAG of tasks."""
    graph = TaskGraph(root_dir=WORKSPACE_ROOT)
    print(f"[Workflow] Decomposing request: '{args.request}'")
    tasks = graph.decompose_request(args.request)

    print(f"[Workflow] Generated {len(tasks)} tasks:")
    for t in tasks:
        deps = f"(depends on {', '.join(t['dependencies'])})" if t.get("dependencies") else "(independent)"
        print(f"  [{t['stage']}] {t['task_id']} -> Agent: {t['assigned_agent']} {deps}")
        print(f"      Title: {t['title']}")


def cmd_start(args):
    """Starts the AI team coordinator loop to execute ready tasks."""
    coordinator = CoordinatorClient(root_dir=WORKSPACE_ROOT)
    print("[AI Team] Starting coordinator execution loop...")
    count = 0
    while True:
        report = coordinator.run_next_ready_task()
        if not report:
            break
        count += 1
        print(f"Completed task: {report.get('task_id')} -> Status: {report.get('status')}")

    if count == 0:
        print("[AI Team] No ready tasks found. Submit a task or workflow first.")
    else:
        print(f"[AI Team] Coordinator finished processing {count} task(s).")


def cmd_review(args):
    """Runs a cross-agent review for a task."""
    coordinator = CoordinatorClient(root_dir=WORKSPACE_ROOT)
    reviewer = args.reviewer or "antigravity"
    print(f"[Review] Running QA review for task {args.task_id} by {reviewer}...")
    try:
        report = coordinator.run_review(args.task_id, reviewer=reviewer)
        print(f"\n[Review Result]")
        print(f"Verdict: {report.get('verdict')} (Score: {report.get('score')}/10)")
        print(f"Summary: {report.get('summary')}")
        print(f"Recommendations:")
        for r in report.get("actionable_recommendations", []):
            print(f"  - {r}")
    except Exception as e:
        print(f"[ERROR] Review failed: {e}")


def cmd_validate(args):
    """Runs game-specific WebTiles and build integrity checks."""
    print("[Validation] Running DCSS WebTiles & Build Validation Suite...")
    target_dir = args.worktree or (
        os.path.join(WORKSPACE_ROOT, "crawl")
        if os.path.exists(os.path.join(WORKSPACE_ROOT, "crawl", "crawl-ref"))
        else (
            os.path.join(WORKSPACE_ROOT, "antigravity-dev")
            if os.path.exists(os.path.join(WORKSPACE_ROOT, "antigravity-dev", "crawl-ref"))
            else WORKSPACE_ROOT
        )
    )
    validator = WebTilesValidator(root_dir=target_dir)
    results = validator.validate_all(check_server=not args.offline)

    print(f"\nValidation Summary: {'PASSED' if results['passed'] else 'FAILED'}")
    print(f"Target Directory: {target_dir}")
    print(f"Checks: {results['passed_checks']}/{results['total_checks']} passed")
    for c in results["details"]:
        icon = "✅" if c["passed"] else "❌"
        print(f"  {icon} {c['name']}: {c['message']}")

    # Build validator on critical files
    bvalidator = BuildValidator(root_dir=target_dir)
    print("\nFile Syntax Integrity Checks:")
    for cf in WebTilesValidator.CRITICAL_ASSETS[:3]:
        p = os.path.join(target_dir, cf)
        if os.path.exists(p):
            passed, msg = bvalidator.validate_file(p)
            icon = "✅" if passed else "❌"
            print(f"  {icon} {os.path.basename(p)}: {msg}")


def cmd_status(args):
    """Displays comprehensive AI team and Git worktree status."""
    print("=" * 60)
    print(" AI TEAM COLLABORATIVE WORKFLOW STATUS")
    print("=" * 60)

    # Worktrees
    print("\n[Git Worktrees]")
    res = os.popen(f"cd \"{WORKSPACE_ROOT}\\crawl\" && git worktree list").read()
    for line in res.splitlines():
        print(f"  {line}")

    # Tasks
    graph = TaskGraph(root_dir=WORKSPACE_ROOT)
    graph.load_all_tasks()
    print(f"\n[Task Queue]: {len(graph.tasks)} total tasks registered.")
    pending = sum(1 for t in graph.tasks.values() if t.get("status") == "PENDING")
    completed = sum(1 for t in graph.tasks.values() if t.get("status") == "COMPLETED")
    failed = sum(1 for t in graph.tasks.values() if t.get("status") == "FAILED")
    print(f"  Pending: {pending} | Completed: {completed} | Failed: {failed}")

    # WebTiles Server
    validator = WebTilesValidator(root_dir=WORKSPACE_ROOT)
    srv = validator.check_webtiles_server_health()
    icon = "🟢" if srv["passed"] else "🔴"
    print(f"\n[DCSS WebTiles Server]: {icon} {srv['message']}")
    print("=" * 60)


def cmd_handoff(args):
    """Prints the latest handoff summary from HANDOFF.md."""
    handoff_path = os.path.join(WORKSPACE_ROOT, "HANDOFF.md")
    if os.path.exists(handoff_path):
        with open(handoff_path, "r", encoding="utf-8") as f:
            print(f.read())
    else:
        print("HANDOFF.md not found in project root.")


def main():
    parser = argparse.ArgumentParser(description="AI Team Multi-Agent Orchestration CLI")
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")

    # task create
    p_tc = subparsers.add_parser("task-create", help="Create a new task")
    p_tc.add_argument("--id", help="Task ID")
    p_tc.add_argument("--title", required=True, help="Task Title")
    p_tc.add_argument("--desc", help="Task Description")
    p_tc.add_argument("--agent", choices=["antigravity", "codex", "mock"], default="antigravity", help="Assigned Agent")
    p_tc.add_argument("--worktree", help="Worktree path")
    p_tc.add_argument("--files", nargs="*", help="Target files")
    p_tc.add_argument("--criteria", nargs="*", help="Acceptance criteria")
    p_tc.add_argument("--deps", nargs="*", help="Dependency task IDs")
    p_tc.add_argument("--timeout", type=int, default=600, help="Timeout in seconds")

    # task list
    subparsers.add_parser("task-list", help="List all tasks")

    # task run
    p_tr = subparsers.add_parser("task-run", help="Run a specific task")
    p_tr.add_argument("task_id", help="Task ID to execute")

    # workflow
    p_wf = subparsers.add_parser("workflow", help="Decompose a request into tasks")
    p_wf.add_argument("request", help="High-level user request string")

    # start
    subparsers.add_parser("start", help="Start coordinator execution loop")

    # review
    p_rv = subparsers.add_parser("review", help="Run cross-agent QA review")
    p_rv.add_argument("task_id", help="Task ID to review")
    p_rv.add_argument("--reviewer", choices=["antigravity", "codex"], default="antigravity", help="Reviewer agent")

    # validate
    p_vd = subparsers.add_parser("validate", help="Run WebTiles and build validation")
    p_vd.add_argument("--worktree", help="Target worktree path to validate")
    p_vd.add_argument("--offline", action="store_true", help="Skip HTTP server check")

    # status
    subparsers.add_parser("status", help="Show AI team and worktree status")

    # handoff
    subparsers.add_parser("handoff", help="Display latest HANDOFF.md")

    args = parser.parse_args()

    commands = {
        "task-create": cmd_task_create,
        "task-list": cmd_task_list,
        "task-run": cmd_task_run,
        "workflow": cmd_workflow,
        "start": cmd_start,
        "review": cmd_review,
        "validate": cmd_validate,
        "status": cmd_status,
        "handoff": cmd_handoff
    }

    if args.command in commands:
        commands[args.command](args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
