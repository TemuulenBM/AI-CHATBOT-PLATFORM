import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserPreferencesState {
  // Onboarding
  onboardingCompleted: boolean;
  onboardingSkipped: boolean;

  // Actions
  setOnboardingCompleted: () => void;
  setOnboardingSkipped: () => void;
  resetOnboarding: () => void;
  shouldShowOnboarding: () => boolean;
}

export const useUserPreferencesStore = create<UserPreferencesState>()(
  persist(
    (set, get) => ({
      onboardingCompleted: false,
      onboardingSkipped: false,

      setOnboardingCompleted: () => {
        set({ onboardingCompleted: true });
      },

      setOnboardingSkipped: () => {
        set({ onboardingSkipped: true });
      },

      resetOnboarding: () => {
        set({ onboardingCompleted: false, onboardingSkipped: false });
      },

      shouldShowOnboarding: () => {
        const state = get();
        return !state.onboardingCompleted && !state.onboardingSkipped;
      },
    }),
    {
      name: 'user-preferences',
    }
  )
);
