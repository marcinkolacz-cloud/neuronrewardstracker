import List "mo:core/List";
import Map "mo:core/Map";
import Array "mo:core/Array";
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

  /// Bulk import historical entries, merging them into the neuron's existing
  /// DailyReward history in chronological order without duplicating entries
  /// for timestamps that already exist.
  ///
  /// Delta computation matches recordSnapshot's combined-total logic: each
  /// inserted entry's delta is computed against the chronologically-previous
  /// entry (existing or just-imported), using the COMBINED maturity total
  /// (unstaked + staked). Negative deltas are classified as
  /// #disburseOrSpawn; the first-ever entry for the neuron uses
  /// #firstReading with delta 0. `autoStakeMaturity` defaults to false for
  /// backfilled data since the historical mode is generally unknown.
  ///
  /// After import, the next real sync continues seamlessly from the last
  /// historical entry because recordSnapshot computes its delta against the
  /// last appended list entry — which, after this merge, is the
  /// chronologically-last entry.
  public func importHistoricalData(
    rewards : Map.Map<NeuronId, List.List<DailyReward>>,
    neuronId : NeuronId,
    entries : [HistoricalEntry],
  ) : () {
    // Sort incoming entries chronologically by timestamp.
    let sorted = entries.sort(func(a, b) = Int.compare(a.timestamp, b.timestamp));

    // Build the merged history: existing entries plus imported entries that
    // do not duplicate an existing timestamp, all in chronological order.
    let existing = switch (rewards.get(neuronId)) {
      case (?h) h.toArray();
      case null [];
    };

    // Collect existing timestamps for dedup (List is unsorted in append
    // order, so we cannot assume order; check all).
    let existingTimestamps = existing.map(func(r : DailyReward) : Timestamp = r.timestamp);

    // Filter imported entries: skip any whose timestamp already exists.
    let toImport = sorted.filter(
      func(e : HistoricalEntry) : Bool {
        not existingTimestamps.contains(e.timestamp);
      },
    );

    // Merge existing + toImport into a single chronologically-sorted array
    // of "merge entries" carrying enough info to compute deltas.
    type MergeEntry = {
      timestamp : Timestamp;
      unstakedMaturityE8s : E8s;
      stakedMaturityE8s : E8s;
      autoStakeMaturity : Bool;
    };

    let existingMerged = existing.map(
      func(r : DailyReward) : MergeEntry = {
        timestamp = r.timestamp;
        unstakedMaturityE8s = r.unstakedMaturityE8s;
        stakedMaturityE8s = r.stakedMaturityE8s;
        autoStakeMaturity = r.autoStakeMaturity;
      },
    );

    let importedMerged = toImport.map(
      func(e : HistoricalEntry) : MergeEntry = {
        timestamp = e.timestamp;
        unstakedMaturityE8s = e.unstakedMaturityE8s;
        stakedMaturityE8s = e.stakedMaturityE8s;
        autoStakeMaturity = false;
      },
    );

    let merged : [MergeEntry] = existingMerged.concat(importedMerged).sort(
      func(a, b) = Int.compare(a.timestamp, b.timestamp),
    );

    // Rebuild the history list from the merged, sorted array, recomputing
    // every delta against the chronologically-previous entry. This keeps
    // existing entries' deltas correct even when an imported entry lands
    // before them, and ensures imported entries get correct deltas too.
    let newHistory = List.empty<DailyReward>();
    var prevCombined : ?Int = null;

    for (entry in merged.vals()) {
      let combinedTotal : Int = Int.fromNat(entry.unstakedMaturityE8s.toNat()) + Int.fromNat(entry.stakedMaturityE8s.toNat());
      let (delta, eventType) = switch (prevCombined) {
        case (?prev) {
          let d : Int = combinedTotal - prev;
          if (d < 0) { (d, #disburseOrSpawn) } else { (d, #normalGrowth) };
        };
        case null { (0, #firstReading) };
      };

      let snapshot : DailyReward = {
        neuronId;
        timestamp = entry.timestamp;
        unstakedMaturityE8s = entry.unstakedMaturityE8s;
        stakedMaturityE8s = entry.stakedMaturityE8s;
        autoStakeMaturity = entry.autoStakeMaturity;
        deltaE8s = delta;
        eventType;
      };

      newHistory.add(snapshot);
      prevCombined := ?combinedTotal;
    };

    rewards.add(neuronId, newHistory);
  };
};
