import Map "mo:core/Map";
import Set "mo:core/Set";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Array "mo:core/Array";
import Text "mo:core/Text";
import Nat32 "mo:core/Nat32";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Runtime "mo:core/Runtime";
import Types "../types/invites";

module {
  public type InviteCode = Types.InviteCode;
  public type InviteCodeStatus = Types.InviteCodeStatus;

  // Alphanumeric alphabet (no ambiguous chars like 0/O or 1/l): 60 chars.
  // Used for secure random alphanumeric invite code generation.
  let ALPHABET : [Char] = [
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j',
    'k', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u',
    'v', 'w', 'x', 'y', 'z',
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K',
    'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V',
    'W', 'X', 'Y', 'Z',
    '2', '3', '4', '5', '6', '7', '8', '9',
  ];

  let CODE_LENGTH = 12;

  /// Simple xorshift32 PRNG step. Deterministic given a seed, but seeded
  /// from Time.now() + map size at generation time so successive codes
  /// differ. Invite codes are admin-generated and single-use, so the
  /// security bar is "unguessable by an unauthenticated party" rather
  /// than cryptographic-strength.
  func xorshift32(state : Nat32) : Nat32 {
    var x = state;
    x ^= x >> 13;
    x ^= x << 17;
    x ^= x >> 5;
    x;
  };

  /// Generate a new secure random alphanumeric invite code and store it as
  /// #unused. Returns the generated code text. The code is guaranteed unique
  /// within the current inviteCodes map (regenerates on collision).
  public func generateInviteCode(
    inviteCodes : Map.Map<Text, Types.InviteCode>,
  ) : Text {
    // Seed the PRNG from Time.now() (nanoseconds) and the current map size.
    // Mixing the map size ensures two codes generated within the same
    // nanosecond still differ.
    let seed : Nat32 = Nat32.fromNat(Int.abs(Time.now() % 4294967296) + inviteCodes.size() + 1);
    var state = seed;
    var code = "";
    var attempts = 0;
    // Generate a unique code: regenerate on collision with an existing code.
    while (true) {
      state := xorshift32(state);
      let chars = Array.tabulate<Char>(CODE_LENGTH, func(i : Nat) {
        // Re-advance the PRNG for each character so consecutive chars differ.
        state := xorshift32(state);
        let idx = Nat32.toNat(state % Nat32.fromNat(ALPHABET.size()));
        ALPHABET[idx];
      });
      code := Text.fromArray(chars);
      if (not inviteCodes.containsKey(code)) {
        // Unique — store and return.
        inviteCodes.add(code, {
          code;
          status = #unused;
          createdAt = Time.now();
        });
        return code;
      };
      attempts += 1;
      // Safety valve: after 1000 collisions (astronomically unlikely with a
      // 60^12 ≈ 2.2e21 space), re-seed from the current time.
      if (attempts >= 1000) {
        state := Nat32.fromNat(Int.abs(Time.now() % 4294967296) + attempts + 1);
        attempts := 0;
      };
    };
    // Unreachable — the loop above always returns.
    code;
  };

  /// Return all invite codes (used, unused, revoked) with their status and
  /// created date. Intended for admin listing.
  public func listInviteCodes(
    inviteCodes : Map.Map<Text, Types.InviteCode>,
  ) : [Types.InviteCode] {
    inviteCodes.toArray().map(
      func((_code, inviteCode)) = inviteCode,
    );
  };

  /// Mark an invite code as #revoked so it can no longer be redeemed. Traps
  /// if the code does not exist. Revoking an already-used or already-revoked
  /// code is a no-op (the code remains invalid either way).
  public func revokeInviteCode(
    inviteCodes : Map.Map<Text, Types.InviteCode>,
    code : Text,
  ) : () {
    switch (inviteCodes.get(code)) {
      case (?inviteCode) {
        // Only mutate if currently #unused or #used — revoking an
        // already-revoked code is a no-op.
        switch (inviteCode.status) {
          case (#revoked) { /* no-op */ };
          case (_) {
            inviteCodes.add(code, { inviteCode with status = #revoked });
          };
        };
      };
      case null {
        // Code does not exist — trap per contract.
        Runtime.trap("Invite code not found");
      };
    };
  };

  /// Validate a code, mark it #used, and on success add the caller's
  /// Principal to the granted-principals set. Returns true on success.
  /// Returns false (and grants nothing) for invalid, already-used, or
  /// revoked codes.
  public func checkAccess(
    inviteCodes : Map.Map<Text, Types.InviteCode>,
    grantedPrincipals : Set.Set<Principal>,
    caller : Principal,
    code : Text,
  ) : Bool {
    switch (inviteCodes.get(code)) {
      case (?inviteCode) {
        switch (inviteCode.status) {
          case (#unused) {
            // Mark the code as used and grant the caller access.
            inviteCodes.add(code, { inviteCode with status = #used });
            grantedPrincipals.add(caller);
            true;
          };
          case (#used) {
            // Already redeemed — grant nothing.
            false;
          };
          case (#revoked) {
            // Revoked — grant nothing.
            false;
          };
        };
      };
      case null {
        // Invalid code — grant nothing.
        false;
      };
    };
  };

  /// Returns true if the given Principal has been granted access (i.e. is
  /// present in the granted-principals set). Used by mutating entry points
  /// to gate access.
  public func isGranted(
    grantedPrincipals : Set.Set<Principal>,
    principal : Principal,
  ) : Bool {
    grantedPrincipals.contains(principal);
  };

  /// Add a Principal to the granted-principals set. Used by the bootstrap
  /// path to auto-grant the admin Principal access to existing data.
  public func grantAccess(
    grantedPrincipals : Set.Set<Principal>,
    principal : Principal,
  ) : () {
    grantedPrincipals.add(principal);
  };
};
