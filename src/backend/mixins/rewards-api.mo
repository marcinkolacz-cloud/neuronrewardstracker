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

  /// Edit a single snapshot identified by (neuronId, timestamp): replace its
  /// timestamp with `newTimestamp` and its maturity total with
  /// `newMaturityE8s`. After the edit, the history is re-sorted
  /// chronologically and deltas/eventTypes are recomputed for the edited
  /// entry and its new previous and next chronological neighbors. The
  /// frontend is responsible for confirming the edit with the user before
  /// calling this endpoint.
  public shared ({ caller }) func editSnapshot(
    neuronId : Common.NeuronId,
    timestamp : Int,
    newTimestamp : Int,
    newMaturityE8s : Nat64,
  ) : async () {
    if (Principal.isAnonymous(caller)) {
      Runtime.trap("Anonymous caller not allowed");
    };
    // Verify the caller owns the neuron.
    ignore NeuronsLib.getOwnedNeuron(neurons, caller, neuronId);
    RewardsLib.editSnapshot(rewards, neuronId, timestamp, newTimestamp, newMaturityE8s);
  };

  /// Delete a single snapshot identified by (neuronId, timestamp). After the
  /// delete, deltas/eventTypes are recomputed for the next chronological
  /// entry. The frontend is responsible for confirming the destructive
  /// delete with the user before calling this endpoint.
  public shared ({ caller }) func deleteSnapshot(
    neuronId : Common.NeuronId,
    timestamp : Int,
  ) : async () {
    if (Principal.isAnonymous(caller)) {
      Runtime.trap("Anonymous caller not allowed");
    };
    // Verify the caller owns the neuron.
    ignore NeuronsLib.getOwnedNeuron(neurons, caller, neuronId);
    RewardsLib.deleteSnapshot(rewards, neuronId, timestamp);
  };
};
