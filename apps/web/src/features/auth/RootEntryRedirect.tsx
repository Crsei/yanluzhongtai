import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";

export function RootEntryRedirect() {
  const user = useAuthStore((state) => state.user);
  return <Navigate to={user ? "/employees" : "/about"} replace />;
}
