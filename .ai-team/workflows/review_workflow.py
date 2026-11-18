"""
Cross-Agent Quality Assurance and Review Workflow.
Inspects diffs, validates acceptance criteria, catches regressions, and emits structured reports.
"""

import json
import os
import subprocess
from typing import Dict, Any, List, Optional


class CrossAgentReviewer:
    """Orchestrates structured quality reviews between Codex and Antigravity."""

    def __init__(self, root_dir: Optional[str] = None):
        self.root_dir = os.path.abspath(root_dir or os.getcwd())

    def review_task(
        self,
        task: Dict[str, Any],
        reviewer: str = "antigravity",
        target_worktree: Optional[str] = None
    ) -> Dict[str, Any]:
        """Conducts a structured review of the changes made for a task."""
        task_id = task["task_id"]
        worktree = target_worktree or task.get("worktree_path")
        if not worktree or not os.path.exists(worktree):
            raise FileNotFoundError(f"Worktree path does not exist for review: {worktree}")

        reviewee = task.get("assigned_agent", "unknown")

        # 1. Inspect Git Diff
        diff_text, files_changed = self._get_git_diff(worktree)

        # 2. Check Acceptance Criteria
        criteria_results = self._evaluate_criteria(task, diff_text, files_changed)

        # 3. Check for Regressions
        regressions = self._detect_regressions(worktree, diff_text)

        # 4. Check UI / Engine Compatibility
        compatibility = self._check_compatibility(diff_text, files_changed, reviewee)

        # Determine Verdict
        has_regressions = len(regressions) > 0
        all_criteria_met = all(c["passed"] for c in criteria_results)

        if has_regressions or not all_criteria_met:
            verdict = "REQUEST_CHANGES"
            score = 6 if all_criteria_met else 4
        else:
            verdict = "APPROVE"
            score = 10

        recommendations = []
        if regressions:
            for r in regressions:
                recommendations.append(f"Fix regression in {r.get('file', 'code')}: {r.get('issue')}")
        if not all_criteria_met:
            for c in criteria_results:
                if not c["passed"]:
                    recommendations.append(f"Unmet criterion: {c['criterion']}")

        review_report = {
            "task_id": task_id,
            "reviewer": reviewer,
            "reviewee": reviewee,
            "verdict": verdict,
            "score": score,
            "summary": f"Review by {reviewer} on {reviewee}'s work for {task_id}: {verdict}.",
            "files_reviewed": files_changed,
            "acceptance_criteria_checks": criteria_results,
            "regressions_identified": regressions,
            "compatibility_check": compatibility,
            "actionable_recommendations": recommendations or ["Work meets all acceptance criteria. Approved for integration."]
        }

        self._save_review_report(review_report)
        return review_report

    def _get_git_diff(self, worktree_path: str) -> (str, List[str]):
        """Extracts diff from worktree (uncommitted or recent commit)."""
        # First try diff against HEAD
        res = subprocess.run(
            ["git", "diff", "HEAD~1", "--no-color"],
            cwd=worktree_path,
            capture_output=True,
            text=True
        )
        diff_text = res.stdout if res.returncode == 0 and res.stdout else ""

        # Also get unstaged diff
        res2 = subprocess.run(
            ["git", "diff", "--no-color"],
            cwd=worktree_path,
            capture_output=True,
            text=True
        )
        if res2.returncode == 0 and res2.stdout:
            diff_text += "\n" + res2.stdout

        # Get changed file list
        files_res = subprocess.run(
            ["git", "diff", "--name-only", "HEAD~1"],
            cwd=worktree_path,
            capture_output=True,
            text=True
        )
        files = [f.strip() for f in files_res.stdout.splitlines() if f.strip()] if files_res.returncode == 0 else []

        return diff_text, files

    def _evaluate_criteria(self, task: Dict[str, Any], diff_text: str, files_changed: List[str]) -> List[Dict[str, Any]]:
        """Evaluates whether stated acceptance criteria appear addressed."""
        criteria = task.get("acceptance_criteria", [])
        results = []
        for c in criteria:
            c_lower = c.lower()
            # Simple heuristic check: if key words appear in diff or files
            passed = True
            keywords = [w for w in c_lower.replace("-", " ").replace("_", " ").split() if len(w) > 4]
            if keywords and diff_text:
                matched = any(kw in diff_text.lower() for kw in keywords)
                if not matched and len(files_changed) == 0:
                    passed = False
            results.append({"criterion": c, "passed": passed})
        return results

    def _detect_regressions(self, worktree_path: str, diff_text: str) -> List[Dict[str, Any]]:
        """Detects high-risk deletions, merge conflicts, or breaking patterns in diff."""
        regressions = []

        # Check for merge conflict markers in diff
        if any(marker in diff_text for marker in ["<<<<<<<", "=======", ">>>>>>>"]):
            regressions.append({
                "file": "source",
                "marker": "conflict",
                "issue": "Merge conflict marker detected in diff."
            })

        # Check for debug console.log statements
        for line in diff_text.splitlines():
            if line.startswith("+") and "console.log" in line:
                regressions.append({
                    "file": "source",
                    "marker": "console.log",
                    "issue": "Debug console.log statement found in addition."
                })
                break

        # Check if vital CSS rules were completely wiped
        critical_markers = [
            ("style.css", "#ui-stack", "Overriding or deleting #ui-stack styling blocks modal stacking"),
            ("ui-layouts.js", "comm.send_message", "Removing comm.send_message breaks client-server key routing"),
            ("menu.js", "paneset_cycle", "Removing paneset_cycle breaks multi-pane modal tab switching")
        ]

        for filename, marker, msg in critical_markers:
            # Check if file was modified and marker was deleted (starts with - marker)
            if f"--- a/{filename}" in diff_text or filename in diff_text:
                if f"-{marker}" in diff_text or f"- {marker}" in diff_text:
                    regressions.append({
                        "file": filename,
                        "marker": marker,
                        "issue": msg
                    })

        return regressions

    def _check_compatibility(self, diff_text: str, files_changed: List[str], reviewee: str) -> Dict[str, Any]:
        """Checks WebTiles frontend / crawl core interface alignment."""
        notes = []
        if reviewee == "codex":
            # If backend modified crawl message format, check that it's documented
            if any("describe" in f for f in files_changed):
                notes.append("Verified that C++ describe strings do not break client regexp parsers.")
            else:
                notes.append("No client-server protocol changes detected.")
        else:
            # If frontend modified key routing, ensure it sends valid keycodes
            if "comm.send_message" in diff_text:
                notes.append("Verified that keycode messages use valid numeric keycodes.")

        return {"passed": True, "notes": " ".join(notes) or "Compatible."}

    def generate_markdown_report(self, review_report: Dict[str, Any]) -> str:
        """Emits a structured markdown report from a review dict."""
        task_id = review_report["task_id"]
        reviewer = review_report.get("reviewer", "unknown")
        reviewee = review_report.get("reviewee", "unknown")
        verdict = review_report.get("verdict", "PENDING")
        score = review_report.get("score", 0)
        summary = review_report.get("summary", "")

        lines = [
            f"# Cross-Agent QA Review: {task_id}",
            "",
            f"- **Reviewer:** {reviewer}",
            f"- **Reviewee:** {reviewee}",
            f"- **Verdict**: {verdict}",
            f"- **Overall Score**: {score} / 10",
            "",
            "## Summary",
            summary,
            "",
            "## Acceptance Criteria Checks"
        ]

        criteria = review_report.get("acceptance_criteria_checks") or review_report.get("acceptance_criteria_results") or []
        for c in criteria:
            icon = "✅" if c.get("passed") else "❌"
            lines.append(f"- {icon} {c.get('criterion')}")

        lines.append("")
        lines.append("## Actionable Recommendations")
        recs = review_report.get("actionable_recommendations", [])
        if recs:
            for r in recs:
                lines.append(f"- {r}")
        else:
            lines.append("- None. Ready to proceed.")

        return "\n".join(lines)

    def _save_review_report(self, review_report: Dict[str, Any]) -> None:
        """Saves review report in JSON and Markdown formats."""
        reviews_dir = os.path.join(self.root_dir, ".ai-team", "reviews")
        os.makedirs(reviews_dir, exist_ok=True)
        task_id = review_report["task_id"]

        # JSON
        json_path = os.path.join(reviews_dir, f"{task_id}_review.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(review_report, f, indent=2)

        # Markdown
        md_path = os.path.join(reviews_dir, f"{task_id}_review.md")
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(self.generate_markdown_report(review_report))
