import { ObjectId } from "mongodb";
import { getDb, stripImmutable } from "../lib/db.js";
import { safeErr } from "../lib/log.js";

const memory = {
  users: new Map(),
  wallets: new Map(),
  positions: new Map(),
  trades: new Map(),
  snipes: new Map()
};

export const DEFAULT_SETTINGS = {
  maxPercentPerTrade: 20,
  defaultSlippage: 1,
  defaultBuyAmount: 0.05,
  priorityFee: 0,
  bigBuyConfirmThreshold: 1,
  takeProfitPercent: 50,
  stopLossPercent: 20,
  riskWarnings: true
};

function id() {
  return new ObjectId().toString();
}

function userIdFromCtx(ctx) {
  return String(ctx.from?.id || "unknown");
}

export async function getOrCreateUser(ctx) {
  const telegramUserId = userIdFromCtx(ctx);
  const now = new Date();
  const mutable = stripImmutable({
    username: ctx.from?.username || "",
    firstName: ctx.from?.first_name || "",
    updatedAt: now
  });

  const db = getDb();
  if (!db) {
    const existing = memory.users.get(telegramUserId) || {
      _id: telegramUserId,
      telegramUserId,
      activeWalletId: "",
      settings: { ...DEFAULT_SETTINGS },
      createdAt: now
    };
    const next = { ...existing, ...mutable };
    memory.users.set(telegramUserId, next);
    return next;
  }

  try {
    await db.collection("users").updateOne(
      { telegramUserId },
      {
        $setOnInsert: {
          telegramUserId,
          activeWalletId: "",
          settings: { ...DEFAULT_SETTINGS },
          createdAt: now
        },
        $set: mutable
      },
      { upsert: true }
    );
    return await db.collection("users").findOne({ telegramUserId });
  } catch (err) {
    console.error("[db] write failed", { collection: "users", operation: "upsert", error: safeErr(err) });
    throw err;
  }
}

export async function updateUserSettings(userId, patch) {
  const now = new Date();
  const clean = stripImmutable(patch);
  const user = await getUserById(userId);
  const settings = { ...(user?.settings || DEFAULT_SETTINGS), ...clean };

  const db = getDb();
  if (!db) {
    memory.users.set(String(userId), { ...(user || {}), settings, updatedAt: now });
    return settings;
  }

  try {
    await db.collection("users").updateOne(
      { telegramUserId: String(userId) },
      { $set: { settings, updatedAt: now } }
    );
    return settings;
  } catch (err) {
    console.error("[db] write failed", { collection: "users", operation: "updateSettings", error: safeErr(err) });
    throw err;
  }
}

export async function getUserById(userId) {
  const db = getDb();
  if (!db) return memory.users.get(String(userId)) || null;
  try {
    return await db.collection("users").findOne({ telegramUserId: String(userId) });
  } catch (err) {
    console.error("[db] read failed", { collection: "users", operation: "findOne", error: safeErr(err) });
    return null;
  }
}

export async function createWallet(userId, wallet) {
  const now = new Date();
  const doc = {
    _id: id(),
    userId: String(userId),
    publicAddress: wallet.publicAddress,
    encryptedSecret: wallet.encryptedSecret || null,
    mode: wallet.mode,
    label: wallet.label || "Wallet",
    chainId: wallet.chainId,
    updatedAt: now
  };

  const db = getDb();
  if (!db) {
    memory.wallets.set(doc._id, doc);
    const user = memory.users.get(String(userId)) || { telegramUserId: String(userId), settings: { ...DEFAULT_SETTINGS }, createdAt: now };
    memory.users.set(String(userId), { ...user, activeWalletId: doc._id, updatedAt: now });
    return doc;
  }

  try {
    await db.collection("wallets").insertOne(doc);
    await db.collection("users").updateOne(
      { telegramUserId: String(userId) },
      { $set: { activeWalletId: doc._id, updatedAt: now } }
    );
    return doc;
  } catch (err) {
    console.error("[db] write failed", { collection: "wallets", operation: "insertOne", error: safeErr(err) });
    throw err;
  }
}

export async function listWallets(userId) {
  const db = getDb();
  if (!db) return [...memory.wallets.values()].filter((w) => w.userId === String(userId));
  try {
    return await db.collection("wallets").find({ userId: String(userId) }).sort({ }).toArray();
  } catch (err) {
    console.error("[db] read failed", { collection: "wallets", operation: "find", error: safeErr(err) });
    return [];
  }
}

export async function getActiveWallet(userId) {
  const user = await getUserById(userId);
  if (!user?.activeWalletId) return null;
  const db = getDb();
  if (!db) return memory.wallets.get(String(user.activeWalletId)) || null;
  try {
    return await db.collection("wallets").findOne({ _id: String(user.activeWalletId), userId: String(userId) });
  } catch (err) {
    console.error("[db] read failed", { collection: "wallets", operation: "findOne", error: safeErr(err) });
    return null;
  }
}

export async function createTradeIntent(doc) {
  const now = new Date();
  const trade = { _id: id(), ...stripImmutable(doc), createdAt: now, updatedAt: now };
  const db = getDb();
  if (!db) {
    memory.trades.set(trade._id, trade);
    return trade;
  }
  try {
    await db.collection("trades").insertOne(trade);
    return trade;
  } catch (err) {
    console.error("[db] write failed", { collection: "trades", operation: "insertOne", error: safeErr(err) });
    throw err;
  }
}

export async function getTrade(tradeId, userId) {
  const db = getDb();
  if (!db) {
    const t = memory.trades.get(String(tradeId));
    return t?.userId === String(userId) ? t : null;
  }
  try {
    return await db.collection("trades").findOne({ _id: String(tradeId), userId: String(userId) });
  } catch (err) {
    console.error("[db] read failed", { collection: "trades", operation: "findOne", error: safeErr(err) });
    return null;
  }
}

export async function updateTrade(tradeId, patch) {
  const now = new Date();
  const clean = stripImmutable({ ...patch, updatedAt: now });
  const db = getDb();
  if (!db) {
    const prev = memory.trades.get(String(tradeId)) || {};
    const next = { ...prev, ...clean };
    memory.trades.set(String(tradeId), next);
    return next;
  }
  try {
    await db.collection("trades").updateOne({ _id: String(tradeId) }, { $set: clean });
    return await db.collection("trades").findOne({ _id: String(tradeId) });
  } catch (err) {
    console.error("[db] write failed", { collection: "trades", operation: "updateOne", error: safeErr(err) });
    throw err;
  }
}

export async function listPositions(userId) {
  const db = getDb();
  if (!db) return [...memory.positions.values()].filter((p) => p.userId === String(userId));
  try {
    return await db.collection("positions").find({ userId: String(userId), status: { $ne: "closed" } }).sort({ updatedAt: -1 }).toArray();
  } catch (err) {
    console.error("[db] read failed", { collection: "positions", operation: "find", error: safeErr(err) });
    return [];
  }
}

export async function upsertPosition(position) {
  const now = new Date();
  const filter = {
    userId: String(position.userId),
    walletId: String(position.walletId || ""),
    tokenAddress: String(position.tokenAddress || "").toLowerCase()
  };
  const mutable = stripImmutable({ ...position, ...filter, updatedAt: now });
  const key = `${filter.userId}:${filter.walletId}:${filter.tokenAddress}`;
  const db = getDb();
  if (!db) {
    const prev = memory.positions.get(key) || { _id: id(), createdAt: now };
    const next = { ...prev, ...mutable };
    memory.positions.set(key, next);
    return next;
  }
  try {
    await db.collection("positions").updateOne(
      filter,
      { $setOnInsert: { _id: id(), createdAt: now }, $set: mutable },
      { upsert: true }
    );
    return await db.collection("positions").findOne(filter);
  } catch (err) {
    console.error("[db] write failed", { collection: "positions", operation: "upsert", error: safeErr(err) });
    throw err;
  }
}

export async function createSnipe(doc) {
  const now = new Date();
  const snipe = { _id: id(), ...stripImmutable(doc), status: doc.status || "active", createdAt: now, updatedAt: now };
  const db = getDb();
  if (!db) {
    memory.snipes.set(snipe._id, snipe);
    return snipe;
  }
  try {
    await db.collection("snipes").insertOne(snipe);
    return snipe;
  } catch (err) {
    console.error("[db] write failed", { collection: "snipes", operation: "insertOne", error: safeErr(err) });
    throw err;
  }
}

export async function listSnipes(userId, includeAll = false) {
  const query = { userId: String(userId) };
  if (!includeAll) query.status = { $in: ["active", "paused"] };
  const db = getDb();
  if (!db) {
    return [...memory.snipes.values()].filter((s) => s.userId === String(userId) && (includeAll || ["active", "paused"].includes(s.status)));
  }
  try {
    return await db.collection("snipes").find(query).sort({ updatedAt: -1 }).toArray();
  } catch (err) {
    console.error("[db] read failed", { collection: "snipes", operation: "find", error: safeErr(err) });
    return [];
  }
}

export async function listActiveSnipes() {
  const db = getDb();
  if (!db) return [...memory.snipes.values()].filter((s) => s.status === "active");
  try {
    return await db.collection("snipes").find({ status: "active" }).limit(500).toArray();
  } catch (err) {
    console.error("[db] read failed", { collection: "snipes", operation: "findActive", error: safeErr(err) });
    return [];
  }
}

export async function updateSnipe(snipeId, patch) {
  const clean = stripImmutable({ ...patch, updatedAt: new Date() });
  const db = getDb();
  if (!db) {
    const prev = memory.snipes.get(String(snipeId)) || {};
    const next = { ...prev, ...clean };
    memory.snipes.set(String(snipeId), next);
    return next;
  }
  try {
    await db.collection("snipes").updateOne({ _id: String(snipeId) }, { $set: clean });
    return await db.collection("snipes").findOne({ _id: String(snipeId) });
  } catch (err) {
    console.error("[db] write failed", { collection: "snipes", operation: "updateOne", error: safeErr(err) });
    throw err;
  }
}
