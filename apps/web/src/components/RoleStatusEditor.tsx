import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ROLE_STATUSES } from "@resume-god/api-client";
import { SelectField, toOptions } from "./SelectField";
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
      <SelectField
        size="sm"
        className="w-auto"
        aria-label={`Status for role ${roleId}`}
        value={value}
        onValueChange={(next) => {
          setValue(next);
          update.mutate(next);
        }}
        options={toOptions(ROLE_STATUSES)}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
