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
import WtnTypes "../types/wtn";
import WtnLib "wtn";

module {
  public type Neuron = NeuronTypes.Neuron;
  public type DailyReward = RewardTypes.DailyReward;
  public type NeuronStats = StatsTypes.NeuronStats;
  public type PortfolioStats = StatsTypes.PortfolioStats;
  public type PortfolioRewardStats = StatsTypes.PortfolioRewardStats;
  public type MonthlyBreakdown = StatsTypes.MonthlyBreakdown;
  public type NeuronId = Common.NeuronId;
  public type E8s = Common.E8s;
  public type DeltaE8s = Common.DeltaE8s;
  public type WtnPosition = WtnTypes.WtnPosition;
  public type WtnSnapshot = WtnTypes.WtnSnapshot;
  public type WtnPositionId = WtnTypes.WtnPositionId;

  /// Aggregate stats for a single neuron: total rewards, % return, average
  /// daily reward, monthly breakdown, trailing-30-day APY, and overall
  /// return percentage.
  ///
  /// Capital vs rewards accounting:
  ///   - `totalCapitalContributedE8s` = `initialStakeE8s` + the sum of
  ///     `stakeDeltaE8s` from every `#externalTopUp` event. Top-ups are
  ///     capital, not reward, so they widen the return baseline. Note:
  ///     `#mergedToStake` does NOT add to capital contributed — it is a
  ///     reclassification of existing maturity into stake, not new capital.
  ///   - `totalRewardsE8s` = the sum of positive `deltaE8s` for
  ///     `#normalGrowth` events only. `#externalTopUp` (no maturity impact),
  ///     `#mergedToStake` (reclassification), `#disburseOrSpawn` (withdrawal),
  ///     and `#firstReading` (baseline) are all excluded.
  ///   - `percentageReturn` = `totalRewardsE8s / totalCapitalContributedE8s * 100`.
  public func getNeuronStats(
    neuron : Neuron,
    history : [DailyReward],
  ) : NeuronStats {
    var totalRewards : Int = 0;
    var positiveReadingCount : Nat = 0;
    var positiveDeltaSum : Int = 0;
    var totalCapitalContributed : Nat64 = neuron.initialStakeE8s;
    // Lifetime total disbursed: sum of abs(deltaE8s) for #disburseOrSpawn.
    var totalDisbursed : Int = 0;
    // Latest snapshot's combined maturity (unstaked + staked). Tracked during
    // the same pass by remembering the most-recent entry's combined value;
    // history is iterated in chronological order (callers sort ascending).
    var latestCombinedMaturity : Int = 0;

    // Monthly aggregation keyed by (year, month) encoded as year * 12 + month.
    // We accumulate into a small Map then convert to a sorted array.
    let monthly = Map.empty<Nat, MonthlyBreakdown>();

    for (r in history.vals()) {
      // Capital contributed: only #externalTopUp adds new capital.
      // #mergedToStake is a reclassification (maturity → stake), not new
      // capital, so it does NOT widen the baseline.
      if (r.eventType == #externalTopUp) {
        totalCapitalContributed := totalCapitalContributed + r.stakeDeltaE8s;
      };

      // Rewards: only #normalGrowth positive deltas count as organic growth.
      if (r.eventType == #normalGrowth and r.deltaE8s > 0) {
        totalRewards += r.deltaE8s;
        positiveReadingCount += 1;
        positiveDeltaSum += r.deltaE8s;
      };

      // Disbursements: sum abs(deltaE8s) for #disburseOrSpawn events.
      if (r.eventType == #disburseOrSpawn) {
        totalDisbursed += Int.abs(r.deltaE8s);
      };

      // Track the latest snapshot's combined maturity. The history array
      // is iterated in chronological order, so the last iteration wins.
      latestCombinedMaturity := r.unstakedMaturityE8s.toNat() + r.stakedMaturityE8s.toNat();

      // ns timestamp -> seconds -> days since epoch; derive year/month.
      let seconds = r.timestamp / 1_000_000_000;
      let days = seconds / 86_400;
      let (year, month) = daysToYearMonth(days);
      // Encode (year, month) as a sortable key without Nat subtraction (month is 1..12).
      let key = year * 12 + month;

      // Monthly totalDeltaE8s counts only #normalGrowth positive deltas —
      // top-ups are capital, not reward, and #mergedToStake is a
      // reclassification. Both are excluded from the per-month earned total.
      let monthContribution : Int = if (r.eventType == #normalGrowth and r.deltaE8s > 0) {
        r.deltaE8s;
      } else {
        0;
      };

      switch (monthly.get(key)) {
        case (?existing) {
          monthly.add(
            key,
            {
              year;
              month;
              totalDeltaE8s = existing.totalDeltaE8s + monthContribution;
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
              totalDeltaE8s = monthContribution;
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

    let percentageReturn : Float = if (totalCapitalContributed == 0) {
      0.0;
    } else {
      (totalRewards.toFloat() / totalCapitalContributed.toNat().toFloat()) * 100.0;
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
    // deltaE8s / totalCapitalContributedE8s (the running capital baseline up
    // to that point). Only #normalGrowth positive deltas count as growth.
    let apy30d : Float = computeApy30d(history, neuron.initialStakeE8s);

    {
      neuronId = neuron.id;
      totalRewardsE8s = totalRewards;
      totalCapitalContributedE8s = totalCapitalContributed;
      percentageReturn;
      averageDailyRewardE8s = averageDaily;
      monthly = monthlyOut;
      apy30d;
      overallReturnPct;
      // CURRENT live Maturity = unstakedMaturityE8s + stakedMaturityE8s from
      // the latest DailyReward snapshot (the same value the neuron detail page
      // shows as 'Maturity'). 0 if no reward history.
      currentMaturityE8s = latestCombinedMaturity;
      // Lifetime total disbursed = sum of abs(deltaE8s) for all
      // #disburseOrSpawn entries. 0 if none.
      totalDisbursedE8s = totalDisbursed;
    };
  };

  /// Aggregate stats across all of a caller's neurons AND WTN positions.
  ///
  /// Capital vs rewards accounting (portfolio-wide):
  ///   - `totalCapitalContributedE8s` = the sum of each neuron's
  ///     `totalCapitalContributedE8s` (initial stake + #externalTopUp deltas)
  ///     PLUS the sum of each WTN position's `totalCapitalContributed`
  ///     (running cost basis = latest snapshot's totalIcpPaid), converted to
  ///     e8s. WTN capital is treated the same way as NNS capital: it widens
  ///     the return baseline and the blended-APY weight.
  ///   - `totalRewardsE8s` = the sum of each neuron's `totalRewardsE8s`
  ///     (organic #normalGrowth growth only; excludes #externalTopUp and
  ///     #mergedToStake) PLUS the sum of each WTN position's `totalEarned`
  ///     (sum of #organicGrowth redeemableIcpValue deltas), converted to e8s.
  ///   - `percentageReturn` = `totalRewardsE8s / totalCapitalContributedE8s * 100`.
  ///   - `blendedApy` = capital-weighted average of per-neuron `apy30d`,
  ///     weight = per-neuron `totalCapitalContributedE8s` (NOT raw
  ///     `stakedE8s` — top-ups widen the capital baseline and thus the
  ///     weight). Only neurons with 30+ days of history contribute. WTN
  ///     positions do not have a per-position APY30d (their snapshot
  ///     cadence is irregular and manually entered), so they contribute
  ///     capital to the blended-APY denominator but not to the numerator —
  ///     this keeps the blended APY a neuron-only growth signal while WTN
  ///     value still counts towards Total Staked/Maturity and total rewards.
  ///   - `totalStakedE8s` = sum of sync-sourced `stakedE8s` (unchanged) PLUS
  ///     the sum of each WTN position's latest `redeemableIcpValue` (the
  ///     ICP-equivalent value if fully unstaked), converted to e8s. WTN
  ///     positions are liquid-staked nICP, so their redeemable value is the
  ///     equivalent of "staked" capital for portfolio totals.
  ///   - `totalMaturityE8s` = sum of latest snapshot combined maturity
  ///     (unchanged). WTN positions have no separate maturity concept —
  ///     their redeemable value is already folded into totalStakedE8s, so
  ///     it is NOT double-counted here.
  ///   - `totalRewardsThisMonthE8s` = sum of #normalGrowth positive deltas
  ///     from the current calendar month (excludes #externalTopUp and
  ///     #mergedToStake). WTN #organicGrowth deltas are NOT added here
  ///     because they are Float ICP values, not e8s deltas, and the
  ///     portfolio "this month" figure is an NNS-maturity-denominated
  ///     counter; WTN earned is already reflected in totalRewardsE8s.
  ///   - `neuronCount` = count of NNS neurons only. WTN positions are kept
  ///     visually distinguishable — they are NOT merged into `neuronCount`.
  ///     The frontend renders a separate WTN count badge.
  public func getPortfolioStats(
    neurons : Map.Map<NeuronId, Neuron>,
    rewards : Map.Map<NeuronId, List.List<DailyReward>>,
    wtnPositions : Map.Map<WtnPositionId, WtnPosition>,
    wtnSnapshots : Map.Map<WtnPositionId, List.List<WtnSnapshot>>,
    owner : Principal,
  ) : PortfolioStats {
    var totalStaked : Nat64 = 0;
    var totalCapitalContributed : Nat64 = 0;
    var totalRewards : Int = 0;
    var neuronCount : Nat = 0;

    // NNS-only accumulators (the per-source breakdown of the combined totals).
    var nnsStaked : Nat64 = 0;
    var nnsCapitalContributed : Nat64 = 0;
    var nnsRewards : Int = 0;

    // For blended APY: capital-weighted average of per-neuron apy30d across
    // neurons that have 30+ days of history. The weight is the per-neuron
    // `totalCapitalContributedE8s` (initial stake + top-ups), NOT the raw
    // `stakedE8s` — top-ups increase the capital baseline and thus the
    // weight, so a topped-up neuron's APY contributes proportionally to the
    // capital it represents.
    var apyWeightSum : Float = 0.0; // sum of (capitalContributed * apy30d)
    var apyCapitalSum : Float = 0.0; // sum of capitalContributed for valid-APY neurons

    // For totalMaturityE8s: sum of latest snapshot's combined maturity.
    var totalMaturity : Nat64 = 0;

    // For totalRewardsThisMonthE8s: sum of #normalGrowth positive deltas
    // from the current calendar month across all neurons (NNS-only).
    var totalRewardsThisMonth : Nat64 = 0;
    // For totalDisbursedE8s (NNS portion): sum of each neuron's
    // totalDisbursedE8s (sum of abs(deltaE8s) for #disburseOrSpawn).
    var nnsTotalDisbursed : Int = 0;
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
        totalStaked := totalStaked + neuron.stakedE8s;
        nnsStaked := nnsStaked + neuron.stakedE8s;

        switch (rewards.get(id)) {
          case (?history) {
            let historyArray = history.toArray();

            // Compute per-neuron stats once so the capital/rewards split
            // stays consistent with getNeuronStats (single source of truth).
            let perNeuron = getNeuronStats(neuron, historyArray);
            totalCapitalContributed := totalCapitalContributed + perNeuron.totalCapitalContributedE8s;
            totalRewards += perNeuron.totalRewardsE8s;
            nnsCapitalContributed := nnsCapitalContributed + perNeuron.totalCapitalContributedE8s;
            nnsRewards += perNeuron.totalRewardsE8s;
            // Accumulate per-neuron lifetime disbursed (sum of abs(deltaE8s)
            // for #disburseOrSpawn) into the portfolio-wide NNS disbursed total.
            nnsTotalDisbursed += perNeuron.totalDisbursedE8s;

            // Per-neuron APY for the blended calculation. Only neurons with
            // 30+ days of history contribute, weighted by their capital
            // contributed (initial stake + top-ups).
            if (has30DaysHistory(historyArray)) {
              let capitalFloat = perNeuron.totalCapitalContributedE8s.toNat().toFloat();
              apyWeightSum += capitalFloat * perNeuron.apy30d;
              apyCapitalSum += capitalFloat;
            };

            // Latest snapshot combined maturity for totalMaturityE8s.
            let sorted = historyArray.sort(func(a, b) = Int.compare(a.timestamp, b.timestamp));
            if (sorted.size() > 0) {
              let last = sorted[sorted.size() - 1];
              let combined : Nat64 = last.unstakedMaturityE8s + last.stakedMaturityE8s;
              totalMaturity := totalMaturity + combined;
            };

            // Sum #normalGrowth positive deltas in the current calendar
            // month. Exclude #externalTopUp (capital, not reward) and
            // #mergedToStake (reclassification) — only organic growth counts
            // as earned this month.
            for (r in sorted.vals()) {
              if (r.eventType == #normalGrowth and r.deltaE8s > 0) {
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

    // Fold WTN positions into the portfolio aggregates. WTN positions are
    // fully separate from NNS neurons (no governance sync, no hotkey), but
    // their redeemable ICP value, capital contributed, and organic growth
    // are combined into the same portfolio-wide totals so the dashboard
    // shows a unified picture. WTN positions are NOT counted in
    // `neuronCount` — they are visually distinguished with a WTN badge in
    // the frontend.
    var wtnTotalStakedFloat : Float = 0.0;
    var wtnTotalCapitalFloat : Float = 0.0;
    var wtnTotalEarnedFloat : Float = 0.0;
    // WTN lifetime withdrawals (Float ICP), summed across all WTN positions
    // for the portfolio-wide totalDisbursedE8s (converted to e8s below).
    var wtnTotalWithdrawnFloat : Float = 0.0;
    // WTN #organicGrowth redeemableIcpValue deltas within the current
    // calendar month (Float ICP). Computed the same way the NNS monthly
    // logic works: iterate WTN snapshots, filter by current year/month and
    // eventType == #organicGrowth, sum the redeemableIcpValue delta (the
    // day-over-day change in redeemableIcpValue on organic-growth days).
    var wtnRewardsThisMonthFloat : Float = 0.0;

    wtnPositions.forEach(func(id, position) {
      if (Principal.equal(position.ownerId, owner)) {
        let history = WtnLib.getWtnSnapshots(wtnSnapshots, id);
        let contribution = WtnLib.getWtnPortfolioContribution(position, history);
        wtnTotalStakedFloat += contribution.redeemableIcpValue;
        wtnTotalCapitalFloat += contribution.totalCapitalContributed;
        wtnTotalEarnedFloat += contribution.totalEarned;
        wtnTotalWithdrawnFloat += contribution.totalWithdrawn;

        // WTN APY contribution to the blended APY: compute a per-position
        // apy30d from the snapshot history (normalized by ACTUAL elapsed
        // days between snapshots, not entry count — WTN snapshots are
        // manually entered at irregular intervals). If the position has
        // 30+ actual calendar days of history and qualifying #organicGrowth
        // pairs in the trailing 30 days, add (capital * apy30d) to
        // apyWeightSum and capital to apyCapitalSum — exactly mirroring how
        // NNS neurons contribute via has30DaysHistory-gated apy30d. A 0.0
        // return means the position does not participate in the blended
        // APY (same "Insufficient history" semantics as NNS neurons).
        let wtnApy30d = WtnLib.computeWtnApy30d(history);
        if (wtnApy30d > 0.0) {
          let wtnCapitalFloat = contribution.totalCapitalContributed;
          apyWeightSum += wtnCapitalFloat * wtnApy30d;
          apyCapitalSum += wtnCapitalFloat;
        };

        // Sum #organicGrowth redeemableIcpValue deltas in the current
        // calendar month. The delta is the day-over-day change in
        // redeemableIcpValue (current - previous), mirroring the NNS
        // #normalGrowth deltaE8s logic.
        var prevRedeemable : ?Float = null;
        for (s in history.vals()) {
          let sSeconds = s.date / 1_000_000_000;
          let sDays = sSeconds / 86_400;
          let (sYear, sMonth) = daysToYearMonth(sDays);
          let sKey = sYear * 12 + sMonth;
          if (s.eventType == #organicGrowth and sKey == currentMonthKey) {
            switch (prevRedeemable) {
              case (?prev) {
                wtnRewardsThisMonthFloat += s.redeemableIcpValue - prev;
              };
              case null {};
            };
          };
          prevRedeemable := ?s.redeemableIcpValue;
        };
      };
    });

    // Convert WTN Float ICP values to e8s (1 ICP = 10^8 e8s) and add to the
    // portfolio totals. Float → e8s via rounding to the nearest e8s.
    let wtnTotalStakedE8s = floatIcpToE8s(wtnTotalStakedFloat);
    let wtnTotalCapitalE8s = floatIcpToE8s(wtnTotalCapitalFloat);
    let wtnTotalEarnedE8s = floatIcpToE8s(wtnTotalEarnedFloat);
    let wtnRewardsThisMonthE8s = floatIcpToE8s(wtnRewardsThisMonthFloat);

    totalStaked := totalStaked + wtnTotalStakedE8s;
    totalCapitalContributed := totalCapitalContributed + wtnTotalCapitalE8s;
    totalRewards += wtnTotalEarnedE8s.toNat();

    // combinedRewardsThisMonthE8s = NNS monthly + WTN monthly (converted to e8s).
    let combinedRewardsThisMonthE8s : Nat64 = totalRewardsThisMonth + wtnRewardsThisMonthE8s;

    let percentageReturn : Float = if (totalCapitalContributed == 0) {
      0.0;
    } else {
      (totalRewards.toFloat() / totalCapitalContributed.toNat().toFloat()) * 100.0;
    };

    let blendedApy : Float = if (apyCapitalSum == 0.0) {
      0.0;
    } else {
      apyWeightSum / apyCapitalSum;
    };

    // totalPortfolioValueE8s: consistent apples-to-apples total portfolio
    // value. totalStakedE8s already = NNS stakedE8s + WTN redeemableIcpValue
    // (WTN side already includes growth). totalMaturityE8s = NNS-only combined
    // maturity (the missing NNS growth). So totalStakedE8s + totalMaturityE8s
    // = NNS(stake + maturity) + WTN(redeemable) = a fair, complete total.
    let totalPortfolioValue : Int = totalStaked.toNat() + totalMaturity.toNat();

    {
      totalStakedE8s = totalStaked;
      totalPortfolioValueE8s = totalPortfolioValue;
      totalCapitalContributedE8s = totalCapitalContributed;
      totalRewardsE8s = totalRewards;
      percentageReturn;
      neuronCount;
      blendedApy;
      totalMaturityE8s = totalMaturity;
      totalRewardsThisMonthE8s = totalRewardsThisMonth;
      // --- additive NNS/WTN split fields ---
      nnsStakedE8s = nnsStaked;
      wtnStakedE8s = wtnTotalStakedE8s;
      nnsCapitalContributedE8s = nnsCapitalContributed;
      wtnCapitalContributedE8s = wtnTotalCapitalE8s;
      nnsRewardsE8s = nnsRewards;
      wtnRewardsE8s = wtnTotalEarnedE8s.toNat();
      nnsRewardsThisMonthE8s = totalRewardsThisMonth;
      wtnRewardsThisMonthFloat = wtnRewardsThisMonthFloat;
      combinedRewardsThisMonthE8s = combinedRewardsThisMonthE8s;
      // Portfolio-wide lifetime total withdrawn = sum of per-neuron
      // totalDisbursedE8s (NNS #disburseOrSpawn) PLUS sum of WTN
      // totalWithdrawn (converted to E8s via floatIcpToE8s).
      totalDisbursedE8s = nnsTotalDisbursed + floatIcpToE8s(wtnTotalWithdrawnFloat).toNat();
    };
  };

  /// Portfolio-wide reward statistics aggregating across ALL neurons AND WTN
  /// positions for a caller. Mirrors the per-neuron `getNeuronStats` shape but
  /// summed across the whole portfolio. The monthly breakdown combines NNS
  /// `#normalGrowth` deltas (e8s) and WTN `#organicGrowth`
  /// `redeemableIcpValue` deltas (converted to e8s via `floatIcpToE8s`) into a
  /// single `MonthlyBreakdown[]` list grouped by year+month, with
  /// `populateMomDeltas` applied.
  ///
  /// Capital vs rewards accounting (portfolio-wide, same as getPortfolioStats):
  ///   - `totalCapitalContributedE8s` = NNS capital (initial stake +
  ///     #externalTopUp deltas) + WTN capital (latest totalIcpPaid), converted
  ///     to e8s.
  ///   - `totalRewardsE8s` = NNS rewards (organic #normalGrowth only) + WTN
  ///     rewards (sum of #organicGrowth redeemableIcpValue deltas), converted
  ///     to e8s.
  ///   - `averageDailyRewardE8s` = totalRewards / totalDays, where totalDays is
  ///     the number of days from the earliest snapshot timestamp to now (or 1
  ///     if there is no history, to avoid division by zero).
  ///   - `apy30d` = capital-weighted blended APY across neurons with 30+ days
  ///     of history (same as getPortfolioStats.blendedApy). WTN positions do
  ///     not have a per-position APY30d, so they contribute capital to the
  ///     denominator but not to the numerator.
  ///   - `overallReturnPct` = totalRewards / totalCapitalContributed * 100.
  ///   - `monthlyReadings` = total count of monthly breakdown entries.
  ///   - `monthly` = aggregated MonthlyBreakdown[] across NNS rewards AND WTN
  ///     #organicGrowth deltas, grouped by year+month, with populateMomDeltas.
  public func getPortfolioRewardStats(
    neurons : Map.Map<NeuronId, Neuron>,
    rewards : Map.Map<NeuronId, List.List<DailyReward>>,
    wtnPositions : Map.Map<WtnPositionId, WtnPosition>,
    wtnSnapshots : Map.Map<WtnPositionId, List.List<WtnSnapshot>>,
    owner : Principal,
  ) : PortfolioRewardStats {
    var totalCapitalContributed : Nat64 = 0;
    var totalRewards : Int = 0;

    // For blended APY (same capital-weighted logic as getPortfolioStats).
    var apyWeightSum : Float = 0.0;
    var apyCapitalSum : Float = 0.0;

    // For averageDailyRewardE8s: track the earliest snapshot timestamp so we
    // can compute the total number of days in the history window.
    var earliestTs : ?Int = null;

    // Monthly aggregation keyed by (year, month) encoded as year * 12 + month.
    // Combines NNS #normalGrowth deltas (e8s) and WTN #organicGrowth
    // redeemableIcpValue deltas (converted to e8s).
    let monthly = Map.empty<Nat, MonthlyBreakdown>();

    neurons.forEach(func(id, neuron) {
      if (Principal.equal(neuron.ownerId, owner)) {
        switch (rewards.get(id)) {
          case (?history) {
            let historyArray = history.toArray();

            // Per-neuron stats for the capital/rewards split (single source
            // of truth, consistent with getPortfolioStats).
            let perNeuron = getNeuronStats(neuron, historyArray);
            totalCapitalContributed := totalCapitalContributed + perNeuron.totalCapitalContributedE8s;
            totalRewards += perNeuron.totalRewardsE8s;

            // Blended APY: capital-weighted, only neurons with 30+ days.
            if (has30DaysHistory(historyArray)) {
              let capitalFloat = perNeuron.totalCapitalContributedE8s.toNat().toFloat();
              apyWeightSum += capitalFloat * perNeuron.apy30d;
              apyCapitalSum += capitalFloat;
            };

            // Track earliest timestamp for the daily-average window.
            let sorted = historyArray.sort(func(a, b) = Int.compare(a.timestamp, b.timestamp));
            if (sorted.size() > 0) {
              let first = sorted[0];
              switch (earliestTs) {
                case (?e) {
                  if (first.timestamp < e) { earliestTs := ?first.timestamp };
                };
                case null { earliestTs := ?first.timestamp };
              };
            };

            // Monthly aggregation: only #normalGrowth positive deltas count
            // as organic growth (same as getNeuronStats). Other event types
            // are excluded from the per-month earned total.
            for (r in sorted.vals()) {
              if (r.eventType == #normalGrowth and r.deltaE8s > 0) {
                let seconds = r.timestamp / 1_000_000_000;
                let days = seconds / 86_400;
                let (year, month) = daysToYearMonth(days);
                let key = year * 12 + month;
                let monthContribution : Int = r.deltaE8s;
                switch (monthly.get(key)) {
                  case (?existing) {
                    monthly.add(
                      key,
                      {
                        year;
                        month;
                        totalDeltaE8s = existing.totalDeltaE8s + monthContribution;
                        readingCount = existing.readingCount + 1;
                        momDeltaE8s = 0;
                      },
                    );
                  };
                  case null {
                    monthly.add(
                      key,
                      {
                        year;
                        month;
                        totalDeltaE8s = monthContribution;
                        readingCount = 1;
                        momDeltaE8s = 0;
                      },
                    );
                  };
                };
              };
            };
          };
          case null {};
        };
      };
    });

    // Fold WTN positions: capital, rewards, and #organicGrowth monthly deltas.
    var wtnTotalCapitalFloat : Float = 0.0;
    var wtnTotalEarnedFloat : Float = 0.0;

    wtnPositions.forEach(func(id, position) {
      if (Principal.equal(position.ownerId, owner)) {
        let history = WtnLib.getWtnSnapshots(wtnSnapshots, id);
        let contribution = WtnLib.getWtnPortfolioContribution(position, history);
        wtnTotalCapitalFloat += contribution.totalCapitalContributed;
        wtnTotalEarnedFloat += contribution.totalEarned;

        // WTN APY contribution to the blended APY (mirrors
        // getPortfolioStats): compute a per-position apy30d from the
        // snapshot history (normalized by ACTUAL elapsed days between
        // snapshots). If the position has 30+ actual calendar days of
        // history and qualifying #organicGrowth pairs in the trailing 30
        // days, add (capital * apy30d) to apyWeightSum and capital to
        // apyCapitalSum — exactly mirroring how NNS neurons contribute via
        // has30DaysHistory-gated apy30d. A 0.0 return means the position
        // does not participate in the blended APY.
        let wtnApy30d = WtnLib.computeWtnApy30d(history);
        if (wtnApy30d > 0.0) {
          let wtnCapitalFloat = contribution.totalCapitalContributed;
          apyWeightSum += wtnCapitalFloat * wtnApy30d;
          apyCapitalSum += wtnCapitalFloat;
        };

        // Track earliest WTN snapshot timestamp for the daily-average window.
        if (history.size() > 0) {
          let first = history[0];
          switch (earliestTs) {
            case (?e) {
              if (first.date < e) { earliestTs := ?first.date };
            };
            case null { earliestTs := ?first.date };
          };
        };

        // Monthly aggregation: WTN #organicGrowth redeemableIcpValue deltas
        // (current - previous), converted to e8s via floatIcpToE8s. This
        // mirrors the NNS #normalGrowth deltaE8s logic above.
        var prevRedeemable : ?Float = null;
        for (s in history.vals()) {
          if (s.eventType == #organicGrowth) {
            let deltaFloat : Float = switch (prevRedeemable) {
              case (?prev) { s.redeemableIcpValue - prev };
              case null { 0.0 };
            };
            // Only count positive organic growth as reward (mirrors NNS
            // #normalGrowth positive-delta gating).
            if (deltaFloat > 0.0) {
              let deltaE8s : Int = floatIcpToE8s(deltaFloat).toNat();
              let seconds = s.date / 1_000_000_000;
              let days = seconds / 86_400;
              let (year, month) = daysToYearMonth(days);
              let key = year * 12 + month;
              switch (monthly.get(key)) {
                case (?existing) {
                  monthly.add(
                    key,
                    {
                      year;
                      month;
                      totalDeltaE8s = existing.totalDeltaE8s + deltaE8s;
                      readingCount = existing.readingCount + 1;
                      momDeltaE8s = 0;
                    },
                  );
                };
                case null {
                  monthly.add(
                    key,
                    {
                      year;
                      month;
                      totalDeltaE8s = deltaE8s;
                      readingCount = 1;
                      momDeltaE8s = 0;
                    },
                  );
                };
              };
            };
          };
          prevRedeemable := ?s.redeemableIcpValue;
        };
      };
    });

    // Convert WTN Float ICP totals to e8s and combine with NNS totals.
    let wtnTotalCapitalE8s = floatIcpToE8s(wtnTotalCapitalFloat);
    let wtnTotalEarnedE8s = floatIcpToE8s(wtnTotalEarnedFloat);
    totalCapitalContributed := totalCapitalContributed + wtnTotalCapitalE8s;
    totalRewards += wtnTotalEarnedE8s.toNat();

    // averageDailyRewardE8s: totalRewards / totalDays. totalDays is the
    // number of days from the earliest snapshot to now (at least 1 to avoid
    // division by zero).
    let nowNs : Int = Time.now();
    let totalDays : Nat = switch (earliestTs) {
      case (?e) {
        let spanNs : Int = nowNs - e;
        let spanDays : Int = spanNs / 1_000_000_000 / 86_400;
        if (spanDays < 1) { 1 } else { Int.abs(spanDays) };
      };
      case null { 1 };
    };
    let averageDaily : Int = totalRewards / totalDays;

    // apy30d: capital-weighted blended APY (same as getPortfolioStats.blendedApy).
    let apy30d : Float = if (apyCapitalSum == 0.0) {
      0.0;
    } else {
      apyWeightSum / apyCapitalSum;
    };

    // overallReturnPct: totalRewards / totalCapitalContributed * 100.
    let overallReturnPct : Float = if (totalCapitalContributed == 0) {
      0.0;
    } else {
      (totalRewards.toFloat() / totalCapitalContributed.toNat().toFloat()) * 100.0;
    };

    // Sort monthly entries chronologically by encoded key, then populate
    // momDeltaE8s = current month totalDeltaE8s - previous month totalDeltaE8s.
    let monthlyArray = monthly.toArray();
    let sortedMonthly = monthlyArray.sort(func(a, b) = Nat.compare(a.0, b.0));
    let sortedMonthlyRecords : [MonthlyBreakdown] = sortedMonthly.map(
      func(_, v) = v,
    );
    let monthlyOut : [MonthlyBreakdown] = populateMomDeltas(sortedMonthlyRecords);

    {
      totalCapitalContributedE8s = totalCapitalContributed;
      totalRewardsE8s = totalRewards;
      averageDailyRewardE8s = averageDaily;
      apy30d;
      overallReturnPct;
      monthlyReadings = monthlyOut.size();
      monthly = monthlyOut;
    };
  };

  /// Convert a Float ICP amount to e8s (Nat64), rounding to the nearest e8s.
  /// 1 ICP = 10^8 e8s. Negative values clamp to 0 (defensive — should not
  /// occur for staked/capital/earned totals).
  func floatIcpToE8s(icp : Float) : Nat64 {
    if (icp <= 0.0) { return 0 : Nat64 };
    let e8sFloat = icp * 100_000_000.0;
    // Round to nearest, then clamp to Nat64 range.
    let rounded = Float.floor(e8sFloat + 0.5);
    if (rounded >= 18_446_744_073_709_551_615.0) {
      // Above Nat64 max — clamp.
      return 18_446_744_073_709_551_615 : Nat64;
    };
    Int.abs(rounded.toInt()).toNat64();
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
  ///
  /// The daily growth rate for each snapshot = deltaE8s /
  /// totalCapitalContributedE8s, where `totalCapitalContributedE8s` is the
  /// running capital baseline (initial stake + sum of #externalTopUp deltas
  /// up to and including that snapshot). Only #normalGrowth positive deltas
  /// count as growth — #externalTopUp (capital, not reward), #mergedToStake
  /// (reclassification), #disburseOrSpawn (withdrawal), and #firstReading
  /// (baseline) are excluded from the growth-rate numerator. Average the
  /// daily growth rates over the trailing 30 snapshots. Return 0.0 if fewer
  /// than 30 snapshots exist, or if the capital baseline is 0 throughout.
  func computeApy30d(history : [DailyReward], initialStakeE8s : E8s) : Float {
    if (history.size() < 2) { return 0.0 };

    // Sort chronologically.
    let sorted = history.sort(func(a, b) = Int.compare(a.timestamp, b.timestamp));

    // Compute per-snapshot daily growth rate = deltaE8s /
    // runningCapitalContributed. The running baseline starts at
    // initialStakeE8s and widens with each #externalTopUp. Only
    // #normalGrowth positive deltas contribute to the numerator; other
    // event types still widen the baseline (for #externalTopUp) but do not
    // add to the growth rate.
    let growthRates = List.empty<Float>();
    var runningCapital : Nat64 = initialStakeE8s;
    for (r in sorted.vals()) {
      // Widen the baseline for external top-ups BEFORE evaluating this
      // snapshot's growth rate, so the top-up is part of the denominator
      // for the same snapshot (the capital was contributed by then).
      if (r.eventType == #externalTopUp) {
        runningCapital := runningCapital + r.stakeDeltaE8s;
      };

      let rate : Float = if (r.eventType == #normalGrowth and r.deltaE8s > 0 and runningCapital > 0) {
        r.deltaE8s.toFloat() / runningCapital.toNat().toFloat();
      } else {
        0.0;
      };
      growthRates.add(rate);
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

    // APY = (1 + avgDailyGrowthRate)^365 - 1, pre-scaled x100 to match the
    // percentageReturn/overallReturnPct convention (e.g. 11.4 for 11.4%) so
    // frontend formatters (formatApy/formatPercent) render all percentage-like
    // fields uniformly without per-field special-casing.
    (Float.pow(1.0 + avgDailyGrowthRate, 365.0) - 1.0) * 100.0;
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
