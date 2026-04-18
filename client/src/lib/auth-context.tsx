import { createContext, useContext, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "./queryClient";
import type { User } from "@shared/schema";

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  isDemoUser: boolean;
  login: (email: string, password: string) => Promise<User | null>;
  signup: (data: { email: string; username: string; fullName: string; password: string; zipcode?: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        const token = localStorage.getItem("guber_token");
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch("/api/auth/me", { headers, credentials: "include" });
        if (res.status === 401) return null;
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
    gcTime: 300_000,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }): Promise<User | null> => {
      const res = await apiRequest("POST", "/api/auth/login", { email, password });
      const data = await res.json();
      if (data.token) localStorage.setItem("guber_token", data.token);
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
      if (body.token) localStorage.setItem("guber_token", body.token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      localStorage.removeItem("guber_token");
      await apiRequest("POST", "/api/auth/logout");
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

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, isDemoUser, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
