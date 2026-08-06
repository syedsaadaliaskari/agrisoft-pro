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

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  hydrated: false,
  hydrate: async () => {
    const user = await getApi().getCurrentUser();
    set({ user, hydrated: true });
  },
  login: async (username, password) => {
    set({ loading: true });
    const result = await getApi().login(username, password);
    if (result.ok) {
      set({ user: result.user, loading: false });
      return { ok: true };
    }
    set({ loading: false });
    return { ok: false, error: result.error };
  },
  logout: async () => {
    await getApi().logout();
    set({ user: null });
  },
}));
