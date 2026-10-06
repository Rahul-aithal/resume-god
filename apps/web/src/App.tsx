import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { AuthProvider, RequireAuth, useAuth, useLogout } from "./lib/auth";
import CompaniesPage from "./pages/CompaniesPage";
import CompanyDetailPage from "./pages/CompanyDetailPage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import NewJobPage from "./pages/NewJobPage";
import ProfilesPage from "./pages/ProfilesPage";
import ReviewPage from "./pages/ReviewPage";
import RoleDetailPage from "./pages/RoleDetailPage";
import SettingsPage from "./pages/SettingsPage";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive
      ? "bg-indigo-600 text-white"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  }`;

function Header() {
  const auth = useAuth();
  const logout = useLogout();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
        <NavLink to="/" className="text-lg font-bold text-indigo-700">
          resume-god
        </NavLink>
        <nav className="flex flex-wrap items-center gap-1">
          <NavLink to="/" end className={navLinkClass}>
            Dashboard
          </NavLink>
          <NavLink to="/jobs/new" className={navLinkClass}>
            New application
          </NavLink>
          <NavLink to="/review" className={navLinkClass}>
            Review
          </NavLink>
          <NavLink to="/companies" className={navLinkClass}>
            Companies
          </NavLink>
          <NavLink to="/profiles" className={navLinkClass}>
            Profiles
          </NavLink>
          <NavLink to="/settings" className={navLinkClass}>
            Settings
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {auth.isAuthenticated ? (
            <>
              <span className="text-slate-500">Signed in</span>
              <button
                onClick={handleLogout}
                className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
              >
                Log out
              </button>
            </>
          ) : (
            <NavLink to="/login" className={navLinkClass}>
              Login
            </NavLink>
          )}
        </div>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <Header />
        <main className="mx-auto max-w-6xl px-4 py-6">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <DashboardPage />
                </RequireAuth>
              }
            />
            <Route
              path="/jobs/new"
              element={
                <RequireAuth>
                  <NewJobPage />
                </RequireAuth>
              }
            />
            <Route
              path="/review"
              element={
                <RequireAuth>
                  <ReviewPage />
                </RequireAuth>
              }
            />
            <Route
              path="/companies"
              element={
                <RequireAuth>
                  <CompaniesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/companies/:id"
              element={
                <RequireAuth>
                  <CompanyDetailPage />
                </RequireAuth>
              }
            />
            <Route
              path="/roles/:id"
              element={
                <RequireAuth>
                  <RoleDetailPage />
                </RequireAuth>
              }
            />
            <Route
              path="/profiles"
              element={
                <RequireAuth>
                  <ProfilesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/settings"
              element={
                <RequireAuth>
                  <SettingsPage />
                </RequireAuth>
              }
            />
          </Routes>
        </main>
      </div>
    </AuthProvider>
  );
}
