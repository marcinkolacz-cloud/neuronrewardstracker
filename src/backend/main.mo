import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Timer "mo:core/Timer";
import Time "mo:core/Time";
import Nat64 "mo:core/Nat64";

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

import RewardsLib "lib/rewards";
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

  // --- Domain mixins ---
  include NeuronsApi(neurons);
  include RewardsApi(rewards, neurons);
  include GovernanceSyncApi(neurons, rewards, syncStatuses);
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
        .payload("maturityE8s", func(r) = r.maturityE8s)
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
          },
        )
        .controllerOnly()
        .build(),
    ];
  });

  // --- Daily timer: sync all neurons in the canister regardless of owner ---
  // Timers are not persisted across upgrades, so we install the recurring
  // timer from a transient initializer that runs on every (re)start.
  transient let _dailySyncTimer : Timer.TimerId = Timer.recurringTimer<system>(
    #hours(24),
    func() : async () {
      // Iterate every tracked neuron in the canister and sync each one.
      for ((neuronId, _neuron) in neurons.entries()) {
        let governance : GovernanceSyncTypes.Governance = actor (governanceCanisterId.toText());
        try {
          let result = await governance.get_full_neuron(neuronId);
          let maturity = result.maturity_e8s_equivalent;
          ignore RewardsLib.recordSnapshot(rewards, neuronId, maturity, Time.now());
          GovernanceSyncLib.setSyncStatus(syncStatuses, neuronId, #synced);
        } catch (_err) {
          GovernanceSyncLib.setSyncStatus(syncStatuses, neuronId, #hotkeyRequired);
        };
      };
    },
  );
};
