import List "mo:core/List";
import Map "mo:core/Map";
import Error "mo:core/Error";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Nat64 "mo:core/Nat64";
import Types "../types/governance-sync";
import Common "../types/common";
import RewardTypes "../types/rewards";
import RewardsLib "rewards";
import NeuronsLib "neurons";

module {
  public type SyncStatus = Types.SyncStatus;
  public type SyncResult = Types.SyncResult;
  public type NeuronId = Common.NeuronId;

  /// Read the current sync status for a neuron. Returns #neverSynced if
  /// no status has been recorded yet.
  public func getSyncStatus(
    statuses : Map.Map<NeuronId, SyncStatus>,
    neuronId : NeuronId,
  ) : SyncStatus {
    switch (statuses.get(neuronId)) {
      case (?s) s;
      case null #neverSynced;
    };
  };

  /// Persist the sync status for a neuron.
  public func setSyncStatus(
    statuses : Map.Map<NeuronId, SyncStatus>,
    neuronId : NeuronId,
    status : SyncStatus,
  ) : () {
    statuses.add(neuronId, status);
  };

  /// Read the last stored sync error reason for a neuron. Returns null if
  /// no error has been recorded (or if it was cleared on a successful sync).
  public func getSyncError(
    errors : Map.Map<NeuronId, Text>,
    neuronId : NeuronId,
  ) : ?Text {
    errors.get(neuronId);
  };

  /// Store the sync error reason for a neuron (overwrites any prior reason).
  public func setSyncError(
    errors : Map.Map<NeuronId, Text>,
    neuronId : NeuronId,
    reason : Text,
  ) : () {
    errors.add(neuronId, reason);
  };

  /// Clear any stored sync error reason for a neuron (called on success).
  public func clearSyncError(
    errors : Map.Map<NeuronId, Text>,
    neuronId : NeuronId,
  ) : () {
    errors.remove(neuronId);
  };

  /// Shared governance sync logic used by both the public mixin endpoints
  /// and the daily timer. Calls get_full_neuron on the governance canister,
  /// records a maturity snapshot on success (clearing any prior error and
  /// setting #synced), or captures the real error reason on failure. The
  /// governance canister returns a Result variant { #Ok; #Err } — the #Err
  /// branch carries a GovernanceError with an error_message we surface into
  /// the per-neuron error store and the returned SyncResult. Traps/rejections
  /// are still caught by the surrounding try/catch (Error.message). Never
  /// traps — returns a SyncResult describing the outcome so callers (notably
  /// the timer loop) can continue to the next neuron.
  ///
  /// All three maturity fields are read on every successful sync regardless
  /// of auto-stake mode: `maturity_e8s_equivalent` (unstaked, always
  /// present), `staked_maturity_e8s_equivalent` (optional, default 0), and
  /// `auto_stake_maturity` (optional, default false). Both maturity values
  /// are recorded on the snapshot; the returned `SyncResult.maturityE8s`
  /// carries the COMBINED total (unstaked + staked) for backward
  /// compatibility with callers that want a single maturity figure.
  ///
  /// On success, `cached_neuron_stake_e8s` (the actual ICP locked in the
  /// neuron) is read and, when present, stored on the neuron's `stakedE8s`
  /// field via NeuronsLib.updateStakedE8s — so the staked amount updates
  /// automatically on every sync instead of relying on the manually-entered
  /// `initialStakeE8s` fallback. When absent, `stakedE8s` is left unchanged.
  /// The sync-sourced staked amount is returned in `SyncResult.stakedE8s`.
  public func doSync(
    governance : Types.Governance,
    rewards : Map.Map<NeuronId, List.List<RewardTypes.DailyReward>>,
    neurons : Map.Map<NeuronId, NeuronsLib.Neuron>,
    syncStatuses : Map.Map<NeuronId, SyncStatus>,
    syncErrors : Map.Map<NeuronId, Text>,
    caller : Principal,
    neuronId : NeuronId,
  ) : async SyncResult {
    try {
      let result = await governance.get_full_neuron(neuronId);
      switch (result) {
        case (#Ok neuron) {
          let unstaked : Nat64 = neuron.maturity_e8s_equivalent;
          let stakedMaturity : Nat64 = switch (neuron.staked_maturity_e8s_equivalent) {
            case (?v) v;
            case null 0;
          };
          let autoStake : Bool = switch (neuron.auto_stake_maturity) {
            case (?v) v;
            case null false;
          };

          // Record the maturity snapshot (delta computed from combined total).
          ignore RewardsLib.recordSnapshot(
            rewards,
            neuronId,
            unstaked,
            stakedMaturity,
            autoStake,
            Time.now(),
          );

          // Update the neuron's sync-sourced staked amount from
          // cached_neuron_stake_e8s when governance reports it. When absent,
          // leave stakedE8s unchanged (initialStakeE8s remains the fallback).
          let stakedE8s : ?Nat64 = switch (neuron.cached_neuron_stake_e8s) {
            case (?v) {
              NeuronsLib.updateStakedE8s(neurons, caller, neuronId, v);
              ?v;
            };
            case null {
              // Read the existing stakedE8s (if any) to report in the result.
              switch (neurons.get(neuronId)) {
                case (?n) ?n.stakedE8s;
                case null null;
              };
            };
          };

          clearSyncError(syncErrors, neuronId);
          setSyncStatus(syncStatuses, neuronId, #synced);

          let combined : Nat64 = unstaked + stakedMaturity;
          {
            neuronId;
            status = #synced;
            maturityE8s = ?combined;
            stakedE8s;
            lastSyncError = null;
          };
        };
        case (#Err err) {
          let reason = err.error_message;
          setSyncError(syncErrors, neuronId, reason);
          setSyncStatus(syncStatuses, neuronId, #failed);
          {
            neuronId;
            status = #failed;
            maturityE8s = null;
            stakedE8s = null;
            lastSyncError = ?reason;
          };
        };
      };
    } catch e {
      let reason = e.message();
      setSyncError(syncErrors, neuronId, reason);
      setSyncStatus(syncStatuses, neuronId, #failed);
      {
        neuronId;
        status = #failed;
        maturityE8s = null;
        stakedE8s = null;
        lastSyncError = ?reason;
      };
    };
  };
};
