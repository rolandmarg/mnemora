# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial changelog














---
## [1.1.0] - 2026-02-05

## What's Changed

### ✨ Features

- Add deploying-to-aws skill for one-shot Lambda deploys (#13) (de0c4a5)
- Resolve WhatsApp group names to JIDs at send time (be178e7)
- Always send health check message on every Lambda run (030bbae)
- Expose sendToGroup and getAuthAgeDays on WhatsApp client (d8fa2c7)
- Add WHATSAPP_HEALTH_CHECK_GROUP_ID configuration (27445b5)

### ♻️  Refactoring

- Address code review feedback (44d740e)
- Rename WhatsApp group ID params to group name in infrastructure (b9027da)
- Rename WhatsApp group ID config fields to group names (c5d948d)

### 📝 Documentation

- Default to push+PR when finishing a branch (7be0dd3)
- Add plan file cleanup rule to workflow orchestration (d97d76d)

### 🔧 Chores

- Add .worktrees/ to gitignore (cd68383)

### 📦 Other Changes

- Merge pull request #12 from rolandmarg/claude-md-default-pr-workflow (1dbf94f)
- Merge pull request #11 from rolandmarg/whatsapp-group-names (42a5d79)
- Merge pull request #10 from rolandmarg/claude-md-stale-plans-cleanup (ca2d69b)
- Merge pull request #9 from rolandmarg/whatsapp-health-check (5e98127)
- Merge pull request #8 from rolandmarg/claude-md-worktree-policy (909cac0)
- Update git workflow to use worktrees for session isolation (f0573b5)
- Merge pull request #7 from rolandmarg/improve-claude-md (bc80ba9)
- Improve CLAUDE.md: fix stale architecture, add git workflow and gotchas (20f95ba)
- Merge pull request #6 from rolandmarg/deduplicate-lambda-scripts (ae26aa0)
- Deduplicate Lambda build scripts and remove stale security.util.ts (765330e)
- Delete cursorrules (372c871)
- Merge pull request #5 from rolandmarg/claude/simplify-codebase-flatten-abstractions (08b1a4a)
- Fix code review issues: indentation, redundant checks, dead code (ffbb601)
- Flatten codebase: remove abstractions, simplify to flat modules (3931ff9)
- Update claude.md (505bd70)
- Merge pull request #4 from rolandmarg/claude/improve-claude-md-documentation (4a9b7f2)
- Remove all Twilio integration (a9825bd)
- Improve CLAUDE.md with actionable project documentation (6b7a8c9)
- Update claude.md (d92bf54)
- Merge pull request #3 from rolandmarg/claude/simplify-observability-x24Lw (81d5067)
- Update yarn.lock (f9b93f5)
- Simplify observability: drop SNS, X-Ray, and CloudWatch Metrics (ad14702)
- Merge pull request #2 from rolandmarg/claude/add-claude-documentation-SAHvT (2fb2d48)
- Add CLAUDE.md with codebase guidance for AI assistants (37640bb)
- Update readme (bc42a1f)
- Update readme (79ca2dd)
- Remove Twilio config (6214af7)
- Drop pino-pretty (269a290)

**Full Changelog**: v1.0.21...v1.1.0

---
## [1.0.21] - 2025-12-13

## What's Changed

### 🔧 Chores

- Remove daily summary handler and related configurations (d8f636b)

**Full Changelog**: v1.0.20...v1.0.21

---
## [1.0.20] - 2025-12-09

## What's Changed

### ♻️  Refactoring

- Remove Twilio client integration from AlertingService (252f2ca)

**Full Changelog**: v1.0.19...v1.0.20

---
## [1.0.19] - 2025-12-06

## What's Changed

### 🔧 Chores

- Integrate Twilio for SMS notifications and remove missed days recovery logic (a1699ae)
- Add FilterPolicy to SNS subscription for SMS notifications (4ca6355)

### 📦 Other Changes

- Remove extra badges (34a3940)
- Add badges to readme (e8a554d)
- Update readme (9662f6d)

**Full Changelog**: v1.0.18...v1.0.19

---
## [1.0.18] - 2025-12-06

## What's Changed

### 📦 Other Changes

- Drop tests from ci/cd (3d15183)
- Skip type check in precommit for fast dev cycle, keep typecheck in CI/CD (c0af7df)
- Make sharp optional dependency (c8a5e25)
- Who needs tests when u have claude composer (05a1b0c)

**Full Changelog**: v1.0.17...v1.0.18

---
## [1.0.17] - 2025-12-06

## What's Changed

### 📦 Other Changes

- Alert if auth needed on sms/email (787626c)

**Full Changelog**: v1.0.16...v1.0.17

---
## [1.0.16] - 2025-12-06

## What's Changed

### 📦 Other Changes

- Git status --porcelain (09d92ab)
- Timezone fix (6d30e54)
- Update readme (a5981ac)

**Full Changelog**: v1.0.15...v1.0.16

---
## [1.0.15] - 2025-12-06

## What's Changed

### 📝 Documentation

- Update README and improve local execution details (f38f517)

**Full Changelog**: v1.0.14...v1.0.15

---
## [1.0.14] - 2025-12-03

## What's Changed

### ✨ Features

- Optimize WhatsApp client for Lambda by implementing active group ID filtering (276ffb2)

### ♻️  Refactoring

- Simplify birthday service monthly digest logic (71a9de8)

### 🔧 Chores

- Add tar dependency for session storage management (653c2e8)
- Update version to 1.0.13 (6ee10d0)

**Full Changelog**: v1.0.13...v1.0.14

---
## [1.0.14] - 2025-11-27

## What's Changed

### 🔧 Chores

- Enhance git tagging process in release script (af2a9a2)
- Update build-lambda script to use --immutable flag for yarn install (acd933a)
- Lock googleapis dependency to exact version (3b7744a)
- Remove SCHEDULE_TIME from configuration files (b5caed4)
- Update build-lambda script and package.json for SAM compatibility (bc732fe)
- Disable automatic version bumping in GitHub Actions (9a3cc55)

### 📦 Other Changes

- Fix build (324b776)
- Merge pull request #1 from rolandmarg/refactor/build-scripts-and-clients (7504175)
- Refactor build scripts and improve client implementations (21b45aa)
- Lock down all dependency versions to exact versions (0537fe0)
- Revert "chore: update build-lambda script to disable git-based versioning for SAM builds" (3997862)

**Full Changelog**: v1.0.12...v1.0.14

---
## [1.0.13] - 2025-11-27

## What's Changed

### 🔧 Chores

- Update build-lambda script to use --immutable flag for yarn install (acd933a)
- Lock googleapis dependency to exact version (3b7744a)
- Remove SCHEDULE_TIME from configuration files (b5caed4)
- Update build-lambda script and package.json for SAM compatibility (bc732fe)
- Disable automatic version bumping in GitHub Actions (9a3cc55)

### 📦 Other Changes

- Fix build (324b776)
- Merge pull request #1 from rolandmarg/refactor/build-scripts-and-clients (7504175)
- Refactor build scripts and improve client implementations (21b45aa)
- Lock down all dependency versions to exact versions (0537fe0)
- Revert "chore: update build-lambda script to disable git-based versioning for SAM builds" (3997862)

**Full Changelog**: v1.0.12...v1.0.13

---
## [1.0.12] - 2025-11-26

## What's Changed

### 🔧 Chores

- Update build-lambda script to disable git-based versioning for SAM builds (151c2de)

**Full Changelog**: v1.0.11...v1.0.12

---
## [1.0.11] - 2025-11-26

## What's Changed

### 🔧 Chores

- Update Google API dependencies and refactor imports (ff466f7)

### 📦 Other Changes

- Add pre-commit hook with auto-fix aligned with CI pipeline (43ac775)

**Full Changelog**: v1.0.10...v1.0.11

---

## [1.0.10] - 2025-11-25

## What's Changed

### 📦 Other Changes

- Remove 'Unreleased' section from CHANGELOG (d967cfa)
- Clean up initial entries in CHANGELOG.md (3855910)

**Full Changelog**: v1.0.9...v1.0.10


# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.9] - 2025-11-25

## What's Changed

### 🔧 Chores

- Update import paths in whatsapp.client.ts to include .js extension (4e78438)

**Full Changelog**: v1.0.8...v1.0.9

---
## [1.0.8] - 2025-11-25

## What's Changed

### ✨ Features

- Enhance alerting service with human-readable timestamps (cf5cfba)

**Full Changelog**: v1.0.7...v1.0.8

---
## [1.0.7] - 2025-11-22

## What's Changed

### 🔧 Chores

- Update nullish coalescing rule in cursor rules (655cbc3)
- Enforce Baileys version lock and update documentation (1145aec)

**Full Changelog**: v1.0.6...v1.0.7

---
## [1.0.6] - 2025-11-22

## What's Changed

### 🔧 Chores

- Update deploy script to use Yarn for packaging Lambda functions (6769d01)

### 📦 Other Changes

- Fix deploy warning (bd9e576)
- Fix deploy script (0e8e917)

**Full Changelog**: v1.0.5...v1.0.6

---
## [1.0.5] - 2025-11-22

## What's Changed

### 🔧 Chores

- Update README and enhance auto-release workflow (ea1dfe3)

### 📦 Other Changes

- Merge branch 'main' of https://github.com/rolandmarg/mnemora (b54de5e)

**Full Changelog**: v1.0.4...v1.0.5

---
## [1.0.4] - 2025-11-22

## What's Changed

### 📝 Documentation

- Add technical capabilities section to README (c1743cf)

**Full Changelog**: v1.0.3...v1.0.4

---
## [1.0.3] - 2025-11-22

## What's Changed

### 🐛 Bug Fixes

- Use actions4gh/setup-gh action for GitHub CLI installation (c1e0634)
- Use manual GitHub CLI installation in workflow (76956ce)

### 🔧 Chores

- Remove GitHub CLI setup from auto-release workflow (b5a4600)
- Update auto-release workflow to enable Corepack (80475bb)
- Update Yarn configuration and dependencies (09821ae)
- Update Yarn version in auto-release workflow (1a99377)
- Add GitHub Actions workflow for automated release process (4f6393c)
- Migrate build and package scripts to TypeScript and update shell scripts to zsh (6c1b3b9)

### 📦 Other Changes

- Fix bug (a3cff1c)

**Full Changelog**: v1.0.2...v1.0.3

---

## [1.0.2] - 2025-11-22

## What's Changed

### ✨ Features

- Add changelog generation and CHANGELOG.md maintenance to release script (4ce57f7)

### 🐛 Bug Fixes

- Rewrite release notes generation using Node.js for bash 3.2 compatibility (1bbf88b)
- Remove unnecessary container usage in SAM build script (7f28aed)

### 🔧 Chores

- Improve cleanup process in build and package scripts for Lambda (11a8a36)
- Enhance build process and cleanup for Lambda deployment (265980a)
- Update dependencies and enhance build process for Lambda (e04e189)

**Full Changelog**: v1.0.1...v1.0.2
