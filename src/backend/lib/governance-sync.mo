import Map "mo:core/Map";
import Types "../types/governance-sync";
import Common "../types/common";

module {
  public type SyncStatus = Types.SyncStatus;
  public type SyncResult = Types.SyncResult;
  public type NeuronId = Common.NeuronId;

  /// Read the current sync status for a neuron. Returns #neverSynced if
  /// no status has been recorded yet.
  public func getSyncStatus(
    statuses : Map.Map<NeuronId, SyncStatus>,
    neuronId : NeuronId,
  ) : SyncStatus {
    switch (statuses.get(neuronId)) {
      case (?s) s;
      case null #neverSynced;
    };
  };

  /// Persist the sync status for a neuron.
  public func setSyncStatus(
    statuses : Map.Map<NeuronId, SyncStatus>,
    neuronId : NeuronId,
    status : SyncStatus,
  ) : () {
    statuses.add(neuronId, status);
  };
};
