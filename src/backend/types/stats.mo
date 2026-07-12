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
  ///
  /// `totalCapitalContributedE8s` is the running total of capital the owner
  /// has put into this neuron: the original `initialStakeE8s` plus the sum of
  /// every `#externalTopUp` delta. It is the denominator for percentage return
  /// and APY so that capital added via top-ups is not counted as earned
  /// reward. `totalRewardsE8s` is organic reward growth only — it excludes
  /// `#externalTopUp` and `#mergedToStake` deltas.
  public type NeuronStats = {
    neuronId : NeuronId;
    totalRewardsE8s : Int;       // sum of all positive deltas (organic growth only)
    totalCapitalContributedE8s : E8s; // initialStake + sum of #externalTopUp deltas
    percentageReturn : Float;     // totalRewards / totalCapitalContributed * 100
    averageDailyRewardE8s : Int; // mean positive delta per day
    monthly : [MonthlyBreakdown];
    apy30d : Float;              // annualized return from trailing 30-day avg daily growth rate
    overallReturnPct : Float;    // overall % return since the neuron's start date
  };

  /// Aggregated stats across all of a caller's neurons.
  ///
  /// `totalCapitalContributedE8s` is the portfolio-wide sum of each neuron's
  /// `totalCapitalContributedE8s`, used as the denominator for the blended
  /// percentage return and APY so top-ups are treated as capital, not reward.
  public type PortfolioStats = {
    totalStakedE8s : E8s;        // sum of initialStakeE8s
    totalCapitalContributedE8s : E8s; // portfolio-wide sum of per-neuron total capital contributed
    totalRewardsE8s : Int;       // sum of totalRewards across neurons (organic growth only)
    percentageReturn : Float;     // totalRewards / totalCapitalContributed * 100
    neuronCount : Nat;
    blendedApy : Float;          // weighted-blended APY across all neurons
    totalMaturityE8s : Nat64;    // withdrawable + staked maturity combined across neurons
    totalRewardsThisMonthE8s : Nat64; // sum of positive deltas in the current calendar month
  };
};
