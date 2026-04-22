// apps/web/src/features/students/hooks/useStudents.ts
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { studentsApi, type StudentQueryParams } from "../../../services/students";

export function useStudents(params: StudentQueryParams) {
  return useQuery({
    queryKey: ["students", params],
    queryFn: () => studentsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useStudent(id: string | undefined) {
  return useQuery({
    queryKey: ["students", "detail", id],
    queryFn: () => studentsApi.detail(id!),
    enabled: !!id,
  });
}
