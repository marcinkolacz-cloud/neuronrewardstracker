import List "mo:core/List";
import Map "mo:core/Map";

module {
  // OldActor mirrors the NewActor of the preceding migration
  // (20260712_130000.mo): the canister had a 3-case EventType variant
  // (#normalGrowth, #disburseOrSpawn, #firstReading). This migration widens
  // DailyReward.eventType to a 4-case variant by adding #mergedToStake, which
  // tags Merge Maturity governance events (maturity merged into the neuron's
  // stake) so the stats layer can exclude them from Total Disbursed. Variant
  // widening is data-preserving: every existing snapshot's eventType is already
  // one of the three old tags, all of which remain valid in the new variant, so
  // all fields carry through unchanged.
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
  type OldEventType = { #normalGrowth; #disburseOrSpawn; #firstReading };
  type NewEventType = { #normalGrowth; #disburseOrSpawn; #firstReading; #mergedToStake };
  type OldDailyReward = {
    neuronId : NeuronId;
    timestamp : Int;
    unstakedMaturityE8s : Nat64;
    stakedMaturityE8s : Nat64;
    autoStakeMaturity : Bool;
    deltaE8s : Int;
    eventType : OldEventType;
  };
  type NewDailyReward = {
    neuronId : NeuronId;
    timestamp : Int;
    unstakedMaturityE8s : Nat64;
    stakedMaturityE8s : Nat64;
    autoStakeMaturity : Bool;
    deltaE8s : Int;
    eventType : NewEventType;
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

  type OldActor = {
    var accessControlState : AccessControlState;
    var neurons : Map.Map<NeuronId, Neuron>;
    var rewards : Map.Map<NeuronId, List.List<OldDailyReward>>;
    var syncStatuses : Map.Map<NeuronId, SyncStatus>;
    var syncErrors : Map.Map<NeuronId, Text>;
    var priceCache : Map.Map<Text, CachedPrice>;
  };

  type NewActor = {
    var accessControlState : AccessControlState;
    var neurons : Map.Map<NeuronId, Neuron>;
    var rewards : Map.Map<NeuronId, List.List<NewDailyReward>>;
    var syncStatuses : Map.Map<NeuronId, SyncStatus>;
    var syncErrors : Map.Map<NeuronId, Text>;
    var priceCache : Map.Map<Text, CachedPrice>;
  };

  // Variant widening is data-preserving at the value level: every old
  // eventType tag is still a valid new eventType tag. However, `Map.Map` is
  // invariant in its value type, so we cannot directly assign the old
  // `Map<NeuronId, List<OldDailyReward>>` to the new
  // `Map<NeuronId, List<NewDailyReward>>`. We rebuild the rewards Map by
  // mapping over each neuron's snapshot list and widening each snapshot's
  // eventType from OldEventType to NewEventType (a pure cast — no data
  // changes). All other stable fields are carried over unchanged.
  public func migration(old : OldActor) : NewActor {
    let newRewards = Map.empty<NeuronId, List.List<NewDailyReward>>();
    for ((neuronId, snapshots) in old.rewards.entries()) {
      let widened = List.empty<NewDailyReward>();
      for (r in snapshots.values()) {
        let widenedEventType : NewEventType = r.eventType;
        widened.add({
          neuronId = r.neuronId;
          timestamp = r.timestamp;
          unstakedMaturityE8s = r.unstakedMaturityE8s;
          stakedMaturityE8s = r.stakedMaturityE8s;
          autoStakeMaturity = r.autoStakeMaturity;
          deltaE8s = r.deltaE8s;
          eventType = widenedEventType;
        });
      };
      newRewards.add(neuronId, widened);
    };
    {
      var accessControlState = old.accessControlState;
      var neurons = old.neurons;
      var rewards = newRewards;
      var syncStatuses = old.syncStatuses;
      var syncErrors = old.syncErrors;
      var priceCache = old.priceCache;
    };
  };
};
