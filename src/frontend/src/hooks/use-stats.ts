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
