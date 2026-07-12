/**
 * UI-only Zustand store.
 *
 * IMPORTANT: This store is for ephemeral UI state ONLY — selected neuron,
 * modal open/closed, sync-in-progress flags. It must NEVER hold auth or
 * session data; the InternetIdentityProvider context is the single source
 * of truth for identity. See lib/auth.tsx.
 */

import { create } from "zustand";

export type ModalKind = "add-neuron" | "remove-neuron" | "snapshot" | null;

interface UiState {
  /** The currently selected neuron id (for detail view, modals, etc.). */
  selectedNeuronId: string | null;
  /** Which modal is open, if any. */
  openModal: ModalKind;
  /** Whether a global sync-all operation is in progress (UI feedback). */
  isSyncingAll: boolean;

  setSelectedNeuronId: (id: string | null) => void;
  setModal: (modal: ModalKind) => void;
  setIsSyncingAll: (value: boolean) => void;
  /** Convenience: close any open modal. */
  closeModal: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedNeuronId: null,
  openModal: null,
  isSyncingAll: false,

  setSelectedNeuronId: (id) => set({ selectedNeuronId: id }),
  setModal: (modal) => set({ openModal: modal }),
  setIsSyncingAll: (value) => set({ isSyncingAll: value }),
  closeModal: () => set({ openModal: null }),
}));
