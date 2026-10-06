import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { fetchAuthProviders } from "../lib/api";
import { useAuth } from "../lib/auth";

function GoogleIcon() {
  return (
    <svg aria-hidden className="h-5 w-5" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  const [copied, setCopied] = useState(false);

  const providers = useQuery({
    queryKey: ["auth-providers"],
    queryFn: fetchAuthProviders,
    retry: false,
    staleTime: 60_000,
  });

  if (auth.isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  // While loading (or if the status check fails) keep the link usable —
  // worst case the API answers 503 after navigation.
  const configured = providers.data?.google.configured ?? true;
  const redirectUri = providers.data?.redirect_uri;

  async function copyRedirectUri() {
    if (!redirectUri) return;
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions); the URI stays selectable.
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Log in</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in to tailor resumes, review AI wording, and track your
          applications — everything is scoped to your account.
        </p>

        {configured ? (
          <a
            href="/api/auth/login/google"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white hover:bg-indigo-700"
          >
            <GoogleIcon />
            Continue with Google
          </a>
        ) : (
          <div className="mt-6">
            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-slate-300 px-4 py-2.5 font-medium text-slate-600"
            >
              <GoogleIcon />
              Continue with Google
            </button>
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <p className="font-semibold">
                Google login is not configured yet
              </p>
              <p className="mt-1">
                Set <code className="font-mono">GOOGLE_CLIENT_ID</code> and{" "}
                <code className="font-mono">GOOGLE_CLIENT_SECRET</code> in{" "}
                <code className="font-mono">apps/api/.env</code>, then restart
                the API container.
              </p>
            </div>
          </div>
        )}

        {providers.isError && (
          <p className="mt-3 text-xs text-slate-500">
            Could not check OAuth status — the button falls back to the server’s
            response.
          </p>
        )}
      </div>

      {redirectUri && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold">
            Google Cloud Console redirect URI
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Register this exact value under Credentials → OAuth client →
            Authorized redirect URIs. It must match character for character,
            including the port.
          </p>
          <div className="mt-3 flex items-start gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs text-slate-800">
              {redirectUri}
            </code>
            <button
              type="button"
              onClick={copyRedirectUri}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Seeing <code className="font-mono">redirect_uri_mismatch</code>?
            This is the URI Google received — compare it with your console
            entry.
          </p>
        </div>
      )}
    </div>
  );
}
