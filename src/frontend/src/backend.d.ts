import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export type Timestamp = bigint;
export interface TransformationOutput {
    status: bigint;
    body: Uint8Array;
    headers: Array<HttpHeader>;
}
export interface HttpRequestResult {
    status: bigint;
    body: Uint8Array;
    headers: Array<HttpHeader>;
}
export interface WtnPosition {
    id: WtnPositionId;
    ownerId: Principal;
    name: string;
    startDate: Timestamp;
}
export type Result__1 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: Error_;
};
export interface MonthlyBreakdown {
    month: bigint;
    totalDeltaE8s: bigint;
    year: bigint;
    readingCount: bigint;
    momDeltaE8s: bigint;
}
export interface WtnStats {
    percentReturn: number;
    totalCapitalContributed: number;
    totalEarned: number;
    positionId: WtnPositionId;
    redeemableIcpValue: number;
    totalWithdrawn: number;
}
export type TimerId = bigint;
export interface WtnSnapshot {
    date: Timestamp;
    positionId: WtnPositionId;
    redeemableIcpValue: number;
    nicpHeld: number;
    eventType: WtnEventType;
    totalIcpPaid: number;
}
export type E8s = bigint;
export interface TransformationInput {
    context: Uint8Array;
    response: HttpRequestResult;
}
export interface PriceSnapshot {
    pln: number;
    usd: number;
    timestamp: bigint;
    cached: boolean;
    unavailable: boolean;
}
export interface SyncResult {
    status: SyncStatus;
    maturityE8s?: bigint;
    lastSyncError?: string;
    stakedE8s?: bigint;
    neuronId: NeuronId;
}
export interface Cell {
    value: Value;
    name: string;
}
export type Value = {
    __kind__: "int";
    int: bigint;
} | {
    __kind__: "nat";
    nat: bigint;
} | {
    __kind__: "float";
    float: number;
} | {
    __kind__: "bool";
    bool: boolean;
} | {
    __kind__: "null";
    null: null;
} | {
    __kind__: "text";
    text: string;
};
export interface NeuronStats {
    averageDailyRewardE8s: bigint;
    totalRewardsE8s: bigint;
    totalCapitalContributedE8s: E8s;
    apy30d: number;
    percentageReturn: number;
    neuronId: NeuronId;
    monthly: Array<MonthlyBreakdown>;
    overallReturnPct: number;
}
export type DeltaE8s = bigint;
export type Error_ = {
    __kind__: "FrontendOriginsNotConfigured";
    FrontendOriginsNotConfigured: null;
} | {
    __kind__: "MixedSsoSources";
    MixedSsoSources: {
        otherKeys: Array<string>;
        ssoKeys: Array<string>;
    };
} | {
    __kind__: "Stale";
    Stale: {
        ageNs: bigint;
    };
} | {
    __kind__: "MalformedCandid";
    MalformedCandid: null;
} | {
    __kind__: "AmbiguousAttribute";
    AmbiguousAttribute: {
        field: string;
        sources: Array<string>;
    };
} | {
    __kind__: "NoAttributes";
    NoAttributes: null;
} | {
    __kind__: "UnknownNonce";
    UnknownNonce: null;
} | {
    __kind__: "UntrustedSsoSource";
    UntrustedSsoSource: {
        domain: string;
    };
} | {
    __kind__: "MissingField";
    MissingField: string;
} | {
    __kind__: "FrontendOriginMismatch";
    FrontendOriginMismatch: {
        got: string;
        expected: Array<string>;
    };
};
export interface WtnHistoricalEntry {
    date: Timestamp;
    redeemableIcpValue: number;
    nicpHeld: number;
    totalIcpPaid: number;
}
export interface HistoricalEntry {
    stakedMaturityE8s: E8s;
    unstakedMaturityE8s: E8s;
    timestamp: Timestamp;
}
export interface DailyReward {
    stakedMaturityE8s: E8s;
    unstakedMaturityE8s: E8s;
    stakeDeltaE8s: E8s;
    autoStakeMaturity: boolean;
    timestamp: Timestamp;
    neuronId: NeuronId;
    deltaE8s: DeltaE8s;
    eventType: EventType;
}
export interface HttpHeader {
    value: string;
    name: string;
}
export interface Result {
    hasMore: boolean;
    rows: Array<Array<Cell>>;
}
export interface Neuron {
    id: NeuronId;
    dissolveDelaySeconds: bigint;
    ownerId: Principal;
    name: string;
    stakedE8s: E8s;
    initialStakeE8s: E8s;
    startDate: Timestamp;
}
export interface PortfolioStats {
    wtnRewardsThisMonthFloat: number;
    totalMaturityE8s: bigint;
    wtnRewardsE8s: bigint;
    nnsStakedE8s: E8s;
    totalRewardsThisMonthE8s: bigint;
    wtnCapitalContributedE8s: E8s;
    totalRewardsE8s: bigint;
    combinedRewardsThisMonthE8s: bigint;
    blendedApy: number;
    totalStakedE8s: E8s;
    nnsRewardsThisMonthE8s: bigint;
    totalCapitalContributedE8s: E8s;
    percentageReturn: number;
    nnsCapitalContributedE8s: E8s;
    nnsRewardsE8s: bigint;
    wtnStakedE8s: E8s;
    neuronCount: bigint;
}
export type NeuronId = bigint;
export interface PortfolioRewardStats {
    monthlyReadings: bigint;
    averageDailyRewardE8s: bigint;
    totalRewardsE8s: bigint;
    totalCapitalContributedE8s: E8s;
    apy30d: number;
    monthly: Array<MonthlyBreakdown>;
    overallReturnPct: number;
}
export type WtnPositionId = bigint;
export enum EventType {
    mergedToStake = "mergedToStake",
    normalGrowth = "normalGrowth",
    firstReading = "firstReading",
    externalTopUp = "externalTopUp",
    disburseOrSpawn = "disburseOrSpawn"
}
export enum SyncStatus {
    hotkeyRequired = "hotkeyRequired",
    neverSynced = "neverSynced",
    failed = "failed",
    synced = "synced"
}
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export enum WtnEventType {
    firstReading = "firstReading",
    capitalAdded = "capitalAdded",
    withdrawal = "withdrawal",
    organicGrowth = "organicGrowth"
}
export interface backendInterface {
    addNeuron(id: NeuronId, name: string, startDate: bigint, dissolveDelaySeconds: bigint, initialStakeE8s: bigint): Promise<void>;
    addWtnPosition(name: string, startDate: bigint): Promise<WtnPosition>;
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    deleteSnapshot(neuronId: NeuronId, timestamp: bigint): Promise<void>;
    deleteWtnSnapshot(positionId: WtnPositionId, date: bigint): Promise<void>;
    editSnapshot(neuronId: NeuronId, timestamp: bigint, newTimestamp: bigint, newMaturityE8s: bigint): Promise<void>;
    editWtnSnapshot(positionId: WtnPositionId, date: bigint, newDate: bigint, newNicpHeld: number, newTotalIcpPaid: number, newRedeemableIcpValue: number): Promise<void>;
    execute(qJson: string): Promise<Result>;
    getCallerUserRole(): Promise<UserRole>;
    getCurrentIcpPrice(): Promise<PriceSnapshot>;
    getHistoricalIcpPrice(date: string): Promise<PriceSnapshot>;
    getNeuronStats(neuronId: NeuronId): Promise<NeuronStats>;
    getPortfolioRewardStats(): Promise<PortfolioRewardStats>;
    getPortfolioStats(): Promise<PortfolioStats>;
    getRewardHistory(neuronId: NeuronId): Promise<Array<DailyReward>>;
    getSyncError(neuronId: NeuronId): Promise<string | null>;
    getSyncStatus(neuronId: NeuronId): Promise<SyncStatus>;
    getWtnPosition(positionId: WtnPositionId): Promise<WtnPosition | null>;
    getWtnSnapshots(positionId: WtnPositionId): Promise<Array<WtnSnapshot>>;
    getWtnStats(positionId: WtnPositionId): Promise<WtnStats>;
    importHistoricalData(neuronId: NeuronId, entries: Array<HistoricalEntry>): Promise<void>;
    importWtnHistoricalData(positionId: WtnPositionId, entries: Array<WtnHistoricalEntry>): Promise<void>;
    isCallerAdmin(): Promise<boolean>;
    listMyNeurons(): Promise<Array<Neuron>>;
    listMyWtnPositions(): Promise<Array<WtnPosition>>;
    recordSnapshot(neuronId: NeuronId, unstakedMaturityE8s: bigint, stakedMaturityE8s: bigint, autoStakeMaturity: boolean): Promise<DailyReward>;
    recordWtnSnapshot(positionId: WtnPositionId, date: bigint, nicpHeld: number, totalIcpPaid: number, redeemableIcpValue: number): Promise<WtnSnapshot>;
    removeNeuron(neuronId: NeuronId): Promise<void>;
    removeWtnPosition(positionId: WtnPositionId): Promise<void>;
    /**
     * / Schedule the next daily sync at 18:01 Europe/Warsaw. Recomputes the
     * / target on every call so DST transitions do not cause drift. After the
     * / sync runs, reschedules for the following 18:01 Warsaw.
     * /
     * / `Timer.setTimer<system>` requires the `<system>` capability, which is
     * / available in `shared` functions and async callbacks but NOT in a plain
     * / actor `func` or a transient-let initializer. This function is therefore
     * / only ever called from two system-capable contexts: (1) the
     * / `public shared func startDailySync()` below, and (2) the async timer
     * / callback passed to `Timer.setTimer` (which itself has the system
     * / capability, so rescheduling works). It must NOT be called from a plain
     * / transient let or a non-shared private func.
     */
    scheduleNextSync(): Promise<TimerId>;
    schema(): Promise<string>;
    /**
     * / Install the daily sync timer on first call. Public shared functions run
     * / in an async context that has the `<system>` capability, so
     * / `scheduleNextSync()` (which calls `Timer.setTimer<system>`) is valid
     * / here. Idempotent: subsequent calls are no-ops once the timer is running
     * / (the timer reschedules itself from its own async callback, which also
     * / has the system capability).
     */
    startDailySync(): Promise<void>;
    syncAllMyNeurons(): Promise<Array<SyncResult>>;
    syncNeuron(neuronId: NeuronId): Promise<SyncResult>;
    /**
     * / IC HTTP outcall transform callback. Required by the IC HTTP outcall
     * / protocol: it must be a public `query` function on the actor and strips
     * / response headers so the response body is the only thing that survives
     * / into consensus. Passed to PricesLib functions and the PricesApi mixin.
     */
    transform(input: TransformationInput): Promise<TransformationOutput>;
    updateNeuron(neuron: Neuron): Promise<void>;
    updateWtnPosition(position: WtnPosition): Promise<void>;
}
