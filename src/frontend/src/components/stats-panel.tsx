/**
 * Shared reward-statistics + monthly-breakdown panels.
 *
 * Extracted from routes/neuron-detail.$neuronId.tsx so the dashboard can
 * render a portfolio-wide "Reward statistics" + "Monthly breakdown" panel
 * using the exact same layout, StatRow component, and recharts BarChart as
 * the per-neuron page. Both surfaces consume a MonthlyBreakdown[] and a
 * stats-shaped object; the dashboard feeds PortfolioRewardStats while the
 * neuron detail page feeds NeuronStats.
 *
 * Exports:
 *   - StatRow                  reusable label/value row
 *   - RewardStatsCard          "Reward statistics" card (capital, rewards,
 *                              avg daily, APY, overall return, readings)
 *   - MonthlyBreakdownSection  "Monthly breakdown" card (BarChart + Table)
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { MonthlyBreakdown } from "@/lib/backend-actor";
import {
  E8S_PER_ICP,
  formatApy,
  formatIcp,
  formatIcpCompact,
  formatPercent,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { BarChart3 } from "lucide-react";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

/**
 * Reusable label/value row used inside the Reward statistics card. Matches
 * the per-neuron page styling: muted label left, mono semibold value right.
 */
export function StatRow({
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
 * Shape consumed by RewardStatsCard. Both NeuronStats and
 * PortfolioRewardStats satisfy this — the dashboard passes the portfolio
 * variant, the neuron detail page passes the per-neuron variant. Fields
 * are read defensively (?? 0n / ?? 0) so the card renders even if a stats
 * payload is missing an additive field.
 */
export type RewardStatsLike = {
  totalCapitalContributedE8s?: bigint | null;
  totalRewardsE8s?: bigint | null;
  averageDailyRewardE8s?: bigint | null;
  apy30d?: number | null;
  overallReturnPct?: number | null;
  monthly?: MonthlyBreakdown[] | null;
};

/**
 * "Reward statistics" card — capital contributed, total rewards, average
 * daily reward, APY (30-day), overall return, and monthly readings count.
 * Reuses the exact StatRow + Separator layout from the per-neuron page so
 * the portfolio panel is visually identical to the neuron panel.
 */
export function RewardStatsCard({
  stats,
  loading,
  title = "Reward statistics",
  dataOcidPrefix = "dashboard.reward_stats",
}: {
  stats: RewardStatsLike | null | undefined;
  loading: boolean;
  title?: string;
  dataOcidPrefix?: string;
}) {
  const monthlyCount = stats?.monthly?.length ?? 0;
  return (
    <Card className="bg-card/60 border-border/60">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {!stats || loading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <StatRow
              label="Total capital contributed"
              value={formatIcp(stats.totalCapitalContributedE8s ?? 0n, 4)}
              dataOcid={`${dataOcidPrefix}.total_capital`}
            />
            <Separator />
            <StatRow
              label="Total rewards earned"
              value={formatIcp(stats.totalRewardsE8s ?? 0n, 4)}
              dataOcid={`${dataOcidPrefix}.total_rewards`}
            />
            <Separator />
            <StatRow
              label="Average daily reward"
              value={formatIcp(stats.averageDailyRewardE8s ?? 0n, 4)}
            />
            <Separator />
            <StatRow
              label="APY (30-day)"
              value={formatApy(stats.apy30d ?? 0)}
              dataOcid={`${dataOcidPrefix}.apy30d`}
            />
            <Separator />
            <StatRow
              label="Overall return"
              value={formatPercent(stats.overallReturnPct ?? 0)}
              dataOcid={`${dataOcidPrefix}.overall_return`}
            />
            <Separator />
            <StatRow label="Monthly readings" value={monthlyCount.toString()} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Monthly breakdown section — table + bar chart of total ICP earned per
 * calendar month. Identical to the per-neuron MonthlyBreakdownSection:
 * same recharts BarChart (chart-1 cyan), same Table with Month / Total
 * earned / MoM delta / YoY delta / Readings columns, same empty state.
 *
 * The YoY delta is computed in the frontend by looking up the same calendar
 * month in the previous year; a null YoY (no prior-year data) renders "—".
 */
export function MonthlyBreakdownSection({
  monthly,
  dataOcidPrefix = "dashboard.monthly",
}: {
  monthly: MonthlyBreakdown[];
  dataOcidPrefix?: string;
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

  // Index months by `${year}-${month}` for the YoY lookup.
  const byKey = useMemo(() => {
    const map = new Map<string, MonthlyBreakdown>();
    for (const m of sorted) {
      map.set(`${Number(m.year)}-${Number(m.month)}`, m);
    }
    return map;
  }, [sorted]);

  const chartData = useMemo(
    () =>
      sorted.map((m) => ({
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
              <Table data-ocid={`${dataOcidPrefix}.table`}>
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
                        data-ocid={`${dataOcidPrefix}.row.${i + 1}`}
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
