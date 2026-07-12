/**
 * React Query hooks for neuron CRUD.
 *   useNeurons        — list all tracked neurons (listMyNeurons)
 *   useAddNeuron      — add a neuron to tracking (addNeuron)
 *   useUpdateNeuron   — update a tracked neuron (updateNeuron)
 *   useRemoveNeuron   — stop tracking a neuron (removeNeuron)
 *
 * The neuron detail page derives its single-neuron view from
 * useNeurons + useRewardHistory + useSyncStatus (see use-rewards / use-sync),
 * because the backend has no getNeuronDetail endpoint.
 */

import { type Neuron, useBackendActor } from "@/lib/backend-actor";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const KEYS = {
  neurons: ["neurons"] as const,
};

/** List all tracked neurons (owned by the caller). */
export function useNeurons() {
  const { actor, isFetching } = useBackendActor();
  return useQuery<Neuron[]>({
    queryKey: KEYS.neurons,
    queryFn: async () => {
      if (!actor) return [];
      return actor.listMyNeurons();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Add a neuron to tracking. Invalidates the neurons list on success. */
export function useAddNeuron() {
  const queryClient = useQueryClient();
  const { actor } = useBackendActor();
  return useMutation<
    void,
    Error,
    {
      id: bigint;
      name: string;
      startDate: bigint;
      dissolveDelaySeconds: bigint;
      initialStakeE8s: bigint;
    }
  >({
    mutationFn: async (vars) => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.addNeuron(
        vars.id,
        vars.name,
        vars.startDate,
        vars.dissolveDelaySeconds,
        vars.initialStakeE8s,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.neurons });
    },
  });
}

/** Update a tracked neuron record. Invalidates the neurons list on success. */
export function useUpdateNeuron() {
  const queryClient = useQueryClient();
  const { actor } = useBackendActor();
  return useMutation<void, Error, Neuron>({
    mutationFn: async (neuron) => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.updateNeuron(neuron);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.neurons });
    },
  });
}

/** Stop tracking a neuron. Invalidates the neurons list on success. */
export function useRemoveNeuron() {
  const queryClient = useQueryClient();
  const { actor } = useBackendActor();
  return useMutation<void, Error, bigint>({
    mutationFn: async (neuronId) => {
      if (!actor) throw new Error("Backend actor not ready");
      return actor.removeNeuron(neuronId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.neurons });
    },
  });
}
