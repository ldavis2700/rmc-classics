import { useAuth } from "@/context/AuthContext";
import { GAMES } from "@/lib/games";
import { Link } from "react-router-dom";
import { LogOut, Sparkles, Snowflake, Bell, BellOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { sfx } from "@/lib/sound";
import { BadgeShelf } from "@/components/rmc/Badge";
import ThemePicker from "@/components/rmc/ThemePicker";
import {
  enableDailyReminder,
  disableDailyReminder,
  isReminderEnabled,
} from "@/lib/notifications";

export default function Profile() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const initial = (user.name || user.email || "?").charAt(0).toUpperCase();
  const winRate = user.total_plays > 0 ? Math.round((user.total_wins / user.total_plays) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 md:px-8 md:pt-14">
      <div className="rounded-3xl border border-white/10 bg-[#16152b] p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-6">
          <div
            className="grid h-20 w-20 place-items-center rounded-2xl bg-[#ff479a] font-display text-3xl font-black text-white"
            style={{ boxShadow: "0 0 22px rgba(255,71,154,0.5)" }}
            data-testid="profile-avatar"
          >
            {initial}
          </div>
          <div className="flex-1 min-w-[220px]">
            <p className="font-pixel text-xs text-neon-cyan">// PLAYER</p>
            <h1 className="mt-1 font-display text-2xl font-black uppercase tracking-tight text-white sm:text-3xl" data-testid="profile-name">
              {user.name}
            </h1>
            <p className="mt-1 text-sm text-[#a3a1c6]" data-testid="profile-email">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={() => { sfx.click(); logout(); }}
            data-testid="profile-logout"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white hover:border-white/20"
          >
            <LogOut className="h-3.5 w-3.5" /> Log out
          </button>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-6">
          <StatTile label="Total wins" value={user.total_wins || 0} color="#FFD100" />
          <StatTile label="Games played" value={user.total_plays || 0} color="#00F0FF" />
          <StatTile label="Win rate" value={`${winRate}%`} color="#39FF14" />
          <StatTile label="XP" value={user.xp || 0} color="#FF479A" />
          <StatTile label="Streak" value={`${user.streak || 0}d`} color="#FFD100" />
          <div className="rounded-2xl border border-neon-cyan/40 bg-neon-cyan/5 p-4" data-testid="profile-freezes">
            <div className="flex items-center gap-1">
              <Snowflake className="h-3.5 w-3.5 text-neon-cyan" />
              <span className="font-pixel text-2xl leading-none text-neon-cyan">{user.freezes_available ?? 1}</span>
            </div>
            <div className="mt-2 text-[10px] uppercase tracking-widest text-[#a3a1c6]">Streak freeze</div>
          </div>
        </div>
      </div>

      {/* Badges */}
      <div className="mt-10">
        <p className="font-pixel text-xs text-neon-pink">// BADGES</p>
        <h2 className="mt-1 font-display text-xl font-black uppercase tracking-tight text-white sm:text-2xl">
          Trophy shelf
        </h2>
        <div className="mt-4 rounded-3xl border border-white/10 bg-[#16152b] p-6">
          <BadgeShelf userBadges={user.badges || []} />
        </div>
      </div>

      {/* Theme picker */}
      <ThemePicker />

      {/* Daily reminder */}
      <ReminderToggle />

      <div className="mt-10">
        <p className="font-pixel text-xs text-neon-cyan">// GAME BREAKDOWN</p>
        <h2 className="mt-1 font-display text-xl font-black uppercase tracking-tight text-white sm:text-2xl">
          Your stats per game
        </h2>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((g) => {
            const s = user.stats?.[g.id] || { plays: 0, wins: 0, best_score: null };
            return (
              <Link
                to={g.path}
                key={g.id}
                data-testid={`profile-game-${g.id}`}
                className="group rounded-2xl border border-white/10 bg-white/5 p-5 transition-colors hover:border-white/20"
                style={{ borderLeft: `4px solid ${g.color}` }}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-bold uppercase tracking-tight text-white">
                    {g.name}
                  </h3>
                  <Sparkles className="h-4 w-4 text-[#a3a1c6] group-hover:text-white" />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <MiniStat label="Plays" value={s.plays} />
                  <MiniStat label="Wins" value={s.wins} color="#FFD100" />
                  <MiniStat label="Best" value={s.best_score ?? "—"} color={g.color} />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, color }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="font-pixel text-2xl leading-none" style={{ color }}>
        {value}
      </div>
      <div className="mt-2 text-[10px] uppercase tracking-widest text-[#a3a1c6]">{label}</div>
    </div>
  );
}

function MiniStat({ label, value, color = "#ffffff" }) {
  return (
    <div>
      <div className="font-pixel text-lg leading-none" style={{ color }}>
        {value}
      </div>
      <div className="mt-1 text-[9px] uppercase tracking-widest text-[#6a6890]">{label}</div>
    </div>
  );
}

function ReminderToggle() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isReminderEnabled().then(setEnabled);
  }, []);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    sfx.click();
    try {
      if (enabled) {
        await disableDailyReminder();
        setEnabled(false);
        toast.success("Daily reminder off");
      } else {
        const result = await enableDailyReminder();
        if (result === "granted") {
          setEnabled(true);
          toast.success("Daily reminder set for 7pm");
        } else if (result === "denied") {
          toast.error("Notifications blocked — enable them in Settings");
        } else {
          toast.error("Not supported on this device");
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-10">
      <p className="font-pixel text-xs text-neon-yellow">// DAILY REMINDER</p>
      <div className="mt-3 flex flex-col items-start gap-4 rounded-3xl border border-white/10 bg-[#16152b] p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-display text-lg font-bold uppercase tracking-tight text-white">
            Keep the streak alive
          </h3>
          <p className="mt-1 text-sm text-[#a3a1c6]">
            One tap-friendly ping at 7&nbsp;pm your time. Silent by default. Off any time.
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          data-testid="reminder-toggle"
          className={`inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-xs font-black uppercase tracking-widest transition-colors ${
            enabled
              ? "border-neon-yellow/50 bg-neon-yellow/10 text-neon-yellow hover:bg-neon-yellow/20"
              : "border-white/10 bg-white/5 text-white hover:border-white/20"
          }`}
        >
          {enabled ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
          {enabled ? "Reminder On" : "Turn On"}
        </button>
      </div>
    </div>
  );
}
