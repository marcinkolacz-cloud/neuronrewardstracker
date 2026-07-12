/**
 * InviteCodeGate — the 'Enter invite code' screen shown by ProtectedRoute when
 * the signed-in caller has not been granted access.
 *
 * Renders an aurora-glow hero with bg-gradient-primary containing an Input +
 * submit Button wired to useCheckAccess. Invalid / used / revoked codes surface
 * as a destructive Alert. A one-time 'Set me as admin' Button is shown only
 * when the signed-in principal matches the configured owner principal AND the
 * admin has not yet been bootstrapped (useIsAdminBootstrapped returns false);
 * it calls useSetAdminPrincipal.
 *
 * The local 'granted' flag is UX-only; the backend Principal check is the
 * real security boundary.
 */

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCheckAccess,
  useIsAdminBootstrapped,
  useSetAdminPrincipal,
} from "@/hooks/use-access";
import { usePrincipal } from "@/lib/auth";
import { KeyRound, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";

/** Configured owner principal eligible for the one-time admin bootstrap. */
const OWNER_PRINCIPAL =
  "udhkd-o3pbb-miae2-v2xfd-57zp3-w2xd2-s2r22-ep2nt-cyses-d3uhy-sqe";

export function InviteCodeGate() {
  const [code, setCode] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const checkAccess = useCheckAccess();
  const setAdminPrincipal = useSetAdminPrincipal();
  const principal = usePrincipal();
  const adminBootstrapped = useIsAdminBootstrapped();

  const isOwner = principal === OWNER_PRINCIPAL;
  const showSetAdmin =
    isOwner && !adminBootstrapped.isLoading && !adminBootstrapped.data;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const trimmed = code.trim();
    if (!trimmed) {
      setErrorMsg("Enter an invite code to continue.");
      return;
    }
    checkAccess.mutate(trimmed, {
      onError: (err) => {
        setErrorMsg(
          err.message ||
            "That code could not be verified. It may be invalid, already used, or revoked.",
        );
      },
    });
  };

  const handleSetAdmin = () => {
    setAdminPrincipal.mutate(undefined, {
      onError: (err) => {
        setErrorMsg(err.message || "Could not set admin. Please try again.");
      },
    });
  };

  return (
    <div className="bg-background relative flex min-h-[calc(100vh-4rem)] flex-1 items-center justify-center overflow-hidden px-4 py-12">
      {/* Aurora-glow backdrop */}
      <div
        aria-hidden
        className="bg-gradient-primary pointer-events-none absolute inset-0 opacity-20 blur-3xl"
        style={{
          maskImage:
            "radial-gradient(ellipse 60% 50% at 50% 35%, black 0%, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 60% 50% at 50% 35%, black 0%, transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-md">
        <div className="bg-card border-border shadow-subtle rounded-2xl border p-8">
          {/* Hero header */}
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="bg-gradient-primary mb-4 flex size-14 items-center justify-center rounded-2xl shadow-sm">
              <KeyRound className="size-7 text-primary-foreground" />
            </span>
            <h1 className="text-foreground font-display text-2xl font-semibold tracking-tight">
              Access required
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Enter your invite code to unlock the Neuron Rewards Tracker.
            </p>
          </div>

          {/* Invite code form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-code" className="text-foreground">
                Invite code
              </Label>
              <Input
                id="invite-code"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="Enter your code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={checkAccess.isPending}
                data-ocid="invite_code.input"
                className="font-mono"
              />
            </div>

            {errorMsg && (
              <Alert variant="destructive" data-ocid="invite_code.error_state">
                <AlertTitle>Couldn’t verify code</AlertTitle>
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={checkAccess.isPending || !code.trim()}
              data-ocid="invite_code.submit_button"
            >
              {checkAccess.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Unlock access
                </>
              )}
            </Button>
          </form>

          {/* One-time admin bootstrap — owner only, before bootstrap */}
          {showSetAdmin && (
            <div className="border-border mt-6 border-t pt-6">
              <div className="mb-3 flex items-start gap-2.5">
                <ShieldCheck className="text-primary mt-0.5 size-5 shrink-0" />
                <div className="flex flex-col">
                  <p className="text-foreground text-sm font-medium">
                    Owner bootstrap
                  </p>
                  <p className="text-muted-foreground text-xs">
                    You’re signed in as the configured owner. Set yourself as
                    admin to manage invite codes.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleSetAdmin}
                disabled={setAdminPrincipal.isPending}
                data-ocid="invite_code.set_admin_button"
              >
                {setAdminPrincipal.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Setting admin…
                  </>
                ) : (
                  "Set me as admin"
                )}
              </Button>
            </div>
          )}
        </div>

        <p className="text-muted-foreground mt-6 text-center text-xs">
          Don’t have a code? Ask the admin for an invite.
        </p>
      </div>
    </div>
  );
}
