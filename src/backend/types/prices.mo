module {
  /// A fetched ICP price snapshot in USD and PLN.
  ///
  /// `cached` is true when the value was served from the stable price cache
  /// without making a fresh CoinGecko HTTP outcall (within the TTL for the
  /// "current" key, or any historical date — historical prices never change
  /// so they are cached indefinitely after the first fetch).
  public type PriceSnapshot = {
    usd : Float;
    pln : Float;
    timestamp : Int;   // IC Time.now() in ns at the moment the price was recorded
    cached : Bool;     // true when served from cache, false when freshly fetched
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
