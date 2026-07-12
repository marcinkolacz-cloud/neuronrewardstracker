import List "mo:core/List";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Nat64 "mo:core/Nat64";
import Float "mo:core/Float";
import Time "mo:core/Time";
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
  public type E8s = Common.E8s;
  public type DeltaE8s = Common.DeltaE8s;

  /// Aggregate stats for a single neuron: total rewards, % return, average
  /// daily reward, monthly breakdown, trailing-30-day APY, and overall
  /// return percentage.
  public func getNeuronStats(
    neuron : Neuron,
    history : [DailyReward],
  ) : NeuronStats {
    var totalRewards : Int = 0;
    var positiveReadingCount : Nat = 0;
    var positiveDeltaSum : Int = 0;

    // Monthly aggregation keyed by (year, month) encoded as year * 12 + month.
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
              momDeltaE8s = 0; // populated after sorting below
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
              momDeltaE8s = 0; // populated after sorting below
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

    // overallReturnPct: same formula as percentageReturn but explicitly named.
    let overallReturnPct : Float = percentageReturn;

    // Sort monthly entries chronologically by encoded key, then populate
    // momDeltaE8s = current month totalDeltaE8s - previous month totalDeltaE8s.
    let monthlyArray = monthly.toArray();
    let sortedMonthly = monthlyArray.sort(func(a, b) = Nat.compare(a.0, b.0));
    let sortedMonthlyRecords : [MonthlyBreakdown] = sortedMonthly.map(
      func(_, v) = v,
    );
    let monthlyOut : [MonthlyBreakdown] = populateMomDeltas(sortedMonthlyRecords);

    // apy30d: (1 + avgDailyGrowthRate)^365 - 1 using the trailing 30-day
    // average daily growth rate. The daily growth rate for each day =
    // deltaE8s / previousTotalMaturityE8s. Average the daily growth rates
    // over the trailing 30 days. Return 0.0 if fewer than 30 days of history.
    let apy30d : Float = computeApy30d(history);

    {
      neuronId = neuron.id;
      totalRewardsE8s = totalRewards;
      percentageReturn;
      averageDailyRewardE8s = averageDaily;
      monthly = monthlyOut;
      apy30d;
      overallReturnPct;
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

    // For blended APY: stake-weighted average of per-neuron apy30d across
    // neurons that have 30+ days of history. The weight is the sync-sourced
    // stakedE8s (the actual ICP locked in the neuron), NOT the manual
    // initialStakeE8s fallback — the neuron detail page and totalStakedE8s
    // both use stakedE8s, so the blended APY weight must match for the
    // single-neuron sanity property to hold (one neuron → blendedApy == apy30d).
    var apyWeightSum : Float = 0.0; // sum of (stakedE8s * apy30d)
    var apyStakeSum : Float = 0.0;  // sum of stakedE8s for neurons with valid APY

    // For totalMaturityE8s: sum of latest snapshot's combined maturity.
    var totalMaturity : Nat64 = 0;

    // For totalRewardsThisMonthE8s: sum of positive deltaE8s from the
    // current calendar month across all neurons.
    var totalRewardsThisMonth : Nat64 = 0;
    let nowNs : Int = Time.now();
    let nowSeconds = nowNs / 1_000_000_000;
    let nowDays = nowSeconds / 86_400;
    let (currentYear, currentMonth) = daysToYearMonth(nowDays);
    let currentMonthKey = currentYear * 12 + currentMonth;

    neurons.forEach(func(id, neuron) {
      if (Principal.equal(neuron.ownerId, owner)) {
        neuronCount += 1;
        // totalStaked sums the sync-sourced stakedE8s (from
        // cached_neuron_stake_e8s), not the manual initialStakeE8s fallback.
        // The neuron detail page reads stakedE8s, so the portfolio total must
        // match for the single-neuron sanity property to hold.
        totalStaked := totalStaked + neuron.stakedE8s;

        switch (rewards.get(id)) {
          case (?history) {
            let historyArray = history.toArray();

            // Sum positive normalGrowth deltas for totalRewards.
            // #mergedToStake events are explicitly excluded — the value stays
            // within the neuron (maturity merged into stake), so they are NOT
            // a disbursement and must not count toward Total Disbursed. Only
            // #disburseOrSpawn counts as disbursed; #mergedToStake does not.
            for (r in historyArray.vals()) {
              if (r.eventType == #normalGrowth and r.deltaE8s > 0) {
                totalRewards += r.deltaE8s;
              };
            };

            // Per-neuron APY for blended calculation. Only neurons with 30+
            // days of history contribute to the stake-weighted blended APY.
            // The weight is stakedE8s (sync-sourced), matching totalStaked.
            if (has30DaysHistory(historyArray)) {
              let apy30d : Float = computeApy30d(historyArray);
              let stakeFloat = neuron.stakedE8s.toNat().toFloat();
              apyWeightSum += stakeFloat * apy30d;
              apyStakeSum += stakeFloat;
            };

            // Latest snapshot combined maturity for totalMaturityE8s.
            let sorted = historyArray.sort(func(a, b) = Int.compare(a.timestamp, b.timestamp));
            if (sorted.size() > 0) {
              let last = sorted[sorted.size() - 1];
              let combined : Nat64 = last.unstakedMaturityE8s + last.stakedMaturityE8s;
              totalMaturity := totalMaturity + combined;
            };

            // Sum positive deltas in the current calendar month. Exclude
            // #mergedToStake events — the value stays within the neuron and
            // is not a disbursement, so it must not inflate this-month totals.
            for (r in sorted.vals()) {
              if (r.deltaE8s > 0 and r.eventType != #mergedToStake) {
                let rSeconds = r.timestamp / 1_000_000_000;
                let rDays = rSeconds / 86_400;
                let (rYear, rMonth) = daysToYearMonth(rDays);
                let rKey = rYear * 12 + rMonth;
                if (rKey == currentMonthKey) {
                  totalRewardsThisMonth := totalRewardsThisMonth + Int.abs(r.deltaE8s).toNat64();
                };
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

    let blendedApy : Float = if (apyStakeSum == 0.0) {
      0.0;
    } else {
      apyWeightSum / apyStakeSum;
    };

    {
      totalStakedE8s = totalStaked;
      totalRewardsE8s = totalRewards;
      percentageReturn;
      neuronCount;
      blendedApy;
      totalMaturityE8s = totalMaturity;
      totalRewardsThisMonthE8s = totalRewardsThisMonth;
    };
  };

  /// Whether the reward history spans at least 30 days (from first to last
  /// snapshot timestamp). Used to gate APY inclusion.
  func has30DaysHistory(history : [DailyReward]) : Bool {
    if (history.size() < 2) { return false };
    let sorted = history.sort(func(a, b) = Int.compare(a.timestamp, b.timestamp));
    let first = sorted[0];
    let last = sorted[sorted.size() - 1];
    let spanNs : Int = last.timestamp - first.timestamp;
    let spanDays : Int = spanNs / 1_000_000_000 / 86_400;
    spanDays >= 30;
  };

  /// Compute the trailing-30-day APY = (1 + avgDailyGrowthRate)^365 - 1.
  /// The daily growth rate for each day = deltaE8s / previousTotalMaturityE8s.
  /// Average the daily growth rates over the trailing 30 days. Return 0.0 if
  /// fewer than 30 days of history exist.
  func computeApy30d(history : [DailyReward]) : Float {
    if (history.size() < 2) { return 0.0 };

    // Sort chronologically.
    let sorted = history.sort(func(a, b) = Int.compare(a.timestamp, b.timestamp));

    // Compute per-snapshot daily growth rate = deltaE8s / prevCombinedTotal.
    // Skip the first entry (no previous). When prevCombinedTotal is 0 the
    // rate is undefined; treat it as 0.0 (no meaningful growth that day).
    let growthRates = List.empty<Float>();
    var prevCombined : ?Int = null;
    for (r in sorted.vals()) {
      let combined : Int = r.unstakedMaturityE8s.toNat().toInt() + r.stakedMaturityE8s.toNat().toInt();
      switch (prevCombined) {
        case (?prev) {
          let rate : Float = if (prev > 0) {
            r.deltaE8s.toFloat() / prev.toFloat();
          } else {
            0.0;
          };
          growthRates.add(rate);
        };
        case null {};
      };
      prevCombined := ?combined;
    };

    let total = growthRates.size();
    if (total < 30) { return 0.0 };

    // Sum the trailing 30 entries via reverse iteration (most recent first).
    var sum : Float = 0.0;
    var counted : Nat = 0;
    growthRates.reverseForEach(func(rate) {
      if (counted < 30) {
        sum += rate;
        counted += 1;
      };
    });
    let avgDailyGrowthRate : Float = sum / 30.0;

    // APY = (1 + avgDailyGrowthRate)^365 - 1
    Float.pow(1.0 + avgDailyGrowthRate, 365.0) - 1.0;
  };

  /// Populate momDeltaE8s (month-over-month delta) on a chronologically-sorted
  /// array of MonthlyBreakdown. For each month, momDeltaE8s = current month's
  /// totalDeltaE8s - previous month's totalDeltaE8s. The first month gets 0.
  func populateMomDeltas(sorted : [MonthlyBreakdown]) : [MonthlyBreakdown] {
    if (sorted.size() == 0) { return sorted };
    let out = Array.tabulate(
      sorted.size(),
      func(i) {
        if (i == 0) {
          { sorted[i] with momDeltaE8s = 0 };
        } else {
          { sorted[i] with momDeltaE8s = sorted[i].totalDeltaE8s - sorted[i - 1].totalDeltaE8s };
        };
      },
    );
    out;
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
