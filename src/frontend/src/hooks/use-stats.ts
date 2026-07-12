/**
 * React Query hooks for aggregate stats.
 *   useNeuronStats     — per-neuron reward/maturity stats (getNeuronStats)
 *   usePortfolioStats  — portfolio-wide aggregate stats (getPortfolioStats)
 */

import {
  type NeuronStats,
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
