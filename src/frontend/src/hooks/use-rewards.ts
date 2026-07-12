/**
 * React Query hooks for reward history.
 *   useRewardHistory — list of DailyReward events for a single neuron
 *   useSyncStatus   — current SyncStatus for a single neuron
 */

import {
  type DailyReward,
  type SyncStatus,
  useBackendActor,
} from "@/lib/backend-actor";
import { useQuery } from "@tanstack/react-query";

/** Reward events for a single neuron (DailyReward[]), oldest first. */
export function useRewardHistory(neuronId: string | null) {
  const { actor, isFetching } = useBackendActor();
  return useQuery<DailyReward[]>({
    queryKey: ["rewards", neuronId ?? "none"] as const,
    queryFn: async () => {
      if (!actor || !neuronId) return [];
      return actor.getRewardHistory(BigInt(neuronId));
    },
    enabled: !!actor && !isFetching && !!neuronId,
  });
}

/** Current sync status for a single neuron (#synced / #hotkeyRequired / #neverSynced). */
export function useSyncStatus(neuronId: string | null) {
  const { actor, isFetching } = useBackendActor();
  return useQuery<SyncStatus>({
    queryKey: ["sync-status", neuronId ?? "none"] as const,
    queryFn: async () => {
      if (!actor || !neuronId) throw new Error("No actor or neuron id");
      return actor.getSyncStatus(BigInt(neuronId));
    },
    enabled: !!actor && !isFetching && !!neuronId,
  });
}
