import Map "mo:core/Map";
import Time "mo:core/Time";
import Text "mo:core/Text";
import Types "../types/prices";
import HttpOutcall "mo:caffeineai-http-outcalls/outcall";
import Json "mo:json";

module {
  public type PriceSnapshot = Types.PriceSnapshot;
  public type CachedPrice = Types.CachedPrice;

  /// TTL for the "current" price cache entry, in nanoseconds (10 minutes).
  /// CoinGecko free tier is rate-limited (~10-30 calls/min, IP-based pool), so
  /// we avoid hammering the endpoint on every dashboard refresh.
  /// 10 minutes = 600_000_000_000 ns (precomputed literal — Motoko does not
  /// treat `10 * 60 * 1_000_000_000` as a static module-level expression).
  let currentPriceTtlNanos : Int = 600_000_000_000;

  /// CoinGecko coin id for ICP.
  let coinId : Text = "internet-computer";

  /// Build a zero PriceSnapshot used as the graceful-error fallback when no
  /// cached price is available. `cached = false` so the UI can distinguish
  /// "freshly fetched but unavailable" from "served from cache".
  func zeroSnapshot() : PriceSnapshot {
    { usd = 0.0; pln = 0.0; timestamp = Time.now(); cached = false };
  };

  /// Build a PriceSnapshot from a CachedPrice entry, marking it as cached.
  func snapshotFromCache(cached : CachedPrice) : PriceSnapshot {
    { usd = cached.usd; pln = cached.pln; timestamp = cached.fetchedAtNanos; cached = true };
  };

  /// Fetch the current ICP price in USD and PLN from CoinGecko
  /// (GET /simple/price?ids=internet-computer&vs_currencies=usd,pln), serving
  /// from the stable price cache when the "current" entry is younger than the
  /// configured TTL (10 minutes). On a fresh fetch the result is written back
  /// to the cache. On CoinGecko API error, the last cached "current" price is
  /// returned (with `cached = true`); if no cached price exists a zero
  /// PriceSnapshot is returned so the UI can show "price unavailable".
  public func getCurrentIcpPrice(
    priceCache : Map.Map<Text, CachedPrice>,
    transform : shared query HttpOutcall.TransformationInput -> async HttpOutcall.TransformationOutput,
  ) : async PriceSnapshot {
    let nowNanos = Time.now();

    // Serve from cache if the "current" entry is still fresh.
    switch (priceCache.get("current")) {
      case (?cached) {
        if (nowNanos - cached.fetchedAtNanos < currentPriceTtlNanos) {
          return snapshotFromCache(cached);
        };
      };
      case null {};
    };

    // Cache miss or expired — make a fresh CoinGecko HTTP outcall.
    let url = "https://api.coingecko.com/api/v3/simple/price?ids=" # coinId # "&vs_currencies=usd,pln";
    try {
      let body = await HttpOutcall.httpGetRequest(url, [], transform);
      let parsed = Json.parse(body);
      switch (parsed) {
        case (#ok(json)) {
          let usdResult = Json.getAsFloat(json, "internet-computer.usd");
          let plnResult = Json.getAsFloat(json, "internet-computer.pln");
          switch (usdResult, plnResult) {
            case (#ok(usd), #ok(pln)) {
              let entry : CachedPrice = { usd; pln; fetchedAtNanos = nowNanos };
              priceCache.add("current", entry);
              return { usd; pln; timestamp = nowNanos; cached = false };
            };
            case (_) {
              // JSON parsed but expected fields missing — fall back to cache.
              switch (priceCache.get("current")) {
                case (?cached) { return snapshotFromCache(cached) };
                case null { return zeroSnapshot() };
              };
            };
          };
        };
        case (#err(_)) {
          // JSON parse failure — fall back to cache.
          switch (priceCache.get("current")) {
            case (?cached) { return snapshotFromCache(cached) };
            case null { return zeroSnapshot() };
          };
        };
      };
    } catch (_) {
      // HTTP outcall error — fall back to last cached price or zero.
      switch (priceCache.get("current")) {
        case (?cached) { return snapshotFromCache(cached) };
        case null { return zeroSnapshot() };
      };
    };
  };

  /// Fetch the historical ICP price for a given date from CoinGecko
  /// (GET /coins/internet-computer/history?date=DD-MM-YYYY), where `date` is
  /// expected in `dd-mm-yyyy` format per the CoinGecko spec. Historical prices
  /// never change, so a cached entry for the date key (`YYYY-MM-DD`) is served
  /// indefinitely without re-fetching. On a fresh fetch the result is written
  /// back to the cache. On CoinGecko API error, the last cached price for that
  /// date is returned (with `cached = true`); if no cached price exists a zero
  /// PriceSnapshot is returned so the UI can show "price unavailable".
  public func getHistoricalIcpPrice(
    priceCache : Map.Map<Text, CachedPrice>,
    date : Text,
    transform : shared query HttpOutcall.TransformationInput -> async HttpOutcall.TransformationOutput,
  ) : async PriceSnapshot {
    // Historical prices never change — serve from cache indefinitely.
    switch (priceCache.get(date)) {
      case (?cached) { return snapshotFromCache(cached) };
      case null {};
    };

    // Cache miss — convert YYYY-MM-DD to DD-MM-YYYY for the CoinGecko API.
    // `date` is expected in YYYY-MM-DD format (the cache key).
    let apiDate = convertToCoinGeckoDate(date);
    let url = "https://api.coingecko.com/api/v3/coins/" # coinId # "/history?date=" # apiDate;
    let nowNanos = Time.now();

    try {
      let body = await HttpOutcall.httpGetRequest(url, [], transform);
      let parsed = Json.parse(body);
      switch (parsed) {
        case (#ok(json)) {
          let usdResult = Json.getAsFloat(json, "market_data.current_price.usd");
          let plnResult = Json.getAsFloat(json, "market_data.current_price.pln");
          switch (usdResult, plnResult) {
            case (#ok(usd), #ok(pln)) {
              let entry : CachedPrice = { usd; pln; fetchedAtNanos = nowNanos };
              priceCache.add(date, entry);
              return { usd; pln; timestamp = nowNanos; cached = false };
            };
            case (_) {
              switch (priceCache.get(date)) {
                case (?cached) { return snapshotFromCache(cached) };
                case null { return zeroSnapshot() };
              };
            };
          };
        };
        case (#err(_)) {
          switch (priceCache.get(date)) {
            case (?cached) { return snapshotFromCache(cached) };
            case null { return zeroSnapshot() };
          };
        };
      };
    } catch (_) {
      switch (priceCache.get(date)) {
        case (?cached) { return snapshotFromCache(cached) };
        case null { return zeroSnapshot() };
      };
    };
  };

  /// Convert a `YYYY-MM-DD` date string to the `DD-MM-YYYY` format required by
  /// the CoinGecko historical price endpoint. Returns the input unchanged if
  /// it does not match the expected `YYYY-MM-DD` shape (the caller will get a
  /// CoinGecko API error and fall back to the zero snapshot).
  func convertToCoinGeckoDate(yyyymmdd : Text) : Text {
    let parts = yyyymmdd.split(#char '-');
    let collected = parts.toArray();
    if (collected.size() != 3) {
      return yyyymmdd;
    };
    let year = collected[0];
    let month = collected[1];
    let day = collected[2];
    day # "-" # month # "-" # year;
  };
};
