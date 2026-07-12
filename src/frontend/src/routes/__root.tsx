/**
 * Root route — re-exports the root route component for clarity.
 *
 * The actual root route definition lives in router.tsx (createRoute with
 * id "__root"). This file exists so the routes/ directory mirrors the
 * route tree and is easy to navigate. The shell (AppHeader + ProtectedRoute
 * + Outlet + branding footer) is defined in router.tsx's RootComponent.
 */

export { rootRoute } from "@/router";
