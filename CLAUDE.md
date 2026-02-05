# CLAUDE.md

## Project Overview

Mnemora is a TypeScript birthday notification bot that fetches birthdays from Google Calendar or Google Sheets and sends WhatsApp notifications. It runs as an AWS Lambda function once per day on a scheduled cron.

## Commands

```bash
yarn install          # Install dependencies
yarn dev              # Start development with watch mode
yarn build            # Compile TypeScript
yarn type-check       # Type check without emitting
yarn lint             # Run ESLint
yarn lint:fix         # Auto-fix lint issues
yarn deploy           # Deploy to AWS Lambda
yarn deploy:force     # Force deploy (clears .aws-sam cache)
yarn invoke:lambda    # Invoke deployed Lambda function
```

## Architecture

```
src/
├── clients/        # External service clients (googleCalendar, googleSheets, whatsapp, s3)
├── services/       # Core business logic (birthday check orchestration)
├── lambda/         # AWS Lambda handler and types
├── scripts/        # Build, packaging, release, and cleanup scripts
├── utils/          # Shared utilities (date, birthday, name helpers, logger, runtime)
├── types/          # Third-party type declarations
├── tests/          # Test files
├── config.ts       # Centralized app configuration
└── types.ts        # Shared type definitions (BirthdayRecord, Logger, QRAuthenticationRequiredError)
infrastructure/     # AWS SAM templates, CloudWatch alarms, samconfig
scripts/            # Shell scripts (deploy, cron install/uninstall)
```

## Environment Setup

Copy `.env.example` to `.env` and configure:
- Google Calendar/Sheets API credentials
- WhatsApp group name
- Timezone (defaults to America/Los_Angeles)

## Key Files

- `src/index.ts` - Main entry point (local development)
- `src/lambda/handler.ts` - AWS Lambda handler
- `src/config.ts` - Centralized configuration (env vars, private key decoding)
- `infrastructure/template.yaml` - SAM deployment template

## Gotchas

- Requires Node >= 24.0.0 and Yarn >= 4.11.0
- No automated tests - CI runs type-check, lint, and build only
- Lambda deployment uses AWS SAM (`infrastructure/template.yaml`)
- WhatsApp auth state stored in `auth_info/` (gitignored)
- `@whiskeysockets/baileys` MUST be locked to exactly `6.7.21` (no ^ or ~) — newer versions add ~25MB of unused dependencies

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity
- After completing or abandoning planned work, delete the plan file — don't leave stale plans behind

### 2. Subagent Strategy
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: note the pattern to avoid repeating it
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes - don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests -> then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Git Workflow

Before starting any feature work, use the `using-git-worktrees` skill to create an isolated worktree. This ensures multiple Claude Code sessions can work in parallel without conflicts.
- Never commit directly to main
- Clean up worktrees after merging: `git worktree remove <path>`

## Core Principles

- **Clean Up After Refactors**: After major structural changes, run a cleanup pass for indentation, dead code, redundant checks, and orphaned files. Don't let formatting debt ship.
- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
- **Local/Lambda Parity**: Local and Lambda environments MUST behave identically. One codebase, one flow. Test locally → deploy with confidence. Any environment-specific branching is a bug waiting to happen.
