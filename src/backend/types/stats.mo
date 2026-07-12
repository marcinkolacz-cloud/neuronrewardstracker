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

  /// Aggregated stats across all of a caller's neurons AND WTN positions.
  ///
  /// `totalCapitalContributedE8s` is the portfolio-wide sum of each neuron's
  /// `totalCapitalContributedE8s`, used as the denominator for the blended
  /// percentage return and APY so top-ups are treated as capital, not reward.
  ///
  /// The `nns*` and `wtn*` additive fields expose the per-source breakdown of
  /// the combined totals so the dashboard can show "14,761 ICP staked (NNS) +
  /// 8,907 ICP (nICP)" alongside the combined figure. The existing combined
  /// fields (`totalStakedE8s`, `totalCapitalContributedE8s`, `totalRewardsE8s`,
  /// `totalRewardsThisMonthE8s`) keep their existing meaning for backward
  /// compatibility; `combinedRewardsThisMonthE8s` is the correct combined
  /// "earned this month" figure (NNS + WTN), since the legacy
  /// `totalRewardsThisMonthE8s` field is NNS-only.
  public type PortfolioStats = {
    totalStakedE8s : E8s;        // combined: NNS stakedE8s + WTN redeemable (e8s)
    totalCapitalContributedE8s : E8s; // combined: NNS + WTN capital contributed
    totalRewardsE8s : Int;       // combined: NNS + WTN total rewards (organic growth only)
    percentageReturn : Float;     // totalRewards / totalCapitalContributed * 100
    neuronCount : Nat;
    blendedApy : Float;          // weighted-blended APY across all neurons
    totalMaturityE8s : Nat64;    // withdrawable + staked maturity combined across neurons
    totalRewardsThisMonthE8s : Nat64; // NNS-only monthly rewards (legacy; see combinedRewardsThisMonthE8s)
    // --- additive NNS/WTN split fields ---
    nnsStakedE8s : E8s;           // sum of neuron.stakedE8s across the owner's neurons
    wtnStakedE8s : E8s;           // floatIcpToE8s(sum of WTN redeemableIcpValue)
    nnsCapitalContributedE8s : E8s; // sum of NNS capital contributed (initialStake + #externalTopUp)
    wtnCapitalContributedE8s : E8s; // floatIcpToE8s(sum of WTN totalCapitalContributed)
    nnsRewardsE8s : Int;          // sum of NNS total rewards (organic #normalGrowth only)
    wtnRewardsE8s : Int;          // floatIcpToE8s(sum of WTN totalEarned)
    nnsRewardsThisMonthE8s : Nat64; // NNS-only monthly rewards (== totalRewardsThisMonthE8s)
    wtnRewardsThisMonthFloat : Float; // sum of WTN #organicGrowth redeemableIcpValue deltas this month (ICP)
    combinedRewardsThisMonthE8s : Nat64; // nnsRewardsThisMonthE8s + floatIcpToE8s(wtnRewardsThisMonthFloat)
  };

  /// Portfolio-wide reward statistics aggregating across ALL neurons AND WTN
  /// positions for a caller. Mirrors the per-neuron `NeuronStats` shape but
  /// summed across the whole portfolio, with the monthly breakdown combining
  /// NNS `#normalGrowth` deltas (e8s) and WTN `#organicGrowth`
  /// `redeemableIcpValue` deltas (converted to e8s via `floatIcpToE8s`).
  public type PortfolioRewardStats = {
    totalCapitalContributedE8s : E8s; // NNS + WTN combined capital contributed
    totalRewardsE8s : Int;       // NNS + WTN combined total rewards (organic growth only)
    averageDailyRewardE8s : Int; // combined daily average over the history window
    apy30d : Float;              // combined 30-day APY
    overallReturnPct : Float;    // combined percentage return
    monthlyReadings : Nat;       // total count of monthly breakdown entries
    monthly : [MonthlyBreakdown]; // aggregated across NNS rewards AND WTN #organicGrowth deltas
  };
};
