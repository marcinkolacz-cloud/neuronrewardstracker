/**
 * SignInPrompt — the unauthenticated landing surface.
 *
 * Shown by ProtectedRoute when the user is not authenticated. Renders a
 * centered, editorial hero with the aurora gradient and a single primary
 * CTA that triggers the Internet Identity login flow from the existing
 * InternetIdentityProvider context.
 */

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { BrainCircuit, ShieldCheck, Zap } from "lucide-react";

export function SignInPrompt() {
  const { login, isLoggingIn, isInitializing } = useAuth();
  const busy = isLoggingIn || isInitializing;

  return (
    <div className="bg-background relative flex min-h-[calc(100vh-4rem)] flex-1 items-center justify-center overflow-hidden px-4">
      {/* Aurora glow backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, oklch(0.78 0.16 195 / 0.18) 0%, oklch(0.145 0.014 260 / 0) 70%), radial-gradient(40% 40% at 80% 80%, oklch(0.78 0.15 75 / 0.12) 0%, oklch(0.145 0.014 260 / 0) 70%)",
        }}
      />
      <div className="relative z-10 mx-auto flex max-w-md flex-col items-center text-center">
        <span className="bg-gradient-primary mb-6 flex size-16 items-center justify-center rounded-2xl shadow-lg">
          <BrainCircuit className="size-8 text-primary-foreground" />
        </span>
        <h1 className="text-foreground font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Track your NNS neuron rewards
        </h1>
        <p className="text-muted-foreground mt-4 max-w-sm text-base leading-relaxed">
          Sign in with Internet Identity to track staked ICP, monitor maturity
          growth, and sync reward events from NNS governance.
        </p>

        <Button
          size="lg"
          onClick={login}
          disabled={busy}
          data-ocid="signin.primary_button"
          className="bg-gradient-primary mt-8 h-11 w-full max-w-xs text-primary-foreground shadow-md transition-smooth hover:opacity-90 disabled:opacity-60"
        >
          {busy
            ? "Connecting to Internet Identity…"
            : "Sign in with Internet Identity"}
        </Button>

        <div className="mt-10 flex items-center gap-6 text-muted-foreground">
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck className="text-primary size-4" />
            <span>Self-custodial</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Zap className="text-accent size-4" />
            <span>Live governance sync</span>
          </div>
        </div>
      </div>
    </div>
  );
}
