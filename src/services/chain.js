import { cfg } from "../lib/config.js";
import { safeErr } from "../lib/log.js";

async function fetchJson(url, options = {}, meta = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    console.log("[api] start", meta);
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (!res.ok) throw new Error(json?.message || json?.error || text || `HTTP ${res.status}`);
    console.log("[api] success", meta);
    return { ok: true, json, text };
  } catch (err) {
    console.warn("[api] failure", { ...meta, error: safeErr(err) });
    return { ok: false, error: safeErr(err) };
  } finally {
    clearTimeout(timer);
  }
}

export async function getNativeBalance(address) {
  if (!cfg.CHAIN_RPC_URL || !address) {
    return { ok: false, partial: true, balance: "unknown", error: "RPC unavailable" };
  }

  const res = await fetchJson(cfg.CHAIN_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] })
  }, { feature: "balance", provider: "rpc", chainId: cfg.CHAIN_ID });

  if (!res.ok || !res.json?.result) return { ok: false, partial: true, balance: "unknown", error: res.error || "RPC unavailable" };
  const wei = BigInt(res.json.result);
  const native = Number(wei) / 1e18;
  return { ok: true, balance: native.toFixed(6) };
}

export async function getQuote({ side, tokenAddress, amount, slippage, walletAddress }) {
  if (!cfg.DEX_AGGREGATOR_API_URL) {
    console.warn("[api] quote gated", { feature: "quote", DEX_AGGREGATOR_API_URL_set: false });
    return { ok: false, gated: true, estimatedOutput: "unavailable", estimatedGas: "unavailable", error: "Quote API unavailable" };
  }

  const base = cfg.DEX_AGGREGATOR_API_URL.replace(/\/+$/, "");
  const url = new URL(`${base}/quote`);
  url.searchParams.set("chainId", String(cfg.CHAIN_ID));
  url.searchParams.set("side", String(side));
  url.searchParams.set("token", String(tokenAddress));
  url.searchParams.set("amount", String(amount));
  url.searchParams.set("slippage", String(slippage));
  if (walletAddress) url.searchParams.set("wallet", String(walletAddress));

  const res = await fetchJson(url.toString(), {}, { feature: "quote", provider: "dex", side, chainId: cfg.CHAIN_ID });
  if (!res.ok) return { ok: false, estimatedOutput: "unavailable", estimatedGas: "unavailable", error: res.error };

  const q = res.json || {};
  return {
    ok: true,
    estimatedOutput: q.estimatedOutput || q.outAmount || q.outputAmount || "unknown",
    estimatedGas: q.estimatedGas || q.gas || "unknown",
    priceImpact: q.priceImpact || "unknown",
    raw: q
  };
}

export async function getTokenRisk(tokenAddress) {
  if (!cfg.DEX_AGGREGATOR_API_URL) {
    return {
      ok: false,
      flags: ["Risk data unavailable", "Liquidity data unavailable"],
      liquidityWarning: true,
      riskyWarning: true
    };
  }

  const base = cfg.DEX_AGGREGATOR_API_URL.replace(/\/+$/, "");
  const url = new URL(`${base}/risk`);
  url.searchParams.set("chainId", String(cfg.CHAIN_ID));
  url.searchParams.set("token", String(tokenAddress));

  const res = await fetchJson(url.toString(), {}, { feature: "risk", provider: "dex", chainId: cfg.CHAIN_ID });
  if (!res.ok) {
    return { ok: false, flags: ["Risk data unavailable"], liquidityWarning: true, riskyWarning: true };
  }

  const r = res.json || {};
  const flags = Array.isArray(r.flags) ? r.flags : [];
  const liquidity = Number(r.liquidityUsd || r.liquidity || 0);
  if (!Number.isFinite(liquidity) || liquidity < 10000) flags.push("Low or unknown liquidity");
  if (r.honeypot || r.highTax || r.ownerRisk) flags.push("Suspicious token checks");

  return {
    ok: true,
    flags,
    liquidityWarning: !Number.isFinite(liquidity) || liquidity < 10000,
    riskyWarning: flags.length > 0,
    liquidityUsd: liquidity || null,
    symbol: r.symbol || "TOKEN"
  };
}

export async function getTokenPrice(tokenAddress) {
  if (!cfg.PRICE_API_URL) {
    return { ok: false, price: null, error: "Price API unavailable" };
  }

  const base = cfg.PRICE_API_URL.replace(/\/+$/, "");
  const url = new URL(`${base}/price`);
  url.searchParams.set("chainId", String(cfg.CHAIN_ID));
  url.searchParams.set("token", String(tokenAddress));

  const res = await fetchJson(url.toString(), {}, { feature: "price", provider: "price", chainId: cfg.CHAIN_ID });
  if (!res.ok) return { ok: false, price: null, error: res.error };
  return { ok: true, price: Number(res.json?.price || 0) || null, symbol: res.json?.symbol || "TOKEN" };
}

export async function submitSwap({ trade, wallet }) {
  if (!cfg.CHAIN_RPC_URL || !cfg.DEX_AGGREGATOR_API_URL) {
    return { ok: false, gated: true, error: "Live trading is disabled until RPC and DEX aggregator are configured." };
  }

  if (!wallet?.encryptedSecret) {
    return { ok: false, gated: true, error: "This wallet is watch-only. Import or create a signing wallet to trade." };
  }

  console.log("[api] start", { feature: "swap", provider: "dex", side: trade.side, chainId: cfg.CHAIN_ID });
  console.warn("[api] failure", { feature: "swap", provider: "dex", error: "Execution adapter not connected" });
  return { ok: false, error: "Execution adapter is not connected yet. Quote and safety checks are available." };
}
