/**
 * Shared backend actor accessor.
 *
 * The `useActor(createActor)` hook from @caffeineai/core-infrastructure
 * already wires the InternetIdentityProvider auth context into the actor:
 * it creates an authenticated agent when the user is signed in and an
 * anonymous agent otherwise. We re-export a thin hook here so the rest of
 * the app has a single, well-typed entry point to the real generated
 * `Backend` actor from `@/backend`.
 *
 * All domain types (Neuron, DailyReward, EventType, SyncStatus, SyncResult,
 * NeuronStats, PortfolioStats, MonthlyBreakdown) come straight from the
 * generated `@/backend` bindings — never hand-written here.
 */

import { type Backend, createActor } from "@/backend";
import { useActor } from "@caffeineai/core-infrastructure";

// Re-export the real generated domain types so the rest of the app imports
// them from one place without reaching into `@/backend` directly.
export type {
  Backend,
  Neuron,
  NeuronId,
  DailyReward,
  EventType,
  SyncStatus,
  SyncResult,
  NeuronStats,
  PortfolioStats,
  PortfolioRewardStats,
  MonthlyBreakdown,
  HistoricalEntry,
  PriceSnapshot,
  E8s,
  DeltaE8s,
  Timestamp,
  WtnPosition,
  WtnPositionId,
  WtnSnapshot,
  WtnStats,
  WtnEventType,
  WtnHistoricalEntry,
} from "@/backend";

/**
 * Hook that returns the authenticated backend actor (or null while the
 * actor query is fetching). The actor is recreated automatically when the
 * identity changes (login / sign out / session restore).
 */
export function useBackendActor(): {
  actor: Backend | null;
  isFetching: boolean;
} {
  const { actor, isFetching } = useActor(createActor);
  return { actor, isFetching };
}
