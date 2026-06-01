import { Wallet } from "ethers";
import { InlineKeyboard } from "grammy";
import { cfg } from "../lib/config.js";
import { canEncrypt, encryptSecret } from "../lib/crypto.js";
import { safeErr } from "../lib/log.js";
import { backMenu, mainMenu, safeEditOrReply, safeReply, settingsMenu, shortAddress, walletMenu } from "../lib/ui.js";
import { getNativeBalance, getQuote, getTokenPrice, submitSwap } from "../services/chain.js";
import { buildRiskSummary } from "../services/risk.js";
import {
  DEFAULT_SETTINGS,
  createSnipe,
  createTradeIntent,
  createWallet,
  getActiveWallet,
  getOrCreateUser,
  getTrade,
  listPositions,
  listSnipes,
  listWallets,
  updateSnipe,
  updateTrade,
  updateUserSettings
} from "../services/store.js";

const flowStore = new Map();
const locks = new Set();
let globalTrades = 0;
const GLOBAL_TRADE_CAP = 2;

function flowKey(ctx) {
  return String(ctx.from?.id || ctx.chat?.id || "unknown");
}

function setFlow(ctx, flow) {
  flowStore.set(flowKey(ctx), { ...flow, updatedAt: Date.now() });
}

function getFlow(ctx) {
  return flowStore.get(flowKey(ctx));
}

function clearFlow(ctx) {
  flowStore.delete(flowKey(ctx));
}

function parseArgs(ctx) {
  const text = ctx.message?.text || "";
  return text.split(/\s+/).slice(1).filter(Boolean);
}

function userId(ctx) {
  return String(ctx.from?.id || "unknown");
}

async function ensureUser(ctx) {
  return getOrCreateUser(ctx);
}

export async function showMain(ctx) {
  await ensureUser(ctx);
  return safeReply(
    ctx,
    "Trade safely from Telegram: manage a wallet, prepare confirmed buys/sells, arm snipes, check balances, and track basic PnL. No profits, fills, or snipes are guaranteed.",
    { reply_markup: mainMenu() }
  );
}

export async function showHelp(ctx) {
  const msg = [
    "Commands:",
    "/wallet create, import, or watch a wallet.",
    "/buy prepare a confirmed buy with quote and risk checks.",
    "/sell prepare a confirmed sell from a position or token.",
    "/snipe create a token snipe with amount, slippage, max buy, fee, TP and SL.",
    "/balance show native and known token balances.",
    "/positions show size, entry, value, and basic PnL.",
    "/settings edit trade defaults.",
    "Every trade is user-confirmed. Risky tokens, missing risk data, and low liquidity may be flagged. Trading is always risky."
  ].join("\n");
  return safeReply(ctx, msg, { reply_markup: mainMenu() });
}

export async function showWallet(ctx) {
  const user = await ensureUser(ctx);
  const active = await getActiveWallet(user.telegramUserId);
  const wallets = await listWallets(user.telegramUserId);
  const status = active
    ? `Active: ${shortAddress(active.publicAddress)} (${active.mode === "watch" ? "watch-only" : "signing"})`
    : "No active wallet yet.";
  return safeEditOrReply(ctx, `Wallet\n${status}\nWallets: ${wallets.length}\nPrivate keys are never shown here.`, { reply_markup: walletMenu() });
}

async function createManagedWallet(ctx) {
  const user = await ensureUser(ctx);
  if (!canEncrypt()) {
    return safeEditOrReply(ctx, "ENCRYPTION_KEY is missing, so create/import wallet mode is disabled. Use Connect Wallet for watch-only mode.", { reply_markup: walletMenu() });
  }
  const w = Wallet.createRandom();
  const wallet = await createWallet(user.telegramUserId, {
    publicAddress: w.address,
    encryptedSecret: encryptSecret(w.privateKey),
    mode: "managed",
    label: "Bot Wallet",
    chainId: cfg.CHAIN_ID
  });
  return safeEditOrReply(ctx, `Wallet created.\nAddress: ${wallet.publicAddress}\nFund only what you can risk. The bot stores the signing secret encrypted at rest.`, { reply_markup: walletMenu() });
}

async function startImportWallet(ctx) {
  if (!canEncrypt()) {
    return safeEditOrReply(ctx, "ENCRYPTION_KEY is missing, so imports are disabled. Use Connect Wallet for watch-only tracking.", { reply_markup: walletMenu() });
  }
  setFlow(ctx, { type: "importWallet" });
  return safeEditOrReply(ctx, "Import warning: only paste a key you can risk using with a bot. Send the private key now, or /cancel.");
}

async function startConnectWallet(ctx) {
  setFlow(ctx, { type: "connectWallet" });
  return safeEditOrReply(ctx, "Send the public wallet address to track. This is watch/connect mode and cannot trade without signing credentials.");
}

export async function showBalance(ctx) {
  const user = await ensureUser(ctx);
  const wallet = await getActiveWallet(user.telegramUserId);
  if (!wallet) return safeEditOrReply(ctx, "No wallet yet. Create, import, or connect one first.", { reply_markup: walletMenu() });
  const bal = await getNativeBalance(wallet.publicAddress);
  const note = bal.ok ? "" : "\nPartial result: RPC or balance API unavailable.";
  return safeEditOrReply(ctx, `Balance\nWallet: ${shortAddress(wallet.publicAddress)}\nNative: ${bal.balance} ${cfg.NATIVE_SYMBOL}${note}`, { reply_markup: mainMenu() });
}

export async function showPositions(ctx) {
  const user = await ensureUser(ctx);
  const positions = await listPositions(user.telegramUserId);
  if (!positions.length) return safeEditOrReply(ctx, "No tracked positions yet. Buys confirmed through the bot will appear here.", { reply_markup: mainMenu() });

  const lines = ["Positions"];
  for (const p of positions.slice(0, 10)) {
    const price = await getTokenPrice(p.tokenAddress);
    const currentValue = price.price && p.size ? Number(p.size) * price.price : null;
    const pnl = currentValue !== null && p.costBasis ? currentValue - Number(p.costBasis) : null;
    lines.push(`${p.symbol || "TOKEN"} ${shortAddress(p.tokenAddress)} size ${p.size || 0} avg ${p.averageEntryPrice || "n/a"} PnL ${pnl === null ? "partial" : pnl.toFixed(4)}`);
  }
  return safeEditOrReply(ctx, lines.join("\n"), { reply_markup: new InlineKeyboard().text("Refresh", "menu:positions").text("Sell", "menu:sell").row().text("Back", "menu:main") });
}

export async function showSettings(ctx) {
  const user = await ensureUser(ctx);
  const s = { ...DEFAULT_SETTINGS, ...(user.settings || {}) };
  const msg = [
    "Settings",
    `Default buy: ${s.defaultBuyAmount} ${cfg.NATIVE_SYMBOL}`,
    `Slippage: ${s.defaultSlippage}%`,
    `Max per trade: ${s.maxPercentPerTrade}%`,
    `Priority fee: ${s.priorityFee}`,
    `Big-buy confirm: ${s.bigBuyConfirmThreshold} ${cfg.NATIVE_SYMBOL}`,
    `TP/SL defaults: ${s.takeProfitPercent}% / ${s.stopLossPercent}%`
  ].join("\n");
  return safeEditOrReply(ctx, msg, { reply_markup: settingsMenu() });
}

export async function startBuy(ctx) {
  const args = parseArgs(ctx);
  const tokenAddress = args[0] || "";
  const amount = args[1] || "";
  if (tokenAddress && amount) {
    setFlow(ctx, { type: "buySlippage", tokenAddress, amount });
    return askBuySlippage(ctx);
  }
  setFlow(ctx, { type: "buyToken" });
  return safeReply(ctx, "Send the token contract/address to buy, or /cancel.");
}

export async function startSell(ctx) {
  const args = parseArgs(ctx);
  const tokenAddress = args[0] || "";
  const percent = args[1] || "";
  if (tokenAddress && percent) return prepareSell(ctx, { tokenAddress, percent });
  setFlow(ctx, { type: "sellToken" });
  return safeReply(ctx, "Send the token address to sell, or open /positions.");
}

export async function startSnipe(ctx) {
  const args = parseArgs(ctx);
  if (args[0]) {
    setFlow(ctx, { type: "snipeAmount", tokenAddress: args[0] });
    return safeReply(ctx, `Token: ${args[0]}\nSend buy amount in ${cfg.NATIVE_SYMBOL}.`);
  }
  setFlow(ctx, { type: "snipeToken" });
  return safeReply(ctx, "Send the token address or launch target to snipe, or /cancel.");
}

export async function listSnipeMenu(ctx) {
  const user = await ensureUser(ctx);
  const snipes = await listSnipes(user.telegramUserId, true);
  if (!snipes.length) return safeEditOrReply(ctx, "No snipes yet. Use /snipe to create one.", { reply_markup: mainMenu() });

  const kb = new InlineKeyboard();
  const lines = ["Snipes"];
  for (const s of snipes.slice(0, 8)) {
    lines.push(`${s.status}: ${shortAddress(s.tokenAddress)} amount ${s.amount} slip ${s.slippage}%`);
    kb.text(s.status === "paused" ? "Resume" : "Pause", `snipe:toggle:${s._id}`).text("Delete", `snipe:delete:${s._id}`).row();
  }
  kb.text("Back", "menu:main");
  return safeEditOrReply(ctx, lines.join("\n"), { reply_markup: kb });
}

async function askBuySlippage(ctx) {
  const flow = getFlow(ctx);
  const user = await ensureUser(ctx);
  const s = { ...DEFAULT_SETTINGS, ...(user.settings || {}) };
  setFlow(ctx, { ...flow, type: "buySlippage" });
  return safeReply(ctx, `Amount: ${flow.amount} ${cfg.NATIVE_SYMBOL}\nSend slippage %, or type ${s.defaultSlippage}.`);
}

async function prepareBuy(ctx, flow) {
  const user = await ensureUser(ctx);
  const wallet = await getActiveWallet(user.telegramUserId);
  if (!wallet) return safeReply(ctx, "No wallet selected. Open /wallet first.", { reply_markup: walletMenu() });

  const quote = await getQuote({ side: "buy", tokenAddress: flow.tokenAddress, amount: flow.amount, slippage: flow.slippage, walletAddress: wallet.publicAddress });
  const risk = await buildRiskSummary({ user, tokenAddress: flow.tokenAddress, amount: flow.amount, side: "buy" });
  const trade = await createTradeIntent({
    userId: user.telegramUserId,
    walletId: wallet._id,
    side: "buy",
    tokenAddress: flow.tokenAddress,
    amount: flow.amount,
    slippage: flow.slippage,
    priorityFee: flow.priorityFee || 0,
    estimatedOutput: quote.estimatedOutput,
    estimatedGas: quote.estimatedGas,
    status: risk.hardBlocks.length ? "blocked" : "pending_confirmation",
    riskFlags: risk.flags,
    requiresExtraConfirm: risk.requiresExtraConfirm
  });

  const lines = [
    "Confirm buy",
    `Token: ${flow.tokenAddress}`,
    `Amount: ${flow.amount} ${cfg.NATIVE_SYMBOL}`,
    `Estimated output: ${quote.estimatedOutput}`,
    `Slippage: ${flow.slippage}%`,
    `Estimated fee/gas: ${quote.estimatedGas}`,
    `Max per trade setting: ${risk.maxPercentPerTrade}%`,
    risk.liquidityWarning ? "Warning: liquidity is low or unknown." : "Liquidity: no warning returned.",
    risk.riskyWarning ? `Risk flags: ${risk.flags.join(", ")}` : "Risk: no warning returned."
  ];

  if (risk.hardBlocks.length) lines.push(`Blocked: ${risk.hardBlocks.join(", ")}`);

  const kb = new InlineKeyboard();
  if (!risk.hardBlocks.length) kb.text("Confirm", `trade:confirm:${trade._id}`).text("Cancel", `trade:cancel:${trade._id}`);
  kb.row().text("Back", "menu:main");

  clearFlow(ctx);
  return safeReply(ctx, lines.join("\n"), { reply_markup: kb });
}

async function prepareSell(ctx, input) {
  const user = await ensureUser(ctx);
  const wallet = await getActiveWallet(user.telegramUserId);
  if (!wallet) return safeReply(ctx, "No wallet selected. Open /wallet first.", { reply_markup: walletMenu() });

  const percent = String(input.percent || "100%").replace("%", "");
  const quote = await getQuote({ side: "sell", tokenAddress: input.tokenAddress, amount: percent, slippage: user.settings?.defaultSlippage || 1, walletAddress: wallet.publicAddress });
  const trade = await createTradeIntent({
    userId: user.telegramUserId,
    walletId: wallet._id,
    side: "sell",
    tokenAddress: input.tokenAddress,
    amount: `${percent}%`,
    slippage: user.settings?.defaultSlippage || 1,
    estimatedOutput: quote.estimatedOutput,
    estimatedGas: quote.estimatedGas,
    status: "pending_confirmation",
    riskFlags: quote.ok ? [] : ["Quote unavailable"]
  });

  const msg = [
    "Confirm sell",
    `Token: ${input.tokenAddress}`,
    `Amount: ${percent}%`,
    `Expected proceeds: ${quote.estimatedOutput}`,
    `Slippage: ${user.settings?.defaultSlippage || 1}%`,
    `Fees: ${quote.estimatedGas}`,
    "PnL estimate: partial until price API and tracked position data are available."
  ].join("\n");

  clearFlow(ctx);
  return safeReply(ctx, msg, { reply_markup: new InlineKeyboard().text("Confirm", `trade:confirm:${trade._id}`).text("Cancel", `trade:cancel:${trade._id}`).row().text("Back", "menu:main") });
}

async function confirmTrade(ctx, tradeId, extra = false) {
  const key = `${userId(ctx)}:${tradeId}`;
  if (locks.has(key)) return safeEditOrReply(ctx, "I’m already working on that trade.");
  if (globalTrades >= GLOBAL_TRADE_CAP) return safeEditOrReply(ctx, "Busy right now. Try again in a moment.");

  locks.add(key);
  globalTrades += 1;
  try {
    const trade = await getTrade(tradeId, userId(ctx));
    if (!trade) return safeEditOrReply(ctx, "Trade expired or not found.");
    if (trade.status !== "pending_confirmation") return safeEditOrReply(ctx, "This trade is no longer pending.");
    if (trade.requiresExtraConfirm && !extra) {
      return safeEditOrReply(ctx, "Extra confirmation required because this trade is large or risk-flagged.", { reply_markup: new InlineKeyboard().text("Confirm Risk", `trade:confirm2:${trade._id}`).text("Cancel", `trade:cancel:${trade._id}`) });
    }

    const wallet = await getActiveWallet(trade.userId);
    const result = await submitSwap({ trade, wallet });
    if (!result.ok) {
      await updateTrade(trade._id, { status: result.gated ? "gated" : "failed", failureReason: result.error });
      return safeEditOrReply(ctx, result.error || "Trade failed before submission.", { reply_markup: mainMenu() });
    }

    await updateTrade(trade._id, { status: "submitted", transactionHash: result.txHash || "" });
    return safeEditOrReply(ctx, "Trade submitted. Track confirmation before relying on the balance.", { reply_markup: mainMenu() });
  } catch (err) {
    console.error("[trade] confirm failed", { tradeId, error: safeErr(err) });
    return safeEditOrReply(ctx, "Trade failed safely. Try again later.", { reply_markup: mainMenu() });
  } finally {
    locks.delete(key);
    globalTrades -= 1;
  }
}

async function handleFlowText(ctx) {
  const flow = getFlow(ctx);
  if (!flow) return;
  const text = (ctx.message?.text || "").trim();
  if (!text || text.startsWith("/")) return;

  try {
    if (flow.type === "importWallet") {
      const user = await ensureUser(ctx);
      let wallet;
      try {
        wallet = new Wallet(text);
      } catch {
        return safeReply(ctx, "That private key was not valid. Send a valid key or /cancel.");
      }
      await createWallet(user.telegramUserId, {
        publicAddress: wallet.address,
        encryptedSecret: encryptSecret(text),
        mode: "managed",
        label: "Imported Wallet",
        chainId: cfg.CHAIN_ID
      });
      clearFlow(ctx);
      try { await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id); } catch {}
      return safeReply(ctx, `Wallet imported.\nAddress: ${wallet.address}\nKeep this wallet funded only with funds you can risk.`, { reply_markup: walletMenu() });
    }

    if (flow.type === "connectWallet") {
      const user = await ensureUser(ctx);
      if (!/^0x[a-fA-F0-9]{40}$/.test(text)) return safeReply(ctx, "Send a valid public address, or /cancel.");
      await createWallet(user.telegramUserId, { publicAddress: text, mode: "watch", label: "Watch Wallet", chainId: cfg.CHAIN_ID });
      clearFlow(ctx);
      return safeReply(ctx, "Wallet connected in watch-only mode. Trading is disabled for this wallet because the bot cannot sign.", { reply_markup: walletMenu() });
    }

    if (flow.type === "buyToken") {
      setFlow(ctx, { type: "buyAmount", tokenAddress: text });
      return safeReply(ctx, `Token: ${text}\nSend buy amount in ${cfg.NATIVE_SYMBOL}.`);
    }

    if (flow.type === "buyAmount") {
      setFlow(ctx, { ...flow, type: "buySlippage", amount: text });
      return askBuySlippage(ctx);
    }

    if (flow.type === "buySlippage") {
      setFlow(ctx, { ...flow, type: "buyPriority", slippage: Number(text) || 1 });
      return safeReply(ctx, "Optional priority fee. Send a number, or 0.");
    }

    if (flow.type === "buyPriority") {
      return prepareBuy(ctx, { ...flow, priorityFee: Number(text) || 0 });
    }

    if (flow.type === "sellToken") {
      setFlow(ctx, { type: "sellPercent", tokenAddress: text });
      return safeReply(ctx, "Sell how much? Use 25%, 50%, 75%, 100%, or a custom percent.");
    }

    if (flow.type === "sellPercent") {
      return prepareSell(ctx, { tokenAddress: flow.tokenAddress, percent: text });
    }

    if (flow.type === "snipeToken") {
      setFlow(ctx, { type: "snipeAmount", tokenAddress: text });
      return safeReply(ctx, `Token: ${text}\nSend buy amount in ${cfg.NATIVE_SYMBOL}.`);
    }

    if (flow.type === "snipeAmount") {
      setFlow(ctx, { ...flow, type: "snipeSlippage", amount: text });
      return safeReply(ctx, "Send slippage % for this snipe.");
    }

    if (flow.type === "snipeSlippage") {
      setFlow(ctx, { ...flow, type: "snipeMaxBuy", slippage: Number(text) || 1 });
      return safeReply(ctx, `Send max buy in ${cfg.NATIVE_SYMBOL}.`);
    }

    if (flow.type === "snipeMaxBuy") {
      setFlow(ctx, { ...flow, type: "snipePriority", maxBuy: text });
      return safeReply(ctx, "Send priority fee, or 0.");
    }

    if (flow.type === "snipePriority") {
      setFlow(ctx, { ...flow, type: "snipeTp", priorityFee: Number(text) || 0 });
      return safeReply(ctx, "Optional take-profit %. Send a number, or 0 to skip.");
    }

    if (flow.type === "snipeTp") {
      setFlow(ctx, { ...flow, type: "snipeSl", takeProfitPercent: Number(text) || 0 });
      return safeReply(ctx, "Optional stop-loss %. Send a number, or 0 to skip.");
    }

    if (flow.type === "snipeSl") {
      const user = await ensureUser(ctx);
      const wallet = await getActiveWallet(user.telegramUserId);
      const snipe = await createSnipe({
        userId: user.telegramUserId,
        walletId: wallet?._id || "",
        tokenAddress: flow.tokenAddress,
        amount: flow.amount,
        slippage: flow.slippage,
        maxBuy: flow.maxBuy,
        priorityFee: flow.priorityFee,
        takeProfitPercent: flow.takeProfitPercent,
        stopLossPercent: Number(text) || 0,
        status: "active"
      });
      clearFlow(ctx);
      return safeReply(ctx, `Snipe armed.\nToken: ${snipe.tokenAddress}\nAmount: ${snipe.amount}\nNo successful fill is guaranteed.`, { reply_markup: new InlineKeyboard().text("Snipes", "menu:snipes").text("Back", "menu:main") });
    }
  } catch (err) {
    console.error("[flow] failed", { type: flow.type, error: safeErr(err) });
    clearFlow(ctx);
    return safeReply(ctx, "That flow failed safely. Please try again.", { reply_markup: mainMenu() });
  }
}

async function updateSetting(ctx, key) {
  const user = await ensureUser(ctx);
  const s = { ...DEFAULT_SETTINGS, ...(user.settings || {}) };
  const patches = {
    slippage: { defaultSlippage: s.defaultSlippage >= 5 ? 1 : s.defaultSlippage + 0.5 },
    buyAmount: { defaultBuyAmount: Number((s.defaultBuyAmount + 0.05).toFixed(4)) },
    maxPercent: { maxPercentPerTrade: s.maxPercentPerTrade >= 50 ? 10 : s.maxPercentPerTrade + 5 },
    priorityFee: { priorityFee: Number((s.priorityFee + 0.001).toFixed(4)) },
    bigBuy: { bigBuyConfirmThreshold: Number((s.bigBuyConfirmThreshold + 0.5).toFixed(4)) },
    tpsl: { takeProfitPercent: s.takeProfitPercent >= 100 ? 25 : s.takeProfitPercent + 25, stopLossPercent: s.stopLossPercent >= 50 ? 10 : s.stopLossPercent + 5 }
  };
  await updateUserSettings(user.telegramUserId, patches[key] || {});
  return showSettings(ctx);
}

export function registerTradingFeature(bot) {
  bot.callbackQuery(/^menu:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const name = ctx.match[1];
    if (name === "main") return safeEditOrReply(ctx, "Main menu", { reply_markup: mainMenu() });
    if (name === "help") return showHelp(ctx);
    if (name === "wallet") return showWallet(ctx);
    if (name === "buy") return startBuy(ctx);
    if (name === "sell") return startSell(ctx);
    if (name === "snipe") return startSnipe(ctx);
    if (name === "snipes") return listSnipeMenu(ctx);
    if (name === "balance") return showBalance(ctx);
    if (name === "positions") return showPositions(ctx);
    if (name === "settings") return showSettings(ctx);
    return safeEditOrReply(ctx, "Unknown menu.", { reply_markup: mainMenu() });
  });

  bot.callbackQuery(/^wallet:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const action = ctx.match[1];
    if (action === "create") return createManagedWallet(ctx);
    if (action === "import") return startImportWallet(ctx);
    if (action === "connect") return startConnectWallet(ctx);
    if (action === "export_info") return safeEditOrReply(ctx, "Export warning: this bot will not print private keys in chat. Keep backups outside Telegram and never share secrets.", { reply_markup: walletMenu() });
    return showWallet(ctx);
  });

  bot.callbackQuery(/^trade:(confirm2|confirm|cancel):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const action = ctx.match[1];
    const tradeId = ctx.match[2];
    if (action === "cancel") {
      await updateTrade(tradeId, { status: "cancelled" });
      return safeEditOrReply(ctx, "Trade cancelled.", { reply_markup: mainMenu() });
    }
    return confirmTrade(ctx, tradeId, action === "confirm2");
  });

  bot.callbackQuery(/^settings:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    return updateSetting(ctx, ctx.match[1]);
  });

  bot.callbackQuery(/^snipe:(toggle|delete):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const action = ctx.match[1];
    const id = ctx.match[2];
    if (action === "delete") await updateSnipe(id, { status: "deleted" });
    if (action === "toggle") {
      const all = await listSnipes(userId(ctx), true);
      const found = all.find((s) => s._id === id);
      await updateSnipe(id, { status: found?.status === "paused" ? "active" : "paused" });
    }
    return listSnipeMenu(ctx);
  });

  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message?.text || "";
    if (text.startsWith("/")) return next();
    if (!getFlow(ctx)) return next();
    return handleFlowText(ctx);
  });
}

export function cancelFlow(ctx) {
  clearFlow(ctx);
  return safeReply(ctx, "Cancelled.", { reply_markup: mainMenu() });
}
