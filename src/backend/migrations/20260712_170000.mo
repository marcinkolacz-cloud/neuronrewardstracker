import List "mo:core/List";
import Map "mo:core/Map";

module {
  // OldActor mirrors the NewActor of the preceding migration
  // (20260712_160000.mo): the canister had WTN state with a 3-case
  // WtnEventType variant (#capitalAdded, #withdrawal, #organicGrowth). This
  // migration widens WtnEventType to 4 cases by adding #firstReading, which
  // tags the very first snapshot on a fresh WTN position (no prior entry to
  // compare against) — mirroring the #firstReading classification already used
  // for NNS neurons (see types/rewards.mo).
  //
  // Variant widening is data-preserving at the value level: every existing
  // snapshot's eventType is already one of the three old tags, all of which
  // remain valid in the new variant. However, `Map.Map` is invariant in its
  // value type, so we cannot directly assign the old
  // `Map<WtnPositionId, List<WtnSnapshot>>` (3-case eventType) to the new
  // `Map<WtnPositionId, List<WtnSnapshot>>` (4-case eventType). We rebuild the
  // wtnSnapshots Map by mapping over each position's snapshot list, widening
  // each snapshot's eventType from OldWtnEventType to NewWtnEventType (a pure
  // cast — no data changes). All other stable fields carry through unchanged.

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

  // WTN types inlined. OldWtnEventType is the 3-case variant from the
  // preceding migration; NewWtnEventType adds #firstReading.
  type WtnPositionId = Nat;
  type WtnPosition = {
    id : WtnPositionId;
    name : Text;
    ownerId : Principal;
    startDate : Int;
  };
  type OldWtnEventType = { #capitalAdded; #withdrawal; #organicGrowth };
  type NewWtnEventType = { #firstReading; #capitalAdded; #withdrawal; #organicGrowth };
  type OldWtnSnapshot = {
    positionId : WtnPositionId;
    date : Int;
    nicpHeld : Float;
    totalIcpPaid : Float;
    redeemableIcpValue : Float;
    eventType : OldWtnEventType;
  };
  type NewWtnSnapshot = {
    positionId : WtnPositionId;
    date : Int;
    nicpHeld : Float;
    totalIcpPaid : Float;
    redeemableIcpValue : Float;
    eventType : NewWtnEventType;
  };

  type OldActor = {
    var accessControlState : AccessControlState;
    var neurons : Map.Map<NeuronId, Neuron>;
    var rewards : Map.Map<NeuronId, List.List<DailyReward>>;
    var syncStatuses : Map.Map<NeuronId, SyncStatus>;
    var syncErrors : Map.Map<NeuronId, Text>;
    var priceCache : Map.Map<Text, CachedPrice>;
    var wtnPositions : Map.Map<WtnPositionId, WtnPosition>;
    var wtnSnapshots : Map.Map<WtnPositionId, List.List<OldWtnSnapshot>>;
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
    var wtnSnapshots : Map.Map<WtnPositionId, List.List<NewWtnSnapshot>>;
    var nextWtnPositionId : { var next : Nat };
  };

  // Variant widening is data-preserving at the value level: every old
  // eventType tag is still a valid new eventType tag. However, `Map.Map` is
  // invariant in its value type, so we rebuild the wtnSnapshots Map by
  // mapping over each position's snapshot list, widening each snapshot's
  // eventType from OldWtnEventType to NewWtnEventType (a pure cast — no data
  // changes). All other stable fields are carried over unchanged.
  public func migration(old : OldActor) : NewActor {
    let newWtnSnapshots = Map.empty<WtnPositionId, List.List<NewWtnSnapshot>>();
    for ((positionId, snapshots) in old.wtnSnapshots.entries()) {
      let widened = List.empty<NewWtnSnapshot>();
      for (s in snapshots.values()) {
        let widenedEventType : NewWtnEventType = s.eventType;
        widened.add({
          positionId = s.positionId;
          date = s.date;
          nicpHeld = s.nicpHeld;
          totalIcpPaid = s.totalIcpPaid;
          redeemableIcpValue = s.redeemableIcpValue;
          eventType = widenedEventType;
        });
      };
      newWtnSnapshots.add(positionId, widened);
    };
    {
      var accessControlState = old.accessControlState;
      var neurons = old.neurons;
      var rewards = old.rewards;
      var syncStatuses = old.syncStatuses;
      var syncErrors = old.syncErrors;
      var priceCache = old.priceCache;
      var wtnPositions = old.wtnPositions;
      var wtnSnapshots = newWtnSnapshots;
      var nextWtnPositionId = old.nextWtnPositionId;
    };
  };
};
