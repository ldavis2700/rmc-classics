import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { signInGameCenter, submitLeaderboardScore } from "@/lib/gameCenter";
import { configureIAP, suspendIAP } from "@/lib/iap";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const authAttempt = useRef(0);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("rmc_token");
    if (!token) {
      suspendIAP();
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      // Ignore responses belonging to an account that has since signed out or changed.
      if (localStorage.getItem("rmc_token") !== token) return;
      setUser(data.user);
      await configureIAP(data.user?.id);
    } catch (e) {
      if (localStorage.getItem("rmc_token") !== token) return;
      localStorage.removeItem("rmc_token");
      suspendIAP();
      setUser(null);
    } finally {
      if (localStorage.getItem("rmc_token") === token || !localStorage.getItem("rmc_token")) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    signInGameCenter();
  }, [refresh]);

  const login = async (email, password, acceptedTerms = false) => {
    const attempt = ++authAttempt.current;
    try {
      const { data } = await api.post("/auth/login", {
        email,
        password,
        accepted_terms: acceptedTerms,
      });
      if (attempt !== authAttempt.current) return { ok: false, error: "Sign-in attempt superseded." };
      localStorage.setItem("rmc_token", data.token);
      setUser(data.user);
      // Finish the fail-closed provider setup before reporting auth success so
      // an immediate paid action cannot race an unconfigured IAP client.
      await configureIAP(data.user?.id);
      if (attempt !== authAttempt.current) return { ok: false, error: "Sign-in attempt superseded." };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
    }
  };

  const register = async (email, password, name, acceptedTerms = false) => {
    const attempt = ++authAttempt.current;
    try {
      const { data } = await api.post("/auth/register", {
        email,
        password,
        name,
        accepted_terms: acceptedTerms,
      });
      if (attempt !== authAttempt.current) return { ok: false, error: "Sign-in attempt superseded." };
      localStorage.setItem("rmc_token", data.token);
      setUser(data.user);
      // Finish the fail-closed provider setup before reporting auth success so
      // an immediate paid action cannot race an unconfigured IAP client.
      await configureIAP(data.user?.id);
      if (attempt !== authAttempt.current) return { ok: false, error: "Sign-in attempt superseded." };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
    }
  };

  const logout = () => {
    authAttempt.current += 1;
    localStorage.removeItem("rmc_token");
    suspendIAP();
    setUser(null);
  };

  const deleteAccount = async (password) => {
    const token = localStorage.getItem("rmc_token");
    if (!token) return { ok: false, error: "Please sign in first." };
    try {
      await api.delete("/auth/account", { data: { password } });
      if (localStorage.getItem("rmc_token") !== token) {
        return { ok: false, error: "Account changed while deletion was processing. Check the original account before retrying." };
      }
      localStorage.removeItem("rmc_token");
      suspendIAP();
      setUser(null);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
    }
  };

  const submitScore = async (payload) => {
    const token = localStorage.getItem("rmc_token");
    if (!token) return { ok: false, error: "Please sign in first." };
    try {
      const { data } = await api.post("/games/submit", payload);
      if (localStorage.getItem("rmc_token") !== token) {
        return { ok: false, error: "Account changed before the score result arrived." };
      }
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
