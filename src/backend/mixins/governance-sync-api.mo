import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import Types "../types/governance-sync";
import Common "../types/common";
import NeuronTypes "../types/neurons";
import RewardTypes "../types/rewards";
import NeuronsLib "../lib/neurons";
import RewardsLib "../lib/rewards";
import GovernanceSyncLib "../lib/governance-sync";

mixin (
  neurons : Map.Map<Common.NeuronId, NeuronTypes.Neuron>,
  rewards : Map.Map<Common.NeuronId, List.List<RewardTypes.DailyReward>>,
  syncStatuses : Map.Map<Common.NeuronId, Types.SyncStatus>,
) {
  transient let governanceCanisterId = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");
  /// Sync a single neuron by calling get_full_neuron on the NNS governance
  /// canister, extracting maturity_e8s_equivalent, and recording a snapshot.
  /// Returns a status result indicating success or 'hotkey required'.
  public shared ({ caller }) func syncNeuron(
    neuronId : Common.NeuronId,
  ) : async Types.SyncResult {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    // Verify the caller owns the neuron.
    ignore NeuronsLib.getOwnedNeuron(neurons, caller, neuronId);
    await doSyncNeuron(neuronId);
  };

  /// Sync all neurons owned by the caller.
  public shared ({ caller }) func syncAllMyNeurons() : async [Types.SyncResult] {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    let mine = NeuronsLib.listMyNeurons(neurons, caller);
    let results = List.empty<Types.SyncResult>();
    for (neuron in mine.vals()) {
      let res = await doSyncNeuron(neuron.id);
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

  /// Internal: perform the governance call and record a snapshot. Shared
  /// between the per-neuron, per-owner, and daily-timer paths.
  func doSyncNeuron(neuronId : Common.NeuronId) : async Types.SyncResult {
    let governance : Types.Governance = actor (governanceCanisterId.toText());
    try {
      let result = await governance.get_full_neuron(neuronId);
      let maturity = result.maturity_e8s_equivalent;
      ignore RewardsLib.recordSnapshot(rewards, neuronId, maturity, Time.now());
      GovernanceSyncLib.setSyncStatus(syncStatuses, neuronId, #synced);
      { neuronId; status = #synced; maturityE8s = ?maturity };
    } catch (err) {
      GovernanceSyncLib.setSyncStatus(syncStatuses, neuronId, #hotkeyRequired);
      { neuronId; status = #hotkeyRequired; maturityE8s = null };
    };
  };
};
