/**
 * React Query hooks for NNS governance sync + manual snapshot fallback.
 *   useSyncNeuron            — sync a single neuron with governance (syncNeuron)
 *   useSyncAllNeurons        — sync every tracked neuron (syncAllMyNeurons)
 *   useRecordSnapshot        — manual snapshot entry (recordSnapshot)
 *   useSyncError             — stored sync error reason for a neuron (getSyncError)
 *   useImportHistoricalData  — bulk-import past maturity readings (importHistoricalData)
 *
 * Return types match the generated backend bindings:
 *   syncNeuron      → SyncResult { status, maturityE8s?, lastSyncError?, neuronId }
 *   syncAllMyNeurons → SyncResult[]
 *   recordSnapshot  → DailyReward  (args: neuronId, unstakedMaturityE8s,
 *                                    stakedMaturityE8s, autoStakeMaturity)
 *   getSyncError    → string | null
 *   importHistoricalData → void  (args: neuronId, entries: HistoricalEntry[])
 * None of these return a Candid Result variant, so there are no
 * `__kind__ === "ok"` checks here.
 */

import {
  type DailyReward,
  type HistoricalEntry,
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
      // refetchType: 'active' forces currently-rendered queries to refetch
      // immediately (rather than just marking stale), so the dashboard cards
      // and portfolio summary visibly update right after a sync-all run.
      void queryClient.invalidateQueries({
        queryKey: NEURONS_KEY,
        refetchType: "active",
      });
      void queryClient.invalidateQueries({
        queryKey: PORTFOLIO_KEY,
        refetchType: "active",
      });
      void queryClient.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === "neuron-stats" ||
          q.queryKey[0] === "rewards" ||
          q.queryKey[0] === "sync-status" ||
          q.queryKey[0] === "sync-error" ||
          q.queryKey[0] === "portfolio-stats" ||
          q.queryKey[0] === "portfolio-reward-stats",
        refetchType: "active",
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
    {
      neuronId: bigint;
      unstakedMaturityE8s: bigint;
      stakedMaturityE8s: bigint;
      autoStakeMaturity: boolean;
      timestamp: bigint;
    }
  >({
    mutationFn: async (vars) => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.recordSnapshot(
        vars.neuronId,
        vars.unstakedMaturityE8s,
        vars.stakedMaturityE8s,
        vars.autoStakeMaturity,
        vars.timestamp,
      );
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

/**
 * Bulk-import past maturity readings for a neuron (importHistoricalData).
 * Each HistoricalEntry carries a combined maturity figure split into
 * unstakedMaturityE8s (the parsed amount) and stakedMaturityE8s (0 for
 * paste-in history). On success the reward history query is invalidated so
 * the chart / activity feed refresh.
 */
export function useImportHistoricalData() {
  const queryClient = useQueryClient();
  const { actor } = useBackendActor();
  return useMutation<
    void,
    Error,
    { neuronId: bigint; entries: HistoricalEntry[] }
  >({
    mutationFn: async (vars) => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.importHistoricalData(vars.neuronId, vars.entries);
    },
    onSuccess: (_data, vars) => {
      const id = vars.neuronId.toString();
      void queryClient.invalidateQueries({ queryKey: rewardsKey(id) });
      void queryClient.invalidateQueries({ queryKey: statsKey(id) });
      void queryClient.invalidateQueries({ queryKey: syncStatusKey(id) });
      void queryClient.invalidateQueries({ queryKey: NEURONS_KEY });
      void queryClient.invalidateQueries({ queryKey: PORTFOLIO_KEY });
    },
  });
}
