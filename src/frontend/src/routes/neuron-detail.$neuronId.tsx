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
 *   - Manual snapshot entry form (recordSnapshot(neuronId, maturityE8s))
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useRemoveNeuron, useUpdateNeuron } from "@/hooks/use-neurons";
import { useNeurons } from "@/hooks/use-neurons";
import { useRewardHistory, useSyncStatus } from "@/hooks/use-rewards";
import { useNeuronStats } from "@/hooks/use-stats";
import { useRecordSnapshot, useSyncNeuron } from "@/hooks/use-sync";
import type {
  DailyReward,
  EventType,
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
  ArrowLeft,
  BrainCircuit,
  Calendar,
  Loader2,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
  TrendingUp,
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
  const syncNeuron = useSyncNeuron();
  const removeNeuron = useRemoveNeuron();
  const updateNeuron = useUpdateNeuron();
  const recordSnapshot = useRecordSnapshot();
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
        if (res.status === ("hotkeyRequired" as SyncStatus)) {
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

  // Current maturity = last reward snapshot's maturityE8s (if any).
  const sortedRewards = [...(rewards ?? [])].sort((a, b) =>
    Number(a.timestamp - b.timestamp),
  );
  const lastReward = sortedRewards[sortedRewards.length - 1];
  const maturityE8s = lastReward?.maturityE8s ?? 0n;
  const maturityPercent = stats?.percentageReturn ?? 0;

  const chartData = sortedRewards.map((p) => ({
    date: formatTimestamp(p.timestamp),
    maturity: Number(p.maturityE8s) / 1e8,
    raw: p.maturityE8s,
  }));

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
          maturityPercent={maturityPercent}
          syncStatus={syncStatus ?? null}
          onSync={handleSync}
          syncing={syncNeuron.isPending}
          onEdit={handleEdit}
          editing={updateNeuron.isPending}
          onDelete={handleDelete}
          deleting={removeNeuron.isPending}
        />

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
            onSubmit={(maturity) => {
              recordSnapshot.mutate(
                { neuronId: BigInt(neuronId), maturityE8s: maturity },
                {
                  onSuccess: () => toast.success("Snapshot recorded"),
                  onError: (err) => toast.error(err.message),
                },
              );
            }}
            submitting={recordSnapshot.isPending}
          />
        </div>
      </div>
    </div>
  );
}

function NeuronHeader({
  neuron,
  maturityE8s,
  maturityPercent,
  syncStatus,
  onSync,
  syncing,
  onEdit,
  editing,
  onDelete,
  deleting,
}: {
  neuron: Neuron;
  maturityE8s: bigint;
  maturityPercent: number;
  syncStatus: SyncStatus | null;
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
                <SyncStatusBadge status={syncStatus} />
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
            value={formatIcpCompact(neuron.initialStakeE8s)}
            icon={Wallet}
          />
          <Stat
            label="Maturity"
            value={formatIcpCompact(maturityE8s)}
            icon={TrendingUp}
          />
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

function SyncStatusBadge({ status }: { status: SyncStatus | null }) {
  if (status === ("hotkeyRequired" as SyncStatus)) {
    return (
      <Badge
        variant="outline"
        className="border-accent/40 bg-accent/10 text-accent gap-1 text-[10px]"
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
    >
      <span className="bg-muted-foreground size-1.5 rounded-full" />
      Pending
    </Badge>
  );
}

function MaturityChart({
  data,
}: {
  data: { date: string; maturity: number; raw: bigint }[];
}) {
  const hasData = data.length > 0;

  return (
    <Card className="bg-card/60 border-border/60 h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Maturity growth</CardTitle>
          <Badge variant="secondary" className="font-mono text-[10px]">
            ICP
          </Badge>
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
                  formatter={(v: number) => [`${v.toFixed(4)} ICP`, "Maturity"]}
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

  // "increased maturity from X ICP to Y ICP (+delta)"
  const fromE8s = event.maturityE8s - event.deltaE8s;
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
          {formatIcp(fromE8s, 4, false)} →{" "}
          {formatIcp(event.maturityE8s, 4, false)} ICP
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
  onSubmit: (maturityE8s: bigint) => void;
  submitting: boolean;
}) {
  const [maturity, setMaturity] = useState("");

  const icpToE8s = (icp: string): bigint | null => {
    const n = Number(icp);
    if (!Number.isFinite(n) || n < 0) return null;
    return BigInt(Math.round(n * 1e8));
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const maturityE8s = icpToE8s(maturity);
    if (maturityE8s == null) {
      toast.error("Enter a valid ICP amount");
      return;
    }
    onSubmit(maturityE8s);
    setMaturity("");
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
              htmlFor="maturity"
              data-ocid="neuron_detail.snapshot.maturity.label"
            >
              Maturity (ICP)
            </Label>
            <Input
              id="maturity"
              inputMode="decimal"
              placeholder="0.0000"
              value={maturity}
              onChange={(e) => setMaturity(e.target.value)}
              data-ocid="neuron_detail.snapshot.maturity.input"
              className="font-mono"
              required
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
