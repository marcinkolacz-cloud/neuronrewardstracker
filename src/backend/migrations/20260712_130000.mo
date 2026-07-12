import List "mo:core/List";
import Map "mo:core/Map";

module {
  // OldActor mirrors the NewActor of the preceding migration
  // (20260712_120000.mo): the canister had no price cache. This migration
  // introduces the `priceCache` stable Map (keyed by date string) used by the
  // prices domain to cache CoinGecko ICP price fetches, initialized to empty.
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
  // CachedPrice is inlined here (migrations must be self-contained — only
  // mo:core imports allowed). Mirrors PriceTypes.CachedPrice exactly.
  type CachedPrice = {
    usd : Float;
    pln : Float;
    fetchedAtNanos : Int;
  };

  type OldActor = {
    var accessControlState : AccessControlState;
    var neurons : Map.Map<NeuronId, Neuron>;
    var rewards : Map.Map<NeuronId, List.List<DailyReward>>;
    var syncStatuses : Map.Map<NeuronId, SyncStatus>;
    var syncErrors : Map.Map<NeuronId, Text>;
  };

  type NewActor = {
    var accessControlState : AccessControlState;
    var neurons : Map.Map<NeuronId, Neuron>;
    var rewards : Map.Map<NeuronId, List.List<DailyReward>>;
    var syncStatuses : Map.Map<NeuronId, SyncStatus>;
    var syncErrors : Map.Map<NeuronId, Text>;
    var priceCache : Map.Map<Text, CachedPrice>;
  };

  // Introduce the priceCache stable Map, initialized to empty. All existing
  // stable fields are carried over unchanged.
  public func migration(old : OldActor) : NewActor {
    {
      var accessControlState = old.accessControlState;
      var neurons = old.neurons;
      var rewards = old.rewards;
      var syncStatuses = old.syncStatuses;
      var syncErrors = old.syncErrors;
      var priceCache = Map.empty();
    };
  };
};
