import List "mo:core/List";
import Map "mo:core/Map";

module {
  // OldActor mirrors the NewActor of the preceding migration
  // (20260712_103757.mo): Neuron had no `stakedE8s` field. This migration
  // adds `stakedE8s` to every stored Neuron, initialized to 0. The existing
  // `initialStakeE8s` is preserved unchanged as the manual fallback — it is
  // NOT copied into `stakedE8s` (the sync-sourced value is unknown until the
  // next governance sync populates it from `cached_neuron_stake_e8s`).
  type NeuronId = Nat64;
  type OldNeuron = {
    id : NeuronId;
    name : Text;
    startDate : Int;
    dissolveDelaySeconds : Nat64;
    initialStakeE8s : Nat64;
    ownerId : Principal;
  };
  type NewNeuron = {
    id : NeuronId;
    name : Text;
    startDate : Int;
    dissolveDelaySeconds : Nat64;
    initialStakeE8s : Nat64;
    stakedE8s : Nat64;
    ownerId : Principal;
  };
  type DailyReward = {
    neuronId : NeuronId;
    timestamp : Int;
    unstakedMaturityE8s : Nat64;
    stakedMaturityE8s : Nat64;
    autoStakeMaturity : Bool;
    deltaE8s : Int;
    eventType : { #normalGrowth; #disburseOrSpawn; #firstReading };
  };
  type SyncStatus = { #synced; #hotkeyRequired; #neverSynced; #failed };
  type UserRole = { #admin; #user; #guest };
  type AccessControlState = {
    var adminAssigned : Bool;
    userRoles : Map.Map<Principal, UserRole>;
  };

  type OldActor = {
    var accessControlState : AccessControlState;
    var neurons : Map.Map<NeuronId, OldNeuron>;
    var rewards : Map.Map<NeuronId, List.List<DailyReward>>;
    var syncStatuses : Map.Map<NeuronId, SyncStatus>;
    var syncErrors : Map.Map<NeuronId, Text>;
  };

  type NewActor = {
    var accessControlState : AccessControlState;
    var neurons : Map.Map<NeuronId, NewNeuron>;
    var rewards : Map.Map<NeuronId, List.List<DailyReward>>;
    var syncStatuses : Map.Map<NeuronId, SyncStatus>;
    var syncErrors : Map.Map<NeuronId, Text>;
  };

  // Add `stakedE8s = 0` to every stored Neuron. initialStakeE8s is carried
  // over unchanged as the manual fallback; stakedE8s starts at 0 and is
  // populated by the next doSync from governance's cached_neuron_stake_e8s.
  public func migration(old : OldActor) : NewActor {
    let neurons : Map.Map<NeuronId, NewNeuron> = old.neurons.map(
      func(id, n) = {
        id = n.id;
        name = n.name;
        startDate = n.startDate;
        dissolveDelaySeconds = n.dissolveDelaySeconds;
        initialStakeE8s = n.initialStakeE8s;
        stakedE8s = 0;
        ownerId = n.ownerId;
      },
    );
    {
      var accessControlState = old.accessControlState;
      var neurons;
      var rewards = old.rewards;
      var syncStatuses = old.syncStatuses;
      var syncErrors = old.syncErrors;
    };
  };
};
