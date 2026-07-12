/**
 * React Query hooks for NNS governance sync + manual snapshot fallback.
 *   useSyncNeuron      — sync a single neuron with governance (syncNeuron)
 *   useSyncAllNeurons  — sync every tracked neuron (syncAllMyNeurons)
 *   useRecordSnapshot  — manual snapshot entry (recordSnapshot)
 *
 * Return types match the generated backend bindings:
 *   syncNeuron      → SyncResult { status, maturityE8s?, neuronId }
 *   syncAllMyNeurons → SyncResult[]
 *   recordSnapshot  → DailyReward
 * None of these return a Candid Result variant, so there are no
 * `__kind__ === "ok"` checks here.
 */

import {
  type DailyReward,
  type SyncResult,
  useBackendActor,
} from "@/lib/backend-actor";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const NEURONS_KEY = ["neurons"] as const;
const PORTFOLIO_KEY = ["portfolio-stats"] as const;
const statsKey = (id: string) => ["neuron-stats", id] as const;
const rewardsKey = (id: string) => ["rewards", id] as const;
const syncStatusKey = (id: string) => ["sync-status", id] as const;

/** Sync a single neuron with NNS governance. Invalidates related queries. */
export function useSyncNeuron() {
  const queryClient = useQueryClient();
  const { actor } = useBackendActor();
  return useMutation<SyncResult, Error, bigint>({
    mutationFn: async (neuronId) => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.syncNeuron(neuronId);
    },
    onSuccess: (_data, neuronId) => {
      const id = neuronId.toString();
      void queryClient.invalidateQueries({ queryKey: NEURONS_KEY });
      void queryClient.invalidateQueries({ queryKey: statsKey(id) });
      void queryClient.invalidateQueries({ queryKey: rewardsKey(id) });
      void queryClient.invalidateQueries({ queryKey: syncStatusKey(id) });
      void queryClient.invalidateQueries({ queryKey: PORTFOLIO_KEY });
    },
  });
}

/** Sync every tracked neuron. Invalidates portfolio-wide queries. */
export function useSyncAllNeurons() {
  const queryClient = useQueryClient();
  const { actor } = useBackendActor();
  return useMutation<SyncResult[], Error, void>({
    mutationFn: async () => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.syncAllMyNeurons();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NEURONS_KEY });
      void queryClient.invalidateQueries({ queryKey: PORTFOLIO_KEY });
      void queryClient.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === "neuron-stats" ||
          q.queryKey[0] === "rewards" ||
          q.queryKey[0] === "sync-status",
      });
    },
  });
}

/** Record a manual snapshot (fallback when governance sync is blocked). */
export function useRecordSnapshot() {
  const queryClient = useQueryClient();
  const { actor } = useBackendActor();
  return useMutation<
    DailyReward,
    Error,
    { neuronId: bigint; maturityE8s: bigint }
  >({
    mutationFn: async ({ neuronId, maturityE8s }) => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.recordSnapshot(neuronId, maturityE8s);
    },
    onSuccess: (_data, vars) => {
      const id = vars.neuronId.toString();
      void queryClient.invalidateQueries({ queryKey: statsKey(id) });
      void queryClient.invalidateQueries({ queryKey: rewardsKey(id) });
      void queryClient.invalidateQueries({ queryKey: NEURONS_KEY });
      void queryClient.invalidateQueries({ queryKey: PORTFOLIO_KEY });
    },
  });
}
