import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { signInGameCenter, submitLeaderboardScore } from "@/lib/gameCenter";
import { configureIAP } from "@/lib/iap";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("rmc_token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      configureIAP(data.user?.id);   // configure RevenueCat with stable user id (native only)
    } catch (e) {
      localStorage.removeItem("rmc_token");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Silent Game Center sign-in on iOS (no-op on web)
    signInGameCenter();
  }, [refresh]);

  const login = async (email, password) => {
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("rmc_token", data.token);
      setUser(data.user);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
    }
  };

  const register = async (email, password, name) => {
    try {
      const { data } = await api.post("/auth/register", { email, password, name });
      localStorage.setItem("rmc_token", data.token);
      setUser(data.user);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
    }
  };

  const logout = () => {
    localStorage.removeItem("rmc_token");
    setUser(null);
  };

  const submitScore = async (payload) => {
    try {
      const { data } = await api.post("/games/submit", payload);
      setUser(data.user);
      // Mirror the score to Apple Game Center / Google Play Games (native-only, fire-and-forget)
      if (payload?.game_id && typeof payload?.score === "number") {
        submitLeaderboardScore(payload.game_id, payload.score);
      }
      return {
        ok: true,
        user: data.user,
        xp_gained: data.xp_gained || 0,
        challenge_completed: !!data.challenge_completed,
        freeze_used: !!data.freeze_used,
        newly_unlocked_badges: data.newly_unlocked_badges || [],
      };
    } catch (e) {
      return { ok: false, error: formatApiErrorDetail(e.response?.data?.detail) };
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh, submitScore }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
