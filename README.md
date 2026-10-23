# Poga & Eko Bot 🐾

A Discord bot for Poga & Eko's community, with moderation, community tools, and useful server commands.

## Features

- **Moderation:** ban, kick, timed `/warn` with a reason DM, legacy warning lookup/removal, timeout and untimeout, clear messages, slowmode, lock/unlock, nickname changes, and role add/remove.
- **AutoMod:** detected blocked words trigger a 1-day timeout; mentioning another member triggers a 10-minute timeout. Moderators and trusted operators are exempt.
- **Community:** suggestions, private reports sent to a configured staff channel, and formatted announcements.
- **Utilities and fun:** help, ping, server/member/user/role/channel details, avatar, invite, coin flip, dice roll, choice picker, and 8-ball.
- **Automatic join role:** every new member is automatically given role ID `1561292551066230785`. The bot needs Manage Roles, and its highest role must sit above that role. This works even when welcome messages are disabled.
- **Optional welcome posts:** configure a welcome channel.
- **Quiet in regular chat:** normal messages receive no response. AutoMod checks message content for blocked words and user mentions only.

## Setup

### 1. Requirements

- Node.js 20.11 or newer
- A Discord application/bot: https://discord.com/developers/applications

### 2. Get the project and install packages

~~~bash
git clone https://github.com/Veyrix73/Poga-and-Eko-Bot.git
cd Poga-and-Eko-Bot
npm install
~~~

### 3. Configure the bot

Copy .env.example to a file named .env, then add the values from your application:

~~~env
DISCORD_TOKEN=your_real_bot_token
DISCORD_CLIENT_ID=your_application_id
DISCORD_GUILD_ID=your_test_server_id
TIMEZONE=Europe/Riga
WELCOME_CHANNEL_ID=
SUGGESTIONS_CHANNEL_ID=
REPORT_CHANNEL_ID=
BAD_WORDS=
DATA_DIR=data
~~~

Windows Command Prompt can copy the example with:

~~~bat
copy .env.example .env
~~~

- DISCORD_TOKEN: Developer Portal → Bot → token.
- DISCORD_CLIENT_ID: Developer Portal → General Information → Application ID.
- DISCORD_GUILD_ID: optional server ID for quick testing. Leave blank to register commands globally.
- TIMEZONE: the default timezone for date/time inputs. It does not override viewer-local time display.
- WELCOME_CHANNEL_ID: optional channel for joins.
- SUGGESTIONS_CHANNEL_ID: optional suggestions channel. If blank, suggestions go into the channel where /suggest was used.
- REPORT_CHANNEL_ID: strongly recommended private moderator-only channel. Reports are sent there; configure the channel's permissions yourself.
- BAD_WORDS: optional comma-separated blocked-word list. If blank, the built-in English list is used; providing a list replaces the defaults.
- DATA_DIR: where warning and scheduled-stream JSON data is saved.

**Never commit or share .env or your bot token.** .env is ignored by Git. If a token is exposed, reset it in the Developer Portal.

### 4. Enable privileged intents

In the Discord Developer Portal, open Bot → Privileged Gateway Intents and enable **Server Members Intent** for the join welcome feature/member lookups and **Message Content Intent** for AutoMod. Save your settings. The bot also requests the Guild Messages intent in code.

### 5. Invite the bot

In OAuth2 → URL Generator, select bot and applications.commands. Grant only the permissions the bot needs for the channels and features you plan to use, such as View Channels, Send Messages, Embed Links, Read Message History, Add Reactions, Manage Messages, Kick Members, Ban Members, Moderate Members, Manage Channels, Manage Roles, and Manage Nicknames.

Place the bot's role **above the roles it may need to moderate or assign**, including role `1561292551066230785` so the automatic join role can be assigned. Grant the bot **Manage Roles**. For private reports, make the target channel accessible only to moderators and the bot.

### 6. Register commands and run

~~~bash
npm start
~~~

The npm start command now registers the slash commands with Discord before starting the bot. This keeps changed command options (including the new /warn fields) synced automatically. To sync them manually, run npm run deploy.

For a quick syntax check:

~~~bash
npm run check
~~~

The bot must stay running for scheduled reminders to be delivered. Use a host with persistent storage for DATA_DIR if you want scheduled-stream records to survive restarts or redeploys. Previously saved warning cases remain in warnings.json for the legacy /warnings and /unwarn commands; the updated /warn no longer writes to that file.

## Commands

### Community
- `/cancelstream` — legacy command to cancel an existing reminder if you know its ID; creating and listing stream reminders is no longer available.
- /suggest — post a suggestion with 👍/👎 reactions.
- /report — privately submit a member report to the configured reports channel.
- /announce — post a formatted server announcement; optional @here requires permission.

### Moderation
- /ban, /kick
- `/warn person reason time` — applies a timeout and DMs the reason. It does **not** save a warning case. Example: `time: 10m`. Accepted units: `s`, `m`, `h`, `d`, `w` (also full words); maximum 28 days.
- `/warnings`, `/unwarn` — still available for warning cases saved before this change.
- /timeout, /untimeout
- /clear, /slowmode, /lock, /unlock
- /nickname, /addrole, /removerole

Moderation commands require the appropriate Discord permissions for regular members. `/warn` requires Moderate Members permission and the bot needs the Discord **Moderate Members** permission, plus a role above the target member. Two trusted user IDs are allowlisted in the bot source and can use permission-gated commands: `1113854211428450335` and `1233409110049816620`. The allowlist also bypasses the invoking user's role-hierarchy check, but **the bot's own role must still be above the target member or role**, and Discord still enforces its own restrictions. Slash commands were made visible so the runtime allowlist can decide access; unauthorized users receive a permission error. Only older warning cases are stored in DATA_DIR/warnings.json.

### Utilities and fun
- /help, /ping, /about, /invite
- /serverinfo, /membercount, /userinfo, /avatar
- /roleinfo, /channelinfo
- /coinflip, /roll, /choose, /8ball

## Troubleshooting

- If commands don't appear, run npm run deploy again and ensure the bot was invited with both bot and applications.commands scopes.
- If a command fails, check the terminal output and make sure the bot role is high enough and its channel permissions are correct.
- If an older scheduled reminder doesn't post, keep the process online and confirm the bot can view and send messages to its saved destination channel.
- If the bot logs a disallowed-intent error, enable Server Members Intent in the Developer Portal.
