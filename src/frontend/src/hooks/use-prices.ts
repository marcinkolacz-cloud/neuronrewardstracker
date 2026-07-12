/**
 * React Query hooks for ICP price data (CoinGecko via backend cache).
 *   useIcpPrice          — current ICP price in USD + PLN (getCurrentIcpPrice)
 *   useHistoricalPrices  — batch of historical prices keyed by date string
 *                          (getHistoricalIcpPrice, one call per date)
 *
 * The backend caches prices in stable storage to respect CoinGecko rate
 * limits: the "current" price has a ~10-minute TTL and historical prices are
 * cached indefinitely. `PriceSnapshot.cached` is true when the value was
 * served from cache without a fresh HTTP outcall.
 */

import { type PriceSnapshot, useBackendActor } from "@/lib/backend-actor";
import { useQuery } from "@tanstack/react-query";

/** 10 minutes — matches the backend "current" price cache TTL. */
const CURRENT_PRICE_STALE_MS = 10 * 60 * 1000;

/**
 * EMERGENCY MITIGATION FLAG — historical ICP price fetching.
 *
 * The neuron detail page fires one backend CoinGecko HTTP outcall PER
 * distinct reward date on every page mount (potentially hundreds of
 * concurrent outcalls for a long-running neuron). The 18s frontend
 * per-call timeout does NOT cancel the underlying backend outcall (JS
 * promises are not cancellable), so cycles are still burned even after
 * the frontend stops waiting.
 *
 * Set this to `false` to disable ALL historical price fetching: the
 * `useHistoricalPrices` hook returns an empty settled Map immediately
 * (no backend calls), the "Fetching historical prices…" loading text
 * never appears, and the CSV export skips per-date price lookups.
 *
 * Flip back to `true` to re-enable once the backend batching / caching
 * is fixed. The code paths below remain intact and compile either way.
 */
export const HISTORICAL_PRICES_ENABLED = false;

/**
 * Per-date historical price fetch timeout. If a single
 * `getHistoricalIcpPrice` call has not resolved within this bound, it is
 * treated as a failure for that date (resolved to `null`) so the overall
 * batch always settles. 18s is generous enough for a cold CoinGecko
 * outcall + cache write, but bounded so the UI can never spin forever.
 */
const HISTORICAL_PRICE_TIMEOUT_MS = 18_000;

/**
 * Race a promise against a timeout. Resolves to `null` if the timeout
 * fires first, so callers can treat a timed-out date as "no price" without
 * rejecting the whole batch. The underlying actor call is not cancelled
 * (JS promises are not cancellable), but its result is simply ignored once
 * the timeout has won the race.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Current ICP price in USD and PLN. Refetches on mount so a returning user
 * always sees a fresh-ish price; stays fresh for 10 minutes (matching the
 * backend cache TTL) to avoid hammering CoinGecko.
 */
export function useIcpPrice() {
  const { actor, isFetching } = useBackendActor();
  return useQuery<PriceSnapshot>({
    queryKey: ["icp-price", "current"] as const,
    queryFn: async () => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.getCurrentIcpPrice();
    },
    enabled: !!actor && !isFetching,
    refetchOnMount: true,
    staleTime: CURRENT_PRICE_STALE_MS,
  });
}

/**
 * Batch-fetch historical ICP prices for a set of date strings
 * (`dd-mm-yyyy` per the CoinGecko historical endpoint spec). Returns a
 * Map<date, PriceSnapshot> so callers can look up a price by date in O(1).
 *
 * Each date is fetched as its own actor call so the backend can cache them
 * independently (historical prices never change, so they are cached
 * indefinitely on the backend and effectively forever in the React Query
 * cache via staleTime: Infinity).
 *
 * Robustness: uses `Promise.allSettled` + a per-call timeout so a single
 * hanging or rejected date never sinks the whole batch. Dates that time
 * out or reject are simply omitted from the returned Map; callers should
 * treat a missing key as "price unavailable" (which they already do via
 * `Map.get(key) ?? null`). The query therefore always settles within
 * ~HISTORICAL_PRICE_TIMEOUT_MS — it can never stay pending forever.
 *
 * `unavailable` flag: the backend may mark a PriceSnapshot as
 * `unavailable: true` when CoinGecko had no data for that date (e.g. a
 * holiday or a date outside CoinGecko's history). Such a snapshot is a
 * real entry in the backend cache but carries no usable price, so we
 * treat it exactly like a timed-out / missing date: it is omitted from
 * the returned Map. The field is additive on the backend side and may not
 * yet be present in the generated bindings, so we read it defensively via
 * a runtime presence check (`(snap as ...).unavailable === true`) rather
 * than relying on the TypeScript type. This keeps the frontend correct
 * both before and after `pnpm bindgen` regenerates the bindings.
 */
export function useHistoricalPrices(dates: string[]) {
  const { actor, isFetching } = useBackendActor();
  return useQuery<Map<string, PriceSnapshot>>({
    queryKey: ["icp-price", "historical", dates] as const,
    queryFn: async () => {
      // EMERGENCY MITIGATION: when the flag is off, never call the
      // backend. Return an empty Map so consumers see "no prices"
      // (a settled, non-fetching state) rather than hanging on the
      // "Fetching historical prices…" loading text. The full fetch
      // logic below is preserved for re-enablement.
      if (!HISTORICAL_PRICES_ENABLED) return new Map();
      if (!actor) return new Map();
      const settled = await Promise.allSettled(
        dates.map(async (date) => {
          const snapshot = await withTimeout(
            actor.getHistoricalIcpPrice(date),
            HISTORICAL_PRICE_TIMEOUT_MS,
          );
          return [date, snapshot] as const;
        }),
      );
      const map = new Map<string, PriceSnapshot>();
      for (const result of settled) {
        if (result.status === "fulfilled") {
          const [date, snapshot] = result.value;
          // Timed-out calls resolve to null; skip them so callers see a
          // missing key rather than a null entry.
          if (snapshot == null) continue;
          // The backend may return a snapshot flagged `unavailable: true`
          // when CoinGecko had no price for that date. Treat it the same
          // as a missing key so the UI shows "price unavailable". The
          // field is additive and may be absent from the generated type,
          // so check for its presence at runtime.
          if (isPriceUnavailable(snapshot)) continue;
          map.set(date, snapshot);
        }
        // Rejected calls are intentionally swallowed: a single date
        // failing (e.g. CoinGecko 429 for one date) should not prevent
        // the rest of the batch from populating the Map.
      }
      return map;
    },
    // When the flag is off, disable the query entirely so it never
    // fetches and `isFetching` stays false (consumers treat that as
    // "settled"). The queryFn guard above is a belt-and-suspenders.
    enabled:
      HISTORICAL_PRICES_ENABLED && !!actor && !isFetching && dates.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * Runtime check for the backend's additive `unavailable` flag on
 * PriceSnapshot. The field is `true` when CoinGecko had no price for the
 * requested date. It is additive on the backend side and may not yet be
 * present in the generated `PriceSnapshot` TypeScript type (until
 * `pnpm bindgen` regenerates the bindings), so we narrow via a runtime
 * presence check rather than `snap.unavailable`. This keeps the frontend
 * compiling against the current bindings and correct once the field
 * arrives.
 */
function isPriceUnavailable(snap: PriceSnapshot): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (snap as any).unavailable === true;
}
