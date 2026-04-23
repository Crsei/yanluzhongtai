import { useQuery } from "@tanstack/react-query";
import { courseOutlinesApi } from "../../../services/course-outlines";

export function useOutline(versionId: string | null) {
  return useQuery({
    queryKey: ["outline", versionId],
    queryFn: () => courseOutlinesApi.getVersion(versionId as string),
    enabled: !!versionId,
  });
}
