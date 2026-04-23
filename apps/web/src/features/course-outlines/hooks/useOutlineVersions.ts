import { useQuery } from "@tanstack/react-query";
import { courseOutlinesApi } from "../../../services/course-outlines";

export function useOutlineVersions() {
  return useQuery({
    queryKey: ["outline-versions"],
    queryFn: () => courseOutlinesApi.listVersions(),
  });
}
