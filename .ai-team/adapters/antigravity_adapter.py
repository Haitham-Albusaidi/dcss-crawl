"""
Google Antigravity Execution Adapter.
Executes non-interactive Antigravity agent tasks scoped strictly within assigned Git worktrees.
"""

import json
import os
import shutil
import subprocess
import sys
import time
from typing import Dict, Any, List, Optional

try:
    from adapters.base_adapter import BaseAdapter
except ImportError:
    from .base_adapter import BaseAdapter


class AntigravityAdapter(BaseAdapter):
    """Execution adapter for Google Antigravity via agy CLI."""

    def __init__(self, allowed_root: Optional[str] = None, agy_bin: Optional[str] = None):
        super().__init__(agent_name="antigravity", allowed_root=allowed_root)
        self.agy_bin = agy_bin or self._find_agy_binary()

    def _find_agy_binary(self) -> Optional[str]:
        """Locates the agy CLI binary on the host."""
        # 1. Check PATH
        path_bin = shutil.which("agy") or shutil.which("agy.exe")
        if path_bin:
            return path_bin

        # 2. Check standard Windows AppData location
        local_appdata = os.environ.get("LOCALAPPDATA", "")
        if local_appdata:
            candidate = os.path.join(local_appdata, "agy", "bin", "agy.exe")
            if os.path.exists(candidate):
                return candidate

        user_home = os.path.expanduser("~")
        candidate2 = os.path.join(user_home, "AppData", "Local", "agy", "bin", "agy.exe")
        if os.path.exists(candidate2):
            return candidate2

        return None

    def _build_prompt(self, task: Dict[str, Any], context_text: str) -> str:
        """Assembles a structured instruction prompt for Antigravity."""
        prompt_lines = [
            f"# Assigned Task: {task['title']} (ID: {task['task_id']})",
            "",
            "## Task Description",
            task["description"],
            "",
            "## Assigned Worktree",
            f"You MUST work only within this assigned directory: {task['worktree_path']}",
            "Do NOT modify files in other branches or worktrees.",
            ""
        ]

        if task.get("target_files"):
            prompt_lines.append("## Target Files to Modify/Inspect")
            for tf in task["target_files"]:
                prompt_lines.append(f"- {tf}")
            prompt_lines.append("")

        if task.get("acceptance_criteria"):
            prompt_lines.append("## Acceptance Criteria (All Must Pass)")
            for ac in task["acceptance_criteria"]:
                prompt_lines.append(f"- [ ] {ac}")
            prompt_lines.append("")

        prompt_lines.append("## Project Context & Rules")
        prompt_lines.append(context_text)
        prompt_lines.append("")
        prompt_lines.append("## Execution Instruction")
        prompt_lines.append("Execute the required code changes, verify your work, and summarize all modified files and decisions.")

        return "\n".join(prompt_lines)

    def execute(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Executes the task via agy CLI and returns a machine-readable TaskReport."""
        start_time = time.time()
        self.validate_task_input(task)

        task_id = task["task_id"]
        worktree_path = os.path.abspath(task["worktree_path"])
        timeout = task.get("timeout_seconds", 600)
        mode = task.get("mode", "accept-edits")
        model = task.get("model", None)

        # Ensure we do not modify Codex's worktree
        if "ai-team-dev" in worktree_path.lower():
            raise PermissionError("Security violation: Antigravity cannot be assigned Codex's worktree (ai-team-dev).")

        context_files = task.get("context_files", ["HANDOFF.md", "AGENTS.md"])
        context_text = self.read_context_files(worktree_path, context_files)
        prompt = self._build_prompt(task, context_text)

        report = {
            "task_id": task_id,
            "agent": "antigravity",
            "status": "FAILURE",
            "summary": "",
            "changed_files": [],
            "git_commit": None,
            "test_results": {"passed": 0, "failed": 0, "errors": 0, "details": []},
            "validation": {"passed": True, "checks": []},
            "errors": [],
            "warnings": [],
            "duration_seconds": 0.0,
            "usage": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
        }

        # Check binary availability
        if not self.agy_bin:
            report["status"] = "FAILURE"
            report["errors"].append("agy CLI binary not found on host. Ensure Antigravity is installed.")
            report["duration_seconds"] = round(time.time() - start_time, 2)
            self._save_report(report)
            return report

        cmd = [
            self.agy_bin,
            "--print", prompt,
            "--output-format", "json",
            "--add-dir", worktree_path,
            "--mode", mode
        ]
        if timeout:
            cmd.extend(["--print-timeout", f"{timeout}s"])
        if model:
            cmd.extend(["--model", model])

        try:
            proc = subprocess.run(
                cmd,
                cwd=worktree_path,
                capture_output=True,
                text=True,
                timeout=timeout + 30
            )

            report["duration_seconds"] = round(time.time() - start_time, 2)

            if proc.returncode == 0:
                try:
                    out_json = json.loads(proc.stdout)
                    report["status"] = "SUCCESS" if out_json.get("status") == "SUCCESS" else "FAILURE"
                    report["summary"] = out_json.get("response", "Execution completed.")[:1000]
                    usage = out_json.get("usage", {})
                    report["usage"] = {
                        "input_tokens": usage.get("input_tokens", 0),
                        "output_tokens": usage.get("output_tokens", 0),
                        "total_tokens": usage.get("total_tokens", 0)
                    }
                except json.JSONDecodeError:
                    report["status"] = "SUCCESS"
                    report["summary"] = proc.stdout.strip()[:1000]
            else:
                report["status"] = "FAILURE"
                report["errors"].append(proc.stderr.strip() or f"agy exited with code {proc.returncode}")

        except subprocess.TimeoutExpired:
            report["status"] = "TIMEOUT"
            report["errors"].append(f"Task exceeded execution timeout of {timeout} seconds.")
            report["duration_seconds"] = round(time.time() - start_time, 2)
        except Exception as e:
            report["status"] = "FAILURE"
            report["errors"].append(str(e))
            report["duration_seconds"] = round(time.time() - start_time, 2)

        # Collect changed files and git commit from the worktree
        report["changed_files"] = self.inspect_changed_files(worktree_path)
        report["git_commit"] = self.get_latest_commit(worktree_path)

        # Run built-in syntax/validation checks if files were changed
        report["validation"] = self._run_inline_validation(worktree_path, report["changed_files"])
        if not report["validation"]["passed"]:
            report["status"] = "FAILURE"

        self._save_report(report)
        return report

    def _run_inline_validation(self, worktree_path: str, changed_files: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Runs fast syntax and asset integrity checks on changed files."""
        checks = []
        all_passed = True

        for cf in changed_files:
            rel_path = cf["path"]
            abs_path = os.path.join(worktree_path, rel_path)
            if not os.path.exists(abs_path):
                continue

            # JavaScript syntax balance check
            if rel_path.endswith(".js"):
                is_valid, msg = self._validate_js_brackets(abs_path)
                checks.append({"name": f"js_syntax:{rel_path}", "passed": is_valid, "message": msg})
                if not is_valid:
                    all_passed = False

            # CSS basic syntax check
            elif rel_path.endswith(".css"):
                is_valid, msg = self._validate_css_brackets(abs_path)
                checks.append({"name": f"css_syntax:{rel_path}", "passed": is_valid, "message": msg})
                if not is_valid:
                    all_passed = False

        if not checks:
            checks.append({"name": "integrity_check", "passed": True, "message": "No syntax-checked files modified"})

        return {"passed": all_passed, "checks": checks}

    def _validate_js_brackets(self, filepath: str) -> (bool, str):
        """Checks for balanced braces/brackets in JavaScript files."""
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            stack = []
            pairs = {')': '(', ']': '[', '}': '{'}
            in_str = False
            str_char = ''
            i = 0
            while i < len(content):
                ch = content[i]
                if in_str:
                    if ch == '\\':
                        i += 1
                    elif ch == str_char:
                        in_str = False
                else:
                    if ch in ('"', "'", '`'):
                        in_str = True
                        str_char = ch
                    elif ch == '/' and i + 1 < len(content) and content[i + 1] == '/':
                        # Skip line comment
                        end = content.find('\n', i)
                        i = len(content) if end == -1 else end
                    elif ch in '([{':
                        stack.append(ch)
                    elif ch in ')]}':
                        if not stack or stack.pop() != pairs[ch]:
                            return False, f"Unmatched '{ch}' in {os.path.basename(filepath)}"
                i += 1
            if stack:
                return False, f"Unclosed brackets remaining: {len(stack)}"
            return True, "Syntax brackets balanced"
        except Exception as e:
            return False, str(e)

    def _validate_css_brackets(self, filepath: str) -> (bool, str):
        """Checks for balanced braces in CSS files."""
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            open_braces = content.count("{")
            close_braces = content.count("}")
            if open_braces != close_braces:
                return False, f"Mismatched braces: {open_braces} open vs {close_braces} close"
            return True, "CSS braces balanced"
        except Exception as e:
            return False, str(e)

    def _save_report(self, report: Dict[str, Any]) -> None:
        """Saves execution report to .ai-team/reports/<task_id>_report.json."""
        reports_dir = os.path.join(self.allowed_root, ".ai-team", "reports")
        os.makedirs(reports_dir, exist_ok=True)
        filename = f"{report['task_id']}_report.json"
        path = os.path.join(reports_dir, filename)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Antigravity Adapter CLI")
    parser.add_argument("--task", required=True, help="Path to task JSON file")
    parser.add_argument("--output", help="Optional path to output report JSON file")
    args = parser.parse_args()

    with open(args.task, "r", encoding="utf-8") as f:
        task_data = json.load(f)

    adapter = AntigravityAdapter()
    result = adapter.execute(task_data)

    print(json.dumps(result, indent=2))

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)

    sys.exit(0 if result["status"] == "SUCCESS" else 1)
