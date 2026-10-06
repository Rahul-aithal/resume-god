import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ROLE_STATUSES } from "@resume-god/api-client";
import { patchRole } from "../lib/api";

export default function RoleStatusEditor({
  roleId,
  status,
}: {
  roleId: number;
  status: string;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(status);
  const [error, setError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: (next: string) => patchRole(roleId, { status: next }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["company"] });
      void queryClient.invalidateQueries({ queryKey: ["role", roleId] });
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (err) => setError(String(err)),
  });

  return (
    <span className="inline-flex items-center gap-2">
      <select
        className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          update.mutate(event.target.value);
        }}
      >
        {ROLE_STATUSES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </span>
  );
}
