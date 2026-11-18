# AI Team Adapter Interface Specification

**Version:** 1.0.0  
**Scope:** Shared multi-agent orchestration between OpenAI Codex (Coordinator) and Google Antigravity (UI / UX / Review Lead).

---

## 1. Architectural Roles & Ownership

| Responsibility | Owner | Mechanism |
| :--- | :--- | :--- |
| Main Coordinator & Scheduler | **OpenAI Codex** | Reads `.ai-team/tasks/`, plans batches, handles Git branch integration |
| Git Worktree Management | **OpenAI Codex** | Allocates isolated worktrees (`ai-team-dev/`, `antigravity-dev/`) |
| Pull Request Management | **OpenAI Codex** | Combines features, runs final integration, prepares GitHub PR |
| Antigravity Execution Adapter | **Google Antigravity** | Runs `agy.exe` non-interactively with worktree isolation & telemetry |
| Agent Instructions & Rules | **Google Antigravity** | Maintained in `AGENTS.md` and `.ai-team/prompts/` |
| Handoff Protocol & Records | **Google Antigravity** | Structured JSON task specs, execution reports, and review verdicts |
| Cross-Agent QA & Review Prompts | **Google Antigravity** | Standardized review rubric checking diffs, UX, regressions, and tests |
| DCSS WebTiles Validation | **Google Antigravity** | Build integrity, syntax checks, DOM/CSS verifications, and browser QA |

---

## 2. Invocation Contract

The shared coordinator invokes the Antigravity adapter via CLI:

```bash
python .ai-team/adapters/antigravity_adapter.py --task <path_to_task.json> [--output <path_to_report.json>]
```

Alternatively, direct programmatic invocation in Python:

```python
from adapters.antigravity_adapter import AntigravityAdapter

adapter = AntigravityAdapter()
report = adapter.execute(task_payload)
```

### Exit Codes

| Code | Status | Meaning |
| :---: | :--- | :--- |
| `0` | `SUCCESS` | Task executed, acceptance criteria verified, report emitted |
| `1` | `FAILURE` | Execution or validation checks failed |
| `2` | `INVALID_INPUT` | Task JSON malformed or required fields missing |
| `3` | `TIMEOUT` | Execution exceeded `timeout_seconds` |
| `4` | `ISOLATION_ERROR`| Target worktree path invalid or security boundary violation |

---

## 3. Worktree Isolation Policy

1. **Strict Worktree Scoping**: The adapter verifies that `worktree_path` is a distinct, valid Git worktree and passes `--add-dir <worktree_path>` to `agy.exe`.
2. **No Cross-Worktree Contamination**: The adapter rejects any task targeting another agent's assigned worktree (e.g. Antigravity cannot be pointed at Codex's `ai-team-dev`).
3. **No Direct `main` Modifications**: Changes are committed only to the assigned feature branch on the worktree.

---

## 4. Input Task Specification (`TaskInput`)

Tasks are stored in `.ai-team/tasks/<task_id>.json`:

```json
{
  "task_id": "TASK-UI-001",
  "title": "Modernize Arcane Grimoire failure meters",
  "description": "Refactor spell failure rate badges to display an illuminated circular meter with failure percentage.",
  "assigned_agent": "antigravity",
  "worktree_path": "C:/Users/Tempc/Desktop/dcss/antigravity-dev",
  "target_files": [
    "crawl-ref/source/webserver/game_data/static/menu.js",
    "crawl-ref/source/webserver/game_data/static/style.css"
  ],
  "acceptance_criteria": [
    "Failure meter renders with gold circular ring",
    "Failure percentages are styled with warning colors (>30% red, <=10% green)",
    "Keyboard hotkeys a-z remain fully functional"
  ],
  "context_files": ["HANDOFF.md", "AGENTS.md"],
  "timeout_seconds": 600,
  "mode": "accept-edits"
}
```

---

## 5. Output Execution Report (`TaskReport`)

Outputs are returned to stdout as JSON and saved to `.ai-team/reports/<task_id>_report.json`:

```json
{
  "task_id": "TASK-UI-001",
  "agent": "antigravity",
  "status": "SUCCESS",
  "summary": "Refactored failure meters with illuminated SVG rings and color thresholds.",
  "changed_files": [
    {
      "path": "crawl-ref/source/webserver/game_data/static/menu.js",
      "status": "modified",
      "additions": 42,
      "deletions": 12
    }
  ],
  "git_commit": "a1b2c3d4e5",
  "test_results": {
    "passed": 8,
    "failed": 0,
    "errors": 0,
    "details": ["test_spell_menu_keybinds: OK", "test_failure_meter_render: OK"]
  },
  "validation": {
    "passed": true,
    "checks": [
      { "name": "syntax_check", "passed": true, "message": "All JS files passed syntax validation" },
      { "name": "server_health", "passed": true, "message": "WebTiles responding 200 OK" }
    ]
  },
  "errors": [],
  "warnings": [],
  "duration_seconds": 24.5,
  "usage": {
    "input_tokens": 14200,
    "output_tokens": 1250,
    "total_tokens": 15450
  }
}
```

---

## 6. Antigravity CLI Capabilities & Compatibility Notes

1. **Headless Execution Command**:
   - `agy.exe -p "<prompt>" --output-format json --add-dir "<worktree_path>" --mode accept-edits`
2. **Unsupported Flags in `agy` v1.x**:
   - `--input-format stream-json` / `--output-format stream-json`: Not supported by current CLI binary. Standard invocation uses `--output-format json` with prompt passed via `-p` (or file).
   - The Antigravity Adapter (`.ai-team/adapters/antigravity_adapter.py`) encapsulates this compatibility translation automatically.
3. **Telemetry & Output Parsing**:
   - CLI outputs JSON structure containing total duration, model name, and token metrics (`input_tokens`, `output_tokens`). The adapter parses this output into the standardized `TaskReport`.
