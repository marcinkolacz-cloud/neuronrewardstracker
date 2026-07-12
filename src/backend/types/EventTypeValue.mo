import OQL "mo:caffeineai-oql";
import RewardTypes "rewards";

/// OQL row conversion for the `EventType` variant. Keeps the `DailyReward`
/// record on the auto-derive path by collapsing the variant to a stable
/// `#text` sentinel — one `Value` variant regardless of the tag, so the
/// reported schema type does not flip-flop by row order.
module {
  public func _toRow(self : RewardTypes.EventType) : OQL.Value {
    #text(
      switch self {
        case (#normalGrowth) "normalGrowth";
        case (#disburseOrSpawn) "disburseOrSpawn";
        case (#firstReading) "firstReading";
      }
    );
  };
};
