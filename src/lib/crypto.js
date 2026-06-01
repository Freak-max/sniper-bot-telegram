import crypto from "node:crypto";
import { cfg } from "./config.js";

function keyBytes() {
  if (!cfg.ENCRYPTION_KEY) return null;
  return crypto.createHash("sha256").update(String(cfg.ENCRYPTION_KEY)).digest();
}

export function canEncrypt() {
  return Boolean(keyBytes());
}

export function encryptSecret(secret) {
  const key = keyBytes();
  if (!key) throw new Error("ENCRYPTION_KEY missing");

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(secret), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: ciphertext.toString("base64")
  };
}

export function decryptSecret(payload) {
  const key = keyBytes();
  if (!key) throw new Error("ENCRYPTION_KEY missing");
  if (!payload?.iv || !payload?.tag || !payload?.data) throw new Error("Invalid encrypted payload");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const clear = Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64")),
    decipher.final()
  ]);
  return clear.toString("utf8");
}
