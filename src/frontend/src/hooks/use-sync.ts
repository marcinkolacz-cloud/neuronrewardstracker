/**
 * React Query hooks for NNS governance sync + manual snapshot fallback.
 *   useSyncNeuron      — sync a single neuron with governance (syncNeuron)
 *   useSyncAllNeurons  — sync every tracked neuron (syncAllMyNeurons)
 *   useRecordSnapshot  — manual snapshot entry (recordSnapshot)
 *   useSyncError       — stored sync error reason for a neuron (getSyncError)
 *
 * Return types match the generated backend bindings:
 *   syncNeuron      → SyncResult { status, maturityE8s?, lastSyncError?, neuronId }
 *   syncAllMyNeurons → SyncResult[]
 *   recordSnapshot  → DailyReward
 *   getSyncError    → string | null
 * None of these return a Candid Result variant, so there are no
 * `__kind__ === "ok"` checks here.
 */

import {
  type DailyReward,
  type SyncResult,
  useBackendActor,
} from "@/lib/backend-actor";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const NEURONS_KEY = ["neurons"] as const;
const PORTFOLIO_KEY = ["portfolio-stats"] as const;
const statsKey = (id: string) => ["neuron-stats", id] as const;
const rewardsKey = (id: string) => ["rewards", id] as const;
const syncStatusKey = (id: string) => ["sync-status", id] as const;
const syncErrorKey = (id: string) => ["sync-error", id] as const;

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
      void queryClient.invalidateQueries({ queryKey: syncErrorKey(id) });
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
          q.queryKey[0] === "sync-status" ||
          q.queryKey[0] === "sync-error",
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

/**
 * Stored sync error reason for a neuron (?Text from getSyncError).
 * Returns null when no error is stored (e.g. status is synced / hotkeyRequired
 * / neverSynced). Keyed by neuronId string so it invalidates per-neuron.
 */
export function useSyncError(neuronId: string | null) {
  const { actor, isFetching } = useBackendActor();
  return useQuery<string | null>({
    queryKey: ["sync-error", neuronId ?? "none"] as const,
    queryFn: async () => {
      if (!actor || !neuronId) throw new Error("No actor or neuron id");
      return actor.getSyncError(BigInt(neuronId));
    },
    enabled: !!actor && !isFetching && !!neuronId,
  });
}
