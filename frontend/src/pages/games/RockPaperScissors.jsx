import { useEffect, useState } from "react";
import GameShell from "@/components/rmc/GameShell";
import ShareCard from "@/components/rmc/ShareCard";
import { sfx } from "@/lib/sound";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { GAME_MAP } from "@/lib/games";

const CHOICES = [
  { id: "rock", label: "Rock", emoji: "✊", color: "#FF479A" },
  { id: "paper", label: "Paper", emoji: "✋", color: "#00F0FF" },
  { id: "scissors", label: "Scissors", emoji: "✌", color: "#FFD100" },
];

const BEATS = { rock: "scissors", scissors: "paper", paper: "rock" };
const WIN_TARGET = 3; // best of 5

export default function RockPaperScissors() {
  const { user, submitScore } = useAuth();
  const [you, setYou] = useState(0);
  const [cpu, setCpu] = useState(0);
  const [round, setRound] = useState(1);
  const [lastYou, setLastYou] = useState(null);
  const [lastCpu, setLastCpu] = useState(null);
  const [result, setResult] = useState(null); // 'win','lose','draw'
  const [finished, setFinished] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [xpInfo, setXpInfo] = useState({ xp: 0, done: false });

  useEffect(() => {
    if (finished && !submitted) {
      const won = finished === "you";
      won ? sfx.win() : sfx.lose();
      toast[won ? "success" : "error"](won ? "Series won!" : "Series lost.");
      setSubmitted(true);
      if (user) {
        submitScore({ game_id: "rps", won, score: won ? 1 : 0 }).then((res) => {
          if (res.ok) setXpInfo({ xp: res.xp_gained, done: res.challenge_completed, badges: res.newly_unlocked_badges });
          setShareOpen(true);
        });
      } else {
        setShareOpen(true);
      }
    }
  }, [finished, submitted, user, submitScore]);

  const play = (choice) => {
    if (busy || finished) return;
    setBusy(true);
    const cpuChoice = CHOICES[Math.floor(Math.random() * 3)].id;
    setLastYou(choice);
    setLastCpu(cpuChoice);
    sfx.click();
    let outcome;
    let ny = you;
    let nc = cpu;
    if (choice === cpuChoice) outcome = "draw";
    else if (BEATS[choice] === cpuChoice) { outcome = "win"; ny = you + 1; }
    else { outcome = "lose"; nc = cpu + 1; }
    setResult(outcome);
    setYou(ny);
    setCpu(nc);
    setTimeout(() => {
      if (ny >= WIN_TARGET) setFinished("you");
      else if (nc >= WIN_TARGET) setFinished("cpu");
      else {
        setRound((r) => r + 1);
      }
      setBusy(false);
    }, 700);
  };

  const reset = () => {
    setYou(0); setCpu(0); setRound(1); setLastYou(null); setLastCpu(null); setResult(null);
    setFinished(null); setSubmitted(false); setShareOpen(false);
  };

  return (
    <GameShell
      title="Rock Paper Scissors"
      subtitle="Best of five. First to 3 wins."
      color="#FF479A"
      onReset={reset}
      extraActions={
        <span className="chip !border-neon-pink/50 !text-neon-pink" data-testid="rps-round">
          Round {round}
        </span>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <ArenaSide label="You" emoji={emojiFor(lastYou)} score={you} color="#00F0FF" side="you" />
        <ArenaSide label="CPU" emoji={emojiFor(lastCpu)} score={cpu} color="#FF479A" side="cpu" />
      </div>

      <div className="mt-6 flex justify-center">
        {result && (
          <div
            className="rounded-full border px-4 py-2 font-pixel text-xs uppercase tracking-widest"
            style={{
              borderColor:
                result === "win" ? "rgba(57,255,20,0.5)" : result === "lose" ? "rgba(255,71,154,0.5)" : "rgba(255,209,0,0.5)",
              color: result === "win" ? "#39FF14" : result === "lose" ? "#FF479A" : "#FFD100",
            }}
            data-testid="rps-result"
          >
            {result === "win" ? "You take the round" : result === "lose" ? "CPU takes the round" : "Draw"}
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {CHOICES.map((c) => (
          <button
            type="button"
            key={c.id}
            onClick={() => play(c.id)}
            disabled={busy || !!finished}
            data-testid={`rps-${c.id}`}
            className="group relative rounded-2xl border border-white/10 bg-white/5 p-5 text-center transition-transform duration-200 hover:-translate-y-1 disabled:opacity-40"
            style={{ boxShadow: `0 0 0 rgba(0,0,0,0)` }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = `0 0 22px ${c.color}55`;
              sfx.hover();
            }}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 0 0 rgba(0,0,0,0)")}
          >
            <div className="text-4xl">{c.emoji}</div>
            <div className="mt-2 font-pixel text-xs" style={{ color: c.color }}>{c.label}</div>
          </button>
        ))}
      </div>

      {finished && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
          <p className="font-pixel text-neon-yellow">// SERIES OVER</p>
          <p className="mt-1 font-display text-xl font-black uppercase text-white" data-testid="rps-finished">
            {finished === "you" ? "You dominated!" : "CPU dominated."}
          </p>
        </div>
      )}
      <ShareCard
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        game={GAME_MAP.rps}
        won={finished === "you"}
        statLabel="Rounds won"
        statValue={you}
        xpGained={xpInfo.xp}
        challengeCompleted={xpInfo.done}
        newlyUnlockedBadges={xpInfo.badges}
      />
    </GameShell>
  );
}

function emojiFor(id) {
  return CHOICES.find((c) => c.id === id)?.emoji || "?";
}

function ArenaSide({ label, emoji, score, color, side }) {
  return (
    <div
      className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center"
      style={{ boxShadow: `inset 0 0 40px ${color}22` }}
      data-testid={`rps-side-${side}`}
    >
      <div className="text-6xl">{emoji}</div>
      <div className="mt-3 font-pixel text-xs uppercase tracking-widest" style={{ color }}>
        {label}
      </div>
      <div className="mt-1 font-display text-4xl font-black">{score}</div>
    </div>
  );
}
