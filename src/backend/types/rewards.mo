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
  };

  /// A single maturity reading for a neuron at a point in time.
  public type DailyReward = {
    neuronId : NeuronId;
    timestamp : Timestamp;
    maturityE8s : E8s;
    deltaE8s : DeltaE8s;
    eventType : EventType;
  };

  /// Bulk import entry for historical backfilling.
  public type HistoricalEntry = {
    timestamp : Timestamp;
    maturityE8s : E8s;
  };
};
