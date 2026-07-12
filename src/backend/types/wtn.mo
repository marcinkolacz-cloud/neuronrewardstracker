import Common "common";

module {
  public type Timestamp = Common.Timestamp;

  /// Identifier for a WTN position (Nat, monotonically assigned by the canister).
  public type WtnPositionId = Nat;

  /// A WaterNeuron nICP liquid-staking position, fully separate from NNS
  /// neurons. No governance sync, no hotkey, no dissolve delay, no stakedE8s —
  /// the position is tracked entirely via manually-entered snapshots.
  public type WtnPosition = {
    id : WtnPositionId;       // canister-assigned position id
    name : Text;              // user-supplied label
    ownerId : Principal;      // authenticated caller who owns this record
    startDate : Timestamp;    // when the user began tracking (ns)
  };

  /// Classification of a WTN snapshot delta, comparing the current snapshot
  /// to the previous one for the same position:
  ///   - #capitalAdded  — nicpHeld increased (a "buy" event); the increase in
  ///     totalIcpPaid is capital contributed, not reward.
  ///   - #withdrawal    — nicpHeld decreased (an "unstake" event); reduce
  ///     totalIcpPaid proportionally (average cost basis) and record the ICP
  ///     that left the position into a running "Total Withdrawn" figure.
  ///   - #organicGrowth — nicpHeld unchanged; the delta in redeemableIcpValue
  ///     (holding nICP constant) is the actual reward for that day.
  public type WtnEventType = {
    #capitalAdded;
    #withdrawal;
    #organicGrowth;
  };

  /// A single manually-entered snapshot for a WTN position at a point in time.
  /// Three numeric fields are entered per snapshot (unlike the single maturity
  /// value for NNS neurons):
  ///   - nicpHeld           — total nICP currently held (running total; changes
  ///                          only on buy/sell days).
  ///   - totalIcpPaid       — cumulative ICP paid to acquire the currently-held
  ///                          nICP (cost basis; changes only on buy days).
  ///   - redeemableIcpValue — today's ICP-equivalent value if fully unstaked,
  ///                          read manually from waterneuron.fi's unstake page.
  public type WtnSnapshot = {
    positionId : WtnPositionId;
    date : Timestamp;
    nicpHeld : Float;
    totalIcpPaid : Float;
    redeemableIcpValue : Float;
    eventType : WtnEventType;
  };

  /// Aggregated stats for a single WTN position.
  ///   - totalEarned            — sum of #organicGrowth deltas.
  ///   - totalCapitalContributed — totalIcpPaid (running cost basis).
  ///   - totalWithdrawn          — running total of ICP that left the position
  ///                               via #withdrawal events (proportional
  ///                               redeemable value that left).
  ///   - percentReturn           — (redeemableIcpValue - totalIcpPaid) /
  ///                               totalIcpPaid.
  ///   - redeemableIcpValue      — latest snapshot's ICP-equivalent value if
  ///                               fully unstaked (0 if no snapshots).
  public type WtnStats = {
    positionId : WtnPositionId;
    totalEarned : Float;
    totalCapitalContributed : Float;
    totalWithdrawn : Float;
    percentReturn : Float;
    redeemableIcpValue : Float;
  };

  /// Bulk import entry for historical backfilling of a WTN position. One row
  /// per line in the paste-in "Import historical data" panel, adapted for 4
  /// tab-separated columns: date (DD/MM/YYYY), nicpHeld, totalIcpPaid,
  /// redeemableIcpValue. The date is parsed explicitly (DD/MM/YYYY) on the
  /// frontend and arrives here as a Timestamp in nanoseconds.
  public type WtnHistoricalEntry = {
    date : Timestamp;
    nicpHeld : Float;
    totalIcpPaid : Float;
    redeemableIcpValue : Float;
  };

  /// Portfolio-wide contribution from a WTN position, used to combine WTN
  /// value into the same portfolio-wide aggregation as NNS neurons
  /// (StatsApi.getPortfolioStats): Total Staked/Maturity/blended APY.
  public type WtnPortfolioContribution = {
    positionId : WtnPositionId;
    redeemableIcpValue : Float;     // latest snapshot's ICP-equivalent value
    totalCapitalContributed : Float; // running cost basis (totalIcpPaid)
    totalEarned : Float;             // sum of #organicGrowth deltas
    totalWithdrawn : Float;          // running total withdrawn
  };
};
