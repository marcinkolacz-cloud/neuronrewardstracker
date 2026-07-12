import List "mo:core/List";
import Map "mo:core/Map";

module {
  // OldActor mirrors the NewActor of the preceding migration
  // (20260712_000100.mo): DailyReward carried a single `maturityE8s` field
  // and HistoricalEntry was not a stored stable type (it only flows through
  // the import endpoint), so only DailyReward's shape matters here.
  type NeuronId = Nat64;
  type Neuron = {
    id : NeuronId;
    name : Text;
    startDate : Int;
    dissolveDelaySeconds : Nat64;
    initialStakeE8s : Nat64;
    ownerId : Principal;
  };
  type OldDailyReward = {
    neuronId : NeuronId;
    timestamp : Int;
    maturityE8s : Nat64;
    deltaE8s : Int;
    eventType : { #normalGrowth; #disburseOrSpawn; #firstReading };
  };
  type NewDailyReward = {
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
    var neurons : Map.Map<NeuronId, Neuron>;
    var rewards : Map.Map<NeuronId, List.List<OldDailyReward>>;
    var syncStatuses : Map.Map<NeuronId, SyncStatus>;
    var syncErrors : Map.Map<NeuronId, Text>;
  };

  type NewActor = {
    var accessControlState : AccessControlState;
    var neurons : Map.Map<NeuronId, Neuron>;
    var rewards : Map.Map<NeuronId, List.List<NewDailyReward>>;
    var syncStatuses : Map.Map<NeuronId, SyncStatus>;
    var syncErrors : Map.Map<NeuronId, Text>;
  };

  // Migrate each stored DailyReward: the old single `maturityE8s` becomes
  // `unstakedMaturityE8s` (the withdrawable bucket), `stakedMaturityE8s`
  // defaults to 0 (pre-auto-stake-split data had no staked component), and
  // `autoStakeMaturity` defaults to false (historical mode unknown). The
  // existing `deltaE8s` and `eventType` are preserved unchanged — they were
  // already computed from the (then single) maturity total, which equals the
  // new combined total for these pre-split snapshots, so no recompute needed.
  public func migration(old : OldActor) : NewActor {
    let rewards : Map.Map<NeuronId, List.List<NewDailyReward>> = old.rewards.map(
      func(id, oldList) = oldList.map(
        func(r) {
          {
            neuronId = r.neuronId;
            timestamp = r.timestamp;
            unstakedMaturityE8s = r.maturityE8s;
            stakedMaturityE8s = 0;
            autoStakeMaturity = false;
            deltaE8s = r.deltaE8s;
            eventType = r.eventType;
          };
        },
      ),
    );
    {
      var accessControlState = old.accessControlState;
      var neurons = old.neurons;
      var rewards;
      var syncStatuses = old.syncStatuses;
      var syncErrors = old.syncErrors;
    };
  };
};
