import List "mo:core/List";
import Map "mo:core/Map";
import Set "mo:core/Set";

module {
  // OldActor mirrors the NewActor of the preceding migration
  // (20260712_180000.mo): the canister had no invite-code system and no
  // adminPrincipal / grantedPrincipals stable fields. Admin bootstrapping
  // was handled solely by the caffeineai-authorization AccessControlState
  // adminAssigned Bool flag (first caller becomes admin), with NO stored
  // adminPrincipal and NO invite-code-based access control.
  //
  // This migration introduces the invite-code access control system:
  //   - adminPrincipal : ?Principal  (nullable; null until bootstrap)
  //   - inviteCodes : Map<Text, InviteCode>
  //   - grantedPrincipals : Set<Principal>
  //
  // All three new fields start empty/null at upgrade time. Existing data
  // (neurons, rewards, etc.) carries through unchanged. The owner principal
  // (udhkd-o3pbb-miae2-v2xfd-57zp3-w2xd2-s2r22-ep2nt-cyses-d3uhy-sqe) does
  // NOT need to redeem a code: the bootstrap path (setAdminPrincipal)
  // auto-grants the calling admin Principal access to grantedPrincipals on
  // first successful call.

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

  // New invite-code domain types (inlined — migrations must be
  // self-contained, only mo:core imports allowed).
  type InviteCodeStatus = { #unused; #used; #revoked };
  type InviteCode = {
    code : Text;
    status : InviteCodeStatus;
    createdAt : Int;
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
    var _dailySyncInstalled : Bool;
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
    adminPrincipal : { var value : ?Principal };
    var inviteCodes : Map.Map<Text, InviteCode>;
    var grantedPrincipals : Set.Set<Principal>;
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
      var _dailySyncInstalled = old._dailySyncInstalled;
      // New invite-code system starts unconfigured: no admin principal
      // until the owner calls setAdminPrincipal, no codes, no grants.
      // The owner retains access to existing data via the bootstrap
      // auto-grant path, NOT via a pre-seeded grant here.
      // adminPrincipal is a record with a mutable `value` field so the
      // InvitesApi mixin can mutate it by reference (a bare `var` would be
      // passed by value to the mixin).
      adminPrincipal = { var value = null : ?Principal };
      var inviteCodes = Map.empty();
      var grantedPrincipals = Set.empty();
    };
  };
};
