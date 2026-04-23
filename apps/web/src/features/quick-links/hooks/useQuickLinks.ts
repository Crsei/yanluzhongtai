import { useQuery } from "@tanstack/react-query";
import { quickLinksApi } from "../../../services/quickLinks";
import { useAuthStore } from "../../../stores/authStore";
import type { QuickLinkPageType } from "../types";

export const quickLinksKey = (pageType: QuickLinkPageType, authed: boolean) =>
  ["quick-links", pageType, authed ? "auth" : "public"] as const;

export function useQuickLinks(pageType: QuickLinkPageType) {
  const user = useAuthStore((state) => state.user);
  const authed = Boolean(user);

  return useQuery({
    queryKey: quickLinksKey(pageType, authed),
    queryFn: () => {
      if (pageType === "SOP" && !authed) {
        return quickLinksApi.listPublicSop();
      }
      return quickLinksApi.listByPageType(pageType);
    },
  });
}
