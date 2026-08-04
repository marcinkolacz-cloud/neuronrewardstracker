/**
 * Neuron detail page — maturity chart, activity feed, snapshot entry, edit/delete.
 *
 * The backend has no getNeuronDetail endpoint, so this page composes three
 * queries:
 *   - listMyNeurons (filtered by id) → the Neuron record
 *   - getRewardHistory              → DailyReward[] (chart + activity feed)
 *   - getSyncStatus                 → SyncStatus badge
 *   - getNeuronStats                → NeuronStats card
 *
 * Layout:
 *   - Neuron metadata header (id, owner, staked, maturity, sync status)
 *   - recharts AreaChart of maturity growth over time (from DailyReward)
 *   - Rewards summary (total earned vs total disbursed)
 *   - Activity feed timeline (DailyReward events, scrollable + load more)
 *   - Sync now button
 *   - Manual snapshot entry form (recordSnapshot(neuronId, unstakedMaturityE8s, stakedMaturityE8s, autoStakeMaturity))
 *   - Edit (updateNeuron) and delete (removeNeuron) actions
 *   - Per-snapshot edit (editSnapshot) and delete (deleteSnapshot) actions
 */

import { EventType } from "@/backend";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useRemoveNeuron, useUpdateNeuron } from "@/hooks/use-neurons";
import { useNeurons } from "@/hooks/use-neurons";
import { useHistoricalPrices, useIcpPrice } from "@/hooks/use-prices";
import {
  useDeleteSnapshot,
  useEditSnapshot,
  useRewardHistory,
  useSyncStatus,
} from "@/hooks/use-rewards";
import { useNeuronStats } from "@/hooks/use-stats";
import {
  useImportHistoricalData,
  useRecordSnapshot,
  useSyncError,
  useSyncNeuron,
} from "@/hooks/use-sync";
import type {
  DailyReward,
  HistoricalEntry,
  MonthlyBreakdown,
  Neuron,
  PriceSnapshot,
  SyncStatus,
} from "@/lib/backend-actor";
import { type PriceMap, downloadCsv, rewardsToCsv } from "@/lib/csv";
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
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  BarChart3,
  BrainCircuit,
  Calendar,
  ChevronDown,
  ClipboardPaste,
  DollarSign,
  Loader2,
  Pencil,
  PlusCircle,
  RefreshCw,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  Wallet,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

/** Number of activity entries shown initially and per "Load more" click. */
const ACTIVITY_PAGE_SIZE = 25;
/** Max height of the scrollable activity feed container. */
const ACTIVITY_MAX_HEIGHT = "max-h-[400px]";

/**
 * Convert a bigint nanosecond timestamp into a `YYYY-MM-DD` date string.
 * This format is the cache key expected by the backend's
 * getHistoricalIcpPrice (which internally reorders to `DD-MM-YYYY` for the
 * CoinGecko API) and matches csv.ts dateKeyFromTimestamp. Uses UTC so the
 * same instant always maps to the same date key regardless of the viewer's
 * timezone.
 */
function nsToDateKey(ns: bigint): string {
  const ms = Number(ns / 1_000_000n);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Format a (year, month) pair as "Mon YYYY" for chart/table labels. */
function formatMonthLabel(year: bigint, month: bigint): string {
  const y = Number(year);
  const m = Number(month); // 1-12
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return "—";
  }
  const date = new Date(Date.UTC(y, m - 1, 1));
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Convert e8s to an ICP number (for chart values). */
function e8sToIcpNumber(e8s: bigint): number {
  return Number(e8s) / Number(E8S_PER_ICP);
}

export function NeuronDetailPage() {
  const { neuronId } = useParams({ from: "/neuron-detail/$neuronId" });
  const queryClient = useQueryClient();
  const { data: neurons, isLoading: neuronsLoading } = useNeurons();
  const { data: rewards, isLoading: rewardsLoading } =
    useRewardHistory(neuronId);
  const { data: stats } = useNeuronStats(neuronId);
  const { data: syncStatus } = useSyncStatus(neuronId);
  const isFailed = syncStatus === ("failed" as SyncStatus);
  const { data: syncError } = useSyncError(isFailed ? neuronId : null);
  const syncNeuron = useSyncNeuron();
  const removeNeuron = useRemoveNeuron();
  const updateNeuron = useUpdateNeuron();
  const recordSnapshot = useRecordSnapshot();
  const importHistorical = useImportHistoricalData();
  const editSnapshot = useEditSnapshot();
  const deleteSnapshot = useDeleteSnapshot();
  const navigate = useNavigate();

  // Live ICP price (USD + PLN). Refetches on mount; no auto-polling.
  const icpPriceQuery = useIcpPrice();
  const icpPrice = icpPriceQuery.data ?? null;
  const priceRefreshing = icpPriceQuery.isFetching;

  const handleRefreshPrice = () => {
    void queryClient.invalidateQueries({ queryKey: ["icp-price", "current"] });
  };

  const neuron = useMemo(() => {
    if (!neurons) return undefined;
    const id = BigInt(neuronId);
    return neurons.find((n) => n.id === id);
  }, [neurons, neuronId]);

  const loading = neuronsLoading;

  const handleSync = () => {
    syncNeuron.mutate(BigInt(neuronId), {
      onSuccess: (res) => {
        if (res.status === ("failed" as SyncStatus)) {
          const reason = res.lastSyncError ?? "Unknown error";
          toast.error(`Sync failed: ${reason}`);
        } else if (res.status === ("hotkeyRequired" as SyncStatus)) {
          toast.warning("Sync needs a hotkey to fully complete");
        } else {
          toast.success("Synced with NNS governance");
        }
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleDelete = () => {
    removeNeuron.mutate(BigInt(neuronId), {
      onSuccess: () => {
        toast.success("Neuron removed from tracking");
        navigate({ to: "/" });
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleEdit = () => {
    if (!neuron) return;
    const name = window.prompt("Neuron name", neuron.name);
    if (name == null) return; // cancelled
    updateNeuron.mutate(
      { ...neuron, name },
      {
        onSuccess: () => toast.success("Neuron updated"),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleExportCsv = () => {
    if (!rewards || rewards.length === 0) {
      toast.error("No reward history to export");
      return;
    }
    // Build a PriceMap (YYYY-MM-DD -> {usd, pln}) from the already-fetched
    // summaryPrices so the CSV's USD/PLN columns are populated. summaryPrices
    // is keyed by the same YYYY-MM-DD date keys nsToDateKey produces.
    const priceMap: PriceMap | undefined = summaryPrices
      ? new Map(
          [...summaryPrices.entries()].map(([date, snap]) => [
            date,
            { usd: snap.usd, pln: snap.pln },
          ]),
        )
      : undefined;
    const csv = rewardsToCsv(rewards, priceMap);
    const safeId = neuronId.replace(/[^a-zA-Z0-9_-]/g, "_");
    downloadCsv(`neuron-${safeId}-rewards.csv`, csv);
    toast.success("CSV downloaded");
  };

  // Hooks must run unconditionally before any early return. Compute the
  // reward-derived data and historical price query up front so React's
  // Rules of Hooks are satisfied even when the neuron is loading/missing.
  const sortedRewards = useMemo(
    () =>
      [...(rewards ?? [])].sort((a, b) => Number(a.timestamp - b.timestamp)),
    [rewards],
  );

  // Historical price fetch for the RewardsSummaryCard (all-time rewards value).
  // We fetch prices for every distinct reward date so the summary can show
  // the total USD + PLN value of all positive-delta rewards. Dates are
  // deduplicated to keep the request batch small.
  const summaryDateKeys = useMemo(() => {
    const set = new Set<string>();
    for (const r of sortedRewards) {
      if (r.deltaE8s > 0n) {
        const key = nsToDateKey(r.timestamp);
        if (key) set.add(key);
      }
    }
    return [...set];
  }, [sortedRewards]);
  const summaryPricesQuery = useHistoricalPrices(summaryDateKeys);
  const summaryPrices = summaryPricesQuery.data ?? null;

  if (loading) {
    return <DetailSkeleton />;
  }

  if (!neuron) {
    return (
      <div className="bg-background mx-auto max-w-2xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <h1 className="text-foreground font-display text-xl font-semibold">
          Neuron not found
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          This neuron may have been removed or never tracked.
        </p>
        <Button
          onClick={() => navigate({ to: "/" })}
          className="mt-6"
          data-ocid="neuron_detail.not_found.back"
        >
          Back to dashboard
        </Button>
      </div>
    );
  }

  // Current maturity = last reward snapshot's combined maturity (unstaked + staked).
  const lastReward = sortedRewards[sortedRewards.length - 1];
  const unstakedE8s = lastReward?.unstakedMaturityE8s ?? 0n;
  const stakedE8s = lastReward?.stakedMaturityE8s ?? 0n;
  const maturityE8s = unstakedE8s + stakedE8s;
  const autoStakeMaturity = lastReward?.autoStakeMaturity ?? false;
  // Prefer overallReturnPct (the corrected return field) for the header
  // return badge; fall back to percentageReturn for older backend responses.
  const maturityPercent =
    stats?.overallReturnPct ?? stats?.percentageReturn ?? 0;

  const chartData = sortedRewards.map((p) => {
    const combined = p.unstakedMaturityE8s + p.stakedMaturityE8s;
    return {
      date: formatTimestamp(p.timestamp),
      maturity: Number(combined) / 1e8,
      staked: Number(p.stakedMaturityE8s) / 1e8,
      raw: combined,
    };
  });

  return (
    <div className="bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-48 opacity-30"
        style={{
          background:
            "radial-gradient(50% 60% at 50% 0%, oklch(var(--primary) / 0.10) 0%, oklch(var(--background) / 0) 70%)",
        }}
      />
      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back link */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/" })}
          className="text-muted-foreground mb-6"
          data-ocid="neuron_detail.back"
        >
          <ArrowLeft className="size-4" />
          Back to dashboard
        </Button>

        {/* Metadata header */}
        <NeuronHeader
          neuron={neuron}
          maturityE8s={maturityE8s}
          unstakedE8s={unstakedE8s}
          stakedE8s={stakedE8s}
          autoStakeMaturity={autoStakeMaturity}
          maturityPercent={maturityPercent}
          syncStatus={syncStatus ?? null}
          errorReason={syncError ?? null}
          onSync={handleSync}
          syncing={syncNeuron.isPending}
          onEdit={handleEdit}
          editing={updateNeuron.isPending}
          onDelete={handleDelete}
          deleting={removeNeuron.isPending}
          onExportCsv={handleExportCsv}
          exportDisabled={!rewards || rewards.length === 0}
          icpPrice={icpPrice}
          priceRefreshing={priceRefreshing}
          onRefreshPrice={handleRefreshPrice}
        />

        {/* Sync failure callout */}
        {isFailed && (
          <div
            role="alert"
            className="border-destructive/40 bg-destructive/10 mt-4 flex items-start gap-3 rounded-xl border p-4"
            data-ocid="neuron_detail.sync_error_callout"
          >
            <AlertTriangle className="text-destructive mt-0.5 size-5 shrink-0" />
            <div className="min-w-0">
              <p className="text-destructive text-sm font-semibold">
                Sync failed
              </p>
              <p className="text-destructive/90 mt-0.5 break-words text-sm">
                {syncError ?? "Sync failed for an unknown reason"}
              </p>
            </div>
          </div>
        )}

        {/* Rewards summary (earned vs disbursed) */}
        <div className="mt-6">
          <RewardsSummaryCard
            rewards={sortedRewards}
            loading={rewardsLoading}
            summaryPrices={summaryPrices}
            summaryPricesLoading={summaryPricesQuery.isFetching}
          />
        </div>

        {/* Chart + Activity feed */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <MaturityChart data={chartData} />
          </div>
          <div className="lg:col-span-2">
            <ActivityFeed
              rewards={sortedRewards}
              loading={rewardsLoading}
              onEditSnapshot={(timestamp, newTimestamp, newMaturityE8s) =>
                editSnapshot.mutate(
                  {
                    neuronId: BigInt(neuronId),
                    timestamp,
                    newTimestamp,
                    newMaturityE8s,
                  },
                  {
                    onSuccess: () => toast.success("Snapshot updated"),
                    onError: (err) => toast.error(err.message),
                  },
                )
              }
              onDeleteSnapshot={(timestamp) =>
                deleteSnapshot.mutate(
                  { neuronId: BigInt(neuronId), timestamp },
                  {
                    onSuccess: () => toast.success("Snapshot deleted"),
                    onError: (err) => toast.error(err.message),
                  },
                )
              }
              editingSnapshot={editSnapshot.isPending}
              deletingSnapshot={deleteSnapshot.isPending}
            />
          </div>
        </div>

        {/* Stats + Snapshot entry */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <NeuronStatsCard stats={stats} />
          <SnapshotEntryForm
            onSubmit={(unstaked, staked, autoStake, timestamp) => {
              recordSnapshot.mutate(
                {
                  neuronId: BigInt(neuronId),
                  unstakedMaturityE8s: unstaked,
                  stakedMaturityE8s: staked,
                  autoStakeMaturity: autoStake,
                  timestamp,
                },
                {
                  onSuccess: (data) => {
                    window.alert("SUCCESS: " + JSON.stringify(data, (_k, v) => typeof v === "bigint" ? v.toString() : v));
                    toast.success("Snapshot recorded");
                  },
                  onError: (err) => {
                    window.alert("ERROR: " + (err instanceof Error ? err.message : String(err)));
                    toast.error(err instanceof Error ? err.message : "Failed to record snapshot");
                  },
                },
              );
            }}
            submitting={recordSnapshot.isPending}
          />
        </div>

        {/* Monthly breakdown (table + bar chart) */}
        <MonthlyBreakdownSection monthly={stats?.monthly ?? []} />

        {/* Import historical maturity readings */}
        <ImportHistoricalPanel
          neuronId={BigInt(neuronId)}
          onImport={importHistorical}
        />
      </div>
    </div>
  );
}

function NeuronHeader({
  neuron,
  maturityE8s,
  unstakedE8s,
  stakedE8s,
  autoStakeMaturity,
  maturityPercent,
  syncStatus,
  errorReason,
  onSync,
  syncing,
  onEdit,
  editing,
  onDelete,
  deleting,
  onExportCsv,
  exportDisabled,
  icpPrice,
  priceRefreshing,
  onRefreshPrice,
}: {
  neuron: Neuron;
  maturityE8s: bigint;
  unstakedE8s: bigint;
  stakedE8s: bigint;
  autoStakeMaturity: boolean;
  maturityPercent: number;
  syncStatus: SyncStatus | null;
  errorReason?: string | null;
  onSync: () => void;
  syncing: boolean;
  onEdit: () => void;
  editing: boolean;
  onDelete: () => void;
  deleting: boolean;
  onExportCsv: () => void;
  exportDisabled: boolean;
  icpPrice: PriceSnapshot | null;
  priceRefreshing: boolean;
  onRefreshPrice: () => void;
}) {
  // Live price badge: show USD + PLN. Treat cached values older than the
  // 10-minute backend TTL as stale (warning style).
  const priceUsd = icpPrice?.usd ?? null;
  const pricePln = icpPrice?.pln ?? null;
  const priceHasValue =
    priceUsd != null && !Number.isNaN(priceUsd) && priceUsd > 0;
  const priceAgeMs = icpPrice?.timestamp
    ? Date.now() - Number(icpPrice.timestamp / 1_000_000n)
    : null;
  const isStale = priceAgeMs != null && priceAgeMs > 10 * 60 * 1000;

  // Withdrawable maturity value in USD + PLN at the current ICP price.
  const withdrawableIcp = e8sToIcpNumber(unstakedE8s);
  const withdrawableUsd =
    priceUsd != null && !Number.isNaN(priceUsd) && priceUsd > 0
      ? withdrawableIcp * priceUsd
      : null;
  const withdrawablePln =
    pricePln != null && !Number.isNaN(pricePln) && pricePln > 0
      ? withdrawableIcp * pricePln
      : null;

  return (
    <Card className="bg-card/60 border-border/60">
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="bg-gradient-primary flex size-12 shrink-0 items-center justify-center rounded-xl shadow-md">
              <BrainCircuit className="size-6 text-primary-foreground" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-foreground font-display text-xl font-semibold tracking-tight">
                  {neuron.name || `Neuron ${shortenNeuronId(neuron.id)}`}
                </h1>
                <SyncStatusBadge
                  status={syncStatus}
                  errorReason={errorReason}
                />
                {priceHasValue && (
                  <span
                    className={cn("price-badge", isStale && "price-stale")}
                    title={
                      icpPrice?.timestamp
                        ? `Last updated ${formatTimestampDateTime(icpPrice.timestamp)}`
                        : "ICP spot price"
                    }
                    data-ocid="neuron_detail.header.price_badge"
                  >
                    <DollarSign className="size-3" />
                    {formatUsd(priceUsd)}
                    <span className="opacity-60">·</span>
                    {formatPln(pricePln)}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground font-mono text-xs mt-0.5">
                Owner {shortenPrincipal(neuron.ownerId.toString(), 8)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefreshPrice}
              disabled={priceRefreshing}
              aria-label="Refresh ICP price"
              data-ocid="neuron_detail.refresh_price"
            >
              <RefreshCw
                className={priceRefreshing ? "size-4 animate-spin" : "size-4"}
              />
              <span className="hidden sm:inline">Refresh price</span>
            </Button>
            <Button
              variant="outline"
              onClick={onExportCsv}
              disabled={exportDisabled}
              data-ocid="neuron_detail.export_csv"
            >
              <ArrowDownToLine className="size-4" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              onClick={onSync}
              disabled={syncing}
              data-ocid="neuron_detail.sync_now"
            >
              <RefreshCw
                className={syncing ? "size-4 animate-spin" : "size-4"}
              />
              Sync now
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Edit neuron"
              data-ocid="neuron_detail.edit_button"
              onClick={onEdit}
              disabled={editing}
            >
              <Pencil className={editing ? "size-4 animate-pulse" : "size-4"} />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete neuron"
                  className="text-muted-foreground hover:text-destructive"
                  data-ocid="neuron_detail.delete_button"
                >
                  <Trash2 className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent data-ocid="neuron_detail.delete_dialog">
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Remove neuron from tracking?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This stops tracking neuron {shortenNeuronId(neuron.id)}. Its
                    recorded reward history and snapshots will be deleted. This
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-ocid="neuron_detail.delete.cancel_button">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDelete}
                    disabled={deleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    data-ocid="neuron_detail.delete.confirm_button"
                  >
                    {deleting ? "Removing…" : "Remove neuron"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Staked"
            value={formatIcpCompact(
              neuron.stakedE8s > 0n ? neuron.stakedE8s : neuron.initialStakeE8s,
            )}
            icon={Wallet}
          />
          <div className="space-y-1">
            <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] tracking-wider uppercase">
              <TrendingUp className="size-3.5" />
              Maturity
            </div>
            <p className="text-foreground font-mono text-sm font-semibold">
              {formatIcpCompact(maturityE8s)}
            </p>
            <p className="text-muted-foreground font-mono text-[10px]">
              Withdrawable {formatIcp(unstakedE8s, 4, false)} · Staked{" "}
              {formatIcp(stakedE8s, 4, false)}
            </p>
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              {withdrawableUsd != null && (
                <span
                  className="value-pill"
                  title="Withdrawable maturity value in USD at current ICP price"
                  data-ocid="neuron_detail.header.withdrawable_usd_pill"
                >
                  {formatUsd(withdrawableUsd)}
                </span>
              )}
              {withdrawablePln != null && (
                <span
                  className="value-pill"
                  title="Withdrawable maturity value in PLN at current ICP price"
                  data-ocid="neuron_detail.header.withdrawable_pln_pill"
                >
                  {formatPln(withdrawablePln)}
                </span>
              )}
              {autoStakeMaturity && (
                <Badge
                  variant="outline"
                  className="border-accent/40 bg-accent/10 text-accent gap-1 text-[10px]"
                  data-ocid="neuron_detail.header.auto_stake_badge"
                >
                  <Sparkles className="size-2.5" />
                  Auto-stake
                </Badge>
              )}
            </div>
            {icpPrice?.timestamp && (
              <p className="text-muted-foreground/70 font-mono text-[10px]">
                Price {isStale ? "stale" : "live"} ·{" "}
                {formatTimestampDateTime(icpPrice.timestamp)}
              </p>
            )}
          </div>
          <Stat
            label="Return"
            value={formatPercent(maturityPercent)}
            icon={Activity}
            valueClass={
              maturityPercent >= 0 ? "text-primary" : "text-destructive"
            }
          />
          <Stat
            label="Start date"
            value={formatTimestamp(neuron.startDate)}
            icon={Calendar}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  valueClass,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  valueClass?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] tracking-wider uppercase">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p
        className={cn(
          "text-foreground font-mono text-sm font-semibold",
          valueClass,
        )}
      >
        {value}
      </p>
    </div>
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
        className="border-destructive/40 bg-destructive/10 text-destructive gap-1 text-[10px] max-w-[220px] truncate"
        data-ocid="neuron_detail.status.failed"
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
        data-ocid="neuron_detail.status.hotkey_required"
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
        data-ocid="neuron_detail.status.synced"
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
      data-ocid="neuron_detail.status.pending"
    >
      <span className="bg-muted-foreground size-1.5 rounded-full" />
      Pending
    </Badge>
  );
}

/**
 * Rewards summary panel — Total earned (sum of positive deltas) vs Total
 * disbursed (sum of absolute values of disburseOrSpawn deltas). Computed
 * from the full DailyReward[] returned by useRewardHistory.
 *
 * When `summaryPrices` (a Map<date, PriceSnapshot>) is available, the card
 * also shows the all-time USD + PLN value of total earned rewards, valued
 * at each reward's historical ICP price on the day it was recorded.
 */
function RewardsSummaryCard({
  rewards,
  loading,
  summaryPrices,
  summaryPricesLoading,
}: {
  rewards: DailyReward[];
  loading: boolean;
  summaryPrices: Map<string, PriceSnapshot> | null;
  summaryPricesLoading: boolean;
}) {
  const {
    totalEarnedE8s,
    totalDisbursedE8s,
    totalUsd,
    totalPln,
    hasPrice,
    pricedCount,
    earnedDateCount,
  } = useMemo(() => {
    let earned = 0n;
    let disbursed = 0n;
    let usd = 0;
    let pln = 0;
    let sawPrice = false;
    let priced = 0;
    let earnedDates = 0;
    // Only normalGrowth positive deltas count as earned rewards. External
    // top-ups (externalTopUp) are capital additions from outside, not
    // income, so they are excluded from the earned total and its USD/PLN
    // value. Compare externalTopUp as a string for forward-compat with
    // pre-bindgen bindings (see EventType mapped-type pattern).
    for (const r of rewards) {
      const isExternalTopUp = r.eventType === ("externalTopUp" as EventType);
      if (r.deltaE8s > 0n && !isExternalTopUp) {
        earned += r.deltaE8s;
        earnedDates += 1;
        if (summaryPrices) {
          const key = nsToDateKey(r.timestamp);
          const snap = key ? summaryPrices.get(key) : undefined;
          if (snap && snap.usd > 0) {
            const icp = e8sToIcpNumber(r.deltaE8s);
            usd += icp * snap.usd;
            pln += icp * snap.pln;
            sawPrice = true;
            priced += 1;
          }
        }
      }
      if (r.eventType === EventType.disburseOrSpawn) {
        disbursed += r.deltaE8s < 0n ? -r.deltaE8s : r.deltaE8s;
      }
    }
    return {
      totalEarnedE8s: earned,
      totalDisbursedE8s: disbursed,
      totalUsd: usd,
      totalPln: pln,
      hasPrice: sawPrice,
      pricedCount: priced,
      earnedDateCount: earnedDates,
    };
  }, [rewards, summaryPrices]);

  // Whether the historical price query has settled (not still fetching).
  // The hook guarantees settlement within ~18s via per-call timeouts +
  // Promise.allSettled, so this loading state is always bounded.
  const pricesSettled = !summaryPricesLoading;
  // Some (but not all) earned reward dates have a historical price — show a
  // "partial data" hint rather than hiding the value pills entirely.
  const hasPartialPrice = hasPrice && pricedCount < earnedDateCount;
  // Query settled but no prices resolved at all for earned reward dates.
  const pricesUnavailable = pricesSettled && !hasPrice && earnedDateCount > 0;

  return (
    <Card className="bg-card/60 border-border/60">
      <CardHeader>
        <CardTitle className="text-base">Rewards summary</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="border-primary/30 bg-primary/5 rounded-xl border p-4">
              <div className="text-primary flex items-center gap-1.5 text-[11px] tracking-wider uppercase">
                <TrendingUp className="size-3.5" />
                Total earned
              </div>
              <p className="text-foreground font-mono text-2xl font-semibold mt-2">
                {formatIcp(totalEarnedE8s)}
              </p>
              <p className="text-muted-foreground text-xs mt-1">
                Sum of all positive maturity deltas across history.
              </p>
              {hasPrice ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span
                    className="value-pill"
                    title="All-time earned value in USD at historical ICP prices"
                    data-ocid="neuron_detail.summary.earned_usd_pill"
                  >
                    {formatUsd(totalUsd)}
                  </span>
                  <span
                    className="value-pill"
                    title="All-time earned value in PLN at historical ICP prices"
                    data-ocid="neuron_detail.summary.earned_pln_pill"
                  >
                    {formatPln(totalPln)}
                  </span>
                  {hasPartialPrice && (
                    <span
                      className="text-muted-foreground/70 font-mono text-[11px]"
                      data-ocid="neuron_detail.summary.partial_prices_note"
                    >
                      Historical prices unavailable for some dates — showing
                      partial data
                    </span>
                  )}
                </div>
              ) : !pricesSettled ? (
                <p
                  className="text-muted-foreground/70 mt-2 font-mono text-[11px]"
                  data-ocid="neuron_detail.summary.prices_loading_state"
                >
                  Fetching historical prices…
                </p>
              ) : pricesUnavailable ? (
                <p
                  className="text-muted-foreground/70 mt-2 font-mono text-[11px]"
                  data-ocid="neuron_detail.summary.prices_unavailable_state"
                >
                  Could not load historical prices
                </p>
              ) : (
                rewards.length > 0 && (
                  <p className="text-muted-foreground/70 mt-2 font-mono text-[11px]">
                    Historical price unavailable
                  </p>
                )
              )}
            </div>
            <div className="border-accent/30 bg-accent/5 rounded-xl border p-4">
              <div className="text-accent flex items-center gap-1.5 text-[11px] tracking-wider uppercase">
                <TrendingDown className="size-3.5" />
                Total disbursed
              </div>
              <p className="text-foreground font-mono text-2xl font-semibold mt-2">
                {formatIcp(totalDisbursedE8s)}
              </p>
              <p className="text-muted-foreground text-xs mt-1">
                Sum of disburse / spawn events (absolute deltas).
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MaturityChart({
  data,
}: {
  data: { date: string; maturity: number; staked: number; raw: bigint }[];
}) {
  const hasData = data.length > 0;

  return (
    <Card className="bg-card/60 border-border/60 h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Maturity growth</CardTitle>
          <div className="flex items-center gap-3">
            <div className="text-muted-foreground flex items-center gap-1.5 text-[10px]">
              <span
                className="inline-block size-2 rounded-full"
                style={{ background: "oklch(var(--chart-1))" }}
                aria-hidden
              />
              Total
              <span
                className="ml-2 inline-block size-2 rounded-full"
                style={{ background: "oklch(var(--chart-4))" }}
                aria-hidden
              />
              Staked
            </div>
            <Badge variant="secondary" className="font-mono text-[10px]">
              ICP
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
              >
                <defs>
                  <linearGradient id="maturityFill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="oklch(var(--chart-1))"
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="100%"
                      stopColor="oklch(var(--chart-1))"
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient id="stakedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="oklch(var(--chart-4))"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="100%"
                      stopColor="oklch(var(--chart-4))"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="oklch(var(--border))"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{
                    fill: "oklch(var(--muted-foreground))",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                  }}
                  axisLine={{ stroke: "oklch(var(--border))" }}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  tick={{
                    fill: "oklch(var(--muted-foreground))",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                  }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "oklch(var(--popover))",
                    border: "1px solid oklch(var(--border))",
                    borderRadius: "0.5rem",
                    fontSize: "12px",
                    fontFamily: "var(--font-mono)",
                  }}
                  labelStyle={{ color: "oklch(var(--muted-foreground))" }}
                  itemStyle={{ color: "oklch(var(--foreground))" }}
                  formatter={(v: number, name: string) => {
                    if (name === "staked") {
                      return [`${v.toFixed(4)} ICP`, "Staked"];
                    }
                    return [`${v.toFixed(4)} ICP`, "Total"];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="maturity"
                  stroke="oklch(var(--chart-1))"
                  strokeWidth={2}
                  fill="url(#maturityFill)"
                  dot={false}
                  activeDot={{ r: 4, fill: "oklch(var(--chart-1))" }}
                />
                <Area
                  type="monotone"
                  dataKey="staked"
                  stroke="oklch(var(--chart-4))"
                  strokeWidth={1.5}
                  fill="url(#stakedFill)"
                  dot={false}
                  activeDot={{ r: 3, fill: "oklch(var(--chart-4))" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-72 flex-col items-center justify-center text-center">
            <TrendingUp className="text-muted-foreground/50 size-8" />
            <p className="text-muted-foreground mt-3 text-sm">
              No maturity history yet. Sync this neuron or record a manual
              snapshot to start the chart.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityFeed({
  rewards,
  loading,
  onEditSnapshot,
  onDeleteSnapshot,
  editingSnapshot,
  deletingSnapshot,
}: {
  rewards: DailyReward[];
  loading: boolean;
  onEditSnapshot: (
    timestamp: bigint,
    newTimestamp: bigint,
    newMaturityE8s: bigint,
  ) => void;
  onDeleteSnapshot: (timestamp: bigint) => void;
  editingSnapshot: boolean;
  deletingSnapshot: boolean;
}) {
  const [visibleCount, setVisibleCount] = useState(ACTIVITY_PAGE_SIZE);
  const [editing, setEditing] = useState<DailyReward | null>(null);
  const [deleting, setDeleting] = useState<DailyReward | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "table">("table");

  // Most recent entries first.
  const reversed = useMemo(() => [...rewards].reverse(), [rewards]);
  const visible = reversed.slice(0, visibleCount);
  const hasMore = reversed.length > visibleCount;

  // Lazy paginated historical price fetch: only fetch prices for the dates
  // of the currently visible entries. This keeps the CoinGecko request batch
  // small and grows it as the user clicks "Load more". Dates are deduped
  // across the visible window so a single day with many readings costs one
  // backend call.
  const visibleDateKeys = useMemo(() => {
    const set = new Set<string>();
    for (const r of visible) {
      const key = nsToDateKey(r.timestamp);
      if (key) set.add(key);
    }
    return [...set];
  }, [visible]);
  const visiblePricesQuery = useHistoricalPrices(visibleDateKeys);
  const visiblePrices = visiblePricesQuery.data ?? null;

  const handleLoadMore = () => {
    setVisibleCount((c) => c + ACTIVITY_PAGE_SIZE);
  };

  const handleEditSubmit = (newTimestamp: bigint, newMaturityE8s: bigint) => {
    if (!editing) return;
    onEditSnapshot(editing.timestamp, newTimestamp, newMaturityE8s);
    setEditing(null);
  };

  const handleDeleteConfirm = () => {
    if (!deleting) return;
    onDeleteSnapshot(deleting.timestamp);
    setDeleting(null);
  };

  return (
    <Card className="bg-card/60 border-border/60 h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Activity feed</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-[10px]">
              {rewards.length}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setViewMode((m) => (m === "list" ? "table" : "list"))}
              data-ocid="neuron_detail.activity.view_toggle"
            >
              {viewMode === "list" ? "Table view" : "List view"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                const csv = rewardsToCsv(rewards);
                downloadCsv("activity-feed.csv", csv);
              }}
              data-ocid="neuron_detail.activity.export_button"
            >
              Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((n) => (
              <Skeleton
                key={`activity-skeleton-${n}`}
                className="h-12 w-full"
              />
            ))}
          </div>
        ) : rewards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Activity className="text-muted-foreground/50 size-7" />
            <p className="text-muted-foreground mt-3 text-sm">
              No reward events recorded yet.
            </p>
          </div>
        ) : viewMode === "table" ? (
          <div className="overflow-auto rounded-md border border-border/60 max-h-[500px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border/60">
                  <th className="text-left p-2 font-medium text-muted-foreground">#</th>
                  <th className="text-left p-2 font-medium text-muted-foreground">Date</th>
                  <th className="text-left p-2 font-medium text-muted-foreground">Event</th>
                  <th className="text-right p-2 font-medium text-muted-foreground">Delta</th>
                  <th className="text-right p-2 font-medium text-muted-foreground">Unstaked</th>
                  <th className="text-right p-2 font-medium text-muted-foreground">Staked</th>
                  <th className="text-right p-2 font-medium text-muted-foreground">Stake delta</th>
                  <th className="text-center p-2 font-medium text-muted-foreground">Auto-stake</th>
                </tr>
              </thead>
              <tbody>
                {reversed.map((r, i) => (
                  <tr key={"tr-" + i}>
                    <td className="p-2">{i + 1}</td>
                    <td className="p-2">{formatTimestampDateTime(r.timestamp)}</td>
                    <td className="p-2">{EVENT_TYPE_LABEL[r.eventType] ?? r.eventType}</td>
                    <td className="p-2 text-right font-mono">{e8sToIcpNumber(r.deltaE8s).toFixed(4)}</td>
                    <td className="p-2 text-right font-mono">{e8sToIcpNumber(r.unstakedMaturityE8s).toFixed(4)}</td>
                    <td className="p-2 text-right font-mono">{e8sToIcpNumber(r.stakedMaturityE8s).toFixed(4)}</td>
                    <td className="p-2 text-right font-mono">{e8sToIcpNumber(r.stakeDeltaE8s).toFixed(4)}</td>
                    <td className="p-2 text-center">{r.autoStakeMaturity ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-3">
            <ol
              className={cn(
                "space-y-1 overflow-y-auto pr-1",
                ACTIVITY_MAX_HEIGHT,
              )}
              data-ocid="neuron_detail.activity.list"
            >
              {visible.map((r, i) => (
                <ActivityItem
                  key={`${r.neuronId}-${r.timestamp}-${i}`}
                  event={r}
                  index={i}
                  price={visiblePrices?.get(nsToDateKey(r.timestamp)) ?? null}
                  onEdit={() => setEditing(r)}
                  onDelete={() => setDeleting(r)}
                />
              ))}
            </ol>
            {hasMore && (
              <div className="flex justify-center pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadMore}
                  data-ocid="neuron_detail.activity.load_more"
                >
                  <ChevronDown className="size-4" />
                  Load more
                  <span className="text-muted-foreground ml-1 font-mono text-[11px]">
                    ({rewards.length - visibleCount} more)
                  </span>
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Edit snapshot dialog */}
      <EditSnapshotDialog
        open={editing !== null}
        event={editing}
        submitting={editingSnapshot}
        onClose={() => setEditing(null)}
        onSubmit={handleEditSubmit}
      />

      {/* Delete snapshot confirmation */}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent data-ocid="neuron_detail.snapshot.delete_dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this snapshot?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `The reading from ${formatTimestampDateTime(deleting.timestamp)} will be permanently removed. Deltas for neighboring entries will be recomputed. This cannot be undone.`
                : "This snapshot will be permanently removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-ocid="neuron_detail.snapshot.delete.cancel_button">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deletingSnapshot}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-ocid="neuron_detail.snapshot.delete.confirm_button"
            >
              {deletingSnapshot ? "Deleting…" : "Delete snapshot"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// mergedToStake and externalTopUp are newer EventType members. The mapped
// type accepts every key in EventType plus the new ones, so the
// ActivityItem label lookup stays exhaustive before and after bindgen.
const EVENT_TYPE_LABEL: {
  [K in EventType | "mergedToStake" | "externalTopUp"]: string;
} = {
  normalGrowth: "Maturity growth",
  firstReading: "First reading",
  disburseOrSpawn: "Disburse / spawn",
  mergedToStake: "Merged to stake",
  externalTopUp: "External Top-Up",
};

function ActivityItem({
  event,
  index,
  price,
  onEdit,
  onDelete,
}: {
  event: DailyReward;
  index: number;
  price: PriceSnapshot | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isDisburse = event.eventType === EventType.disburseOrSpawn;
  const isFirst = event.eventType === EventType.firstReading;
  // mergedToStake is a newer EventType member not yet in the generated
  // bindings, so compare as a string. It represents maturity minted to
  // the same neuron's stake (governance merge), distinct from a disburse
  // / spawn payout.
  const isMergedToStake = event.eventType === ("mergedToStake" as EventType);
  // externalTopUp represents capital added from outside the neuron (e.g.
  // an external stake top-up), distinct from rewards (normalGrowth) or
  // withdrawals (disburseOrSpawn). Compare as a string for forward-compat
  // with pre-bindgen bindings.
  const isExternalTopUp = event.eventType === ("externalTopUp" as EventType);

  const Icon = isExternalTopUp
    ? PlusCircle
    : isMergedToStake
      ? ArrowDownToLine
      : isDisburse
        ? Zap
        : isFirst
          ? Sparkles
          : TrendingUp;
  const accent = isExternalTopUp
    ? "text-emerald-600 bg-emerald-500/10 dark:text-emerald-400 dark:bg-emerald-500/15"
    : isMergedToStake
      ? "text-violet-600 bg-violet-500/10 dark:text-violet-400 dark:bg-violet-500/15"
      : isDisburse
        ? "text-primary bg-primary/10"
        : isFirst
          ? "text-accent bg-accent/10"
          : "text-muted-foreground bg-muted";

  // Combined maturity total = unstaked (withdrawable) + staked.
  const combinedE8s = event.unstakedMaturityE8s + event.stakedMaturityE8s;
  // "increased maturity from X ICP to Y ICP (+delta)"
  const fromE8s = combinedE8s - event.deltaE8s;
  const label = EVENT_TYPE_LABEL[event.eventType];
  const deltaNegative = event.deltaE8s < 0n;

  // For externalTopUp events the capital addition is stakeDeltaE8s (the
  // amount added to the stake from outside), not deltaE8s (the maturity
  // delta). Show the historical USD/PLN value of that capital addition.
  const topUpIcp = isExternalTopUp ? e8sToIcpNumber(event.stakeDeltaE8s) : 0;
  const showTopUpValuePills =
    isExternalTopUp && price != null && price.usd > 0 && topUpIcp > 0;
  const topUpUsd = showTopUpValuePills ? topUpIcp * price.usd : null;
  const topUpPln = showTopUpValuePills ? topUpIcp * price.pln : null;

  // USD + PLN value of this entry's delta at the historical ICP price for
  // the entry's date. Only meaningful for positive deltas (rewards); for
  // disbursements the delta is a balance movement, not income, so we hide
  // the value pills there to avoid implying a USD gain.
  const showValuePills = !deltaNegative && price != null && price.usd > 0;
  const deltaIcp = e8sToIcpNumber(event.deltaE8s);
  const deltaUsd = showValuePills ? deltaIcp * price.usd : null;
  const deltaPln = showValuePills ? deltaIcp * price.pln : null;
  const priceUnavailable = !deltaNegative && price == null && !isExternalTopUp;
  const topUpPriceUnavailable = isExternalTopUp && price == null;

  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.4) }}
      className="group flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/40 transition-smooth"
      data-ocid={`neuron_detail.activity.item.${index + 1}`}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg",
          accent,
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-foreground text-sm font-medium">{label}</span>
          <span
            className={cn(
              "font-mono text-sm font-semibold",
              deltaNegative ? "text-destructive" : "text-primary",
            )}
          >
            {isExternalTopUp
              ? `Added ${formatIcp(event.stakeDeltaE8s, 4, false)} from outside`
              : `${deltaNegative ? "" : "+"}${formatIcp(event.deltaE8s, 4, false)}`}
          </span>
        </div>
        <p className="text-muted-foreground font-mono text-[11px]">
          {formatIcp(fromE8s, 4, false)} → {formatIcp(combinedE8s, 4, false)}{" "}
          ICP
        </p>
        <p className="text-muted-foreground font-mono text-[11px]">
          Withdrawable {formatIcp(event.unstakedMaturityE8s, 4, false)} · Staked{" "}
          {formatIcp(event.stakedMaturityE8s, 4, false)}
          {event.autoStakeMaturity && (
            <Badge
              variant="outline"
              className="border-accent/40 bg-accent/10 text-accent ml-1.5 gap-0.5 text-[9px]"
              data-ocid={`neuron_detail.activity.auto_stake_badge.${index + 1}`}
            >
              <Sparkles className="size-2" />
              Auto-stake
            </Badge>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-muted-foreground font-mono text-[11px]">
            {formatTimestampDateTime(event.timestamp)}
          </p>
          {isExternalTopUp
            ? topUpUsd != null && (
                <span
                  className="value-pill"
                  title="Capital addition value in USD at historical ICP price"
                  data-ocid={`neuron_detail.activity.topup_usd_pill.${index + 1}`}
                >
                  {formatUsd(topUpUsd)}
                </span>
              )
            : deltaUsd != null && (
                <span
                  className="value-pill"
                  title="Delta value in USD at historical ICP price"
                  data-ocid={`neuron_detail.activity.usd_pill.${index + 1}`}
                >
                  {formatUsd(deltaUsd)}
                </span>
              )}
          {isExternalTopUp
            ? topUpPln != null && (
                <span
                  className="value-pill"
                  title="Capital addition value in PLN at historical ICP price"
                  data-ocid={`neuron_detail.activity.topup_pln_pill.${index + 1}`}
                >
                  {formatPln(topUpPln)}
                </span>
              )
            : deltaPln != null && (
                <span
                  className="value-pill"
                  title="Delta value in PLN at historical ICP price"
                  data-ocid={`neuron_detail.activity.pln_pill.${index + 1}`}
                >
                  {formatPln(deltaPln)}
                </span>
              )}
          {isExternalTopUp
            ? topUpPriceUnavailable && (
                <span
                  className="text-muted-foreground/60 font-mono text-[10px]"
                  data-ocid={`neuron_detail.activity.topup_price_unavailable.${index + 1}`}
                >
                  price unavailable
                </span>
              )
            : priceUnavailable && (
                <span
                  className="text-muted-foreground/60 font-mono text-[10px]"
                  data-ocid={`neuron_detail.activity.price_unavailable.${index + 1}`}
                >
                  price unavailable
                </span>
              )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Edit snapshot"
          data-ocid={`neuron_detail.snapshot.edit_button.${index + 1}`}
          onClick={onEdit}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive size-7"
          aria-label="Delete snapshot"
          data-ocid={`neuron_detail.snapshot.delete_button.${index + 1}`}
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </motion.li>
  );
}

/**
 * Convert a bigint nanosecond timestamp into a value suitable for a
 * <input type="datetime-local"> control (YYYY-MM-DDTHH:mm in local time).
 */
function nsToDatetimeLocal(ns: bigint): string {
  const ms = Number(ns / 1_000_000n);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Convert a datetime-local string (YYYY-MM-DDTHH:mm) into nanoseconds since
 * the Unix epoch.
 */
function datetimeLocalToNs(value: string): bigint {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return 0n;
  return BigInt(Math.floor(ms)) * 1_000_000n;
}

/**
 * Convert an ICP decimal string into e8s. Returns null if invalid.
 */
function icpToE8s(icp: string): bigint | null {
  const n = Number(icp);
  if (!Number.isFinite(n) || n < 0) return null;
  return BigInt(Math.round(n * Number(E8S_PER_ICP)));
}

/**
 * Convert e8s into an ICP decimal string suitable for an <input> field.
 */
function e8sToIcpInput(e8s: bigint): string {
  const icp = Number(e8s) / Number(E8S_PER_ICP);
  return String(icp);
}

/**
 * Dialog for editing a single reward snapshot — change both the maturity
 * balance (in ICP) and the timestamp. On submit calls useEditSnapshot with
 * (neuronId, originalTimestamp, newTimestamp, newMaturityE8s).
 */
function EditSnapshotDialog({
  open,
  event,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  event: DailyReward | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (newTimestamp: bigint, newMaturityE8s: bigint) => void;
}) {
  const combinedE8s =
    event == null ? 0n : event.unstakedMaturityE8s + event.stakedMaturityE8s;
  const [maturity, setMaturity] = useState("");
  const [datetime, setDatetime] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Sync local state when the dialog opens for a different event.
  const eventKey =
    event == null ? null : `${event.neuronId}-${event.timestamp}`;
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (eventKey !== lastKey) {
    setLastKey(eventKey);
    if (event != null) {
      setMaturity(e8sToIcpInput(combinedE8s));
      setDatetime(nsToDatetimeLocal(event.timestamp));
      setError(null);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;
    const newMaturityE8s = icpToE8s(maturity);
    if (newMaturityE8s == null) {
      setError("Enter a valid maturity amount in ICP");
      return;
    }
    if (!datetime) {
      setError("Pick a date and time");
      return;
    }
    const newTimestamp = datetimeLocalToNs(datetime);
    if (newTimestamp <= 0n) {
      setError("Pick a valid date and time");
      return;
    }
    onSubmit(newTimestamp, newMaturityE8s);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent data-ocid="neuron_detail.snapshot.edit_dialog">
        <DialogHeader>
          <DialogTitle>Edit snapshot</DialogTitle>
          <DialogDescription>
            Change the maturity balance and/or timestamp for this reading. The
            backend re-sorts the history and recomputes deltas for the edited
            entry and its new neighbors.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label
              htmlFor="edit-maturity"
              data-ocid="neuron_detail.snapshot.edit.maturity.label"
            >
              Maturity balance (ICP)
            </Label>
            <Input
              id="edit-maturity"
              inputMode="decimal"
              placeholder="0.0000"
              value={maturity}
              onChange={(e) => {
                setMaturity(e.target.value);
                setError(null);
              }}
              data-ocid="neuron_detail.snapshot.edit.maturity.input"
              className="font-mono"
              required
            />
            <p className="text-muted-foreground text-[11px]">
              Combined total (withdrawable + staked). Current:{" "}
              {formatIcp(combinedE8s, 4, false)} ICP
            </p>
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="edit-datetime"
              data-ocid="neuron_detail.snapshot.edit.datetime.label"
            >
              Timestamp
            </Label>
            <Input
              id="edit-datetime"
              type="datetime-local"
              value={datetime}
              onChange={(e) => {
                setDatetime(e.target.value);
                setError(null);
              }}
              data-ocid="neuron_detail.snapshot.edit.datetime.input"
              required
            />
            <p className="text-muted-foreground text-[11px]">
              Original: {event ? formatTimestampDateTime(event.timestamp) : "—"}
            </p>
          </div>
          {error && (
            <p
              role="alert"
              className="text-destructive text-xs"
              data-ocid="neuron_detail.snapshot.edit.field_error"
            >
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={submitting}
              data-ocid="neuron_detail.snapshot.edit.cancel_button"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              data-ocid="neuron_detail.snapshot.edit.save_button"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NeuronStatsCard({
  stats,
}: {
  stats: ReturnType<typeof useNeuronStats>["data"];
}) {
  return (
    <Card className="bg-card/60 border-border/60">
      <CardHeader>
        <CardTitle className="text-base">Reward statistics</CardTitle>
      </CardHeader>
      <CardContent>
        {!stats ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Capital vs rewards split — the corrected accounting uses
                totalCapitalContributedE8s as the denominator for both
                percentageReturn and apy30d, so surfacing it here makes the
                return figures auditable at a glance. */}
            <StatRow
              label="Total capital contributed"
              value={formatIcp(stats.totalCapitalContributedE8s, 4)}
              dataOcid="neuron_detail.stats.total_capital"
            />
            <Separator />
            <StatRow
              label="Total rewards earned"
              value={formatIcp(stats.totalRewardsE8s, 4)}
              dataOcid="neuron_detail.stats.total_rewards"
            />
            <Separator />
            <StatRow
              label="Average daily reward"
              value={formatIcp(stats.averageDailyRewardE8s, 4)}
            />
            <Separator />
            <StatRow
              label="APY (30-day)"
              value={formatApy(stats.apy30d)}
              dataOcid="neuron_detail.stats.apy30d"
            />
            <Separator />
            <StatRow
              label="Overall return"
              value={formatPercent(stats.overallReturnPct)}
              dataOcid="neuron_detail.stats.overall_return"
            />
            <Separator />
            <StatRow
              label="Monthly readings"
              value={stats.monthly.length.toString()}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatRow({
  label,
  value,
  dataOcid,
}: {
  label: string;
  value: string;
  dataOcid?: string;
}) {
  return (
    <div className="flex items-center justify-between" data-ocid={dataOcid}>
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-foreground font-mono text-sm font-semibold">
        {value}
      </span>
    </div>
  );
}

/**
 * Monthly breakdown section — table + bar chart of total ICP earned per
 * calendar month, derived from NeuronStats.monthly. The monthly array is
 * already grouped by year/month and sorted chronologically by the backend;
 * we sort defensively here in case the wire order changes.
 *
 * The backend now excludes #externalTopUp and #mergedToStake events from
 * totalDeltaE8s (and momDeltaE8s), so the chart and table reflect earned
 * rewards only — not capital top-ups or governance merges. We display the
 * values as-is from the corrected backend computation.
 *
 * Year-over-year (YoY) delta is computed in the frontend by looking up the
 * same calendar month in the previous year; the MonthlyBreakdown type does
 * not carry a backend-computed YoY field. A null YoY (no prior-year data)
 * renders as "—".
 *
 * Layout: two-column grid on large screens (chart left, table right),
 * stacked on small screens. Bars use the chart-1 cyan token
 * (oklch(var(--chart-1))) to match the maturity growth chart.
 */
function MonthlyBreakdownSection({
  monthly,
}: {
  monthly: MonthlyBreakdown[];
}) {
  const sorted = useMemo(
    () =>
      [...monthly].sort((a, b) => {
        const y = Number(b.year - a.year);
        if (y !== 0) return y;
        return Number(b.month - a.month);
      }),
    [monthly],
  );

  // Index months by `${year}-${month}` so we can look up the same month in
  // the previous year for the YoY delta column.
  const byKey = useMemo(() => {
    const map = new Map<string, MonthlyBreakdown>();
    for (const m of sorted) {
      map.set(`${Number(m.year)}-${Number(m.month)}`, m);
    }
    return map;
  }, [sorted]);

  const chartData = useMemo(
    () =>
      [...sorted]
        .reverse()
        .map((m) => ({
          label: formatMonthLabel(m.year, m.month),
          icp: e8sToIcpNumber(m.totalDeltaE8s),
          raw: m.totalDeltaE8s,
        })),
    [sorted],
  );

  const hasData = sorted.length > 0;

  return (
    <Card className="bg-card/60 border-border/60 mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Monthly breakdown</CardTitle>
          <Badge variant="secondary" className="font-mono text-[10px]">
            {sorted.length} {sorted.length === 1 ? "month" : "months"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex h-48 flex-col items-center justify-center text-center">
            <BarChart3 className="text-muted-foreground/50 size-7" />
            <p className="text-muted-foreground mt-3 text-sm">
              No monthly breakdown available yet. Record more snapshots to see
              per-month totals.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Bar chart */}
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="oklch(var(--border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{
                      fill: "oklch(var(--muted-foreground))",
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                    }}
                    axisLine={{ stroke: "oklch(var(--border))" }}
                    tickLine={false}
                    minTickGap={20}
                  />
                  <YAxis
                    tick={{
                      fill: "oklch(var(--muted-foreground))",
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                    }}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                    tickFormatter={(v: number) =>
                      formatIcpCompact(BigInt(Math.round(v * 1e8)))
                    }
                  />
                  <Tooltip
                    cursor={{ fill: "oklch(var(--chart-1) / 0.08)" }}
                    contentStyle={{
                      backgroundColor: "oklch(var(--popover))",
                      border: "1px solid oklch(var(--border))",
                      borderRadius: "0.5rem",
                      fontSize: "12px",
                      fontFamily: "var(--font-mono)",
                    }}
                    labelStyle={{ color: "oklch(var(--muted-foreground))" }}
                    itemStyle={{ color: "oklch(var(--foreground))" }}
                    formatter={(v: number) => [`${v.toFixed(4)} ICP`, "Earned"]}
                  />
                  <Bar
                    dataKey="icp"
                    fill="oklch(var(--chart-1))"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table data-ocid="neuron_detail.monthly.table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">Month</TableHead>
                    <TableHead className="text-[11px] text-right">
                      Total earned
                    </TableHead>
                    <TableHead className="text-[11px] text-right">
                      MoM delta
                    </TableHead>
                    <TableHead className="text-[11px] text-right">
                      YoY delta
                    </TableHead>
                    <TableHead className="text-[11px] text-right">
                      Readings
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((m, i) => {
                    const momNegative = m.momDeltaE8s < 0n;
                    // YoY: same calendar month in the previous year. Null
                    // when there is no prior-year data for that month.
                    const prevYear = byKey.get(
                      `${Number(m.year) - 1}-${Number(m.month)}`,
                    );
                    const yoyDeltaE8s =
                      prevYear == null
                        ? null
                        : m.totalDeltaE8s - prevYear.totalDeltaE8s;
                    const yoyNegative = yoyDeltaE8s != null && yoyDeltaE8s < 0n;
                    return (
                      <TableRow
                        key={`monthly-${m.year}-${m.month}`}
                        data-ocid={`neuron_detail.monthly.row.${i + 1}`}
                      >
                        <TableCell className="text-foreground font-mono text-xs">
                          {formatMonthLabel(m.year, m.month)}
                        </TableCell>
                        <TableCell className="text-foreground font-mono text-right text-xs">
                          {formatIcp(m.totalDeltaE8s, 4, false)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "font-mono text-right text-xs",
                            momNegative ? "text-destructive" : "text-primary",
                          )}
                        >
                          {momNegative ? "" : "+"}
                          {formatIcp(m.momDeltaE8s, 4, false)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "font-mono text-right text-xs",
                            yoyDeltaE8s == null
                              ? "text-muted-foreground"
                              : yoyNegative
                                ? "text-destructive"
                                : "text-primary",
                          )}
                        >
                          {yoyDeltaE8s == null
                            ? "—"
                            : `${yoyNegative ? "" : "+"}${formatIcp(yoyDeltaE8s, 4, false)}`}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-right text-xs">
                          {Number(m.readingCount)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SnapshotEntryForm({
  onSubmit,
  submitting,
}: {
  onSubmit: (
    unstakedMaturityE8s: bigint,
    stakedMaturityE8s: bigint,
    autoStakeMaturity: boolean,
    timestamp: bigint,
  ) => void;
  submitting: boolean;
}) {
  const [unstaked, setUnstaked] = useState("");
  const [staked, setStaked] = useState("0");
  const [autoStake, setAutoStake] = useState(false);
  const [datetime, setDatetime] = useState("");

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const unstakedE8s = icpToE8s(unstaked);
    const stakedE8s = icpToE8s(staked);
    if (unstakedE8s == null) {
      toast.error("Enter a valid withdrawable maturity amount");
      return;
    }
    if (stakedE8s == null) {
      toast.error("Enter a valid staked maturity amount");
      return;
    }
    if (!datetime) {
      toast.error("Pick a date and time");
      return;
    }
    const timestamp = datetimeLocalToNs(datetime);
    if (timestamp <= 0n) {
      toast.error("Pick a valid date and time");
      return;
    }
    onSubmit(unstakedE8s, stakedE8s, autoStake, timestamp);
    setUnstaked("");
    setStaked("0");
    setAutoStake(false);
    setDatetime("");
  };

  return (
    <Card className="bg-card/60 border-border/60">
      <CardHeader>
        <CardTitle className="text-base">Manual snapshot</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <p className="text-muted-foreground text-xs">
            Use this when governance sync is blocked (e.g. hotkey not
            configured). Enter the current maturity to record a point in time.
          </p>
          <div className="space-y-2">
            <Label
              htmlFor="unstaked-maturity"
              data-ocid="neuron_detail.snapshot.unstaked.label"
            >
              Withdrawable maturity (ICP)
            </Label>
            <Input
              id="unstaked-maturity"
              inputMode="decimal"
              placeholder="0.0000"
              value={unstaked}
              onChange={(e) => setUnstaked(e.target.value)}
              data-ocid="neuron_detail.snapshot.unstaked.input"
              className="font-mono"
              required
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="staked-maturity"
              data-ocid="neuron_detail.snapshot.staked.label"
            >
              Staked maturity (ICP)
            </Label>
            <Input
              id="staked-maturity"
              inputMode="decimal"
              placeholder="0.0000"
              value={staked}
              onChange={(e) => setStaked(e.target.value)}
              data-ocid="neuron_detail.snapshot.staked.input"
              className="font-mono"
              required
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="neuron-snapshot-datetime"
              data-ocid="neuron_detail.snapshot.datetime.label"
            >
              Timestamp
            </Label>
            <Input
              id="neuron-snapshot-datetime"
              type="datetime-local"
              value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
              data-ocid="neuron_detail.snapshot.datetime.input"
              className="font-mono"
              required
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
            <div className="space-y-0.5">
              <Label
                htmlFor="auto-stake"
                className="text-sm"
                data-ocid="neuron_detail.snapshot.auto_stake.label"
              >
                Auto-stake maturity
              </Label>
              <p className="text-muted-foreground text-[11px]">
                Stake new maturity instead of leaving it withdrawable.
              </p>
            </div>
            <Switch
              id="auto-stake"
              checked={autoStake}
              onCheckedChange={setAutoStake}
              data-ocid="neuron_detail.snapshot.auto_stake.switch"
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={submitting}
              data-ocid="neuron_detail.snapshot.submit_button"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Recording…
                </>
              ) : (
                "Record snapshot"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

type ParsedRow = {
  rowIndex: number;
  date: string;
  dateMs: number;
  amountE8s: bigint;
  deltaE8s: bigint | null;
  isDisburse: boolean;
};

type ParseError = { rowIndex: number; message: string };

function ImportHistoricalPanel({
  neuronId,
  onImport,
}: {
  neuronId: bigint;
  onImport: ReturnType<typeof useImportHistoricalData>;
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const { rows, errors } = useMemo(() => parsePaste(raw), [raw]);
  const hasErrors = errors.length > 0;
  const canConfirm = rows.length > 0 && !hasErrors && !onImport.isPending;

  const handleConfirm = () => {
    if (!canConfirm) return;
    // Backend timestamps are nanoseconds since epoch (IC Time.now()
    // convention — see types/common.mo). r.dateMs is JS epoch milliseconds
    // from Date.UTC in parsePaste, so multiply by 1_000_000 to get ns.
    // NEVER divide — that would produce seconds and sort imported entries
    // ~1e9x earlier than real Time.now() snapshots, breaking chronology.
    const entries: HistoricalEntry[] = rows.map((r) => ({
      timestamp: BigInt(Math.floor(r.dateMs)) * 1_000_000n,
      unstakedMaturityE8s: r.amountE8s,
      stakedMaturityE8s: 0n,
    }));
    onImport.mutate(
      { neuronId, entries },
      {
        onSuccess: () => {
          toast.success(`Imported ${entries.length} historical readings`);
          setRaw("");
          setConfirmed(true);
          setOpen(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Card className="bg-card/60 border-border/60 mt-6">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center justify-between px-6 py-4 text-left transition-smooth"
            data-ocid="neuron_detail.import.toggle"
            aria-expanded={open}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="bg-accent/15 text-accent flex size-9 shrink-0 items-center justify-center rounded-lg">
                <ClipboardPaste className="size-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-foreground text-sm font-semibold">
                  Import historical maturity
                </h2>
                <p className="text-muted-foreground text-xs">
                  Paste tab-separated rows (DD/MM/YYYY, maturity in ICP) to
                  backfill past readings.
                </p>
              </div>
            </div>
            <ChevronDown
              className={cn(
                "text-muted-foreground size-4 shrink-0 transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-border/60 border-t" />
          <div className="space-y-4 p-6">
            <div className="space-y-2">
              <Label
                htmlFor="historical-paste"
                className="text-sm"
                data-ocid="neuron_detail.import.paste.label"
              >
                Paste rows (date <span className="font-mono">⇥</span> maturity)
              </Label>
              <Textarea
                id="historical-paste"
                value={raw}
                onChange={(e) => {
                  setRaw(e.target.value);
                  setConfirmed(false);
                }}
                placeholder={
                  "01/01/2024\t0.0123\n15/01/2024\t0.0245\n01/02/2024\t0.0367"
                }
                rows={8}
                className="font-mono text-xs"
                data-ocid="neuron_detail.import.paste.input"
              />
              <p className="text-muted-foreground text-[11px]">
                One row per line, two columns separated by a tab. Date as
                DD/MM/YYYY, maturity as a decimal ICP amount.
              </p>
            </div>

            {hasErrors && (
              <div
                role="alert"
                className="border-destructive/40 bg-destructive/10 rounded-lg border p-3"
                data-ocid="neuron_detail.import.error_state"
              >
                <div className="text-destructive flex items-center gap-1.5 text-xs font-semibold">
                  <AlertTriangle className="size-3.5" />
                  {errors.length} unparseable{" "}
                  {errors.length === 1 ? "row" : "rows"} — fix before importing
                </div>
                <ul className="text-destructive/90 mt-1.5 space-y-0.5 font-mono text-[11px]">
                  {errors.map((e) => (
                    <li
                      key={`err-${e.rowIndex}`}
                      data-ocid={`neuron_detail.import.row_error.${e.rowIndex}`}
                    >
                      Row {e.rowIndex}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {rows.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <Table data-ocid="neuron_detail.import.preview_table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px]">#</TableHead>
                      <TableHead className="text-[11px]">Date</TableHead>
                      <TableHead className="text-[11px] text-right">
                        Maturity (ICP)
                      </TableHead>
                      <TableHead className="text-[11px] text-right">
                        Delta
                      </TableHead>
                      <TableHead className="text-[11px]">Flag</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow
                        key={`row-${r.rowIndex}`}
                        data-ocid={`neuron_detail.import.preview.row.${i + 1}`}
                      >
                        <TableCell className="text-muted-foreground font-mono text-[11px]">
                          {r.rowIndex}
                        </TableCell>
                        <TableCell className="text-foreground font-mono text-xs">
                          {r.date}
                        </TableCell>
                        <TableCell className="text-foreground font-mono text-right text-xs">
                          {formatIcp(r.amountE8s, 4, false)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "font-mono text-right text-xs",
                            r.deltaE8s == null
                              ? "text-muted-foreground"
                              : r.deltaE8s < 0n
                                ? "text-destructive"
                                : "text-primary",
                          )}
                        >
                          {r.deltaE8s == null
                            ? "—"
                            : `${r.deltaE8s < 0n ? "" : "+"}${formatIcp(r.deltaE8s, 4, false)}`}
                        </TableCell>
                        <TableCell>
                          {r.isDisburse ? (
                            <Badge
                              variant="outline"
                              className="border-primary/40 bg-primary/10 text-primary gap-1 text-[10px]"
                              data-ocid={`neuron_detail.import.flag.${i + 1}`}
                            >
                              <TrendingDown className="size-2.5" />
                              disburseOrSpawn
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">
                              —
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {confirmed && rows.length === 0 && (
              <p
                className="text-primary flex items-center gap-1.5 text-xs"
                data-ocid="neuron_detail.import.success_state"
              >
                <Sparkles className="size-3.5" />
                Import complete — chart and activity feed refreshed.
              </p>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-[11px]">
                {rows.length > 0
                  ? `${rows.length} ${rows.length === 1 ? "row" : "rows"} parsed`
                  : "No rows parsed yet"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRaw("");
                    setConfirmed(false);
                  }}
                  disabled={!raw || onImport.isPending}
                  data-ocid="neuron_detail.import.clear_button"
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  data-ocid="neuron_detail.import.confirm_button"
                >
                  {onImport.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Importing…
                    </>
                  ) : (
                    <>
                      <Upload className="size-4" />
                      Confirm import
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function parsePaste(input: string): {
  rows: ParsedRow[];
  errors: ParseError[];
} {
  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];
  const lines = input.split("\n");
  let dataRowIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    dataRowIndex += 1;
    const parts = trimmed.split("\t");
    if (parts.length < 2) {
      errors.push({
        rowIndex: dataRowIndex,
        message: "expected two tab-separated columns",
      });
      continue;
    }
    const dateStr = parts[0].trim();
    const amountStr = parts[1].trim();
    const dateMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateStr);
    if (!dateMatch) {
      errors.push({
        rowIndex: dataRowIndex,
        message: `bad date "${dateStr}" (use DD/MM/YYYY)`,
      });
      continue;
    }
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const year = Number(dateMatch[3]);
    // Explicit range checks give clearer errors than the round-trip check
    // alone (e.g. "day 13 in month 99" vs a generic "invalid date").
    if (month < 1 || month > 12) {
      errors.push({
        rowIndex: dataRowIndex,
        message: `invalid month "${dateStr}" (month must be 01-12)`,
      });
      continue;
    }
    if (day < 1 || day > 31) {
      errors.push({
        rowIndex: dataRowIndex,
        message: `invalid day "${dateStr}" (day must be 01-31)`,
      });
      continue;
    }
    // Construct via Date.UTC(year, monthIndex-1, day) — NEVER pass the
    // DD/MM/YYYY string to the Date constructor, which interprets it as
    // MM/DD/YYYY US format (Invalid Date for days >12, silent month/day
    // swap for days 01-12). The round-trip check below catches 29/02 on
    // non-leap years and days > the month's actual length.
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    if (
      dateObj.getUTCFullYear() !== year ||
      dateObj.getUTCMonth() !== month - 1 ||
      dateObj.getUTCDate() !== day
    ) {
      errors.push({
        rowIndex: dataRowIndex,
        message: `invalid date "${dateStr}" (no such calendar day, e.g. 29/02 on a non-leap year)`,
      });
      continue;
    }
    const amountNum = Number(amountStr);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      errors.push({
        rowIndex: dataRowIndex,
        message: `non-numeric amount "${amountStr}"`,
      });
      continue;
    }
    const amountE8s = BigInt(Math.round(amountNum * 1e8));
    const prev = rows[rows.length - 1];
    const deltaE8s = prev == null ? null : amountE8s - prev.amountE8s;
    const isDisburse = deltaE8s != null && deltaE8s < 0n;
    rows.push({
      rowIndex: dataRowIndex,
      date: dateStr,
      dateMs: dateObj.getTime(),
      amountE8s,
      deltaE8s,
      isDisburse,
    });
  }
  return { rows, errors };
}

function DetailSkeleton() {
  return (
    <div className="bg-background mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Skeleton className="mb-6 h-8 w-32" />
      <Card className="bg-card/60">
        <CardHeader>
          <Skeleton className="h-12 w-full" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={`stat-skeleton-${n}`} className="h-14 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Skeleton className="h-80 lg:col-span-3" />
        <Skeleton className="h-80 lg:col-span-2" />
      </div>
    </div>
  );
}
