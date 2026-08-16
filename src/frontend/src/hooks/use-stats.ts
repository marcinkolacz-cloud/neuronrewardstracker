/**
 * React Query hooks for aggregate stats.
 *   useNeuronStats            — per-neuron reward/maturity stats (getNeuronStats)
 *   usePortfolioStats         — portfolio-wide aggregate stats (getPortfolioStats)
 *   usePortfolioRewardStats   — portfolio-wide reward statistics + monthly
 *                               breakdown across all neurons AND WTN positions
 *                               (getPortfolioRewardStats)
 */

import {
  type NeuronStats,
  type PortfolioRewardStats,
  type PortfolioStats,
  useBackendActor,
} from "@/lib/backend-actor";
import { useQuery } from "@tanstack/react-query";

/** Per-neuron aggregate stats. */
export function useNeuronStats(neuronId: string | null) {
  const { actor, isFetching } = useBackendActor();
  return useQuery<NeuronStats>({
    queryKey: ["neuron-stats", neuronId ?? "none"] as const,
    queryFn: async () => {
      if (!actor || !neuronId) throw new Error("No actor or neuron id");
      return actor.getNeuronStats(BigInt(neuronId));
    },
    enabled: !!actor && !isFetching && !!neuronId,
  });
}

/** Portfolio-wide aggregate stats (total staked, rewards, return %). */
export function usePortfolioStats() {
  const { actor, isFetching } = useBackendActor();
  return useQuery<PortfolioStats>({
    queryKey: ["portfolio-stats"] as const,
    queryFn: async () => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.getPortfolioStats();
    },
    enabled: !!actor && !isFetching,
  });
}

/**
 * Portfolio-wide reward statistics + monthly breakdown, aggregating across
 * ALL neurons AND WTN positions combined. Returns PortfolioRewardStats
 * (monthlyReadings, averageDailyRewardE8s, totalRewardsE8s,
 * totalCapitalContributedE8s, apy30d, monthly, overallReturnPct) for the
 * dashboard's portfolio-wide "Reward statistics" + "Monthly breakdown"
 * panels. Keyed under "portfolio-reward-stats" so useSyncAllNeurons'
 * invalidation predicate (queryKey[0] === "portfolio-stats") can be
 * extended to cover it — see use-sync.ts.
 */
export function usePortfolioRewardStats() {
  const { actor, isFetching } = useBackendActor();
  return useQuery<PortfolioRewardStats>({
    queryKey: ["portfolio-reward-stats"] as const,
    queryFn: async () => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.getPortfolioRewardStats();
    },
    enabled: !!actor && !isFetching,
  });
}

/**
 * Average daily reward over the trailing 30 FULL days (today excluded,
 * since today's manual entry usually isn't in yet). Sums every
 * #normalGrowth / #organicGrowth delta in that 30-day window (via the same
 * backend range-sum used for a single day) and divides by 30 — a rolling
 * average rather than the all-time one already shown lower on the page.
 * Day boundaries are computed in the BROWSER's local timezone. Refetches
 * every 5 minutes so it stays current across local midnight.
 */
export function useAverage30dReward() {
  const { actor, isFetching } = useBackendActor();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const windowStart = new Date(startOfToday);
  windowStart.setDate(windowStart.getDate() - 30);
  const dayStartNs = BigInt(windowStart.getTime()) * 1_000_000n;
  const dayEndNs = BigInt(startOfToday.getTime()) * 1_000_000n;
  return useQuery<bigint>({
    queryKey: ["average-30d-reward", startOfToday.toDateString()] as const,
    queryFn: async () => {
      if (!actor) throw new Error("Backend actor not ready");
      const sum = await actor.getTodayRewardE8s(dayStartNs, dayEndNs);
      const clamped = sum < 0n ? 0n : sum;
      return clamped / 30n;
    },
    enabled: !!actor && !isFetching,
    refetchInterval: 5 * 60 * 1000,
  });
}
