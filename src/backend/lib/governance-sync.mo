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
  public func doSync(
    governance : Types.Governance,
    rewards : Map.Map<NeuronId, List.List<RewardTypes.DailyReward>>,
    syncStatuses : Map.Map<NeuronId, SyncStatus>,
    syncErrors : Map.Map<NeuronId, Text>,
    neuronId : NeuronId,
  ) : async SyncResult {
    try {
      let result = await governance.get_full_neuron(neuronId);
      switch (result) {
        case (#Ok neuron) {
          let unstakedMaturityE8s = neuron.maturity_e8s_equivalent;
          let stakedMaturityE8s : Nat64 = switch (neuron.staked_maturity_e8s_equivalent) {
            case (?v) v;
            case null 0;
          };
          let autoStakeMaturity : Bool = switch (neuron.auto_stake_maturity) {
            case (?v) v;
            case null false;
          };
          ignore RewardsLib.recordSnapshot(
            rewards,
            neuronId,
            unstakedMaturityE8s,
            stakedMaturityE8s,
            autoStakeMaturity,
            Time.now(),
          );
          setSyncStatus(syncStatuses, neuronId, #synced);
          clearSyncError(syncErrors, neuronId);
          // Combined total for backward-compatible single-figure return.
          let combined : Nat64 = unstakedMaturityE8s + stakedMaturityE8s;
          { neuronId; status = #synced; maturityE8s = ?combined; lastSyncError = null };
        };
        case (#Err govErr) {
          let reason = govErr.error_message;
          // Governance refuses to return full neuron details when the
          // caller's hotkey is not configured. The error message in that
          // case references "hotkey"; map it to #hotkeyRequired per the
          // existing convention so the UI can prompt for hotkey setup
          // rather than showing a generic failure.
          let status = if (reason.contains(#text "hotkey")) {
            #hotkeyRequired;
          } else {
            #failed;
          };
          setSyncStatus(syncStatuses, neuronId, status);
          setSyncError(syncErrors, neuronId, reason);
          { neuronId; status; maturityE8s = null; lastSyncError = ?reason };
        };
      };
    } catch (err) {
      let reason = err.message();
      setSyncStatus(syncStatuses, neuronId, #failed);
      setSyncError(syncErrors, neuronId, reason);
      { neuronId; status = #failed; maturityE8s = null; lastSyncError = ?reason };
    };
  };
};
