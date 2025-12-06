# 🎂 Mnemora

**Why I built this**: I'm part of a beach volleyball community with 50+ members in a WhatsApp group. We try to congratulate everyone on their birthdays, but we'd sometimes forget them since there was no centralized tracking. So we asked members to add their birthdays to a Google Sheet, and I built Mnemora to sync those birthdays to Google Calendar. Now, on someone's birthday, the bot automatically sends a message to our WhatsApp group, and on the 1st of each month, everyone receives a monthly digest of upcoming birthdays.

Never miss another birthday. Mnemora automatically checks your Google Calendar or Google Sheets for birthdays and sends WhatsApp notifications to your group chat.

## Current Status

![WhatsApp Messages Sent](https://img.shields.io/badge/WhatsApp%20Messages%20Sent-384%2B-25D366?logo=whatsapp&logoColor=white)

**Deployment**: This app is currently running in personal AWS cloud (developer's AWS account).

> Note: Message count is updated periodically. For real-time metrics, check AWS CloudWatch dashboard.

## The Problem

Birthdays are easy to forget. You might have them in a calendar or spreadsheet, but you still need to remember to check every day. Mnemora solves this by:
- **Automatically checking** your data sources (Google Calendar, Sheets, CSV) every morning
- **Sending notifications** to your WhatsApp group, family chat, or any messaging platform
- **Handling missed days** intelligently if the system was down
- **Monthly digests** on the 1st of each month showing all upcoming birthdays

No more awkward "I didn't know it was your birthday!" moments.

## Quick Start

```bash
yarn install
cp .env.example .env  # Edit with your credentials
yarn start
```

## Setup

### 1. Google Calendar/Sheets
- Create service account in [Google Cloud Console](https://console.cloud.google.com/)
- Enable Calendar API and/or Sheets API
- Download JSON key
- Share calendar/spreadsheet with service account email

### 2. Environment Variables

```env
# Google Calendar
GOOGLE_CALENDAR_ID=your-calendar-id
GOOGLE_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_PROJECT_ID=your-project-id

# Google Sheets (optional)
GOOGLE_SPREADSHEET_ID=your-spreadsheet-id

# WhatsApp
WHATSAPP_GROUP_ID=your-group-name

# Config
TIMEZONE=America/Los_Angeles
```

### 3. First Run
```bash
yarn start
```
Scan QR code with WhatsApp (Settings → Linked Devices → Link a Device). Session saves automatically to S3 if configured.

**Note:** `yarn start` runs the same functionality as Lambda (including metrics, alerting, etc.). The only difference is it runs locally instead of in AWS Lambda.

## Commands

```bash
yarn start              # Run birthday check (same functionality as Lambda)
yarn dev                # Development mode (auto-reload)
yarn build              # Compile TypeScript
yarn type-check         # Type check
yarn lint               # Lint code
yarn test               # Run tests
yarn delete-all-events  # Bulk delete utility
```

## Local Scheduling (macOS)

```bash
yarn install-cron   # Install daily 9 AM job
yarn uninstall-cron # Remove
```

## AWS Lambda Deployment

### Prerequisites

- **Node.js**: >= 24.0.0 (matches Lambda runtime)
- **Yarn**: >= 4.11.0
- **AWS SAM CLI**: >= 1.148.0 (required for nodejs24.x support)
- **AWS CLI**: Latest version

Install/update SAM CLI:
```bash
brew install aws-sam-cli  # or brew upgrade aws-sam-cli
```

### ⚠️ Critical: Baileys Version Must Be Locked

**DO NOT use `^` or `~` for `@whiskeysockets/baileys`. It MUST be locked to exactly `6.7.21`.**

Versions 6.17.16+ introduce:
- Audio decoder dependencies (~22MB): `@wasm-audio-decoders`, `node-wav`, `ogg-opus-decoder`
- Additional dependencies (~10MB): `lodash` (4.9MB) and `libphonenumber-js` (5.6MB)

**Impact**: Package size increases from ~37MB to ~60MB+, which can cause Lambda deployment issues.

**Correct configuration:**
```json
"@whiskeysockets/baileys": "6.7.21"  // ✅ Exact version (no ^ or ~)
```

**Wrong configuration:**
```json
"@whiskeysockets/baileys": "^6.7.21"  // ❌ Allows 6.17.16+ to be installed
"@whiskeysockets/baileys": "~6.7.21"  // ❌ Also allows updates
```

**If you need to upgrade Baileys:**
1. Check if audio features are actually needed
2. Test package size impact: `yarn package:lambda`
3. Verify size stays under 100MB
4. Update cleanup script if needed
5. Document why the upgrade is necessary

### Deploy

```bash
yarn deploy
```

**Cost**: ~$1/month. Creates Lambda, EventBridge, S3, XRay, SNS, CloudWatch.

## Project Structure

```
src/
├── data-source/       # Google Calendar, Sheets, CSV, etc.
├── output-channel/    # WhatsApp, SMS, Email, Console
├── services/          # Birthday logic, orchestration
├── clients/           # API clients
├── scripts/           # CLI utilities
└── utils/             # Date, name, event helpers
```

## Development

- **TypeScript** with ESM (use `.js` extension in imports)
- **Yarn** package manager
- **Vitest** for testing
- **ESLint** for linting

See [docs/](./docs/) for detailed documentation.

## Technical Capabilities

### Data Sources
- **Google Calendar**: Read birthday events from Google Calendar
- **Google Sheets**: Sync birthdays from Google Sheets to Calendar
- Extensible architecture for adding additional data sources (CSV, databases, etc.)

### Output Channels
- **WhatsApp**: Send notifications via WhatsApp Web.js (Baileys)
- **Console**: Development and debugging output
- Extensible architecture for additional channels (SMS, Email, etc.)

### AWS Cloud Infrastructure
- **AWS Lambda**: Serverless execution (Node.js 24.x runtime)
- **EventBridge**: Scheduled daily execution (configurable time)
- **S3**: WhatsApp session storage with versioning and lifecycle policies
- **CloudWatch**: Logging, metrics, and monitoring
- **X-Ray**: Distributed tracing for performance analysis
- **SNS**: Alert notifications (Email and SMS) for system failures
- **CloudWatch Alarms**: Automated alerting for errors and failures

### Monitoring & Observability
- **Structured Logging**: Pino-based logging with CloudWatch integration
- **Custom Metrics**: CloudWatch metrics for message counts, execution status
- **Distributed Tracing**: AWS X-Ray for request tracing
- **Error Alerting**: SNS-based notifications for critical failures

### Versioning & Release Process
- **Semantic Versioning**: Automated version management (MAJOR.MINOR.PATCH)
- **Release Workflow**: Automated release script with git tagging
- **GitHub Releases**: Integration with GitHub CLI for release notes
- **Release History**: Git tags and GitHub releases for version tracking
- *Note: Release workflow documentation to be updated with CI/CD integration details*

### Development Tools
- **TypeScript**: Strict type checking with ESM support
- **Vitest**: Unit testing framework
- **ESLint**: Code quality and style enforcement
- **Type Checking**: Standalone type checking without compilation
- **Hot Reload**: Development mode with auto-reload

### Architecture Features
- **Modular Design**: Pluggable data sources and output channels
- **Factory Pattern**: Dynamic creation of data sources and channels
- **Error Handling**: Comprehensive error handling with retry logic
- **Date Handling**: Timezone-aware date utilities
- **Duplicate Prevention**: Built-in protection against duplicate birthday messages

## Releases

Mnemora uses [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH) for version numbers.

### Creating a Release

Releases are automated through the release script. The script will:
1. Bump the version in `package.json`
2. Create a git commit with the version bump
3. Create an annotated git tag (vX.Y.Z format)
4. Push the tag to the remote repository
5. Optionally create a GitHub release (if GitHub CLI is installed)

#### Quick Release Commands

```bash
yarn release:patch   # Bump patch version (1.0.0 → 1.0.1)
yarn release:minor   # Bump minor version (1.0.0 → 1.1.0)
yarn release:major   # Bump major version (1.0.0 → 2.0.0)
yarn release:version 1.2.3  # Release specific version
```

#### Release Workflow

1. Ensure your working directory is clean (commit or stash changes)
2. Run the appropriate release command based on the type of changes:
   - **Patch** (1.0.0 → 1.0.1): Bug fixes, small improvements
   - **Minor** (1.0.0 → 1.1.0): New features, backward compatible
   - **Major** (1.0.0 → 2.0.0): Breaking changes
3. The script will automatically:
   - Update `package.json` version
   - Create a git commit
   - Create and push a git tag
   - Create a GitHub release (if `gh` CLI is available)
4. Deploy to production: `yarn deploy`

#### Viewing Release History

- **Git tags**: `git tag -l` or `git tag -l "v*"`
- **GitHub releases**: Visit the [releases page](https://github.com/YOUR_USERNAME/mnemora/releases) (replace with your repository URL)
- **Release notes**: Automatically generated from git commits since the last tag

#### Manual Release Process

If you need to create a release manually:

```bash
# 1. Update version in package.json
# 2. Commit the change
git add package.json
git commit -m "chore: bump version to X.Y.Z"

# 3. Create and push tag
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin main
git push origin vX.Y.Z

# 4. Create GitHub release (optional)
gh release create vX.Y.Z --title "vX.Y.Z" --notes "Release notes here"
```

### Current Version

The current stable version is **v1.0.0**, which represents the initial production-ready release.

## License

ISC
