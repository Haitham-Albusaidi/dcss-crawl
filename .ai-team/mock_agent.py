"""Deterministic adapter for disposable repositories created by test_coordinator."""
import json
from pathlib import Path
import subprocess
import sys
import time


def git(*args):
    subprocess.run(["git", *args], check=True, stdout=sys.stderr)


def main():
    req = json.load(sys.stdin)
    streaming = req.get("event") == "user"
    if streaming:
        req = json.loads(req["message"]["content"])
    task = req["task"]
    if not Path("mock-repository.txt").is_file():
        sys.exit("Mock agent requires the disposable test repository")
    target = Path(task["files"][0])
    result = {"summary": "Implemented " + task["id"], "tests": ["Read generated fixture"]}
    if req["role"] == "review":
        assert str(target) in req["diff"] and req["commit"] and task["acceptance"]
        rejected = task["description"] == "reject" or (
            task["description"] == "revise" and not task["revision"])
        result.update(approved=not rejected, findings=["Revise fixture"] if rejected else [],
                      criteria={c: "inspected " + str(target) for c in task["acceptance"]})
    else:
        attempt = len(task["attempts"])
        if task["description"].startswith("parallel-") and attempt == 1:
            # Both mock subprocesses must be alive before either may proceed.
            rendezvous = Path.cwd().parent
            (rendezvous / ("ready-" + task["id"])).touch()
            deadline = time.monotonic() + 6
            while len(list(rendezvous.glob("ready-*"))) < 2:
                if time.monotonic() >= deadline:
                    sys.exit("Parallel peer did not start")
                time.sleep(.02)
        if task["description"] == "depends":
            assert Path("one.txt").is_file()
        if task["description"] == "escape":
            target = Path("undeclared.txt")
        target.write_text(task["id"], encoding="utf-8")
        if task["description"] == "timeout":
            time.sleep(20)
        if task["description"] == "parallel-fail-once" and attempt == 1:
            sys.exit("simulated agent failure")
        if task["description"] == "revise" and task["revision"]:
            assert task["findings"] == ["Revise fixture"]
        time.sleep(.25)
        if task["description"] != "sandbox-edits":
            git("add", "--", str(target))
            git("commit", "-m", result["summary"])
    if streaming:
        result = {"event": "result", "result": {"response": json.dumps(result)}}
    print(json.dumps(result))


if __name__ == "__main__":
    main()
