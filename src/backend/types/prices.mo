module {
  /// A fetched ICP price snapshot in USD and PLN.
  ///
  /// `cached` is true when the value was served from the stable price cache
  /// without making a fresh CoinGecko HTTP outcall (within the TTL for the
  /// "current" key, or any historical date — historical prices never change
  /// so they are cached indefinitely after the first fetch).
  ///
  /// `unavailable` is true when the price could not be determined: the HTTP
  /// outcall errored, returned a non-success status, or produced unparseable
  /// JSON, AND no cached entry existed for the requested date/key. In that case
  /// `usd`/`pln` are zero and the UI should show "price unavailable" instead of
  /// treating the zeros as a real price. This lets the frontend distinguish a
  /// genuine fetch failure from a legitimately-fetched price and avoids the
  /// "Fetching historical prices..." spinner hanging forever — the function
  /// always returns within bounded time (the outcall either resolves, errors,
  /// or traps, and the trap is caught).
  public type PriceSnapshot = {
    usd : Float;
    pln : Float;
    timestamp : Int;   // IC Time.now() in ns at the moment the price was recorded
    cached : Bool;     // true when served from cache, false when freshly fetched
    unavailable : Bool; // true when no price could be fetched AND none was cached
  };

  /// Cached price entry stored in the stable `priceCache` Map.
  ///
  /// The Map is keyed by date string: `"current"` for the live price (subject
  /// to a TTL, e.g. 10 minutes) and `"YYYY-MM-DD"` for historical dates (cached
  /// indefinitely since historical prices never change). `fetchedAtNanos` is
  /// the IC time at which the entry was stored, used to evaluate the TTL for
  /// the "current" key.
  public type CachedPrice = {
    usd : Float;
    pln : Float;
    fetchedAtNanos : Int;
  };
};
