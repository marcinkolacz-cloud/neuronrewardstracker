import Map "mo:core/Map";
import List "mo:core/List";
import Set "mo:core/Set";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Types "../types/neurons";
import Common "../types/common";
import RewardTypes "../types/rewards";
import GovernanceSyncTypes "../types/governance-sync";
import NeuronsLib "../lib/neurons";
import InvitesLib "../lib/invites";

mixin (
  neurons : Map.Map<Types.NeuronId, Types.Neuron>,
  rewards : Map.Map<Common.NeuronId, List.List<RewardTypes.DailyReward>>,
  syncStatuses : Map.Map<Common.NeuronId, GovernanceSyncTypes.SyncStatus>,
  syncErrors : Map.Map<Common.NeuronId, Text>,
  grantedPrincipals : Set.Set<Principal>,
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
    if (not InvitesLib.isGranted(grantedPrincipals, caller)) {
      Runtime.trap("Access not granted. Please redeem an invite code.");
    };
    let neuron : Types.Neuron = {
      id;
      name;
      startDate;
      dissolveDelaySeconds;
      initialStakeE8s;
      stakedE8s = 0;
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
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    if (not InvitesLib.isGranted(grantedPrincipals, caller)) {
      Runtime.trap("Access not granted. Please redeem an invite code.");
    };
    NeuronsLib.updateNeuron(neurons, caller, neuron);
  };

  /// Remove a neuron owned by the caller. Cascades to delete all of that
  /// neuronId's DailyReward history, syncStatus, and syncError entries so
  /// re-adding the same neuron ID starts fresh.
  public shared ({ caller }) func removeNeuron(neuronId : Types.NeuronId) : async () {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    if (not InvitesLib.isGranted(grantedPrincipals, caller)) {
      Runtime.trap("Access not granted. Please redeem an invite code.");
    };
    NeuronsLib.removeNeuron(
      neurons,
      rewards,
      syncStatuses,
      syncErrors,
      caller,
      neuronId,
    );
  };
};
