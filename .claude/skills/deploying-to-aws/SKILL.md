---
name: deploying-to-aws
description: Use when deploying Mnemora to AWS Lambda, releasing a new version, bumping version numbers, or when the user says "deploy" or "release"
disable-model-invocation: true
---

# Deploying to AWS

One-shot workflow that bumps version, pushes release to GitHub, and deploys to AWS Lambda. Runs the release and deploy pipelines as a single verified operation.

## The Process

### 1. Verify Prerequisites

Run all checks in parallel:

```bash
git status                    # Must be clean working directory
git branch --show-current     # Must be on main
git pull                      # Must be up to date
aws sts get-caller-identity   # AWS credentials valid
sam --version                 # Must be >= 1.148.0
```

**STOP if any check fails.** Fix the issue before proceeding.

### 2. Choose Version Bump

Ask the user which bump type (unless they already specified):

| Type | When | Example |
|------|------|---------|
| `patch` | Bug fixes, minor tweaks | 1.0.21 -> 1.0.22 |
| `minor` | New features | 1.0.21 -> 1.1.0 |
| `major` | Breaking changes | 1.0.21 -> 2.0.0 |
| `skip` | Re-deploy current version | No version change |

### 3. Release to GitHub (unless skip)

```bash
yarn release:patch  # or :minor / :major
```

This atomically: bumps `package.json`, generates release notes from conventional commits, updates `CHANGELOG.md`, commits + tags + pushes, and creates a GitHub release.

**Wait for this to complete successfully before deploying.**

### 4. Deploy to AWS

```bash
yarn deploy
```

Builds TypeScript, installs prod deps, tree-shakes googleapis, validates package < 250MB, deploys via SAM. Takes 2-5 minutes.

If deploy fails with stale cache issues:
```bash
yarn deploy:force
```

### 5. Verify Deployment

Run all verifications:

```bash
# Stack status should be UPDATE_COMPLETE or CREATE_COMPLETE
aws cloudformation describe-stacks \
  --stack-name mnemora-birthday-bot-prod \
  --region us-west-1 \
  --query 'Stacks[0].{Status:StackStatus,Updated:LastUpdatedTime}' \
  --output table

# Invoke function to confirm it runs
yarn invoke:lambda
```

### 6. Confirm Version Match

```bash
node -e "console.log('package.json:', require('./package.json').version)"
git describe --tags --abbrev=0
```

Both versions must match. If they don't, something went wrong in step 3.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `yarn release:patch\|minor\|major` | Bump, changelog, tag, push, GitHub release |
| `yarn deploy` | Build + package + SAM deploy |
| `yarn deploy:force` | Clear `.aws-sam` cache and redeploy |
| `yarn invoke:lambda` | Test deployed function |

## Red Flags

- Uncommitted changes -> commit or stash first
- Not on main -> switch to main or confirm intentional
- SAM CLI < 1.148.0 -> upgrade (`brew upgrade aws-sam-cli`)
- Package size > 250MB -> check if Baileys drifted from pinned 6.7.21
- Release succeeded but deploy failed -> the version is tagged but not deployed; fix deploy issue and run `yarn deploy` again (no need to re-release)
