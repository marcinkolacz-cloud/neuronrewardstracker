import Common "common";

module {
  public type NeuronId = Common.NeuronId;

  /// Minimal NNS governance canister actor interface for the subset of
  /// methods we use. The governance canister lives at
  /// rrkah-fqaaa-aaaaa-aaaaq-cai.
  ///
  /// The real governance canister returns a Result variant from
  /// get_full_neuron: { #Ok : Neuron; #Err : GovernanceError }. Declaring
  /// the return type as a bare record causes a candid deserialization
  /// failure on every call (the wire format is a variant, not a record),
  /// which is why syncNeuron silently failed.
  public type Governance = actor {
    get_full_neuron : (Nat64) -> async {
      #Ok : Neuron;
      #Err : GovernanceError;
    };
  };

  /// Subset of the NNS governance Neuron record. Only the fields the sync
  /// logic reads are declared; governance may return additional fields that
  /// candid will silently ignore.
  public type Neuron = {
    maturity_e8s_equivalent : Nat64;
  };

  /// NNS governance error variant returned inside the #Err branch of
  /// get_full_neuron's Result.
  public type GovernanceError = {
    error_type : Int32;
    error_message : Text;
  };

  /// Per-neuron sync status, queryable from the frontend.
  public type SyncStatus = {
    #synced;            // last governance sync succeeded
    #hotkeyRequired;    // governance refused — hotkey not configured
    #neverSynced;       // no sync has been attempted yet
    #failed;            // last governance sync errored — see stored error reason
  };

  /// Result of a single syncNeuron attempt.
  public type SyncResult = {
    neuronId : NeuronId;
    status : SyncStatus;
    maturityE8s : ?Nat64;     // maturity read from governance, if successful
    lastSyncError : ?Text;    // error reason when status is #failed, else null
  };
};
