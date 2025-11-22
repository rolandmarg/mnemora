# 🎂 Mnemora

Never miss another birthday. Mnemora automatically checks your Google Calendar or Google Sheets for birthdays and sends WhatsApp notifications to your group chat.

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
SCHEDULE_TIME=09:00
TIMEZONE=America/Los_Angeles
```

### 3. First Run
```bash
yarn start
```
Scan QR code with WhatsApp (Settings → Linked Devices → Link a Device). Session saves automatically.

## Commands

```bash
yarn start              # Run birthday check
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

```bash
yarn build:lambda
sam deploy --guided
```

**Cost**: ~$1/month. Creates Lambda, EventBridge, S3, DynamoDB, CloudWatch.

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
