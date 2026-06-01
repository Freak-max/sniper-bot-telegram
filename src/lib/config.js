export const cfg = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  MONGODB_URI: process.env.MONGODB_URI || "",
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || "",
  CHAIN_RPC_URL: process.env.CHAIN_RPC_URL || "",
  CHAIN_ID: Number(process.env.CHAIN_ID || 1),
  NATIVE_SYMBOL: process.env.NATIVE_SYMBOL || "ETH",
  DEX_AGGREGATOR_API_URL: process.env.DEX_AGGREGATOR_API_URL || "",
  BLOCK_EXPLORER_URL: process.env.BLOCK_EXPLORER_URL || "",
  PRICE_API_URL: process.env.PRICE_API_URL || "",
  SNIPE_POLL_MS: Number(process.env.SNIPE_POLL_MS || 15000)
};

export function logEnvSanity() {
  console.log("[boot] config", {
    TELEGRAM_BOT_TOKEN_set: Boolean(cfg.TELEGRAM_BOT_TOKEN),
    MONGODB_URI_set: Boolean(cfg.MONGODB_URI),
    ENCRYPTION_KEY_set: Boolean(cfg.ENCRYPTION_KEY),
    CHAIN_RPC_URL_set: Boolean(cfg.CHAIN_RPC_URL),
    CHAIN_ID_set: Number.isFinite(cfg.CHAIN_ID),
    NATIVE_SYMBOL_set: Boolean(cfg.NATIVE_SYMBOL),
    DEX_AGGREGATOR_API_URL_set: Boolean(cfg.DEX_AGGREGATOR_API_URL),
    BLOCK_EXPLORER_URL_set: Boolean(cfg.BLOCK_EXPLORER_URL),
    PRICE_API_URL_set: Boolean(cfg.PRICE_API_URL)
  });

  if (!cfg.MONGODB_URI) {
    console.warn("[db] MONGODB_URI missing. Bot will use in-memory fallback; data will not survive restart.");
  }

  if (!cfg.ENCRYPTION_KEY) {
    console.warn("[wallet] ENCRYPTION_KEY missing. Create/import wallet mode is disabled; watch/connect mode still works.");
  }
}
