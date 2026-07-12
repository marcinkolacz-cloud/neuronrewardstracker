module {
  /// Neuron identifier as used by the NNS governance canister (Nat64).
  public type NeuronId = Nat64;

  /// Timestamp in nanoseconds since epoch (IC Time.now() convention).
  public type Timestamp = Int;

  /// e8s (10^-8 ICP) — the smallest ICP unit, matching governance maturity.
  public type E8s = Nat64;

  /// Signed delta in e8s — negative deltas indicate disburse/spawn events.
  public type DeltaE8s = Int;
};
