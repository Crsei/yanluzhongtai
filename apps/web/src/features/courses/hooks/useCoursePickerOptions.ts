import { useQuery } from "@tanstack/react-query";
import { courseOutlinesApi } from "../../../services/course-outlines";

/** Pull the active outline (includes sections + items) for the Add/Edit modal
 *  and the Advanced-search page. */
export function useActiveOutline() {
  const versionsQ = useQuery({
    queryKey: ["course-outlines", "versions"],
    queryFn: () => courseOutlinesApi.listVersions(),
  });
  const activeVersionId =
    versionsQ.data?.find((v) => v.isActive)?.id ?? null;
  const detailQ = useQuery({
    queryKey: ["course-outlines", "detail", activeVersionId] as const,
    queryFn: () => courseOutlinesApi.getVersion(activeVersionId!),
    enabled: Boolean(activeVersionId),
  });
  return { versionsQ, activeVersionId, detailQ };
}
