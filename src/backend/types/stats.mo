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
    momDeltaE8s : Int;     // month-over-month delta vs the previous month
  };

  /// Aggregated stats for a single neuron.
  public type NeuronStats = {
    neuronId : NeuronId;
    totalRewardsE8s : Int;       // sum of all positive deltas
    percentageReturn : Float;     // totalRewards / initialStake * 100
    averageDailyRewardE8s : Int; // mean positive delta per day
    monthly : [MonthlyBreakdown];
    apy30d : Float;              // annualized return from trailing 30-day avg daily growth rate
    overallReturnPct : Float;    // overall % return since the neuron's start date
  };

  /// Aggregated stats across all of a caller's neurons.
  public type PortfolioStats = {
    totalStakedE8s : E8s;        // sum of initialStakeE8s
    totalRewardsE8s : Int;       // sum of totalRewards across neurons
    percentageReturn : Float;     // totalRewards / totalStaked * 100
    neuronCount : Nat;
    blendedApy : Float;          // weighted-blended APY across all neurons
    totalMaturityE8s : Nat64;    // withdrawable + staked maturity combined across neurons
    totalRewardsThisMonthE8s : Nat64; // sum of positive deltas in the current calendar month
  };
};
