import { lazy, type ComponentType } from "react";
import { Link, Route, Routes } from "react-router-dom";
import AppShell, { type LazyPage } from "./components/AppShell";
import { EmptyState } from "./components/ui";
import { AuthProvider, RequireAuth } from "./lib/auth";

/** Route-level code splitting: every page is its own chunk, fetched on
 * first visit and prefetched from the nav on hover/focus. */
function lazyPage(loader: () => Promise<{ default: ComponentType }>): LazyPage {
  return Object.assign(lazy(loader), { preload: loader });
}

const LoginPage = lazyPage(() => import("./pages/LoginPage"));
const DashboardPage = lazyPage(() => import("./pages/DashboardPage"));
const NewJobPage = lazyPage(() => import("./pages/NewJobPage"));
const ReviewPage = lazyPage(() => import("./pages/ReviewPage"));
const CompaniesPage = lazyPage(() => import("./pages/CompaniesPage"));
const CompanyDetailPage = lazyPage(() => import("./pages/CompanyDetailPage"));
const RoleDetailPage = lazyPage(() => import("./pages/RoleDetailPage"));
const GraphPage = lazyPage(() => import("./pages/GraphPage"));
const SettingsPage = lazyPage(() => import("./pages/SettingsPage"));

function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      action={
        <Link
          to="/"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent-strong"
        >
          Back to dashboard
        </Link>
      }
    >
      The address doesn't match any page in the app.
    </EmptyState>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route
          element={
            <AppShell
              preloadMap={{
                "/": DashboardPage.preload,
                "/jobs/new": NewJobPage.preload,
                "/review": ReviewPage.preload,
                "/companies": CompaniesPage.preload,
                "/graph": GraphPage.preload,
                "/settings": SettingsPage.preload,
              }}
            />
          }
        >
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route index element={<DashboardPage />} />
            <Route path="/jobs/new" element={<NewJobPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/companies" element={<CompaniesPage />} />
            <Route path="/companies/:id" element={<CompanyDetailPage />} />
            <Route path="/roles/:id" element={<RoleDetailPage />} />
            <Route path="/graph" element={<GraphPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
