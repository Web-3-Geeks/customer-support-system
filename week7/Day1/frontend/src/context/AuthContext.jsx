import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./auth-context";
import { authApi } from "../api/authApi";
import { AUTH_LOGOUT_EVENT } from "../api/axios";
import { tokenStorage } from "../api/tokenStorage";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(tokenStorage.get()));

  useEffect(() => {
    if (!tokenStorage.get()) return;

    let ignore = false;
    authApi
      .me()
      .then(({ data }) => {
        if (!ignore) setUser(data.data.user);
      })
      .catch(() => tokenStorage.clear())
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const handleForcedLogout = () => setUser(null);
    window.addEventListener(AUTH_LOGOUT_EVENT, handleForcedLogout);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, handleForcedLogout);
  }, []);

  const saveSession = useCallback(({ user: nextUser, token }) => {
    tokenStorage.set(token);
    setUser(nextUser);
    return nextUser;
  }, []);

  const login = useCallback(
    async (credentials) => {
      const { data } = await authApi.login(credentials);
      return saveSession(data.data);
    },
    [saveSession]
  );

  const register = useCallback(
    async (details) => {
      const { data } = await authApi.register(details);
      return saveSession(data.data);
    },
    [saveSession]
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // the token is dropped locally either way
    }
    tokenStorage.clear();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
