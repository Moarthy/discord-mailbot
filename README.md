<div align="center">

# 📬 Discord Mailbot
### The Ultimate Next-Generation ModMail System for Discord

[![Discord.js](https://img.shields.io/github/package-json/dependency-version/Moarthy/discord-mailbot/discord.js?style=for-the-badge&logo=discord&logoColor=white&color=5865F2)](https://discord.js.org)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/github/license/Moarthy/discord-mailbot?style=for-the-badge&color=E67E22)](https://choosealicense.com/licenses/mit/)
[![Release](https://img.shields.io/github/package-json/version/Moarthy/discord-mailbot?style=for-the-badge&label=Release&color=6C5CE7)](https://github.com/Moarthy/discord-mailbot)
[![Last Commit](https://img.shields.io/github/last-commit/Moarthy/discord-mailbot?style=for-the-badge&label=Last%20Commit&color=007EC6)](https://github.com/Moarthy/discord-mailbot/commits/main)

[Features](#-key-features) • [Installation](#-installation) • [Configuration](#-configuration) • [Commands](#-commands--interactions) • [Architecture](#-architecture)

</div>

---

## 🌟 Overview
**Discord Mailbot** is a highly advanced, lightweight, and feature-rich ModMail system built on **Discord.js v14**. Designed for large communities and professional support teams, it bridges the gap between a seamless user experience and powerful staff moderation tools. 

By utilizing **Webhooks**, **Modals**, **Buttons**, and **Typing Indicators**, it delivers a frictionless support experience right inside Discord without the need for external databases or complex web dashboards.

---

## ✨ Key Features

### 🎯 Claim-First Workflow
Eliminate overlapping replies and confusion. Staff members must **claim** a ticket before interacting with the user. 
*   **Auto-locking:** Only the claimant can send messages to the user.
*   **Release Logic:** Unclaim anytime, or let the system automatically release claims if the staff member leaves the server.

### 🕵️ Anonymous & Branded Replies
Toggle **Anonymous Mode** to reply as the "Server Staff" without revealing your personal Discord username, or keep it transparent to build personal connections with your community.

### 🪝 Seamless Webhook Integration
Leveraging Discord Webhooks, user messages appear natively inside the support channel. It looks and feels exactly like the user is chatting directly in the server! Attachments are automatically downloaded and re-uploaded flawlessly.

### ⌨️ Real-Time Typing Indicators
Bridging the gap between DMs and channels. When a user types in their DMs, the ticket channel shows typing, and vice versa, making conversations feel live and natural.

### 📝 Intelligent Transcripts
Generate beautiful, fully responsive **HTML Transcripts** upon ticket closure.
*   **User View:** Clean transcript for the user.
*   **Staff View:** Includes private internal notes and system events.
*   **Feedback System:** Prompts users via an interactive Modal to leave a rating and feedback after closure.

### 🛡️ Robust State Management & Auto-Reconciliation
Never lose data, even during unexpected downtime or restarts. 
*   **Orphan Cleanup:** Automatically deletes ticket channels that lost their state.
*   **Claim Recovery:** Frees up tickets claimed by staff members who left the guild while the bot was offline.
*   **JSON-based Storage:** Zero database setup required; persistent lightweight JSON storage with atomic writes.

### ⏱️ Smart Interactions & Cooldowns
Prevents chat spam and accidental overlaps. If a staff member tries to reply to an unclaimed ticket, the bot warns them and auto-cleans the warning after 30 seconds to keep the channel pristine.

### 🚫 Blacklist System
Protect your support team from trolls and abusers with a robust, persistent blacklist system. Blocked users are instantly notified upon trying to open a ticket.

---

## 🚀 Installation

### Prerequisites
*   **Node.js** v18.0.0 or higher
*   **npm** or **yarn**
*   A Discord Bot Application with **Message Content**, **Server Members**, and **Presence** intents enabled.

### Step-by-Step Setup

1.  **Clone the repository:**
```bash
    git clone https://github.com/Moarthy/discord-mailbot.git
    cd discord-mailbot
```

2.  **Install dependencies:**
```bash
    npm install
```

3.  **Configure Environment Variables:**
    Duplicate the example environment file and fill in your secrets:
```bash
    cp .env.example .env
```

4.  **Deploy Slash Commands:**
    Register the bot's commands with Discord:
```bash
    npm run deploy
```

5.  **Start the Bot:**
```bash
    npm start
```

---

## ⚙️ Configuration

Open your `.env` file and configure the following variables:

| Variable | Required | Description |
| :--- | :---: | :--- |
| `DISCORD_TOKEN` | ✅ | Your Discord Bot Token. |
| `CATEGORY_ID` | ✅ | The ID of the category where ticket channels will be created. |
| `GUILD_ID` | ❌ | (Optional) The ID of your server. Used for instant slash command deployment. |
| `MODERATOR_ROLE_ID` | ❌ | (Optional) The role ID that grants staff access to commands and tickets. |
| `LOG_CHANNEL_ID` | ❌ | (Optional) Channel ID to receive system logs, alerts, and feedback. |
| `TRANSCRIPT_CHANNEL_ID`| ❌ | (Optional) Channel ID to automatically post archived transcripts. |
| `DATA_FILE` | ❌ | (Optional) Path to the JSON database file. Defaults to `./data/tickets.json`. |

> **⚠️ Permissions Note:** Ensure the bot has `Manage Channels`, `Manage Webhooks`, `Manage Roles`, `Manage Messages`, and `Send Messages` permissions in the designated category!

---

## 🎛️ Commands & Interactions

### Slash Commands
| Command | Description |
| :--- | :--- |
| `/claim` | Claim or unclaim the current ticket. |
| `/close [reason]` | Close the ticket and send a formatted receipt to the user. |
| `/blacklist [add/remove] [user] [reason]` | Manage the blacklist to block/unblock abusive users. |
| `/note [text]` | Add an internal, private note to the ticket (invisible to the user). |
| `/transcript` | Generate and download the HTML transcript for the current ticket. |
| `/info` | Display user stats, account creation date, and ticket metadata. |

### Interactive Buttons
Every active ticket features a dynamic header with interactive buttons:
*   **🟢 Claim / 🔴 Unclaim:** Assign yourself to the ticket.
*   **🕶️ Anon:** Toggle anonymous replies.
*   **📄 Transcript:** Instantly download the ticket history.
*   **🛑 Close:** Opens a modal to input a closure reason.

---

## 🏗️ Architecture

Discord Mailbot is engineered with scalability and maintainability in mind, utilizing a strictly modular architecture:

*   **`src/services/`**: Contains core business logic (ticket creation, webhooks, transcripts, closures).
*   **`src/events/`**: Event listeners mapped to specific Discord Gateway events.
*   **`src/commands/`**: Self-contained Slash Command modules.
*   **`src/interactions/`**: Handles complex UI interactions like Buttons and Modals.
*   **`src/utils/`**: Shared utilities (embed builders, time formatting, permission checks).
*   **`src/store/`**: Singleton JSON persistence manager with atomic file writes and backfill support.

---

## 📸 Previews

**Ticket Header:**
> Displays user information, ticket number, join dates, and interactive action buttons in a sleek embed.

**Staff Reply:**
> Staff replies are beautifully formatted in the user's DMs, complete with staff branding (or anonymous server branding) and attachment support.

**HTML Transcripts:**
> Dark-themed, responsive HTML files that clearly differentiate between user messages, staff replies, internal notes, and system events via color-coded borders.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! 
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<div align="center">
  
  **Crafted with ❤️ by [Moarthy]**
  
  *Empowering Discord communities with professional support tools.*
  
</div>
