import Common "common";

module {
  public type NeuronId = Common.NeuronId;

  /// Minimal NNS governance canister actor interface for the subset of
  /// methods we use. The governance canister lives at
  /// rrkah-fqaaa-aaaaa-aaaaq-cai.
  public type Governance = actor {
    get_full_neuron : (Nat64) -> async {
      maturity_e8s_equivalent : Nat64;
    };
  };

  /// Per-neuron sync status, queryable from the frontend.
  public type SyncStatus = {
    #synced;            // last governance sync succeeded
    #hotkeyRequired;    // governance refused — hotkey not configured
    #neverSynced;       // no sync has been attempted yet
  };

  /// Result of a single syncNeuron attempt.
  public type SyncResult = {
    neuronId : NeuronId;
    status : SyncStatus;
    maturityE8s : ?Nat64;   // maturity read from governance, if successful
  };
};
