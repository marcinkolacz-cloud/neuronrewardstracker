import List "mo:core/List";
import Map "mo:core/Map";
import Runtime "mo:core/Runtime";
import NeuronTypes "../types/neurons";
import RewardTypes "../types/rewards";
import StatsTypes "../types/stats";
import Common "../types/common";
import NeuronsLib "../lib/neurons";
import RewardsLib "../lib/rewards";
import StatsLib "../lib/stats";

mixin (
  neurons : Map.Map<Common.NeuronId, NeuronTypes.Neuron>,
  rewards : Map.Map<Common.NeuronId, List.List<RewardTypes.DailyReward>>,
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

  /// Aggregated stats across all of the caller's neurons.
  public shared ({ caller }) func getPortfolioStats() : async StatsTypes.PortfolioStats {
    if (Principal.isAnonymous(caller)) {
      Runtime.trap("Anonymous caller not allowed");
    };
    StatsLib.getPortfolioStats(neurons, rewards, caller);
  };
};
