Sniper Trade Bot

What it does
This is a Telegram-only trading and sniper bot. It helps users create, import, or connect a wallet, prepare token buys and sells, configure snipes, check balances, manage settings, and track positions with basic PnL.

It does not guarantee profits, fills, token safety, execution price, or successful snipes. Every trade requires user confirmation. Large or risk-flagged trades require an extra confirmation.

Commands
/start
Opens the main menu with Wallet, Buy, Sell, Snipe, Balance, Positions, Settings, and Help.

/help
Shows commands and safety notes.

/wallet
Shows wallet status. Buttons include Create Wallet, Import Wallet, Connect Wallet, Export Info, and Back. Create/import require ENCRYPTION_KEY. Connect Wallet is watch-only and cannot trade.

/buy
Starts a buy flow. The bot asks for token address, amount, slippage, and priority fee. It requests a quote when DEX_AGGREGATOR_API_URL is configured, runs risk checks, shows a confirmation summary, and requires Confirm or Cancel.

/sell
Starts a sell flow. The bot accepts a token address and sell percentage, then shows expected proceeds, slippage, fees, and PnL status before confirmation.

/snipe
Creates a snipe target with token address, amount, slippage, max buy, priority fee, and optional take-profit and stop-loss values.

/snipes
Lists active and paused snipes. Users can pause, resume, or delete snipes.

/balance
Shows native balance for the active wallet when CHAIN_RPC_URL is configured. If RPC is unavailable, it shows a partial result instead of crashing.

/positions
Lists tracked positions with symbol or address, size, average entry, estimated value when price data is available, and basic PnL.

/settings
Shows user defaults for max percent per trade, slippage, default buy amount, priority fee, big-buy threshold, and TP/SL defaults.

/cancel
Cancels the current interactive flow.

Environment variables
TELEGRAM_BOT_TOKEN
Required. Telegram bot token used by grammY.

MONGODB_URI
Recommended and expected for production. Stores users, wallets, trades, positions, snipes, and settings. If missing, the bot uses an in-memory fallback and logs a warning.

ENCRYPTION_KEY
Required for create/import wallet mode. Used to encrypt wallet secrets at rest with AES-256-GCM. If missing, signing wallet creation/import is disabled and watch-only connect mode still works.

CHAIN_RPC_URL
Optional but required for live balance checks and chain interaction.

CHAIN_ID
Chain id. Defaults to 1.

NATIVE_SYMBOL
Native chain symbol shown in menus. Defaults to ETH.

DEX_AGGREGATOR_API_URL
Optional. Used for quote, risk, liquidity, and future swap routes. If missing, live trading is gated and the bot still supports menus, settings, watch-only wallets, snipes, and partial data.

BLOCK_EXPLORER_URL
Optional. Used for transaction links when available.

PRICE_API_URL
Optional. Used for position price and PnL estimates. If missing, PnL is shown as partial.

SNIPE_POLL_MS
Optional. Snipe polling interval. Defaults to 15000 ms.

Wallet security model
Bot-managed wallets store encrypted private keys only. Secrets are encrypted before MongoDB persistence and are never logged. The bot does not print private keys back to chat. Import flow warns users to only use wallets they can risk using with a bot.

Connect Wallet stores only a public address. It is watch-only and cannot trade because the bot cannot sign transactions.

MongoDB collections
users: Telegram id, active wallet id, settings, createdAt, updatedAt.
wallets: user id, encrypted secret when applicable, public address, wallet mode, label, createdAt, updatedAt.
positions: user id, wallet id, token address, size, average entry, cost basis, realized PnL, createdAt, updatedAt.
trades: user id, wallet id, side, token address, amount, estimated output, transaction hash, status, risk flags, createdAt, updatedAt.
snipes: user id, wallet id, token address, amount, slippage, max buy, priority fee, TP/SL settings, status, last check metadata, createdAt, updatedAt.

MongoDB update safety
The code keeps createdAt insert-only. Updates set updatedAt only in mutable fields and remove _id and createdAt before $set updates.

Runtime and deployment
The bot runs as one Node.js process. Telegram polling uses @grammyjs/runner with concurrency 1. Before polling starts, the bot clears any webhook with drop_pending_updates. Snipe monitoring runs inside the same process using one safe async loop.

Setup
1) Install dependencies with npm install.
2) Copy .env.sample to .env.
3) Set TELEGRAM_BOT_TOKEN.
4) Set MONGODB_URI and ENCRYPTION_KEY for production.
5) Add CHAIN_RPC_URL, DEX_AGGREGATOR_API_URL, PRICE_API_URL, and BLOCK_EXPLORER_URL as they become available.
6) Run npm run dev locally or npm start in production.

Render deployment
Use one Web Service or Worker-style service running npm start. Set TELEGRAM_BOT_TOKEN at minimum. For production persistence and wallet support, also set MONGODB_URI and ENCRYPTION_KEY.

Diagnostics
Startup logs print only booleans for env sanity. API/RPC calls log start, success, and failure without secrets. MongoDB connection and critical read/write failures include collection and operation names. Snipe polling logs startup, each cycle, and failures.
