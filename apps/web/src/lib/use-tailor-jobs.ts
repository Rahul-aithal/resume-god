import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type { TailorJob } from "@resume-god/api-client";
import { fetchTailorJobs } from "./api";

export const isActive = (job: TailorJob) =>
  job.status === "queued" || job.status === "running";

/** The shared jobs list. Polls only while something is in progress, and every
 * caller shares one request, so idle pages make no requests at all. */
export function useTailorJobs(enabled = true) {
  const queryClient = useQueryClient();
  const hadActive = useRef(false);
  return useQuery({
    queryKey: ["tailor-jobs"],
    queryFn: async () => {
      const data = await fetchTailorJobs();
      const active = data.jobs.some(isActive);
      // A job that finished may have added a company and a role.
      if (hadActive.current && !active) {
        void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        void queryClient.invalidateQueries({ queryKey: ["companies"] });
      }
      hadActive.current = active;
      return data;
    },
    enabled,
    refetchInterval: (query) =>
      query.state.data?.jobs.some(isActive) ? 3_000 : false,
  });
}
