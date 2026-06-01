Sniper Trade Bot

A Telegram-only trading and sniper bot built with Node.js ES modules, grammY, @grammyjs/runner, and MongoDB.

Features
1) Telegram menus with short replies and inline buttons.
2) Wallet create, import, and watch-only connect flows.
3) Encrypted wallet secret storage with ENCRYPTION_KEY.
4) Confirmed buy and sell flows with quote, slippage, fee, liquidity, and risk summaries.
5) Extra confirmation for big or risk-flagged trades.
6) Snipe creation and safe in-process polling.
7) Balance and position views with graceful partial data when APIs are missing.
8) User settings for trade defaults and risk limits.

Architecture
The service runs as one Node.js process.

src/index.js starts the bot, clears Telegram webhooks, starts long polling, and starts the snipe monitor.
src/bot.js creates the grammY bot and middleware.
src/commands contains public command modules.
src/features/trading.js contains menus, flows, callbacks, and confirmations.
src/services contains MongoDB data access, chain/API integrations, risk checks, and snipe monitoring.
src/lib contains config, logging, encryption, UI helpers, and database setup.

Setup
Prerequisites:
Node.js 18 or newer.
A Telegram bot token from BotFather.
MongoDB for production persistence.

Install:
npm install

Configure:
Copy .env.sample to .env and set values.

Required for boot:
TELEGRAM_BOT_TOKEN

Required for production data:
MONGODB_URI

Required for create/import wallet mode:
ENCRYPTION_KEY

Optional integrations:
CHAIN_RPC_URL
CHAIN_ID
NATIVE_SYMBOL
DEX_AGGREGATOR_API_URL
BLOCK_EXPLORER_URL
PRICE_API_URL
SNIPE_POLL_MS

Run locally:
npm run dev

Start production:
npm start

Build command:
npm run build

Commands
/start
Expected output: short intro and the main menu.

/help
Expected output: command list and safety notes.

/wallet
Expected output: active wallet status and wallet action buttons.

/buy
Example: /buy 0xTokenAddress 0.05
Expected output: quote and risk confirmation summary when data is available.

/sell
Example: /sell 0xTokenAddress 50%
Expected output: sell confirmation summary.

/snipe
Example: /snipe 0xTokenAddress
Expected output: guided setup for amount, slippage, max buy, priority fee, take-profit, and stop-loss.

/snipes
Expected output: active or paused snipes with quick actions.

/balance
Expected output: native balance if CHAIN_RPC_URL is configured, otherwise a partial result.

/positions
Expected output: tracked positions and basic PnL when price data is available.

/settings
Expected output: default buy amount, slippage, max percent per trade, fee, and TP/SL settings.

/cancel
Expected output: cancels the active flow.

Integrations
Telegram Bot API through grammY.
MongoDB for users, wallets, positions, trades, and snipes.
CHAIN_RPC_URL for RPC balance checks.
DEX_AGGREGATOR_API_URL for quote and risk endpoints.
PRICE_API_URL for token price and PnL estimates.
BLOCK_EXPLORER_URL for transaction links when transaction hashes are available.

API behavior
When an optional API is missing or unavailable, the bot gates live trading or shows partial data instead of crashing. Logs include feature, provider, success, failure, and safe error details without secrets.

Database
Collections:
users, wallets, positions, trades, snipes.

Indexes:
users.telegramUserId unique.
wallets userId and createdAt.
positions userId, walletId, tokenAddress.
trades userId and createdAt.
snipes status and updatedAt.
settings userId unique.

No custom _id index is created.

Deployment
Use a single Node.js service. Set the start command to npm start and build command to npm run build. On Render, set environment variables in the service dashboard. The bot defaults to long polling and clears webhooks before polling.

Troubleshooting
If the bot exits on startup, check TELEGRAM_BOT_TOKEN.
If wallet create/import is disabled, set ENCRYPTION_KEY.
If data disappears after restart, set MONGODB_URI.
If balance shows partial data, set CHAIN_RPC_URL.
If quotes and risk checks are unavailable, set DEX_AGGREGATOR_API_URL.
If positions show partial PnL, set PRICE_API_URL.
If Telegram reports polling conflicts during deploy overlap, the bot logs the conflict and retries with backoff.

Extending
Add new public commands under src/commands and export a default register(bot) function. Add business logic under src/features or src/services. Keep secrets out of logs and use safe MongoDB update patterns.
