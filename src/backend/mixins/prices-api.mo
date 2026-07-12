import Map "mo:core/Map";
import Runtime "mo:core/Runtime";
import Principal "mo:core/Principal";
import HttpOutcall "mo:caffeineai-http-outcalls/outcall";
import PriceTypes "../types/prices";
import Common "../types/common";
import PricesLib "../lib/prices";

mixin (
  priceCache : Map.Map<Text, PriceTypes.CachedPrice>,
  transform : shared query HttpOutcall.TransformationInput -> async HttpOutcall.TransformationOutput,
) {
  /// Fetch the current ICP price in USD and PLN. Serves from the stable price
  /// cache when the "current" entry is within the TTL (10 minutes); otherwise
  /// makes a fresh CoinGecko HTTP outcall and caches the result. On API error,
  /// returns the last cached price if available, otherwise a zero snapshot so
  /// the UI can show "price unavailable".
  public shared ({ caller }) func getCurrentIcpPrice() : async PriceTypes.PriceSnapshot {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    await PricesLib.getCurrentIcpPrice(priceCache, transform);
  };

  /// Fetch the historical ICP price for a given date (`YYYY-MM-DD` cache key
  /// format; the lib converts to `DD-MM-YYYY` for the CoinGecko API).
  /// Historical prices are cached indefinitely after the first fetch. On API
  /// error, returns the last cached price for that date if available, otherwise
  /// a zero snapshot so the UI can show "price unavailable".
  public shared ({ caller }) func getHistoricalIcpPrice(
    date : Text,
  ) : async PriceTypes.PriceSnapshot {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    await PricesLib.getHistoricalIcpPrice(priceCache, date, transform);
  };
};
