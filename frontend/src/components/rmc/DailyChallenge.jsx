import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, Flame, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { GAME_MAP } from "@/lib/games";

export default function DailyChallenge() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    api
      .get("/challenge/today")
      .then((res) => !cancelled && setData(res.data))
      .catch(() => !cancelled && setData(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // Refresh when user object updates (after a submit_score)
  }, [user]);

  if (loading) return null;
  if (!user) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#16152b] p-6">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-neon-yellow/15 glow-yellow">
            <Flame className="h-5 w-5 text-neon-yellow" />
          </div>
          <div className="flex-1">
            <p className="font-pixel text-xs text-neon-yellow">// DAILY CHALLENGE</p>
            <p className="mt-1 text-sm font-semibold text-white">
              Log in to unlock today&apos;s challenge and earn 100 bonus XP.
            </p>
          </div>
          <Link
            to="/login"
            data-testid="daily-login-cta"
            className="btn-arcade rounded-full px-5 py-2 text-xs"
          >
            Log in
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const { challenge, progress, claimed, xp_reward } = data;
  const game = challenge.game_id ? GAME_MAP[challenge.game_id] : null;
  const pct = Math.min(100, Math.round(((progress || 0) / challenge.goal) * 100));

  return (
    <div
      className="relative overflow-hidden rounded-3xl border p-6"
      data-testid="daily-challenge"
      style={{
        borderColor: claimed ? "rgba(57,255,20,0.4)" : "rgba(255,209,0,0.4)",
        backgroundColor: "#16152b",
      }}
    >
      <div
        className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full blur-3xl"
        style={{ backgroundColor: claimed ? "rgba(57,255,20,0.35)" : "rgba(255,209,0,0.3)" }}
      />
      <div className="relative flex flex-wrap items-center gap-4">
        <div
          className="grid h-14 w-14 place-items-center rounded-2xl"
          style={{
            backgroundColor: claimed ? "rgba(57,255,20,0.15)" : "rgba(255,209,0,0.15)",
            boxShadow: claimed ? "0 0 20px rgba(57,255,20,0.35)" : "0 0 20px rgba(255,209,0,0.35)",
          }}
        >
          {claimed ? <CheckCircle2 className="h-6 w-6 text-neon-green" /> : <Trophy className="h-6 w-6 text-neon-yellow" />}
        </div>
        <div className="min-w-[200px] flex-1">
          <p className="font-pixel text-xs text-neon-yellow">
            // DAILY CHALLENGE {claimed && "· COMPLETE"}
          </p>
          <h3 className="mt-1 font-display text-xl font-black uppercase tracking-tight text-white sm:text-2xl">
            {challenge.title}
          </h3>
          <p className="mt-1 text-sm text-[#c9c8e2]">{challenge.desc}</p>
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: claimed ? "#39FF14" : "#FFD100",
                  boxShadow: `0 0 10px ${claimed ? "#39FF14" : "#FFD100"}`,
                }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between font-pixel text-[10px] text-[#a3a1c6]">
              <span>{progress}/{challenge.goal}</span>
              <span className="text-neon-yellow">+{xp_reward} XP</span>
            </div>
          </div>
        </div>
        {game && !claimed && (
          <Link
            to={game.path}
            data-testid="daily-play-cta"
            className="btn-arcade rounded-full px-5 py-2 text-xs"
          >
            Play {game.name}
          </Link>
        )}
        {claimed && (
          <div className="rounded-full border border-neon-green/40 bg-neon-green/10 px-4 py-2 font-pixel text-xs text-neon-green">
            +{xp_reward} XP earned
          </div>
        )}
      </div>
    </div>
  );
}
