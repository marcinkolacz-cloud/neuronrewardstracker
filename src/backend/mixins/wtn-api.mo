import Map "mo:core/Map";
import List "mo:core/List";
import Set "mo:core/Set";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";

import Types "../types/wtn";
import WtnLib "../lib/wtn";
import InvitesLib "../lib/invites";

mixin (
  wtnPositions : Map.Map<Types.WtnPositionId, Types.WtnPosition>,
  wtnSnapshots : Map.Map<Types.WtnPositionId, List.List<Types.WtnSnapshot>>,
  nextWtnPositionId : { var next : Nat },
  grantedPrincipals : Set.Set<Principal>,
) {
  /// Add a WTN position to track. Scoped to the caller's principal via
  /// ownerId. The canister assigns the position id. No governance sync, no
  /// hotkey, no dissolve delay — entirely manual entry.
  public shared ({ caller }) func addWtnPosition(
    name : Text,
    startDate : Int,
  ) : async Types.WtnPosition {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    if (not InvitesLib.isGranted(grantedPrincipals, caller)) {
      Runtime.trap("Access not granted. Please redeem an invite code.");
    };
    WtnLib.createWtnPosition(wtnPositions, nextWtnPositionId, caller, name, startDate);
  };

  /// List all WTN positions owned by the caller.
  public shared ({ caller }) func listMyWtnPositions() : async [Types.WtnPosition] {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    WtnLib.getWtnPositions(wtnPositions, caller);
  };

  /// Look up a WTN position owned by the caller. Returns null if the
  /// position does not exist; traps if it exists but is not owned by the
  /// caller.
  public shared ({ caller }) func getWtnPosition(
    positionId : Types.WtnPositionId,
  ) : async ?Types.WtnPosition {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    WtnLib.getWtnPosition(wtnPositions, caller, positionId);
  };

  /// Update a WTN position owned by the caller. Only `name` and `startDate`
  /// are mutable; `id` and `ownerId` are preserved.
  public shared ({ caller }) func updateWtnPosition(
    position : Types.WtnPosition,
  ) : async () {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    if (not InvitesLib.isGranted(grantedPrincipals, caller)) {
      Runtime.trap("Access not granted. Please redeem an invite code.");
    };
    WtnLib.updateWtnPosition(wtnPositions, caller, position);
  };

  /// Remove a WTN position owned by the caller. Cascades to delete all of
  /// that positionId's snapshots so re-adding starts fresh.
  public shared ({ caller }) func removeWtnPosition(
    positionId : Types.WtnPositionId,
  ) : async () {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    if (not InvitesLib.isGranted(grantedPrincipals, caller)) {
      Runtime.trap("Access not granted. Please redeem an invite code.");
    };
    WtnLib.deleteWtnPosition(wtnPositions, wtnSnapshots, caller, positionId);
  };

  /// Record a manual WTN snapshot for a position. Classifies the event by
  /// comparing the entered nicpHeld to the previous snapshot's nicpHeld
  /// (#capitalAdded / #withdrawal / #organicGrowth). Serves as the only way
  /// to add snapshot data — there is no automatic waterneuron.fi fetching.
  public shared ({ caller }) func recordWtnSnapshot(
    positionId : Types.WtnPositionId,
    date : Int,
    nicpHeld : Float,
    totalIcpPaid : Float,
    redeemableIcpValue : Float,
  ) : async Types.WtnSnapshot {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    if (not InvitesLib.isGranted(grantedPrincipals, caller)) {
      Runtime.trap("Access not granted. Please redeem an invite code.");
    };
    // Verify ownership before recording (traps if not owned / not found).
    switch (WtnLib.getWtnPosition(wtnPositions, caller, positionId)) {
      case (?_position) {
        WtnLib.recordWtnSnapshot(wtnSnapshots, positionId, date, nicpHeld, totalIcpPaid, redeemableIcpValue);
      };
      case null {
        Runtime.trap("WTN position not found");
      };
    };
  };

  /// Return all snapshots for a WTN position, sorted by date ascending.
  public shared ({ caller }) func getWtnSnapshots(
    positionId : Types.WtnPositionId,
  ) : async [Types.WtnSnapshot] {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    // Verify ownership before returning snapshots.
    switch (WtnLib.getWtnPosition(wtnPositions, caller, positionId)) {
      case (?_position) {
        WtnLib.getWtnSnapshots(wtnSnapshots, positionId);
      };
      case null {
        Runtime.trap("WTN position not found");
      };
    };
  };

  /// Edit a single WTN snapshot identified by (positionId, date). After the
  /// edit, the history is re-sorted chronologically and eventTypes are
  /// recomputed for the edited entry and its new previous and next
  /// chronological neighbors. The frontend is responsible for confirming the
  /// edit with the user before calling this endpoint.
  public shared ({ caller }) func editWtnSnapshot(
    positionId : Types.WtnPositionId,
    date : Int,
    newDate : Int,
    newNicpHeld : Float,
    newTotalIcpPaid : Float,
    newRedeemableIcpValue : Float,
  ) : async () {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    if (not InvitesLib.isGranted(grantedPrincipals, caller)) {
      Runtime.trap("Access not granted. Please redeem an invite code.");
    };
    switch (WtnLib.getWtnPosition(wtnPositions, caller, positionId)) {
      case (?_position) {
        WtnLib.editWtnSnapshot(wtnSnapshots, positionId, date, newDate, newNicpHeld, newTotalIcpPaid, newRedeemableIcpValue);
      };
      case null {
        Runtime.trap("WTN position not found");
      };
    };
  };

  /// Delete a single WTN snapshot identified by (positionId, date). After
  /// the delete, eventTypes are recomputed for the next chronological entry.
  /// The frontend is responsible for confirming the destructive delete with
  /// the user before calling this endpoint.
  public shared ({ caller }) func deleteWtnSnapshot(
    positionId : Types.WtnPositionId,
    date : Int,
  ) : async () {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    if (not InvitesLib.isGranted(grantedPrincipals, caller)) {
      Runtime.trap("Access not granted. Please redeem an invite code.");
    };
    switch (WtnLib.getWtnPosition(wtnPositions, caller, positionId)) {
      case (?_position) {
        WtnLib.deleteWtnSnapshot(wtnSnapshots, positionId, date);
      };
      case null {
        Runtime.trap("WTN position not found");
      };
    };
  };

  /// Bulk import historical entries for a WTN position. Computes
  /// classifications the same way as recordWtnSnapshot (comparing each row
  /// to the chronologically-previous one). The frontend parses the
  /// paste-in DD/MM/YYYY dates explicitly and passes them as nanosecond
  /// timestamps.
  public shared ({ caller }) func importWtnHistoricalData(
    positionId : Types.WtnPositionId,
    entries : [Types.WtnHistoricalEntry],
  ) : async () {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    if (not InvitesLib.isGranted(grantedPrincipals, caller)) {
      Runtime.trap("Access not granted. Please redeem an invite code.");
    };
    switch (WtnLib.getWtnPosition(wtnPositions, caller, positionId)) {
      case (?_position) {
        WtnLib.importWtnHistoricalData(wtnSnapshots, positionId, entries);
      };
      case null {
        Runtime.trap("WTN position not found");
      };
    };
  };

  /// Aggregated stats for a single WTN position: total earned, total capital
  /// contributed, total withdrawn, and % return.
  public shared ({ caller }) func getWtnStats(
    positionId : Types.WtnPositionId,
  ) : async Types.WtnStats {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    switch (WtnLib.getWtnPosition(wtnPositions, caller, positionId)) {
      case (?position) {
        let history = WtnLib.getWtnSnapshots(wtnSnapshots, positionId);
        WtnLib.getWtnStats(position, history);
      };
      case null {
        Runtime.trap("WTN position not found");
      };
    };
  };
};
