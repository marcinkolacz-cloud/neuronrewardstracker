import List "mo:core/List";
import Map "mo:core/Map";

module {
  // OldActor mirrors the NewActor of the preceding migration
  // (20260712_150000.mo): the canister had stable state for neurons, rewards,
  // syncStatuses, syncErrors, priceCache, and accessControlState, but no WTN
  // (WaterNeuron nICP liquid-staking) state. This migration adds two new
  // stable fields for the WTN domain:
  //   - wtnPositions : Map.Map<Nat, WtnPosition> — WTN position records keyed
  //     by canister-assigned position id.
  //   - wtnSnapshots : Map.Map<Nat, List.List<WtnSnapshot>> — per-position
  //     snapshot lists keyed by position id.
  //   - nextWtnPositionId : { var next : Nat } — monotonic id counter.
  // Adding new stable fields is a field-addition migration: the new fields
  // are initialized to empty containers (and 0 for the counter) since no WTN
  // data existed before this migration. All existing fields carry through
  // unchanged.

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

  // WTN types inlined for the new stable fields.
  type WtnPositionId = Nat;
  type WtnPosition = {
    id : WtnPositionId;
    name : Text;
    ownerId : Principal;
    startDate : Int;
  };
  type WtnEventType = { #capitalAdded; #withdrawal; #organicGrowth };
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
  };

  // Field-addition migration: all existing stable fields carry through
  // unchanged. The three new WTN fields are initialized to empty containers
  // (and 0 for the counter) since no WTN data existed before this migration.
  // `nextWtnPositionId` is wrapped in a `{ var next : Nat }` record so the
  // WtnApi mixin (which receives it as a parameter) can mutate it by reference
  // — a bare `var` would be passed by value to the mixin.
  public func migration(old : OldActor) : NewActor {
    {
      var accessControlState = old.accessControlState;
      var neurons = old.neurons;
      var rewards = old.rewards;
      var syncStatuses = old.syncStatuses;
      var syncErrors = old.syncErrors;
      var priceCache = old.priceCache;
      var wtnPositions = Map.empty();
      var wtnSnapshots = Map.empty();
      var nextWtnPositionId = { var next = 0 };
    };
  };
};
