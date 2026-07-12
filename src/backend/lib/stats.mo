import List "mo:core/List";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Int "mo:core/Int";
import Nat64 "mo:core/Nat64";
import Float "mo:core/Float";
import Principal "mo:core/Principal";
import NeuronTypes "../types/neurons";
import RewardTypes "../types/rewards";
import StatsTypes "../types/stats";
import Common "../types/common";

module {
  public type Neuron = NeuronTypes.Neuron;
  public type DailyReward = RewardTypes.DailyReward;
  public type NeuronStats = StatsTypes.NeuronStats;
  public type PortfolioStats = StatsTypes.PortfolioStats;
  public type MonthlyBreakdown = StatsTypes.MonthlyBreakdown;
  public type NeuronId = Common.NeuronId;

  /// Aggregate stats for a single neuron: total rewards, % return, average
  /// daily reward, and a monthly breakdown.
  public func getNeuronStats(
    neuron : Neuron,
    history : [DailyReward],
  ) : NeuronStats {
    var totalRewards : Int = 0;
    var positiveReadingCount : Nat = 0;
    var positiveDeltaSum : Int = 0;

    // Monthly aggregation keyed by (year, month) encoded as year * 12 + (month - 1).
    // We accumulate into a small Map then convert to a sorted array.
    let monthly = Map.empty<Nat, MonthlyBreakdown>();

    for (r in history.vals()) {
      if (r.eventType == #normalGrowth and r.deltaE8s > 0) {
        totalRewards += r.deltaE8s;
        positiveReadingCount += 1;
        positiveDeltaSum += r.deltaE8s;
      };

      // ns timestamp -> seconds -> days since epoch; derive year/month.
      let seconds = r.timestamp / 1_000_000_000;
      let days = seconds / 86_400;
      let (year, month) = daysToYearMonth(days);
      // Encode (year, month) as a sortable key without Nat subtraction (month is 1..12).
      let key = year * 12 + month;

      switch (monthly.get(key)) {
        case (?existing) {
          monthly.add(
            key,
            {
              year;
              month;
              totalDeltaE8s = existing.totalDeltaE8s + r.deltaE8s;
              readingCount = existing.readingCount + 1;
            },
          );
        };
        case null {
          monthly.add(
            key,
            {
              year;
              month;
              totalDeltaE8s = r.deltaE8s;
              readingCount = 1;
            },
          );
        };
      };
    };

    let averageDaily : Int = if (positiveReadingCount == 0) {
      0;
    } else {
      positiveDeltaSum / positiveReadingCount;
    };

    let percentageReturn : Float = if (neuron.initialStakeE8s == 0) {
      0.0;
    } else {
      (totalRewards.toFloat() / neuron.initialStakeE8s.toNat().toFloat()) * 100.0;
    };

    let monthlyArray = monthly.toArray();
    let sortedMonthly = monthlyArray.sort(func(a, b) = Nat.compare(a.0, b.0));
    let monthlyOut : [MonthlyBreakdown] = sortedMonthly.map(
      func(_, v) = v,
    );

    {
      neuronId = neuron.id;
      totalRewardsE8s = totalRewards;
      percentageReturn;
      averageDailyRewardE8s = averageDaily;
      monthly = monthlyOut;
    };
  };

  /// Aggregate stats across all of a caller's neurons.
  public func getPortfolioStats(
    neurons : Map.Map<NeuronId, Neuron>,
    rewards : Map.Map<NeuronId, List.List<DailyReward>>,
    owner : Principal,
  ) : PortfolioStats {
    var totalStaked : Nat64 = 0;
    var totalRewards : Int = 0;
    var neuronCount : Nat = 0;

    neurons.forEach(func(id, neuron) {
      if (Principal.equal(neuron.ownerId, owner)) {
        neuronCount += 1;
        totalStaked := totalStaked + neuron.initialStakeE8s;

        switch (rewards.get(id)) {
          case (?history) {
            for (r in history.values()) {
              if (r.eventType == #normalGrowth and r.deltaE8s > 0) {
                totalRewards += r.deltaE8s;
              };
            };
          };
          case null {};
        };
      };
    });

    let percentageReturn : Float = if (totalStaked == 0) {
      0.0;
    } else {
      (totalRewards.toFloat() / totalStaked.toNat().toFloat()) * 100.0;
    };

    {
      totalStakedE8s = totalStaked;
      totalRewardsE8s = totalRewards;
      percentageReturn;
      neuronCount;
    };
  };

  /// Convert days since Unix epoch to (year, month) where month is 1..12.
  /// Uses the proleptic Gregorian calendar via a simple algorithm.
  func daysToYearMonth(days : Int) : (Nat, Nat) {
    // Days from 1970-01-01. Use the Howard Hinnant civil-from-days algorithm.
    let z = days + 719468;
    let era = (if (z >= 0) z else z - 146096) / 146097;
    let doe = z - era * 146097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let m = if (mp < 10) mp + 3 else mp - 9; // [1, 12]
    let year = if (m <= 2) y + 1 else y;
    (Int.abs(year), Int.abs(m));
  };
};
