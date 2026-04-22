import type { ReactNode } from "react";
import { useAuthStore } from "../../stores/authStore";
import { UnauthorizedPage } from "./UnauthorizedPage";
import type { UserRole } from "./types";

type Props = {
  roles: UserRole[];
  children: ReactNode;
};

export function RequireRole({ roles, children }: Props) {
  const user = useAuthStore((state) => state.user);

  if (!user || !roles.includes(user.role)) {
    return <UnauthorizedPage kind="forbidden" />;
  }

  return <>{children}</>;
}
