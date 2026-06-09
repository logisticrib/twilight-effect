import { create } from 'zustand';

export type AppTab = 'library' | 'decks' | 'play';

interface AppState {
  tab: AppTab;
  setTab: (tab: AppTab) => void;
}

export const useAppStore = create<AppState>((set) => ({
  tab: 'library',
  setTab: (tab) => set({ tab }),
}));
