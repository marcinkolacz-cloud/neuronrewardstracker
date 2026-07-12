/**
 * TanStack Router — route tree for the Neuron Rewards Tracker.
 *
 * Routes:
 *   /                          Dashboard (portfolio summary + neuron grid)
 *   /add-neuron                Add neuron form
 *   /neuron-detail/:neuronId  Neuron detail (chart, activity feed, snapshot)
 *   /add-wtn                   Add WTN position form
 *   /wtn-detail/:positionId    WTN detail (stats, activity feed, snapshot)
 *   /admin                     Admin panel (invite-code access control)
 *
 * The root route renders the app shell (AppHeader + ProtectedRoute +
 * branding footer). All child routes render inside <Outlet />. The /admin
 * route is protected by ProtectedRoute (II auth) and additionally checks
 * admin status inside the page — non-admins see a not-authorized message.
 */

import { AppHeader } from "@/components/AppHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AddNeuronPage } from "@/routes/add-neuron";
import { AddWtnPage } from "@/routes/add-wtn";
import { AdminPage } from "@/routes/admin";
import { DashboardPage } from "@/routes/index";
import { NeuronDetailPage } from "@/routes/neuron-detail.$neuronId";
import { WtnDetailPage } from "@/routes/wtn-detail.$positionId";
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

export const rootRoute = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <AppHeader />
      <ProtectedRoute>
        <main className="flex-1">
          <Outlet />
        </main>
      </ProtectedRoute>
      <footer className="bg-muted/40 border-border/60 border-t">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs sm:flex-row sm:px-6 lg:px-8">
          <p className="text-muted-foreground font-mono">
            © {new Date().getFullYear()}. Built with love using{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(
                typeof window !== "undefined"
                  ? window.location.hostname
                  : "neuron-tracker",
              )}`}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              caffeine.ai
            </a>
          </p>
          <p className="text-muted-foreground font-mono">
            NNS governance · rrkah-fqaaa-aaaaa-aaaaq-cai
          </p>
        </div>
      </footer>
    </div>
  );
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

const addNeuronRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/add-neuron",
  component: AddNeuronPage,
});

const neuronDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/neuron-detail/$neuronId",
  component: NeuronDetailPage,
});

const addWtnRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/add-wtn",
  component: AddWtnPage,
});

const wtnDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/wtn-detail/$positionId",
  component: WtnDetailPage,
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  addNeuronRoute,
  neuronDetailRoute,
  addWtnRoute,
  wtnDetailRoute,
  adminRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
