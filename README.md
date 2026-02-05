# Mnemora

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-24.x-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Yarn](https://img.shields.io/badge/Yarn-4.11-2C8EBB?logo=yarn&logoColor=white)
![Lambda Runtime](https://img.shields.io/badge/Runtime-nodejs24.x-FF9900?logo=aws-lambda&logoColor=white)

</div>

Birthday notifications on autopilot. Fetches birthdays from Google Calendar or Sheets, sends WhatsApp messages to your group chat.

Built for a 50-member beach volleyball community that kept forgetting each other's birthdays.

## Features

- **Daily checks** — scans Google Calendar or Sheets every morning
- **WhatsApp notifications** — sends birthday messages to your group chat
- **Monthly digests** — posts upcoming birthdays on the 1st of each month
- **Serverless** — runs as an AWS Lambda on a schedule, ~$1/month

## Quick Start

```bash
yarn install
cp .env.example .env  # Add your Google & WhatsApp credentials
yarn start             # Scan QR code to link WhatsApp, then you're live
```

See [docs/](./docs/) for Google API setup, environment variables, and AWS deployment.

## Project Structure

```
src/
├── clients/     # Google Calendar, Sheets, WhatsApp, S3
├── services/    # Birthday check orchestration
├── lambda/      # AWS Lambda handler
├── utils/       # Date, name, and logging helpers
└── config.ts    # Centralized configuration
```

## Tech Stack

TypeScript · Node.js 24 · AWS Lambda · SAM · Google APIs · Baileys (WhatsApp Web)

## License

ISC
