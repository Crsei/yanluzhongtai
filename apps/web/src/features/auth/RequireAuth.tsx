import { Spin } from "antd";
import type { ReactNode } from "react";
import { useAuthStore } from "../../stores/authStore";
import { UnauthorizedPage } from "./UnauthorizedPage";

export function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const hydrated = useAuthStore((state) => state.hydrated);

  if (!hydrated) {
    return (
      <div className="auth-splash">
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <UnauthorizedPage kind="guest" />;
  }

  return <>{children}</>;
}
