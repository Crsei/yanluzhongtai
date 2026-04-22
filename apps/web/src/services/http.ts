import type { AuthUser } from "../features/auth/types";
import { useAuthStore } from "../stores/authStore";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type HttpInit = Omit<RequestInit, "body"> & {
  body?: unknown;
  auth?: boolean;
  handle401?: boolean;
};

type RefreshResponse = {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
};

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");
let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshAccessToken(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${baseUrl}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        useAuthStore.getState().clearSession();
        return false;
      }

      const text = await res.text();
      const body = (text ? JSON.parse(text) : undefined) as RefreshResponse | undefined;

      if (!body?.accessToken || !body.user) {
        useAuthStore.getState().clearSession();
        return false;
      }

      const { rememberMe } = useAuthStore.getState();
      useAuthStore.getState().setSession({
        accessToken: body.accessToken,
        user: body.user,
        rememberMe,
      });
      return true;
    } catch {
      useAuthStore.getState().clearSession();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function http<T>(path: string, init: HttpInit = {}): Promise<T> {
  const { auth = true, handle401 = true, body, headers, ...rest } = init;
  const buildHeaders = (accessToken: string | null): Record<string, string> => ({
    Accept: "application/json",
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(headers as Record<string, string> | undefined),
  });

  const send = (accessToken: string | null) =>
    fetch(`${baseUrl}${path}`, {
      ...rest,
      credentials: "include",
      headers: buildHeaders(accessToken),
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  let res = await send(auth ? useAuthStore.getState().accessToken : null);

  if (res.status === 401 && handle401 && auth) {
    const refreshed = await tryRefreshAccessToken();
    if (!refreshed) {
      throw new HttpError(401, "未登录或登录已过期");
    }
    res = await send(useAuthStore.getState().accessToken);
    if (res.status === 401) {
      useAuthStore.getState().clearSession();
      throw new HttpError(401, "未登录或登录已过期");
    }
  }

  if (res.status === 403) {
    const maybe = await res
      .clone()
      .json()
      .catch(() => null);
    const code =
      maybe && typeof maybe === "object" && "code" in maybe
        ? (maybe as { code?: string }).code
        : undefined;
    if (code === "MUST_CHANGE_PASSWORD") {
      if (
        typeof window !== "undefined" &&
        window.location.pathname !== "/force-password-change"
      ) {
        window.location.assign("/force-password-change");
      }
      throw new HttpError(403, "请先修改密码");
    }
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    const message =
      (errorBody && typeof errorBody === "object" && "message" in errorBody
        ? Array.isArray((errorBody as { message: unknown }).message)
          ? ((errorBody as { message: string[] }).message[0] ?? res.statusText)
          : String((errorBody as { message: unknown }).message)
        : null) ?? res.statusText;
    throw new HttpError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * Fetch a binary response with the access token attached, then trigger a
 * browser download. Useful for endpoints that require auth but should land
 * as a file (e.g. Excel templates).
 */
export async function downloadAuthed(path: string, filename: string): Promise<void> {
  const send = (token: string | null) =>
    fetch(`${baseUrl}${path}`, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  let res = await send(useAuthStore.getState().accessToken);
  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (!refreshed) throw new HttpError(401, "未登录或登录已过期");
    res = await send(useAuthStore.getState().accessToken);
  }
  if (!res.ok) {
    throw new HttpError(res.status, res.statusText);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string, init?: HttpInit) => http<T>(path, { ...init, method: "GET" }),
  post: <T>(path: string, body?: unknown, init?: HttpInit) =>
    http<T>(path, { ...init, method: "POST", body }),
  put: <T>(path: string, body?: unknown, init?: HttpInit) =>
    http<T>(path, { ...init, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, init?: HttpInit) =>
    http<T>(path, { ...init, method: "PATCH", body }),
  delete: <T>(path: string, init?: HttpInit) => http<T>(path, { ...init, method: "DELETE" }),
};
