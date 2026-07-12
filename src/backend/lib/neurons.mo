import Map "mo:core/Map";
import Iter "mo:core/Iter";
import List "mo:core/List";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Types "../types/neurons";
import Common "../types/common";
import RewardTypes "../types/rewards";
import GovernanceSyncTypes "../types/governance-sync";

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

  /// Remove a neuron owned by the caller AND cascade-delete all associated
  /// data for that neuronId: the DailyReward history (rewards Map), the
  /// syncStatus entry, and the syncError entry. Traps if the neuron does
  /// not exist or is not owned by the caller. After removal, re-adding a
  /// neuron with the same ID starts with empty history, no stale sync
  /// status, and no stale error.
  public func removeNeuron(
    neurons : Map.Map<NeuronId, Neuron>,
    rewards : Map.Map<NeuronId, List.List<RewardTypes.DailyReward>>,
    syncStatuses : Map.Map<NeuronId, GovernanceSyncTypes.SyncStatus>,
    syncErrors : Map.Map<NeuronId, Text>,
    caller : Principal,
    neuronId : NeuronId,
  ) : () {
    // Verify ownership via getOwnedNeuron (traps if not owned / not found).
    ignore getOwnedNeuron(neurons, caller, neuronId);
    // Remove the neuron record.
    neurons.remove(neuronId);
    // Cascade-delete all associated per-neuron data so re-adding the same
    // neuron ID starts fresh. `remove` is a no-op when the key is absent, so
    // these are safe even if a given store never had an entry for this neuron.
    rewards.remove(neuronId);
    syncStatuses.remove(neuronId);
    syncErrors.remove(neuronId);
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

  /// Update only the sync-sourced `stakedE8s` field of a neuron record,
  /// leaving `initialStakeE8s` (the manual fallback) untouched. Called by
  /// doSync on every successful governance sync so the neuron's staked
  /// amount reflects the actual ICP locked in the neuron
  /// (`cached_neuron_stake_e8s`) instead of the manually-entered value.
  /// Traps if the neuron does not exist or is not owned by the caller.
  public func updateStakedE8s(
    neurons : Map.Map<NeuronId, Neuron>,
    caller : Principal,
    neuronId : NeuronId,
    stakedE8s : Common.E8s,
  ) : () {
    switch (neurons.get(neuronId)) {
      case (?existing) {
        if (not Principal.equal(existing.ownerId, caller)) {
          Runtime.trap("Not authorized to update this neuron");
        };
        neurons.add(neuronId, { existing with stakedE8s });
      };
      case null {
        Runtime.trap("Neuron not found");
      };
    };
  };
};
