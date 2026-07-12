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
  ///
  /// `maturity_e8s_equivalent` is the unstaked (withdrawable) maturity and is
  /// always present (non-optional). `staked_maturity_e8s_equivalent` and
  /// `auto_stake_maturity` are optional because NNS governance omits them for
  /// neurons that never had auto-stake configured. We read all three on every
  /// sync regardless of mode so a neuron that switches auto-stake on/off over
  /// time keeps a continuous combined-maturity history.
  public type Neuron = {
    maturity_e8s_equivalent : Nat64;
    staked_maturity_e8s_equivalent : ?Nat64;
    auto_stake_maturity : ?Bool;
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
  ///
  /// `maturityE8s` carries the COMBINED maturity total (unstaked + staked)
  /// when the sync succeeded, so callers and the frontend still get a single
  /// "maturity" figure. The per-field breakdown lives on the recorded
  /// DailyReward snapshot.
  public type SyncResult = {
    neuronId : NeuronId;
    status : SyncStatus;
    maturityE8s : ?Nat64;     // combined (unstaked + staked) maturity, if successful
    lastSyncError : ?Text;    // error reason when status is #failed, else null
  };
};
