import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, Gamepad2, Trophy, Zap, Crown, X } from "lucide-react";
import GameCard from "@/components/rmc/GameCard";
import DailyChallenge from "@/components/rmc/DailyChallenge";
import HeroReel from "@/components/rmc/HeroReel";
import { GAMES } from "@/lib/games";
import { sfx } from "@/lib/sound";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/context/AuthContext";
import SponsorUnit from "@/components/rmc/SponsorUnit";
import { MONETIZATION } from "@/lib/monetization";

const stats = [
  { label: "Classic games", value: "14", icon: Gamepad2, color: "#00F0FF" },
  { label: "Live leaderboards", value: "∞", icon: Trophy, color: "#FFD100" },
  { label: "Retro sounds", value: "8-bit", icon: Zap, color: "#39FF14" },
];

export default function Home() {
  const { user } = useAuth();
  const [showFoundingMemberOffer, setShowFoundingMemberOffer] = useState(false);

  useEffect(() => {
    const cohortKey = "rmc_founding_member_cohort_v1";
    const dismissedKey = "rmc_founding_member_dismissed_v1";
    let cohort = window.localStorage.getItem(cohortKey);

    if (!cohort) {
      cohort = Math.random() < 0.25 ? "treatment" : "control";
      window.localStorage.setItem(cohortKey, cohort);
    }

    if (cohort !== "treatment" || window.localStorage.getItem(dismissedKey) === "true") {
      return;
    }

    setShowFoundingMemberOffer(true);
    trackEvent("membership_offer_viewed", {
      experiment: "founding_member_interest_v1",
      placement: "home",
      cohort,
    });
  }, []);

  const recordFoundingMemberInterest = () => {
    sfx.click();
    trackEvent("founding_member_interest_clicked", {
      experiment: "founding_member_interest_v1",
      placement: "home",
      signed_in: Boolean(user),
    });
  };

  const dismissFoundingMemberOffer = () => {
    window.localStorage.setItem("rmc_founding_member_dismissed_v1", "true");
    setShowFoundingMemberOffer(false);
    trackEvent("membership_offer_dismissed", {
      experiment: "founding_member_interest_v1",
      placement: "home",
    });
  };

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
              rainy afternoon and family road trip. Fourteen timeless classics, real-time
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

          {/* Right visual: auto-playing hero reel */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="relative md:col-span-5"
            aria-hidden="true"
            data-testid="hero-reel"
          >
            <HeroReel />
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

      {/* REVERSIBLE DEMAND TEST: no checkout, charge, entitlement, or paywall */}
      {showFoundingMemberOffer && <section
        className="relative mt-8 overflow-hidden rounded-3xl border border-neon-yellow/40 bg-[#16152b] p-6 sm:p-8"
        data-testid="founding-member-interest"
      >
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-neon-yellow/20 blur-3xl" />
        <button
          type="button"
          onClick={dismissFoundingMemberOffer}
          aria-label="Dismiss Founding Member preview"
          className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/20 text-[#a3a1c6] hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="relative grid items-center gap-6 md:grid-cols-[1fr_auto]">
          <div>
            <p className="font-pixel text-xs text-neon-yellow">// FOUNDING MEMBER PREVIEW</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-neon-yellow/30 bg-neon-yellow/10">
                <Crown className="h-5 w-5 text-neon-yellow" aria-hidden="true" />
              </div>
              <h2 className="font-display text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
                Help shape RMC Membership
              </h2>
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[#c9c8e2]">
              We are exploring optional member perks like profile customization, cosmetic themes,
              enhanced personal stats, and early previews. Core games stay playable without a membership.
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-[#a3a1c6]">
              Interest only — no purchase, subscription, or payment today.
            </p>
          </div>
          <a
            href={MONETIZATION.foundingPilotUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={recordFoundingMemberInterest}
            data-testid="founding-member-interest-btn"
            className="btn-arcade inline-flex justify-center rounded-full px-7 py-3 text-center text-sm font-black"
          >
            View the founding pilot
          </a>
        </div>
      </section>}

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
          Hopscotch · Marbles · Obstacle Course
        </h3>
        <p className="mt-3 text-sm text-[#a3a1c6]">
          More childhood classics dropping soon. Sign up to get notified.
        </p>
      </section>
      <SponsorUnit placement="home" />
    </div>
  );
}
