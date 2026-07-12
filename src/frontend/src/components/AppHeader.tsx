/**
 * App header — the elevated top bar of the app shell.
 *
 * Shows the brand, primary navigation, and (when authenticated) the
 * signed-in principal plus a sign-out action. Uses bg-card + border-b +
 * shadow-subtle so it reads as a distinct structural zone above the
 * bg-background content area.
 */

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth, useShortPrincipal } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "@tanstack/react-router";
import { BrainCircuit, LogOut, RefreshCw } from "lucide-react";

interface NavItem {
  label: string;
  to: string;
  marker: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/", marker: "nav.dashboard" },
  { label: "Add Neuron", to: "/add-neuron", marker: "nav.add_neuron" },
];

interface AppHeaderProps {
  /** Optional right-side action (e.g. a global sync button). */
  rightAction?: React.ReactNode;
}

export function AppHeader({ rightAction }: AppHeaderProps) {
  const { isAuthenticated, clear, isLoggingIn, login } = useAuth();
  const principal = useShortPrincipal();
  const location = useLocation();

  return (
    <header className="bg-card/80 border-border/60 sticky top-0 z-40 w-full border-b shadow-subtle backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2.5 transition-smooth hover:opacity-80"
          data-ocid="nav.brand"
        >
          <span className="bg-gradient-primary flex size-9 items-center justify-center rounded-lg shadow-sm">
            <BrainCircuit className="size-5 text-primary-foreground" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-foreground font-display text-sm font-semibold tracking-tight">
              Neuron Rewards
            </span>
            <span className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
              Tracker
            </span>
          </span>
        </Link>

        <Separator
          orientation="vertical"
          className="mx-1 hidden h-8 sm:block"
        />

        {/* Primary nav */}
        <nav className="hidden items-center gap-1 sm:flex" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const active =
              item.to === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                data-ocid={item.marker}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-smooth",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {rightAction}

          {isAuthenticated ? (
            <div className="flex items-center gap-2.5">
              <div className="hidden items-center gap-2.5 md:flex">
                <Avatar className="border-border size-8 border">
                  <AvatarFallback className="bg-primary/10 text-primary font-mono text-xs font-semibold">
                    {principal ? principal.slice(0, 2).toUpperCase() : "??"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col leading-none">
                  <span className="text-foreground font-mono text-xs font-medium">
                    {principal}
                  </span>
                  <Badge
                    variant="outline"
                    className="border-primary/30 bg-primary/5 text-primary mt-1 px-1.5 py-0 text-[10px]"
                  >
                    Signed in
                  </Badge>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={clear}
                data-ocid="header.sign_out"
                aria-label="Sign out"
                className="text-muted-foreground hover:text-destructive"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={login}
              disabled={isLoggingIn}
              data-ocid="header.sign_in"
              className="text-muted-foreground"
            >
              <RefreshCw
                className={isLoggingIn ? "size-4 animate-spin" : "size-4"}
              />
              {isLoggingIn ? "Connecting…" : "Sign in"}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
