import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchTailorJob } from "./api";
import { setSessionPlan } from "./session";

/** Loads a finished job's plan and takes the user to Review. */
export function useOpenJob(jobId: string) {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => fetchTailorJob(jobId),
    onSuccess: (full) => {
      if (!full.result) return;
      setSessionPlan(full.result.plan, full.result.providers, {
        resumeData: full.result.resume_data,
        jobId,
      });
      navigate("/review");
    },
  });
}
