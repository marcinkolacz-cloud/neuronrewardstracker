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
 *   - Activity feed timeline (DailyReward events)
 *   - Sync now button
 *   - Manual snapshot entry form (recordSnapshot(neuronId, unstakedMaturityE8s, stakedMaturityE8s, autoStakeMaturity))
 *   - Edit (updateNeuron) and delete (removeNeuron) actions
 */

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
import { useRewardHistory, useSyncStatus } from "@/hooks/use-rewards";
import { useNeuronStats } from "@/hooks/use-stats";
import {
  useImportHistoricalData,
  useRecordSnapshot,
  useSyncError,
  useSyncNeuron,
} from "@/hooks/use-sync";
import type {
  DailyReward,
  EventType,
  HistoricalEntry,
  Neuron,
  SyncStatus,
} from "@/lib/backend-actor";
import {
  formatIcp,
  formatIcpCompact,
  formatPercent,
  formatTimestamp,
  formatTimestampDateTime,
  shortenNeuronId,
  shortenPrincipal,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  Calendar,
  ChevronDown,
  ClipboardPaste,
  Loader2,
  Pencil,
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
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

export function NeuronDetailPage() {
  const { neuronId } = useParams({ from: "/neuron-detail/$neuronId" });
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
  const navigate = useNavigate();

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
  const sortedRewards = [...(rewards ?? [])].sort((a, b) =>
    Number(a.timestamp - b.timestamp),
  );
  const lastReward = sortedRewards[sortedRewards.length - 1];
  const unstakedE8s = lastReward?.unstakedMaturityE8s ?? 0n;
  const stakedE8s = lastReward?.stakedMaturityE8s ?? 0n;
  const maturityE8s = unstakedE8s + stakedE8s;
  const autoStakeMaturity = lastReward?.autoStakeMaturity ?? false;
  const maturityPercent = stats?.percentageReturn ?? 0;

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
            "radial-gradient(50% 60% at 50% 0%, oklch(0.78 0.16 195 / 0.10) 0%, oklch(0.145 0.014 260 / 0) 70%)",
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

        {/* Chart + Activity feed */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <MaturityChart data={chartData} />
          </div>
          <div className="lg:col-span-2">
            <ActivityFeed rewards={sortedRewards} loading={rewardsLoading} />
          </div>
        </div>

        {/* Stats + Snapshot entry */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <NeuronStatsCard stats={stats} />
          <SnapshotEntryForm
            onSubmit={(unstaked, staked, autoStake) => {
              recordSnapshot.mutate(
                {
                  neuronId: BigInt(neuronId),
                  unstakedMaturityE8s: unstaked,
                  stakedMaturityE8s: staked,
                  autoStakeMaturity: autoStake,
                },
                {
                  onSuccess: () => toast.success("Snapshot recorded"),
                  onError: (err) => toast.error(err.message),
                },
              );
            }}
            submitting={recordSnapshot.isPending}
          />
        </div>

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
}) {
  return (
    <Card className="bg-card/60 border-border/60">
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="bg-gradient-primary flex size-12 shrink-0 items-center justify-center rounded-xl shadow-md">
              <BrainCircuit className="size-6 text-primary-foreground" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-foreground font-display text-xl font-semibold tracking-tight">
                  {neuron.name || `Neuron ${shortenNeuronId(neuron.id)}`}
                </h1>
                <SyncStatusBadge
                  status={syncStatus}
                  errorReason={errorReason}
                />
              </div>
              <p className="text-muted-foreground font-mono text-xs mt-0.5">
                Owner {shortenPrincipal(neuron.ownerId.toString(), 8)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
            {autoStakeMaturity && (
              <Badge
                variant="outline"
                className="border-accent/40 bg-accent/10 text-accent mt-1 gap-1 text-[10px]"
                data-ocid="neuron_detail.header.auto_stake_badge"
              >
                <Sparkles className="size-2.5" />
                Auto-stake
              </Badge>
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
                style={{ background: "oklch(0.78 0.16 195)" }}
                aria-hidden
              />
              Total
              <span
                className="ml-2 inline-block size-2 rounded-full"
                style={{ background: "oklch(0.72 0.14 145)" }}
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
                      stopColor="oklch(0.78 0.16 195)"
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="100%"
                      stopColor="oklch(0.78 0.16 195)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient id="stakedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="oklch(0.72 0.14 145)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="100%"
                      stopColor="oklch(0.72 0.14 145)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="oklch(0.3 0.02 260)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{
                    fill: "oklch(0.62 0.012 260)",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                  }}
                  axisLine={{ stroke: "oklch(0.3 0.02 260)" }}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  tick={{
                    fill: "oklch(0.62 0.012 260)",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                  }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "oklch(0.22 0.018 260)",
                    border: "1px solid oklch(0.3 0.02 260)",
                    borderRadius: "0.5rem",
                    fontSize: "12px",
                    fontFamily: "var(--font-mono)",
                  }}
                  labelStyle={{ color: "oklch(0.62 0.012 260)" }}
                  itemStyle={{ color: "oklch(0.95 0.005 260)" }}
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
                  stroke="oklch(0.78 0.16 195)"
                  strokeWidth={2}
                  fill="url(#maturityFill)"
                  dot={false}
                  activeDot={{ r: 4, fill: "oklch(0.78 0.16 195)" }}
                />
                <Area
                  type="monotone"
                  dataKey="staked"
                  stroke="oklch(0.72 0.14 145)"
                  strokeWidth={1.5}
                  fill="url(#stakedFill)"
                  dot={false}
                  activeDot={{ r: 3, fill: "oklch(0.72 0.14 145)" }}
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
}: {
  rewards: DailyReward[];
  loading: boolean;
}) {
  return (
    <Card className="bg-card/60 border-border/60 h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Activity feed</CardTitle>
          <Badge variant="secondary" className="font-mono text-[10px]">
            {rewards.length}
          </Badge>
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
        ) : (
          <ol className="space-y-1">
            {rewards
              .slice(-12)
              .reverse()
              .map((r, i) => (
                <ActivityItem
                  key={`${r.neuronId}-${r.timestamp}-${i}`}
                  event={r}
                  index={i}
                />
              ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

const EVENT_TYPE_LABEL: Record<EventType, string> = {
  normalGrowth: "Maturity growth",
  firstReading: "First reading",
  disburseOrSpawn: "Disburse / spawn",
};

function ActivityItem({ event, index }: { event: DailyReward; index: number }) {
  const isDisburse = event.eventType === ("disburseOrSpawn" as EventType);
  const isFirst = event.eventType === ("firstReading" as EventType);

  const Icon = isDisburse ? Zap : isFirst ? Sparkles : TrendingUp;
  const accent = isDisburse
    ? "text-primary bg-primary/10"
    : isFirst
      ? "text-accent bg-accent/10"
      : "text-muted-foreground bg-muted";

  // Combined maturity total = unstaked (withdrawable) + staked.
  const combinedE8s = event.unstakedMaturityE8s + event.stakedMaturityE8s;
  // "increased maturity from X ICP to Y ICP (+delta)"
  const fromE8s = combinedE8s - event.deltaE8s;
  const label = EVENT_TYPE_LABEL[event.eventType];

  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className="flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/40 transition-smooth"
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
          <span className="text-primary font-mono text-sm font-semibold">
            +{formatIcp(event.deltaE8s, 4, false)}
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
        <p className="text-muted-foreground font-mono text-[11px]">
          {formatTimestampDateTime(event.timestamp)}
        </p>
      </div>
    </motion.li>
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
            <StatRow
              label="Total rewards"
              value={formatIcp(stats.totalRewardsE8s, 4)}
            />
            <Separator />
            <StatRow
              label="Average daily reward"
              value={formatIcp(stats.averageDailyRewardE8s, 4)}
            />
            <Separator />
            <StatRow
              label="Return"
              value={formatPercent(stats.percentageReturn)}
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

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-foreground font-mono text-sm font-semibold">
        {value}
      </span>
    </div>
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
  ) => void;
  submitting: boolean;
}) {
  const [unstaked, setUnstaked] = useState("");
  const [staked, setStaked] = useState("0");
  const [autoStake, setAutoStake] = useState(false);

  const icpToE8s = (icp: string): bigint | null => {
    const n = Number(icp);
    if (!Number.isFinite(n) || n < 0) return null;
    return BigInt(Math.round(n * 1e8));
  };

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
    onSubmit(unstakedE8s, stakedE8s, autoStake);
    setUnstaked("");
    setStaked("0");
    setAutoStake(false);
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
    const entries: HistoricalEntry[] = rows.map((r) => ({
      timestamp: BigInt(Math.floor(r.dateMs / 1000)),
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
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    if (
      dateObj.getUTCFullYear() !== year ||
      dateObj.getUTCMonth() !== month - 1 ||
      dateObj.getUTCDate() !== day
    ) {
      errors.push({
        rowIndex: dataRowIndex,
        message: `invalid date "${dateStr}"`,
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
