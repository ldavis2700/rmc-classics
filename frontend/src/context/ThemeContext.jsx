import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const ThemeContext = createContext({ themes: [], applyTheme: () => {}, current: "neon" });

const FALLBACK_THEMES = [
  { id: "neon", name: "Neon Arcade", unlock_xp: 0, primary: "#FF479A", accent: "#00F0FF" },
];

export function ThemeProvider({ children }) {
  const { user, refresh } = useAuth();
  const [themes, setThemes] = useState(FALLBACK_THEMES);

  useEffect(() => {
    api
      .get("/themes")
      .then((res) => setThemes(res.data.themes || FALLBACK_THEMES))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const id = user?.theme || "neon";
    const t = themes.find((x) => x.id === id) || themes[0];
    if (!t) return;
    const root = document.documentElement;
    root.setAttribute("data-theme", t.id);
    // Update key CSS variables so components pick up immediately
    root.style.setProperty("--rmc-primary", t.primary);
    root.style.setProperty("--rmc-accent", t.accent);
  }, [user?.theme, themes]);

  const applyTheme = async (themeId) => {
    try {
      await api.post("/themes/select", { theme_id: themeId });
      await refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.response?.data?.detail || e.message };
    }
  };

  return (
    <ThemeContext.Provider value={{ themes, current: user?.theme || "neon", applyTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
