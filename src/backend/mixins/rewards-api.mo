import List "mo:core/List";
import Map "mo:core/Map";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import Types "../types/rewards";
import Common "../types/common";
import NeuronTypes "../types/neurons";
import RewardsLib "../lib/rewards";
import NeuronsLib "../lib/neurons";

mixin (
  rewards : Map.Map<Common.NeuronId, List.List<Types.DailyReward>>,
  neurons : Map.Map<Common.NeuronId, NeuronTypes.Neuron>,
) {
  /// Record a manual maturity snapshot for a neuron. Computes the delta vs the
  /// previous snapshot's combined maturity total. Serves as the fallback when
  /// governance sync is blocked by a missing hotkey.
  ///
  /// Both maturity components are recorded separately so a neuron that
  /// switches auto-stake mode over time keeps a continuous history.
  /// `autoStakeMaturity` is an informational flag only.
  public shared ({ caller }) func recordSnapshot(
    neuronId : Common.NeuronId,
    unstakedMaturityE8s : Nat64,
    stakedMaturityE8s : Nat64,
    autoStakeMaturity : Bool,
  ) : async Types.DailyReward {
    if (Principal.isAnonymous(caller)) {
      Runtime.trap("Anonymous caller not allowed");
    };
    // Verify the caller owns the neuron.
    ignore NeuronsLib.getOwnedNeuron(neurons, caller, neuronId);
    RewardsLib.recordSnapshot(
      rewards,
      neuronId,
      unstakedMaturityE8s,
      stakedMaturityE8s,
      autoStakeMaturity,
      Time.now(),
    );
  };

  /// Return all snapshots for a neuron, sorted by timestamp ascending.
  public shared ({ caller }) func getRewardHistory(
    neuronId : Common.NeuronId,
  ) : async [Types.DailyReward] {
    if (Principal.isAnonymous(caller)) {
      Runtime.trap("Anonymous caller not allowed");
    };
    // Verify the caller owns the neuron.
    ignore NeuronsLib.getOwnedNeuron(neurons, caller, neuronId);
    RewardsLib.getRewardHistory(rewards, neuronId);
  };

  /// Bulk import historical entries for backfilling. Computes deltas the same
  /// way as recordSnapshot (from the combined maturity total).
  public shared ({ caller }) func importHistoricalData(
    neuronId : Common.NeuronId,
    entries : [Types.HistoricalEntry],
  ) : async () {
    if (Principal.isAnonymous(caller)) {
      Runtime.trap("Anonymous caller not allowed");
    };
    // Verify the caller owns the neuron.
    ignore NeuronsLib.getOwnedNeuron(neurons, caller, neuronId);
    RewardsLib.importHistoricalData(rewards, neuronId, entries);
  };
};
