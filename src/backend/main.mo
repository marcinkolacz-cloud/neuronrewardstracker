import List "mo:core/List";
import Debug "mo:base/Debug";
import Map "mo:core/Map";
import Set "mo:core/Set";
import Principal "mo:core/Principal";
import Timer "mo:core/Timer";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Time "mo:core/Time";

import MixinViews "mo:caffeineai-data-viewer/MixinViews";
import AccessControl "mo:caffeineai-authorization/access-control";
import MixinAuthorization "mo:caffeineai-authorization/MixinAuthorization";
import OQL "mo:caffeineai-oql";
import Expose "mo:caffeineai-oql/Expose";
import HttpOutcall "mo:caffeineai-http-outcalls/outcall";

import Common "types/common";
import NeuronTypes "types/neurons";
import RewardTypes "types/rewards";
import GovernanceSyncTypes "types/governance-sync";
import _StatsTypes "types/stats";
import PriceTypes "types/prices";
import WtnTypes "types/wtn";
import InviteTypes "types/invites";

// OQL row converters — imported top-level so the entity resolver picks them up
// for auto-derived fields whose types are non-primitive (variants).
import _EventTypeValue "types/EventTypeValue";

import NeuronsApi "mixins/neurons-api";
import RewardsApi "mixins/rewards-api";
import GovernanceSyncApi "mixins/governance-sync-api";
import StatsApi "mixins/stats-api";
import PricesApi "mixins/prices-api";
import WtnApi "mixins/wtn-api";
import InvitesApi "mixins/invites-api";

import GovernanceSyncLib "lib/governance-sync";
import InvitesLib "lib/invites";

actor {
  // Existing platform mixins
  include MixinViews();

  let accessControlState : AccessControl.AccessControlState;
  include MixinAuthorization(accessControlState, null);

  // --- Stable state for NeuronRewardsTracker domains ---
  // Neuron records keyed by neuron ID.
  let neurons : Map.Map<Common.NeuronId, NeuronTypes.Neuron>;
  // Reward snapshots keyed by neuron ID; each list is sorted by timestamp.
  let rewards : Map.Map<Common.NeuronId, List.List<RewardTypes.DailyReward>>;
  // Per-neuron governance sync status.
  let syncStatuses : Map.Map<Common.NeuronId, GovernanceSyncTypes.SyncStatus>;
  // Per-neuron last sync error reason (present only when status is #failed).
  let syncErrors : Map.Map<Common.NeuronId, Text>;
  // CoinGecko ICP price cache keyed by date string: "current" for the live
  // price (TTL-bounded, e.g. 10 minutes) and "YYYY-MM-DD" for historical dates
  // (cached indefinitely since historical prices never change).
  let priceCache : Map.Map<Text, PriceTypes.CachedPrice>;

  // --- Stable state for the WTN (WaterNeuron nICP liquid staking) domain ---
  // WTN positions are fully separate from NNS neurons: no governance sync, no
  // hotkey, no dissolve delay, no stakedE8s. Tracked entirely via manually-
  // entered snapshots. Keyed by canister-assigned position id (Nat).
  let wtnPositions : Map.Map<WtnTypes.WtnPositionId, WtnTypes.WtnPosition>;
  // Per-position snapshot lists, keyed by position id. Each list is sorted by
  // date. Each snapshot carries three manually-entered numeric fields
  // (nicpHeld, totalIcpPaid, redeemableIcpValue) plus an eventType
  // classification derived by comparing to the previous snapshot.
  let wtnSnapshots : Map.Map<WtnTypes.WtnPositionId, List.List<WtnTypes.WtnSnapshot>>;
  // Monotonic counter for canister-assigned WTN position ids. Wrapped in a
  // record so the WtnApi mixin (which receives it as a parameter) can mutate
  // it by reference — a bare `var` would be passed by value to the mixin.
  let nextWtnPositionId : { var next : Nat };

  // --- Stable state for the invite-code access control system ---
  // The bootstrapped admin principal. Null until the owner calls
  // setAdminPrincipal (one-time bootstrap). Once set, only this principal
  // can generate/revoke invite codes. Stored as a record with a mutable
  // `value` field so the InvitesApi mixin can mutate it by reference.
  let adminPrincipal : { var value : ?Principal };
  // Single-use invite codes keyed by the code text. Each code carries a
  // status (#unused / #used / #revoked) and a creation timestamp. Per the
  // doNotBuild contract, codes have NO expiry date and NO usage limit beyond
  // single-use.
  let inviteCodes : Map.Map<Text, InviteTypes.InviteCode>;
  // The set of principals granted access (either by redeeming an invite code
  // or by the bootstrap auto-grant). This is the real security boundary: all
  // mutating entry points across every domain gate on membership here.
  let grantedPrincipals : Set.Set<Principal>;

  // --- Domain mixins ---
  include NeuronsApi(neurons, rewards, syncStatuses, syncErrors, grantedPrincipals);
  include RewardsApi(rewards, neurons, grantedPrincipals);
  include GovernanceSyncApi(neurons, rewards, syncStatuses, syncErrors, grantedPrincipals);
  include StatsApi(neurons, rewards, wtnPositions, wtnSnapshots);
  include WtnApi(wtnPositions, wtnSnapshots, nextWtnPositionId, grantedPrincipals);
  include InvitesApi(adminPrincipal, inviteCodes, grantedPrincipals);

  /// IC HTTP outcall transform callback. Required by the IC HTTP outcall
  /// protocol: it must be a public `query` function on the actor and strips
  /// response headers so the response body is the only thing that survives
  /// into consensus. Passed to PricesLib functions and the PricesApi mixin.
  public query func transform(input : HttpOutcall.TransformationInput) : async HttpOutcall.TransformationOutput {
    let response = input.response;
    { response with headers = [] };
  };

  include PricesApi(priceCache, transform, grantedPrincipals);

  // --- OQL: expose stored collections for natural-language queries ---
  // Neurons are per-user data — each signed-in caller reads only their own rows.
  include Expose({
    entities = [
      neurons
        .toEntity("neuron", "Neuron", "id")
        .sample({
          id = 0 : Common.NeuronId;
          name = "";
          startDate = 0 : Int;
          dissolveDelaySeconds = 0 : Nat64;
          initialStakeE8s = 0 : Nat64;
          stakedE8s = 0 : Nat64;
          ownerId = Principal.fromText("aaaaa-aa");
        })
        .ownedBy("ownerId")
        .controllerOrScoped()
        .build(),
      // Reward snapshots are per-user via the owning neuron. The owner lives
      // on the neuron record, not on the snapshot, so we expose rewards as
      // controller-only (the agent answers aggregate questions; per-user
      // scoping is enforced by the API layer).
      //
      // `rewards` is a Map<NeuronId, List<DailyReward>> — a Map whose values
      // are Lists, so `.toEntity` (which auto-derives a row per Map *value*)
      // cannot apply: the value is a List, not a flat record. We use manual
      // mode and flatten every neuron's snapshot list into individual rows.
      OQL.Entity.manual<RewardTypes.DailyReward>(
        "dailyReward",
        func() = rewards.entries().flatMap(
          func((_id, snapshots)) = snapshots.values(),
        ),
        "DailyReward",
        "neuronId",
      )
        .payload("neuronId", func(r) = r.neuronId)
        .edge("neuronId", "neuron")
        .payload("timestamp", func(r) = r.timestamp)
        .payload("unstakedMaturityE8s", func(r) = r.unstakedMaturityE8s)
        .payload("stakedMaturityE8s", func(r) = r.stakedMaturityE8s)
        .payload("autoStakeMaturity", func(r) = r.autoStakeMaturity)
        .payload("deltaE8s", func(r) = r.deltaE8s)
        .payload("stakeDeltaE8s", func(r) = r.stakeDeltaE8s)
        .payload(
          "eventType",
          func(r) = switch (r.eventType) {
            case (#normalGrowth) "normalGrowth";
            case (#disburseOrSpawn) "disburseOrSpawn";
            case (#firstReading) "firstReading";
            case (#mergedToStake) "mergedToStake";
            case (#externalTopUp) "externalTopUp";
          },
        )
        .controllerOnly()
        .build(),
      // Per-neuron governance sync status. The primary key (neuronId) lives in
      // the Map key and the value is a variant, so we use manual mode over
      // .entries(): promote the key as a column + edge to the neuron entity,
      // and collapse the SyncStatus variant to a stable text sentinel. Same
      // controller-only authorization as rewards — per-user access is enforced
      // by the API layer (getSyncStatus checks ownership).
      OQL.Entity.manual<(Common.NeuronId, GovernanceSyncTypes.SyncStatus)>(
        "syncStatus",
        func() = syncStatuses.entries(),
        "SyncStatus",
        "neuronId",
      )
        .payload("neuronId", func((id, _)) = id)
        .edge("neuronId", "neuron")
        .payload(
          "status",
          func((_, s)) = switch (s) {
            case (#synced) "synced";
            case (#hotkeyRequired) "hotkeyRequired";
            case (#neverSynced) "neverSynced";
            case (#failed) "failed";
          },
        )
        .controllerOnly()
        .build(),
      // Per-neuron last sync error reason. The primary key (neuronId) lives in
      // the Map key, so manual mode over .entries(): promote the key as a
      // column + edge to the neuron entity, and expose the reason text.
      // Controller-only — per-user access is enforced by the API layer
      // (getSyncError checks ownership).
      OQL.Entity.manual<(Common.NeuronId, Text)>(
        "syncError",
        func() = syncErrors.entries(),
        "SyncError",
        "neuronId",
      )
        .payload("neuronId", func((id, _)) = id)
        .edge("neuronId", "neuron")
        .payload("reason", func((_, reason)) = reason)
        .controllerOnly()
        .build(),
      // CoinGecko ICP price cache. The primary key (date string: "current" or
      // "YYYY-MM-DD") lives in the Map key, so manual mode over .entries():
      // promote the key as a column and expose the cached USD/PLN values and
      // the fetch timestamp. Controller-only — prices are not per-user data,
      // but the cache is a shared backend resource.
      OQL.Entity.manual<(Text, PriceTypes.CachedPrice)>(
        "priceCache",
        func() = priceCache.entries(),
        "CachedPrice",
        "dateKey",
      )
        .payload("dateKey", func((key, _)) = key)
        .payload("usd", func((_, p)) = p.usd)
        .payload("pln", func((_, p)) = p.pln)
        .payload("fetchedAtNanos", func((_, p)) = p.fetchedAtNanos)
        .controllerOnly()
        .build(),
      // WTN (WaterNeuron nICP liquid staking) positions. Per-user data — each
      // signed-in caller reads only their own rows, scoped via ownerId.
      wtnPositions
        .toEntity("wtnPosition", "WtnPosition", "id")
        .sample({
          id = 0 : WtnTypes.WtnPositionId;
          name = "";
          ownerId = Principal.fromText("aaaaa-aa");
          startDate = 0 : Int;
        })
        .ownedBy("ownerId")
        .controllerOrScoped()
        .build(),
      // WTN snapshots are per-user via the owning position. The owner lives
      // on the position record, not on the snapshot, so we expose snapshots as
      // controller-only (per-user scoping is enforced by the API layer).
      // `wtnSnapshots` is a Map<PositionId, List<WtnSnapshot>> — a Map whose
      // values are Lists, so `.toEntity` cannot apply. We use manual mode and
      // flatten every position's snapshot list into individual rows.
      OQL.Entity.manual<WtnTypes.WtnSnapshot>(
        "wtnSnapshot",
        func() = wtnSnapshots.entries().flatMap(
          func((_id, snapshots)) = snapshots.values(),
        ),
        "WtnSnapshot",
        "positionId",
      )
        .payload("positionId", func(s) = s.positionId)
        .edge("positionId", "wtnPosition")
        .payload("date", func(s) = s.date)
        .payload("nicpHeld", func(s) = s.nicpHeld)
        .payload("totalIcpPaid", func(s) = s.totalIcpPaid)
        .payload("redeemableIcpValue", func(s) = s.redeemableIcpValue)
        .payload(
          "eventType",
          func(s) = switch (s.eventType) {
            case (#firstReading) "firstReading";
            case (#capitalAdded) "capitalAdded";
            case (#withdrawal) "withdrawal";
            case (#organicGrowth) "organicGrowth";
          },
        )
        .controllerOnly()
        .build(),
    ];
  });

  // --- Daily timer: sync all neurons in the canister regardless of owner ---
  // Targets 18:01 Europe/Warsaw (CET UTC+1 in winter, CEST UTC+2 in summer,
  // DST-aware via the EU rule: last Sunday of March → last Sunday of October).
  // The IC runs on UTC, so we compute the UTC equivalent of 18:01 Warsaw.
  //
  // We use a NON-recurring Timer.setTimer and reschedule after each firing by
  // RECOMPUTING the next 18:01 Warsaw from the current time. We do NOT just
  // add 86400 seconds — DST transitions change the UTC offset, so a fixed
  // 24h loop would drift by one hour across each DST boundary. Recomputing
  // from the current time keeps the target pinned to 18:01 Warsaw year-round.
  //
  // Timers are not persisted across upgrades, so we install the first timer
  // from a transient initializer that runs on every (re)start. The loop
  // delegates to GovernanceSyncLib.doSync so it shares the same error handling
  // as the public endpoints: each neuron that fails is recorded as #failed
  // with its real error reason, and the loop continues to the next neuron
  // (doSync never traps — it catches and returns a SyncResult).
  //
  // `governance` is provided by the GovernanceSyncApi mixin (included above)
  // as a transient binding; we reuse it here rather than redeclaring the
  // canister id + actor handle, which would collide with the mixin's names.

  /// Compute the UTC offset (in seconds) for Europe/Warsaw at a given UTC
  /// instant: +3600 (CET, UTC+1) in winter, +7200 (CEST, UTC+2) in summer.
  /// EU DST rule: DST starts on the last Sunday of March and ends on the last
  /// Sunday of October, with the switch at 01:00 UTC.
  func warsawUtcOffsetSeconds(utcSeconds : Int) : Int {
    // Days since Unix epoch (1970-01-01 was a Thursday).
    let days = utcSeconds / 86_400;
    let (year, _month, _day, _weekday) = daysToYearMonthWeekday(days);

    // Last Sunday of March (month 3) and October (month 10) for the year.
    let dstStartDay = lastSundayOfMonth(year, 3);
    let dstEndDay = lastSundayOfMonth(year, 10);

    // Day-of-year for the DST start/end Sundays (1-based).
    let dstStartDoy = dayOfYear(year, 3, dstStartDay);
    let dstEndDoy = dayOfYear(year, 10, dstEndDay);

    // Current day-of-year (1-based).
    let currentDoy = dayOfYearFromDays(days, year);

    // DST is active (CEST, +7200) if current day is strictly after the March
    // last Sunday and strictly before the October last Sunday. The switch
    // happens at 01:00 UTC: on the start Sunday, CEST begins at 01:00 UTC
    // (so before that instant it's still CET); on the end Sunday, CET begins
    // at 01:00 UTC (so before that instant it's still CEST). We approximate
    // by checking the day-of-year and the UTC hour to handle the 01:00 switch.
    let onDstStartDay = currentDoy == dstStartDoy;
    let onDstEndDay = currentDoy == dstEndDoy;
    let utcHour = (utcSeconds % 86_400) / 3_600;

    let isDst : Bool = if (onDstStartDay) {
      // CEST starts at 01:00 UTC on the last Sunday of March.
      utcHour >= 1;
    } else if (onDstEndDay) {
      // CEST ends at 01:00 UTC on the last Sunday of October (back to CET).
      utcHour < 1;
    } else if (currentDoy > dstStartDoy and currentDoy < dstEndDoy) {
      true;
    } else {
      false;
    };

    if (isDst) { 7_200 } else { 3_600 };
  };

  /// Compute seconds until the next 18:01 Europe/Warsaw from the given UTC
  /// instant (in nanoseconds). Returns a non-negative number of seconds.
  func secondsUntilNextSync(nowNs : Int) : Nat {
    let nowSeconds = nowNs / 1_000_000_000;
    let offset = warsawUtcOffsetSeconds(nowSeconds);
    // 18:01 in seconds from midnight.
    let targetLocalSecondsOfDay = 18 * 3_600 + 60;
    // Current local seconds-of-day (UTC seconds-of-day + offset, mod 86400).
    let utcSecondsOfDay = nowSeconds % 86_400;
    var localSecondsOfDay = utcSecondsOfDay + offset;
    if (localSecondsOfDay < 0) { localSecondsOfDay += 86_400 };
    if (localSecondsOfDay >= 86_400) { localSecondsOfDay -= 86_400 };

    var diff = targetLocalSecondsOfDay - localSecondsOfDay;
    if (diff <= 0) { diff += 86_400 };
    Int.abs(diff);
  };

  /// Convert days since Unix epoch to (year, month, day, weekday).
  /// weekday: 0 = Sunday, 1 = Monday, ..., 6 = Saturday. 1970-01-01 was a
  /// Thursday (weekday 4).
  func daysToYearMonthWeekday(days : Int) : (Nat, Nat, Nat, Nat) {
    // Howard Hinnant civil-from-days algorithm.
    let z = days + 719468;
    let era = (if (z >= 0) z else z - 146096) / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if (mp < 10) mp + 3 else mp - 9;
    let year = if (m <= 2) y + 1 else y;
    // Weekday: 1970-01-01 = Thursday = 4. days mod 7 gives offset.
    let wd = Int.abs(days % 7);
    let weekday = (wd + 4) % 7; // 0 = Sunday
    (Int.abs(year), Int.abs(m), Int.abs(d), weekday);
  };

  /// Day-of-year (1-based) for a given (year, month, day).
  func dayOfYear(year : Nat, month : Nat, day : Nat) : Nat {
    // Cumulative days at the start of each month (non-leap).
    let cumDays = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    var doy = cumDays[month - 1] + day;
    if (month > 2 and isLeapYear(year)) { doy += 1 };
    doy;
  };

  /// Day-of-year (1-based) for the current day, derived from days-since-epoch
  /// and the year (to account for leap years).
  func dayOfYearFromDays(days : Int, year : Nat) : Nat {
    // Days from 1970-01-01 to Jan 1 of `year`.
    var epochDay = 0;
    // Count leap years and ordinary years from 1970 to year-1.
    var y = 1970;
    while (y < year) {
      epochDay += if (isLeapYear(y)) 366 else 365;
      y += 1;
    };
    Int.abs(days - epochDay) + 1;
  };

  /// Is `year` a leap year (Gregorian)?
  func isLeapYear(year : Nat) : Bool {
    (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0);
  };

  /// Day-of-month (1..31) of the last Sunday in `month` of `year`.
  func lastSundayOfMonth(year : Nat, month : Nat) : Nat {
    // Days in the given month.
    let daysInMonth = switch (month) {
      case 1 31;
      case 2 if (isLeapYear(year)) 29 else 28;
      case 3 31;
      case 4 30;
      case 5 31;
      case 6 30;
      case 7 31;
      case 8 31;
      case 9 30;
      case 10 31;
      case 11 30;
      case 12 31;
      case _ 30;
    };
    // Find the weekday of the last day of the month. We need the weekday of
    // (year, month, daysInMonth). Compute via day-of-year + Jan 1 weekday.
    let lastDoy = dayOfYear(year, month, daysInMonth);
    // Weekday of Jan 1 of `year`: compute days from 1970-01-01 (Thursday=4).
    var jan1Days = 0;
    var y = 1970;
    while (y < year) {
      jan1Days += if (isLeapYear(y)) 366 else 365;
      y += 1;
    };
    // Use Int arithmetic to avoid Nat underflow/trap on the `% 7` and `-`
    // operations when intermediate values could be zero or negative.
    let jan1WdInt : Int = (Int.abs(jan1Days % 7) + 4) % 7; // 0 = Sunday
    let lastWdInt : Int = (jan1WdInt + lastDoy.toInt() - 1) % 7; // 0 = Sunday
    let lastWd : Nat = Int.abs(lastWdInt);
    // Last Sunday = last day - (lastWd - 0) where Sunday = 0. Guard against
    // underflow: lastWd is in [0, 6] and daysInMonth >= 28, so this never
    // underflows in practice, but guard defensively.
    let lastSunday : Nat = if (daysInMonth >= lastWd) { daysInMonth - lastWd } else { 1 };
    lastSunday;
  };

  /// Schedule the next daily sync at 18:01 Europe/Warsaw. Recomputes the
  /// target on every call so DST transitions do not cause drift. After the
  /// sync runs, reschedules for the following 18:01 Warsaw.
  ///
  /// `Timer.setTimer<system>` requires the `<system>` capability, which is
  /// available in `shared` functions and async callbacks but NOT in a plain
  /// actor `func` or a transient-let initializer. This function is therefore
  /// only ever called from two system-capable contexts: (1) the
  /// `public shared func startDailySync()` below, and (2) the async timer
  /// callback passed to `Timer.setTimer` (which itself has the system
  /// capability, so rescheduling works). It must NOT be called from a plain
  /// transient let or a non-shared private func.

  // ===== TEMPORARY DIAGNOSTIC: log every incoming call =====
  // Logs caller + method name for every ingress call (query and update), to
  // find the source of unexpected cycle drain. Remove after diagnosis.
  system func inspect(
    {
      arg : Blob;
      caller : Principal;
      msg : {
        #_initialize_access_control : () -> ();
        #_internet_identity_sign_in_finish : () -> ();
        #_internet_identity_sign_in_start : () -> ();
        #addNeuron : () -> (id : NeuronTypes.NeuronId, name : Text, startDate : Int, dissolveDelaySeconds : Nat64, initialStakeE8s : Nat64);
        #addWtnPosition : () -> (name : Text, startDate : Int);
        #assignCallerUserRole : () -> (user : Principal, role : AccessControl.UserRole);
        #checkAccess : () -> (code : Text);
        #deleteSnapshot : () -> (neuronId : Common.NeuronId, timestamp : Int);
        #deleteWtnSnapshot : () -> (positionId : WtnTypes.WtnPositionId, date : Int);
        #editSnapshot : () -> (neuronId : Common.NeuronId, timestamp : Int, newTimestamp : Int, newMaturityE8s : Nat64);
        #editWtnSnapshot : () -> (positionId : WtnTypes.WtnPositionId, date : Int, newDate : Int, newNicpHeld : Float, newTotalIcpPaid : Float, newRedeemableIcpValue : Float);
        #execute : () -> (qJson : Text);
        #generateInviteCode : () -> ();
        #getCallerUserRole : () -> ();
        #getCurrentIcpPrice : () -> ();
        #getHistoricalIcpPrice : () -> (date : Text);
        #getNeuronStats : () -> (neuronId : Common.NeuronId);
        #getPortfolioRewardStats : () -> ();
        #getPortfolioStats : () -> ();
        #getRewardHistory : () -> (neuronId : Common.NeuronId);
        #getSyncError : () -> (neuronId : Common.NeuronId);
        #getSyncStatus : () -> (neuronId : Common.NeuronId);
        #getWtnPosition : () -> (positionId : WtnTypes.WtnPositionId);
        #getWtnSnapshots : () -> (positionId : WtnTypes.WtnPositionId);
        #getWtnStats : () -> (positionId : WtnTypes.WtnPositionId);
        #importHistoricalData : () -> (neuronId : Common.NeuronId, entries : [RewardTypes.HistoricalEntry]);
        #importWtnHistoricalData : () -> (positionId : WtnTypes.WtnPositionId, entries : [WtnTypes.WtnHistoricalEntry]);
        #isAdminBootstrapped : () -> ();
        #isCallerAdmin : () -> ();
        #isCallerAdminPrincipal : () -> ();
        #isCallerGranted : () -> ();
        #isPrincipalGranted : () -> (principal : Principal);
        #listInviteCodes : () -> ();
        #listMyNeurons : () -> ();
        #listMyWtnPositions : () -> ();
        #reassignAdminPrincipal : () -> (newAdmin : Principal);
        #recordSnapshot : () -> (neuronId : Common.NeuronId, unstakedMaturityE8s : Nat64, stakedMaturityE8s : Nat64, autoStakeMaturity : Bool, timestamp : Int);
        #recordWtnSnapshot : () -> (positionId : WtnTypes.WtnPositionId, date : Int, nicpHeld : Float, totalIcpPaid : Float, redeemableIcpValue : Float);
        #removeNeuron : () -> (neuronId : NeuronTypes.NeuronId);
        #removeWtnPosition : () -> (positionId : WtnTypes.WtnPositionId);
        #revokeInviteCode : () -> (code : Text);
        #scheduleNextSync : () -> ();
        #schema : () -> ();
        #setAdminPrincipal : () -> ();
        #startDailySync : () -> ();
        #stopDailySync : () -> ();
        #syncAllMyNeurons : () -> ();
        #syncNeuron : () -> (neuronId : Common.NeuronId);
        #transform : () -> (input : HttpOutcall.TransformationInput);
        #updateNeuron : () -> (neuron : NeuronTypes.Neuron);
        #updateWtnPosition : () -> (position : WtnTypes.WtnPosition);
      };
    }
  ) : Bool {
    let name = switch (msg) {
      case (#_initialize_access_control _) "_initialize_access_control";
      case (#_internet_identity_sign_in_finish _) "_internet_identity_sign_in_finish";
      case (#_internet_identity_sign_in_start _) "_internet_identity_sign_in_start";
      case (#addNeuron _) "addNeuron";
      case (#addWtnPosition _) "addWtnPosition";
      case (#assignCallerUserRole _) "assignCallerUserRole";
      case (#checkAccess _) "checkAccess";
      case (#deleteSnapshot _) "deleteSnapshot";
      case (#deleteWtnSnapshot _) "deleteWtnSnapshot";
      case (#editSnapshot _) "editSnapshot";
      case (#editWtnSnapshot _) "editWtnSnapshot";
      case (#execute _) "execute";
      case (#generateInviteCode _) "generateInviteCode";
      case (#getCallerUserRole _) "getCallerUserRole";
      case (#getCurrentIcpPrice _) "getCurrentIcpPrice";
      case (#getHistoricalIcpPrice _) "getHistoricalIcpPrice";
      case (#getNeuronStats _) "getNeuronStats";
      case (#getPortfolioRewardStats _) "getPortfolioRewardStats";
      case (#getPortfolioStats _) "getPortfolioStats";
      case (#getRewardHistory _) "getRewardHistory";
      case (#getSyncError _) "getSyncError";
      case (#getSyncStatus _) "getSyncStatus";
      case (#getWtnPosition _) "getWtnPosition";
      case (#getWtnSnapshots _) "getWtnSnapshots";
      case (#getWtnStats _) "getWtnStats";
      case (#importHistoricalData _) "importHistoricalData";
      case (#importWtnHistoricalData _) "importWtnHistoricalData";
      case (#isAdminBootstrapped _) "isAdminBootstrapped";
      case (#isCallerAdmin _) "isCallerAdmin";
      case (#isCallerAdminPrincipal _) "isCallerAdminPrincipal";
      case (#isCallerGranted _) "isCallerGranted";
      case (#isPrincipalGranted _) "isPrincipalGranted";
      case (#listInviteCodes _) "listInviteCodes";
      case (#listMyNeurons _) "listMyNeurons";
      case (#listMyWtnPositions _) "listMyWtnPositions";
      case (#reassignAdminPrincipal _) "reassignAdminPrincipal";
      case (#recordSnapshot _) "recordSnapshot";
      case (#recordWtnSnapshot _) "recordWtnSnapshot";
      case (#removeNeuron _) "removeNeuron";
      case (#removeWtnPosition _) "removeWtnPosition";
      case (#revokeInviteCode _) "revokeInviteCode";
      case (#scheduleNextSync _) "scheduleNextSync";
      case (#schema _) "schema";
      case (#setAdminPrincipal _) "setAdminPrincipal";
      case (#startDailySync _) "startDailySync";
      case (#stopDailySync _) "stopDailySync";
      case (#syncAllMyNeurons _) "syncAllMyNeurons";
      case (#syncNeuron _) "syncNeuron";
      case (#transform _) "transform";
      case (#updateNeuron _) "updateNeuron";
      case (#updateWtnPosition _) "updateWtnPosition";
    };
    Debug.print("INSPECT caller=" # debug_show(caller) # " method=" # name # " argBytes=" # debug_show(arg.size()));
    true;
  };

  public shared func scheduleNextSync() : async Timer.TimerId {
    let delaySeconds = secondsUntilNextSync(Time.now());
    Timer.setTimer<system>(
      #seconds delaySeconds,
      func() : async () {
        // Daily auto-sync permanently disabled per user request (2026-08-04).
        // Unconditional return regardless of _dailySyncInstalled's stored
        // value, so this is effective immediately on deploy without needing
        // any follow-up call. Manual "Sync now" / "Refresh All" and manual
        // snapshot entry remain the only ways to update neuron data.
        return;
        for ((neuronId, neuron) in neurons.entries()) {
          ignore await GovernanceSyncLib.doSync(
            governance,
            rewards,
            neurons,
            syncStatuses,
            syncErrors,
            neuron.ownerId,
            neuronId,
          );
        };
        // Reschedule for the next 18:01 Warsaw by recomputing from now.
        // Do NOT add a fixed 86400 — DST transitions change the UTC offset.
        // The async callback has the system capability, so this call is valid.
        ignore scheduleNextSync();
      },
    );
  };

  // Stable flag recording whether the daily sync timer has been installed.
  // This MUST be stable (not transient) so it persists across canister
  // restarts/upgrades: a transient flag resets to `false` on every restart,
  // which would let a subsequent `startDailySync()` call install a SECOND
  // timer alongside the one the reschedule loop already re-armed — causing
  // the daily sync to fire multiple times per day. As a stable Bool, the
  // "timer installed" guard survives restarts and `startDailySync()` stays
  // idempotent across the canister's lifetime. The initial value (`false`)
  // is supplied by the migration chain, not by an inline initializer.
  var _dailySyncInstalled : Bool;

  /// Install the daily sync timer on first call. Public shared functions run
  /// in an async context that has the `<system>` capability, so
  /// `scheduleNextSync()` (which calls `Timer.setTimer<system>`) is valid
  /// here. Idempotent: subsequent calls are no-ops once the timer is running
  /// (the timer reschedules itself from its own async callback, which also
  /// has the system capability).
  public shared func startDailySync() : async () {
    if (_dailySyncInstalled) { return };
    _dailySyncInstalled := true;
    ignore await scheduleNextSync();
  };

  /// Admin-only: stop the daily auto-sync. The next scheduled timer firing
  /// will see _dailySyncInstalled = false and exit immediately without
  /// doing any governance sync work and without rescheduling itself, which
  /// permanently ends the loop (nothing re-arms it). Call startDailySync()
  /// again later to re-enable automatic daily syncing.
  public shared func stopDailySync() : async () {
    _dailySyncInstalled := false;
  };
};
