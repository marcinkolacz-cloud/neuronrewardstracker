/**
 * Auth context wrapper.
 *
 * The InternetIdentityProvider from @caffeineai/core-infrastructure is the
 * single source of truth for auth/session. This module re-exports its hook
 * under a stable, app-local name and adds a couple of small helpers
 * (principal formatting, sign-out) so the rest of the app does not import
 * the infrastructure package directly.
 */

import { shortenPrincipal } from "@/lib/format";
import { useInternetIdentity as useII } from "@caffeineai/core-infrastructure";

export { useII };
export type {
  InternetIdentityContext,
  Status,
} from "@caffeineai/core-infrastructure";

/** The canonical auth hook for this app. */
export function useAuth() {
  const ctx = useII();
  return ctx;
}

/** The signed-in principal as a string, or null. */
export function usePrincipal(): string | null {
  const { identity } = useII();
  const principal = identity?.getPrincipal();
  return principal ? principal.toString() : null;
}

/** A shortened, display-friendly principal string, or null. */
export function useShortPrincipal(): string | null {
  const principal = usePrincipal();
  return principal ? shortenPrincipal(principal) : null;
}
