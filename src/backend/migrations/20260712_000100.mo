import List "mo:core/List";
import Map "mo:core/Map";

module {
  // OldActor mirrors the NewActor of the preceding migration
  // (20260712_000000.mo): SyncStatus had three variants and there was no
  // syncErrors field.
  type NeuronId = Nat64;
  type Neuron = {
    id : NeuronId;
    name : Text;
    startDate : Int;
    dissolveDelaySeconds : Nat64;
    initialStakeE8s : Nat64;
    ownerId : Principal;
  };
  type DailyReward = {
    neuronId : NeuronId;
    timestamp : Int;
    maturityE8s : Nat64;
    deltaE8s : Int;
    eventType : { #normalGrowth; #disburseOrSpawn; #firstReading };
  };
  type OldSyncStatus = { #synced; #hotkeyRequired; #neverSynced };
  type UserRole = { #admin; #user; #guest };
  type AccessControlState = {
    var adminAssigned : Bool;
    userRoles : Map.Map<Principal, UserRole>;
  };

  type OldActor = {
    var accessControlState : AccessControlState;
    var neurons : Map.Map<NeuronId, Neuron>;
    var rewards : Map.Map<NeuronId, List.List<DailyReward>>;
    var syncStatuses : Map.Map<NeuronId, OldSyncStatus>;
  };

  // NewActor adds the #failed variant to SyncStatus (a stable-compatible
  // widening — old values coerce to the new variant type) and introduces the
  // new syncErrors stable map, initialized to empty.
  type NewSyncStatus = { #synced; #hotkeyRequired; #neverSynced; #failed };

  type NewActor = {
    var accessControlState : AccessControlState;
    var neurons : Map.Map<NeuronId, Neuron>;
    var rewards : Map.Map<NeuronId, List.List<DailyReward>>;
    var syncStatuses : Map.Map<NeuronId, NewSyncStatus>;
    var syncErrors : Map.Map<NeuronId, Text>;
  };

  public func migration(old : OldActor) : NewActor {
    // SyncStatus widening: every old variant tag exists in NewSyncStatus, so
    // each value coerces individually. Map.Map is invariant in its value
    // type (mutable B-tree), so the old map cannot be assigned directly —
    // rebuild it with Map.map, widening each entry's value to NewSyncStatus.
    let syncStatuses : Map.Map<NeuronId, NewSyncStatus> = old.syncStatuses.map(
      func(id, status) = status,
    );
    {
      var accessControlState = old.accessControlState;
      var neurons = old.neurons;
      var rewards = old.rewards;
      var syncStatuses;
      var syncErrors = Map.empty();
    };
  };
};
