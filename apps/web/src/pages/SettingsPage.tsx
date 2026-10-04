import { useQuery } from "@tanstack/react-query";
import { fetchProviders } from "../lib/api";

export default function SettingsPage() {
  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: fetchProviders,
  });

  return (
    <div>
      <h1>Settings</h1>
      {providers.data ? (
        <ul>
          <li>Auto: {providers.data.auto}</li>
          {Object.entries(providers.data.models).map(([name, model]) => (
            <li key={name}>
              {name}: {model}
            </li>
          ))}
        </ul>
      ) : (
        <p>Loading…</p>
      )}
      <p>Per-user key and model editing lands with the settings milestone.</p>
    </div>
  );
}
