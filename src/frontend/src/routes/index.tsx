/**
 * Dashboard page — portfolio summary + positions grid + reward stats.
 *
 * Section order:
 *   1. Portfolio summary panel (7 stat cards: Total Portfolio Value,
 *      Total Staked, Total Capital Contributed, Total Maturity, Blended
 *      APY, Earned This Month, Total Rewards Earned) using .stat-card
 *      utility. Total Portfolio Value is the primary portfolio-size
 *      metric (NNS stake + NNS maturity + WTN redeemable, the consistent
 *      apples-to-apples total from totalPortfolioValueE8s).
 *   2. Current portfolio value in USD + PLN (computed from
 *      totalPortfolioValueE8s * currentPrice / E8S_PER_ICP) with
 *      .value-pill utility
 *   3. Positions grid (individual Neuron + WTN cards)
 *   4. Portfolio-wide reward statistics + monthly breakdown
 *
 * Also shows the current ICP price badge (.price-badge / .price-stale
 * when cached) with last-updated timestamp + a refresh-price button,
 * a Refresh All button + Export CSV button + Add Neuron button, and an
 * empty state when no neurons are tracked.
 *
 * The Export CSV button fetches every tracked neuron's DailyReward history
 * in parallel and downloads a single combined CSV (with a neuronId column)
 * via rewardsToCombinedCsv + downloadCsv from lib/csv.ts. The CSV logic is
 * owned by this dashboard and is NOT modified by the price-enrichment task.
 *
 * Portfolio stats come from getPortfolioStats (real PortfolioStats:
 * totalStakedE8s, totalCapitalContributedE8s, totalRewardsE8s,
 * percentageReturn, neuronCount, blendedApy, totalMaturityE8s,
 * totalRewardsThisMonthE8s, totalPortfolioValueE8s). The backend now
 * computes blendedApy capital-weighted by totalCapitalContributedE8s,
 * and totalRewardsThisMonthE8s excludes #externalTopUp and
 * #mergedToStake — the frontend consumes these corrected values
 * directly. Per-neuron maturity / % return come from getNeuronStats
 * (totalRewardsE8s excludes top-ups, percentageReturn uses capital
 * contributed as denominator), and sync status from getSyncStatus.
 * Current ICP price comes from getCurrentIcpPrice via useIcpPrice().
 */

import {
  MonthlyBreakdownSection,
  RewardStatsCard,
} from "@/components/stats-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNeurons } from "@/hooks/use-neurons";
import { HISTORICAL_PRICES_ENABLED, useIcpPrice } from "@/hooks/use-prices";
import { useSyncStatus } from "@/hooks/use-rewards";
import {
  useNeuronStats,
  usePortfolioRewardStats,
  useAverage30dReward,
  usePortfolioStats,
} from "@/hooks/use-stats";
import { useSyncError } from "@/hooks/use-sync";
import { useWtnPositions, useWtnStats } from "@/hooks/use-wtn";
import { useBackendActor } from "@/lib/backend-actor";
import type {
  DailyReward,
  Neuron,
  SyncStatus,
  WtnPosition,
} from "@/lib/backend-actor";
import type { WtnSnapshot } from "@/lib/backend-actor";
import {
  type PriceMap,
  downloadCsv,
  neuronRewardsToCombinedTypedRows,
  wtnSnapshotsToCombinedCsv,
} from "@/lib/csv";
import {
  E8S_PER_ICP,
  formatApy,
  formatIcp,
  formatIcpCompact,
  formatPercent,
  formatPln,
  formatTimestamp,
  formatTimestampDateTime,
  formatUsd,
  shortenNeuronId,
  shortenPrincipal,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BrainCircuit,
  CalendarClock,
  Coins,
  Download,
  Droplets,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";

export function DashboardPage() {
  const { data: neurons, isLoading: neuronsLoading } = useNeurons();
  const { data: wtnPositions, isLoading: wtnLoading } = useWtnPositions();
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolioStats();
  const { data: rewardStats, isLoading: rewardStatsLoading } =
    usePortfolioRewardStats();
  const { data: average30dReward, isLoading: average30dRewardLoading } =
    useAverage30dReward();
  const priceQuery = useIcpPrice();
  const queryClient = useQueryClient();
  const { actor } = useBackendActor();
  const navigate = useNavigate();
  const [isExporting, setIsExporting] = useState(false);

  const neuronCount = neurons?.length ?? 0;
  const wtnCount = wtnPositions?.length ?? 0;
  const isEmpty =
    !neuronsLoading && !wtnLoading && neuronCount === 0 && wtnCount === 0;
  // Refresh All removed (2026-08-04): governance sync is manual-only now
  // (per-neuron "Sync now" + manual snapshot entry). Kept as a constant
  // so the rest of the component doesn't need further changes.
  const isSyncingAll = false;

  const handleRefreshPrice = () => {
    priceQuery.refetch();
  };

  const handleExportCsv = async () => {
    if (
      !actor ||
      !neurons ||
      (neurons.length === 0 && (!wtnPositions || wtnPositions.length === 0))
    )
      return;
    setIsExporting(true);
    try {
      // Fetch NNS neuron reward histories in parallel.
      const groups = await Promise.all(
        neurons.map(async (neuron) => {
          const rewards: DailyReward[] = await actor.getRewardHistory(
            neuron.id,
          );
          return { neuronId: neuron.id, rewards };
        }),
      );
      const nonEmpty = groups.filter((g) => g.rewards.length > 0);

      // Fetch WTN snapshots for each WTN position in parallel.
      const wtnGroups = await Promise.all(
        (wtnPositions ?? []).map(async (position) => {
          const snapshots: WtnSnapshot[] = await actor.getWtnSnapshots(
            position.id,
          );
          return { positionId: position.id, snapshots };
        }),
      );
      const wtnNonEmpty = wtnGroups.filter((g) => g.snapshots.length > 0);

      if (nonEmpty.length === 0 && wtnNonEmpty.length === 0) {
        toast.info("No reward snapshots to export yet");
        return;
      }
      // Build a PriceMap keyed by YYYY-MM-DD by fetching the historical ICP
      // price for every distinct reward date across the exported neurons.
      // Dates are deduplicated to keep the CoinGecko request batch small;
      // failures for individual dates are skipped so a single bad date does
      // not block the whole export (those rows just get empty price columns).
      const dateSet = new Set<string>();
      for (const g of nonEmpty) {
        for (const r of g.rewards) {
          const ms = Number(r.timestamp / 1_000_000n);
          if (!Number.isFinite(ms) || ms <= 0) continue;
          const d = new Date(ms);
          if (Number.isNaN(d.getTime())) continue;
          const pad = (n: number) => String(n).padStart(2, "0");
          dateSet.add(
            `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
          );
        }
      }
      // EMERGENCY MITIGATION: when HISTORICAL_PRICES_ENABLED is false,
      // skip the per-date getHistoricalIcpPrice outcalls entirely. The
      // priceMap stays empty, so rewardsToCombinedCsv emits rows with
      // empty USD/PLN price columns instead of triggering CoinGecko
      // outcalls. The fetch logic is preserved for re-enablement.
      const priceMap: PriceMap = new Map();
      if (HISTORICAL_PRICES_ENABLED) {
        await Promise.all(
          [...dateSet].map(async (date) => {
            try {
              const snap = await actor.getHistoricalIcpPrice(date);
              if (snap && snap.usd > 0) {
                priceMap.set(date, { usd: snap.usd, pln: snap.pln });
              }
            } catch {
              // skip this date — row will have empty price columns
            }
          }),
        );
      }

      // Build a single combined CSV with a type-identifier column ("NNS" vs
      // "WTN"). NNS rows reuse the rich rewardsToCombinedCsv schema (with
      // price columns); WTN rows use the WTN-specific schema (id, type, date,
      // nicpHeld, totalIcpPaid, redeemableIcpValue, classification). The two
      // sections share a leading id + type + date + classification shape so
      // the file can be filtered by position/neuron and by type.
      const wtnCsv = wtnSnapshotsToCombinedCsv(wtnNonEmpty);

      // Emit a single unified CSV with the wide typed header
      // (id,type,date,maturityBalance,deltaE8s,stakeDeltaE8s,nicpHeld,
      // totalIcpPaid,redeemableValue,classification) exactly once, then
      // append all NNS typed rows + WTN rows beneath it. NNS rows populate
      // the maturityBalance/deltaE8s/stakeDeltaE8s columns; WTN rows
      // populate the nicpHeld/totalIcpPaid/redeemableValue columns. The
      // classification column carries the precise event-type variant
      // string for each row.
      const TYPED_HEADER =
        "id,type,date,maturityBalance,deltaE8s,stakeDeltaE8s,nicpHeld,totalIcpPaid,redeemableValue,classification";
      const nnsTypedRows = neuronRewardsToCombinedTypedRows(groups);
      const wtnRows = wtnCsv.split("\n").slice(1); // drop WTN header
      const csv = [TYPED_HEADER, ...nnsTypedRows, ...wtnRows].join("\n");

      downloadCsv("portfolio-export.csv", csv);
      const totalPositions = nonEmpty.length + wtnNonEmpty.length;
      toast.success(
        `Exported ${totalPositions} position${totalPositions === 1 ? "" : "s"} to CSV`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export CSV");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-background">
      {/* Aurora glow backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-40"
        style={{
          background:
            "radial-gradient(50% 60% at 50% 0%, oklch(var(--primary) / 0.12) 0%, oklch(var(--background) / 0) 70%)",
        }}
      />
      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page header + actions */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-foreground font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Portfolio
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Track staked ICP, maturity growth, and governance rewards across
              your NNS neurons.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={handleExportCsv}
                    disabled={isExporting || isEmpty || neuronsLoading}
                    data-ocid="dashboard.export_csv"
                  >
                    <Download
                      className={isExporting ? "size-4 animate-spin" : "size-4"}
                    />
                    Export CSV
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isEmpty
                    ? "Add a neuron or WTN position before exporting"
                    : "Download all neurons' and WTN positions' histories as one CSV"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              onClick={() => navigate({ to: "/add-neuron" })}
              data-ocid="dashboard.add_neuron"
            >
              <Plus className="size-4" />
              Add Neuron
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/add-wtn" })}
              data-ocid="dashboard.add_wtn"
            >
              <Droplets className="size-4" />
              Add WTN Neuron
            </Button>
          </div>
        </div>

        {/* Portfolio summary panel */}
        <section className="mt-8" data-ocid="dashboard.portfolio_summary">
          <PortfolioSummary
            totalPortfolioValue={portfolio?.totalPortfolioValueE8s ?? null}
            wtnStaked={portfolio?.wtnStakedE8s ?? null}
            totalCapitalContributed={
              portfolio?.totalCapitalContributedE8s ?? null
            }
            nnsCapitalContributed={portfolio?.nnsCapitalContributedE8s ?? null}
            wtnCapitalContributed={portfolio?.wtnCapitalContributedE8s ?? null}
            totalMaturity={portfolio?.totalMaturityE8s ?? null}
            blendedApy={portfolio?.blendedApy ?? null}
            rewardsThisMonth={portfolio?.combinedRewardsThisMonthE8s ?? null}
            nnsRewardsThisMonth={portfolio?.nnsRewardsThisMonthE8s ?? null}
            wtnRewardsThisMonthFloat={
              portfolio?.wtnRewardsThisMonthFloat ?? null
            }
            totalRewards={portfolio?.totalRewardsE8s ?? null}
            nnsRewards={portfolio?.nnsRewardsE8s ?? null}
            wtnRewards={portfolio?.wtnRewardsE8s ?? null}
            totalDisbursed={portfolio?.totalDisbursedE8s ?? null}
            average30dReward={average30dReward ?? null}
            average30dRewardLoading={average30dRewardLoading}
            loading={portfolioLoading}
          />
        </section>

        {/* Portfolio valuation (USD + PLN) with current price badge */}
        <section className="mt-6" data-ocid="dashboard.portfolio_value">
          <PortfolioValuation
            totalPortfolioValueE8s={portfolio?.totalPortfolioValueE8s ?? null}
            priceQuery={priceQuery}
            onRefreshPrice={handleRefreshPrice}
            loading={portfolioLoading}
          />
        </section>

        {/* Neuron + WTN cards grid */}
        <section className="mt-10">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-foreground font-display text-lg font-semibold tracking-tight">
              Positions
            </h2>
            <Badge variant="secondary" className="font-mono">
              {(neurons?.length ?? 0) + (wtnPositions?.length ?? 0)}
            </Badge>
          </div>

          {isSyncingAll && (
            <output
              className="bg-primary/5 border-primary/30 mb-4 flex items-center gap-3 rounded-lg border px-4 py-3"
              data-ocid="dashboard.refreshing_banner"
              aria-live="polite"
            >
              <Loader2 className="text-primary size-4 animate-spin" />
              <span className="text-foreground text-sm font-medium">
                Refreshing all neurons…
              </span>
              <span className="text-muted-foreground text-xs">
                Syncing with NNS governance and WTN positions
              </span>
            </output>
          )}

          {neuronsLoading || wtnLoading ? (
            <NeuronGridSkeleton />
          ) : isEmpty ? (
            <EmptyState onAdd={() => navigate({ to: "/add-neuron" })} />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {neurons?.map((neuron, i) => (
                <NeuronCard
                  key={neuron.id.toString()}
                  neuron={neuron}
                  index={i}
                  syncing={isSyncingAll}
                />
              ))}
              {wtnPositions?.map((position, i) => (
                <WtnCard
                  key={`wtn-${position.id.toString()}`}
                  position={position}
                  index={(neurons?.length ?? 0) + i}
                  syncing={isSyncingAll}
                />
              ))}
            </div>
          )}
        </section>

        {/* Portfolio-wide reward statistics + monthly breakdown */}
        <section className="mt-6" data-ocid="dashboard.reward_stats_section">
          <RewardStatsCard
            stats={rewardStats}
            loading={rewardStatsLoading}
            dataOcidPrefix="dashboard.reward_stats"
          />
          <MonthlyBreakdownSection
            monthly={rewardStats?.monthly ?? []}
            dataOcidPrefix="dashboard.monthly"
          />
        </section>
      </div>
    </div>
  );
}

type PriceQueryLike = ReturnType<typeof useIcpPrice>;

function PortfolioSummary({
  totalPortfolioValue,
  wtnStaked,
  totalCapitalContributed,
  nnsCapitalContributed,
  wtnCapitalContributed,
  totalMaturity,
  blendedApy,
  rewardsThisMonth,
  nnsRewardsThisMonth,
  wtnRewardsThisMonthFloat,
  totalRewards,
  nnsRewards,
  wtnRewards,
  totalDisbursed,
  average30dReward,
  average30dRewardLoading,
  loading,
}: {
  totalPortfolioValue: bigint | null;
  wtnStaked: bigint | null;
  totalCapitalContributed: bigint | null;
  nnsCapitalContributed: bigint | null;
  wtnCapitalContributed: bigint | null;
  totalMaturity: bigint | null;
  blendedApy: number | null;
  rewardsThisMonth: bigint | null;
  nnsRewardsThisMonth: bigint | null;
  wtnRewardsThisMonthFloat: number | null;
  totalRewards: bigint | null;
  nnsRewards: bigint | null;
  wtnRewards: bigint | null;
  totalDisbursed: bigint | null;
  average30dReward: bigint | null;
  average30dRewardLoading: boolean;
  loading: boolean;
}) {
  // WTN rewards-this-month comes from the backend as a float (ICP units,
  // not e8s) because WTN snapshots store ICP values as Float64. Convert it
  // to an e8s bigint so the sub-line uses the same formatIcpCompact path
  // as the NNS e8s figure.
  const wtnRewardsThisMonthE8s =
    wtnRewardsThisMonthFloat != null
      ? BigInt(Math.trunc(wtnRewardsThisMonthFloat * Number(E8S_PER_ICP)))
      : 0n;

  // Grouped into three rows of three, each row wrapped in its own bordered
  // section (see render below) rather than one flat responsive grid.
  const overviewRow = [
    {
      label: "Total Portfolio Value",
      value: formatIcp(totalPortfolioValue, 2),
      icon: Wallet,
      accent: "text-primary",
      hint: "NNS stake + maturity + nICP redeemable",
      subline: "Includes accrued rewards from NNS neurons and nICP positions",
    },
    {
      label: "Total Capital Contributed",
      value: formatIcp(totalCapitalContributed, 2),
      icon: Landmark,
      accent: "text-muted-foreground",
      hint: "Initial stakes + top-ups",
      subline: `${formatIcpCompact(nnsCapitalContributed ?? 0n)} (NNS) + ${formatIcpCompact(wtnCapitalContributed ?? 0n)} (nICP)`,
    },
    {
      label: "Total Rewards Earned",
      value: formatIcp(totalRewards, 2),
      icon: BrainCircuit,
      accent: "text-primary",
      hint: "Lifetime rewards",
      subline: `${formatIcpCompact(nnsRewards ?? 0n)} (NNS) + ${formatIcpCompact(wtnRewards ?? 0n)} (nICP)`,
    },
  ];

  const maturityRow = [
    {
      label: "Total Maturity",
      value: formatIcp(totalMaturity, 2),
      icon: Coins,
      accent: "text-accent",
      hint: "Withdrawable + staked",
      subline: null,
    },
    {
      label: "Total nICP Maturity",
      value: formatIcp((wtnStaked ?? 0n) - (wtnCapitalContributed ?? 0n), 2),
      icon: Droplets,
      accent: "text-accent",
      hint: "WTN accrued growth",
      subline: "nICP redeemable value minus capital contributed",
    },
    {
      label: "Total Withdrawn",
      value: formatIcp(totalDisbursed, 2),
      icon: Wallet,
      accent: "text-muted-foreground",
      hint: "Lifetime disbursed across NNS + nICP",
      subline: null,
    },
  ];

  const performanceRow = [
    {
      label: "Blended APY",
      value: formatApy(blendedApy),
      icon: TrendingUp,
      accent:
        blendedApy != null && blendedApy > 0
          ? "text-primary"
          : "text-muted-foreground",
      hint: blendedApy === 0 ? "Insufficient history" : null,
      subline: null,
    },
    {
      label: "Avg Daily Reward (30d)",
      value: average30dRewardLoading
        ? "…"
        : formatIcp(average30dReward ?? 0n, 4),
      icon: CalendarClock,
      accent: "text-primary",
      hint: "Trailing 30-day average, combined NNS + nICP",
      subline: null,
    },
    {
      label: "Earned This Month",
      value: formatIcp(rewardsThisMonth, 2),
      icon: Sparkles,
      accent: "text-primary",
      hint: "Combined NNS + nICP rewards",
      subline: `${formatIcpCompact(nnsRewardsThisMonth ?? 0n)} (NNS) + ${formatIcpCompact(wtnRewardsThisMonthE8s)} (nICP)`,
    },
  ];

  const rows = [overviewRow, maturityRow, performanceRow];

  return (
    <div className="space-y-4">
      {rows.map((row, rowIndex) => (
        <div
          key={`portfolio-summary-row-${rowIndex}`}
          className="border-border/60 rounded-xl border p-4"
          data-ocid={`dashboard.portfolio_summary.row_${rowIndex + 1}`}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {row.map((stat) => (
              <div key={stat.label} className="stat-card">
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                    {stat.label}
                  </p>
                  <stat.icon className={cn("size-4", stat.accent)} />
                </div>
                <div className="mt-3">
                  {loading ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    <p className="text-foreground font-mono text-2xl font-semibold tracking-tight">
                      {stat.value}
                    </p>
                  )}
                  {stat.subline && !loading && (
                    <p
                      className="value-pill mt-2"
                      data-ocid="dashboard.portfolio_summary.subline"
                    >
                      {stat.subline}
                    </p>
                  )}
                  {stat.hint && !loading && (
                    <p className="text-muted-foreground mt-1 font-mono text-xs">
                      {stat.hint}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PortfolioValuation({
  totalPortfolioValueE8s,
  priceQuery,
  onRefreshPrice,
  loading,
}: {
  totalPortfolioValueE8s: bigint | null;
  priceQuery: PriceQueryLike;
  onRefreshPrice: () => void;
  loading: boolean;
}) {
  const price = priceQuery.data ?? null;
  const priceLoading = priceQuery.isLoading;
  const priceStale = price?.cached === true;

  // Portfolio value in ICP = totalPortfolioValueE8s / E8S_PER_ICP.
  // totalPortfolioValueE8s is the backend's consistent apples-to-apples
  // total (NNS stake + NNS maturity + WTN redeemable value), so the
  // USD/PLN valuation reflects the complete portfolio value directly.
  const totalE8s = totalPortfolioValueE8s;
  const icpAmount =
    totalE8s != null
      ? Number(totalE8s / E8S_PER_ICP) +
        Number(totalE8s % E8S_PER_ICP) / Number(E8S_PER_ICP)
      : null;

  const usdValue =
    icpAmount != null && price?.usd != null ? icpAmount * price.usd : null;
  const plnValue =
    icpAmount != null && price?.pln != null ? icpAmount * price.pln : null;

  const showValueLoading = loading || priceLoading;

  return (
    <Card className="bg-card/60 border-border/60 overflow-hidden">
      <CardContent className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Portfolio value */}
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              Current Portfolio Value
            </p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {showValueLoading ? (
                <Skeleton className="h-9 w-40" />
              ) : (
                <span className="text-foreground font-mono text-3xl font-semibold tracking-tight">
                  {formatUsd(usdValue)}
                </span>
              )}
              {!showValueLoading && (
                <span className="value-pill" data-ocid="dashboard.value.pln">
                  {formatPln(plnValue)}
                </span>
              )}
            </div>
            <p className="text-muted-foreground mt-1.5 font-mono text-xs">
              {icpAmount != null ? `${formatIcpCompact(totalE8s)} total` : "—"}
            </p>
          </div>

          {/* Price badge + refresh */}
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  priceStale ? "price-stale" : "price-badge",
                  priceLoading && "opacity-60",
                )}
                data-ocid="dashboard.price_badge"
                title={
                  price?.timestamp != null
                    ? `Last updated ${formatTimestampDateTime(price.timestamp)}`
                    : undefined
                }
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    priceStale ? "bg-warning" : "bg-success",
                  )}
                  style={{ backgroundColor: "currentColor" }}
                />
                {priceLoading
                  ? "Loading price…"
                  : price
                    ? `ICP ${formatUsd(price.usd)} · ${formatPln(price.pln)}`
                    : "Price unavailable"}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={onRefreshPrice}
                disabled={priceQuery.isFetching}
                data-ocid="dashboard.refresh_price"
                aria-label="Refresh ICP price"
              >
                <RefreshCw
                  className={
                    priceQuery.isFetching ? "size-4 animate-spin" : "size-4"
                  }
                />
                <span className="sr-only">Refresh price</span>
              </Button>
            </div>
            {price?.timestamp != null && !priceLoading && (
              <p className="text-muted-foreground font-mono text-[11px]">
                Updated {formatTimestampDateTime(price.timestamp)}
                {priceStale ? " · cached" : ""}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NeuronCard({
  neuron,
  index,
  syncing,
}: {
  neuron: Neuron;
  index: number;
  syncing?: boolean;
}) {
  const idStr = neuron.id.toString();
  const { data: stats } = useNeuronStats(idStr);
  const { data: syncStatus } = useSyncStatus(idStr);
  const { data: syncError } = useSyncError(
    syncStatus === ("failed" as SyncStatus) ? idStr : null,
  );

  // Total value = current stake + accrued maturity (apples-to-apples with
  // WTN redeemable). Principal = staked amount. Rewards = current live
  // maturity (unstakedMaturityE8s + stakedMaturityE8s from the latest
  // sync snapshot), matching the neuron detail page's "Maturity" field.
  // % return comes from getNeuronStats (percentageReturn, pre-scaled).
  // Withdrawn = lifetime total disbursed from this neuron.
  const stakedE8s = neuron.stakedE8s ?? 0n;
  const maturityE8s = stats?.currentMaturityE8s ?? 0n;
  const totalValueE8s = stakedE8s + maturityE8s;
  const withdrawnE8s = stats?.totalDisbursedE8s ?? 0n;
  const percentReturn = stats?.percentageReturn ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06 }}
    >
      <Link
        to="/neuron-detail/$neuronId"
        params={{ neuronId: idStr }}
        data-ocid={`dashboard.neuron.item.${index + 1}`}
      >
        <Card className="bg-card/60 border-border/60 transition-smooth hover:border-primary/40 hover:shadow-elevated relative h-full">
          {syncing && (
            <output
              className="bg-primary/5 border-primary/30 absolute inset-0 z-10 flex items-center justify-center rounded-xl backdrop-blur-[1px]"
              data-ocid={`dashboard.neuron.syncing.${index + 1}`}
              aria-live="polite"
            >
              <div className="bg-card/90 border-border/60 flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-sm">
                <Loader2 className="text-primary size-3.5 animate-spin" />
                <span className="text-foreground text-xs font-medium">
                  Syncing…
                </span>
              </div>
            </output>
          )}
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <BrainCircuit className="size-4.5" />
                </span>
                <div className="min-w-0">
                  <CardTitle className="font-mono text-sm font-semibold truncate">
                    {neuron.name || shortenNeuronId(neuron.id)}
                  </CardTitle>
                  <p className="text-muted-foreground font-mono text-[11px] truncate">
                    {shortenPrincipal(neuron.ownerId.toString(), 8)}
                  </p>
                </div>
              </div>
              <SyncStatusBadge
                status={syncStatus ?? null}
                errorReason={syncError ?? null}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-muted-foreground text-[11px] tracking-wider uppercase">
                Total Value
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-foreground font-mono text-xl font-semibold">
                  {formatIcpCompact(totalValueE8s)}
                </span>
                <span
                  className={cn(
                    "font-mono text-xs",
                    percentReturn >= 0 ? "text-primary" : "text-destructive",
                  )}
                >
                  {formatPercent(percentReturn)}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-muted-foreground text-[11px] tracking-wider uppercase">
                  Principal
                </p>
                <p className="text-foreground font-mono text-sm font-medium">
                  {formatIcpCompact(stakedE8s)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[11px] tracking-wider uppercase">
                  Rewards
                </p>
                <p className="text-foreground font-mono text-sm font-medium">
                  {formatIcpCompact(maturityE8s)}
                </p>
              </div>
            </div>
            <div className="border-border/40 border-t pt-2.5">
              <p className="text-muted-foreground text-[11px] tracking-wider uppercase">
                Start date
              </p>
              <p className="text-foreground font-mono text-xs">
                {formatTimestamp(neuron.startDate)}
              </p>
            </div>
            <div className="border-border/40 border-t pt-2.5">
              <p className="text-muted-foreground text-[11px] tracking-wider uppercase">
                Withdrawn
              </p>
              <p className="text-muted-foreground font-mono text-xs">
                {formatIcpCompact(withdrawnE8s)} ICP
              </p>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}

function WtnCard({
  position,
  index,
  syncing,
}: {
  position: WtnPosition;
  index: number;
  syncing?: boolean;
}) {
  const idStr = position.id.toString();
  const { data: stats } = useWtnStats(idStr);

  // WTN stats fields are in ICP float units, NOT e8s — convert via
  // BigInt(Math.trunc(x * Number(E8S_PER_ICP))) before formatIcpCompact.
  // Total Value = redeemable (already includes growth). Principal = cost
  // basis (totalCapitalContributed). Rewards = totalEarned (organic growth).
  const redeemableE8s = BigInt(
    Math.trunc((stats?.redeemableIcpValue ?? 0) * Number(E8S_PER_ICP)),
  );
  const principalE8s = BigInt(
    Math.trunc((stats?.totalCapitalContributed ?? 0) * Number(E8S_PER_ICP)),
  );
  const rewardsE8s = BigInt(
    Math.trunc((stats?.totalEarned ?? 0) * Number(E8S_PER_ICP)),
  );
  const percentReturn = stats?.percentReturn ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06 }}
    >
      <Link
        to="/wtn-detail/$positionId"
        params={{ positionId: idStr }}
        data-ocid={`dashboard.wtn.item.${index + 1}`}
      >
        <Card className="bg-card/60 border-border/60 transition-smooth hover:border-accent/40 hover:shadow-elevated relative h-full">
          {syncing && (
            <output
              className="bg-accent/5 border-accent/30 absolute inset-0 z-10 flex items-center justify-center rounded-xl backdrop-blur-[1px]"
              data-ocid={`dashboard.wtn.syncing.${index + 1}`}
              aria-live="polite"
            >
              <div className="bg-card/90 border-border/60 flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-sm">
                <Loader2 className="text-accent size-3.5 animate-spin" />
                <span className="text-foreground text-xs font-medium">
                  Syncing…
                </span>
              </div>
            </output>
          )}
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="bg-accent/15 text-accent flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <Droplets className="size-4.5" />
                </span>
                <div className="min-w-0">
                  <CardTitle className="font-mono text-sm font-semibold truncate">
                    {position.name || `WTN #${idStr}`}
                  </CardTitle>
                  <p className="text-muted-foreground font-mono text-[11px] truncate">
                    {shortenPrincipal(position.ownerId.toString(), 8)}
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className="border-accent/40 bg-accent/10 text-accent text-[10px]"
                data-ocid={`dashboard.wtn.badge.${index + 1}`}
              >
                WTN
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-muted-foreground text-[11px] tracking-wider uppercase">
                Total Value
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-foreground font-mono text-xl font-semibold">
                  {formatIcpCompact(redeemableE8s)}
                </span>
                <span
                  className={cn(
                    "font-mono text-xs",
                    percentReturn >= 0 ? "text-primary" : "text-destructive",
                  )}
                >
                  {formatPercent(percentReturn)}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-muted-foreground text-[11px] tracking-wider uppercase">
                  Principal
                </p>
                <p className="text-foreground font-mono text-sm font-medium">
                  {formatIcpCompact(principalE8s)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[11px] tracking-wider uppercase">
                  Rewards
                </p>
                <p className="text-foreground font-mono text-sm font-medium">
                  {formatIcpCompact(rewardsE8s)}
                </p>
              </div>
            </div>
            <div className="border-border/40 border-t pt-2.5">
              <p className="text-muted-foreground text-[11px] tracking-wider uppercase">
                Start date
              </p>
              <p className="text-foreground font-mono text-xs">
                {formatTimestamp(position.startDate)}
              </p>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}

function SyncStatusBadge({
  status,
  errorReason,
}: {
  status: SyncStatus | null;
  errorReason?: string | null;
}) {
  if (status === ("failed" as SyncStatus)) {
    const label = errorReason ? `Sync failed: ${errorReason}` : "Sync failed";
    return (
      <Badge
        variant="outline"
        className="border-destructive/40 bg-destructive/10 text-destructive gap-1 text-[10px] max-w-[180px] truncate"
        data-ocid="dashboard.neuron.status.failed"
        title={label}
      >
        <span className="bg-destructive size-1.5 rounded-full" />
        <span className="truncate">{label}</span>
      </Badge>
    );
  }
  if (status === ("hotkeyRequired" as SyncStatus)) {
    return (
      <Badge
        variant="outline"
        className="border-accent/40 bg-accent/10 text-accent gap-1 text-[10px]"
        data-ocid="dashboard.neuron.status.hotkey_required"
      >
        <span className="bg-accent size-1.5 rounded-full" />
        Hotkey required
      </Badge>
    );
  }
  if (status === ("synced" as SyncStatus)) {
    return (
      <Badge
        variant="outline"
        className="border-primary/30 bg-primary/5 text-primary gap-1 text-[10px]"
        data-ocid="dashboard.neuron.status.synced"
      >
        <span className="bg-primary size-1.5 rounded-full" />
        Synced
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-border bg-muted text-muted-foreground gap-1 text-[10px]"
      data-ocid="dashboard.neuron.status.pending"
    >
      <span className="bg-muted-foreground size-1.5 rounded-full" />
      Pending
    </Badge>
  );
}

function NeuronGridSkeleton() {
  const cards = [0, 1, 2];
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((n) => (
        <Card key={`skeleton-card-${n}`} className="bg-card/60">
          <CardHeader>
            <Skeleton className="h-10 w-full" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      className="bg-muted/30 border-border/60 flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center"
      data-ocid="dashboard.empty_state"
    >
      <span className="bg-primary/10 text-primary mb-4 flex size-14 items-center justify-center rounded-2xl">
        <BrainCircuit className="size-7" />
      </span>
      <h3 className="text-foreground font-display text-lg font-semibold">
        No neurons tracked yet
      </h3>
      <p className="text-muted-foreground mt-2 max-w-sm text-sm">
        Add your first NNS neuron to start tracking staked ICP, maturity growth,
        and governance reward events.
      </p>
      <Button
        onClick={onAdd}
        className="mt-6"
        data-ocid="dashboard.empty_state.add_neuron"
      >
        <Plus className="size-4" />
        Add your first neuron
      </Button>
    </div>
  );
}
