import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, Gamepad2, Trophy, Zap } from "lucide-react";
import GameCard from "@/components/rmc/GameCard";
import DailyChallenge from "@/components/rmc/DailyChallenge";
import { GAMES } from "@/lib/games";
import { sfx } from "@/lib/sound";
import { useAuth } from "@/context/AuthContext";

const stats = [
  { label: "Classic games", value: "13", icon: Gamepad2, color: "#00F0FF" },
  { label: "Live leaderboards", value: "∞", icon: Trophy, color: "#FFD100" },
  { label: "Retro sounds", value: "8-bit", icon: Zap, color: "#39FF14" },
];

export default function Home() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 md:px-8 md:pt-14">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#16152b] p-6 sm:p-10">
        <div className="pointer-events-none absolute inset-0 rmc-scanlines opacity-40" />
        <div
          className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full blur-3xl"
          style={{ backgroundColor: "rgba(255,71,154,0.35)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-32 -right-24 h-80 w-80 rounded-full blur-3xl"
          style={{ backgroundColor: "rgba(0,240,255,0.28)" }}
        />

        <div className="relative grid gap-8 md:grid-cols-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="md:col-span-7"
          >
            <span className="chip" data-testid="hero-tag">
              <Sparkles className="h-3.5 w-3.5 text-neon-pink" />
              Remembering My Childhood
            </span>
            <h1 className="mt-4 font-display text-4xl font-black uppercase leading-[0.95] tracking-tighter text-white sm:text-5xl lg:text-6xl">
              The <span className="text-neon-pink">arcade</span> that
              <br />
              raised us — <span className="text-neon-cyan">reborn.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[#c9c8e2]">
              RMC CLASSICS is a pocket-sized shrine to the games that filled every
              rainy afternoon and family road trip. Thirteen timeless classics, real-time
              friend battles, and one global leaderboard — zero downloads.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/library"
                data-testid="hero-play-btn"
                onClick={() => sfx.click()}
                className="btn-arcade rounded-full px-7 py-3 text-sm font-black"
              >
                ▶ Start playing
              </Link>
              <Link
                to={user ? "/leaderboard" : "/register"}
                data-testid="hero-secondary-btn"
                onClick={() => sfx.click()}
                className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold uppercase tracking-widest text-white hover:bg-white/10"
              >
                {user ? "View ranks" : "Create account"}
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-6">
              {stats.map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="flex items-center gap-3">
                    <div
                      className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5"
                      style={{ boxShadow: `0 0 18px ${s.color}44` }}
                    >
                      <Icon className="h-4 w-4" style={{ color: s.color }} />
                    </div>
                    <div>
                      <div className="font-pixel text-xl leading-none" style={{ color: s.color }}>
                        {s.value}
                      </div>
                      <div className="text-xs uppercase tracking-widest text-[#a3a1c6]">
                        {s.label}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Right visual: stacked mini arcade cabinet */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="relative md:col-span-5"
            aria-hidden="true"
          >
            <div className="relative mx-auto aspect-[3/4] max-w-sm rounded-3xl border-2 border-white/15 bg-gradient-to-b from-[#221e42] to-[#0b0a1a] p-4">
              <div className="h-full w-full rounded-2xl border-2 border-black/40 bg-[#0b0a1a] p-3">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-pixel text-[10px] text-neon-cyan">RMC-01</span>
                  <span className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-neon-pink" />
                    <span className="h-2 w-2 rounded-full bg-neon-yellow" />
                    <span className="h-2 w-2 rounded-full bg-neon-cyan" />
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 16 }).map((_, i) => {
                    const colors = ["#FF479A", "#00F0FF", "#FFD100", "#39FF14"];
                    const c = colors[(i * 3) % colors.length];
                    return (
                      <motion.div
                        key={i}
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: i * 0.03, type: "spring" }}
                        className="aspect-square rounded-md"
                        style={{ backgroundColor: c, boxShadow: `0 0 12px ${c}77` }}
                      />
                    );
                  })}
                </div>
                <div className="mt-4 rounded-lg border border-white/10 bg-black/40 p-3 text-center">
                  <div className="font-pixel text-xs text-neon-yellow">HIGH SCORE</div>
                  <div className="font-display text-2xl font-black text-white">
                    {user?.total_wins ?? 0} WINS
                  </div>
                </div>
              </div>
              <div className="mt-4 flex justify-center gap-3">
                <span className="h-3 w-16 rounded-full bg-[#ff479a]" />
                <span className="h-3 w-16 rounded-full bg-[#00f0ff]" />
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* DAILY CHALLENGE */}
      <section className="mt-10">
        <DailyChallenge />
      </section>

      {/* FRIEND BATTLES CTA */}
      <section className="mt-8">
        <Link
          to="/battles"
          data-testid="home-battles-cta"
          onClick={() => sfx.click()}
          className="group relative block overflow-hidden rounded-3xl border border-neon-pink/40 bg-[#16152b] p-6"
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-neon-pink/30 blur-3xl" />
          <div className="relative flex flex-wrap items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-neon-pink/20 glow-pink">
              <span className="font-display text-xl font-black text-white">⚔</span>
            </div>
            <div className="flex-1 min-w-[220px]">
              <p className="font-pixel text-xs text-neon-pink">// NEW · FRIEND BATTLES</p>
              <h3 className="mt-1 font-display text-xl font-black uppercase tracking-tight text-white sm:text-2xl">
                Challenge a friend
              </h3>
              <p className="mt-1 text-sm text-[#c9c8e2]">
                Real-time Connect Four 1v1. Share a link, take turns, first four in a row wins.
              </p>
            </div>
            <div className="btn-arcade rounded-full px-5 py-2 text-xs">Open lobby</div>
          </div>
        </Link>
      </section>

      {/* GAME GRID */}
      <section className="mt-14">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <p className="font-pixel text-xs text-neon-cyan">// LIBRARY</p>
            <h2 className="mt-1 font-display text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
              Pick your poison
            </h2>
          </div>
          <Link
            to="/library"
            data-testid="see-all-games"
            className="hidden text-sm font-semibold uppercase tracking-widest text-[#a3a1c6] hover:text-white sm:block"
          >
            See all →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((g, i) => (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.4 }}
            >
              <GameCard game={g} index={i} />
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mt-16 rounded-3xl border border-white/10 bg-[#16152b] p-8 text-center">
        <p className="font-pixel text-xs text-neon-yellow">// COMING SOON</p>
        <h3 className="mt-2 font-display text-xl font-black uppercase tracking-tight text-white sm:text-2xl">
          Jenga · Hopscotch · Marbles · Obstacle Course
        </h3>
        <p className="mt-3 text-sm text-[#a3a1c6]">
          More childhood classics dropping soon. Sign up to get notified.
        </p>
      </section>
    </div>
  );
}
