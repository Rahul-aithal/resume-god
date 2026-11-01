import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { LogoMark } from "../components/icons";
import { Alert, Button, Card, cx, controlCls } from "../components/ui";
import { fetchAuthProviders } from "../lib/api";
import { useAuth } from "../lib/auth";

/** Official four-color Google "G" (brand guidelines: never recolor it). */
function GoogleIcon() {
  return (
    <svg aria-hidden className="h-[18px] w-[18px] shrink-0" viewBox="0 0 18 18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.96H.96a9 9 0 0 0 0 8.08l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/* "Sign in with Google" branding: white surface, gray border, dark text in
   light theme; dark surface and light text in dark theme. The G stays
   four-color in both. */
const googleButtonCls =
  "flex h-11 w-full items-center justify-center gap-3 rounded-lg border " +
  "text-[15px] font-medium shadow-sm transition-colors " +
  "border-[#c4c7c5] bg-white text-ink hover:bg-[#f7f8f8] " +
  "dark:border-line-strong dark:bg-surface dark:text-ink dark:shadow-none dark:hover:bg-surface-2";

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
    <div className="mx-auto max-w-md py-6 lg:py-16">
      <div className="mb-6 flex items-center gap-3">
        <LogoMark className="h-9 w-9" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Log in</h1>
          <p className="text-sm text-ink-2">resume-god</p>
        </div>
      </div>

      <Card className="p-6">
        <p className="text-sm leading-relaxed text-ink-2">
          Sign in to tailor resumes, review AI wording, and track your
          applications — everything is scoped to your account.
        </p>

        {configured ? (
          <a
            href="/api/auth/login/google"
            className={cx(googleButtonCls, "mt-5")}
          >
            <GoogleIcon />
            Continue with Google
          </a>
        ) : (
          <div className="mt-5">
            <button
              type="button"
              disabled
              className={cx(googleButtonCls, "cursor-not-allowed opacity-60")}
            >
              <GoogleIcon />
              Continue with Google
            </button>
            <Alert
              tone="review"
              className="mt-3 text-xs"
              title="Google login is not configured yet"
            >
              Set <code className="font-mono">GOOGLE_CLIENT_ID</code> and{" "}
              <code className="font-mono">GOOGLE_CLIENT_SECRET</code> in{" "}
              <code className="font-mono">apps/server/.env</code>, then restart
              the dev server.
            </Alert>
          </div>
        )}

        {providers.isError && (
          <p className="mt-3 text-xs text-ink-2">
            Could not check OAuth status — the button falls back to the server's
            response.
          </p>
        )}
      </Card>

      {redirectUri && (
        <Card className="mt-4 p-5">
          <h2 className="text-sm font-semibold">
            Google Cloud Console redirect URI
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">
            Register this exact value under Credentials → OAuth client →
            Authorized redirect URIs. It must match character for character,
            including the port.
          </p>
          <div className="mt-3 flex items-start gap-2">
            <code
              className={`${controlCls} min-w-0 flex-1 break-all font-mono text-xs`}
            >
              {redirectUri}
            </code>
            <Button
              variant="secondary"
              size="sm"
              onClick={copyRedirectUri}
              className="shrink-0 px-3 py-2"
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink-2">
            Seeing <code className="font-mono">redirect_uri_mismatch</code>?
            This is the URI Google received — compare it with your console
            entry.
          </p>
        </Card>
      )}
    </div>
  );
}
