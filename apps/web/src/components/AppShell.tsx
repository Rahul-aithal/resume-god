import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useIsDesktop } from "../lib/use-is-desktop";
import {
  CompaniesIcon,
  DashboardIcon,
  GraphIcon,
  LogoMark,
  NavCloseIcon,
  NavOpenIcon,
  NewJobIcon,
  ReviewIcon,
  SettingsIcon,
} from "./icons";
import { Button, PageSkeleton, Skeleton, ThemeToggle, cx } from "./ui";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./ui/resizable";

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

const ProfileMenu = lazy(() => import("./ProfileMenu"));

/** Profile button for signed-in users, or a way in for everyone else. */
function AccountSlot({
  compact,
  side,
}: {
  compact?: boolean;
  side?: "top" | "bottom" | "right";
}) {
  const { isAuthenticated, isLoading } = useAuth();
  const placeholder = (
    <Skeleton className={compact ? "size-8 rounded-full" : "h-11"} />
  );
  if (isLoading) return placeholder;
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-between gap-2">
        <NavLink
          to="/login"
          className="rounded-md px-2 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          Log in
        </NavLink>
        <ThemeToggle />
      </div>
    );
  }
  return (
    <Suspense fallback={placeholder}>
      <ProfileMenu compact={compact} side={side} />
    </Suspense>
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

/** Application frame. Desktop: a sidebar that can be closed and resized.
 * Mobile: a scrollable top bar. It's one tree at every width, so crossing the
 * breakpoint never remounts the page or loses what's typed in a form.
 * Lazy route chunks render inside one Suspense boundary with a skeleton. */
export default function AppShell({
  preloadMap,
}: {
  /** Route path → lazy page preload, wired into nav hover/focus. */
  preloadMap?: Partial<Record<string, () => Promise<unknown>>>;
}) {
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const nav = usePanelRef();
  const layout = useDefaultLayout({ id: "app-shell" });
  const scroller = useRef<HTMLDivElement>(null);
  const [navOpen, setNavOpen] = useState(true);
  const wasDesktop = useRef(isDesktop);

  useEffect(() => {
    document.title = `${titleFor(location.pathname)} · resume-god`;
    // Pages scroll inside this panel, so the browser won't reset it for us.
    scroller.current?.scrollTo?.(0, 0);
  }, [location.pathname]);

  // The top bar replaces the sidebar on mobile; restore it when widening.
  useLayoutEffect(() => {
    if (!isDesktop) nav.current?.collapse();
    else if (!wasDesktop.current) nav.current?.expand();
    wasDesktop.current = isDesktop;
  }, [isDesktop, nav]);

  const items = navItems().map((item) => ({
    ...item,
    preload: preloadMap?.[item.to],
  }));

  return (
    // The group sets an inline height of 100%, so the wrapper sets the height.
    <div className="h-dvh">
      <ResizablePanelGroup
        id="app-shell"
        defaultLayout={layout.defaultLayout}
        onLayoutChanged={layout.onLayoutChanged}
      >
        <ResizablePanel
          id="nav"
          panelRef={nav}
          collapsible
          defaultSize={224}
          minSize={180}
          maxSize={420}
          onResize={(size) => setNavOpen(size.asPercentage > 0)}
        >
          {/* inert keeps a closed sidebar's links out of the Tab order. */}
          <aside
            inert={!navOpen}
            className="flex h-full flex-col gap-5 overflow-y-auto px-3 py-4"
          >
            <div className="px-1.5">
              <Wordmark />
            </div>
            <NavLinks items={items} layout="col" />
            <div className="mt-auto border-t border-line pt-3">
              <AccountSlot />
            </div>
          </aside>
        </ResizablePanel>
        <ResizableHandle withHandle className="hidden lg:flex" />
        <ResizablePanel id="content">
          <div className="relative h-full min-w-0">
            <Button
              variant="ghost"
              size="sm"
              aria-label={navOpen ? "Hide sidebar" : "Show sidebar"}
              title={navOpen ? "Hide sidebar" : "Show sidebar"}
              aria-expanded={navOpen}
              className="absolute top-1.5 left-1.5 z-10 hidden size-7 p-0 lg:inline-flex"
              onClick={() => {
                if (navOpen) nav.current?.collapse();
                else nav.current?.expand();
              }}
            >
              {navOpen ? (
                <NavCloseIcon className="size-4" />
              ) : (
                <NavOpenIcon className="size-4" />
              )}
            </Button>
            {isDesktop && !navOpen && (
              // The profile stays reachable while the sidebar is closed.
              <div className="absolute bottom-2 left-1.5 z-10">
                <AccountSlot compact side="right" />
              </div>
            )}
            <div ref={scroller} className="h-full overflow-y-auto">
              {/* Mobile top bar */}
              <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur lg:hidden">
                <div className="flex items-center justify-between px-4 pt-3 pb-2">
                  <Wordmark />
                  {!isDesktop && <AccountSlot compact side="bottom" />}
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
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
