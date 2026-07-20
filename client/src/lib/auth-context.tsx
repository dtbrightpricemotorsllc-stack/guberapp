import { createContext, useContext, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "./queryClient";
import { getToken, setToken, clearToken } from "./token-storage";
import { signOutFromGoogle } from "./native-google-sign-in";
import { Capacitor } from "@capacitor/core";
import type { User } from "@shared/schema";

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  isDemoUser: boolean;
  login: (email: string, password: string) => Promise<User | null>;
  signup: (data: { email: string; username: string; fullName: string; password: string; zipcode?: string }) => Promise<void>;
  logout: () => Promise<void>;
  // Liability protection (Task #318): one-time global disclaimer.
  acceptLiabilityDisclaimer: () => Promise<void>;
  acceptingLiabilityDisclaimer: boolean;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        const token = await getToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 10_000);
        let res: Response;
        try {
          res = await fetch("/api/auth/me", { headers, credentials: "include", signal: controller.signal });
        } finally {
          clearTimeout(tid);
        }
        if (res.status === 401) return null;
        if (!res.ok) throw new Error(`auth/me ${res.status}`);
        return await res.json();
      } catch (err: any) {
        if (err?.name === "AbortError") return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    retryDelay: 2000,
  });

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }): Promise<User | null> => {
      const res = await apiRequest("POST", "/api/auth/login", { email, password });
      const data = await res.json();
      if (data.token) await setToken(data.token);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const signupMutation = useMutation({
    mutationFn: async (data: { email: string; username: string; fullName: string; password: string; zipcode?: string }) => {
      const res = await apiRequest("POST", "/api/auth/signup", data);
      const body = await res.json();
      if (body.token) await setToken(body.token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      // Remove push token from DB BEFORE destroying the session so the DELETE
      // request still arrives authenticated. Wrapped in try/catch so a push
      // failure never blocks logout itself.
      try {
        const { unsubscribeFromPush } = await import("./push");
        await unsubscribeFromPush();
      } catch {}
      await clearToken();
      if (Capacitor.isNativePlatform()) {
        await signOutFromGoogle();
      }
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  // Task #318: one-time global liability disclaimer acknowledgement.
  const liabilityDisclaimerMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/users/me/accept-liability-disclaimer");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const login = useCallback(async (email: string, password: string): Promise<User | null> => {
    return loginMutation.mutateAsync({ email, password });
  }, [loginMutation]);

  const signup = useCallback(async (data: { email: string; username: string; fullName: string; password: string; zipcode?: string }) => {
    await signupMutation.mutateAsync(data);
  }, [signupMutation]);

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const isDemoUser = useMemo(() => {
    return !!user?.email?.endsWith("@guberapp.internal");
  }, [user?.email]);

  const acceptLiabilityDisclaimer = useCallback(async () => {
    await liabilityDisclaimerMutation.mutateAsync();
  }, [liabilityDisclaimerMutation]);

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        isDemoUser,
        login,
        signup,
        logout,
        acceptLiabilityDisclaimer,
        acceptingLiabilityDisclaimer: liabilityDisclaimerMutation.isPending,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
