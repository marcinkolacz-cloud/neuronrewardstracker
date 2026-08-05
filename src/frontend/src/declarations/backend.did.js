export const idlFactory = ({ IDL }) => {
  const WtnPositionId = IDL.Nat;
  const Timestamp = IDL.Int;
  const WtnPosition = IDL.Record({
    'id' : WtnPositionId,
    'ownerId' : IDL.Principal,
    'name' : IDL.Text,
    'startDate' : Timestamp,
  });
  const Error = IDL.Variant({
    'FrontendOriginsNotConfigured' : IDL.Null,
    'MixedSsoSources' : IDL.Record({
      'otherKeys' : IDL.Vec(IDL.Text),
      'ssoKeys' : IDL.Vec(IDL.Text),
    }),
    'Stale' : IDL.Record({ 'ageNs' : IDL.Nat }),
    'MalformedCandid' : IDL.Null,
    'AmbiguousAttribute' : IDL.Record({
      'field' : IDL.Text,
      'sources' : IDL.Vec(IDL.Text),
    }),
    'NoAttributes' : IDL.Null,
    'UnknownNonce' : IDL.Null,
    'UntrustedSsoSource' : IDL.Record({ 'domain' : IDL.Text }),
    'MissingField' : IDL.Text,
    'FrontendOriginMismatch' : IDL.Record({
      'got' : IDL.Text,
      'expected' : IDL.Vec(IDL.Text),
    }),
  });
  const Result__1 = IDL.Variant({ 'ok' : IDL.Null, 'err' : Error });
  const NeuronId = IDL.Nat64;
  const UserRole = IDL.Variant({
    'admin' : IDL.Null,
    'user' : IDL.Null,
    'guest' : IDL.Null,
  });
  const Value = IDL.Variant({
    'int' : IDL.Int,
    'nat' : IDL.Nat,
    'float' : IDL.Float64,
    'bool' : IDL.Bool,
    'null' : IDL.Null,
    'text' : IDL.Text,
  });
  const Cell = IDL.Record({ 'value' : Value, 'name' : IDL.Text });
  const Result = IDL.Record({
    'hasMore' : IDL.Bool,
    'rows' : IDL.Vec(IDL.Vec(Cell)),
  });
  const PriceSnapshot = IDL.Record({
    'pln' : IDL.Float64,
    'usd' : IDL.Float64,
    'timestamp' : IDL.Int,
    'cached' : IDL.Bool,
    'unavailable' : IDL.Bool,
  });
  const E8s = IDL.Nat64;
  const MonthlyBreakdown = IDL.Record({
    'month' : IDL.Nat,
    'totalDeltaE8s' : IDL.Int,
    'year' : IDL.Nat,
    'readingCount' : IDL.Nat,
    'momDeltaE8s' : IDL.Int,
  });
  const NeuronStats = IDL.Record({
    'averageDailyRewardE8s' : IDL.Int,
    'totalRewardsE8s' : IDL.Int,
    'totalCapitalContributedE8s' : E8s,
    'currentMaturityE8s' : IDL.Int,
    'apy30d' : IDL.Float64,
    'percentageReturn' : IDL.Float64,
    'neuronId' : NeuronId,
    'monthly' : IDL.Vec(MonthlyBreakdown),
    'totalDisbursedE8s' : IDL.Int,
    'overallReturnPct' : IDL.Float64,
  });
  const PortfolioRewardStats = IDL.Record({
    'monthlyReadings' : IDL.Nat,
    'averageDailyRewardE8s' : IDL.Int,
    'totalRewardsE8s' : IDL.Int,
    'totalCapitalContributedE8s' : E8s,
    'apy30d' : IDL.Float64,
    'monthly' : IDL.Vec(MonthlyBreakdown),
    'overallReturnPct' : IDL.Float64,
  });
  const PortfolioStats = IDL.Record({
    'wtnRewardsThisMonthFloat' : IDL.Float64,
    'totalPortfolioValueE8s' : IDL.Int,
    'totalMaturityE8s' : IDL.Nat64,
    'wtnRewardsE8s' : IDL.Int,
    'nnsStakedE8s' : E8s,
    'totalRewardsThisMonthE8s' : IDL.Nat64,
    'wtnCapitalContributedE8s' : E8s,
    'totalRewardsE8s' : IDL.Int,
    'combinedRewardsThisMonthE8s' : IDL.Nat64,
    'blendedApy' : IDL.Float64,
    'totalStakedE8s' : E8s,
    'nnsRewardsThisMonthE8s' : IDL.Nat64,
    'totalCapitalContributedE8s' : E8s,
    'percentageReturn' : IDL.Float64,
    'nnsCapitalContributedE8s' : E8s,
    'nnsRewardsE8s' : IDL.Int,
    'wtnStakedE8s' : E8s,
    'totalDisbursedE8s' : IDL.Int,
    'neuronCount' : IDL.Nat,
  });
  const DeltaE8s = IDL.Int;
  const EventType = IDL.Variant({
    'mergedToStake' : IDL.Null,
    'normalGrowth' : IDL.Null,
    'firstReading' : IDL.Null,
    'externalTopUp' : IDL.Null,
    'disburseOrSpawn' : IDL.Null,
  });
  const DailyReward = IDL.Record({
    'stakedMaturityE8s' : E8s,
    'unstakedMaturityE8s' : E8s,
    'stakeDeltaE8s' : E8s,
    'autoStakeMaturity' : IDL.Bool,
    'timestamp' : Timestamp,
    'neuronId' : NeuronId,
    'deltaE8s' : DeltaE8s,
    'eventType' : EventType,
  });
  const SyncStatus = IDL.Variant({
    'hotkeyRequired' : IDL.Null,
    'neverSynced' : IDL.Null,
    'failed' : IDL.Null,
    'synced' : IDL.Null,
  });
  const WtnEventType = IDL.Variant({
    'firstReading' : IDL.Null,
    'capitalAdded' : IDL.Null,
    'withdrawal' : IDL.Null,
    'organicGrowth' : IDL.Null,
  });
  const WtnSnapshot = IDL.Record({
    'date' : Timestamp,
    'positionId' : WtnPositionId,
    'redeemableIcpValue' : IDL.Float64,
    'nicpHeld' : IDL.Float64,
    'eventType' : WtnEventType,
    'totalIcpPaid' : IDL.Float64,
  });
  const WtnStats = IDL.Record({
    'percentReturn' : IDL.Float64,
    'totalCapitalContributed' : IDL.Float64,
    'totalEarned' : IDL.Float64,
    'positionId' : WtnPositionId,
    'redeemableIcpValue' : IDL.Float64,
    'totalWithdrawn' : IDL.Float64,
  });
  const HistoricalEntry = IDL.Record({
    'stakedMaturityE8s' : E8s,
    'unstakedMaturityE8s' : E8s,
    'timestamp' : Timestamp,
  });
  const WtnHistoricalEntry = IDL.Record({
    'date' : Timestamp,
    'redeemableIcpValue' : IDL.Float64,
    'nicpHeld' : IDL.Float64,
    'totalIcpPaid' : IDL.Float64,
  });
  const InviteCodeStatus = IDL.Variant({
    'revoked' : IDL.Null,
    'used' : IDL.Null,
    'unused' : IDL.Null,
  });
  const InviteCode = IDL.Record({
    'status' : InviteCodeStatus,
    'code' : IDL.Text,
    'createdAt' : Timestamp,
  });
  const Neuron = IDL.Record({
    'id' : NeuronId,
    'dissolveDelaySeconds' : IDL.Nat64,
    'ownerId' : IDL.Principal,
    'name' : IDL.Text,
    'stakedE8s' : E8s,
    'initialStakeE8s' : E8s,
    'startDate' : Timestamp,
  });
  const TimerId = IDL.Nat;
  const SyncResult = IDL.Record({
    'status' : SyncStatus,
    'maturityE8s' : IDL.Opt(IDL.Nat64),
    'lastSyncError' : IDL.Opt(IDL.Text),
    'stakedE8s' : IDL.Opt(IDL.Nat64),
    'neuronId' : NeuronId,
  });
  const HttpHeader = IDL.Record({ 'value' : IDL.Text, 'name' : IDL.Text });
  const HttpRequestResult = IDL.Record({
    'status' : IDL.Nat,
    'body' : IDL.Vec(IDL.Nat8),
    'headers' : IDL.Vec(HttpHeader),
  });
  const TransformationInput = IDL.Record({
    'context' : IDL.Vec(IDL.Nat8),
    'response' : HttpRequestResult,
  });
  const TransformationOutput = IDL.Record({
    'status' : IDL.Nat,
    'body' : IDL.Vec(IDL.Nat8),
    'headers' : IDL.Vec(HttpHeader),
  });
  return IDL.Service({
    '___dailySyncInstalled' : IDL.Func([], [IDL.Bool], ['query']),
    '__accessControlState' : IDL.Func([], [IDL.Reserved], ['query']),
    '__adminPrincipal' : IDL.Func([], [IDL.Reserved], ['query']),
    '__grantedPrincipals' : IDL.Func(
        [IDL.Opt(IDL.Principal), IDL.Opt(IDL.Nat)],
        [IDL.Vec(IDL.Principal)],
        ['query'],
      ),
    '__inviteCodes' : IDL.Func([], [IDL.Reserved], ['query']),
    '__neurons' : IDL.Func([], [IDL.Reserved], ['query']),
    '__nextWtnPositionId' : IDL.Func([], [IDL.Reserved], ['query']),
    '__priceCache' : IDL.Func([], [IDL.Reserved], ['query']),
    '__rewards' : IDL.Func([], [IDL.Reserved], ['query']),
    '__syncErrors' : IDL.Func([], [IDL.Reserved], ['query']),
    '__syncStatuses' : IDL.Func([], [IDL.Reserved], ['query']),
    '__wtnPositions' : IDL.Func(
        [IDL.Opt(WtnPositionId), IDL.Opt(IDL.Nat)],
        [IDL.Vec(IDL.Tuple(WtnPositionId, WtnPosition))],
        ['query'],
      ),
    '__wtnSnapshots' : IDL.Func([], [IDL.Reserved], ['query']),
    '_initialize_access_control' : IDL.Func([], [], []),
    '_internet_identity_sign_in_finish' : IDL.Func([], [Result__1], []),
    '_internet_identity_sign_in_start' : IDL.Func([], [IDL.Vec(IDL.Nat8)], []),
    'addNeuron' : IDL.Func(
        [NeuronId, IDL.Text, IDL.Int, IDL.Nat64, IDL.Nat64],
        [],
        [],
      ),
    'addWtnPosition' : IDL.Func([IDL.Text, IDL.Int], [WtnPosition], []),
    'assignCallerUserRole' : IDL.Func([IDL.Principal, UserRole], [], []),
    'checkAccess' : IDL.Func([IDL.Text], [IDL.Bool], []),
    'deleteSnapshot' : IDL.Func([NeuronId, IDL.Int], [], []),
    'deleteWtnSnapshot' : IDL.Func([WtnPositionId, IDL.Int], [], []),
    'editSnapshot' : IDL.Func([NeuronId, IDL.Int, IDL.Int, IDL.Nat64], [], []),
    'editWtnSnapshot' : IDL.Func(
        [
          WtnPositionId,
          IDL.Int,
          IDL.Int,
          IDL.Float64,
          IDL.Float64,
          IDL.Float64,
        ],
        [],
        [],
      ),
    'execute' : IDL.Func([IDL.Text], [Result], ['query']),
    'generateInviteCode' : IDL.Func([], [IDL.Text], []),
    'getCallerUserRole' : IDL.Func([], [UserRole], ['query']),
    'getCurrentIcpPrice' : IDL.Func([], [PriceSnapshot], []),
    'getHistoricalIcpPrice' : IDL.Func([IDL.Text], [PriceSnapshot], []),
    'getNeuronStats' : IDL.Func([NeuronId], [NeuronStats], ['query']),
    'getPortfolioRewardStats' : IDL.Func([], [PortfolioRewardStats], ['query']),
    'getPortfolioStats' : IDL.Func([], [PortfolioStats], ['query']),
    'getRewardHistory' : IDL.Func(
        [NeuronId],
        [IDL.Vec(DailyReward)],
        ['query'],
      ),
    'getSyncError' : IDL.Func([NeuronId], [IDL.Opt(IDL.Text)], ['query']),
    'getSyncStatus' : IDL.Func([NeuronId], [SyncStatus], ['query']),
    'getWtnPosition' : IDL.Func(
        [WtnPositionId],
        [IDL.Opt(WtnPosition)],
        ['query'],
      ),
    'getWtnSnapshots' : IDL.Func(
        [WtnPositionId],
        [IDL.Vec(WtnSnapshot)],
        ['query'],
      ),
    'getWtnStats' : IDL.Func([WtnPositionId], [WtnStats], ['query']),
    'importHistoricalData' : IDL.Func(
        [NeuronId, IDL.Vec(HistoricalEntry)],
        [],
        [],
      ),
    'importWtnHistoricalData' : IDL.Func(
        [WtnPositionId, IDL.Vec(WtnHistoricalEntry)],
        [],
        [],
      ),
    'isAdminBootstrapped' : IDL.Func([], [IDL.Bool], ['query']),
    'isCallerAdmin' : IDL.Func([], [IDL.Bool], ['query']),
    'isCallerAdminPrincipal' : IDL.Func([], [IDL.Bool], ['query']),
    'isCallerGranted' : IDL.Func([], [IDL.Bool], ['query']),
    'isPrincipalGranted' : IDL.Func([IDL.Principal], [IDL.Bool], ['query']),
    'listInviteCodes' : IDL.Func([], [IDL.Vec(InviteCode)], ['query']),
    'listMyNeurons' : IDL.Func([], [IDL.Vec(Neuron)], ['query']),
    'listMyWtnPositions' : IDL.Func([], [IDL.Vec(WtnPosition)], ['query']),
    'reassignAdminPrincipal' : IDL.Func([IDL.Principal], [], []),
    'recordSnapshot' : IDL.Func(
        [NeuronId, IDL.Nat64, IDL.Nat64, IDL.Bool, IDL.Int, IDL.Nat64],
        [DailyReward],
        [],
      ),
    'recordWtnSnapshot' : IDL.Func(
        [WtnPositionId, IDL.Int, IDL.Float64, IDL.Float64, IDL.Float64],
        [WtnSnapshot],
        [],
      ),
    'removeNeuron' : IDL.Func([NeuronId], [], []),
    'removeWtnPosition' : IDL.Func([WtnPositionId], [], []),
    'revokeInviteCode' : IDL.Func([IDL.Text], [], []),
    'scheduleNextSync' : IDL.Func([], [TimerId], []),
    'schema' : IDL.Func([], [IDL.Text], ['query']),
    'setAdminPrincipal' : IDL.Func([], [], []),
    'startDailySync' : IDL.Func([], [], []),
    'stopDailySync' : IDL.Func([], [], []),
    'syncAllMyNeurons' : IDL.Func([], [IDL.Vec(SyncResult)], []),
    'syncNeuron' : IDL.Func([NeuronId], [SyncResult], []),
    'transform' : IDL.Func(
        [TransformationInput],
        [TransformationOutput],
        ['query'],
      ),
    'updateNeuron' : IDL.Func([Neuron], [], []),
    'updateWtnPosition' : IDL.Func([WtnPosition], [], []),
  });
};
export const init = ({ IDL }) => { return []; };
