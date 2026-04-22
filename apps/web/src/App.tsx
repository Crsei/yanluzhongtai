import { ConfigProvider, Spin, theme } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { useAuthStore } from "./stores/authStore";

const queryClient = new QueryClient();

function AuthHydrationGate({ children }: { children: React.ReactNode }) {
  const hydrated = useAuthStore((state) => state.hydrated);
  const hydrate = useAuthStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hydrated) {
    return (
      <div className="auth-splash">
        <Spin size="large" />
      </div>
    );
  }

  return <>{children}</>;
}

function MustChangePasswordGate({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (!user) return;
    if (!user.mustChangePassword) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === "/force-password-change") return;
    if (window.location.pathname === "/login") return;
    window.location.assign("/force-password-change");
  }, [user]);

  return <>{children}</>;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        theme={{
          algorithm: theme.defaultAlgorithm,
          token: {
            colorPrimary: "#1d8cff",
            colorBgLayout: "#eef3f9",
            colorTextBase: "#0f172a",
            borderRadius: 12,
            fontSize: 14,
          },
        }}
      >
        <AuthHydrationGate>
          <MustChangePasswordGate>
            <RouterProvider router={router} />
          </MustChangePasswordGate>
        </AuthHydrationGate>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
