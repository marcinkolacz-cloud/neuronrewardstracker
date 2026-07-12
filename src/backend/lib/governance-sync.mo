import List "mo:core/List";
import Map "mo:core/Map";
import Error "mo:core/Error";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Nat64 "mo:core/Nat64";
import Int "mo:core/Int";
import Float "mo:core/Float";
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

          // --- Merge Maturity detection ---
          // A Merge Maturity governance event moves unstaked maturity into the
          // neuron's stake: `maturity_e8s_equivalent` (unstaked) drops and
          // `cached_neuron_stake_e8s` (stake) rises by a roughly corresponding
          // amount in the same sync. The combined-total delta is negative
          // (maturity left the maturity bucket), so without an override
          // recordSnapshot would auto-classify it as #disburseOrSpawn — but
          // the value stayed inside the neuron, so it must NOT count toward
          // Total Disbursed. Detect the pattern here and pass
          // ?#mergedToStake as the eventTypeOverride.
          //
          // We need the PREVIOUS snapshot's unstaked maturity and the
          // neuron's stakedE8s BEFORE this sync updates it, plus the new
          // governance-reported stake. Read both before calling
          // recordSnapshot / updateStakedE8s.
          let prevUnstaked : ?Nat64 = switch (rewards.get(neuronId)) {
            case (?history) {
              switch (history.last()) {
                case (?last) ?last.unstakedMaturityE8s;
                case null null;
              };
            };
            case null null;
          };
          let prevStakedE8s : ?Nat64 = switch (neurons.get(neuronId)) {
            case (?n) ?n.stakedE8s;
            case null null;
          };
          let newStakedE8s : ?Nat64 = neuron.cached_neuron_stake_e8s;

          // Threshold for "unstaked maturity dropped significantly". A small
          // drop could be ordinary rounding/fees; require a meaningful drop.
          // Use 1_000 e8s (= 0.00001 ICP) as the floor to avoid noise.
          let mergeThreshold : Nat64 = 1_000;

          let isMergeMaturity : Bool = switch (prevUnstaked, newStakedE8s, prevStakedE8s) {
            case (?prevUnstakedVal, ?newStake, ?prevStake) {
              // Unstaked maturity dropped by more than the threshold...
              let unstakedDrop : Int = Nat.toInt(prevUnstakedVal.toNat()) - Nat.toInt(unstaked.toNat());
              if (unstakedDrop <= Nat.toInt(mergeThreshold.toNat())) { false }
              else {
                // ...and the stake rose by a roughly corresponding amount.
                // "Roughly corresponding" = the stake increase is positive
                // and within a small tolerance of the unstaked drop. Allow a
                // 10% tolerance either way to absorb governance rounding.
                let stakeIncrease : Int = Nat.toInt(newStake.toNat()) - Nat.toInt(prevStake.toNat());
                if (stakeIncrease <= 0) { false }
                else {
                  let drop = unstakedDrop.toFloat();
                  let rise = stakeIncrease.toFloat();
                  let tolerance = drop * 0.10;
                  (rise >= drop - tolerance) and (rise <= drop + tolerance);
                };
              };
            };
            case _ false;
          };

          let eventTypeOverride : ?RewardTypes.EventType = if (isMergeMaturity) {
            ?#mergedToStake;
          } else {
            null;
          };

          // --- External top-up detection ---
          // If the stake rose but the event was NOT classified as
          // #mergedToStake (i.e. there was no corresponding unstaked-maturity
          // drop), the increase came from an external ICP top-up sent directly
          // to the neuron account. Tag it #externalTopUp so the stats layer
          // treats the stake increase as new capital contributed (not as
          // earned reward). stakeDeltaE8s carries the absolute increase.
          //
          // stakeDeltaE8s is also populated for #mergedToStake (the amount of
          // maturity merged into stake), so the stats layer can record the
          // stake change for both stake-changing event types. For all other
          // event types it is 0 (no external stake change).
          let stakeDeltaE8s : Nat64 = switch (newStakedE8s, prevStakedE8s) {
            case (?newStake, ?prevStake) {
              if (newStake > prevStake) { newStake - prevStake } else { 0 };
            };
            case _ 0;
          };

          let (finalOverride, finalStakeDelta) : (?RewardTypes.EventType, Nat64) = switch (eventTypeOverride) {
            case (?#mergedToStake) (?#mergedToStake, stakeDeltaE8s);
            case _ {
              // Not a merge — check for an external top-up: stake rose with no
              // corresponding maturity drop.
              if (stakeDeltaE8s > 0) {
                (?#externalTopUp, stakeDeltaE8s);
              } else {
                (null, 0);
              };
            };
          };

          // --- One-time capital-baseline backfill ---
          // "Total capital contributed" in the stats layer is seeded from
          // neuron.initialStakeE8s, a SEPARATE manual field from stakedE8s.
          // The Add Neuron form never sets initialStakeE8s, so it defaults to
          // 0 for existing neurons while stakedE8s is correctly synced from
          // governance — leaving totalCapitalContributed = 0 and breaking
          // percentageReturn / apy30d / blendedApy.
          //
          // Backfill ONCE: if initialStakeE8s is still at its default 0 AND
          // governance reports a positive synced stake (the v from
          // newStakedE8s == ?v that is about to be passed to
          // updateStakedE8s), seed initialStakeE8s := v so the capital
          // baseline reflects the first real synced stake. This must run
          // BEFORE recordSnapshot so the snapshot reflects the backfilled
          // baseline. Once initialStakeE8s has a real non-zero value, never
          // overwrite it — later stake changes flow through as
          // #externalTopUp events per the existing capital-vs-rewards design.
          // This only mutates initialStakeE8s on the neuron record; it does
          // not synthesize a snapshot event or alter the override/delta logic.
          switch (newStakedE8s) {
            case (?v) {
              if (v > 0) {
                switch (neurons.get(neuronId)) {
                  case (?existing) {
                    if (existing.initialStakeE8s == (0 : Common.E8s)) {
                      neurons.add(neuronId, { existing with initialStakeE8s = v });
                    };
                  };
                  case null {};
                };
              };
            };
            case null {};
          };

          // Record the maturity snapshot (delta computed from combined total).
          // Pass the override so a Merge Maturity event is tagged
          // #mergedToStake and an external top-up is tagged #externalTopUp
          // instead of auto-classifying by the maturity delta.
          ignore RewardsLib.recordSnapshot(
            rewards,
            neuronId,
            unstaked,
            stakedMaturity,
            autoStake,
            Time.now(),
            finalOverride,
            finalStakeDelta,
          );

          // Update the neuron's sync-sourced staked amount from
          // cached_neuron_stake_e8s when governance reports it. When absent,
          // leave stakedE8s unchanged (initialStakeE8s remains the fallback).
          let stakedE8s : ?Nat64 = switch (newStakedE8s) {
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
