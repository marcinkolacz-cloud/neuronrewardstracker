/**
 * React Query hooks for the invite-code access control system.
 *   useInviteCodes       — list all invite codes with status + created date (listInviteCodes)
 *   useGenerateInvite   — create a new single-use invite code (generateInviteCode)
 *   useRevokeInvite      — invalidate an existing code (revokeInviteCode)
 *
 * useIsCallerAdmin is defined canonically in @/hooks/use-access (the
 * access-control layer) and re-exported here so the admin page can import
 * everything it needs from one module. Sharing the single ['access',
 * 'is-admin'] cache between AppHeader and the admin page keeps the admin
 * nav link and the admin-page gate in sync.
 *
 * Return types match the generated backend bindings:
 *   isCallerAdmin     → boolean
 *   listInviteCodes   → InviteCode[] { code, status, createdAt }
 *   generateInviteCode → string (the new code)
 *   revokeInviteCode  → void
 *
 * The admin-only enforcement happens in the backend (Principal check is the
 * real security boundary); these hooks just call the methods. The admin page
 * additionally calls useIsCallerAdmin to render a not-authorized message for
 * non-admins before the admin-only list ever loads.
 */

import {
  type InviteCode,
  type InviteCodeStatus,
  useBackendActor,
} from "@/lib/backend-actor";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Re-export the canonical admin-check hook from the access-control layer so
// callers of @/hooks/use-invites have a single import surface. The query
// cache (['access', 'is-admin']) is shared with AppHeader.
export { useIsCallerAdmin } from "@/hooks/use-access";

const INVITES_KEY = ["invite-codes"] as const;

/** List all invite codes with status + created date (admin-only). */
export function useInviteCodes() {
  const { actor, isFetching } = useBackendActor();
  return useQuery<InviteCode[]>({
    queryKey: INVITES_KEY,
    queryFn: async () => {
      if (!actor) return [];
      return actor.listInviteCodes();
    },
    enabled: !!actor && !isFetching,
  });
}

/**
 * Generate a new single-use invite code. Invalidates the invite-codes list on
 * success so the new code appears immediately. Returns the new code string.
 */
export function useGenerateInvite() {
  const queryClient = useQueryClient();
  const { actor } = useBackendActor();
  return useMutation<string, Error, void>({
    mutationFn: async () => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.generateInviteCode();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INVITES_KEY });
    },
  });
}

/**
 * Revoke an invite code. Invalidates the invite-codes list on success so the
 * status flips to #revoked in the UI immediately.
 */
export function useRevokeInvite() {
  const queryClient = useQueryClient();
  const { actor } = useBackendActor();
  return useMutation<void, Error, string>({
    mutationFn: async (code) => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.revokeInviteCode(code);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INVITES_KEY });
    },
  });
}

/** Re-export the status enum so the admin page can switch on it without
 * reaching into @/backend directly. */
export type { InviteCodeStatus };
