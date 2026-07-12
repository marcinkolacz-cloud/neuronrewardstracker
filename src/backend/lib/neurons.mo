import Map "mo:core/Map";
import Iter "mo:core/Iter";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Types "../types/neurons";
import Common "../types/common";

module {
  public type Neuron = Types.Neuron;
  public type NeuronId = Types.NeuronId;

  /// Add a neuron record. Overwrites any existing entry for the same id.
  public func addNeuron(
    neurons : Map.Map<NeuronId, Neuron>,
    neuron : Neuron,
  ) : () {
    neurons.add(neuron.id, neuron);
  };

  /// List all neurons owned by the given principal.
  public func listMyNeurons(
    neurons : Map.Map<NeuronId, Neuron>,
    owner : Principal,
  ) : [Neuron] {
    neurons.filter(func(_id, n) = Principal.equal(n.ownerId, owner)).values().toArray(
      
    );
  };

  /// Update an existing neuron owned by the caller. Traps if the neuron
  /// does not exist or is not owned by the caller.
  public func updateNeuron(
    neurons : Map.Map<NeuronId, Neuron>,
    caller : Principal,
    neuron : Neuron,
  ) : () {
    switch (neurons.get(neuron.id)) {
      case (?existing) {
        if (not Principal.equal(existing.ownerId, caller)) {
          Runtime.trap("Not authorized to update this neuron");
        };
        neurons.add(neuron.id, neuron);
      };
      case null {
        Runtime.trap("Neuron not found");
      };
    };
  };

  /// Remove a neuron owned by the caller. Traps if the neuron does not
  /// exist or is not owned by the caller.
  public func removeNeuron(
    neurons : Map.Map<NeuronId, Neuron>,
    caller : Principal,
    neuronId : NeuronId,
  ) : () {
    switch (neurons.get(neuronId)) {
      case (?existing) {
        if (not Principal.equal(existing.ownerId, caller)) {
          Runtime.trap("Not authorized to remove this neuron");
        };
        neurons.remove(neuronId);
      };
      case null {
        Runtime.trap("Neuron not found");
      };
    };
  };

  /// Look up a neuron by ID, verifying ownership. Returns null if the
  /// neuron does not exist; traps if it exists but is not owned by the caller.
  public func getOwnedNeuron(
    neurons : Map.Map<NeuronId, Neuron>,
    caller : Principal,
    neuronId : NeuronId,
  ) : ?Neuron {
    switch (neurons.get(neuronId)) {
      case (?existing) {
        if (not Principal.equal(existing.ownerId, caller)) {
          Runtime.trap("Not authorized to access this neuron");
        };
        ?existing;
      };
      case null null;
    };
  };
};
