import List "mo:core/List";
import Map "mo:core/Map";
import VarArray "mo:core/VarArray";
import Int "mo:core/Int";
import Nat64 "mo:core/Nat64";
import Runtime "mo:core/Runtime";
import Types "../types/rewards";
import Common "../types/common";

module {
  public type DailyReward = Types.DailyReward;
  public type EventType = Types.EventType;
  public type HistoricalEntry = Types.HistoricalEntry;
  public type NeuronId = Common.NeuronId;
  public type E8s = Common.E8s;
  public type DeltaE8s = Common.DeltaE8s;
  public type Timestamp = Common.Timestamp;

  /// Record a single maturity snapshot, computing the delta vs the previous
  /// snapshot's COMBINED maturity total (unstaked + staked) for that neuron.
  ///
  /// Using the combined total for delta math means a neuron that switches
  /// auto-stake on/off — which shifts maturity between `unstakedMaturityE8s`
  /// and `stakedMaturityE8s` — does not produce a spurious negative delta;
  /// the total stays continuous. Negative deltas are classified as
  /// #disburseOrSpawn; the first reading is #firstReading with delta 0.
  ///
  /// `eventTypeOverride` lets a caller that has extra context (notably
  /// governance sync, which can see `cached_neuron_stake_e8s`) force a
  /// specific eventType instead of the auto-classification. This is how
  /// Merge Maturity events are marked #mergedToStake: the combined-total
  /// delta is still computed (and is negative, reflecting the maturity that
  /// left the maturity bucket and entered the stake bucket), but the
  /// #mergedToStake tag tells the stats layer to exclude the event from
  /// Total Disbursed. Pass null for the default auto-classification.
  ///
  /// `stakeDeltaE8sOverride` carries the change in the neuron's stake
  /// (`cached_neuron_stake_e8s`) versus the previous snapshot. It is only
  /// meaningful for the override event types: #externalTopUp (the top-up
  /// amount) and #mergedToStake (the maturity merged into stake). For all
  /// other event types (including the default auto-classification) it is
  /// ignored and the snapshot's `stakeDeltaE8s` is set to 0 — normal growth
  /// and disbursements do not change the externally-contributed capital
  /// baseline. Pass 0 when not applicable.
  public func recordSnapshot(
    rewards : Map.Map<NeuronId, List.List<DailyReward>>,
    neuronId : NeuronId,
    unstakedMaturityE8s : E8s,
    stakedMaturityE8s : E8s,
    autoStakeMaturity : Bool,
    timestamp : Timestamp,
    eventTypeOverride : ?EventType,
    stakeDeltaE8sOverride : E8s,
  ) : DailyReward {
    let history = switch (rewards.get(neuronId)) {
      case (?h) h;
      case null {
        let fresh = List.empty<DailyReward>();
        rewards.add(neuronId, fresh);
        fresh;
      };
    };

    let combinedTotal : Int = Nat.toInt(unstakedMaturityE8s.toNat()) + Nat.toInt(stakedMaturityE8s.toNat());

    let (delta, eventType) = switch (eventTypeOverride) {
      case (?override) {
        // Caller-provided eventType (e.g. #mergedToStake). Still compute the
        // delta from the combined total so the history stays continuous; for
        // a first reading with an override, delta is 0.
        let d : Int = switch (history.last()) {
          case (?prev) {
            let prevCombined : Int = Nat.toInt(prev.unstakedMaturityE8s.toNat()) + Nat.toInt(prev.stakedMaturityE8s.toNat());
            combinedTotal - prevCombined;
          };
          case null 0;
        };
        (d, override);
      };
      case null {
        switch (history.last()) {
          case (?prev) {
            let prevCombined : Int = Nat.toInt(prev.unstakedMaturityE8s.toNat()) + Nat.toInt(prev.stakedMaturityE8s.toNat());
            let d : Int = combinedTotal - prevCombined;
            if (d < 0) { (d, #disburseOrSpawn) } else { (d, #normalGrowth) };
          };
          case null { (0, #firstReading) };
        };
      };
    };

    // stakeDeltaE8s is only meaningful for the override event types that
    // record a stake change: #externalTopUp (external ICP added to the
    // neuron) and #mergedToStake (maturity merged into stake). For all other
    // event types (including the default auto-classification) it is 0 —
    // normal growth and disbursements do not change the externally-
    // contributed capital baseline.
    let stakeDelta : E8s = switch (eventTypeOverride) {
      case (?#externalTopUp) stakeDeltaE8sOverride;
      case (?#mergedToStake) stakeDeltaE8sOverride;
      case _ 0 : E8s;
    };

    let snapshot : DailyReward = {
      neuronId;
      timestamp;
      unstakedMaturityE8s;
      stakedMaturityE8s;
      autoStakeMaturity;
      deltaE8s = delta;
      stakeDeltaE8s = stakeDelta;
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
      let combinedTotal : Int = Nat.toInt(entry.unstakedMaturityE8s.toNat()) + Nat.toInt(entry.stakedMaturityE8s.toNat());
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
        stakeDeltaE8s = 0 : E8s;
        eventType;
      };

      newHistory.add(snapshot);
      prevCombined := ?combinedTotal;
    };

    rewards.add(neuronId, newHistory);
  };

  /// Combined maturity total (unstaked + staked) as a signed Int for delta math.
  func combinedTotal(r : DailyReward) : Int {
    Nat.toInt(r.unstakedMaturityE8s.toNat()) + Nat.toInt(r.stakedMaturityE8s.toNat());
  };

  /// Compute (delta, eventType) for an entry given the previous entry's
  /// combined total (if any). First entry → delta 0, #firstReading;
  /// balance drop vs previous → #disburseOrSpawn; otherwise #normalGrowth.
  func classifyDelta(currentTotal : Int, prevTotal : ?Int) : (DeltaE8s, EventType) {
    switch (prevTotal) {
      case (?prev) {
        let d : Int = currentTotal - prev;
        if (d < 0) { (d, #disburseOrSpawn) } else { (d, #normalGrowth) };
      };
      case null { (0, #firstReading) };
    };
  };

  /// Recompute the delta and eventType for the entry at `idx` in a mutable
  /// array, based on the combined total of the entry at `idx - 1` (or
  /// #firstReading when `idx` is 0). Returns the updated entry so the caller
  /// can chain further recomputes using its new combined total.
  ///
  /// Recomputed entries lose their original override context (e.g. a
  /// #mergedToStake or #externalTopUp tag set by governance sync), so they
  /// are re-classified purely by the combined-total delta math and their
  /// `stakeDeltaE8s` is reset to 0 — manual edits and deletes do not have
  /// stake-change data to re-derive.
  func recomputeAt(arr : [var DailyReward], idx : Nat) : DailyReward {
    let prevTotal : ?Int = if (idx == 0) { null } else {
      ?combinedTotal(arr[idx - 1]);
    };
    let r = arr[idx];
    let total = combinedTotal(r);
    let (delta, eventType) = classifyDelta(total, prevTotal);
    let updated = { r with deltaE8s = delta; eventType; stakeDeltaE8s = 0 : E8s };
    arr[idx] := updated;
    updated;
  };

  /// Edit a single snapshot identified by (neuronId, timestamp): replace its
  /// timestamp with `newTimestamp` and its combined maturity total with
  /// `newMaturityE8s`. The new total is applied to the unstaked component and
  /// the staked component is left unchanged (the edit shifts the combined
  /// total via the unstaked field, which is the manually-withdrawable
  /// maturity). After the edit, the history is re-sorted chronologically and
  /// deltas/eventTypes are recomputed for the edited entry and its new
  /// previous and next chronological neighbors. Traps if the neuron has no
  /// history or no snapshot exists at the given timestamp.
  public func editSnapshot(
    rewards : Map.Map<NeuronId, List.List<DailyReward>>,
    neuronId : NeuronId,
    timestamp : Timestamp,
    newTimestamp : Timestamp,
    newMaturityE8s : E8s,
  ) : () {
    let history = switch (rewards.get(neuronId)) {
      case (?h) h;
      case null { Runtime.trap("No reward history for neuron") };
    };

    // Work on a sorted mutable array for index-stable mutation.
    let sorted = history.toArray().sort(func(a, b) = Int.compare(a.timestamp, b.timestamp)).toVarArray<DailyReward>();

    // Locate the entry to edit by original timestamp.
    let targetIdx = switch (sorted.findIndex(func(r) = r.timestamp == timestamp)) {
      case (?i) i;
      case null { Runtime.trap("No snapshot at given timestamp") };
    };

    // Apply the edit: new timestamp + new unstaked maturity (staked unchanged).
    let target = sorted[targetIdx];
    sorted[targetIdx] := {
      target with
      timestamp = newTimestamp;
      unstakedMaturityE8s = newMaturityE8s;
    };

    // Re-sort chronologically by the (possibly changed) timestamp. `sort` on a
    // [var T] is not available, so round-trip through an immutable array.
    let reSortedImm = sorted.toArray().sort(func(a, b) = Int.compare(a.timestamp, b.timestamp));
    let reSorted = reSortedImm.toVarArray<DailyReward>();

    // Recompute deltas for the edited entry and its new prev/next neighbors.
    // The edited entry's new index may differ after re-sorting.
    let editedNewIdx = switch (reSorted.findIndex(func(r) = r.timestamp == newTimestamp)) {
      case (?i) i;
      case null {
        // Should be unreachable: we just inserted newTimestamp. Trap defensively.
        Runtime.trap("Edited entry not found after re-sort");
      };
    };

    // Recompute the previous neighbor (if any), the edited entry, and the
    // next neighbor (if any). Order matters: each recompute reads the
    // predecessor's combined total, so recompute prev → edited → next.
    if (editedNewIdx > 0) {
      ignore recomputeAt(reSorted, editedNewIdx - 1);
    };
    ignore recomputeAt(reSorted, editedNewIdx);
    if (editedNewIdx + 1 < reSorted.size()) {
      ignore recomputeAt(reSorted, editedNewIdx + 1);
    };

    // Rebuild the List from the recomputed array and persist.
    let newHistory = List.fromArray<DailyReward>(reSorted.toArray());
    rewards.add(neuronId, newHistory);
  };

  /// Delete a single snapshot identified by (neuronId, timestamp). After the
  /// delete, deltas/eventTypes are recomputed for the next chronological
  /// entry (since delta depends on the previous entry's balance), and
  /// eventType is re-evaluated for the affected entry (first entry becomes
  /// #firstReading, balance drops become #disburseOrSpawn). Traps if the
  /// neuron has no history or no snapshot exists at the given timestamp.
  public func deleteSnapshot(
    rewards : Map.Map<NeuronId, List.List<DailyReward>>,
    neuronId : NeuronId,
    timestamp : Timestamp,
  ) : () {
    let history = switch (rewards.get(neuronId)) {
      case (?h) h;
      case null { Runtime.trap("No reward history for neuron") };
    };

    // Work on a sorted array copy.
    let sorted = history.toArray().sort(func(a, b) = Int.compare(a.timestamp, b.timestamp));

    // Locate the entry to delete by timestamp.
    let targetIdx = switch (sorted.findIndex(func(r) = r.timestamp == timestamp)) {
      case (?i) i;
      case null { Runtime.trap("No snapshot at given timestamp") };
    };

    // Build the array with the target removed.
    let remainingImm = sorted.filter(
      func(r) = not (r.timestamp == timestamp),
    );

    // If the neuron now has no snapshots, remove the neuronId from the
    // rewards Map entirely so it does not leave a stale empty-list entry.
    if (remainingImm.size() == 0) {
      rewards.remove(neuronId);
      return;
    };

    // Recompute the delta for the entry that now follows the deleted entry's
    // predecessor. The deleted entry was at `targetIdx`; after removal, the
    // entry that now occupies that index (if any) needs its delta recomputed
    // against the entry at `targetIdx - 1` (or #firstReading if targetIdx was 0).
    let remaining = remainingImm.toVarArray<DailyReward>();
    if (targetIdx < remaining.size()) {
      ignore recomputeAt(remaining, targetIdx);
    };

    // Rebuild the List and persist.
    let newHistory = List.fromArray<DailyReward>(remaining.toArray());
    rewards.add(neuronId, newHistory);
  };
};
