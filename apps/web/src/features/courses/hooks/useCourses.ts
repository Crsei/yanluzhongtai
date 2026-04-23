import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { coursesApi } from "../../../services/courses";
import type { CourseQueryParams } from "../types";

export const coursesKey = (params: CourseQueryParams) => ["courses", params] as const;

export function useCourses(params: CourseQueryParams) {
  return useQuery({
    queryKey: coursesKey(params),
    queryFn: () => coursesApi.list(params),
    placeholderData: keepPreviousData,
  });
}
