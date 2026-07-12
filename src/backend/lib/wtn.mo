import Map "mo:core/Map";
import List "mo:core/List";
import Array "mo:core/Array";
import Int "mo:core/Int";
import Float "mo:core/Float";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";

import Types "../types/wtn";

module {
  public type WtnPosition = Types.WtnPosition;
  public type WtnPositionId = Types.WtnPositionId;
  public type WtnSnapshot = Types.WtnSnapshot;
  public type WtnEventType = Types.WtnEventType;
  public type WtnStats = Types.WtnStats;
  public type WtnHistoricalEntry = Types.WtnHistoricalEntry;
  public type WtnPortfolioContribution = Types.WtnPortfolioContribution;

  /// Create a new WTN position owned by `owner`. The canister assigns the
  /// position id (monotonically increasing via the `nextWtnPositionId`
  /// record, which is mutated by reference). Returns the created position.
  public func createWtnPosition(
    wtnPositions : Map.Map<WtnPositionId, WtnPosition>,
    nextWtnPositionId : { var next : Nat },
    owner : Principal,
    name : Text,
    startDate : Int,
  ) : WtnPosition {
    let id = nextWtnPositionId.next;
    nextWtnPositionId.next := id + 1;
    let position : WtnPosition = {
      id;
      name;
      ownerId = owner;
      startDate;
    };
    wtnPositions.add(id, position);
    position;
  };

  /// List all WTN positions owned by the given principal.
  public func getWtnPositions(
    wtnPositions : Map.Map<WtnPositionId, WtnPosition>,
    owner : Principal,
  ) : [WtnPosition] {
    wtnPositions
      .filter(func(_id, p) = Principal.equal(p.ownerId, owner))
      .values()
      .toArray();
  };

  /// Look up a WTN position by id, verifying ownership. Returns null if the
  /// position does not exist; traps if it exists but is not owned by the caller.
  public func getWtnPosition(
    wtnPositions : Map.Map<WtnPositionId, WtnPosition>,
    caller : Principal,
    positionId : WtnPositionId,
  ) : ?WtnPosition {
    switch (wtnPositions.get(positionId)) {
      case (?position) {
        if (not Principal.equal(position.ownerId, caller)) {
          Runtime.trap("Not authorized to access this WTN position");
        };
        ?position;
      };
      case null null;
    };
  };

  /// Update an existing WTN position owned by the caller. Traps if the
  /// position does not exist or is not owned by the caller. Only `name` and
  /// `startDate` are mutable; `id` and `ownerId` are preserved from the
  /// stored record so a caller cannot reassign ownership or change the id.
  public func updateWtnPosition(
    wtnPositions : Map.Map<WtnPositionId, WtnPosition>,
    caller : Principal,
    position : WtnPosition,
  ) : () {
    switch (wtnPositions.get(position.id)) {
      case (?existing) {
        if (not Principal.equal(existing.ownerId, caller)) {
          Runtime.trap("Not authorized to update this WTN position");
        };
        wtnPositions.add(
          position.id,
          {
            id = existing.id;
            name = position.name;
            ownerId = existing.ownerId;
            startDate = position.startDate;
          },
        );
      };
      case null {
        Runtime.trap("WTN position not found");
      };
    };
  };

  /// Remove a WTN position owned by the caller AND cascade-delete all
  /// associated snapshots for that positionId. Traps if the position does
  /// not exist or is not owned by the caller.
  public func deleteWtnPosition(
    wtnPositions : Map.Map<WtnPositionId, WtnPosition>,
    wtnSnapshots : Map.Map<WtnPositionId, List.List<WtnSnapshot>>,
    caller : Principal,
    positionId : WtnPositionId,
  ) : () {
    // Verify ownership via getWtnPosition (traps if not owned / not found).
    ignore getWtnPosition(wtnPositions, caller, positionId);
    wtnPositions.remove(positionId);
    wtnSnapshots.remove(positionId);
  };

  /// Record a single WTN snapshot, classifying the event by comparing the
  /// entered nicpHeld to the previous snapshot's nicpHeld for the same
  /// position:
  ///   - nicpHeld increased → #capitalAdded (the increase in totalIcpPaid is
  ///     capital contributed, not reward).
  ///   - nicpHeld decreased → #withdrawal (reduce totalIcpPaid proportionally
  ///     via average cost basis; record the ICP that left the position).
  ///   - nicpHeld unchanged → #organicGrowth (the delta in redeemableIcpValue
  ///     is the actual reward for that day).
  /// The first snapshot for a position is classified as #capitalAdded (the
  /// initial buy-in). Returns the recorded snapshot.
  public func recordWtnSnapshot(
    wtnSnapshots : Map.Map<WtnPositionId, List.List<WtnSnapshot>>,
    positionId : WtnPositionId,
    date : Int,
    nicpHeld : Float,
    totalIcpPaid : Float,
    redeemableIcpValue : Float,
  ) : WtnSnapshot {
    let history = switch (wtnSnapshots.get(positionId)) {
      case (?h) h;
      case null {
        let fresh = List.empty<WtnSnapshot>();
        wtnSnapshots.add(positionId, fresh);
        fresh;
      };
    };

    let eventType : WtnEventType = switch (history.last()) {
      case (?prev) classify(nicpHeld, prev.nicpHeld);
      case null #capitalAdded;
    };

    let snapshot : WtnSnapshot = {
      positionId;
      date;
      nicpHeld;
      totalIcpPaid;
      redeemableIcpValue;
      eventType;
    };

    history.add(snapshot);
    snapshot;
  };

  /// Return all snapshots for a WTN position, sorted by date ascending.
  public func getWtnSnapshots(
    wtnSnapshots : Map.Map<WtnPositionId, List.List<WtnSnapshot>>,
    positionId : WtnPositionId,
  ) : [WtnSnapshot] {
    switch (wtnSnapshots.get(positionId)) {
      case (?history) {
        history.sort(func(a, b) = Int.compare(a.date, b.date)).toArray();
      };
      case null [];
    };
  };

  /// Edit a single WTN snapshot identified by (positionId, date): replace
  /// its date and the three numeric fields. After the edit, the history is
  /// re-sorted chronologically and eventTypes are recomputed for the edited
  /// entry and its new previous and next chronological neighbors. Traps if
  /// the position has no history or no snapshot exists at the given date.
  public func editWtnSnapshot(
    wtnSnapshots : Map.Map<WtnPositionId, List.List<WtnSnapshot>>,
    positionId : WtnPositionId,
    date : Int,
    newDate : Int,
    newNicpHeld : Float,
    newTotalIcpPaid : Float,
    newRedeemableIcpValue : Float,
  ) : () {
    let history = switch (wtnSnapshots.get(positionId)) {
      case (?h) h;
      case null { Runtime.trap("No snapshot history for WTN position") };
    };

    let sorted = history
      .toArray()
      .sort(func(a, b) = Int.compare(a.date, b.date))
      .toVarArray<WtnSnapshot>();

    let targetIdx = switch (sorted.findIndex(func(s) = s.date == date)) {
      case (?i) i;
      case null { Runtime.trap("No WTN snapshot at given date") };
    };

    let target = sorted[targetIdx];
    sorted[targetIdx] := {
      target with
      date = newDate;
      nicpHeld = newNicpHeld;
      totalIcpPaid = newTotalIcpPaid;
      redeemableIcpValue = newRedeemableIcpValue;
    };

    // Re-sort chronologically by the (possibly changed) date.
    let reSortedImm = sorted.toArray().sort(func(a, b) = Int.compare(a.date, b.date));
    let reSorted = reSortedImm.toVarArray<WtnSnapshot>();

    // Recompute eventTypes for the previous neighbor, the edited entry, and
    // the next neighbor. Order matters: each recompute reads the
    // predecessor's nicpHeld, so recompute prev → edited → next.
    let editedNewIdx = switch (reSorted.findIndex(func(s) = s.date == newDate)) {
      case (?i) i;
      case null { Runtime.trap("Edited WTN snapshot not found after re-sort") };
    };

    if (editedNewIdx > 0) {
      ignore recomputeAt(reSorted, editedNewIdx - 1);
    };
    ignore recomputeAt(reSorted, editedNewIdx);
    if (editedNewIdx + 1 < reSorted.size()) {
      ignore recomputeAt(reSorted, editedNewIdx + 1);
    };

    let newHistory = List.fromArray<WtnSnapshot>(reSorted.toArray());
    wtnSnapshots.add(positionId, newHistory);
  };

  /// Delete a single WTN snapshot identified by (positionId, date). After
  /// the delete, eventTypes are recomputed for the next chronological entry
  /// (since classification depends on the previous snapshot's nicpHeld).
  /// Traps if the position has no history or no snapshot exists at the
  /// given date.
  public func deleteWtnSnapshot(
    wtnSnapshots : Map.Map<WtnPositionId, List.List<WtnSnapshot>>,
    positionId : WtnPositionId,
    date : Int,
  ) : () {
    let history = switch (wtnSnapshots.get(positionId)) {
      case (?h) h;
      case null { Runtime.trap("No snapshot history for WTN position") };
    };

    let sorted = history.toArray().sort(func(a, b) = Int.compare(a.date, b.date));

    let targetIdx = switch (sorted.findIndex(func(s) = s.date == date)) {
      case (?i) i;
      case null { Runtime.trap("No WTN snapshot at given date") };
    };

    let remainingImm = sorted.filter(func(s) = not (s.date == date));

    // If the position now has no snapshots, remove the positionId from the
    // wtnSnapshots Map entirely so it does not leave a stale empty-list entry.
    if (remainingImm.size() == 0) {
      wtnSnapshots.remove(positionId);
      return;
    };

    // Recompute the eventType for the entry that now follows the deleted
    // entry's predecessor. The deleted entry was at `targetIdx`; after
    // removal, the entry that now occupies that index (if any) needs its
    // eventType recomputed against the entry at `targetIdx - 1` (or
    // #capitalAdded if targetIdx was 0).
    let remaining = remainingImm.toVarArray<WtnSnapshot>();
    if (targetIdx < remaining.size()) {
      ignore recomputeAt(remaining, targetIdx);
    };

    let newHistory = List.fromArray<WtnSnapshot>(remaining.toArray());
    wtnSnapshots.add(positionId, newHistory);
  };

  /// Bulk import historical entries for a WTN position, merging them into
  /// the position's existing snapshot history in chronological order without
  /// duplicating entries for dates that already exist. Each imported entry is
  /// classified using the same #capitalAdded / #withdrawal / #organicGrowth
  /// logic as recordWtnSnapshot, comparing each row to the chronologically-
  /// previous one. After import, the next real snapshot continues seamlessly
  /// from the last historical entry.
  public func importWtnHistoricalData(
    wtnSnapshots : Map.Map<WtnPositionId, List.List<WtnSnapshot>>,
    positionId : WtnPositionId,
    entries : [WtnHistoricalEntry],
  ) : () {
    // Sort incoming entries chronologically by date.
    let sorted = entries.sort(func(a, b) = Int.compare(a.date, b.date));

    // Build the merged history: existing entries plus imported entries that
    // do not duplicate an existing date, all in chronological order.
    let existing = switch (wtnSnapshots.get(positionId)) {
      case (?h) h.toArray();
      case null [];
    };

    // Collect existing dates for dedup.
    let existingDates = existing.map(func(s : WtnSnapshot) : Int = s.date);

    // Filter imported entries: skip any whose date already exists.
    let toImport = sorted.filter(
      func(e : WtnHistoricalEntry) : Bool {
        not existingDates.contains(e.date);
      },
    );

    // Merge existing + toImport into a single chronologically-sorted array
    // of "merge entries" carrying enough info to compute classifications.
    type MergeEntry = {
      date : Int;
      nicpHeld : Float;
      totalIcpPaid : Float;
      redeemableIcpValue : Float;
    };

    let existingMerged = existing.map(
      func(s : WtnSnapshot) : MergeEntry = {
        date = s.date;
        nicpHeld = s.nicpHeld;
        totalIcpPaid = s.totalIcpPaid;
        redeemableIcpValue = s.redeemableIcpValue;
      },
    );

    let importedMerged = toImport.map(
      func(e : WtnHistoricalEntry) : MergeEntry = {
        date = e.date;
        nicpHeld = e.nicpHeld;
        totalIcpPaid = e.totalIcpPaid;
        redeemableIcpValue = e.redeemableIcpValue;
      },
    );

    let merged : [MergeEntry] = existingMerged.concat(importedMerged).sort(
      func(a, b) = Int.compare(a.date, b.date),
    );

    // Rebuild the history list from the merged, sorted array, recomputing
    // every eventType against the chronologically-previous entry. The first
    // entry is #capitalAdded (initial buy-in).
    let newHistory = List.empty<WtnSnapshot>();
    var prevNicpHeld : ?Float = null;

    for (entry in merged.vals()) {
      let eventType : WtnEventType = switch (prevNicpHeld) {
        case (?prev) classify(entry.nicpHeld, prev);
        case null #capitalAdded;
      };

      let snapshot : WtnSnapshot = {
      positionId;
      date = entry.date;
      nicpHeld = entry.nicpHeld;
      totalIcpPaid = entry.totalIcpPaid;
      redeemableIcpValue = entry.redeemableIcpValue;
      eventType;
    };

      newHistory.add(snapshot);
      prevNicpHeld := ?entry.nicpHeld;
    };

    wtnSnapshots.add(positionId, newHistory);
  };

  /// Aggregate stats for a single WTN position:
  ///   - totalEarned             — sum of #organicGrowth deltas (the day-
  ///                               over-day change in redeemableIcpValue on
  ///                               days where nicpHeld was unchanged).
  ///   - totalCapitalContributed — totalIcpPaid (running cost basis from the
  ///                               latest snapshot).
  ///   - totalWithdrawn          — running total of ICP that left the
  ///                               position via #withdrawal events, computed
  ///                               using the average cost basis method: for
  ///                               each #withdrawal, the proportional
  ///                               redeemable value that left =
  ///                               oldRedeemableIcpValue *
  ///                               (nicpHeldDecrease / oldNicpHeld).
  ///   - percentReturn           — (redeemableIcpValue - totalIcpPaid) /
  ///                               totalIcpPaid, from the latest snapshot.
  ///   - redeemableIcpValue      — latest snapshot's redeemableIcpValue
  ///                               (0 if no snapshots).
  public func getWtnStats(
    position : WtnPosition,
    history : [WtnSnapshot],
  ) : WtnStats {
    var totalEarned : Float = 0.0;
    var totalWithdrawn : Float = 0.0;
    var prevRedeemable : ?Float = null;
    var prevNicpHeld : ?Float = null;
    var latestTotalIcpPaid : Float = 0.0;
    var latestRedeemable : Float = 0.0;

    for (s in history.vals()) {
      switch (s.eventType) {
        case (#organicGrowth) {
          switch (prevRedeemable) {
            case (?prev) {
              totalEarned += s.redeemableIcpValue - prev;
            };
            case null {};
          };
        };
        case (#withdrawal) {
          // Average cost basis: the ICP that left the position is the
          // proportional redeemable value that left =
          //   oldRedeemableIcpValue * (nicpHeldDecrease / oldNicpHeld).
          // This isolates the withdrawal portion from any organic growth
          // that may have occurred on the same day.
          switch (prevRedeemable, prevNicpHeld) {
            case (?oldRedeemable, ?oldNicpHeld) {
              if (oldNicpHeld > 0.0) {
                let nicpHeldDecrease = oldNicpHeld - s.nicpHeld;
                if (nicpHeldDecrease > 0.0) {
                  let withdrawn = oldRedeemable * (nicpHeldDecrease / oldNicpHeld);
                  totalWithdrawn += withdrawn;
                };
              };
            };
            case (_, _) {};
          };
        };
        case (#capitalAdded) {
          // No reward and no withdrawal on a buy day. The increase in
          // totalIcpPaid is capital, not earned.
        };
      };
      prevRedeemable := ?s.redeemableIcpValue;
      prevNicpHeld := ?s.nicpHeld;
      latestTotalIcpPaid := s.totalIcpPaid;
      latestRedeemable := s.redeemableIcpValue;
    };

    let percentReturn : Float = if (latestTotalIcpPaid == 0.0) {
      0.0;
    } else {
      ((latestRedeemable - latestTotalIcpPaid) / latestTotalIcpPaid) * 100.0;
    };

    {
      positionId = position.id;
      totalEarned;
      totalCapitalContributed = latestTotalIcpPaid;
      totalWithdrawn;
      percentReturn;
      redeemableIcpValue = latestRedeemable;
    };
  };

  /// Portfolio-wide contribution from a WTN position, used to combine WTN
  /// value into the same portfolio-wide aggregation as NNS neurons
  /// (StatsApi.getPortfolioStats). Returns the latest snapshot's
  /// redeemableIcpValue, the running cost basis, total earned, and total
  /// withdrawn so the stats layer can fold WTN into Total Staked/Maturity/
  /// blended APY.
  public func getWtnPortfolioContribution(
    position : WtnPosition,
    history : [WtnSnapshot],
  ) : WtnPortfolioContribution {
    let stats = getWtnStats(position, history);
    var latestRedeemable : Float = 0.0;
    // The latest snapshot is the chronologically-last entry.
    if (history.size() > 0) {
      let sorted = history.sort(func(a, b) = Int.compare(a.date, b.date));
      latestRedeemable := sorted[sorted.size() - 1].redeemableIcpValue;
    };
    {
      positionId = position.id;
      redeemableIcpValue = latestRedeemable;
      totalCapitalContributed = stats.totalCapitalContributed;
      totalEarned = stats.totalEarned;
      totalWithdrawn = stats.totalWithdrawn;
    };
  };

  /// Classify a snapshot given the previous snapshot's nicpHeld:
  ///   - nicpHeld increased → #capitalAdded
  ///   - nicpHeld decreased → #withdrawal
  ///   - nicpHeld unchanged → #organicGrowth
  func classify(currentNicpHeld : Float, prevNicpHeld : Float) : WtnEventType {
    if (currentNicpHeld > prevNicpHeld) {
      #capitalAdded;
    } else if (currentNicpHeld < prevNicpHeld) {
      #withdrawal;
    } else {
      #organicGrowth;
    };
  };

  /// Recompute the eventType for the entry at `idx` in a mutable array,
  /// based on the nicpHeld of the entry at `idx - 1` (or #capitalAdded when
  /// `idx` is 0). Returns the updated entry so the caller can chain further
  /// recomputes using its new nicpHeld.
  func recomputeAt(arr : [var WtnSnapshot], idx : Nat) : WtnSnapshot {
    let prevNicpHeld : ?Float = if (idx == 0) { null } else {
      ?arr[idx - 1].nicpHeld;
    };
    let s = arr[idx];
    let eventType : WtnEventType = switch (prevNicpHeld) {
      case (?prev) classify(s.nicpHeld, prev);
      case null #capitalAdded;
    };
    let updated = { s with eventType };
    arr[idx] := updated;
    updated;
  };
};
