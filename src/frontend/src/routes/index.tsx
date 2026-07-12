/**
 * Dashboard page — portfolio summary + neuron cards grid.
 *
 * Shows:
 *   - Portfolio summary panel (4 enriched stat cards: Total Staked, Total
 *     Maturity, Blended APY, ICP Earned This Month) using .stat-card utility
 *   - Current portfolio value in USD + PLN (computed from
 *     (totalStakedE8s + totalMaturityE8s) * currentPrice / E8S_PER_ICP)
 *     with .value-pill utility
 *   - Current ICP price badge (.price-badge / .price-stale when cached)
 *     with last-updated timestamp + a refresh-price button
 *   - Neuron cards grid (name, current maturity, % return, sync status)
 *   - Refresh All button + Export CSV button + Add Neuron button
 *   - Empty state when no neurons are tracked
 *
 * The Export CSV button fetches every tracked neuron's DailyReward history
 * in parallel and downloads a single combined CSV (with a neuronId column)
 * via rewardsToCombinedCsv + downloadCsv from lib/csv.ts. The CSV logic is
 * owned by this dashboard and is NOT modified by the price-enrichment task.
 *
 * Portfolio stats come from getPortfolioStats (real PortfolioStats:
 * totalStakedE8s, totalRewardsE8s, percentageReturn, neuronCount,
 * blendedApy, totalMaturityE8s, totalRewardsThisMonthE8s). Per-neuron
 * maturity / % return come from getNeuronStats, and sync status from
 * getSyncStatus. Current ICP price comes from getCurrentIcpPrice via
 * useIcpPrice().
 */

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
import { useIcpPrice } from "@/hooks/use-prices";
import { useSyncStatus } from "@/hooks/use-rewards";
import { useNeuronStats, usePortfolioStats } from "@/hooks/use-stats";
import { useSyncAllNeurons, useSyncError } from "@/hooks/use-sync";
import { useBackendActor } from "@/lib/backend-actor";
import type { DailyReward, Neuron, SyncStatus } from "@/lib/backend-actor";
import { type PriceMap, downloadCsv, rewardsToCombinedCsv } from "@/lib/csv";
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
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  BrainCircuit,
  Coins,
  Download,
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
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolioStats();
  const priceQuery = useIcpPrice();
  const syncAll = useSyncAllNeurons();
  const { actor } = useBackendActor();
  const navigate = useNavigate();
  const [isExporting, setIsExporting] = useState(false);

  const isEmpty = !neuronsLoading && (neurons?.length ?? 0) === 0;

  const handleSyncAll = () => {
    syncAll.mutate(undefined, {
      onSuccess: (results) => {
        const failed = results.filter(
          (r) => r.status === ("failed" as SyncStatus),
        );
        const needsHotkey = results.some(
          (r) => r.status === ("hotkeyRequired" as SyncStatus),
        );
        if (failed.length > 0) {
          toast.error(
            `${failed.length} neuron${failed.length === 1 ? "" : "s"} failed to sync`,
          );
        } else if (needsHotkey) {
          toast.warning("Synced — some neurons need a hotkey to fully sync");
        } else {
          toast.success("Synced all neurons with NNS governance");
        }
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleRefreshPrice = () => {
    priceQuery.refetch();
  };

  const handleExportCsv = async () => {
    if (!actor || !neurons || neurons.length === 0) return;
    setIsExporting(true);
    try {
      const groups = await Promise.all(
        neurons.map(async (neuron) => {
          const rewards: DailyReward[] = await actor.getRewardHistory(
            neuron.id,
          );
          return { neuronId: neuron.id, rewards };
        }),
      );
      const nonEmpty = groups.filter((g) => g.rewards.length > 0);
      if (nonEmpty.length === 0) {
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
      const priceMap: PriceMap = new Map();
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
      const csv = rewardsToCombinedCsv(groups, priceMap);
      downloadCsv("neuron-rewards-export.csv", csv);
      toast.success(
        `Exported ${nonEmpty.length} neuron${nonEmpty.length === 1 ? "" : "s"} to CSV`,
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
            <Button
              variant="outline"
              onClick={handleSyncAll}
              disabled={syncAll.isPending || isEmpty}
              data-ocid="dashboard.refresh_all"
            >
              <RefreshCw
                className={syncAll.isPending ? "size-4 animate-spin" : "size-4"}
              />
              Refresh All
            </Button>
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
                    ? "Add a neuron before exporting"
                    : "Download all neurons' reward histories as one CSV"}
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
          </div>
        </div>

        {/* Portfolio summary panel */}
        <section className="mt-8" data-ocid="dashboard.portfolio_summary">
          <PortfolioSummary
            totalStaked={portfolio?.totalStakedE8s ?? null}
            totalMaturity={portfolio?.totalMaturityE8s ?? null}
            blendedApy={portfolio?.blendedApy ?? null}
            rewardsThisMonth={portfolio?.totalRewardsThisMonthE8s ?? null}
            neuronCount={portfolio?.neuronCount ?? null}
            loading={portfolioLoading}
          />
        </section>

        {/* Portfolio valuation (USD + PLN) with current price badge */}
        <section className="mt-6" data-ocid="dashboard.portfolio_value">
          <PortfolioValuation
            totalStakedE8s={portfolio?.totalStakedE8s ?? null}
            totalMaturityE8s={portfolio?.totalMaturityE8s ?? null}
            priceQuery={priceQuery}
            onRefreshPrice={handleRefreshPrice}
            loading={portfolioLoading}
          />
        </section>

        {/* Neuron cards grid */}
        <section className="mt-10">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-foreground font-display text-lg font-semibold tracking-tight">
              Neurons
            </h2>
            <Badge variant="secondary" className="font-mono">
              {neurons?.length ?? 0}
            </Badge>
          </div>

          {neuronsLoading ? (
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
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

type PriceQueryLike = ReturnType<typeof useIcpPrice>;

function PortfolioSummary({
  totalStaked,
  totalMaturity,
  blendedApy,
  rewardsThisMonth,
  neuronCount,
  loading,
}: {
  totalStaked: bigint | null;
  totalMaturity: bigint | null;
  blendedApy: number | null;
  rewardsThisMonth: bigint | null;
  neuronCount: bigint | null;
  loading: boolean;
}) {
  const stats = [
    {
      label: "Total Staked",
      value: formatIcp(totalStaked, 2),
      icon: Wallet,
      accent: "text-primary",
      hint:
        !loading && neuronCount != null
          ? `${neuronCount.toString()} neuron${neuronCount === 1n ? "" : "s"}`
          : null,
    },
    {
      label: "Total Maturity",
      value: formatIcp(totalMaturity, 2),
      icon: Coins,
      accent: "text-accent",
      hint: "Withdrawable + staked",
    },
    {
      label: "Blended APY",
      value: formatApy(blendedApy),
      icon: TrendingUp,
      accent:
        blendedApy != null && blendedApy > 0
          ? "text-primary"
          : "text-muted-foreground",
      hint: blendedApy === 0 ? "Insufficient history" : null,
    },
    {
      label: "Earned This Month",
      value: formatIcp(rewardsThisMonth, 2),
      icon: Sparkles,
      accent: "text-primary",
      hint: "ICP rewards this month",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
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
            {stat.hint && !loading && (
              <p className="text-muted-foreground mt-1 font-mono text-xs">
                {stat.hint}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PortfolioValuation({
  totalStakedE8s,
  totalMaturityE8s,
  priceQuery,
  onRefreshPrice,
  loading,
}: {
  totalStakedE8s: bigint | null;
  totalMaturityE8s: bigint | null;
  priceQuery: PriceQueryLike;
  onRefreshPrice: () => void;
  loading: boolean;
}) {
  const price = priceQuery.data ?? null;
  const priceLoading = priceQuery.isLoading;
  const priceStale = price?.cached === true;

  // Portfolio value in ICP = (staked + maturity) / E8S_PER_ICP
  const totalE8s =
    totalStakedE8s != null && totalMaturityE8s != null
      ? totalStakedE8s + totalMaturityE8s
      : null;
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

function NeuronCard({ neuron, index }: { neuron: Neuron; index: number }) {
  const idStr = neuron.id.toString();
  const { data: stats } = useNeuronStats(idStr);
  const { data: syncStatus } = useSyncStatus(idStr);
  const { data: syncError } = useSyncError(
    syncStatus === ("failed" as SyncStatus) ? idStr : null,
  );

  // Current maturity and % return come from getNeuronStats, not the Neuron record.
  const maturityE8s = stats?.totalRewardsE8s ?? 0n;
  const maturityPercent = stats?.percentageReturn ?? 0;

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
        <Card className="bg-card/60 border-border/60 transition-smooth hover:border-primary/40 hover:shadow-elevated h-full">
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
                Maturity
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-foreground font-mono text-xl font-semibold">
                  {formatIcpCompact(maturityE8s)}
                </span>
                <span
                  className={cn(
                    "font-mono text-xs",
                    maturityPercent >= 0 ? "text-primary" : "text-destructive",
                  )}
                >
                  {formatPercent(maturityPercent)}
                </span>
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
