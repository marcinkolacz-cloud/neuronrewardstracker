/**
 * ProtectedRoute — gates a route behind authentication.
 *
 * Uses the existing InternetIdentityProvider context as the single source of
 * truth for auth/session. When the user is not authenticated, renders the
 * SignInPrompt instead of the route's children. While the auth client is
 * initializing, shows a minimal loading state (not the sign-in prompt) so
 * restored sessions don't flash the sign-in screen.
 */

import { SignInPrompt } from "@/components/SignInPrompt";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isInitializing } = useAuth();

  if (isInitializing) {
    return (
      <div className="bg-background flex min-h-[calc(100vh-4rem)] flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <SignInPrompt />;
  }

  return <>{children}</>;
}
