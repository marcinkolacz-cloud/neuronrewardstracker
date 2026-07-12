import List "mo:core/List";
import Map "mo:core/Map";
import Int "mo:core/Int";
import Nat64 "mo:core/Nat64";
import Types "../types/rewards";
import Common "../types/common";

module {
  public type DailyReward = Types.DailyReward;
  public type EventType = Types.EventType;
  public type HistoricalEntry = Types.HistoricalEntry;
  public type NeuronId = Common.NeuronId;
  public type E8s = Common.E8s;
  public type Timestamp = Common.Timestamp;

  /// Record a single maturity snapshot, computing the delta vs the previous
  /// snapshot's COMBINED maturity total (unstaked + staked) for that neuron.
  ///
  /// Using the combined total for delta math means a neuron that switches
  /// auto-stake on/off — which shifts maturity between `unstakedMaturityE8s`
  /// and `stakedMaturityE8s` — does not produce a spurious negative delta;
  /// the total stays continuous. Negative deltas are classified as
  /// #disburseOrSpawn; the first reading is #firstReading with delta 0.
  public func recordSnapshot(
    rewards : Map.Map<NeuronId, List.List<DailyReward>>,
    neuronId : NeuronId,
    unstakedMaturityE8s : E8s,
    stakedMaturityE8s : E8s,
    autoStakeMaturity : Bool,
    timestamp : Timestamp,
  ) : DailyReward {
    let history = switch (rewards.get(neuronId)) {
      case (?h) h;
      case null {
        let fresh = List.empty<DailyReward>();
        rewards.add(neuronId, fresh);
        fresh;
      };
    };

    let combinedTotal : Int = Int.fromNat(unstakedMaturityE8s.toNat()) + Int.fromNat(stakedMaturityE8s.toNat());

    let (delta, eventType) = switch (history.last()) {
      case (?prev) {
        let prevCombined : Int = Int.fromNat(prev.unstakedMaturityE8s.toNat()) + Int.fromNat(prev.stakedMaturityE8s.toNat());
        let d : Int = combinedTotal - prevCombined;
        if (d < 0) { (d, #disburseOrSpawn) } else { (d, #normalGrowth) };
      };
      case null { (0, #firstReading) };
    };

    let snapshot : DailyReward = {
      neuronId;
      timestamp;
      unstakedMaturityE8s;
      stakedMaturityE8s;
      autoStakeMaturity;
      deltaE8s = delta;
      eventType;
    };

    history.add(snapshot);
    snapshot;
  };

  /// Return all snapshots for a neuron, sorted by timestamp ascending.
  public func getRewardHistory(
    rewards : Map.Map<NeuronId, List.List<DailyReward>>,
    neuronId : NeuronId,
  ) : [DailyReward] {
    switch (rewards.get(neuronId)) {
      case (?history) {
        history.sort(func(a, b) = Int.compare(a.timestamp, b.timestamp)).toArray();
      };
      case null [];
    };
  };

  /// Bulk import historical entries, computing deltas the same way as
  /// recordSnapshot (from the combined total). Entries are processed in the
  /// order given. `autoStakeMaturity` defaults to false for backfilled data
  /// since the historical mode is generally unknown.
  public func importHistoricalData(
    rewards : Map.Map<NeuronId, List.List<DailyReward>>,
    neuronId : NeuronId,
    entries : [HistoricalEntry],
  ) : () {
    for (entry in entries.vals()) {
      ignore recordSnapshot(
        rewards,
        neuronId,
        entry.unstakedMaturityE8s,
        entry.stakedMaturityE8s,
        false,
        entry.timestamp,
      );
    };
  };
};
