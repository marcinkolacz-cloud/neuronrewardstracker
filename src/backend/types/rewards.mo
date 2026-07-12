import Common "common";

module {
  public type NeuronId = Common.NeuronId;
  public type Timestamp = Common.Timestamp;
  public type E8s = Common.E8s;
  public type DeltaE8s = Common.DeltaE8s;

  /// Classification of a reward snapshot delta.
  public type EventType = {
    #normalGrowth;      // positive delta — maturity grew
    #disburseOrSpawn;   // negative delta — maturity disbursed or spawned
    #firstReading;      // no prior snapshot — baseline reading, delta 0
    #mergedToStake;     // unstaked maturity merged into stake — value stays in
                        // the neuron, NOT a disbursement; excluded from Total
                        // Disbursed. Delta reflects the maturity that moved.
    #externalTopUp;     // stake increased from an external ICP top-up (sent
                        // directly to the neuron account), with no corresponding
                        // maturity drop. Distinct from #mergedToStake (which
                        // requires a maturity drop). `stakeDeltaE8s` carries
                        // the top-up amount; `deltaE8s` is 0 (no maturity
                        // change). Excluded from Total Rewards.
  };

  /// A single maturity reading for a neuron at a point in time.
  ///
  /// Maturity is stored as TWO separate fields so a neuron that switches
  /// auto-stake on/off over time keeps a continuous history:
  ///   - `unstakedMaturityE8s` — sourced from governance's
  ///     `maturity_e8s_equivalent` (the withdrawable maturity).
  ///   - `stakedMaturityE8s` — sourced from governance's
  ///     `staked_maturity_e8s_equivalent`, defaulting to 0 when absent.
  /// `autoStakeMaturity` is an informational flag (default false) recording
  /// the neuron's auto-stake mode at the time of the snapshot; it does NOT
  /// affect delta math. `deltaE8s` is computed from the COMBINED total
  /// (unstaked + staked) versus the previous snapshot's combined total, so a
  /// mode switch that shifts maturity between the two fields does not produce
  /// a spurious negative delta.
  ///
  /// `stakeDeltaE8s` records the change in the neuron's stake
  /// (`cached_neuron_stake_e8s`) versus the previous snapshot, separately from
  /// the maturity delta: positive for external top-ups, 0 for normal growth,
  /// negative for disbursements. It is the basis for the
  /// `#externalTopUp` event and for tracking total capital contributed.
  public type DailyReward = {
    neuronId : NeuronId;
    timestamp : Timestamp;
    unstakedMaturityE8s : E8s;
    stakedMaturityE8s : E8s;
    autoStakeMaturity : Bool;
    deltaE8s : DeltaE8s;
    stakeDeltaE8s : E8s;
    eventType : EventType;
  };

  /// Bulk import entry for historical backfilling.
  ///
  /// Stores both maturity components so backfilled history is consistent with
  /// live snapshots. `stakedMaturityE8s` defaults to 0 when the source data
  /// does not distinguish (the common case for backfill).
  public type HistoricalEntry = {
    timestamp : Timestamp;
    unstakedMaturityE8s : E8s;
    stakedMaturityE8s : E8s;
  };
};
