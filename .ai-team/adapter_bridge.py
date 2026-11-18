"""Run the Antigravity team's implementation adapter in a supervised process."""
import json
from pathlib import Path
import sys
import tempfile

from adapters.antigravity_adapter import AntigravityAdapter


def execute(request, executable, timeout):
    tree = Path(request["worktree"]).resolve()
    if tree != Path.cwd().resolve() or request["role"] != "implement":
        raise ValueError("Adapter must run inside its assigned implementation worktree")
    task = request["task"]
    description = [
        task["description"],
        "Read HANDOFF.md and AGENTS.md when present. Work locally on the assigned branch.",
        "Do not publish, modify other worktrees, or stage changes outside the target files.",
        "Return a short summary of the changes and validation performed.",
    ]
    description.extend("Review finding: " + finding for finding in task.get("findings", []))
    payload = dict(task_id=task["id"].upper(), title=task.get("title", task["id"]),
                   description="\n".join(description), assigned_agent="antigravity",
                   worktree_path=str(tree), dependencies=task["dependencies"],
                   target_files=task["files"], acceptance_criteria=task["acceptance"],
                   mode="accept-edits", timeout_seconds=timeout, context_files=[])
    # Upstream writes a second report inside allowed_root. The controller already
    # records the complete stdout report, so keep that copy outside the checkout.
    with tempfile.TemporaryDirectory(prefix="ai-adapter-report-") as directory:
        adapter = AntigravityAdapter(allowed_root=directory, agy_bin=executable)
        return adapter.execute(payload)


if __name__ == "__main__":
    print(json.dumps(execute(json.load(sys.stdin), sys.argv[1], int(sys.argv[2]))))
