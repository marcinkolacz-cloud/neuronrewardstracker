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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const PORTFOLIO_KEY = ["portfolio-stats"] as const;
const statsKey = (id: string) => ["neuron-stats", id] as const;
const rewardsKey = (id: string) => ["rewards", id] as const;

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

/**
 * Edit an existing reward snapshot — change both its timestamp and its
 * combined maturity balance. Backend re-sorts the history and recomputes
 * deltas for the edited entry and its new neighbors.
 *
 * editSnapshot(neuronId, timestamp, newTimestamp, newMaturityE8s)
 * On success invalidates rewards, neuron-stats, and portfolio-stats so the
 * chart / activity feed / aggregate cards refresh.
 */
export function useEditSnapshot() {
  const queryClient = useQueryClient();
  const { actor } = useBackendActor();
  return useMutation<
    void,
    Error,
    {
      neuronId: bigint;
      timestamp: bigint;
      newTimestamp: bigint;
      newMaturityE8s: bigint;
    }
  >({
    mutationFn: async (vars) => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.editSnapshot(
        vars.neuronId,
        vars.timestamp,
        vars.newTimestamp,
        vars.newMaturityE8s,
      );
    },
    onSuccess: (_data, vars) => {
      const id = vars.neuronId.toString();
      void queryClient.invalidateQueries({ queryKey: rewardsKey(id) });
      void queryClient.invalidateQueries({ queryKey: statsKey(id) });
      void queryClient.invalidateQueries({ queryKey: PORTFOLIO_KEY });
    },
  });
}

/**
 * Delete a single reward snapshot.
 *
 * deleteSnapshot(neuronId, timestamp)
 * On success invalidates rewards, neuron-stats, and portfolio-stats so the
 * chart / activity feed / aggregate cards refresh. The caller is responsible
 * for showing a confirmation dialog before invoking this mutation.
 */
export function useDeleteSnapshot() {
  const queryClient = useQueryClient();
  const { actor } = useBackendActor();
  return useMutation<void, Error, { neuronId: bigint; timestamp: bigint }>({
    mutationFn: async (vars) => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.deleteSnapshot(vars.neuronId, vars.timestamp);
    },
    onSuccess: (_data, vars) => {
      const id = vars.neuronId.toString();
      void queryClient.invalidateQueries({ queryKey: rewardsKey(id) });
      void queryClient.invalidateQueries({ queryKey: statsKey(id) });
      void queryClient.invalidateQueries({ queryKey: PORTFOLIO_KEY });
    },
  });
}
