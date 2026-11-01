import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { fetchMe, logout as apiLogout } from "./api";

interface AuthValue {
  userId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthValue>({
  userId: null,
  isLoading: true,
  isAuthenticated: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    retry: false,
    staleTime: 60_000,
  });
  const queryClient = useQueryClient();
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    function onUnauthorized() {
      setExpired(true);
      queryClient.setQueryData(["me"], null);
    }
    window.addEventListener("resume-god:unauthorized", onUnauthorized);
    return () =>
      window.removeEventListener("resume-god:unauthorized", onUnauthorized);
  }, [queryClient]);

  const value: AuthValue = {
    userId: me.data?.id ?? null,
    isLoading: me.isPending,
    isAuthenticated: me.data != null && !expired,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  return useContext(AuthContext);
}

export function useLogout(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await apiLogout();
    queryClient.clear();
  }, [queryClient]);
}

/** Layout route: renders the matched child route once the session resolves,
 * otherwise sends the visitor to login with the intended path in state. */
export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) {
    return (
      <div
        aria-busy="true"
        className="flex min-h-[50vh] flex-col justify-center gap-3"
      >
        <div className="skeleton h-4 w-40" />
        <div className="skeleton h-4 w-64" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
