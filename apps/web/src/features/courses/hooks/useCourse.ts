import { useQuery } from "@tanstack/react-query";
import { coursesApi } from "../../../services/courses";

export function useCourse(id: string | null) {
  return useQuery({
    queryKey: ["course", id] as const,
    queryFn: () => coursesApi.detail(id!),
    enabled: Boolean(id),
  });
}
