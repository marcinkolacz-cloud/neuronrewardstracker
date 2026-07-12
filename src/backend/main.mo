import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Timer "mo:core/Timer";

import MixinViews "mo:caffeineai-data-viewer/MixinViews";
import AccessControl "mo:caffeineai-authorization/access-control";
import MixinAuthorization "mo:caffeineai-authorization/MixinAuthorization";
import OQL "mo:caffeineai-oql";
import Expose "mo:caffeineai-oql/Expose";

import Common "types/common";
import NeuronTypes "types/neurons";
import RewardTypes "types/rewards";
import GovernanceSyncTypes "types/governance-sync";
import _StatsTypes "types/stats";

// OQL row converters — imported top-level so the entity resolver picks them up
// for auto-derived fields whose types are non-primitive (variants).
import _EventTypeValue "types/EventTypeValue";

import NeuronsApi "mixins/neurons-api";
import RewardsApi "mixins/rewards-api";
import GovernanceSyncApi "mixins/governance-sync-api";
import StatsApi "mixins/stats-api";

import GovernanceSyncLib "lib/governance-sync";

actor {
  // Existing platform mixins
  include MixinViews();

  let accessControlState : AccessControl.AccessControlState;
  include MixinAuthorization(accessControlState, null);

  // --- Stable state for NeuronRewardsTracker domains ---
  // Neuron records keyed by neuron ID.
  let neurons : Map.Map<Common.NeuronId, NeuronTypes.Neuron>;
  // Reward snapshots keyed by neuron ID; each list is sorted by timestamp.
  let rewards : Map.Map<Common.NeuronId, List.List<RewardTypes.DailyReward>>;
  // Per-neuron governance sync status.
  let syncStatuses : Map.Map<Common.NeuronId, GovernanceSyncTypes.SyncStatus>;
  // Per-neuron last sync error reason (present only when status is #failed).
  let syncErrors : Map.Map<Common.NeuronId, Text>;

  // --- Domain mixins ---
  include NeuronsApi(neurons);
  include RewardsApi(rewards, neurons);
  include GovernanceSyncApi(neurons, rewards, syncStatuses, syncErrors);
  include StatsApi(neurons, rewards);

  // --- OQL: expose stored collections for natural-language queries ---
  // Neurons are per-user data — each signed-in caller reads only their own rows.
  include Expose({
    entities = [
      neurons
        .toEntity("neuron", "Neuron", "id")
        .sample({
          id = 0 : Common.NeuronId;
          name = "";
          startDate = 0 : Int;
          dissolveDelaySeconds = 0 : Nat64;
          initialStakeE8s = 0 : Nat64;
          stakedE8s = 0 : Nat64;
          ownerId = Principal.fromText("aaaaa-aa");
        })
        .ownedBy("ownerId")
        .controllerOrScoped()
        .build(),
      // Reward snapshots are per-user via the owning neuron. The owner lives
      // on the neuron record, not on the snapshot, so we expose rewards as
      // controller-only (the agent answers aggregate questions; per-user
      // scoping is enforced by the API layer).
      //
      // `rewards` is a Map<NeuronId, List<DailyReward>> — a Map whose values
      // are Lists, so `.toEntity` (which auto-derives a row per Map *value*)
      // cannot apply: the value is a List, not a flat record. We use manual
      // mode and flatten every neuron's snapshot list into individual rows.
      OQL.Entity.manual<RewardTypes.DailyReward>(
        "dailyReward",
        func() = rewards.entries().flatMap(
          func((_id, snapshots)) = snapshots.values(),
        ),
        "DailyReward",
        "neuronId",
      )
        .payload("neuronId", func(r) = r.neuronId)
        .edge("neuronId", "neuron")
        .payload("timestamp", func(r) = r.timestamp)
        .payload("unstakedMaturityE8s", func(r) = r.unstakedMaturityE8s)
        .payload("stakedMaturityE8s", func(r) = r.stakedMaturityE8s)
        .payload("autoStakeMaturity", func(r) = r.autoStakeMaturity)
        .payload("deltaE8s", func(r) = r.deltaE8s)
        .payload(
          "eventType",
          func(r) = switch (r.eventType) {
            case (#normalGrowth) "normalGrowth";
            case (#disburseOrSpawn) "disburseOrSpawn";
            case (#firstReading) "firstReading";
          },
        )
        .controllerOnly()
        .build(),
      // Per-neuron governance sync status. The primary key (neuronId) lives in
      // the Map key and the value is a variant, so we use manual mode over
      // .entries(): promote the key as a column + edge to the neuron entity,
      // and collapse the SyncStatus variant to a stable text sentinel. Same
      // controller-only authorization as rewards — per-user access is enforced
      // by the API layer (getSyncStatus checks ownership).
      OQL.Entity.manual<(Common.NeuronId, GovernanceSyncTypes.SyncStatus)>(
        "syncStatus",
        func() = syncStatuses.entries(),
        "SyncStatus",
        "neuronId",
      )
        .payload("neuronId", func((id, _)) = id)
        .edge("neuronId", "neuron")
        .payload(
          "status",
          func((_, s)) = switch (s) {
            case (#synced) "synced";
            case (#hotkeyRequired) "hotkeyRequired";
            case (#neverSynced) "neverSynced";
            case (#failed) "failed";
          },
        )
        .controllerOnly()
        .build(),
      // Per-neuron last sync error reason. The primary key (neuronId) lives in
      // the Map key, so manual mode over .entries(): promote the key as a
      // column + edge to the neuron entity, and expose the reason text.
      // Controller-only — per-user access is enforced by the API layer
      // (getSyncError checks ownership).
      OQL.Entity.manual<(Common.NeuronId, Text)>(
        "syncError",
        func() = syncErrors.entries(),
        "SyncError",
        "neuronId",
      )
        .payload("neuronId", func((id, _)) = id)
        .edge("neuronId", "neuron")
        .payload("reason", func((_, reason)) = reason)
        .controllerOnly()
        .build(),
    ];
  });

  // --- Daily timer: sync all neurons in the canister regardless of owner ---
  // Timers are not persisted across upgrades, so we install the recurring
  // timer from a transient initializer that runs on every (re)start. The loop
  // delegates to GovernanceSyncLib.doSync so it shares the same error handling
  // as the public endpoints: each neuron that fails is recorded as #failed
  // with its real error reason, and the loop continues to the next neuron
  // (doSync never traps — it catches and returns a SyncResult).
  //
  // `governance` is provided by the GovernanceSyncApi mixin (included above)
  // as a transient binding; we reuse it here rather than redeclaring the
  // canister id + actor handle, which would collide with the mixin's names.
  transient let _dailySyncTimer : Timer.TimerId = Timer.recurringTimer<system>(
    #hours(24),
    func() : async () {
      for ((neuronId, neuron) in neurons.entries()) {
        ignore await GovernanceSyncLib.doSync(
          governance,
          rewards,
          neurons,
          syncStatuses,
          syncErrors,
          neuron.ownerId,
          neuronId,
        );
      };
    },
  );
};
