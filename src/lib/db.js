import { MongoClient } from "mongodb";
import { cfg } from "./config.js";
import { safeErr } from "./log.js";

let client = null;
let db = null;

export async function connectDb() {
  if (!cfg.MONGODB_URI) return null;
  if (db) return db;

  try {
    client = new MongoClient(cfg.MONGODB_URI, { maxPoolSize: 10, ignoreUndefined: true });
    await client.connect();
    db = client.db();
    console.log("[db] connected", { MONGODB_URI_set: true });
    return db;
  } catch (err) {
    console.error("[db] connect failed", { collection: "all", operation: "connect", error: safeErr(err) });
    return null;
  }
}

export function getDb() {
  return db;
}

export async function ensureIndexes() {
  if (!db) return;
  try {
    await db.collection("users").createIndex({ telegramUserId: 1 }, { unique: true });
    await db.collection("wallets").createIndex({ userId: 1, createdAt: -1 });
    await db.collection("positions").createIndex({ userId: 1, walletId: 1, tokenAddress: 1 });
    await db.collection("trades").createIndex({ userId: 1, createdAt: -1 });
    await db.collection("snipes").createIndex({ status: 1, updatedAt: -1 });
    await db.collection("settings").createIndex({ userId: 1 }, { unique: true });
    console.log("[db] indexes ready");
  } catch (err) {
    console.error("[db] index failed", { collection: "multiple", operation: "createIndex", error: safeErr(err) });
  }
}

export function stripImmutable(obj) {
  const clean = { ...(obj || {}) };
  delete clean._id;
  delete clean.createdAt;
  return clean;
}
