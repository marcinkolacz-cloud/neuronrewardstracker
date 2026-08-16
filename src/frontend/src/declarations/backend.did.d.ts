import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface Cell { 'value' : Value, 'name' : string }
export interface DailyReward {
  'stakedMaturityE8s' : E8s,
  'unstakedMaturityE8s' : E8s,
  'stakeDeltaE8s' : E8s,
  'autoStakeMaturity' : boolean,
  'timestamp' : Timestamp,
  'neuronId' : NeuronId,
  'deltaE8s' : DeltaE8s,
  'eventType' : EventType,
}
export type DeltaE8s = bigint;
export type E8s = bigint;
export type Error = { 'FrontendOriginsNotConfigured' : null } |
  {
    'MixedSsoSources' : {
      'otherKeys' : Array<string>,
      'ssoKeys' : Array<string>,
    }
  } |
  { 'Stale' : { 'ageNs' : bigint } } |
  { 'MalformedCandid' : null } |
  { 'AmbiguousAttribute' : { 'field' : string, 'sources' : Array<string> } } |
  { 'NoAttributes' : null } |
  { 'UnknownNonce' : null } |
  { 'UntrustedSsoSource' : { 'domain' : string } } |
  { 'MissingField' : string } |
  { 'FrontendOriginMismatch' : { 'got' : string, 'expected' : Array<string> } };
export type EventType = { 'mergedToStake' : null } |
  { 'normalGrowth' : null } |
  { 'firstReading' : null } |
  { 'externalTopUp' : null } |
  { 'disburseOrSpawn' : null };
export interface HistoricalEntry {
  'stakedMaturityE8s' : E8s,
  'unstakedMaturityE8s' : E8s,
  'timestamp' : Timestamp,
}
export interface HttpHeader { 'value' : string, 'name' : string }
export interface HttpRequestResult {
  'status' : bigint,
  'body' : Uint8Array | number[],
  'headers' : Array<HttpHeader>,
}
export interface InviteCode {
  'status' : InviteCodeStatus,
  'code' : string,
  'createdAt' : Timestamp,
}
export type InviteCodeStatus = { 'revoked' : null } |
  { 'used' : null } |
  { 'unused' : null };
export interface MonthlyBreakdown {
  'month' : bigint,
  'totalDeltaE8s' : bigint,
  'year' : bigint,
  'readingCount' : bigint,
  'momDeltaE8s' : bigint,
}
export interface Neuron {
  'id' : NeuronId,
  'dissolveDelaySeconds' : bigint,
  'ownerId' : Principal,
  'name' : string,
  'stakedE8s' : E8s,
  'initialStakeE8s' : E8s,
  'startDate' : Timestamp,
}
export type NeuronId = bigint;
export interface NeuronStats {
  'averageDailyRewardE8s' : bigint,
  'totalRewardsE8s' : bigint,
  'totalCapitalContributedE8s' : E8s,
  'currentMaturityE8s' : bigint,
  'apy30d' : number,
  'percentageReturn' : number,
  'neuronId' : NeuronId,
  'monthly' : Array<MonthlyBreakdown>,
  'totalDisbursedE8s' : bigint,
  'overallReturnPct' : number,
}
export interface PortfolioRewardStats {
  'monthlyReadings' : bigint,
  'averageDailyRewardE8s' : bigint,
  'totalRewardsE8s' : bigint,
  'totalCapitalContributedE8s' : E8s,
  'apy30d' : number,
  'monthly' : Array<MonthlyBreakdown>,
  'overallReturnPct' : number,
}
export interface PortfolioStats {
  'wtnRewardsThisMonthFloat' : number,
  'totalPortfolioValueE8s' : bigint,
  'totalMaturityE8s' : bigint,
  'wtnRewardsE8s' : bigint,
  'nnsStakedE8s' : E8s,
  'totalRewardsThisMonthE8s' : bigint,
  'wtnCapitalContributedE8s' : E8s,
  'totalRewardsE8s' : bigint,
  'combinedRewardsThisMonthE8s' : bigint,
  'blendedApy' : number,
  'totalStakedE8s' : E8s,
  'nnsRewardsThisMonthE8s' : bigint,
  'totalCapitalContributedE8s' : E8s,
  'percentageReturn' : number,
  'nnsCapitalContributedE8s' : E8s,
  'nnsRewardsE8s' : bigint,
  'wtnStakedE8s' : E8s,
  'totalDisbursedE8s' : bigint,
  'neuronCount' : bigint,
}
export interface PriceSnapshot {
  'pln' : number,
  'usd' : number,
  'timestamp' : bigint,
  'cached' : boolean,
  'unavailable' : boolean,
}
export interface Result { 'hasMore' : boolean, 'rows' : Array<Array<Cell>> }
export type Result__1 = { 'ok' : null } |
  { 'err' : Error };
export interface SyncResult {
  'status' : SyncStatus,
  'maturityE8s' : [] | [bigint],
  'lastSyncError' : [] | [string],
  'stakedE8s' : [] | [bigint],
  'neuronId' : NeuronId,
}
export type SyncStatus = { 'hotkeyRequired' : null } |
  { 'neverSynced' : null } |
  { 'failed' : null } |
  { 'synced' : null };
export type TimerId = bigint;
export type Timestamp = bigint;
export interface TransformationInput {
  'context' : Uint8Array | number[],
  'response' : HttpRequestResult,
}
export interface TransformationOutput {
  'status' : bigint,
  'body' : Uint8Array | number[],
  'headers' : Array<HttpHeader>,
}
export type UserRole = { 'admin' : null } |
  { 'user' : null } |
  { 'guest' : null };
export type Value = { 'int' : bigint } |
  { 'nat' : bigint } |
  { 'float' : number } |
  { 'bool' : boolean } |
  { 'null' : null } |
  { 'text' : string };
export type WtnEventType = { 'firstReading' : null } |
  { 'capitalAdded' : null } |
  { 'withdrawal' : null } |
  { 'organicGrowth' : null };
export interface WtnHistoricalEntry {
  'date' : Timestamp,
  'redeemableIcpValue' : number,
  'nicpHeld' : number,
  'totalIcpPaid' : number,
}
export interface WtnPosition {
  'id' : WtnPositionId,
  'ownerId' : Principal,
  'name' : string,
  'startDate' : Timestamp,
}
export type WtnPositionId = bigint;
export interface WtnSnapshot {
  'date' : Timestamp,
  'positionId' : WtnPositionId,
  'redeemableIcpValue' : number,
  'nicpHeld' : number,
  'eventType' : WtnEventType,
  'totalIcpPaid' : number,
}
export interface WtnStats {
  'percentReturn' : number,
  'totalCapitalContributed' : number,
  'totalEarned' : number,
  'positionId' : WtnPositionId,
  'redeemableIcpValue' : number,
  'totalWithdrawn' : number,
}
export interface _SERVICE {
  '___dailySyncInstalled' : ActorMethod<[], boolean>,
  '__accessControlState' : ActorMethod<[], any>,
  '__adminPrincipal' : ActorMethod<[], any>,
  '__grantedPrincipals' : ActorMethod<
    [[] | [Principal], [] | [bigint]],
    Array<Principal>
  >,
  '__inviteCodes' : ActorMethod<[], any>,
  '__neurons' : ActorMethod<[], any>,
  '__nextWtnPositionId' : ActorMethod<[], any>,
  '__priceCache' : ActorMethod<[], any>,
  '__rewards' : ActorMethod<[], any>,
  '__syncErrors' : ActorMethod<[], any>,
  '__syncStatuses' : ActorMethod<[], any>,
  '__wtnPositions' : ActorMethod<
    [[] | [WtnPositionId], [] | [bigint]],
    Array<[WtnPositionId, WtnPosition]>
  >,
  '__wtnSnapshots' : ActorMethod<[], any>,
  '_initialize_access_control' : ActorMethod<[], undefined>,
  '_internet_identity_sign_in_finish' : ActorMethod<[], Result__1>,
  '_internet_identity_sign_in_start' : ActorMethod<[], Uint8Array | number[]>,
  'addNeuron' : ActorMethod<
    [NeuronId, string, bigint, bigint, bigint],
    undefined
  >,
  'addWtnPosition' : ActorMethod<[string, bigint], WtnPosition>,
  'assignCallerUserRole' : ActorMethod<[Principal, UserRole], undefined>,
  'checkAccess' : ActorMethod<[string], boolean>,
  'deleteSnapshot' : ActorMethod<[NeuronId, bigint], undefined>,
  'deleteWtnSnapshot' : ActorMethod<[WtnPositionId, bigint], undefined>,
  'editSnapshot' : ActorMethod<[NeuronId, bigint, bigint, bigint], undefined>,
  'editWtnSnapshot' : ActorMethod<
    [WtnPositionId, bigint, bigint, number, number, number],
    undefined
  >,
  'execute' : ActorMethod<[string], Result>,
  'generateInviteCode' : ActorMethod<[], string>,
  'getCallerUserRole' : ActorMethod<[], UserRole>,
  'getCurrentIcpPrice' : ActorMethod<[], PriceSnapshot>,
  'getHistoricalIcpPrice' : ActorMethod<[string], PriceSnapshot>,
  'getNeuronStats' : ActorMethod<[NeuronId], NeuronStats>,
  'getPortfolioRewardStats' : ActorMethod<[], PortfolioRewardStats>,
  'getPortfolioStats' : ActorMethod<[], PortfolioStats>,
  'getRewardHistory' : ActorMethod<[NeuronId], Array<DailyReward>>,
  'getSyncError' : ActorMethod<[NeuronId], [] | [string]>,
  'getSyncStatus' : ActorMethod<[NeuronId], SyncStatus>,
  'getTodayRewardE8s' : ActorMethod<[bigint, bigint], bigint>,
  'getWtnPosition' : ActorMethod<[WtnPositionId], [] | [WtnPosition]>,
  'getWtnSnapshots' : ActorMethod<[WtnPositionId], Array<WtnSnapshot>>,
  'getWtnStats' : ActorMethod<[WtnPositionId], WtnStats>,
  'importHistoricalData' : ActorMethod<
    [NeuronId, Array<HistoricalEntry>],
    undefined
  >,
  'importWtnHistoricalData' : ActorMethod<
    [WtnPositionId, Array<WtnHistoricalEntry>],
    undefined
  >,
  'isAdminBootstrapped' : ActorMethod<[], boolean>,
  'isCallerAdmin' : ActorMethod<[], boolean>,
  'isCallerAdminPrincipal' : ActorMethod<[], boolean>,
  'isCallerGranted' : ActorMethod<[], boolean>,
  'isPrincipalGranted' : ActorMethod<[Principal], boolean>,
  'listInviteCodes' : ActorMethod<[], Array<InviteCode>>,
  'listMyNeurons' : ActorMethod<[], Array<Neuron>>,
  'listMyWtnPositions' : ActorMethod<[], Array<WtnPosition>>,
  'reassignAdminPrincipal' : ActorMethod<[Principal], undefined>,
  'recordSnapshot' : ActorMethod<
    [NeuronId, bigint, bigint, boolean, bigint, bigint],
    DailyReward
  >,
  'recordWtnSnapshot' : ActorMethod<
    [WtnPositionId, bigint, number, number, number],
    WtnSnapshot
  >,
  'removeNeuron' : ActorMethod<[NeuronId], undefined>,
  'removeWtnPosition' : ActorMethod<[WtnPositionId], undefined>,
  'revokeInviteCode' : ActorMethod<[string], undefined>,
  'scheduleNextSync' : ActorMethod<[], TimerId>,
  'schema' : ActorMethod<[], string>,
  'setAdminPrincipal' : ActorMethod<[], undefined>,
  /**
   * / Install the daily sync timer on first call. Public shared functions run
   * / in an async context that has the `<system>` capability, so
   * / `scheduleNextSync()` (which calls `Timer.setTimer<system>`) is valid
   * / here. Idempotent: subsequent calls are no-ops once the timer is running
   * / (the timer reschedules itself from its own async callback, which also
   * / has the system capability).
   */
  'startDailySync' : ActorMethod<[], undefined>,
  /**
   * / Admin-only: stop the daily auto-sync. The next scheduled timer firing
   * / will see _dailySyncInstalled = false and exit immediately without
   * / doing any governance sync work and without rescheduling itself, which
   * / permanently ends the loop (nothing re-arms it). Call startDailySync()
   * / again later to re-enable automatic daily syncing.
   */
  'stopDailySync' : ActorMethod<[], undefined>,
  'syncAllMyNeurons' : ActorMethod<[], Array<SyncResult>>,
  'syncNeuron' : ActorMethod<[NeuronId], SyncResult>,
  /**
   * / IC HTTP outcall transform callback. Required by the IC HTTP outcall
   * / protocol: it must be a public `query` function on the actor and strips
   * / response headers so the response body is the only thing that survives
   * / into consensus. Passed to PricesLib functions and the PricesApi mixin.
   */
  'transform' : ActorMethod<[TransformationInput], TransformationOutput>,
  'updateNeuron' : ActorMethod<[Neuron], undefined>,
  'updateWtnPosition' : ActorMethod<[WtnPosition], undefined>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
