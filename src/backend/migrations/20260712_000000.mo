import List "mo:core/List";
import Map "mo:core/Map";

module {
  // First migration in the chain — fresh install. OldActor is empty.
  type OldActor = {};

  // NewActor enumerates every stable field declared in main.mo.
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
  type SyncStatus = { #synced; #hotkeyRequired; #neverSynced };

  // Inlined from caffeineai-authorization AccessControlState — migrations must
  // be self-contained (only mo:core imports allowed), so we cannot import the
  // package here. This mirrors AccessControl.AccessControlState exactly.
  type UserRole = { #admin; #user; #guest };
  type AccessControlState = {
    var adminAssigned : Bool;
    userRoles : Map.Map<Principal, UserRole>;
  };

  type NewActor = {
    var accessControlState : AccessControlState;
    var neurons : Map.Map<NeuronId, Neuron>;
    var rewards : Map.Map<NeuronId, List.List<DailyReward>>;
    var syncStatuses : Map.Map<NeuronId, SyncStatus>;
  };

  public func migration(_old : OldActor) : NewActor {
    {
      var accessControlState = {
        var adminAssigned = false;
        userRoles = Map.empty();
      };
      var neurons = Map.empty();
      var rewards = Map.empty();
      var syncStatuses = Map.empty();
    };
  };
};
