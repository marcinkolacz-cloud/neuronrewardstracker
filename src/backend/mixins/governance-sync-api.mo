import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Types "../types/governance-sync";
import Common "../types/common";
import NeuronTypes "../types/neurons";
import RewardTypes "../types/rewards";
import NeuronsLib "../lib/neurons";
import GovernanceSyncLib "../lib/governance-sync";

mixin (
  neurons : Map.Map<Common.NeuronId, NeuronTypes.Neuron>,
  rewards : Map.Map<Common.NeuronId, List.List<RewardTypes.DailyReward>>,
  syncStatuses : Map.Map<Common.NeuronId, Types.SyncStatus>,
  syncErrors : Map.Map<Common.NeuronId, Text>,
) {
  transient let governanceCanisterId = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");
  transient let governance : Types.Governance = actor (governanceCanisterId.toText());

  /// Sync a single neuron by calling get_full_neuron on the NNS governance
  /// canister. Returns a SyncResult carrying the status, maturity (if
  /// successful), and the error reason (if failed). On failure the status is
  /// #failed and the real Error.message is stored per-neuron and returned.
  public shared ({ caller }) func syncNeuron(
    neuronId : Common.NeuronId,
  ) : async Types.SyncResult {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    // Verify the caller owns the neuron.
    ignore NeuronsLib.getOwnedNeuron(neurons, caller, neuronId);
    await GovernanceSyncLib.doSync(
      governance,
      rewards,
      syncStatuses,
      syncErrors,
      neuronId,
    );
  };

  /// Sync all neurons owned by the caller. Each SyncResult carries its own
  /// status and (if failed) error reason, so the frontend can show which
  /// neurons failed and why.
  public shared ({ caller }) func syncAllMyNeurons() : async [Types.SyncResult] {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    let mine = NeuronsLib.listMyNeurons(neurons, caller);
    let results = List.empty<Types.SyncResult>();
    for (neuron in mine.vals()) {
      let res = await GovernanceSyncLib.doSync(
        governance,
        rewards,
        syncStatuses,
        syncErrors,
        neuron.id,
      );
      results.add(res);
    };
    results.toArray();
  };

  /// Query the current sync status for a neuron.
  public shared ({ caller }) func getSyncStatus(
    neuronId : Common.NeuronId,
  ) : async Types.SyncStatus {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    // Verify the caller owns the neuron.
    ignore NeuronsLib.getOwnedNeuron(neurons, caller, neuronId);
    GovernanceSyncLib.getSyncStatus(syncStatuses, neuronId);
  };

  /// Query the last stored sync error reason for a neuron. Returns null if
  /// the last sync succeeded or no sync has been attempted. The frontend uses
  /// this together with getSyncStatus to render "Sync failed: <reason>".
  public shared ({ caller }) func getSyncError(
    neuronId : Common.NeuronId,
  ) : async ?Text {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    // Verify the caller owns the neuron.
    ignore NeuronsLib.getOwnedNeuron(neurons, caller, neuronId);
    GovernanceSyncLib.getSyncError(syncErrors, neuronId);
  };
};
