import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchMe, fetchProviders } from "../lib/api";

export default function DashboardPage() {
  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: fetchProviders,
  });
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe, retry: false });

  return (
    <div>
      <h1>Dashboard</h1>
      {me.data ? (
        <p>
          Signed in as {me.data.display_name || me.data.email} (
          <a
            href="/api/auth/logout"
            onClick={(event) => {
              event.preventDefault();
              fetch("/api/auth/logout", { method: "POST" }).then(() =>
                me.refetch(),
              );
            }}
          >
            log out
          </a>
          )
        </p>
      ) : (
        <p>
          <Link to="/login">Log in</Link> to scope everything to your account.
        </p>
      )}
      <p>
        <Link to="/jobs/new">+ New application</Link>
      </p>
      <h2>Providers</h2>
      {providers.data ? (
        <p>
          Auto resolves to: {providers.data.auto} (order:{" "}
          {providers.data.order.join(", ")})
        </p>
      ) : (
        <p>Loading provider status…</p>
      )}
    </div>
  );
}
