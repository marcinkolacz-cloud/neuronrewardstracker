/**
 * ICP formatting utilities.
 *
 * ICP amounts are represented on-chain as e8s (1 ICP = 100_000_000 e8s).
 * These helpers convert bigint e8s values into human-readable ICP strings
 * with appropriate decimal precision, plus a few shared formatters used
 * across the dashboard, neuron detail, and stats surfaces.
 */

/** 1 ICP = 100_000_000 e8s. */
export const E8S_PER_ICP = 100_000_000n;

/**
 * Convert an e8s amount to a full-precision ICP string (8 decimals).
 * Trims trailing zeros but always keeps at least 2 decimals for readability.
 *
 * @example formatE8s(1_234_567_890n) // "12.34567890"
 */
export function formatE8s(e8s: bigint | number | null | undefined): string {
  if (e8s == null) return "0.00";
  const value = typeof e8s === "number" ? BigInt(Math.trunc(e8s)) : e8s;
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const icp = abs / E8S_PER_ICP;
  const fraction = abs % E8S_PER_ICP;
  const fractionStr = fraction.toString().padStart(8, "0").replace(/0+$/, "");
  const decimals =
    fractionStr.length < 2 ? fractionStr.padEnd(2, "0") : fractionStr;
  const base = icp.toString();
  return `${negative ? "-" : ""}${base}.${decimals}`;
}

/**
 * Format e8s as ICP with a fixed number of decimals (default 4) and
 * thousands separators. Best for portfolio summaries and table cells
 * where consistent column width matters.
 *
 * @example formatIcp(1_234_567_890n, 2) // "12.35 ICP"
 */
export function formatIcp(
  e8s: bigint | number | null | undefined,
  decimals = 4,
  withUnit = true,
): string {
  if (e8s == null) return withUnit ? "0.0000 ICP" : "0.0000";
  const value = typeof e8s === "number" ? BigInt(Math.trunc(e8s)) : e8s;
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const icp = abs / E8S_PER_ICP;
  const fraction = abs % E8S_PER_ICP;
  const fractionStr = fraction.toString().padStart(8, "0").slice(0, decimals);
  const intPart = icp.toString();
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const formatted = `${negative ? "-" : ""}${withCommas}.${fractionStr}`;
  return withUnit ? `${formatted} ICP` : formatted;
}

/** Compact ICP formatting for tight spaces (e.g. card stats). */
export function formatIcpCompact(
  e8s: bigint | number | null | undefined,
): string {
  if (e8s == null) return "0 ICP";
  const value = typeof e8s === "number" ? BigInt(Math.trunc(e8s)) : e8s;
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const icp = abs / E8S_PER_ICP;
  const fraction = abs % E8S_PER_ICP;
  const fracStr = fraction.toString().padStart(8, "0").slice(0, 2);
  const intPart = icp.toString();
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${withCommas}.${fracStr} ICP`;
}

/**
 * Format a percentage value (already in percent units, e.g. 14.7 means 14.7%).
 * Adds a leading + for positive values.
 */
export function formatPercent(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Format a timestamp (nanoseconds since epoch, as the IC uses) into a
 * short human-readable date string.
 */
export function formatTimestamp(
  ns: bigint | number | null | undefined,
): string {
  if (ns == null) return "—";
  const ms = typeof ns === "number" ? ns : Number(ns / 1_000_000n);
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Format a timestamp into a date + time string. */
export function formatTimestampDateTime(
  ns: bigint | number | null | undefined,
): string {
  if (ns == null) return "—";
  const ms = typeof ns === "number" ? ns : Number(ns / 1_000_000n);
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Shorten a principal string for display: abc...xyz. */
export function shortenPrincipal(
  principal: string | null | undefined,
  chars = 6,
): string {
  if (!principal) return "—";
  if (principal.length <= chars * 2 + 3) return principal;
  return `${principal.slice(0, chars)}...${principal.slice(-chars)}`;
}

/** Shorten a neuron ID (u64 as string) for compact display. */
export function shortenNeuronId(
  id: string | number | bigint | null | undefined,
): string {
  if (id == null) return "—";
  const str = id.toString();
  if (str.length <= 10) return `#${str}`;
  return `#${str.slice(0, 4)}...${str.slice(-4)}`;
}
