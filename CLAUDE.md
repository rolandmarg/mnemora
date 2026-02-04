# CLAUDE.md

This file provides guidance for AI assistants working with the Mnemora codebase.

## Project Overview

Mnemora is a TypeScript birthday notification bot that fetches birthdays from Google Calendar or Google Sheets and sends WhatsApp notifications. It runs as an AWS Lambda function once per day on a scheduled cron (17:00 UTC).

**Stack:** TypeScript 5.9, Node.js 24.x, ES Modules, Yarn 4.11+, AWS Lambda (nodejs24.x)

## Quick Reference Commands

```bash
yarn install              # Install dependencies
yarn build                # Compile TypeScript (tsc)
yarn start                # Run locally (tsx src/index.ts)
yarn dev                  # Dev mode with hot reload (tsx watch)
yarn type-check           # Type check only (tsc --noEmit --incremental)
yarn lint                 # Lint (eslint, zero warnings allowed)
yarn lint:fix             # Lint with auto-fix
yarn build:lambda         # Build Lambda package
yarn package:lambda       # Package for Lambda deployment
yarn deploy               # Deploy to AWS (SAM)
```

**Always run before committing:**
```bash
yarn type-check && yarn lint
```

There are no automated tests. The CI pipeline runs type-check, lint, and build.

## Project Structure

```
src/
  clients/              # External API client wrappers (Google, WhatsApp, AWS)
  services/             # Core business logic and orchestration
  data-source/          # Pluggable data source abstraction (Calendar, Sheets)
    implementations/    # Concrete data source implementations
  output-channel/       # Pluggable output channel abstraction (WhatsApp, Console)
    implementations/    # Concrete output channel implementations
  utils/                # Pure utility functions (date, name, event, birthday helpers)
  types/                # TypeScript type definitions and interfaces
  lambda/               # AWS Lambda entry point (handler.ts)
  scripts/              # CLI scripts and build tooling
  config.ts             # Configuration loader (dotenv, env vars)
  index.ts              # Local entry point
infrastructure/         # AWS SAM/CloudFormation templates
scripts/                # Shell scripts (deploy, cron)
docs/bugs-fixes/        # Incident reports and root cause analyses
```

## Architecture

### Core Data Flow

```
Entry Point (index.ts or lambda/handler.ts)
  -> BirthdayOrchestratorService.runBirthdayCheck()
    -> DataSourceFactory -> CalendarDataSource/SheetsDataSource
    -> BirthdayService (filter today's birthdays, monthly digest on 1st)
    -> OutputChannelFactory -> WhatsAppOutputChannel/ConsoleOutputChannel
```

### Key Patterns

- **Factory pattern** for data sources (`DataSourceFactory`) and output channels (`OutputChannelFactory`)
- **Base class + interface** for extensibility (`BaseDataSource`, `BaseOutputChannel`, `BaseClient`)
- **Service layer** separates business logic from infrastructure
- **Dependency injection** through constructor parameters (no global singletons except logger)
- **No traditional database** - uses Google APIs for data, AWS S3 for state/session persistence

### Persistence

- **Google Calendar/Sheets**: Birthday data (read-only via service account)
- **AWS S3**: WhatsApp session files, message logs, execution records
- **CloudWatch Logs**: Structured logs via Pino (sole observability mechanism)

## Code Conventions

### TypeScript

- **Strict mode** enabled with all strict checks (`noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)
- **ES Modules** - the project uses `"type": "module"` in package.json
- **Target**: ES2023, Module: ESNext, ModuleResolution: node
- Never use `any` - ESLint enforces `@typescript-eslint/no-explicit-any: error`
- Use `??` (nullish coalescing) instead of `||` for defaults - enforced by ESLint
- Use optional chaining (`?.`) - enforced by ESLint
- Always use braces with `if`/`else` - `curly: ['error', 'all']`
- Prefer early returns - `no-else-return: error`
- Use template literals - `prefer-template: error`
- Use object shorthand - `object-shorthand: error`
- Functions with 4+ parameters must use an object parameter pattern
- Do NOT add JSDoc type comments - TypeScript types are sufficient

### Import Rules

- **Always use `.js` extension** in import paths (required for ESM)
  ```typescript
  import { config } from '../config.js';
  ```
- **Subpath imports from node_modules also need `.js` extension** (critical for Lambda runtime):
  ```typescript
  // Correct:
  import baileysLogger from '@whiskeysockets/baileys/lib/Utils/logger.js';
  // Wrong (fails at runtime in Lambda):
  import baileysLogger from '@whiskeysockets/baileys/lib/Utils/logger';
  ```
- Main package imports (e.g., `from '@whiskeysockets/baileys'`) don't need extension
- Group imports: external packages first, then internal modules

### File Naming

- **Files**: kebab-case with suffix (`birthday.service.ts`, `date-helpers.util.ts`, `s3.client.ts`)
- **Classes**: PascalCase
- **Functions/Variables**: camelCase
- **Constants**: UPPER_SNAKE_CASE
- **Interfaces**: PascalCase (no `I` prefix)

### Error Handling

- Wrap async operations in try/catch with meaningful error messages
- Use structured logging via Pino (not `console.log`) - logs go to CloudWatch Logs

## Critical Warnings

### Baileys Version Lock

`@whiskeysockets/baileys` **MUST** be locked to exactly `6.7.21` - no `^` or `~` prefix. Newer versions (6.17.16+) add ~32MB of unnecessary audio decoder and utility dependencies, bloating the Lambda package from ~37MB to ~60MB+.

### Dependency Version Locking

**ALL dependencies must use exact versions** (no `^` or `~`). This prevents unexpected breaking changes in Lambda deployments.

### Lambda Package Size

Keep the Lambda package minimal. The build process (`build:lambda`, `package:lambda`) strips devDependencies and TypeScript sources. Monitor size with `yarn package:lambda`.

## Environment Variables

Required variables (see `.env.example` for full list):

| Variable | Purpose |
|---|---|
| `GOOGLE_CALENDAR_ID` | Google Calendar ID |
| `GOOGLE_CLIENT_EMAIL` | Service account email |
| `GOOGLE_PRIVATE_KEY` | Service account private key (PEM or base64) |
| `GOOGLE_PROJECT_ID` | Google Cloud project ID |
| `GOOGLE_SPREADSHEET_ID` | Google Sheets ID (optional) |
| `WHATSAPP_GROUP_ID` | Target WhatsApp group |
| `AWS_REGION` | AWS region (default: us-west-1) |
| `AWS_S3_BUCKET` | S3 bucket for session storage |
| `TIMEZONE` | Timezone (default: America/Los_Angeles) |

## CI/CD

GitHub Actions workflow (`.github/workflows/auto-release.yml`) runs on push:
1. Checkout + Node.js 24 setup
2. `yarn install --immutable`
3. `yarn type-check`
4. `yarn lint`
5. `yarn build`

Pre-commit hook (Husky + lint-staged) runs ESLint with `--fix` on changed `.ts` files.

## Deployment

```bash
yarn deploy  # Runs scripts/deploy.sh - builds, packages, and deploys via SAM
```

Prerequisites: AWS CLI, SAM CLI >= 1.148.0, configured AWS credentials.

Infrastructure is defined in `infrastructure/template.yaml` (SAM/CloudFormation): Lambda, S3, CloudWatch Logs, EventBridge, IAM.

Estimated cost: ~$1/month.

## Development Notes

- **No backward compatibility needed** - single-purpose app, no external consumers
- **Date handling** - always use dayjs utilities from `src/utils/date-helpers.util.ts`, never raw `Date` for business logic
- **Timezone awareness** - all dates are timezone-aware via configured `TIMEZONE` env var
- **macOS** is the primary development platform; shell scripts use zsh
- **Documentation in `docs/bugs-fixes/`** contains valuable incident reports - read before modifying related code
