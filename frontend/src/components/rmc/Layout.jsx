import { Link, NavLink, useLocation } from "react-router-dom";
import { Home, Gamepad2, Trophy, User, Volume2, VolumeX, Swords, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { isSoundEnabled, setSoundEnabled, sfx } from "@/lib/sound";
import { useAuth } from "@/context/AuthContext";

const navItems = [
  { to: "/", label: "Home", icon: Home, id: "nav-home" },
  { to: "/library", label: "Library", icon: Gamepad2, id: "nav-library" },
  { to: "/battles", label: "Battles", icon: Swords, id: "nav-battles" },
  { to: "/friends", label: "Friends", icon: Users, id: "nav-friends" },
  { to: "/leaderboard", label: "Ranks", icon: Trophy, id: "nav-leaderboard" },
  { to: "/profile", label: "Profile", icon: User, id: "nav-profile" },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const [sound, setSound] = useState(isSoundEnabled());
  const location = useLocation();

  useEffect(() => {
    // scroll to top on route change
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);

  const toggleSound = () => {
    const v = !sound;
    setSound(v);
    setSoundEnabled(v);
    if (v) sfx.click();
  };

  return (
    <div className="App relative min-h-screen">
      {/* Background glow layers */}
      <div className="pointer-events-none fixed inset-0 rmc-radial-glow" />
      <div className="pointer-events-none fixed inset-0 rmc-noise opacity-30 mix-blend-overlay" />

      {/* Top nav */}
      <header className="glass sticky top-0 z-40 border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-8">
          <Link
            to="/"
            data-testid="brand-logo"
            className="flex items-center gap-2"
            onMouseEnter={() => sfx.hover()}
            onClick={() => sfx.click()}
          >
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#ff479a] font-display text-lg font-black text-white glow-pink">
              R
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-display text-lg font-black uppercase tracking-tighter">
                RMC
              </span>
              <span className="font-pixel text-[10px] text-neon-cyan">CLASSICS</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                data-testid={n.id}
                onMouseEnter={() => sfx.hover()}
                onClick={() => sfx.click()}
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-wide transition-colors ${
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-[#a3a1c6] hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSound}
              aria-label={sound ? "Mute sounds" : "Unmute sounds"}
              data-testid="sound-toggle"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white hover:border-white/20"
            >
              {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            {user ? (
              <div className="hidden items-center gap-2 md:flex">
                <Link
                  to="/profile"
                  data-testid="profile-chip"
                  className="chip !border-white/20"
                >
                  <span className="font-pixel text-neon-yellow">{user.total_wins || 0}W</span>
                  <span className="text-white">{user.name}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => { sfx.click(); logout(); }}
                  data-testid="logout-btn"
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-wide text-[#a3a1c6] hover:text-white"
                >
                  Log out
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                data-testid="header-login"
                onClick={() => sfx.click()}
                className="btn-arcade rounded-full px-4 py-2 text-xs md:text-sm"
              >
                Log in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 pb-28 md:pb-16">{children}</main>

      {/* Bottom nav - mobile only */}
      <nav
        className="glass fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-white/10 px-2 py-2 md:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
      >
        {navItems.map((n) => {
          const Icon = n.icon;
          return (
            <NavLink
              key={n.to}
              to={n.to}
              data-testid={`mobile-${n.id}`}
              onClick={() => sfx.click()}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                  isActive ? "text-neon-pink" : "text-[#a3a1c6]"
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {n.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
