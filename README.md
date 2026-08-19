# Discord ModMail

<p align="center">
  <img src="https://img.shields.io/badge/discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="discord.js v14" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node >= 18" />
  <img src="https://img.shields.io/badge/license-see%20repo-0ea5e9?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <strong>A production-minded ModMail bot for Discord.</strong><br />
  Users DM the bot. Staff answer from a dedicated ticket channel.<br />
  Claim-first workflow, anonymous replies, HTML transcripts, and post-close feedback.
</p>

---

## Why this exists

Community staff need a private, auditable inbox — not a public `#support` channel. This bot turns every DM into a numbered ticket under a guild category, mirrors conversation both ways, and keeps a structured archive after close.

It is built for **one guild, one inbox**, with state that survives restarts.

## Highlights

| Capability | What it actually does |
| --- | --- |
| **DM → ticket** | First DM opens a text channel in `CATEGORY_ID`. Later DMs reuse the same ticket. |
| **Claim-first** | Only the claimant can reply, close, toggle anonymous mode, or add notes. |
| **Anonymous replies** | Staff can hide their name and avatar; the user sees a staff-branded message. |
| **Internal notes** | `/note` stays in-channel and on the staff transcript — never in the user copy. |
| **HTML transcripts** | Dual archives: a user-safe file and a staff file that includes notes. |
| **Feedback loop** | After close, the user can leave a comment that lands in the log channel. |
| **Blacklist** | Block users from opening tickets; they receive a clear refusal embed. |
| **Startup reconcile** | Orphan channels are deleted, missing channels are archived, stale claims released. |
| **Typing relay** | User typing in DMs shows as typing in the ticket channel. |
| **Atomic JSON store** | Tickets persist via write-then-rename — no extra database required. |

## How a ticket lives

```
User DMs the bot
        │
        ▼
┌───────────────────┐     webhook + header     ┌──────────────────────────┐
│  Private DM       │  ─────────────────────►  │  #username  (category)   │
│  (user)           │  ◄──── staff reply ────  │  Claim / Anon / Close    │
└───────────────────┘                          └──────────────────────────┘
        │                                                │
        │  close + user transcript + feedback button     │ staff transcript
        ▼                                                ▼
   User inbox                                    LOG / TRANSCRIPT channels
```

1. A member DMs the bot. If they are not blacklisted, a ticket channel is created (or reused).
2. Staff **claim** the ticket (button or `/claim`). Unclaimed messages are warned and auto-cleaned.
3. Replies in the ticket are forwarded to the user’s DMs as embeds. Attachments up to 8 MB are re-uploaded.
4. Optional **anonymous** mode strips the staff author line.
5. Close (button modal or `/close`) writes HTML transcripts, DMs the user, posts staff archives, then deletes the channel.
6. The user can leave **feedback**. Staff see it in the configured log channel.

## Commands

All commands are guild-only. Staff checks use `MODERATOR_ROLE_ID` when set; otherwise Administrator, Manage Messages, or Manage Guild.

| Command | Who | Purpose |
| --- | --- | --- |
| `/claim` | Staff | Claim an open ticket, or release it if you already hold it. Locked to the current claimant while they remain in the server. |
| `/close [reason]` | Claimant | Close the ticket, notify the user, archive transcripts. |
| `/info` | Staff | Ephemeral snapshot: user, claim, anonymous flag, open time, message mix. |
| `/note <text>` | Claimant | Internal note — never sent to the user. |
| `/transcript` | Staff | Ephemeral download of the **staff** HTML transcript (includes notes). |
| `/blacklist add` | Staff | Block a user (not bots, owner, or staff). |
| `/blacklist remove` | Staff | Restore access. |
| `/blacklist show` | Staff | List blocked users. |

Ticket header buttons mirror claim, anonymous toggle, transcript, and close.

## Architecture

```
src/
├── index.js                 # Client, intents, process guards
├── config.js                # Required / optional env
├── deploy-commands.js       # Guild or global slash deploy
├── commands/                # Slash command modules (auto-loaded)
├── events/                  # ready, messages, interactions, typing, leaves, deletes
├── interactions/            # Buttons + modals
├── services/                # Tickets, claims, close, transcripts, webhooks, logs
├── store/ticketStore.js     # JSON persistence
└── utils/                   # Embeds, permissions, time, text, logger
```

**Intents:** Guilds, Guild Messages, Direct Messages, Message Content, Guild Members.  
**Partials:** Channel (so uncached DMs still resolve).

On `ready`, the bot validates `CATEGORY_ID`, warns about missing permissions, then **reconciles**:

- Deletes ticket channels whose topic starts with `modmail-ticket:` but have no open store record.
- Archives tickets whose channel disappeared while the process was down.
- Releases claims held by members who left offline, and notifies the ticket owner.

## Requirements

- **Node.js 18+**
- A Discord application with a bot user
- Privileged intents enabled in the Developer Portal:
  - Message Content Intent
  - Server Members Intent
- A **category** in the target guild (the inbox)
- Bot permissions in that guild (recommended):

  `Manage Channels` · `Manage Webhooks` · `Manage Roles` · `Manage Messages` · `View Channel` · `Send Messages` · `Read Message History` · `Embed Links` · `Attach Files`

Invite with those permissions (replace `CLIENT_ID`):

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=268446736
```

The permission integer covers the recommended set above. Adjust if your category already locks visibility.

## Setup

```bash
git clone https://github.com/Moarthy/discord-modmail.git
cd discord-modmail
npm install
```

Create a `.env` in the project root:

```env
# Required
DISCORD_TOKEN=your-bot-token
CATEGORY_ID=123456789012345678

# Strongly recommended
GUILD_ID=123456789012345678
MODERATOR_ROLE_ID=123456789012345678
LOG_CHANNEL_ID=123456789012345678
TRANSCRIPT_CHANNEL_ID=123456789012345678

# Optional — defaults to ./data/tickets.json
# DATA_FILE=/var/lib/modmail/tickets.json
```

| Variable | Required | Notes |
| --- | --- | --- |
| `DISCORD_TOKEN` | yes | Bot token. Never commit this. |
| `CATEGORY_ID` | yes | Must be a **category** channel, not a text channel. |
| `GUILD_ID` | no | If set, slash commands deploy instantly to that guild. If omitted, they deploy globally (up to ~1 hour). |
| `MODERATOR_ROLE_ID` | no | Role treated as staff. Without it, Manage Messages / Manage Guild / Administrator count. |
| `LOG_CHANNEL_ID` | no | System events: blacklist, closes, feedback, claim-release. |
| `TRANSCRIPT_CHANNEL_ID` | no | Receives the **staff** HTML transcript on close. |
| `DATA_FILE` | no | Absolute or relative path to the JSON store. |

Register slash commands, then start the bot:

```bash
npm run deploy
npm start
```

Process managers (example):

```bash
pm2 start src/index.js --name modmail
```

## Persistence

State lives in a single JSON file (default `data/tickets.json`):

- Sequential ticket counter
- Open tickets keyed by user and channel
- Closed-ticket archive (metadata + transcript filenames)
- Blacklist

Saves are **atomic** (`*.tmp` then rename). Message logs stay in the open ticket; on close they are written to:

```
data/transcripts/ticket-0042.html        # user-safe
data/transcripts/ticket-0042-staff.html  # includes internal notes
```

The JSON then drops the bulky log so the store stays small. Treat `data/` as private — it can contain user content and webhook tokens.

## Staff playbook

1. Watch the category (or the ping when `MODERATOR_ROLE_ID` is set).
2. Open the ticket, read the header (account age, membership, claim state).
3. **Claim** before typing. Other staff messages are not forwarded.
4. Toggle **Anon** if policy requires it.
5. Use `/note` for side commentary. Use `/info` for a quick recap.
6. Close with a reason. Confirm the user received the transcript and feedback prompt.

If a claimant leaves the server, the claim is released automatically (live event or next startup) and the user is told their ticket is back in queue.

## Operational notes

- **One open ticket per user.** A second DM continues the same thread.
- **Channel topics** are `modmail-ticket:<userId> | username` — do not overwrite them.
- **Manual channel delete** archives the ticket and DMs the user.
- **Failed ticket init** deletes the half-created channel so the category stays clean.
- **Webhook tokens** are stored with the ticket so user messages can be mirrored with the user’s name and avatar.

## Security

- Keep `.env` and `data/` out of version control (see `.gitignore`).
- Restrict the category so only staff can see ticket channels.
- Blacklist cannot target bots, the guild owner, or staff.
- User-facing transcripts never include `/note` entries.
- Feedback can only be submitted once, and only by the ticket author.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Bot logs in but never opens tickets | Privileged intents, `CATEGORY_ID` is a category, bot can create channels there. |
| Slash commands missing | Run `npm run deploy`. Prefer `GUILD_ID` for instant updates. |
| Staff replies never reach the user | Ticket must be claimed by the author. User must still allow DMs from server members. |
| “Missing required environment variable” | `DISCORD_TOKEN` and `CATEGORY_ID` must be non-empty. |
| Orphan `#username` channels after a crash | Restart the bot — reconcile deletes channels with no store record. |

## Scripts

```bash
npm start     # node src/index.js
npm run deploy
```

## License

See the repository for license terms. Use responsibly: you are processing private user messages — store and retain them according to your community’s privacy policy.
