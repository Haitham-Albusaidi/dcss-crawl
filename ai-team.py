#!/usr/bin/env python3
"""
Root entrypoint for AI Team Multi-Agent System (Google Antigravity + OpenAI Codex).
Forwards execution to .ai-team/bin/ai_team_cli.py.
"""
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AI_TEAM_CLI = os.path.join(SCRIPT_DIR, ".ai-team", "bin", "ai_team_cli.py")

if not os.path.exists(AI_TEAM_CLI):
    print(f"[ERROR] Could not find CLI script at {AI_TEAM_CLI}", file=sys.stderr)
    sys.exit(1)

if __name__ == "__main__":
    # Insert .ai-team root in sys.path
    ai_team_root = os.path.join(SCRIPT_DIR, ".ai-team")
    if ai_team_root not in sys.path:
        sys.path.insert(0, ai_team_root)

    # Forward to ai_team_cli main
    from bin.ai_team_cli import main
    main()
