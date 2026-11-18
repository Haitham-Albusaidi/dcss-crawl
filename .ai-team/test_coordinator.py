from pathlib import Path
from unittest.mock import patch
import subprocess
import sys
import tempfile
import unittest

from coordinator import Coordinator, Failure, TEAM, lock
from runtime import git, head, overlap, probe, save


class WorkflowTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name) / "controller"
        self.repo.mkdir()
        git(self.repo, "init", "-b", "main")
        git(self.repo, "config", "user.name", "Fixture")
        git(self.repo, "config", "user.email", "fixture@example.invalid")
        (self.repo / "mock-repository.txt").touch()
        save(self.repo / ".ai-team/tasks.json", [])
        git(self.repo, "add", ".")
        git(self.repo, "commit", "-m", "Seed disposable test")
        self.start = head(self.repo)
        self.cfg = {"parallelism": 2, "max_retries": 1, "max_revisions": 1,
                    "agent_timeout": 12, "test_timeout": 12, "checks": [
                        {"paths": ["."], "argv": ["git", "diff", "--check", "{base}", "HEAD"]}],
                    "agents": {name: {"executables": [sys.executable],
                                      "args": [str(TEAM / "mock_agent.py")]}
                               for name in ("codex", "antigravity")},
                    "pull_request": {"enabled": False, "base": "main"}}
        self.cfg["agents"]["antigravity"]["transport"] = "agy-stream"
        self.c = Coordinator(self.repo, self.cfg)
        self.c.load()

    def add(self, key, desc="normal", path=None, deps=None):
        self.c.submit(dict(id=key, description=desc, files=[path or key + ".txt"],
                           acceptance=["Fixture exists"], dependencies=deps or []))

    def test_parallel_dependency_retry_dirty_checkout(self):
        original = self.repo / "mock-repository.txt"
        original.write_text("user edit")
        self.add("one", "parallel-one")
        self.add("two", "parallel-fail-once")
        self.add("three", "depends", deps=["one", "two"])
        self.assertTrue(self.c.execute())
        one, two, three = self.c.tasks.values()
        self.assertLess(two["attempts"][0]["started"], one["attempts"][0]["finished"])
        self.assertNotEqual(one["agent"], two["agent"])
        self.assertEqual(len(two["attempts"]), 2)
        self.assertNotEqual(two["attempts"][0]["branch"], two["branch"])
        self.assertTrue((Path(two["attempts"][0]["worktree"]) / "two.txt").exists())
        self.assertGreaterEqual(three["attempts"][0]["started"], two["attempts"][1]["finished"])
        for task in (one, two, three):
            a = task["attempts"][-1]
            self.assertNotEqual(task["agent"], a["review"]["reviewer"])
            self.assertEqual([x["stage"] for x in a["tests"]], ["implementation", "integration"])
        integrated = Path(self.c.state["integration"]["worktree"])
        self.assertTrue(all((integrated / f).exists() for f in ("one.txt", "two.txt", "three.txt")))
        self.assertEqual(original.read_text(), "user edit")
        self.assertEqual(head(self.repo), self.start)
        self.assertRaises(Failure, self.c.publish)

    def test_revisions_and_limits(self):
        self.add("change", "revise")
        self.add("refused", "reject")
        self.assertFalse(self.c.execute())
        self.assertEqual(self.c.tasks["change"]["status"], "completed")
        self.assertEqual(self.c.tasks["change-r1"]["agent"], self.c.tasks["change"]["agent"])
        self.assertEqual(self.c.tasks["refused-r1"]["status"], "failed")
        self.assertEqual(len(self.c.tasks), 4)

    def test_merge_conflict_and_restart(self):
        self.add("first", path="same.txt")
        self.add("second", path="same.txt")
        # Replay an attempt from an older base, as can happen after review.
        self.c.tasks["second"]["start"] = self.start
        self.c.persist()
        self.assertFalse(self.c.execute())
        first, second = self.c.tasks.values()
        self.assertGreater(second["attempts"][0]["started"], first["attempts"][0]["finished"])
        self.assertEqual(second["status"], "blocked")
        candidate = Path(second["attempts"][0]["integration"]["worktree"])
        self.assertIn("same.txt", git(candidate, "diff", "--name-only", "--diff-filter=U"))
        self.assertEqual(self.c.state["tip"], first["attempts"][0]["integration"]["commit"])
        restarted = Coordinator(self.repo, self.cfg)
        restarted.load()
        self.assertEqual(restarted.tasks["second"]["status"], "blocked")
        self.assertEqual(head(self.repo), self.start)

    def test_interrupted_worker_lock_ownership_and_timeout(self):
        self.add("slow", "timeout")
        self.c.tasks["slow"]["status"] = "running"
        self.c.persist()
        self.c.load()
        self.c.recover()
        self.assertEqual(self.c.tasks["slow"]["status"], "blocked")
        self.c.retry("slow")
        self.cfg.update(agent_timeout=1, max_retries=0)
        self.add("outside", "escape")
        self.add("waiting", deps=["slow"])
        self.assertFalse(self.c.execute())
        self.assertIn("timed out", self.c.tasks["slow"]["errors"][-1])
        self.assertEqual(self.c.tasks["outside"]["status"], "failed")
        self.assertEqual(self.c.tasks["waiting"]["status"], "blocked")
        with lock(self.c.home / "coordinator.lock"):
            result = subprocess.run([sys.executable, "-c",
                "from runtime import lock;from pathlib import Path;import sys;"
                "lock(Path(sys.argv[1])).__enter__()", str(self.c.home / "coordinator.lock")],
                cwd=TEAM, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
        self.assertTrue(overlap(["src"], ["src/file"]))
        self.assertFalse(overlap(["src"], ["src2"]))
        self.assertRaises(Failure, self.add, "cycle", deps=["cycle"])
        self.assertRaises(Failure, self.add, "escape-path", path="../elsewhere")

    def test_stop_resume_and_pr_commands(self):
        self.add("feature", "sandbox-edits")
        save(self.c.home / "stop", True)
        self.assertFalse(self.c.execute())
        self.assertEqual(self.c.tasks["feature"]["attempts"], [])
        (self.c.home / "stop").unlink()
        self.assertTrue(self.c.execute())
        self.cfg["pull_request"]["enabled"] = True
        branch = self.c.state["integration"]["branch"]
        tree = Path(self.c.state["integration"]["worktree"])
        with patch("coordinator.command", side_effect=["authenticated", "[]", "mock-pr"]) as gh:
            with patch("coordinator.git") as transport:
                self.c.publish()
                transport.assert_called_once_with(tree, "push", "origin", branch)
        calls = [c.args[0][:3] for c in gh.call_args_list]
        self.assertEqual(calls, [["gh", "auth", "status"], ["gh", "pr", "list"],
                                 ["gh", "pr", "create"]])
        branch = self.c.state["integration"]["branch"]
        self.assertEqual(head(tree), self.c.state["tip"])
        self.assertEqual(head(self.repo), self.start)

    def test_integration_test_failure_retains_candidate(self):
        self.add("integration-failure")
        self.cfg["checks"][0]["argv"] = [sys.executable, "-c",
            "import subprocess,sys; b=subprocess.check_output(['git','branch','--show-current']);"
            "sys.exit(int(b.startswith(b'ai-team/integration-')))"]
        self.assertFalse(self.c.execute())
        task = self.c.tasks["integration-failure"]
        self.assertEqual(task["status"], "blocked")
        self.assertTrue(task["tests"][0]["passed"])
        self.assertFalse(task["tests"][1]["passed"])
        self.assertTrue(Path(task["attempts"][0]["integration"]["worktree"]).exists())
        self.assertEqual(self.c.state["tip"], self.start)

    def test_failure_in_validation_and_unsupported_cli(self):
        self.cfg["checks"][0]["argv"] = [sys.executable, "-c", "raise SystemExit(1)"]
        self.cfg["max_retries"] = 0
        self.add("broken")
        self.assertFalse(self.c.execute())
        self.assertFalse(self.c.tasks["broken"]["tests"][0]["passed"])
        self.assertEqual(self.c.state["tip"], self.start)
        self.assertRaises(Failure, probe, {"executables": [sys.executable],
                                         "args": ["--unsupported-cli-switch"]}, self.repo)


if __name__ == "__main__":
    unittest.main()
