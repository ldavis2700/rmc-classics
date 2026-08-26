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
      configureIAP(data.user?.id);
    } catch (e) {
      localStorage.removeItem("rmc_token");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    signInGameCenter();
  }, [refresh]);

  const login = async (email, password, acceptedTerms = false) => {
    try {
      const { data } = await api.post("/auth/login", {
        email,
        password,
        accepted_terms: acceptedTerms,
      });
      localStorage.setItem("rmc_token", data.token);
      setUser(data.user);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
    }
  };

  const register = async (email, password, name, acceptedTerms = false) => {
    try {
      const { data } = await api.post("/auth/register", {
        email,
        password,
        name,
        accepted_terms: acceptedTerms,
      });
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

  const deleteAccount = async (password) => {
    try {
      await api.delete("/auth/account", { data: { password } });
      localStorage.removeItem("rmc_token");
      setUser(null);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
    }
  };

  const submitScore = async (payload) => {
    try {
      const { data } = await api.post("/games/submit", payload);
      setUser(data.user);
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
    <AuthContext.Provider value={{ user, loading, login, register, logout, deleteAccount, refresh, submitScore }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
