"""Single-writer coordinator for a local Git repository. See README.md."""
import argparse
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from copy import deepcopy
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
import time

from runtime import (Failure, command, create_tree, git, head, lock, overlap,
                     paths_changed, probe, read, require_clean, save, within)

ROLES = ("codex", "antigravity")
TEAM = Path(__file__).resolve().parent


def record(data):
    if "task_id" in data:
        if data.get("status", "PENDING") != "PENDING":
            raise Failure("Submit pending shared tasks only")
        if not isinstance(data.get("title"), str) or not data["title"].strip():
            raise Failure("Shared task requires a title")
        if not isinstance(data.get("worktree_path"), str):
            raise Failure("Shared task requires a worktree_path field")
        data = {**data, "id": data["task_id"].lower(), "agent": data["assigned_agent"],
                "files": data["target_files"], "acceptance": data["acceptance_criteria"],
                "dependencies": [key.lower() for key in data.get("dependencies", [])]}
    task_id = data["id"]
    if not isinstance(task_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", task_id):
        raise Failure("Use a short lowercase task ID")
    for name in ("acceptance", "files"):
        if not isinstance(data.get(name), list) or not data[name] or not all(
                isinstance(x, str) and x.strip() for x in data[name]):
            raise Failure(f"{task_id}: missing {name}")
    for path in data["files"]:
        if (PurePosixPath(path).as_posix() != path or path.startswith("/")
                or path == "." or re.search(r'[\\:*?"<>|\x00-\x1f]', path)
                or any(x.casefold() in ("..", ".git", ".ai-team") for x in path.split("/"))):
            raise Failure(f"Invalid ownership path: {path}")
    agent = data.get("agent", "auto")
    deps = data.get("dependencies", [])
    if (agent not in (*ROLES, "auto") or not isinstance(deps, list)
            or not all(isinstance(x, str) for x in deps) or not data["description"].strip()):
        raise Failure("Invalid assignment, dependencies or description")
    return dict(id=task_id, title=data.get("title", task_id), description=data["description"], acceptance=data["acceptance"],
                files=data["files"], dependencies=deps, agent=agent, status="pending",
                branch=None, worktree=None, summary="", tests=[], errors=[], attempts=[],
                revision=0, parent=None, commit=None, modified=[])


def validate_graph(tasks):
    done = set()
    def visit(key, chain):
        if key not in tasks or key in chain:
            raise Failure(f"Unknown dependency or cycle: {key}")
        if key not in done:
            for dep in tasks[key]["dependencies"]:
                visit(dep, chain | {key})
            done.add(key)
    for key in tasks:
        visit(key, set())


class Coordinator:
    def __init__(self, root, config=None):
        self.root = Path(git(root, "rev-parse", "--show-toplevel")).resolve()
        self.team = self.root / ".ai-team"
        self.cfg = config if config is not None else read(self.team / "config.json")
        common = Path(git(self.root, "rev-parse", "--path-format=absolute", "--git-common-dir"))
        self.home = common / "ai-team"
        self.statefile = self.team / "tasks.json"
        self.adapters = {}

    def load(self):
        owner = self.home / "controller.json"
        if owner.exists() and read(owner) != str(self.root):
            raise Failure("Use controller worktree " + read(owner))
        queue = read(self.statefile)
        if isinstance(queue, dict):
            self.state = queue
            if self.state["controller"] != str(self.root):
                raise Failure("Use controller worktree " + self.state["controller"])
        else:
            if owner.exists():
                raise Failure("Initialized queue was replaced. Restore its saved tasks.json.")
            tasks = {}
            for item in queue:
                t = record(item)
                if t["id"] in tasks:
                    raise Failure("Duplicate seed ID")
                tasks[t["id"]] = t
            validate_graph(tasks)
            self.state = dict(controller=str(self.root), tip=head(self.root),
                              tasks=tasks, integration=None, history=[])
            self.persist()
        if not owner.exists():
            save(owner, str(self.root))
        self.tasks = self.state["tasks"]

    def persist(self):
        save(self.statefile, self.state)

    def submit(self, data):
        t = record(data)
        if t["id"] in self.tasks:
            raise Failure("Duplicate task ID")
        validate_graph({**self.tasks, t["id"]: t})
        self.tasks[t["id"]] = t
        self.persist()

    def report(self, t):
        save(self.team / "reports" / (t["id"] + ".json"), t)
        self.persist()

    def recover(self):
        for t in self.tasks.values():
            if t["status"] in ("assigned", "running", "review"):
                t["status"] = "blocked"
                t["errors"].append("Interrupted attempt. Inspect its worktrees and retry explicitly.")
                self.report(t)

    def retry(self, key):
        t = self.tasks[key]
        if t["status"] not in ("failed", "blocked") or t.get("followup"):
            raise Failure("Retry the failed or blocked leaf task")
        t["status"] = "pending"
        self.persist()

    def checks(self, tree, files, attempt, stage, base):
        tests = attempt.setdefault("tests", [])
        rules = list(self.cfg["checks"])
        for path in files:
            if not (tree / path).is_file():
                continue
            if path.endswith(".js"):
                rules.append(dict(paths=[path], argv=["node", "--check", "./" + path]))
            elif path.endswith(".py"):
                rules.append(dict(paths=[path], argv=["{python}", "-c",
                    "import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_bytes())", path]))
        for rule in rules:
            if not any((within(f, prefix) or prefix == ".") and not any(within(f, x) for x in rule.get("exclude", []))
                       for prefix in rule["paths"] for f in files):
                continue
            log = self.team / "logs" / f"{attempt['branch'].split('/')[-1]}-{stage}-{len(tests)}.json"
            argv = [base if arg == "{base}" else arg for arg in rule["argv"]]
            result = dict(stage=stage, command=argv, log=str(log), passed=False)
            tests.append(result)
            command(argv, tree / rule.get("cwd", "."), self.cfg["test_timeout"], log=log)
            result["passed"] = True

    def invoke(self, name, stage, tree, payload, log):
        payload = dict(payload, role=stage, agent=name, worktree=str(tree),
                       instructions=("Return only a JSON object with summary and tests (array of strings). "
                       "For implementation, edit only owned paths, run checks, commit all work on your "
                       "assigned branch if Git metadata is writable. Otherwise leave your edits for the coordinator to commit. Do not merge, push or edit other worktrees. For review, "
                       "inspect the supplied diff against every acceptance criterion, make no edits, "
                       "and include approved (boolean), findings (array of strings), and criteria, a JSON object mapping every exact acceptance criterion to its review evidence."))
        wire = json.dumps(payload)
        spec = self.cfg["agents"][name]
        if spec.get("implementation_adapter") == "antigravity" and stage == "implement":
            argv = [sys.executable, str(TEAM / "adapter_bridge.py"), self.adapters[name][0],
                    str(self.cfg["agent_timeout"])]
            report = json.loads(command(argv, tree, self.cfg["agent_timeout"] + 5, wire, log))
            if report["status"] != "SUCCESS" or not report["validation"]["passed"]:
                raise Failure("Antigravity implementation failed: " + str(report["errors"]))
            return {"summary": report["summary"], "tests": report["test_results"]["details"]}
        streaming = spec.get("transport") == "agy-stream"
        if streaming:
            wire = json.dumps({"event": "user", "message": {"content": wire}}) + "\n"
        response = command(self.adapters[name], tree, self.cfg["agent_timeout"], wire, log)
        if streaming:
            events = [json.loads(line) for line in response.splitlines() if line.strip()]
            results = [event["result"] for event in events if event.get("event") == "result"]
            if len(results) != 1 or not isinstance(results[0].get("response"), str):
                raise Failure("Antigravity did not return one completed turn")
            response = results[0]["response"]
        text = response.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
            text = re.sub(r"\s*```$", "", text)
        data = json.loads(text)
        if not isinstance(data, dict):
            raise Failure("Expected one agent result object")
        if not isinstance(data.get("summary"), str) or not data["summary"].strip() or not isinstance(data.get("tests"), list):
            raise Failure("Malformed agent result")
        if not all(isinstance(x, str) for x in data["tests"]):
            raise Failure("Malformed test evidence")
        return data

    def worker(self, t, a):
        tree = Path(a["worktree"])
        logs = self.team / "logs"
        key = a["branch"].split("/")[-1]
        try:
            require_clean(tree, a["branch"], a["start"])
            result = self.invoke(t["agent"], "implement", tree, {"task": t},
                                 logs / (key + "-implement.json"))
            if git(tree, "branch", "--show-current") != a["branch"]:
                raise Failure("Implementation left its assigned branch")
            dirty = command(["git", "diff", "--no-renames", "--name-only", "-z", "HEAD"], tree)
            untracked = command(["git", "ls-files", "--others", "--exclude-standard", "-z"], tree)
            edited = sorted(set(p for p in (dirty + untracked).split("\0") if p))
            if any(not any(within(f, owner) for owner in t["files"]) for f in edited):
                raise Failure("Uncommitted changes outside declared ownership")
            if edited:
                git(tree, "--literal-pathspecs", "add", "-A", "--", *edited)
                git(tree, "commit", "-m", f"{t['id']}: {result['summary'].splitlines()[0]}")
            tip = head(tree)
            require_clean(tree, a["branch"], tip)
            if git(tree, "rev-list", "--merges", a["start"] + ".." + tip):
                raise Failure("Implementation branch contains an unexpected merge")
            git(tree, "merge-base", "--is-ancestor", a["start"], tip)
            files = paths_changed(tree, a["base"], tip)
            if tip == a["start"] or not files or any(
                    not any(within(f, p) for p in t["files"]) for f in files):
                raise Failure("Missing commit or changes outside declared ownership")
            self.checks(tree, files, a, "implementation", a["base"])
            require_clean(tree, a["branch"], tip)
            return dict(commit=tip, modified=files, summary=result["summary"],
                        agent_tests=result["tests"])
        finally:
            a["finished"] = time.time()

    def review(self, t, a):
        branch, tree = create_tree(self.root, t["commit"], "review")
        a.update(reviewer_branch=branch, reviewer_worktree=str(tree))
        self.persist()
        reviewer = next(n for n in ROLES if n != t["agent"])
        diff = command(["git", "diff", "--no-ext-diff", "--binary",
                        a["base"], t["commit"]], tree)
        result = self.invoke(reviewer, "review", tree,
                             dict(task=t, diff=diff, base=a["base"], commit=t["commit"]),
                             self.team / "logs" / (branch.split("/")[-1] + ".json"))
        require_clean(tree, branch, t["commit"])
        if type(result.get("approved")) is not bool or not isinstance(result.get("findings"), list):
            raise Failure("Invalid review verdict")
        if not all(isinstance(x, str) for x in result["findings"]):
            raise Failure("Invalid findings")
        evidence = result.get("criteria", {})
        if not isinstance(evidence, dict) or any(not isinstance(evidence.get(c), str)
                or not evidence[c].strip() for c in t["acceptance"]):
            raise Failure("Review omitted criterion evidence")
        a["review"] = dict(result, reviewer=reviewer)
        if result["approved"]:
            return True
        if not result["findings"]:
            raise Failure("Revision requested without findings")
        if t["revision"] >= self.cfg["max_revisions"]:
            raise Failure("Review revision limit reached")
        revision = t["revision"] + 1
        original = t.get("original", t["id"])
        key = f"{original}-r{revision}"
        if key in self.tasks:
            raise Failure(f"Follow-up ID already in use: {key}")
        child = record({**t, "id": key})
        child.update(parent=t["id"], original=original, revision=revision,
                     findings=result["findings"], start=t["commit"], base=a["base"])
        self.tasks[key] = child
        t.update(status="blocked", followup=key)
        t["errors"].extend(result["findings"])
        return False

    def integrate(self, t, a):
        current = self.state["integration"]
        if current:
            require_clean(Path(current["worktree"]), current["branch"], self.state["tip"])
        branch, tree = create_tree(self.root, self.state["tip"], "integration")
        candidate = dict(branch=branch, worktree=str(tree), previous=self.state["tip"])
        a["integration"] = candidate
        self.persist()
        # A failed candidate is retained with its conflict index and test logs.
        git(tree, "merge", "--no-ff", "--no-edit", t["commit"])
        files = paths_changed(tree, self.state["tip"], head(tree))
        tip = head(tree)
        self.checks(tree, files, a, "integration", self.state["tip"])
        require_clean(tree, branch, tip)
        candidate["commit"] = tip
        self.state.update(tip=tip, integration=candidate)
        self.state["history"].append(dict(candidate, task=t["id"], files=files,
                                          tests=deepcopy(a["tests"])))
        t["status"] = "completed"
        parent = t.get("parent")
        while parent:
            original = self.tasks[parent]
            original.update(status="completed", summary=t["summary"], integrated_commit=tip)
            parent = original.get("parent")
        self.persist()
        save(self.team / "reports" / "integration.json", self.state["history"])
        for task in self.tasks.values():
            if task["status"] == "completed":
                self.report(task)

    def execute(self):
        self.recover()
        for t in self.tasks.values():
            if t.pop("waiting_for_dependencies", False):
                t["status"] = "pending"
        self.persist()
        versions = {}
        for name in ROLES:
            versions[name], self.adapters[name] = probe(self.cfg["agents"][name], self.root)
        self.state["agent_versions"] = versions
        self.persist()
        active = {}
        with ThreadPoolExecutor(max_workers=self.cfg["parallelism"]) as pool:
            while True:
                stopping = (self.home / "stop").exists()
                for t in list(self.tasks.values()):
                    if stopping or t["status"] != "pending" or len(active) >= self.cfg["parallelism"]:
                        continue
                    deps = [self.tasks[d] for d in t["dependencies"]]
                    if any(d["status"] != "completed" for d in deps):
                        continue
                    if any(overlap(t["files"], self.tasks[k]["files"]) for k, _ in active.values()):
                        continue
                    if t["agent"] == "auto":
                        ui_paths = self.cfg.get("antigravity_paths", [])
                        candidates = ("antigravity",) if overlap(t["files"], ui_paths) else ROLES
                        t["agent"] = min(candidates, key=lambda n: sum(
                            other["agent"] == n for other in self.tasks.values()))
                    start = t.get("start", self.state["tip"])
                    branch, tree = create_tree(self.root, start, "task")
                    a = dict(branch=branch, worktree=str(tree), start=start,
                             base=t.get("base", start), started=time.time(), tests=[])
                    t["attempts"].append(a)
                    t.update(branch=branch, worktree=str(tree), status="assigned")
                    self.persist()
                    t["status"] = "running"
                    self.persist()
                    worker_attempt = deepcopy(a)
                    active[pool.submit(self.worker, deepcopy(t), worker_attempt)] = (t["id"], worker_attempt)
                if not active:
                    break
                for future in wait(active, return_when=FIRST_COMPLETED).done:
                    task_id, worker_attempt = active.pop(future)
                    t = self.tasks[task_id]
                    a = t["attempts"][-1]
                    a.update(worker_attempt)
                    try:
                        t.update(future.result(), status="review")
                        self.persist()
                        if self.review(t, a):
                            self.integrate(t, a)
                    except (OSError, KeyError, TypeError, AttributeError, ValueError, Failure) as exc:
                        a["error"] = str(exc)
                        t["errors"].append(str(exc))
                        if t["status"] == "running" and len(t["attempts"]) <= self.cfg["max_retries"]:
                            t["status"] = "pending"
                        else:
                            t["status"] = "blocked" if "integration" in a else "failed"
                    t["tests"] = a["tests"]
                    self.report(t)
        if stopping:
            print("Stopped after draining active work. Resume with run.")
            return False
        for t in self.tasks.values():
            if t["status"] == "pending":
                t["waiting_for_dependencies"] = True
                t["status"] = "blocked"
                t["errors"].append("Unfinished dependencies: " + ", ".join(t["dependencies"]))
                self.report(t)
        return all(t["status"] == "completed" for t in self.tasks.values())

    def handoff(self):
        current = self.state["integration"]
        if not current or any(t["status"] != "completed" for t in self.tasks.values()):
            raise Failure("Complete the queue before handing off")
        require_clean(Path(current["worktree"]), current["branch"], self.state["tip"])
        return {"branch": current["branch"], "worktree": current["worktree"],
                "base": self.state["history"][0]["previous"], "commit": self.state["tip"],
                "integration_history": self.state["history"], "publisher": "antigravity"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["doctor", "submit", "status", "run", "stop", "retry", "handoff"])
    parser.add_argument("argument", nargs="?")
    args = parser.parse_args()
    c = Coordinator(TEAM.parent)
    if args.action == "stop":
        save(c.home / "stop", True)
        return 0
    if args.action == "doctor":
        bad = False
        for name in ROLES:
            try:
                print(name, probe(c.cfg["agents"][name], c.root)[0])
            except (Failure, OSError) as exc:
                print(name, exc)
                bad = True
        return int(bad)
    if args.action == "status" and c.statefile.exists():
        print(json.dumps(read(c.statefile), indent=2))
        return 0
    with lock(c.home / "coordinator.lock"):
        c.load()
        if args.action == "submit":
            c.submit(read(args.argument))
        elif args.action == "retry":
            c.retry(args.argument)
        elif args.action == "run":
            (c.home / "stop").unlink(missing_ok=True)
            print("Controller status:", git(c.root, "status", "--short") or "clean", flush=True)
            success = c.execute()
            return int(not success)
        elif args.action == "handoff":
            print(json.dumps(c.handoff(), indent=2))
        else:
            print(json.dumps(c.state, indent=2))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (Failure, OSError, KeyError, TypeError, ValueError) as error:
        sys.exit(str(error))
