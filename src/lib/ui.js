import { InlineKeyboard } from "grammy";
import { cfg } from "./config.js";
import { safeErr } from "./log.js";

export function mainMenu() {
  return new InlineKeyboard()
    .text("Wallet", "menu:wallet").text("Buy", "menu:buy")
    .row().text("Sell", "menu:sell").text("Snipe", "menu:snipe")
    .row().text("Balance", "menu:balance").text("Positions", "menu:positions")
    .row().text("Settings", "menu:settings").text("Help", "menu:help");
}

export function walletMenu() {
  return new InlineKeyboard()
    .text("Create Wallet", "wallet:create").text("Import Wallet", "wallet:import")
    .row().text("Connect Wallet", "wallet:connect").text("Export Info", "wallet:export_info")
    .row().text("Back", "menu:main");
}

export function settingsMenu() {
  return new InlineKeyboard()
    .text("Slippage", "settings:slippage").text("Buy Amount", "settings:buyAmount")
    .row().text("Max % Trade", "settings:maxPercent").text("Priority Fee", "settings:priorityFee")
    .row().text("Big Buy Limit", "settings:bigBuy").text("TP/SL", "settings:tpsl")
    .row().text("Back", "menu:main");
}

export function backMenu() {
  return new InlineKeyboard().text("Back", "menu:main");
}

export function explorerLink(txHash) {
  const base = (cfg.BLOCK_EXPLORER_URL || "").replace(/\/+$/, "");
  return base && txHash ? `${base}/tx/${txHash}` : "";
}

export async function safeReply(ctx, text, options = {}) {
  try {
    return await ctx.reply(text, options);
  } catch (err) {
    console.warn("[telegram] send failed, using text fallback", { error: safeErr(err) });
    try {
      return await ctx.reply(String(text || "Action failed."));
    } catch (fallbackErr) {
      console.error("[telegram] text fallback failed", { error: safeErr(fallbackErr) });
      return null;
    }
  }
}

export async function safeEditOrReply(ctx, text, options = {}) {
  try {
    if (ctx.callbackQuery?.message) {
      return await ctx.editMessageText(text, options);
    }
  } catch (err) {
    console.warn("[telegram] edit failed, using reply fallback", { error: safeErr(err) });
  }
  return safeReply(ctx, text, options);
}

export function shortAddress(address) {
  const s = String(address || "");
  if (s.length <= 14) return s || "not set";
  return `${s.slice(0, 8)}...${s.slice(-6)}`;
}
