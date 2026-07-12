import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Types "../types/neurons";
import Common "../types/common";
import NeuronsLib "../lib/neurons";

mixin (
  neurons : Map.Map<Types.NeuronId, Types.Neuron>,
) {
  /// Add a neuron to track. Scoped to the caller's principal via ownerId.
  public shared ({ caller }) func addNeuron(
    id : Types.NeuronId,
    name : Text,
    startDate : Int,
    dissolveDelaySeconds : Nat64,
    initialStakeE8s : Nat64,
  ) : async () {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    let neuron : Types.Neuron = {
      id;
      name;
      startDate;
      dissolveDelaySeconds;
      initialStakeE8s;
      ownerId = caller;
    };
    NeuronsLib.addNeuron(neurons, neuron);
  };

  /// List all neurons owned by the caller.
  public shared ({ caller }) func listMyNeurons() : async [Types.Neuron] {
    NeuronsLib.listMyNeurons(neurons, caller);
  };

  /// Update a neuron owned by the caller.
  public shared ({ caller }) func updateNeuron(neuron : Types.Neuron) : async () {
    NeuronsLib.updateNeuron(neurons, caller, neuron);
  };

  /// Remove a neuron owned by the caller.
  public shared ({ caller }) func removeNeuron(neuronId : Types.NeuronId) : async () {
    NeuronsLib.removeNeuron(neurons, caller, neuronId);
  };
};
