/**
 * CSV export + download helpers for reward snapshot data.
 *
 * Columns: date, maturity balance, delta, event type
 * (normalGrowth / disburseOrSpawn / firstReading). For the dashboard
 * combined export a neuronId column is prepended as the first column.
 *
 * Properly escapes fields containing commas, double quotes, or newlines
 * per RFC 4180 (wrap in double quotes, double any embedded quotes).
 */

import { EventType } from "@/backend";
import type { DailyReward } from "@/lib/backend-actor";
import { formatIcp, formatTimestamp } from "@/lib/format";

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

const HEADER = ["date", "maturity balance", "delta", "event type"];

/**
 * Build a CSV string from a list of DailyReward entries for a single neuron.
 * Columns: date, maturity balance, delta, event type — one row per snapshot.
 */
export function rewardsToCsv(rewards: DailyReward[]): string {
  const rows = rewards.map((r) =>
    [
      formatTimestamp(r.timestamp),
      maturityBalance(r),
      deltaIcp(r),
      eventLabel(r.eventType),
    ]
      .map(escapeCsvField)
      .join(","),
  );
  return [HEADER.join(","), ...rows].join("\n");
}

/**
 * Build a combined CSV string from reward entries across multiple neurons.
 * A `neuronId` column is prepended as the first column so the single
 * exported file can be filtered by neuron. Each entry in `groups` pairs a
 * neuron id with that neuron's reward history.
 */
export function rewardsToCombinedCsv(
  groups: { neuronId: string | number | bigint; rewards: DailyReward[] }[],
): string {
  const header = ["neuronId", ...HEADER].join(",");
  const rows: string[] = [];
  for (const group of groups) {
    const neuronId = group.neuronId.toString();
    for (const r of group.rewards) {
      rows.push(
        [
          neuronId,
          formatTimestamp(r.timestamp),
          maturityBalance(r),
          deltaIcp(r),
          eventLabel(r.eventType),
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
