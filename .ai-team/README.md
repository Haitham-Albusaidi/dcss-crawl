# DCSS agent team

Run commands from the **dedicated controller checkout**. The controller starts from its committed HEAD on first submit or run. For a new team session, use a dedicated clone if another controller already owns this repository. Each implementation, review and integration candidate gets a new sibling worktree and a uniquely named `ai-team/*` branch.

## Setup

Use Python 3.10+, Git supporting `worktree` and `rev-parse --path-format`, a configured Git author, and enough disk space for full worktrees. No Python packages are required for the coordinator. Install and authenticate both provider CLIs under the account running the controller. Configure noninteractive permissions in the provider environment and scope filesystem access to the assigned worktree. Worktrees isolate Git operations and files during normal use. They share repository metadata and OS credentials. Run untrusted agents in OS sandboxes with separate credentials. The coordinator checks branch, ancestry, changed paths and cleanliness before accepting results.

```sh
python -m unittest discover -s .ai-team -p test_coordinator.py -v
python .ai-team/coordinator.py doctor
```

Doctor checks PATH, runs the installed program's version and help, and checks the configured subcommand and flags. It exits nonzero for missing or unsupported tools. Production runs repeat the preflight. The default Codex adapter invokes `codex exec` with the request on standard input. The Antigravity adapter sends one stream-json user event to `agy`, closes stdin and reads the final result event. Configuration can specify absolute executable paths or a trusted wrapper that accepts a JSON request on stdin and emits a single JSON result on stdout. Wrappers must implement version and help probes. A CLI can pass the probes and still fail account authentication, workspace permissions, or model execution. [Antigravity headless protocol](https://antigravity.google/docs/cli/headless/)

## Submit and run

Create a JSON file outside the checkout, for example `hud-task.json`. Paths are Git-relative and case-sensitive. List individual files or directory components. An exact directory owns all descendants. The coordinator reserves its own directory. Supply IDs of previously submitted dependencies. Specify `codex`, `antigravity`, or `auto`.

```json
{
  "id": "hud-spacing",
  "description": "Adjust the existing enemy card spacing on narrow screens.",
  "agent": "auto",
  "dependencies": [],
  "files": ["crawl-ref/source/webserver/game_data/static/style.css"],
  "acceptance": ["The card fits a 360px viewport without horizontal scrolling."]
}
```

```sh
python .ai-team/coordinator.py submit ../hud-task.json
python .ai-team/coordinator.py status
python .ai-team/coordinator.py run
```

The checked-in `tasks.json` is an empty seed. First use turns it into the active task ledger containing tasks, attempts, the integration head and integration history. Keep that working copy and back it up between runs. Task submissions and execution take the same repository-wide OS lock. Submit batches before running or stop the runner before adding work. Status reads an atomic snapshot while a run is active. Agent processes receive records on stdin and return results on stdout. They must never edit the ledger. Runtime paths, reports and transcripts belong to the controller checkout. Keep live queue changes out of product PRs.

Auto assignment balances the number of assigned tasks. Ready tasks with disjoint ownership can run in parallel up to `parallelism`. Intersecting path claims wait for one another. A dependency becomes ready only after its reviewed result passes integration. Branch names contain random attempt IDs. The coordinator reads committed source from Git and reports dirty controller files. It leaves the controller branch and other checkouts in place.

## Shared protocol for Codex and Antigravity

Each request includes `role`, `agent`, `worktree`, `instructions` and a task object. Implementers read the description, owned files, dependencies, acceptance criteria and any prior findings. Implement only within the assigned tree. Commit there with a descriptive message. If the provider sandbox protects Git metadata, leave the owned edits in place and return a descriptive summary. The coordinator validates the paths and records the commit on the agent's assigned branch.

```json
{"summary":"Adjusted enemy card spacing at narrow widths","tests":["Checked a 360px viewport"]}
```

The other provider reviews in its own checkout at the implementation SHA. Its request includes the actual binary-capable Git diff, base SHA and proposed commit. Inspect the diff, surrounding code and acceptance criteria. Reviewers leave the checkout clean. Return a JSON object with a verdict, evidence for every exact criterion, tests performed and actionable findings.

```json
{
  "summary": "The narrow layout fits after the spacing change.",
  "approved": true,
  "findings": [],
  "criteria": {"The card fits a 360px viewport without horizontal scrolling.": "Verified in a 360px browser viewport."},
  "tests": ["360px viewport check"]
}
```

A rejection creates a linked follow-up for the original implementer, starting at the rejected commit. The next reviewer receives the cumulative diff. The original task stays blocked until the revision passes. `max_revisions` bounds this chain. `max_retries` counts automatic implementation retries after the first attempt. Every retry gets a fresh branch and tree. Failed attempts remain inspectable.

## Checks, integration and reports

The game uses a native C++ engine with the Crawl Makefile, Python WebTiles service and AMD JavaScript client. Validation runs in both the implementation tree and a fresh integration candidate. Changed Python files are parsed, changed JavaScript files run through `node --check`, and all diffs use `git diff --check`. The configured webserver suite runs its Python unit tests and native changes run `make test` from `crawl-ref/source`. Install the appropriate DCSS build dependencies, Node.js and WebTiles Python requirements for the files being changed. Configure trusted additional argument arrays, working directories, path filters and timeouts in `config.json`. Acceptance criteria that need human or visual judgment appear in the review evidence.

Merges and checks are serialized. Each candidate starts from the last validated integration commit. A conflict or failing test leaves that candidate intact. The published integration pointer advances only after successful checks and a clean status. Worktrees are retained for inspection. Read `reports/<task-id>.json` for modified files, worktrees, commit hashes, review findings, test commands and outcomes. `reports/integration.json` lists successful promotions. Failed candidates appear in the task attempt record. `logs/` contains process output and timeout/exit details. These files can contain private project information.

## Stop, resume and recover

```sh
python .ai-team/coordinator.py stop
python .ai-team/coordinator.py status
python .ai-team/coordinator.py retry TASK-ID
python .ai-team/coordinator.py run
```

Stop requests a drain. Active tasks finish and pending tasks stay queued. Run clears the stop request and resumes. After a crash, the next run marks interrupted assignments, implementations and reviews blocked. Inspect their branch, worktree and logs, and confirm any surviving provider processes have exited before requesting a fresh attempt. Repository locks release when their owning process exits. A missing CLI or authentication failure must be fixed locally before retrying. For a failed revision, retry the leaf task. A subsequent run reevaluates tasks waiting for dependencies.

For a conflict, inspect the candidate with `git -C WORKTREE status` and `git -C WORKTREE diff --cc`. Its conflict index and all earlier attempts are retained. Retry a first-generation task to reimplement from the latest validated integration head. For a conflicting revision, give its implementer the conflict details and reconcile the affected work in an owned follow-up before attempting publication. Manual changes to a previously validated integration checkout cause promotion and publication to stop. Inspect unexpected edits before continuing.

## Pull requests

After authenticating Git and GitHub CLI and checking origin and the desired base in `config.json`, set `pull_request.enabled` to true. A successful run publishes its fully validated integration branch. To publish or resume a previous publication, use `python .ai-team/coordinator.py pr`. The coordinator checks `gh auth status`, pushes the specific feature ref, reuses an existing open PR when present and otherwise invokes `gh pr create`. Review and merge remain with the repository owner.
