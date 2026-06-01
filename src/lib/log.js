export function safeErr(err) {
  return err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    err?.message ||
    String(err);
}

export function redact(value) {
  const s = String(value || "");
  return s
    .replace(/0x[a-fA-F0-9]{64}/g, "[redacted-secret]")
    .replace(/[A-Za-z0-9+/=]{80,}/g, "[redacted-blob]")
    .slice(0, 1200);
}

export const log = {
  info(message, meta = {}) {
    console.log(message, meta);
  },
  warn(message, meta = {}) {
    console.warn(message, meta);
  },
  error(message, meta = {}) {
    console.error(message, meta);
  }
};
