import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  playerName: string;
  avatarLetter: string;
  setPlayerName: (name: string) => void;
  setAvatarLetter: (letter: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      playerName: 'You',
      avatarLetter: 'A',
      setPlayerName: (name) => set({ playerName: name, avatarLetter: name[0]?.toUpperCase() ?? 'A' }),
      setAvatarLetter: (letter) => set({ avatarLetter: letter }),
    }),
    { name: 'twilight-settings' }
  )
);
