import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { importProfile, fetchProfiles } from "../lib/api";

export default function ProfilesPage() {
  const queryClient = useQueryClient();
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });
  const [yaml, setYaml] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const importMutation = useMutation({
    mutationFn: () => importProfile(yaml),
    onSuccess: () => {
      setYaml("");
      if (fileInput.current) fileInput.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
  });

  async function onFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      setYaml(await file.text());
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h1 className="text-2xl font-bold">Profile versions</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every import creates a new immutable version and activates it. Only
          <span className="mx-1 font-mono text-xs">user_reviewed</span>
          profiles render.
        </p>
        {profiles.isPending && <p className="mt-4 text-slate-500">Loading…</p>}
        {profiles.isError && (
          <p role="alert" className="mt-4 text-rose-600">
            Failed to load profiles: {String(profiles.error)}
          </p>
        )}
        {profiles.data && (
          <table className="mt-4 w-full rounded-xl border border-slate-200 bg-white text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Imported</th>
              </tr>
            </thead>
            <tbody>
              {profiles.data.versions.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-slate-500">
                    No versions yet — import your master profile on the right.
                    Until then the server falls back to its configured file.
                  </td>
                </tr>
              ) : (
                profiles.data.versions.map((version) => (
                  <tr
                    key={version.version}
                    className="border-t border-slate-100"
                  >
                    <td className="px-4 py-3 font-medium">
                      v{version.version}
                      {version.is_active && (
                        <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                          active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          version.status === "user_reviewed"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {version.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {version.created_at
                        ? version.created_at.slice(0, 16).replace("T", " ")
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">Import master profile</h2>
        <form
          className="mt-3 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (yaml.trim()) importMutation.mutate();
          }}
        >
          <label className="block text-sm font-medium">
            Upload YAML file
            <input
              ref={fileInput}
              type="file"
              accept=".yaml,.yml"
              onChange={onFilePicked}
              className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
            />
          </label>
          <label className="block text-sm font-medium">
            …or paste YAML
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs"
              rows={12}
              value={yaml}
              onChange={(event) => setYaml(event.target.value)}
              placeholder="skills: … achievements: … experiences: …"
            />
          </label>
          {importMutation.isError && (
            <p role="alert" className="text-sm text-rose-600">
              {String(importMutation.error)}
            </p>
          )}
          {importMutation.isSuccess && (
            <p className="text-sm text-emerald-700">
              Imported as v{importMutation.data.version} (
              {importMutation.data.status}) and activated.
            </p>
          )}
          <button
            type="submit"
            disabled={importMutation.isPending || !yaml.trim()}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {importMutation.isPending ? "Importing…" : "Import as new version"}
          </button>
        </form>
      </div>
    </div>
  );
}
