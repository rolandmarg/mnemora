# AGENTS.md

## Scope and Precedence

- This file is the canonical, model-agnostic guidance for coding agents working in this repository.
- System, developer, and runtime/tool instructions override this file when they conflict.

## Project Overview

Mnemora is a TypeScript birthday notification bot that fetches birthdays from Google Sheets and sends WhatsApp notifications. It runs as an AWS Lambda function once per day on a scheduled cron.

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
├── clients/        # External service clients (googleSheets, whatsapp, s3)
├── services/       # Core business logic (birthday check orchestration)
├── lambda/         # AWS Lambda handler and types
├── scripts/        # Build, packaging, release, and cleanup scripts
├── utils/          # Shared utilities (date, birthday, name helpers, logger, runtime)
├── types/          # Third-party type declarations
├── config.ts       # Centralized app configuration
└── types.ts        # Shared type definitions (BirthdayRecord, Logger, QRAuthenticationRequiredError)
infrastructure/     # AWS SAM template and samconfig
scripts/            # Shell scripts (deploy)
```

## Environment Setup

Copy `.env.example` to `.env` and configure:
- Google Sheets API credentials
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
- `@whiskeysockets/baileys` MUST be locked to exactly `6.7.21` (no ^ or ~) - newer versions add ~25MB of unused dependencies

## Workflow Orchestration

### 1. Planning for Non-Trivial Work
- For any non-trivial task (3+ steps or architectural decisions), write a brief plan before coding.
- If implementation goes sideways, stop and re-plan before continuing.
- Include verification in the plan, not only implementation.
- After completing or abandoning planned work, delete temporary plan files.

### 2. Parallel Exploration Strategy
- Offload research, exploration, and parallel analysis to subagents or equivalent parallel workflows when available.
- For complex problems, use additional parallel compute intentionally.
- Keep one focused objective per subagent.

### 3. Self-Improvement Loop
- After any correction from the user, capture the mistake pattern and add a rule to avoid repeating it.
- Iterate on those rules until the same class of mistake stops recurring.

### 4. Verification Before Done
- Never mark a task complete without proving it works.
- Diff behavior between `main` and your changes when relevant.
- Ask whether the result would be accepted by a staff engineer.
- Run checks, inspect logs, and demonstrate correctness.

### 5. Demand Elegance (Balanced)
- For non-trivial changes, pause and evaluate whether there is a more elegant implementation.
- If a fix feels hacky, re-implement using the best known design.
- Skip over-engineering for simple, obvious fixes.

### 6. Autonomous Bug Fixing
- When given a bug report, fix it without requiring hand-holding.
- Use logs, errors, and failing checks to identify root cause and resolve it.
- Minimize context switching required from the user.

## Git Workflow

- Before starting feature work, use git worktrees for isolated branches when running parallel sessions.
- Never commit directly to `main`.
- Clean up worktrees after merge: `git worktree remove <path>`.
- When branch work is complete, push and create a PR targeting `main` by default.

## Definition of Done

- `yarn type-check`
- `yarn lint`
- `yarn build`

## Core Principles

- **Never Leak Secrets**: Never log, print, or include secrets in output. When debugging, reference variable names only.
- **Clean Up After Refactors**: After major structural changes, run a cleanup pass for indentation, dead code, redundant checks, and orphaned files.
- **Simplicity First**: Keep changes as simple as possible and impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes.
- **Minimal Impact**: Touch only what is necessary and avoid introducing new bugs.
- **Local/Lambda Parity**: Local and Lambda environments must behave identically.
