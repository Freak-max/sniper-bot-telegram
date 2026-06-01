export function buildBotProfile() {
  return [
    "Purpose: Telegram trading and sniper bot for wallet setup, confirmed token buys/sells, snipes, balances, settings, and position tracking with basic PnL.",
    "Public commands: /start main menu, /help safety help, /wallet wallet menu, /buy confirmed buy flow, /sell confirmed sell flow, /snipe create snipe, /snipes manage snipes, /balance balances, /positions PnL, /settings defaults, /cancel cancel flow.",
    "Rules: all trades require user confirmation, big or risky trades require extra confirmation, wallet secrets are encrypted at rest when ENCRYPTION_KEY is set, connect mode is watch-only, group chats only respond to explicit commands, no profit/fill/snipe success is guaranteed."
  ].join(" ");
}

export const BOT_PROFILE = buildBotProfile();
