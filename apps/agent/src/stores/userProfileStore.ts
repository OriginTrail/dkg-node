import { create } from "zustand";

interface UserProfile {
  id: string | null;
  name: string | null;
  email: string | null;
  avatar: string | null;
}

interface UserProfileState {
  // State
  profile: UserProfile;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  setProfile: (profile: Partial<UserProfile>) => void;
  clearProfile: () => void;
  setIsLoading: (isLoading: boolean) => void;
  setIsAuthenticated: (isAuthenticated: boolean) => void;
}

const initialProfile: UserProfile = {
  id: null,
  name: null,
  email: null,
  avatar: null,
};

export const useUserProfileStore = create<UserProfileState>((set) => ({
  // Initial state
  profile: initialProfile,
  isLoading: false,
  isAuthenticated: false,

  // Actions
  setProfile: (profile) =>
    set((state) => ({
      profile: { ...state.profile, ...profile },
    })),

  clearProfile: () =>
    set({
      profile: initialProfile,
      isAuthenticated: false,
    }),

  setIsLoading: (isLoading) => set({ isLoading }),

  setIsAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
}));
