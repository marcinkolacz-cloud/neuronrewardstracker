import Common "common";

module {
  public type NeuronId = Common.NeuronId;
  public type Timestamp = Common.Timestamp;
  public type E8s = Common.E8s;

  /// A tracked ICP neuron owned by an authenticated principal.
  public type Neuron = {
    id : NeuronId;                 // NNS neuron ID
    name : Text;                   // user-supplied label
    startDate : Timestamp;         // when the user began tracking (ns)
    dissolveDelaySeconds : Nat64;  // dissolve delay at time of tracking
    initialStakeE8s : E8s;         // manual fallback stake recorded by the user
    stakedE8s : E8s;                // sync-sourced ICP locked in the neuron
    ownerId : Principal;           // authenticated caller who owns this record
  };
};
