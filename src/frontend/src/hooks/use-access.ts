/**
 * React Query hooks for the access-control layer of the invite-code system.
 *   useCheckAccess         — redeem an invite code (checkAccess); caches a
 *                            local UX-only 'granted' flag in localStorage and
 *                            invalidates the granted-access query on success.
 *   useIsCallerGranted     — whether the signed-in caller has been granted
 *                            access (isCallerGranted). The real security
 *                            boundary is the backend Principal check; this
 *                            query is the UX gate used by ProtectedRoute.
 *   useIsAdminBootstrapped — whether an admin has been set yet
 *                            (isAdminBootstrapped). Drives the one-time
 *                            'Set me as admin' affordance in InviteCodeGate.
 *   useIsCallerAdmin       — whether the signed-in caller is the admin
 *                            (isCallerAdminPrincipal). Drives the /admin nav link.
 *   useSetAdminPrincipal   — one-time admin bootstrap (setAdminPrincipal).
 *                            Invalidates the admin-bootstrapped, granted, and
 *                            is-admin queries on success so the UI flips
 *                            immediately.
 *
 * Query keys are namespaced under ['access', ...] per the dispatch contract.
 * The local 'granted' flag in localStorage is UX-only — it is never trusted
 * as a security boundary; the backend isCallerGranted() check is.
 */

import { useBackendActor } from "@/lib/backend-actor";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const GRANTED_FLAG_KEY = "neuron-rewards:granted";

const KEYS = {
  granted: ["access", "granted"] as const,
  adminBootstrapped: ["access", "admin-bootstrapped"] as const,
  isAdmin: ["access", "is-admin"] as const,
};

/** Read the UX-only local 'granted' flag. Never a security boundary. */
export function readLocalGranted(): boolean {
  try {
    return localStorage.getItem(GRANTED_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

function writeLocalGranted(value: boolean) {
  try {
    if (value) localStorage.setItem(GRANTED_FLAG_KEY, "1");
    else localStorage.removeItem(GRANTED_FLAG_KEY);
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/**
 * Redeem an invite code. On success, cache the UX-only local 'granted' flag
 * and invalidate the granted-access query so ProtectedRoute re-evaluates
 * immediately. The backend checkAccess() call is the real gate.
 */
export function useCheckAccess() {
  const queryClient = useQueryClient();
  const { actor } = useBackendActor();
  return useMutation<boolean, Error, string>({
    mutationFn: async (code) => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.checkAccess(code);
    },
    onSuccess: (granted) => {
      if (granted) {
        writeLocalGranted(true);
        void queryClient.invalidateQueries({ queryKey: KEYS.granted });
      }
    },
  });
}

/**
 * Whether the signed-in caller has been granted access. This is the UX gate
 * used by ProtectedRoute to decide between rendering children or the
 * InviteCodeGate. The backend Principal check is the real security boundary.
 */
export function useIsCallerGranted() {
  const { actor, isFetching } = useBackendActor();
  return useQuery<boolean>({
    queryKey: KEYS.granted,
    queryFn: async () => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.isCallerGranted();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Whether an admin has been bootstrapped yet (one-time gate). */
export function useIsAdminBootstrapped() {
  const { actor, isFetching } = useBackendActor();
  return useQuery<boolean>({
    queryKey: KEYS.adminBootstrapped,
    queryFn: async () => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.isAdminBootstrapped();
    },
    enabled: !!actor && !isFetching,
  });
}

/**
 * Whether the signed-in caller is the admin. Drives the conditional /admin
 * nav link in AppHeader. The backend Principal check remains the real
 * security boundary for every admin-only method.
 */
export function useIsCallerAdmin() {
  const { actor, isFetching } = useBackendActor();
  return useQuery<boolean>({
    queryKey: KEYS.isAdmin,
    queryFn: async () => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.isCallerAdminPrincipal();
    },
    enabled: !!actor && !isFetching,
  });
}

/**
 * One-time admin bootstrap. Sets the caller as admin via setAdminPrincipal().
 * On success, invalidates the admin-bootstrapped, granted, and is-admin
 * queries so the UI flips immediately (admin link appears, gate opens).
 */
export function useSetAdminPrincipal() {
  const queryClient = useQueryClient();
  const { actor } = useBackendActor();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.setAdminPrincipal();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: KEYS.adminBootstrapped,
      });
      void queryClient.invalidateQueries({ queryKey: KEYS.granted });
      void queryClient.invalidateQueries({ queryKey: KEYS.isAdmin });
    },
  });
}
