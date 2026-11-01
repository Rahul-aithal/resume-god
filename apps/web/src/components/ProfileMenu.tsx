import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAccounts, switchAccount } from "../lib/api";
import { useAuth, useLogout } from "../lib/auth";
import { clearSessionPlan } from "../lib/session";
import { currentTheme, toggleTheme } from "../lib/theme";
import {
  AddAccountIcon,
  CheckIcon,
  LogoutIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  UpDownIcon,
} from "./icons";
import { Skeleton, cx } from "./ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-ink"
    >
      {initials || "?"}
    </span>
  );
}

/** A plan under review belongs to the account that made it, so it can't carry
 * over to another account. A full reload also drops every cached query. */
function leaveAccount(destination: string) {
  clearSessionPlan();
  window.location.assign(destination);
}

/**
 * Who's signed in, with account switching, settings, theme, and log out.
 * Lazy-loaded so the menu code stays out of the entry chunk.
 */
export default function ProfileMenu({
  compact = false,
  side = "top",
}: {
  /** Avatar only, for tight spaces such as the mobile top bar. */
  compact?: boolean;
  side?: "top" | "bottom" | "right";
}) {
  const { user } = useAuth();
  const logout = useLogout();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(currentTheme);

  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
    enabled: open,
    staleTime: 30_000,
  });
  const swap = useMutation({
    mutationFn: switchAccount,
    onSuccess: () => leaveAccount("/"),
  });

  if (!user) return null;
  const list = accounts.data?.accounts ?? [];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${user.display_name}`}
        className={cx(
          "flex items-center gap-2 rounded-md text-left transition-colors outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:bg-surface-2",
          compact ? "p-0.5" : "w-full p-1.5",
        )}
      >
        <Avatar name={user.display_name} />
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">
                {user.display_name}
              </span>
              <span className="block truncate text-xs text-ink-2">
                {user.email}
              </span>
            </span>
            <UpDownIcon className="size-4 shrink-0 text-ink-2" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={side}
        align={compact ? "end" : "start"}
        className="w-72"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Accounts</DropdownMenuLabel>
          {accounts.isPending && <Skeleton className="m-1 h-9" />}
          {accounts.isError && (
            <p role="alert" className="px-2 py-1 text-xs text-danger">
              Could not load your accounts.
            </p>
          )}
          {list.map((account) => (
            <DropdownMenuItem
              key={account.id}
              // Stay open on failure so the error below can be read.
              closeOnClick={false}
              disabled={swap.isPending}
              onClick={() => {
                if (!account.active) swap.mutate(account.id);
              }}
            >
              <Avatar name={account.display_name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {account.display_name}
                </span>
                <span className="block truncate text-xs text-ink-2">
                  {account.email}
                </span>
              </span>
              {account.active && (
                <>
                  <CheckIcon className="size-4 shrink-0" />
                  <span className="sr-only">Current account</span>
                </>
              )}
            </DropdownMenuItem>
          ))}
          {swap.isError && (
            <p role="alert" className="px-2 py-1 text-xs text-danger">
              Could not switch accounts. Try adding that account again.
            </p>
          )}
          <DropdownMenuItem
            onClick={() =>
              window.location.assign("/api/auth/login/google?add=1")
            }
          >
            <AddAccountIcon className="size-4" />
            Add another account
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/settings")}>
          <SettingsIcon className="size-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          closeOnClick={false}
          onClick={() => setTheme(toggleTheme())}
        >
          {theme === "dark" ? (
            <SunIcon className="size-4" />
          ) : (
            <MoonIcon className="size-4" />
          )}
          Switch to {theme === "dark" ? "light" : "dark"} theme
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            void logout().then(() => leaveAccount("/login"));
          }}
        >
          <LogoutIcon className="size-4" />
          {list.length > 1 ? "Log out of all accounts" : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
