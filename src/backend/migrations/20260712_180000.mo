import List "mo:core/List";
import Map "mo:core/Map";

module {
  // OldActor mirrors the NewActor of the preceding migration
  // (20260712_170000.mo): the canister had no `_dailySyncInstalled` stable
  // field — the daily-sync-installed guard was a TRANSIENT var, which reset
  // to `false` on every canister restart/upgrade. That risked installing
  // duplicate daily timers if `startDailySync()` was called again after a
  // restart (the reschedule loop re-arms its own timer, so a second
  // `startDailySync()` would install a parallel timer → multiple syncs/day).
  //
  // This migration promotes the guard to a STABLE Bool so it persists across
  // restarts. The initial value is `false`: at upgrade time no timer is
  // installed (timers are not persisted across upgrades regardless), so the
  // first post-upgrade `startDailySync()` call correctly installs the first
  // timer and sets the flag to `true`. From then on the flag stays `true`
  // across restarts, keeping `startDailySync()` idempotent for the canister's
  // lifetime. All other stable fields carry through unchanged.

  type NeuronId = Nat64;
  type Neuron = {
    id : NeuronId;
    name : Text;
    startDate : Int;
    dissolveDelaySeconds : Nat64;
    initialStakeE8s : Nat64;
    stakedE8s : Nat64;
    ownerId : Principal;
  };
  type EventType = { #normalGrowth; #disburseOrSpawn; #firstReading; #mergedToStake; #externalTopUp };
  type DailyReward = {
    neuronId : NeuronId;
    timestamp : Int;
    unstakedMaturityE8s : Nat64;
    stakedMaturityE8s : Nat64;
    autoStakeMaturity : Bool;
    deltaE8s : Int;
    stakeDeltaE8s : Nat64;
    eventType : EventType;
  };
  type SyncStatus = { #synced; #hotkeyRequired; #neverSynced; #failed };
  type UserRole = { #admin; #user; #guest };
  type AccessControlState = {
    var adminAssigned : Bool;
    userRoles : Map.Map<Principal, UserRole>;
  };
  type CachedPrice = {
    usd : Float;
    pln : Float;
    fetchedAtNanos : Int;
  };
  type WtnPositionId = Nat;
  type WtnPosition = {
    id : WtnPositionId;
    name : Text;
    ownerId : Principal;
    startDate : Int;
  };
  type WtnEventType = { #firstReading; #capitalAdded; #withdrawal; #organicGrowth };
  type WtnSnapshot = {
    positionId : WtnPositionId;
    date : Int;
    nicpHeld : Float;
    totalIcpPaid : Float;
    redeemableIcpValue : Float;
    eventType : WtnEventType;
  };

  type OldActor = {
    var accessControlState : AccessControlState;
    var neurons : Map.Map<NeuronId, Neuron>;
    var rewards : Map.Map<NeuronId, List.List<DailyReward>>;
    var syncStatuses : Map.Map<NeuronId, SyncStatus>;
    var syncErrors : Map.Map<NeuronId, Text>;
    var priceCache : Map.Map<Text, CachedPrice>;
    var wtnPositions : Map.Map<WtnPositionId, WtnPosition>;
    var wtnSnapshots : Map.Map<WtnPositionId, List.List<WtnSnapshot>>;
    var nextWtnPositionId : { var next : Nat };
  };

  type NewActor = {
    var accessControlState : AccessControlState;
    var neurons : Map.Map<NeuronId, Neuron>;
    var rewards : Map.Map<NeuronId, List.List<DailyReward>>;
    var syncStatuses : Map.Map<NeuronId, SyncStatus>;
    var syncErrors : Map.Map<NeuronId, Text>;
    var priceCache : Map.Map<Text, CachedPrice>;
    var wtnPositions : Map.Map<WtnPositionId, WtnPosition>;
    var wtnSnapshots : Map.Map<WtnPositionId, List.List<WtnSnapshot>>;
    var nextWtnPositionId : { var next : Nat };
    var _dailySyncInstalled : Bool;
  };

  public func migration(old : OldActor) : NewActor {
    {
      var accessControlState = old.accessControlState;
      var neurons = old.neurons;
      var rewards = old.rewards;
      var syncStatuses = old.syncStatuses;
      var syncErrors = old.syncErrors;
      var priceCache = old.priceCache;
      var wtnPositions = old.wtnPositions;
      var wtnSnapshots = old.wtnSnapshots;
      var nextWtnPositionId = old.nextWtnPositionId;
      // No timer is installed at upgrade time (timers never persist across
      // upgrades), so the guard starts false. The first post-upgrade
      // startDailySync() call installs the timer and flips this to true.
      var _dailySyncInstalled = false;
    };
  };
};
