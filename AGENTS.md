# AI Team Rules & Multi-Agent Collaboration Protocol

## 1. Core Operating Principles (Mandatory for All Agents)

### Before starting:
1. **Read `HANDOFF.md`**: Understand the active branch, recent commits, and latest architectural state.
2. **Inspect the existing code**: Search for existing functions and styles before adding new ones.
3. **Never redo completed work**: Respect merged and verified features.
4. **Read the assigned task and acceptance criteria**: Confirm constraints and target files before editing.

### Development:
- **Work only on the assigned Git branch/worktree**:
  - **Codex Worktree**: `ai-team-dev/` on branch `feature/ai-team-coordinator` (or assigned feature branch).
  - **Antigravity Worktree**: `antigravity-dev/` on branch `feature/ai-team-antigravity` (or assigned UI branch).
- **Do not modify another agent's worktree**: Never cross-edit files inside another agent's directory.
- **Preserve existing game functionality**: Zero regressions on core gameplay mechanics and WebTiles rendering.
- **Keep changes focused on the assigned feature**: Avoid unnecessary refactors or broad formatting sweeps.
- **Run relevant tests before finishing**: Validate build integrity, syntax, and asset loading.
- **Commit completed changes with a descriptive message**: Include context, component, and file scope.

### Handoff:
- **Summarize modified files**: State exact paths, lines added/removed, and key classes.
- **Explain implementation decisions**: Document architectural rationale, protocol compliance, and trade-offs.
- **Report test results and remaining issues**: Clearly state automated test outcomes and manual verification notes.
- **Do not directly merge into `main`**: All features must pass through review branches and pull requests.
- **Do not independently rewrite `HANDOFF.md`**: Append new work and update active branch states without deleting previous historical records.

### Security:
- **Do not delete unrelated files**: Keep repository files clean and intact.
- **Do not expose secrets**: Never commit API keys, tokens, or credentials.
- **Do not run destructive commands**: No force pushes (`--force`), hard resets without backup, or arbitrary file deletions.

---

## 2. Multi-Agent Roles & Ownership Division

```
                     ┌────────────────────────────────────────┐
                     │           User Request / Goal          │
                     └───────────────────┬────────────────────┘
                                         ▼
                     ┌────────────────────────────────────────┐
                     │             OpenAI Codex               │
                     │  (Main Coordinator, Backend & Git PR) │
                     └───────┬────────────────────────┬───────┘
                             │                        │
         Backend / Gameplay  │                        │  UI / UX / Frontend
         Tasks               │                        │  Tasks
                             ▼                        ▼
               ┌────────────────────────┐  ┌────────────────────────┐
               │      OpenAI Codex      │  │   Google Antigravity   │
               │   Engine & Mechanics   │  │   WebTiles & Visuals   │
               │ (Worktree: ai-team-dev)│  │(Worktree: antigravity) │
               └─────────────┬──────────┘  └──────────┬─────────────┘
                             │                        │
                             └───────────┬────────────┘
                                         ▼
                     ┌────────────────────────────────────────┐
                     │          Cross-Agent QA Review         │
                     │  (Antigravity reviews Codex diffs      │
                     │   Codex reviews Antigravity diffs)     │
                     └───────────────────┬────────────────────┘
                                         ▼
                     ┌────────────────────────────────────────┐
                     │     Consolidated Integration & PR      │
                     └────────────────────────────────────────┘
```

### OpenAI Codex (Orchestrator & Engine Lead)
- **Primary Ownership**:
  - Coordinator engine and task scheduling (`.ai-team/workflows/`).
  - Git branch integration and pull request creation.
  - C++ game mechanics, crawl core rules, spells backend, and server-side state.
- **Boundaries**: Must invoke the Antigravity adapter for UI/UX/WebTiles tasks and respect Antigravity's QA reviews.

### Google Antigravity (Frontend, UX & QA Lead)
- **Primary Ownership**:
  - Antigravity execution adapter (`.ai-team/adapters/antigravity_adapter.py`).
  - WebTiles client interfaces (`ui-layouts.js`, `style.css`, `menu.js`, `monster_list.js`, `player.js`).
  - Dark fantasy / Elden Ring visual design system and layouts.
  - Cross-agent review protocol and DCSS WebTiles gameplay validation.
- **Boundaries**: Must work inside `antigravity-dev` and emit structured `TaskReport` JSON records.

---

## 3. Communication & Handoff Protocol

1. **No Assumption of Real-Time Sockets**: Agents coordinate asynchronously through structured files in `.ai-team/`.
2. **Task Creation**: Coordinator deposits JSON files in `.ai-team/tasks/<task_id>.json`.
3. **Execution Report**: Executing agent writes machine-readable report to `.ai-team/reports/<task_id>_report.json`.
4. **Cross-Agent Review**: Reviewing agent writes review findings to `.ai-team/reviews/<task_id>_review.json` with a clear status (`APPROVE`, `REQUEST_CHANGES`, or `NEEDS_DISCUSSION`).
5. **Revisions**: If changes are requested, a revision task is created referencing the review notes.
