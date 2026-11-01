import { Suspense, useEffect, type ComponentType } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth, useLogout } from "../lib/auth";
import {
  CompaniesIcon,
  DashboardIcon,
  GraphIcon,
  LogoMark,
  LogoutIcon,
  NewJobIcon,
  ReviewIcon,
  SettingsIcon,
} from "./icons";
import { Button, PageSkeleton, ThemeToggle, cx } from "./ui";

export type LazyPage = ComponentType & {
  preload?: () => Promise<unknown>;
};

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
  preload?: () => Promise<unknown>;
}

function navItems(): NavItem[] {
  return [
    { to: "/", label: "Dashboard", icon: DashboardIcon, end: true },
    { to: "/jobs/new", label: "New application", icon: NewJobIcon },
    { to: "/review", label: "Review", icon: ReviewIcon },
    { to: "/companies", label: "Companies", icon: CompaniesIcon },
    { to: "/graph", label: "Knowledge graph", icon: GraphIcon },
    { to: "/settings", label: "Settings", icon: SettingsIcon },
  ];
}

function Wordmark() {
  return (
    <NavLink to="/" className="flex items-center gap-2 text-ink">
      <LogoMark className="h-6 w-6" />
      <span className="text-[13px] font-semibold tracking-tight">
        resume-god
      </span>
    </NavLink>
  );
}

function UserBlock() {
  const logout = useLogout();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
      <span className="min-w-0 flex-1 truncate text-xs text-ink-2">
        Signed in
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          void logout().then(() => navigate("/login"));
        }}
        className="px-2"
      >
        <LogoutIcon className="h-4 w-4" />
        Log out
      </Button>
    </div>
  );
}

function NavLinks({
  items,
  layout,
  onNavigate,
}: {
  items: NavItem[];
  layout: "col" | "row";
  onNavigate?: () => void;
}) {
  return (
    <nav
      aria-label="Primary"
      className={cx(
        "flex",
        layout === "col" ? "flex-col gap-0.5" : "flex-row gap-1",
      )}
    >
      {items.map(({ to, label, icon: Icon, end, preload }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          onMouseEnter={() => void preload?.()}
          onFocus={() => void preload?.()}
          className={({ isActive }) =>
            cx(
              "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
              isActive
                ? "bg-surface-2 text-ink"
                : "text-ink-2 hover:bg-surface-2/60 hover:text-ink",
            )
          }
        >
          <Icon className="h-4 w-4 shrink-0" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

const TITLES: Array<[RegExp, string]> = [
  [/^\/login$/, "Log in"],
  [/^\/jobs\/new/, "New application"],
  [/^\/review/, "Review"],
  [/^\/companies\/\d+/, "Company"],
  [/^\/companies/, "Companies"],
  [/^\/roles\/\d+/, "Role"],
  [/^\/graph/, "Knowledge graph"],
  [/^\/settings/, "Settings"],
  [/^\/$/, "Dashboard"],
];

function titleFor(pathname: string): string {
  for (const [pattern, title] of TITLES) {
    if (pattern.test(pathname)) return title;
  }
  return "resume-god";
}

/** Application frame: sidebar on desktop, scrollable top bar on mobile.
 * Lazy route chunks render inside one Suspense boundary with a skeleton. */
export default function AppShell({
  preloadMap,
}: {
  /** Route path → lazy page preload, wired into nav hover/focus. */
  preloadMap?: Partial<Record<string, () => Promise<unknown>>>;
}) {
  const location = useLocation();

  useEffect(() => {
    document.title = `${titleFor(location.pathname)} · resume-god`;
  }, [location.pathname]);

  const items = navItems().map((item) => ({
    ...item,
    preload: preloadMap?.[item.to],
  }));

  return (
    <div className="min-h-dvh">
      <div className="flex w-full">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-5 border-r border-line px-3 py-4 lg:flex">
          <div className="px-1.5">
            <Wordmark />
          </div>
          <NavLinks items={items} layout="col" />
          <div className="mt-auto flex flex-col gap-3">
            <div className="flex items-center justify-between border-t border-line pt-3">
              <span className="px-1.5 text-xs text-ink-2">Theme</span>
              <ThemeToggle />
            </div>
            <UserBlock />
          </div>
        </aside>

        {/* Mobile top bar */}
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur lg:hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <Wordmark />
              <ThemeToggle />
            </div>
            <div className="overflow-x-auto px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <NavLinks items={items} layout="row" />
            </div>
          </header>

          <main className="w-full px-4 py-5 sm:px-6 lg:px-10 lg:py-8 2xl:px-16">
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}
