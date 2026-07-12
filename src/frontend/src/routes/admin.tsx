/**
 * Admin page — invite-code access control panel.
 *
 * Only the admin Principal can access this panel. Non-admins see a
 * "Not authorized" message within the page (the route is still reachable
 * behind ProtectedRoute / II auth, but the admin check is the real gate).
 * The backend Principal check remains the real security boundary for every
 * admin-only method; useIsCallerAdmin is a UX gate that lets the page hide
 * the admin surface from non-admins before any admin-only call is made.
 *
 * Surface:
 *   - "Generate new invite code" button → generateInviteCode, displays the
 *     new code in a copyable field.
 *   - Table of all invite codes with status (unused / used / revoked) and
 *     created date.
 *   - "Revoke" button per code → revokeInviteCode, refreshes the list.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type InviteCodeStatus,
  useGenerateInvite,
  useInviteCodes,
  useIsCallerAdmin,
  useRevokeInvite,
} from "@/hooks/use-invites";
import { formatTimestampDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";

export function AdminPage() {
  const { data: isAdmin, isLoading: adminLoading } = useIsCallerAdmin();

  if (adminLoading) {
    return <AdminLoadingSkeleton />;
  }

  if (!isAdmin) {
    return <NotAuthorized />;
  }

  return <AdminPanel />;
}

function AdminPanel() {
  const { data: codes, isLoading } = useInviteCodes();
  const generate = useGenerateInvite();
  const revoke = useRevokeInvite();
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  const handleGenerate = async () => {
    setCopied(false);
    try {
      const code = await generate.mutateAsync();
      setGeneratedCode(code);
      toast.success("New invite code generated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate invite code",
      );
    }
  };

  const handleCopy = async () => {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      toast.success("Invite code copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    const code = revokeTarget;
    setRevokeTarget(null);
    try {
      await revoke.mutateAsync(code);
      toast.success("Invite code revoked");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to revoke invite code",
      );
    }
  };

  const sortedCodes = [...(codes ?? [])].sort((a, b) =>
    Number(b.createdAt - a.createdAt),
  );

  return (
    <div className="bg-background">
      <div className="relative mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
                <ShieldCheck className="size-5" />
              </span>
              <div>
                <h1 className="text-foreground font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  Admin
                </h1>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  Manage invite codes that grant access to the tracker.
                </p>
              </div>
            </div>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generate.isPending}
            data-ocid="admin.generate_invite"
          >
            {generate.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Generate new invite code
          </Button>
        </div>

        {/* Newly generated code panel */}
        {generatedCode && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-6"
          >
            <Card className="bg-primary/5 border-primary/30">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2 text-base font-semibold">
                  <KeyRound className="text-primary size-4" />
                  New invite code
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-muted-foreground text-sm">
                  Share this single-use code with the person you want to grant
                  access to. They will be prompted to enter it after signing in
                  with Internet Identity.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <code
                    className="bg-card border-border text-foreground font-mono text-base font-semibold tracking-wide rounded-md border px-4 py-2.5 break-all"
                    data-ocid="admin.generated_code"
                  >
                    {generatedCode}
                  </code>
                  <Button
                    variant="outline"
                    onClick={handleCopy}
                    data-ocid="admin.copy_code"
                  >
                    {copied ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Invite codes table */}
        <section className="mt-8" data-ocid="admin.codes_section">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-foreground font-display text-lg font-semibold tracking-tight">
              Invite codes
            </h2>
            <Badge variant="secondary" className="font-mono">
              {codes?.length ?? 0}
            </Badge>
          </div>

          <Card className="bg-card/60 border-border/60">
            <CardContent className="p-0">
              {isLoading ? (
                <CodesTableSkeleton />
              ) : !codes || codes.length === 0 ? (
                <EmptyCodes
                  onGenerate={handleGenerate}
                  loading={generate.isPending}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Code</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="pr-4 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedCodes.map((invite, i) => (
                      <InviteCodeRow
                        key={invite.code}
                        code={invite.code}
                        status={invite.status}
                        createdAt={invite.createdAt}
                        index={i}
                        revoking={
                          revoke.isPending && revoke.variables === invite.code
                        }
                        onRevoke={() => setRevokeTarget(invite.code)}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      {/* Revoke confirmation dialog */}
      <Dialog
        open={revokeTarget !== null}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
      >
        <DialogContent data-ocid="admin.revoke_dialog">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <ShieldAlert className="text-destructive size-5" />
              Revoke invite code?
            </DialogTitle>
            <DialogDescription>
              This will permanently invalidate the code. Anyone who has not yet
              redeemed it will no longer be able to use it. This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          {revokeTarget && (
            <code className="bg-muted text-foreground font-mono text-sm rounded-md px-3 py-2 break-all">
              {revokeTarget}
            </code>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" data-ocid="admin.revoke_cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleRevoke}
              disabled={revoke.isPending}
              data-ocid="admin.revoke_confirm"
            >
              {revoke.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Revoke code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InviteCodeRow({
  code,
  status,
  createdAt,
  index,
  revoking,
  onRevoke,
}: {
  code: string;
  status: InviteCodeStatus;
  createdAt: bigint;
  index: number;
  revoking: boolean;
  onRevoke: () => void;
}) {
  const isRevoked = status === ("revoked" as InviteCodeStatus);
  return (
    <TableRow data-ocid={`admin.codes.item.${index + 1}`}>
      <TableCell className="pl-4">
        <code className="text-foreground font-mono text-sm font-medium break-all">
          {code}
        </code>
      </TableCell>
      <TableCell>
        <StatusBadge status={status} index={index} />
      </TableCell>
      <TableCell className="text-muted-foreground font-mono text-xs">
        {formatTimestampDateTime(createdAt)}
      </TableCell>
      <TableCell className="pr-4 text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={onRevoke}
          disabled={isRevoked || revoking}
          data-ocid={`admin.revoke_button.${index + 1}`}
          className={cn(
            "text-muted-foreground hover:text-destructive",
            isRevoked && "opacity-40",
          )}
        >
          {revoking ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
          Revoke
        </Button>
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({
  status,
  index,
}: {
  status: InviteCodeStatus;
  index: number;
}) {
  if (status === ("used" as InviteCodeStatus)) {
    return (
      <Badge
        variant="outline"
        className="border-border bg-muted text-muted-foreground gap-1 text-[10px]"
        data-ocid={`admin.codes.status.used.${index + 1}`}
      >
        <span className="bg-muted-foreground size-1.5 rounded-full" />
        Used
      </Badge>
    );
  }
  if (status === ("revoked" as InviteCodeStatus)) {
    return (
      <Badge
        variant="outline"
        className="border-destructive/40 bg-destructive/10 text-destructive gap-1 text-[10px]"
        data-ocid={`admin.codes.status.revoked.${index + 1}`}
      >
        <span className="bg-destructive size-1.5 rounded-full" />
        Revoked
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-primary/30 bg-primary/5 text-primary gap-1 text-[10px]"
      data-ocid={`admin.codes.status.unused.${index + 1}`}
    >
      <span className="bg-primary size-1.5 rounded-full" />
      Unused
    </Badge>
  );
}

function EmptyCodes({
  onGenerate,
  loading,
}: {
  onGenerate: () => void;
  loading: boolean;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center px-6 py-16 text-center"
      data-ocid="admin.codes.empty_state"
    >
      <span className="bg-primary/10 text-primary mb-4 flex size-14 items-center justify-center rounded-2xl">
        <KeyRound className="size-7" />
      </span>
      <h3 className="text-foreground font-display text-lg font-semibold">
        No invite codes yet
      </h3>
      <p className="text-muted-foreground mt-2 max-w-sm text-sm">
        Generate a single-use invite code to grant someone access to the
        tracker.
      </p>
      <Button
        onClick={onGenerate}
        disabled={loading}
        className="mt-6"
        data-ocid="admin.codes.empty_state.generate"
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Plus className="size-4" />
        )}
        Generate invite code
      </Button>
    </div>
  );
}

function NotAuthorized() {
  return (
    <div className="bg-background">
      <div className="mx-auto flex max-w-md flex-col items-center justify-center px-4 py-24 text-center">
        <span className="bg-destructive/10 text-destructive mb-5 flex size-16 items-center justify-center rounded-2xl">
          <Lock className="size-8" />
        </span>
        <h1 className="text-foreground font-display text-2xl font-semibold tracking-tight">
          Not authorized
        </h1>
        <p className="text-muted-foreground mt-3 text-sm">
          The admin panel is restricted to the admin Principal. If you believe
          this is a mistake, contact the canister owner.
        </p>
      </div>
    </div>
  );
}

function AdminLoadingSkeleton() {
  return (
    <div className="bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-9 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="mt-8 h-10 w-56" />
        <Skeleton className="mt-6 h-64 w-full" />
      </div>
    </div>
  );
}

function CodesTableSkeleton() {
  const rows = [0, 1, 2];
  return (
    <div className="space-y-2 p-4">
      {rows.map((n) => (
        <Skeleton key={`codes-skeleton-${n}`} className="h-12 w-full" />
      ))}
    </div>
  );
}
