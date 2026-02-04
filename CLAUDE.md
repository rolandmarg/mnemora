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
├── clients/        # External service clients (Google, WhatsApp)
├── data-source/    # Birthday data fetching (Calendar, Sheets)
├── output-channel/ # Notification delivery (WhatsApp)
├── services/       # Core business logic
├── lambda/         # AWS Lambda handler
├── utils/          # Shared utilities
└── types/          # TypeScript type definitions
infrastructure/     # AWS SAM templates and CloudWatch alarms
```

## Environment Setup

Copy `.env.example` to `.env` and configure:
- Google Calendar/Sheets API credentials
- WhatsApp group ID
- Twilio credentials (for SMS-based QR auth)
- Timezone (defaults to America/Los_Angeles)

## Key Files

- `src/index.ts` - Main entry point (local development)
- `src/lambda/handler.ts` - AWS Lambda handler
- `infrastructure/template.yaml` - SAM deployment template

## Gotchas

- Requires Node >= 24.0.0 and Yarn >= 4.11.0
- No automated tests - CI runs type-check, lint, and build only
- Lambda deployment uses AWS SAM (`infrastructure/template.yaml`)
- WhatsApp auth state stored in `auth_info/` (gitignored)

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

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

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
