import { useGetMe, useLogin, useLogout, useRegister, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

export function getErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "Something went wrong";
  const data = (error as { data?: { message?: string } }).data;
  if (data?.message) return data.message;
  const msg = (error as { message?: string }).message;
  if (msg) return msg;
  return "Something went wrong";
}

export function useAuth() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: user, isLoading, error } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      staleTime: 5 * 60 * 1000,
    }
  });

  const login = useLogin({
    mutation: {
      onSuccess: (user) => {
        queryClient.setQueryData(["/api/auth/me"], user);
        setLocation("/status");
      }
    }
  });

  const register = useRegister({
    mutation: {
      onSuccess: (user) => {
        queryClient.setQueryData(["/api/auth/me"], user);
        setLocation("/apply");
      }
    }
  });

  const logout = useLogout({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        queryClient.clear();
        setLocation("/");
      }
    }
  });

  return {
    user: error ? null : user,
    isLoading,
    login,
    register,
    logout,
    isAuthenticated: !!user && !error,
  };
}
