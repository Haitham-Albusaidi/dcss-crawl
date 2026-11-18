# Cross-Agent Review: Antigravity reviewing Codex Work

**Reviewer:** Google Antigravity (UI/UX & Quality Assurance Lead)  
**Target:** OpenAI Codex (Core Orchestration & Gameplay Engine)

## Review Objectives:
1. **Diff Inspection**: Analyze git diff for logic errors, memory leaks, unhandled exceptions, and unintended side effects.
2. **Gameplay Correctness**: Confirm the spell or mechanic matches DCSS design guidelines and player expectations.
3. **UI Integration**: Verify that backend data emitted by the C++ engine cleanly matches WebTiles client expectations (e.g., JSON fields, tag formats, message protocols).
4. **Regression Analysis**: Check that existing spells, monster behaviors, or command bindings are not broken.
5. **Acceptance Criteria**: Check each item in the task's acceptance criteria list.

## Review Output Format (Emit as JSON and Markdown):
```json
{
  "task_id": "...",
  "reviewer": "antigravity",
  "reviewee": "codex",
  "verdict": "APPROVE | REQUEST_CHANGES | NEEDS_DISCUSSION",
  "score": 10,
  "summary": "...",
  "gameplay_integrity": {
    "passed": true,
    "notes": "..."
  },
  "ui_compatibility": {
    "passed": true,
    "notes": "..."
  },
  "regressions_identified": [],
  "actionable_recommendations": [
    "Specific line-by-line recommendations with file paths"
  ]
}
```
