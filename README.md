<div align="center">

# Discord Mailbot
### Advanced ModMail System for Discord

[![Discord.js](https://img.shields.io/github/package-json/dependency-version/Moarthy/discord-mailbot/discord.js?style=flat-square&logo=discord&logoColor=white&color=5865F2)](https://discord.js.org)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/github/license/Moarthy/discord-mailbot?style=flat-square&color=E67E22)](https://choosealicense.com/licenses/mit/)
[![Release](https://img.shields.io/github/package-json/version/Moarthy/discord-mailbot?style=flat-square&label=Release&color=6C5CE7)](https://github.com/Moarthy/discord-mailbot)
[![Last Commit](https://img.shields.io/github/last-commit/Moarthy/discord-mailbot?style=flat-square&label=Last%20Commit&color=007EC6)](https://github.com/Moarthy/discord-mailbot/commits/main)

[Features](#features) • [Installation](#installation) • [Configuration](#configuration) • [Commands](#commands--interactions) • [Architecture](#architecture)

</div>

---

## Overview

Discord Mailbot is a lightweight, feature-rich ModMail system built on Discord.js v14. Designed for community support teams, it facilitates seamless communication between server staff and users via direct messages. The system utilizes webhooks, interactive modals, and persistent JSON storage, eliminating the need for external databases while providing a robust moderation environment.

## Features

*   **Claim-Based Workflow:** Prevents overlapping responses by requiring staff to claim a ticket before interacting. Claims are automatically released if the assigned staff member leaves the server.
*   **Webhook Integration:** Routes user messages natively into support channels using Discord Webhooks, preserving attachments, formatting, and reply contexts.
*   **Anonymous Replies:** Allows staff to toggle between personal branding and anonymous "Server Staff" responses to maintain privacy or team cohesion.
*   **HTML Transcripts:** Generates responsive, color-coded HTML transcripts upon ticket closure, distinguishing between user messages, staff replies, and private internal notes.
*   **Typing Indicators:** Synchronizes typing states between user DMs and staff channels to provide a real-time conversational experience.
*   **State Reconciliation:** Automatically cleans up orphaned channels and recovers ticket states during bot restarts or unexpected downtime.
*   **Blacklist Management:** Blocks abusive users from opening new tickets with persistent, file-based enforcement.
*   **Web Dashboard:** Launch a local HTTP dashboard (with the `--dashboard` flag) showing live ticket/claim/moderator stats, bot & project health, RAM usage, and a full conversation browser.
*   **Durable Audit Logging:** Structured, append-only JSONL logs (`logs/bot.log` and `logs/audit.log`) that faithfully record every sensitive action (claims, closures, blacklists, feedback, startup/shutdown, errors) with sequence numbers and timestamps.

## Installation

**Prerequisites:**
*   Node.js v18.0.0 or higher
*   npm or yarn
*   A Discord Bot Application with **Message Content**, **Server Members**, and **Presence** intents enabled.

```bash
# Clone the repository
git clone https://github.com/Moarthy/discord-mailbot.git
cd discord-mailbot

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env

# Deploy slash commands to Discord
npm run deploy

# Start the application
npm start
```

## Configuration

Populate the `.env` file with your Discord credentials and server IDs.

| Variable | Requirement | Description |
| :--- | :--- | :--- |
| `DISCORD_TOKEN` | **Required** | Your Discord Bot Token. |
| `CATEGORY_ID` | **Required** | The ID of the category where ticket channels will be created. |
| `GUILD_ID` | Optional | Server ID for instant, guild-specific slash command deployment. |
| `MODERATOR_ROLE_ID` | Optional | Role ID granting staff access to tickets and management commands. |
| `LOG_CHANNEL_ID` | Optional | Channel ID for system logs, alerts, and closure feedback. |
| `TRANSCRIPT_CHANNEL_ID` | Optional | Channel ID for automatically archiving generated transcripts. |
| `DATA_FILE` | Optional | Path to the JSON database file. Defaults to `./data/tickets.json`. |
| `DASHBOARD_PORT` | Optional | Port for the web dashboard. Defaults to `3000`. |
| `DASHBOARD_HOST` | Optional | Interface the dashboard binds to. Defaults to `0.0.0.0`. |
| `DASHBOARD_TOKEN` | Optional | When set, the dashboard requires this token (`?token=…` or `Authorization: Bearer …`). |

*Note: The bot requires `Manage Channels`, `Manage Webhooks`, `Manage Roles`, `Manage Messages`, and `Send Messages` permissions in the target category.*

## Commands & Interactions

### Slash Commands

| Command | Description |
| :--- | :--- |
| `/claim` | Claim or unclaim the active ticket. |
| `/close [reason]` | Close the ticket, prompt for feedback, and generate a transcript. |
| `/blacklist [add/remove] [user]` | Manage the user blacklist. |
| `/note [text]` | Add an internal note invisible to the user. |
| `/transcript` | Manually generate and download the HTML transcript. |
| `/info` | Display user metadata, join dates, and ticket statistics. |

### Interactive Components

Active tickets feature a header embed containing interactive buttons for claiming, toggling anonymous mode, downloading transcripts, and opening a closure modal. Staff replies are routed via ephemeral interactions to prevent accidental public disclosures.

## Architecture

The project follows a strictly modular structure to ensure maintainability:

*   **`src/services/`**: Core business logic (webhooks, transcripts, state management, closures).
*   **`src/events/`**: Discord Gateway event listeners mapped to specific actions.
*   **`src/commands/`**: Self-contained Slash Command modules.
*   **`src/interactions/`**: Handlers for complex UI interactions (buttons and modals).
*   **`src/store/`**: Singleton JSON persistence manager with atomic file writes and backfill support.
*   **`src/dashboard/`**: Local web dashboard (HTTP server, snapshot collector, and static frontend).

## Web Dashboard

Start the bot with the `--dashboard` flag (or `npm run dashboard`) to launch a local web dashboard alongside the bot:

```bash
npm run dashboard          # or: node src/index.js --dashboard
```

Open `http://localhost:3000` (or your configured `DASHBOARD_PORT`) in a browser. The dashboard provides:

*   **Live statistics** — open/archived tickets, moderators, active claims, unique users, and blacklist size.
*   **Bot & project health** — gateway status, WebSocket ping, uptime, package version, and configuration summary.
*   **RAM & system metrics** — process RSS/heap, system memory, CPU load average, and host details.
*   **Detailed views** — moderator profiles (roles, active claims, tickets closed), ticket authors, the claim→ticket mapping, and full per-ticket conversations (open tickets show live message history; closed tickets link to their HTML transcripts).
*   **Audit & log stream** — a live, filterable view of both the general log and the sensitive audit log, with per-file persistence to `logs/`.

### Durable, trustworthy logging

All logging is written to two append-only JSONL files under `logs/`:

| File | Contents |
| :--- | :--- |
| `logs/bot.log` | General application logs (debug/info/warn/error). |
| `logs/audit.log` | Sensitive / important events: ticket opened/claimed/released/taken-over/closed, blacklist changes, internal notes, feedback, claim releases, orphan cleanup, startup/shutdown, and uncaught errors. |

Reliability guarantees: every entry receives a monotonically increasing sequence number and an ISO-8601 timestamp *before* it is emitted; entries are appended synchronously so a logged event is guaranteed to be on disk before the caller continues; files auto-rotate past 10 MB. The in-memory ring buffer that powers the dashboard is a view over the same entries, so what you see is exactly what is persisted.

## Contributing

Contributions, issues, and feature requests are welcome. 
1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/NewFeature`).
3. Commit your changes (`git commit -m 'Add NewFeature'`).
4. Push to the branch (`git push origin feature/NewFeature`).
5. Open a Pull Request.

## License

Distributed under the MIT License. See `LICENSE` for more information.
