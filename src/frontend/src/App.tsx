/**
 * App — renders the TanStack Router provider.
 *
 * main.tsx wraps <App /> in QueryClientProvider + InternetIdentityProvider.
 * The router (router.tsx) owns the route tree and the root shell
 * (AppHeader + ProtectedRoute + Outlet + branding footer).
 */

import { router } from "@/router";
import { RouterProvider } from "@tanstack/react-router";

export default function App() {
  return <RouterProvider router={router} />;
}
