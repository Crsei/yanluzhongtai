import { create } from "zustand";
import { api, HttpError } from "../services/http";
import type { AuthUser } from "../features/auth/types";

const STORAGE_KEY = "yanlu:auth:v1";

type PersistedSession = {
  accessToken: string;
  user: AuthUser;
  rememberMe: boolean;
};

type LoginResponse = {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
};

type MeResponse = {
  user: AuthUser;
};

type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
  rememberMe: boolean;
  hydrated: boolean;
  setSession: (session: PersistedSession) => void;
  clearSession: () => void;
  login: (input: { phone: string; password: string; rememberMe: boolean }) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
};

function readPersisted(): PersistedSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedSession;
  } catch {
    return null;
  }
}

function writePersisted(session: PersistedSession | null) {
  if (typeof window === "undefined") return;
  if (session) {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    window.sessionStorage.removeItem(STORAGE_KEY);
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  rememberMe: false,
  hydrated: false,

  setSession: (session) => {
    writePersisted(session);
    set({
      user: session.user,
      accessToken: session.accessToken,
      rememberMe: session.rememberMe,
    });
  },

  clearSession: () => {
    writePersisted(null);
    set({ user: null, accessToken: null, rememberMe: false });
  },

  login: async (input) => {
    const res = await api.post<LoginResponse>("/auth/login", input, { auth: false, handle401: false });
    get().setSession({
      accessToken: res.accessToken,
      user: res.user,
      rememberMe: input.rememberMe,
    });
  },

  logout: async () => {
    try {
      await api.post<void>("/auth/logout", undefined, { auth: false, handle401: false });
    } catch {
      // 即使后端登出失败，前端仍要清掉本地会话
    }
    get().clearSession();
  },

  hydrate: async () => {
    const persisted = readPersisted();

    const markHydrated = () => set({ hydrated: true });

    // 1. 先尝试现有 access token
    if (persisted?.accessToken) {
      set({
        accessToken: persisted.accessToken,
        user: persisted.user,
        rememberMe: persisted.rememberMe,
      });
      try {
        const me = await api.get<MeResponse>("/auth/me", { handle401: false });
        get().setSession({
          accessToken: persisted.accessToken,
          user: me.user,
          rememberMe: persisted.rememberMe,
        });
        return markHydrated();
      } catch (_err) {
        // 无论是 401 还是其他验证失败，都继续走 refresh。
      }
    }

    // 2. 尝试通过 refresh cookie 续签
    try {
      const res = await api.post<LoginResponse>("/auth/refresh", undefined, {
        auth: false,
        handle401: false,
      });
      get().setSession({
        accessToken: res.accessToken,
        user: res.user,
        rememberMe: persisted?.rememberMe ?? false,
      });
    } catch {
      get().clearSession();
    } finally {
      markHydrated();
    }
  },
}));
