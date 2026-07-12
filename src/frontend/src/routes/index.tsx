/**
 * Dashboard page — portfolio summary + neuron cards grid.
 *
 * Shows:
 *   - Portfolio summary panel (total staked, total rewards, % return)
 *   - Neuron cards grid (name, current maturity, % return, sync status)
 *   - Refresh All button + Add Neuron button
 *   - Empty state when no neurons are tracked
 *
 * Portfolio stats come from getPortfolioStats (real PortfolioStats:
 * totalStakedE8s, totalRewardsE8s, percentageReturn, neuronCount).
 * Per-neuron maturity / % return come from getNeuronStats, and sync
 * status from getSyncStatus — the Neuron record itself only carries
 * id, name, startDate, dissolveDelaySeconds, initialStakeE8s, ownerId.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useNeurons } from "@/hooks/use-neurons";
import { useSyncStatus } from "@/hooks/use-rewards";
import { useNeuronStats, usePortfolioStats } from "@/hooks/use-stats";
import { useSyncAllNeurons } from "@/hooks/use-sync";
import type { Neuron, SyncStatus } from "@/lib/backend-actor";
import {
  formatIcp,
  formatIcpCompact,
  formatPercent,
  formatTimestamp,
  shortenNeuronId,
  shortenPrincipal,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  BrainCircuit,
  Plus,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";

export function DashboardPage() {
  const { data: neurons, isLoading: neuronsLoading } = useNeurons();
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolioStats();
  const syncAll = useSyncAllNeurons();
  const navigate = useNavigate();

  const isEmpty = !neuronsLoading && (neurons?.length ?? 0) === 0;

  const handleSyncAll = () => {
    syncAll.mutate(undefined, {
      onSuccess: (results) => {
        const needsHotkey = results.some(
          (r) => r.status === ("hotkeyRequired" as SyncStatus),
        );
        if (needsHotkey) {
          toast.warning("Synced — some neurons need a hotkey to fully sync");
        } else {
          toast.success("Synced all neurons with NNS governance");
        }
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <div className="bg-background">
      {/* Aurora glow backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-40"
        style={{
          background:
            "radial-gradient(50% 60% at 50% 0%, oklch(0.78 0.16 195 / 0.12) 0%, oklch(0.145 0.014 260 / 0) 70%)",
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
            totalRewards={portfolio?.totalRewardsE8s ?? null}
            overallReturn={portfolio?.percentageReturn ?? null}
            neuronCount={portfolio?.neuronCount ?? null}
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

function PortfolioSummary({
  totalStaked,
  totalRewards,
  overallReturn,
  neuronCount,
  loading,
}: {
  totalStaked: bigint | null;
  totalRewards: bigint | null;
  overallReturn: number | null;
  neuronCount: bigint | null;
  loading: boolean;
}) {
  const stats = [
    {
      label: "Total Staked",
      value: formatIcp(totalStaked, 2),
      icon: Wallet,
      accent: "text-primary",
    },
    {
      label: "Total Rewards",
      value: formatIcp(totalRewards, 2),
      icon: Activity,
      accent: "text-accent",
    },
    {
      label: "Overall Return",
      value: formatPercent(overallReturn),
      icon: TrendingUp,
      accent:
        overallReturn != null && overallReturn >= 0
          ? "text-primary"
          : "text-destructive",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {stats.map((stat) => (
        <Card
          key={stat.label}
          className="bg-card/60 border-border/60 overflow-hidden"
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                {stat.label}
              </CardTitle>
              <stat.icon className={cn("size-4", stat.accent)} />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <p className="text-foreground font-mono text-2xl font-semibold tracking-tight">
                {stat.value}
              </p>
            )}
            {stat.label === "Total Staked" &&
              !loading &&
              neuronCount != null && (
                <p className="text-muted-foreground mt-1 font-mono text-xs">
                  {neuronCount.toString()} neuron{neuronCount === 1n ? "" : "s"}
                </p>
              )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function NeuronCard({ neuron, index }: { neuron: Neuron; index: number }) {
  const idStr = neuron.id.toString();
  const { data: stats } = useNeuronStats(idStr);
  const { data: syncStatus } = useSyncStatus(idStr);

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
              <SyncStatusBadge status={syncStatus ?? null} />
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

function SyncStatusBadge({ status }: { status: SyncStatus | null }) {
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
