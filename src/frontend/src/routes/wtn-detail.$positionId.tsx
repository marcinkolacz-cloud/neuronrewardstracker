/**
 * WTN detail page — stats, activity feed, snapshot entry, edit/delete, import.
 *
 * WaterNeuron (WTN) positions are fully separate from NNS neurons — no
 * governance sync, no hotkey, manual snapshot entry only. This page
 * composes three queries:
 *   - useWtnPosition  → the WtnPosition record (name, owner, start date)
 *   - useWtnSnapshots → WtnSnapshot[] (activity feed + CSV export)
 *   - useWtnStats     → WtnStats (aggregate cards)
 *
 * Layout mirrors neuron-detail.$neuronId.tsx but adapts for WTN's
 * 3-value snapshot model (nicpHeld, totalIcpPaid, redeemableIcpValue) and
 * no-sync nature (Droplets WTN badge instead of NNS sync status badge).
 *
 * WTN numeric values are floats in ICP units (NOT e8s), so we use the
 * `formatWtnIcp` helper below rather than `formatIcp` (which expects e8s).
 */

import { WtnEventType } from "@/backend";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  useDeleteWtnPosition,
  useDeleteWtnSnapshot,
  useEditWtnSnapshot,
  useImportWtnHistoricalData,
  useRecordWtnSnapshot,
  useUpdateWtnPosition,
  useWtnPosition,
  useWtnSnapshots,
  useWtnStats,
} from "@/hooks/use-wtn";
import type {
  WtnHistoricalEntry,
  WtnPosition,
  WtnSnapshot,
  WtnStats,
} from "@/lib/backend-actor";
import { downloadCsv, wtnSnapshotsToCsv } from "@/lib/csv";
import {
  formatApy,
  formatTimestamp,
  formatTimestampDateTime,
  shortenPrincipal,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ChevronDown,
  ClipboardPaste,
  Droplets,
  Info,
  Loader2,
  Pencil,
  PlusCircle,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  Wallet,
} from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

/** Number of activity entries shown initially and per "Load more" click. */
const ACTIVITY_PAGE_SIZE = 25;
/** Max height of the scrollable activity feed container. */
const ACTIVITY_MAX_HEIGHT = "max-h-[400px]";

/**
 * Format a WTN numeric ICP value (already in ICP units, NOT e8s) with
 * thousands separators and a fixed number of decimals. Returns "0.0000"
 * for null/NaN so stat cards never show "NaN".
 *
 * @example formatWtnIcp(12.3456) // "12.3456"
 */
function formatWtnIcp(
  value: number | null | undefined,
  decimals = 4,
  withUnit = true,
): string {
  if (value == null || Number.isNaN(value)) {
    return withUnit
      ? `0.${"0".repeat(decimals)} ICP`
      : `0.${"0".repeat(decimals)}`;
  }
  const fixed = value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return withUnit ? `${fixed} ICP` : fixed;
}

/**
 * Format a percentage return (already in percent units, e.g. 14.7 means
 * 14.7%). Adds a leading + for positive values. Returns "—" for null/NaN.
 */
function formatWtnPercent(
  value: number | null | undefined,
  decimals = 2,
): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function WtnDetailPage() {
  const { positionId } = useParams({ strict: false });
  const idParam =
    typeof positionId === "string" ? positionId : String(positionId ?? "");
  const numericId = Number(idParam);
  const validId = Number.isFinite(numericId) && numericId >= 0 ? idParam : null;

  const { data: position, isLoading: positionLoading } =
    useWtnPosition(validId);
  const { data: snapshots, isLoading: snapshotsLoading } =
    useWtnSnapshots(validId);
  const { data: stats } = useWtnStats(validId);
  const recordSnapshot = useRecordWtnSnapshot();
  const editSnapshot = useEditWtnSnapshot();
  const deleteSnapshot = useDeleteWtnSnapshot();
  const importHistorical = useImportWtnHistoricalData();
  const updatePosition = useUpdateWtnPosition();
  const deletePosition = useDeleteWtnPosition();
  const navigate = useNavigate();

  // Sort snapshots chronologically (oldest first) for delta computation.
  const sortedSnapshots = useMemo(
    () => [...(snapshots ?? [])].sort((a, b) => Number(a.date - b.date)),
    [snapshots],
  );

  const handleExportCsv = () => {
    if (!sortedSnapshots || sortedSnapshots.length === 0) {
      toast.error("No snapshots to export");
      return;
    }
    const csv = wtnSnapshotsToCsv(sortedSnapshots);
    const safeId = idParam.replace(/[^a-zA-Z0-9_-]/g, "_");
    downloadCsv(`wtn-${safeId}-snapshots.csv`, csv);
    toast.success("CSV downloaded");
  };

  // Position-level edit: prompt for a new name, then update via the backend.
  // Mirrors NeuronHeader's pencil button (neuron-detail line 247).
  const handleEditPosition = () => {
    if (!position) return;
    const name = window.prompt("WTN position name", position.name);
    if (name == null) return; // cancelled
    updatePosition.mutate(
      { ...position, name },
      {
        onSuccess: () => toast.success("Position updated"),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  // Position-level delete: cascade-removes the position + its snapshots.
  // Mirrors NeuronHeader's AlertDialog-wrapped trash button (neuron-detail
  // line 237). Navigate to '/' after success.
  const handleDeletePosition = () => {
    deletePosition.mutate(BigInt(idParam), {
      onSuccess: () => {
        toast.success("WTN position removed from tracking");
        navigate({ to: "/" });
      },
      onError: (err) => toast.error(err.message),
    });
  };

  if (!validId) {
    return (
      <div className="bg-background">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <p className="text-muted-foreground">Invalid position id.</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: "/" })}
            className="text-muted-foreground mt-4"
            data-ocid="wtn_detail.back"
          >
            <ArrowLeft className="size-4" />
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (positionLoading && !position) {
    return <WtnDetailSkeleton />;
  }

  if (!position) {
    return (
      <div className="bg-background mx-auto max-w-2xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <h1 className="text-foreground font-display text-xl font-semibold">
          WTN position not found
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          This position may have been removed or never tracked.
        </p>
        <Button
          onClick={() => navigate({ to: "/" })}
          className="mt-6"
          data-ocid="wtn_detail.not_found.back"
        >
          Back to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-48 opacity-30"
        style={{
          background:
            "radial-gradient(50% 60% at 50% 0%, oklch(var(--accent) / 0.12) 0%, oklch(var(--background) / 0) 70%)",
        }}
      />
      <div className="relative mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/" })}
          className="text-muted-foreground mb-6"
          data-ocid="wtn_detail.back"
        >
          <ArrowLeft className="size-4" />
          Back to dashboard
        </Button>

        {/* Header with WTN badge + Export CSV */}
        <WtnHeader
          position={position}
          onExportCsv={handleExportCsv}
          exportDisabled={!sortedSnapshots || sortedSnapshots.length === 0}
          onEditPosition={handleEditPosition}
          editingPosition={updatePosition.isPending}
          onDeletePosition={handleDeletePosition}
          deletingPosition={deletePosition.isPending}
        />

        {/* Stats panel */}
        <div className="mt-6">
          <WtnStatsCard stats={stats} />
        </div>

        {/* Activity feed */}
        <div className="mt-6">
          <WtnActivityFeed
            snapshots={sortedSnapshots}
            loading={snapshotsLoading}
            positionId={BigInt(idParam)}
            onEditSnapshot={(
              date,
              newDate,
              newNicpHeld,
              newTotalIcpPaid,
              newRedeemableIcpValue,
            ) =>
              editSnapshot.mutate(
                {
                  positionId: BigInt(idParam),
                  date,
                  newDate,
                  newNicpHeld,
                  newTotalIcpPaid,
                  newRedeemableIcpValue,
                },
                {
                  onSuccess: () => toast.success("Snapshot updated"),
                  onError: (err) => toast.error(err.message),
                },
              )
            }
            onDeleteSnapshot={(date) =>
              deleteSnapshot.mutate(
                { positionId: BigInt(idParam), date },
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

        {/* Snapshot entry form */}
        <div className="mt-6">
          <WtnSnapshotEntryForm
            onSubmit={(date, nicpHeld, totalIcpPaid, redeemableIcpValue) => {
              recordSnapshot.mutate(
                {
                  positionId: BigInt(idParam),
                  date,
                  nicpHeld,
                  totalIcpPaid,
                  redeemableIcpValue,
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

        {/* Import historical data panel */}
        <WtnImportHistoricalPanel
          positionId={BigInt(idParam)}
          onImport={importHistorical}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function WtnHeader({
  position,
  onExportCsv,
  exportDisabled,
  onEditPosition,
  editingPosition,
  onDeletePosition,
  deletingPosition,
}: {
  position: WtnPosition;
  onExportCsv: () => void;
  exportDisabled: boolean;
  onEditPosition: () => void;
  editingPosition: boolean;
  onDeletePosition: () => void;
  deletingPosition: boolean;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      data-ocid="wtn_detail.header"
    >
      <Card className="bg-card/60 border-border/60">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <span className="bg-accent/15 text-accent flex size-12 shrink-0 items-center justify-center rounded-xl shadow-md">
                <Droplets className="size-6" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-foreground font-display text-xl font-semibold tracking-tight truncate">
                    {position.name || "WTN position"}
                  </h1>
                  <Badge
                    variant="outline"
                    className="border-accent/40 bg-accent/10 text-accent gap-1 text-[10px]"
                    data-ocid="wtn_detail.wtn_badge"
                  >
                    <Droplets className="size-2.5" />
                    WTN
                  </Badge>
                </div>
                <p className="text-muted-foreground font-mono text-xs mt-0.5">
                  Owner {shortenPrincipal(position.ownerId.toString(), 8)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={onExportCsv}
                disabled={exportDisabled}
                data-ocid="wtn_detail.export_csv"
              >
                <ArrowDownToLine className="size-4" />
                Export CSV
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Edit WTN position"
                data-ocid="wtn_detail.edit_button"
                onClick={onEditPosition}
                disabled={editingPosition}
              >
                <Pencil
                  className={
                    editingPosition ? "size-4 animate-pulse" : "size-4"
                  }
                />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete WTN position"
                    className="text-muted-foreground hover:text-destructive"
                    data-ocid="wtn_detail.delete_button"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent data-ocid="wtn_detail.delete_dialog">
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Remove WTN position from tracking?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This stops tracking “{position.name || "WTN position"}”.
                      Its recorded snapshots and stats will be permanently
                      deleted. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-ocid="wtn_detail.delete.cancel_button">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={onDeletePosition}
                      disabled={deletingPosition}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-ocid="wtn_detail.delete.confirm_button"
                    >
                      {deletingPosition ? "Removing…" : "Remove position"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <WtnStat
              label="Start date"
              value={formatTimestamp(position.startDate)}
              icon={Activity}
            />
            <WtnStat
              label="Position type"
              value="WaterNeuron"
              icon={Droplets}
            />
            <WtnStat label="Tracking" value="Manual entry" icon={Wallet} />
          </div>
        </CardContent>
      </Card>
    </motion.section>
  );
}

function WtnStat({
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

/* ------------------------------------------------------------------ */
/* Stats card                                                          */
/* ------------------------------------------------------------------ */

function WtnStatsCard({ stats }: { stats: WtnStats | undefined }) {
  return (
    <Card
      className="bg-card/60 border-border/60"
      data-ocid="wtn_detail.stats_panel"
    >
      <CardHeader>
        <CardTitle className="text-base">Position statistics</CardTitle>
      </CardHeader>
      <CardContent>
        {!stats ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <WtnStatRow
              label="Total earned"
              value={formatWtnIcp(stats.totalEarned, 4)}
              hint="Sum of organic growth deltas"
              dataOcid="wtn_detail.stats.total_earned"
            />
            <Separator />
            <WtnStatRow
              label="Total capital contributed"
              value={formatWtnIcp(stats.totalCapitalContributed, 4)}
              hint="Running total ICP paid"
              dataOcid="wtn_detail.stats.total_capital"
            />
            <Separator />
            <WtnStatRow
              label="Total withdrawn"
              value={formatWtnIcp(stats.totalWithdrawn, 4)}
              hint="Sum of withdrawal deltas"
              dataOcid="wtn_detail.stats.total_withdrawn"
            />
            <Separator />
            <WtnStatRow
              label="Return"
              value={formatWtnPercent(stats.percentReturn)}
              hint="(redeemable − paid) / paid"
              dataOcid="wtn_detail.stats.percent_return"
              valueClass={
                stats.percentReturn >= 0 ? "text-primary" : "text-destructive"
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WtnStatRow({
  label,
  value,
  hint,
  dataOcid,
  valueClass,
}: {
  label: string;
  value: string;
  hint?: string;
  dataOcid?: string;
  valueClass?: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4"
      data-ocid={dataOcid}
    >
      <div className="min-w-0">
        <span className="text-muted-foreground text-sm">{label}</span>
        {hint && (
          <p className="text-muted-foreground/70 text-[11px] mt-0.5">{hint}</p>
        )}
      </div>
      <span
        className={cn(
          "text-foreground font-mono text-sm font-semibold text-right",
          valueClass,
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Activity feed                                                       */
/* ------------------------------------------------------------------ */

const WTN_EVENT_LABEL: Record<WtnEventType, string> = {
  firstReading: "Initial reading",
  capitalAdded: "Capital added",
  withdrawal: "Withdrawal",
  organicGrowth: "Organic growth",
};

function WtnActivityFeed({
  snapshots,
  loading,
  positionId,
  onEditSnapshot,
  onDeleteSnapshot,
  editingSnapshot,
  deletingSnapshot,
}: {
  snapshots: WtnSnapshot[];
  loading: boolean;
  positionId: bigint;
  onEditSnapshot: (
    date: bigint,
    newDate: bigint,
    newNicpHeld: number,
    newTotalIcpPaid: number,
    newRedeemableIcpValue: number,
  ) => void;
  onDeleteSnapshot: (date: bigint) => void;
  editingSnapshot: boolean;
  deletingSnapshot: boolean;
}) {
  const [visibleCount, setVisibleCount] = useState(ACTIVITY_PAGE_SIZE);
  const [editing, setEditing] = useState<WtnSnapshot | null>(null);
  const [deleting, setDeleting] = useState<WtnSnapshot | null>(null);

  // Most recent entries first.
  const reversed = useMemo(() => [...snapshots].reverse(), [snapshots]);
  const visible = reversed.slice(0, visibleCount);
  const hasMore = reversed.length > visibleCount;

  const handleLoadMore = () => {
    setVisibleCount((c) => c + ACTIVITY_PAGE_SIZE);
  };

  const handleEditSubmit = (
    newDate: bigint,
    newNicpHeld: number,
    newTotalIcpPaid: number,
    newRedeemableIcpValue: number,
  ) => {
    if (!editing) return;
    onEditSnapshot(
      editing.date,
      newDate,
      newNicpHeld,
      newTotalIcpPaid,
      newRedeemableIcpValue,
    );
    setEditing(null);
  };

  const handleDeleteConfirm = () => {
    if (!deleting) return;
    onDeleteSnapshot(deleting.date);
    setDeleting(null);
  };

  return (
    <Card
      className="bg-card/60 border-border/60"
      data-ocid="wtn_detail.activity_feed"
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Activity feed</CardTitle>
          <Badge variant="secondary" className="font-mono text-[10px]">
            {snapshots.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((n) => (
              <Skeleton
                key={`wtn-activity-skeleton-${n}`}
                className="h-12 w-full"
              />
            ))}
          </div>
        ) : snapshots.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-10 text-center"
            data-ocid="wtn_detail.activity.empty_state"
          >
            <Activity className="text-muted-foreground/50 size-7" />
            <p className="text-muted-foreground mt-3 text-sm">
              No snapshots recorded yet. Record your first snapshot below.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <ol
              className={cn(
                "space-y-1 overflow-y-auto pr-1",
                ACTIVITY_MAX_HEIGHT,
              )}
              data-ocid="wtn_detail.activity.list"
            >
              {visible.map((s, i) => (
                <WtnActivityItem
                  key={`${positionId}-${s.date}-${i}`}
                  event={s}
                  prev={i < reversed.length - 1 ? reversed[i + 1] : null}
                  index={i}
                  onEdit={() => setEditing(s)}
                  onDelete={() => setDeleting(s)}
                />
              ))}
            </ol>
            {hasMore && (
              <div className="flex justify-center pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadMore}
                  data-ocid="wtn_detail.activity.load_more"
                >
                  <ChevronDown className="size-4" />
                  Load more
                  <span className="text-muted-foreground ml-1 font-mono text-[11px]">
                    ({snapshots.length - visibleCount} more)
                  </span>
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Edit snapshot dialog */}
      <WtnEditSnapshotDialog
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
        <AlertDialogContent data-ocid="wtn_detail.snapshot.delete_dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this snapshot?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `The reading from ${formatTimestampDateTime(deleting.date)} will be permanently removed. Deltas for neighboring entries will be recomputed. This cannot be undone.`
                : "This snapshot will be permanently removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-ocid="wtn_detail.snapshot.delete.cancel_button">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deletingSnapshot}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-ocid="wtn_detail.snapshot.delete.confirm_button"
            >
              {deletingSnapshot ? "Deleting…" : "Delete snapshot"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function WtnActivityItem({
  event,
  prev,
  index,
  onEdit,
  onDelete,
}: {
  event: WtnSnapshot;
  prev: WtnSnapshot | null;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isCapital = event.eventType === WtnEventType.capitalAdded;
  const isWithdrawal = event.eventType === WtnEventType.withdrawal;
  const isOrganic = event.eventType === WtnEventType.organicGrowth;
  const isFirstReading = event.eventType === WtnEventType.firstReading;

  const Icon = isCapital
    ? PlusCircle
    : isWithdrawal
      ? TrendingDown
      : isOrganic
        ? TrendingUp
        : isFirstReading
          ? Sparkles
          : Activity;
  const accent = isCapital
    ? "text-emerald-600 bg-emerald-500/10 dark:text-emerald-400 dark:bg-emerald-500/15"
    : isWithdrawal
      ? "text-primary bg-primary/10"
      : isOrganic
        ? "text-accent bg-accent/10"
        : isFirstReading
          ? "text-muted-foreground bg-muted"
          : "text-muted-foreground bg-muted";

  const label = WTN_EVENT_LABEL[event.eventType];

  // Compute deltas vs the previous (older) snapshot for natural-language text.
  const nicpDelta = prev ? event.nicpHeld - prev.nicpHeld : 0;
  const paidDelta = prev ? event.totalIcpPaid - prev.totalIcpPaid : 0;
  const prevRedeemable = prev ? prev.redeemableIcpValue : 0;

  // Natural-language description per event type. firstReading is a neutral
  // informational baseline — it is NOT a buy/sell transaction, so we show
  // the recorded values as context rather than a delta-based narrative.
  let description: string;
  if (isFirstReading) {
    description = `Baseline reading — nICP ${formatWtnIcp(event.nicpHeld, 4, false)}, paid ${formatWtnIcp(event.totalIcpPaid, 4, false)}, redeemable ${formatWtnIcp(event.redeemableIcpValue, 4, false)} ICP`;
  } else if (isCapital) {
    description = `Bought ${formatWtnIcp(nicpDelta, 4, false)} nICP for ${formatWtnIcp(paidDelta, 4, false)} ICP`;
  } else if (isWithdrawal) {
    // Proportional redeemable value for the unstaked nICP.
    const proportionalRedeemable =
      event.nicpHeld > 0 && prev && prev.nicpHeld > 0
        ? (Math.abs(nicpDelta) / prev.nicpHeld) * prev.redeemableIcpValue
        : Math.abs(nicpDelta);
    description = `Unstaked ${formatWtnIcp(Math.abs(nicpDelta), 4, false)} nICP for ~${formatWtnIcp(proportionalRedeemable, 4, false)} ICP`;
  } else if (isOrganic) {
    description = `Value grew from ${formatWtnIcp(prevRedeemable, 4, false)} to ${formatWtnIcp(event.redeemableIcpValue, 4, false)} ICP`;
  } else {
    description = "Snapshot recorded";
  }

  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.4) }}
      className="group flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/40 transition-smooth"
      data-ocid={`wtn_detail.activity.item.${index + 1}`}
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
          <Badge
            variant="outline"
            className={cn(
              "gap-1 text-[10px]",
              isCapital
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : isWithdrawal
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : isOrganic
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-border bg-muted text-muted-foreground",
            )}
            data-ocid={`wtn_detail.activity.badge.${index + 1}`}
          >
            {event.eventType}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm mt-0.5 break-words">
          {description}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
          <p className="text-muted-foreground font-mono text-[11px]">
            {formatTimestampDateTime(event.date)}
          </p>
          <p className="text-muted-foreground font-mono text-[11px]">
            nICP {formatWtnIcp(event.nicpHeld, 4, false)} · Paid{" "}
            {formatWtnIcp(event.totalIcpPaid, 4, false)} · Redeemable{" "}
            {formatWtnIcp(event.redeemableIcpValue, 4, false)}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Edit snapshot"
          data-ocid={`wtn_detail.snapshot.edit_button.${index + 1}`}
          onClick={onEdit}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive size-7"
          aria-label="Delete snapshot"
          data-ocid={`wtn_detail.snapshot.delete_button.${index + 1}`}
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </motion.li>
  );
}

/* ------------------------------------------------------------------ */
/* Snapshot entry form                                                 */
/* ------------------------------------------------------------------ */

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

function WtnSnapshotEntryForm({
  onSubmit,
  submitting,
}: {
  onSubmit: (
    date: bigint,
    nicpHeld: number,
    totalIcpPaid: number,
    redeemableIcpValue: number,
  ) => void;
  submitting: boolean;
}) {
  const [nicpHeld, setNicpHeld] = useState("");
  const [totalIcpPaid, setTotalIcpPaid] = useState("");
  const [redeemableIcpValue, setRedeemableIcpValue] = useState("");
  const [datetime, setDatetime] = useState("");

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const nicp = Number(nicpHeld);
    const paid = Number(totalIcpPaid);
    const redeemable = Number(redeemableIcpValue);
    if (!Number.isFinite(nicp) || nicp < 0) {
      toast.error("Enter a valid nICP held amount");
      return;
    }
    if (!Number.isFinite(paid) || paid < 0) {
      toast.error("Enter a valid total ICP paid amount");
      return;
    }
    if (!Number.isFinite(redeemable) || redeemable < 0) {
      toast.error("Enter a valid redeemable ICP value");
      return;
    }
    if (!datetime) {
      toast.error("Pick a date and time");
      return;
    }
    const date = datetimeLocalToNs(datetime);
    if (date <= 0n) {
      toast.error("Pick a valid date and time");
      return;
    }
    onSubmit(date, nicp, paid, redeemable);
    setNicpHeld("");
    setTotalIcpPaid("");
    setRedeemableIcpValue("");
    setDatetime("");
  };

  return (
    <Card
      className="bg-card/60 border-border/60"
      data-ocid="wtn_detail.snapshot_form"
    >
      <CardHeader>
        <CardTitle className="text-base">Record snapshot</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <p className="text-muted-foreground text-xs">
            Enter the current nICP held, total ICP paid, and redeemable ICP
            value to record a point in time. The backend classifies the snapshot
            automatically based on the deltas vs the previous reading.
          </p>
          <div
            className="bg-muted/40 border-border/60 rounded-lg border p-3"
            data-ocid="wtn_detail.snapshot.guidance"
          >
            <div className="flex items-start gap-2">
              <Info className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <div className="text-muted-foreground space-y-1 text-xs">
                <p className="font-medium">
                  How to fill in the three values for common scenarios:
                </p>
                <ol className="list-decimal space-y-1 pl-4">
                  <li>
                    <span className="text-foreground font-medium">
                      Normal day (no transaction):
                    </span>{" "}
                    keep nICP held and Total ICP paid unchanged, only update
                    Redeemable ICP value.
                  </li>
                  <li>
                    <span className="text-foreground font-medium">
                      Buying more nICP:
                    </span>{" "}
                    nICP held = old + new amount bought; Total ICP paid = old +
                    new ICP spent (cumulative, not just the new payment).
                  </li>
                  <li>
                    <span className="text-foreground font-medium">
                      Unstaking/withdrawing nICP:
                    </span>{" "}
                    nICP held = old minus amount withdrawn; Total ICP paid =
                    reduced proportionally (average cost basis).
                  </li>
                </ol>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label
                htmlFor="wtn-nicp-held"
                data-ocid="wtn_detail.snapshot.nicp_held.label"
              >
                nICP held
              </Label>
              <Input
                id="wtn-nicp-held"
                inputMode="decimal"
                placeholder="0.0000"
                value={nicpHeld}
                onChange={(e) => setNicpHeld(e.target.value)}
                data-ocid="wtn_detail.snapshot.nicp_held.input"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="wtn-total-icp-paid"
                data-ocid="wtn_detail.snapshot.total_icp_paid.label"
              >
                Total ICP paid
              </Label>
              <Input
                id="wtn-total-icp-paid"
                inputMode="decimal"
                placeholder="0.0000"
                value={totalIcpPaid}
                onChange={(e) => setTotalIcpPaid(e.target.value)}
                data-ocid="wtn_detail.snapshot.total_icp_paid.input"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="wtn-redeemable"
                data-ocid="wtn_detail.snapshot.redeemable.label"
              >
                Redeemable ICP value
              </Label>
              <Input
                id="wtn-redeemable"
                inputMode="decimal"
                placeholder="0.0000"
                value={redeemableIcpValue}
                onChange={(e) => setRedeemableIcpValue(e.target.value)}
                data-ocid="wtn_detail.snapshot.redeemable.input"
                className="font-mono"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="wtn-snapshot-datetime"
              data-ocid="wtn_detail.snapshot.datetime.label"
            >
              Timestamp
            </Label>
            <Input
              id="wtn-snapshot-datetime"
              type="datetime-local"
              value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
              data-ocid="wtn_detail.snapshot.datetime.input"
              className="font-mono"
              required
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={submitting}
              data-ocid="wtn_detail.snapshot.submit_button"
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

/* ------------------------------------------------------------------ */
/* Edit snapshot dialog                                                */
/* ------------------------------------------------------------------ */

function WtnEditSnapshotDialog({
  open,
  event,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  event: WtnSnapshot | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (
    newDate: bigint,
    newNicpHeld: number,
    newTotalIcpPaid: number,
    newRedeemableIcpValue: number,
  ) => void;
}) {
  const [nicpHeld, setNicpHeld] = useState("");
  const [totalIcpPaid, setTotalIcpPaid] = useState("");
  const [redeemableIcpValue, setRedeemableIcpValue] = useState("");
  const [datetime, setDatetime] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Sync local state when the dialog opens for a different event.
  const eventKey = event == null ? null : `${event.positionId}-${event.date}`;
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (eventKey !== lastKey) {
    setLastKey(eventKey);
    if (event != null) {
      setNicpHeld(String(event.nicpHeld));
      setTotalIcpPaid(String(event.totalIcpPaid));
      setRedeemableIcpValue(String(event.redeemableIcpValue));
      setDatetime(nsToDatetimeLocal(event.date));
      setError(null);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;
    const nicp = Number(nicpHeld);
    const paid = Number(totalIcpPaid);
    const redeemable = Number(redeemableIcpValue);
    if (!Number.isFinite(nicp) || nicp < 0) {
      setError("Enter a valid nICP held amount");
      return;
    }
    if (!Number.isFinite(paid) || paid < 0) {
      setError("Enter a valid total ICP paid amount");
      return;
    }
    if (!Number.isFinite(redeemable) || redeemable < 0) {
      setError("Enter a valid redeemable ICP value");
      return;
    }
    if (!datetime) {
      setError("Pick a date and time");
      return;
    }
    const newDate = datetimeLocalToNs(datetime);
    if (newDate <= 0n) {
      setError("Pick a valid date and time");
      return;
    }
    onSubmit(newDate, nicp, paid, redeemable);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent data-ocid="wtn_detail.snapshot.edit_dialog">
        <DialogHeader>
          <DialogTitle>Edit snapshot</DialogTitle>
          <DialogDescription>
            Change the nICP held, total ICP paid, redeemable ICP value, and/or
            timestamp for this reading. The backend re-sorts the history and
            recomputes classifications for the edited entry and its new
            neighbors.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label
                htmlFor="wtn-edit-nicp"
                data-ocid="wtn_detail.snapshot.edit.nicp_held.label"
              >
                nICP held
              </Label>
              <Input
                id="wtn-edit-nicp"
                inputMode="decimal"
                placeholder="0.0000"
                value={nicpHeld}
                onChange={(e) => {
                  setNicpHeld(e.target.value);
                  setError(null);
                }}
                data-ocid="wtn_detail.snapshot.edit.nicp_held.input"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="wtn-edit-paid"
                data-ocid="wtn_detail.snapshot.edit.total_icp_paid.label"
              >
                Total ICP paid
              </Label>
              <Input
                id="wtn-edit-paid"
                inputMode="decimal"
                placeholder="0.0000"
                value={totalIcpPaid}
                onChange={(e) => {
                  setTotalIcpPaid(e.target.value);
                  setError(null);
                }}
                data-ocid="wtn_detail.snapshot.edit.total_icp_paid.input"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="wtn-edit-redeemable"
                data-ocid="wtn_detail.snapshot.edit.redeemable.label"
              >
                Redeemable ICP value
              </Label>
              <Input
                id="wtn-edit-redeemable"
                inputMode="decimal"
                placeholder="0.0000"
                value={redeemableIcpValue}
                onChange={(e) => {
                  setRedeemableIcpValue(e.target.value);
                  setError(null);
                }}
                data-ocid="wtn_detail.snapshot.edit.redeemable.input"
                className="font-mono"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="wtn-edit-datetime"
              data-ocid="wtn_detail.snapshot.edit.datetime.label"
            >
              Timestamp
            </Label>
            <Input
              id="wtn-edit-datetime"
              type="datetime-local"
              value={datetime}
              onChange={(e) => {
                setDatetime(e.target.value);
                setError(null);
              }}
              data-ocid="wtn_detail.snapshot.edit.datetime.input"
              required
            />
            <p className="text-muted-foreground text-[11px]">
              Original: {event ? formatTimestampDateTime(event.date) : "—"}
            </p>
          </div>
          {error && (
            <p
              role="alert"
              className="text-destructive text-xs"
              data-ocid="wtn_detail.snapshot.edit.field_error"
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
              data-ocid="wtn_detail.snapshot.edit.cancel_button"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              data-ocid="wtn_detail.snapshot.edit.save_button"
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

/* ------------------------------------------------------------------ */
/* Import historical data panel                                        */
/* ------------------------------------------------------------------ */

type WtnParsedRow = {
  rowIndex: number;
  date: string;
  dateMs: number;
  nicpHeld: number;
  totalIcpPaid: number;
  redeemableIcpValue: number;
  classification: string;
};

type WtnParseError = { rowIndex: number; message: string };

function WtnImportHistoricalPanel({
  positionId,
  onImport,
}: {
  positionId: bigint;
  onImport: ReturnType<typeof useImportWtnHistoricalData>;
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const { rows, errors } = useMemo(() => parseWtnPaste(raw), [raw]);
  const hasErrors = errors.length > 0;
  const canConfirm = rows.length > 0 && !hasErrors && !onImport.isPending;

  const handleConfirm = () => {
    if (!canConfirm) return;
    // Backend timestamps are nanoseconds since epoch. r.dateMs is JS epoch
    // milliseconds from Date.UTC in parseWtnPaste, so multiply by 1_000_000.
    const entries: WtnHistoricalEntry[] = rows.map((r) => ({
      date: BigInt(Math.floor(r.dateMs)) * 1_000_000n,
      nicpHeld: r.nicpHeld,
      totalIcpPaid: r.totalIcpPaid,
      redeemableIcpValue: r.redeemableIcpValue,
    }));
    onImport.mutate(
      { positionId, entries },
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
    <Card
      className="bg-card/60 border-border/60 mt-6"
      data-ocid="wtn_detail.import_panel"
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center justify-between px-6 py-4 text-left transition-smooth"
            data-ocid="wtn_detail.import.toggle"
            aria-expanded={open}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="bg-accent/15 text-accent flex size-9 shrink-0 items-center justify-center rounded-lg">
                <ClipboardPaste className="size-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-foreground text-sm font-semibold">
                  Import historical data
                </h2>
                <p className="text-muted-foreground text-xs">
                  Paste tab-separated rows (DD/MM/YYYY, nICP held, total ICP
                  paid, redeemable ICP value) to backfill past readings.
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
                htmlFor="wtn-historical-paste"
                className="text-sm"
                data-ocid="wtn_detail.import.paste.label"
              >
                Paste rows (date <span className="font-mono">⇥</span> nICP held{" "}
                <span className="font-mono">⇥</span> total ICP paid{" "}
                <span className="font-mono">⇥</span> redeemable ICP value)
              </Label>
              <Textarea
                id="wtn-historical-paste"
                value={raw}
                onChange={(e) => {
                  setRaw(e.target.value);
                  setConfirmed(false);
                }}
                placeholder={
                  "01/01/2024\t100.00\t120.00\t102.50\n15/01/2024\t100.00\t120.00\t103.75\n01/02/2024\t100.00\t120.00\t105.10"
                }
                rows={8}
                className="font-mono text-xs"
                data-ocid="wtn_detail.import.paste.input"
              />
              <p className="text-muted-foreground text-[11px]">
                One row per line, four columns separated by tabs. Date as
                DD/MM/YYYY, all numeric values as decimal ICP amounts.
              </p>
            </div>

            {hasErrors && (
              <div
                role="alert"
                className="border-destructive/40 bg-destructive/10 rounded-lg border p-3"
                data-ocid="wtn_detail.import.error_state"
              >
                <div className="text-destructive flex items-center gap-1.5 text-xs font-semibold">
                  <span className="text-destructive">!</span>
                  {errors.length} unparseable{" "}
                  {errors.length === 1 ? "row" : "rows"} — fix before importing
                </div>
                <ul className="text-destructive/90 mt-1.5 space-y-0.5 font-mono text-[11px]">
                  {errors.map((e) => (
                    <li
                      key={`wtn-err-${e.rowIndex}`}
                      data-ocid={`wtn_detail.import.row_error.${e.rowIndex}`}
                    >
                      Row {e.rowIndex}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {rows.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <Table data-ocid="wtn_detail.import.preview_table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px]">#</TableHead>
                      <TableHead className="text-[11px]">Date</TableHead>
                      <TableHead className="text-[11px] text-right">
                        nICP held
                      </TableHead>
                      <TableHead className="text-[11px] text-right">
                        Total ICP paid
                      </TableHead>
                      <TableHead className="text-[11px] text-right">
                        Redeemable ICP
                      </TableHead>
                      <TableHead className="text-[11px]">
                        Classification
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow
                        key={`wtn-row-${r.rowIndex}`}
                        data-ocid={`wtn_detail.import.preview.row.${i + 1}`}
                      >
                        <TableCell className="text-muted-foreground font-mono text-[11px]">
                          {r.rowIndex}
                        </TableCell>
                        <TableCell className="text-foreground font-mono text-xs">
                          {r.date}
                        </TableCell>
                        <TableCell className="text-foreground font-mono text-right text-xs">
                          {formatWtnIcp(r.nicpHeld, 4, false)}
                        </TableCell>
                        <TableCell className="text-foreground font-mono text-right text-xs">
                          {formatWtnIcp(r.totalIcpPaid, 4, false)}
                        </TableCell>
                        <TableCell className="text-foreground font-mono text-right text-xs">
                          {formatWtnIcp(r.redeemableIcpValue, 4, false)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "gap-1 text-[10px]",
                              r.classification === "capital"
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : r.classification === "withdrawal"
                                  ? "border-primary/40 bg-primary/10 text-primary"
                                  : r.classification === "reward"
                                    ? "border-accent/40 bg-accent/10 text-accent"
                                    : "border-border bg-muted text-muted-foreground",
                            )}
                            data-ocid={`wtn_detail.import.classification.${i + 1}`}
                          >
                            {r.classification}
                          </Badge>
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
                data-ocid="wtn_detail.import.success_state"
              >
                <Sparkles className="size-3.5" />
                Import complete — stats and activity feed refreshed.
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
                  data-ocid="wtn_detail.import.clear_button"
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  data-ocid="wtn_detail.import.confirm_button"
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

/**
 * Parse pasted WTN historical data: 4 tab-separated columns
 * (date DD/MM/YYYY, nicpHeld, totalIcpPaid, redeemableIcpValue), one row
 * per line. Uses EXPLICIT DD/MM/YYYY date parsing — never passes the
 * date string to the native Date constructor (which interprets it as
 * MM/DD/YYYY US format).
 *
 * Classification per row is computed by comparing to the previous row:
 *   - nicpHeld increase  → "capital"   (bought more nICP)
 *   - nicpHeld decrease  → "withdrawal" (unstaked nICP)
 *   - nicpHeld unchanged → "reward"    (organic growth of redeemable value)
 */
function parseWtnPaste(input: string): {
  rows: WtnParsedRow[];
  errors: WtnParseError[];
} {
  const rows: WtnParsedRow[] = [];
  const errors: WtnParseError[] = [];
  const lines = input.split("\n");
  let dataRowIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    dataRowIndex += 1;
    const parts = trimmed.split("\t");
    if (parts.length < 4) {
      errors.push({
        rowIndex: dataRowIndex,
        message: "expected four tab-separated columns",
      });
      continue;
    }
    const dateStr = parts[0].trim();
    const nicpStr = parts[1].trim();
    const paidStr = parts[2].trim();
    const redeemableStr = parts[3].trim();

    // Explicit DD/MM/YYYY parsing — parse day/month/year manually, NEVER
    // pass the string to the Date constructor (US format misinterpretation).
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
    // Construct via Date.UTC(year, monthIndex-1, day) — explicit parsing.
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

    const nicpHeld = Number(nicpStr);
    if (!Number.isFinite(nicpHeld) || nicpHeld < 0) {
      errors.push({
        rowIndex: dataRowIndex,
        message: `non-numeric nICP held "${nicpStr}"`,
      });
      continue;
    }
    const totalIcpPaid = Number(paidStr);
    if (!Number.isFinite(totalIcpPaid) || totalIcpPaid < 0) {
      errors.push({
        rowIndex: dataRowIndex,
        message: `non-numeric total ICP paid "${paidStr}"`,
      });
      continue;
    }
    const redeemableIcpValue = Number(redeemableStr);
    if (!Number.isFinite(redeemableIcpValue) || redeemableIcpValue < 0) {
      errors.push({
        rowIndex: dataRowIndex,
        message: `non-numeric redeemable ICP value "${redeemableStr}"`,
      });
      continue;
    }

    // Classification: compare nicpHeld to the previous row.
    const prev = rows[rows.length - 1];
    let classification: string;
    if (prev == null) {
      classification = "firstReading";
    } else {
      const nicpDelta = nicpHeld - prev.nicpHeld;
      if (nicpDelta > 0) {
        classification = "capital";
      } else if (nicpDelta < 0) {
        classification = "withdrawal";
      } else {
        classification = "reward";
      }
    }

    rows.push({
      rowIndex: dataRowIndex,
      date: dateStr,
      dateMs: dateObj.getTime(),
      nicpHeld,
      totalIcpPaid,
      redeemableIcpValue,
      classification,
    });
  }
  return { rows, errors };
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */

function WtnDetailSkeleton() {
  return (
    <div className="bg-background mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <Skeleton className="mb-6 h-8 w-32" />
      <Card className="bg-card/60">
        <CardHeader>
          <Skeleton className="h-12 w-full" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((n) => (
              <Skeleton
                key={`wtn-stat-skeleton-${n}`}
                className="h-14 w-full"
              />
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="mt-6 grid grid-cols-1 gap-6">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}

export default WtnDetailPage;
