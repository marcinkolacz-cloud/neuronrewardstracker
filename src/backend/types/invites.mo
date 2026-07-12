import Common "common";

module {
  public type Timestamp = Common.Timestamp;

  /// Status of an invite code. Single-use: unused until redeemed, used after.
  /// Revoked codes are permanently invalid and can never be redeemed.
  public type InviteCodeStatus = { #unused; #used; #revoked };

  /// A single-use invite code record. Stored keyed by the code text.
  ///
  /// Per the doNotBuild contract, codes carry NO expiry date and NO usage
  /// limit beyond single-use (one redemption grants access once). The
  /// created date is retained for admin listing/display only.
  public type InviteCode = {
    code : Text;              // the secure random alphanumeric string
    status : InviteCodeStatus;
    createdAt : Timestamp;    // creation time in nanoseconds (ns)
  };
};
