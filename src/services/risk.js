import { getTokenRisk } from "./chain.js";

export async function buildRiskSummary({ user, tokenAddress, amount, side }) {
  const settings = user?.settings || {};
  const flags = [];
  const hardBlocks = [];

  const amountNum = Number(amount || 0);
  const maxPercent = Number(settings.maxPercentPerTrade || 20);
  const bigBuy = Number(settings.bigBuyConfirmThreshold || 1);

  if (!Number.isFinite(amountNum) || amountNum <= 0) hardBlocks.push("Invalid amount");
  if (side === "buy" && amountNum > bigBuy) flags.push("Big buy confirmation required");

  const tokenRisk = await getTokenRisk(tokenAddress);
  for (const flag of tokenRisk.flags || []) flags.push(flag);

  if (maxPercent <= 0 || maxPercent > 100) flags.push("Max percent setting is unusual");

  return {
    flags: [...new Set(flags)],
    hardBlocks,
    liquidityWarning: Boolean(tokenRisk.liquidityWarning),
    riskyWarning: Boolean(tokenRisk.riskyWarning),
    requiresExtraConfirm: flags.length > 0 || (side === "buy" && amountNum > bigBuy),
    exceedsMaxPercent: false,
    maxPercentPerTrade: maxPercent,
    symbol: tokenRisk.symbol || "TOKEN",
    liquidityUsd: tokenRisk.liquidityUsd || null
  };
}
