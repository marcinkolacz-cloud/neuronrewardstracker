import List "mo:core/List";
import Map "mo:core/Map";
import Runtime "mo:core/Runtime";
import NeuronTypes "../types/neurons";
import RewardTypes "../types/rewards";
import StatsTypes "../types/stats";
import Common "../types/common";
import WtnTypes "../types/wtn";
import NeuronsLib "../lib/neurons";
import RewardsLib "../lib/rewards";
import StatsLib "../lib/stats";

mixin (
  neurons : Map.Map<Common.NeuronId, NeuronTypes.Neuron>,
  rewards : Map.Map<Common.NeuronId, List.List<RewardTypes.DailyReward>>,
  wtnPositions : Map.Map<WtnTypes.WtnPositionId, WtnTypes.WtnPosition>,
  wtnSnapshots : Map.Map<WtnTypes.WtnPositionId, List.List<WtnTypes.WtnSnapshot>>,
) {
  /// Aggregated stats for a single neuron: total rewards, % return, average
  /// daily reward, and a monthly breakdown.
  public shared ({ caller }) func getNeuronStats(
    neuronId : Common.NeuronId,
  ) : async StatsTypes.NeuronStats {
    if (Principal.isAnonymous(caller)) {
      Runtime.trap("Anonymous caller not allowed");
    };
    switch (NeuronsLib.getOwnedNeuron(neurons, caller, neuronId)) {
      case (?neuron) {
        let history = RewardsLib.getRewardHistory(rewards, neuronId);
        StatsLib.getNeuronStats(neuron, history);
      };
      case null {
        Runtime.trap("Neuron not found");
      };
    };
  };

  /// Aggregated stats across all of the caller's neurons AND WTN positions.
  /// WTN positions are folded into the portfolio totals (Total Staked,
  /// capital contributed, total rewards) but kept out of `neuronCount` so
  /// they remain visually distinguishable in the frontend.
  public shared ({ caller }) func getPortfolioStats() : async StatsTypes.PortfolioStats {
    if (Principal.isAnonymous(caller)) {
      Runtime.trap("Anonymous caller not allowed");
    };
    StatsLib.getPortfolioStats(neurons, rewards, wtnPositions, wtnSnapshots, caller);
  };

  /// Portfolio-wide reward statistics aggregating across ALL neurons AND WTN
  /// positions for the caller: total capital contributed, total rewards,
  /// average daily reward, 30-day APY, overall return %, and a monthly
  /// breakdown combining NNS #normalGrowth deltas and WTN #organicGrowth
  /// deltas. Mirrors the per-neuron getNeuronStats panel at the portfolio
  /// level.
  public shared ({ caller }) func getPortfolioRewardStats() : async StatsTypes.PortfolioRewardStats {
    if (Principal.isAnonymous(caller)) {
      Runtime.trap("Anonymous caller not allowed");
    };
    StatsLib.getPortfolioRewardStats(neurons, rewards, wtnPositions, wtnSnapshots, caller);
  };
};
