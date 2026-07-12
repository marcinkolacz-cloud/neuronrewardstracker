/**
 * CSV export + download helpers for reward snapshot data.
 *
 * Columns: date, maturity balance, delta, event type, priceUsd, pricePln,
 * rewardValueUsd, rewardValuePln. The event type is one of normalGrowth /
 * disburseOrSpawn / firstReading. For the dashboard combined export a
 * neuronId column is prepended as the first column.
 *
 * The price/value columns are populated from an optional `priceMap` keyed by
 * YYYY-MM-DD date string. When a price is unavailable for a row, the four
 * price/value columns are written as empty fields rather than blocking the
 * export.
 *
 * Properly escapes fields containing commas, double quotes, or newlines
 * per RFC 4180 (wrap in double quotes, double any embedded quotes).
 */

import { EventType } from "@/backend";
import type { DailyReward } from "@/lib/backend-actor";
import { E8S_PER_ICP, formatIcp, formatTimestamp } from "@/lib/format";

/**
 * Historical price lookup for a single day. Keyed by YYYY-MM-DD so callers
 * can build the map from any price source (e.g. CoinGecko historical) and
 * pass it through to the CSV builders without coupling the CSV layer to the
 * price-fetch implementation.
 */
export type PriceMap = Map<string, { usd: number; pln: number }>;

/**
 * Escape a single CSV field per RFC 4180. Fields containing a comma,
 * double quote, or line break are wrapped in double quotes and any
 * embedded double quotes are doubled.
 */
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Human-readable label for an EventType enum value. */
function eventLabel(eventType: EventType): string {
  // mergedToStake is a newer EventType member that may not yet be present
  // in the generated bindings (until bindgen re-runs after the backend
  // change). Handle it via string comparison so CSV exports label merge
  // maturity events correctly both before and after bindgen.
  if (eventType === ("mergedToStake" as EventType)) return "mergedToStake";
  switch (eventType) {
    case EventType.normalGrowth:
      return "normalGrowth";
    case EventType.disburseOrSpawn:
      return "disburseOrSpawn";
    case EventType.firstReading:
      return "firstReading";
    default:
      return EventType[eventType] ?? "unknown";
  }
}

/** Combined maturity balance (unstaked + staked) as an ICP string. */
function maturityBalance(reward: DailyReward): string {
  const combined = reward.unstakedMaturityE8s + reward.stakedMaturityE8s;
  return formatIcp(combined, 8, false);
}

/** Delta as a full-precision ICP string (can be negative). */
function deltaIcp(reward: DailyReward): string {
  return formatIcp(reward.deltaE8s, 8, false);
}

/**
 * Derive a YYYY-MM-DD date string from a reward timestamp (nanoseconds
 * since epoch, as the IC uses). Used as the lookup key into the priceMap.
 * Returns null when the timestamp is invalid.
 */
function dateKeyFromTimestamp(
  ns: bigint | number | null | undefined,
): string | null {
  if (ns == null) return null;
  const ms = typeof ns === "number" ? ns : Number(ns / 1_000_000n);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Format a numeric price/value for the CSV. Uses up to 8 significant
 * decimals without thousands separators (CSV consumers parse these as
 * numbers). Returns an empty string when the value is null/NaN so the
 * column stays empty rather than emitting "NaN" or "0".
 */
function formatPriceValue(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "";
  return String(value);
}

/**
 * Compute the four price/value column strings for a single reward row.
 * Returns empty strings for all four columns when no priceMap is supplied
 * or the date has no entry in the map.
 */
function priceColumns(
  reward: DailyReward,
  priceMap: PriceMap | undefined,
): [string, string, string, string] {
  if (!priceMap) return ["", "", "", ""];
  const key = dateKeyFromTimestamp(reward.timestamp);
  if (!key) return ["", "", "", ""];
  const price = priceMap.get(key);
  if (!price) return ["", "", "", ""];
  const icp = Number(reward.deltaE8s) / Number(E8S_PER_ICP);
  const rewardValueUsd = icp * price.usd;
  const rewardValuePln = icp * price.pln;
  return [
    formatPriceValue(price.usd),
    formatPriceValue(price.pln),
    formatPriceValue(rewardValueUsd),
    formatPriceValue(rewardValuePln),
  ];
}

const HEADER = [
  "date",
  "maturity balance",
  "delta",
  "event type",
  "priceUsd",
  "pricePln",
  "rewardValueUsd",
  "rewardValuePln",
];

/**
 * Build a CSV string from a list of DailyReward entries for a single neuron.
 * Columns: date, maturity balance, delta, event type, priceUsd, pricePln,
 * rewardValueUsd, rewardValuePln — one row per snapshot.
 *
 * When `priceMap` is supplied, the four price/value columns are populated
 * from the historical price for each row's date (keyed YYYY-MM-DD). Rows
 * without a matching price entry emit empty price/value columns.
 */
export function rewardsToCsv(
  rewards: DailyReward[],
  priceMap?: PriceMap,
): string {
  const rows = rewards.map((r) => {
    const [priceUsd, pricePln, rewardValueUsd, rewardValuePln] = priceColumns(
      r,
      priceMap,
    );
    return [
      formatTimestamp(r.timestamp),
      maturityBalance(r),
      deltaIcp(r),
      eventLabel(r.eventType),
      priceUsd,
      pricePln,
      rewardValueUsd,
      rewardValuePln,
    ]
      .map(escapeCsvField)
      .join(",");
  });
  return [HEADER.join(","), ...rows].join("\n");
}

/**
 * Build a combined CSV string from reward entries across multiple neurons.
 * A `neuronId` column is prepended as the first column so the single
 * exported file can be filtered by neuron. Each entry in `groups` pairs a
 * neuron id with that neuron's reward history.
 *
 * When `priceMap` is supplied, the four price/value columns are populated
 * from the historical price for each row's date (keyed YYYY-MM-DD). Rows
 * without a matching price entry emit empty price/value columns.
 */
export function rewardsToCombinedCsv(
  groups: {
    neuronId: string | number | bigint;
    rewards: DailyReward[];
  }[],
  priceMap?: PriceMap,
): string {
  const header = ["neuronId", ...HEADER].join(",");
  const rows: string[] = [];
  for (const group of groups) {
    const neuronId = group.neuronId.toString();
    for (const r of group.rewards) {
      const [priceUsd, pricePln, rewardValueUsd, rewardValuePln] = priceColumns(
        r,
        priceMap,
      );
      rows.push(
        [
          neuronId,
          formatTimestamp(r.timestamp),
          maturityBalance(r),
          deltaIcp(r),
          eventLabel(r.eventType),
          priceUsd,
          pricePln,
          rewardValueUsd,
          rewardValuePln,
        ]
          .map(escapeCsvField)
          .join(","),
      );
    }
  }
  return [header, ...rows].join("\n");
}

/**
 * Trigger a browser download of `content` as `filename`. Creates a Blob,
 * an object URL, a temporary anchor element, clicks it, then revokes the
 * URL. Safe to call from any user-gesture handler.
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
