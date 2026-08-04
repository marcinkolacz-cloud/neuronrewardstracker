import Map "mo:core/Map";
import Set "mo:core/Set";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Types "../types/invites";
import InvitesLib "../lib/invites";

mixin (
  adminPrincipal : { var value : ?Principal },
  inviteCodes : Map.Map<Text, Types.InviteCode>,
  grantedPrincipals : Set.Set<Principal>,
) {
  /// Internal helper: traps (Runtime.trap) when the caller principal does
  /// not equal the bootstrapped adminPrincipal. Used to gate all admin-only
  /// invite-code management endpoints.
  func _callerIsAdmin(caller : Principal) : () {
    switch (adminPrincipal.value) {
      case (?admin) {
        if (not Principal.equal(caller, admin)) {
          Runtime.trap("Caller is not the admin");
        };
      };
      case null {
        Runtime.trap("Admin not bootstrapped");
      };
    };
  };

  /// One-time bootstrap: sets adminPrincipal to the caller. Callable only
  /// when no admin exists yet (adminPrincipal is null); subsequent calls
  /// trap. On success, also auto-grants the calling admin Principal access
  /// to the granted-principals set so the owner keeps using existing data
  /// without redeeming a code.
  public shared ({ caller }) func setAdminPrincipal() : async () {
    switch (adminPrincipal.value) {
      case (?_) {
        Runtime.trap("Admin already bootstrapped");
      };
      case null {
        adminPrincipal.value := ?caller;
        // Auto-grant the admin self-access so the owner retains access to
        // existing data without redeeming a code.
        InvitesLib.grantAccess(grantedPrincipals, caller);
      };
    };
  };

  /// Admin-only: reassign the admin principal to a new one. Also grants
  /// the new admin access so they don't need an invite code.
  public shared ({ caller }) func reassignAdminPrincipal(newAdmin : Principal) : async () {
    _callerIsAdmin(caller);
    adminPrincipal.value := ?newAdmin;
    InvitesLib.grantAccess(grantedPrincipals, newAdmin);
  };

  /// Query: has an admin been bootstrapped yet? Returns true when
  /// adminPrincipal is non-null. Used by the frontend to decide whether to
  /// show the "Set me as admin" button to the owner.
  public query func isAdminBootstrapped() : async Bool {
    switch (adminPrincipal.value) {
      case (?_) true;
      case null false;
    };
  };

  /// Query: is the current caller the bootstrapped adminPrincipal? Returns
  /// true if and only if adminPrincipal.value is non-null AND the caller
  /// equals it. Uses the SAME adminPrincipal that _callerIsAdmin checks, so
  /// the frontend admin-link/admin-page UX gate matches the backend
  /// admin-only enforcement exactly.
  public query ({ caller }) func isCallerAdminPrincipal() : async Bool {
    switch (adminPrincipal.value) {
      case (?admin) Principal.equal(caller, admin);
      case null false;
    };
  };

  /// Admin-only: generate a new single-use secure random alphanumeric
  /// invite code. Returns the generated code text.
  public shared ({ caller }) func generateInviteCode() : async Text {
    _callerIsAdmin(caller);
    InvitesLib.generateInviteCode(inviteCodes);
  };

  /// Admin-only: return all invite codes with status (used/unused/revoked)
  /// and created date.
  public shared query ({ caller }) func listInviteCodes() : async [Types.InviteCode] {
    _callerIsAdmin(caller);
    InvitesLib.listInviteCodes(inviteCodes);
  };

  /// Admin-only: invalidate a code so it can no longer be redeemed.
  public shared ({ caller }) func revokeInviteCode(code : Text) : async () {
    _callerIsAdmin(caller);
    InvitesLib.revokeInviteCode(inviteCodes, code);
  };

  /// Shared/public: validate a code, mark it used, and on success add the
  /// caller's Principal to the granted-principals set for ongoing access.
  /// Returns false and grants nothing for invalid, already-used, or
  /// revoked codes.
  public shared ({ caller }) func checkAccess(code : Text) : async Bool {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    InvitesLib.checkAccess(inviteCodes, grantedPrincipals, caller, code);
  };

  /// Query: does the current caller have granted access? Used by the
  /// frontend gate screen to decide whether to show the access prompt.
  public query ({ caller }) func isCallerGranted() : async Bool {
    InvitesLib.isGranted(grantedPrincipals, caller);
  };

  /// Query: does the given Principal have granted access? Used by mutating
  /// entry points (in other domains) to gate access. Restricted to
  /// non-anonymous callers to prevent anonymous enumeration of the
  /// granted-access list.
  public query ({ caller }) func isPrincipalGranted(principal : Principal) : async Bool {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous caller not allowed");
    };
    InvitesLib.isGranted(grantedPrincipals, principal);
  };
};
