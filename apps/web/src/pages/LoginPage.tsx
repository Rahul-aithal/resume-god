import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  if (auth.isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Log in</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in to tailor resumes, review AI wording, and track your
          applications — everything is scoped to your account.
        </p>
        <a
          href="/api/auth/login/google"
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white hover:bg-indigo-700"
        >
          <svg aria-hidden className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
            />
          </svg>
          Continue with Google
        </a>
        <p className="mt-4 text-xs text-slate-500">
          The button works once the server has GOOGLE_CLIENT_ID and
          GOOGLE_CLIENT_SECRET configured; otherwise it explains the setup.
        </p>
      </div>
    </div>
  );
}
