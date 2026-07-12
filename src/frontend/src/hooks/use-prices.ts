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
 * Each date is fetched as its own query so React Query can cache them
 * independently (historical prices never change, so they are cached
 * indefinitely on the backend and effectively forever in the React Query
 * cache via staleTime: Infinity).
 */
export function useHistoricalPrices(dates: string[]) {
  const { actor, isFetching } = useBackendActor();
  return useQuery<Map<string, PriceSnapshot>>({
    queryKey: ["icp-price", "historical", dates] as const,
    queryFn: async () => {
      if (!actor) return new Map();
      const results = await Promise.all(
        dates.map(async (date) => {
          const snapshot = await actor.getHistoricalIcpPrice(date);
          return [date, snapshot] as const;
        }),
      );
      return new Map(results);
    },
    enabled: !!actor && !isFetching && dates.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
