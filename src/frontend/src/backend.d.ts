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
export type Result__1 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: Error_;
};
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
export type DeltaE8s = bigint;
export interface HistoricalEntry {
    maturityE8s: E8s;
    timestamp: Timestamp;
}
export interface MonthlyBreakdown {
    month: bigint;
    totalDeltaE8s: bigint;
    year: bigint;
    readingCount: bigint;
}
export interface DailyReward {
    maturityE8s: E8s;
    timestamp: Timestamp;
    neuronId: NeuronId;
    deltaE8s: DeltaE8s;
    eventType: EventType;
}
export interface Result {
    hasMore: boolean;
    rows: Array<Array<Cell>>;
}
export interface PortfolioStats {
    totalRewardsE8s: bigint;
    totalStakedE8s: E8s;
    percentageReturn: number;
    neuronCount: bigint;
}
export interface Neuron {
    id: NeuronId;
    dissolveDelaySeconds: bigint;
    ownerId: Principal;
    name: string;
    initialStakeE8s: E8s;
    startDate: Timestamp;
}
export type E8s = bigint;
export interface Cell {
    value: Value;
    name: string;
}
export interface SyncResult {
    status: SyncStatus;
    maturityE8s?: bigint;
    neuronId: NeuronId;
}
export type NeuronId = bigint;
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
    percentageReturn: number;
    neuronId: NeuronId;
    monthly: Array<MonthlyBreakdown>;
}
export enum EventType {
    normalGrowth = "normalGrowth",
    firstReading = "firstReading",
    disburseOrSpawn = "disburseOrSpawn"
}
export enum SyncStatus {
    hotkeyRequired = "hotkeyRequired",
    neverSynced = "neverSynced",
    synced = "synced"
}
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export interface backendInterface {
    addNeuron(id: NeuronId, name: string, startDate: bigint, dissolveDelaySeconds: bigint, initialStakeE8s: bigint): Promise<void>;
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    execute(qJson: string): Promise<Result>;
    getCallerUserRole(): Promise<UserRole>;
    getNeuronStats(neuronId: NeuronId): Promise<NeuronStats>;
    getPortfolioStats(): Promise<PortfolioStats>;
    getRewardHistory(neuronId: NeuronId): Promise<Array<DailyReward>>;
    getSyncStatus(neuronId: NeuronId): Promise<SyncStatus>;
    importHistoricalData(neuronId: NeuronId, entries: Array<HistoricalEntry>): Promise<void>;
    isCallerAdmin(): Promise<boolean>;
    listMyNeurons(): Promise<Array<Neuron>>;
    recordSnapshot(neuronId: NeuronId, maturityE8s: bigint): Promise<DailyReward>;
    removeNeuron(neuronId: NeuronId): Promise<void>;
    schema(): Promise<string>;
    syncAllMyNeurons(): Promise<Array<SyncResult>>;
    syncNeuron(neuronId: NeuronId): Promise<SyncResult>;
    updateNeuron(neuron: Neuron): Promise<void>;
}
