/**
 * React Query hooks for WaterNeuron (WTN) positions and snapshots.
 *
 * WTN positions are fully separate from NNS neurons — no governance sync,
 * no hotkey, manual snapshot entry only. These hooks mirror the
 * use-neurons / use-sync / use-rewards pattern but call the WTN backend
 * methods and invalidate the WTN query keys (wtnPositions, wtnSnapshots,
 * wtnStats) plus the shared portfolio-stats key so the dashboard's
 * portfolio summary refreshes after every WTN mutation.
 *
 *   useWtnPositions            — list caller's WTN positions (listMyWtnPositions)
 *   useCreateWtnPosition       — add a WTN position (addWtnPosition)
 *   useWtnPosition             — single position (getWtnPosition)
 *   useUpdateWtnPosition       — update a position record (updateWtnPosition)
 *   useDeleteWtnPosition        — remove a position (removeWtnPosition)
 *   useWtnSnapshots            — list snapshots for a position (getWtnSnapshots)
 *   useRecordWtnSnapshot        — manual snapshot entry (recordWtnSnapshot)
 *   useEditWtnSnapshot          — edit a snapshot (editWtnSnapshot)
 *   useDeleteWtnSnapshot        — delete a snapshot (deleteWtnSnapshot)
 *   useImportWtnHistoricalData  — bulk-import past readings (importWtnHistoricalData)
 *   useWtnStats                — per-position aggregate stats (getWtnStats)
 */

import {
  type WtnHistoricalEntry,
  type WtnPosition,
  type WtnSnapshot,
  type WtnStats,
  useBackendActor,
} from "@/lib/backend-actor";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const KEYS = {
  positions: ["wtnPositions"] as const,
  portfolio: ["portfolio-stats"] as const,
};

const positionKey = (id: string) => ["wtnPosition", id] as const;
const snapshotsKey = (id: string) => ["wtnSnapshots", id] as const;
const statsKey = (id: string) => ["wtnStats", id] as const;

/** List all WTN positions owned by the caller. */
export function useWtnPositions() {
  const { actor, isFetching } = useBackendActor();
  return useQuery<WtnPosition[]>({
    queryKey: KEYS.positions,
    queryFn: async () => {
      if (!actor) return [];
      return actor.listMyWtnPositions();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Fetch a single WTN position by id. */
export function useWtnPosition(positionId: string | null) {
  const { actor, isFetching } = useBackendActor();
  return useQuery<WtnPosition | null>({
    queryKey: positionKey(positionId ?? "none"),
    queryFn: async () => {
      if (!actor || !positionId) throw new Error("No actor or position id");
      return actor.getWtnPosition(BigInt(positionId));
    },
    enabled: !!actor && !isFetching && !!positionId,
  });
}

/** Create a WTN position. Invalidates the positions list on success. */
export function useCreateWtnPosition() {
  const queryClient = useQueryClient();
  const { actor } = useBackendActor();
  return useMutation<WtnPosition, Error, { name: string; startDate: bigint }>({
    mutationFn: async (vars) => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.addWtnPosition(vars.name, vars.startDate);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.positions });
    },
  });
}

/** Update a WTN position record. Invalidates the positions list on success. */
export function useUpdateWtnPosition() {
  const queryClient = useQueryClient();
  const { actor } = useBackendActor();
  return useMutation<void, Error, WtnPosition>({
    mutationFn: async (position) => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.updateWtnPosition(position);
    },
    onSuccess: (_data, position) => {
      const id = position.id.toString();
      void queryClient.invalidateQueries({ queryKey: KEYS.positions });
      void queryClient.invalidateQueries({ queryKey: positionKey(id) });
    },
  });
}

/**
 * Remove a WTN position. Invalidates the positions list, the per-position
 * queries (snapshots, stats, single position), and the portfolio-wide stats
 * so the cascade delete is reflected across the UI.
 */
export function useDeleteWtnPosition() {
  const queryClient = useQueryClient();
  const { actor } = useBackendActor();
  return useMutation<void, Error, bigint>({
    mutationFn: async (positionId) => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.removeWtnPosition(positionId);
    },
    onSuccess: (_data, positionId) => {
      const id = positionId.toString();
      void queryClient.invalidateQueries({ queryKey: KEYS.positions });
      void queryClient.invalidateQueries({ queryKey: positionKey(id) });
      void queryClient.invalidateQueries({ queryKey: snapshotsKey(id) });
      void queryClient.invalidateQueries({ queryKey: statsKey(id) });
      void queryClient.invalidateQueries({ queryKey: KEYS.portfolio });
    },
  });
}

/** List snapshots for a single WTN position. */
export function useWtnSnapshots(positionId: string | null) {
  const { actor, isFetching } = useBackendActor();
  return useQuery<WtnSnapshot[]>({
    queryKey: snapshotsKey(positionId ?? "none"),
    queryFn: async () => {
      if (!actor || !positionId) return [];
      return actor.getWtnSnapshots(BigInt(positionId));
    },
    enabled: !!actor && !isFetching && !!positionId,
  });
}

/** Per-position aggregate stats (totalEarned, capital, withdrawn, % return). */
export function useWtnStats(positionId: string | null) {
  const { actor, isFetching } = useBackendActor();
  return useQuery<WtnStats>({
    queryKey: statsKey(positionId ?? "none"),
    queryFn: async () => {
      if (!actor || !positionId) throw new Error("No actor or position id");
      return actor.getWtnStats(BigInt(positionId));
    },
    enabled: !!actor && !isFetching && !!positionId,
  });
}

/** Record a manual WTN snapshot. Invalidates snapshots, stats, and portfolio. */
export function useRecordWtnSnapshot() {
  const queryClient = useQueryClient();
  const { actor } = useBackendActor();
  return useMutation<
    WtnSnapshot,
    Error,
    {
      positionId: bigint;
      date: bigint;
      nicpHeld: number;
      totalIcpPaid: number;
      redeemableIcpValue: number;
    }
  >({
    mutationFn: async (vars) => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.recordWtnSnapshot(
        vars.positionId,
        vars.date,
        vars.nicpHeld,
        vars.totalIcpPaid,
        vars.redeemableIcpValue,
      );
    },
    onSuccess: (_data, vars) => {
      const id = vars.positionId.toString();
      void queryClient.invalidateQueries({ queryKey: snapshotsKey(id) });
      void queryClient.invalidateQueries({ queryKey: statsKey(id) });
      void queryClient.invalidateQueries({ queryKey: KEYS.positions });
      void queryClient.invalidateQueries({ queryKey: KEYS.portfolio });
    },
  });
}

/** Edit an existing WTN snapshot. Invalidates snapshots, stats, and portfolio. */
export function useEditWtnSnapshot() {
  const queryClient = useQueryClient();
  const { actor } = useBackendActor();
  return useMutation<
    void,
    Error,
    {
      positionId: bigint;
      date: bigint;
      newDate: bigint;
      newNicpHeld: number;
      newTotalIcpPaid: number;
      newRedeemableIcpValue: number;
    }
  >({
    mutationFn: async (vars) => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.editWtnSnapshot(
        vars.positionId,
        vars.date,
        vars.newDate,
        vars.newNicpHeld,
        vars.newTotalIcpPaid,
        vars.newRedeemableIcpValue,
      );
    },
    onSuccess: (_data, vars) => {
      const id = vars.positionId.toString();
      void queryClient.invalidateQueries({ queryKey: snapshotsKey(id) });
      void queryClient.invalidateQueries({ queryKey: statsKey(id) });
      void queryClient.invalidateQueries({ queryKey: KEYS.portfolio });
    },
  });
}

/** Delete a single WTN snapshot. Invalidates snapshots, stats, and portfolio. */
export function useDeleteWtnSnapshot() {
  const queryClient = useQueryClient();
  const { actor } = useBackendActor();
  return useMutation<void, Error, { positionId: bigint; date: bigint }>({
    mutationFn: async (vars) => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.deleteWtnSnapshot(vars.positionId, vars.date);
    },
    onSuccess: (_data, vars) => {
      const id = vars.positionId.toString();
      void queryClient.invalidateQueries({ queryKey: snapshotsKey(id) });
      void queryClient.invalidateQueries({ queryKey: statsKey(id) });
      void queryClient.invalidateQueries({ queryKey: KEYS.portfolio });
    },
  });
}

/**
 * Bulk-import past WTN readings (importWtnHistoricalData). On success the
 * snapshots, stats, and portfolio-wide queries are invalidated so the chart
 * / activity feed / aggregate cards refresh.
 */
export function useImportWtnHistoricalData() {
  const queryClient = useQueryClient();
  const { actor } = useBackendActor();
  return useMutation<
    void,
    Error,
    { positionId: bigint; entries: WtnHistoricalEntry[] }
  >({
    mutationFn: async (vars) => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.importWtnHistoricalData(vars.positionId, vars.entries);
    },
    onSuccess: (_data, vars) => {
      const id = vars.positionId.toString();
      void queryClient.invalidateQueries({ queryKey: snapshotsKey(id) });
      void queryClient.invalidateQueries({ queryKey: statsKey(id) });
      void queryClient.invalidateQueries({ queryKey: KEYS.positions });
      void queryClient.invalidateQueries({ queryKey: KEYS.portfolio });
    },
  });
}
