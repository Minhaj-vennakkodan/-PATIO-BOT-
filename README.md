# PATIO BOT

A production-ready Discord community management bot built with Node.js, TypeScript, and discord.js.

## Requirements
- Node.js (v18 or higher)
- npm (Node Package Manager)

## Project Structure
```
src/
├── commands/     # Slash commands
├── config/       # Environment & general configuration
├── database/     # Prisma client & database utilities
├── events/       # Discord event listeners
├── handlers/     # Loaders for commands and events
├── types/        # TypeScript interfaces and types
├── utils/        # Utilities like Logger and Permissions
└── index.ts      # Bot entry point
```

## Installation
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up your `.env` file (see below)
4. Initialize the database:
   ```bash
   npm run db:generate
   npm run db:push
   ```

## Environment Variables
Copy `.env.example` to `.env` and fill in the values:
```env
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_client_id_here
DATABASE_URL="file:./dev.db"
```

## Running the Bot
**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm run build
npm start
```

## How to add a Command
1. Create a new `.ts` file in `src/commands/`.
2. Export a default object conforming to the `Command` interface.
3. The bot will automatically discover and load it.

## How to add an Event
1. Create a new `.ts` file in `src/events/`.
2. Export a default object conforming to the `BotEvent` interface.
3. The bot will automatically attach the event listener.
