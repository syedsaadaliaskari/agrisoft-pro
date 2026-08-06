"use client";

import { create } from "zustand";
import type { SessionUser } from "@shared/ipc";
import { getApi } from "@/lib/api";

/** Temporary preview session until Step 4 auth is wired */
export const PREVIEW_USER: SessionUser = {
  id: "preview",
  username: "preview",
  fullName: "Preview User",
  roleId: "admin",
  roleName: "Admin",
  permissions: ["*"],
};

type AuthState = {
  user: SessionUser | null;
  loading: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  enterPreview: () => void;
  logout: () => Promise<void>;
};

const PREVIEW_KEY = "agri_soft_preview";

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  hydrated: false,
  hydrate: async () => {
    const apiUser = await getApi().getCurrentUser();
    if (apiUser) {
      set({ user: apiUser, hydrated: true });
      return;
    }
    if (typeof window !== "undefined" && localStorage.getItem(PREVIEW_KEY) === "1") {
      set({ user: PREVIEW_USER, hydrated: true });
      return;
    }
    set({ user: null, hydrated: true });
  },
  login: async (username, password) => {
    set({ loading: true });
    const result = await getApi().login(username, password);
    if (result.ok) {
      if (typeof window !== "undefined") localStorage.removeItem(PREVIEW_KEY);
      set({ user: result.user, loading: false });
      return { ok: true };
    }
    set({ loading: false });
    return { ok: false, error: result.error };
  },
  enterPreview: () => {
    if (typeof window !== "undefined") localStorage.setItem(PREVIEW_KEY, "1");
    set({ user: PREVIEW_USER, hydrated: true });
  },
  logout: async () => {
    await getApi().logout();
    if (typeof window !== "undefined") localStorage.removeItem(PREVIEW_KEY);
    set({ user: null });
  },
}));
