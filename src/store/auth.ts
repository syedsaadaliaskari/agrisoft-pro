"use client";

import { create } from "zustand";
import type { SessionUser } from "@shared/ipc";
import { getApi } from "@/lib/api";

type AuthState = {
  user: SessionUser | null;
  loading: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
};

let hydrateGeneration = 0;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  hydrated: false,
  hydrate: async () => {
    // Already have a session in memory — refresh in background without blanking the UI
    if (get().hydrated && get().user) {
      const gen = ++hydrateGeneration;
      try {
        const user = await getApi().getCurrentUser();
        if (gen !== hydrateGeneration) return;
        if (user) set({ user });
      } catch {
        /* keep cached session */
      }
      return;
    }

    const gen = ++hydrateGeneration;
    const user = await getApi().getCurrentUser();
    if (gen !== hydrateGeneration) return;
    set({ user, hydrated: true });
  },
  login: async (username, password) => {
    set({ loading: true });
    // Invalidate any in-flight hydrate so it cannot wipe a successful login
    hydrateGeneration += 1;
    const loginGen = hydrateGeneration;
    const result = await getApi().login(username, password);
    if (loginGen !== hydrateGeneration) {
      set({ loading: false });
      return { ok: false, error: "Login interrupted" };
    }
    if (result.ok) {
      set({ user: result.user, loading: false, hydrated: true });
      return { ok: true };
    }
    set({ loading: false });
    return { ok: false, error: result.error };
  },
  logout: async () => {
    hydrateGeneration += 1;
    await getApi().logout();
    set({ user: null, hydrated: true });
  },
}));
