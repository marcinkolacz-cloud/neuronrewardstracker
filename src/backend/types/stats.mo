import Common "common";

module {
  public type NeuronId = Common.NeuronId;
  public type E8s = Common.E8s;

  /// One month's aggregated rewards for a neuron.
  public type MonthlyBreakdown = {
    year : Nat;
    month : Nat;            // 1..12
    totalDeltaE8s : Int;    // sum of deltas in that month
    readingCount : Nat;     // number of snapshots in that month
  };

  /// Aggregated stats for a single neuron.
  public type NeuronStats = {
    neuronId : NeuronId;
    totalRewardsE8s : Int;       // sum of all positive deltas
    percentageReturn : Float;     // totalRewards / initialStake * 100
    averageDailyRewardE8s : Int; // mean positive delta per day
    monthly : [MonthlyBreakdown];
  };

  /// Aggregated stats across all of a caller's neurons.
  public type PortfolioStats = {
    totalStakedE8s : E8s;        // sum of initialStakeE8s
    totalRewardsE8s : Int;       // sum of totalRewards across neurons
    percentageReturn : Float;     // totalRewards / totalStaked * 100
    neuronCount : Nat;
  };
};
