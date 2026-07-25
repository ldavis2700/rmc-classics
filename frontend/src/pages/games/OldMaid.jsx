import { useEffect, useState, useCallback } from "react";
import GameShell from "@/components/rmc/GameShell";
import ShareCard from "@/components/rmc/ShareCard";
import { sfx } from "@/lib/sound";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { GAME_MAP } from "@/lib/games";

const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const SUITS = ["♠","♥","♦","♣"];
const SUIT_COLOR = { "♠": "#1a1300", "♥": "#c11264", "♦": "#c58800", "♣": "#003b40" };

function buildDeckMinusQueen() {
  const deck = [];
  RANKS.forEach((r) => SUITS.forEach((s) => deck.push({ rank: r, suit: s, id: `${r}${s}` })));
  // Remove Q♠ so one Queen is the "Old Maid"
  const idx = deck.findIndex((c) => c.rank === "Q" && c.suit === "♠");
  if (idx !== -1) deck.splice(idx, 1);
  return deck.sort(() => Math.random() - 0.5);
}

function pairOff(hand) {
  const counts = {};
  hand.forEach((c) => { counts[c.rank] = (counts[c.rank] || 0) + 1; });
  const keep = [];
  const seen = {};
  for (const c of hand) {
    seen[c.rank] = (seen[c.rank] || 0) + 1;
    const total = counts[c.rank];
    // For each rank, keep leftover if odd — pair off in twos: keep index (seen%2 === 1) if odd count leftover
    // Simpler: pair off greedily — keep only if position within group is > 2*floor(total/2)
    if (seen[c.rank] > Math.floor(total / 2) * 2) keep.push(c);
  }
  return keep;
}

export default function OldMaid() {
  const { user, submitScore } = useAuth();
  const [state, setState] = useState(null);
  const [turn, setTurn] = useState("you");
  const [message, setMessage] = useState("Draw a card from the CPU. Match its rank to discard a pair.");
  const [winner, setWinner] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [xpInfo, setXpInfo] = useState({ xp: 0, done: false, badges: [] });
  const [flashCard, setFlashCard] = useState(null);

  const init = () => {
    const deck = buildDeckMinusQueen();
    // Deal alternating
    let you = [], cpu = [];
    deck.forEach((c, i) => (i % 2 === 0 ? you.push(c) : cpu.push(c)));
    you = pairOff(you);
    cpu = pairOff(cpu);
    setState({ you, cpu });
    setTurn("you");
    setMessage("Pick a card from the CPU's fanned-out hand.");
    setWinner(null);
    setSubmitted(false);
    setShareOpen(false);
    setFlashCard(null);
  };
  useEffect(() => { init(); }, []);

  const finalize = useCallback(async (won) => {
    won ? sfx.win() : sfx.lose();
    toast[won ? "success" : "error"](won ? "You dodged the Old Maid!" : "You're stuck with her!");
    if (user && !submitted) {
      const res = await submitScore({ game_id: "oldmaid", won, score: won ? 1 : 0 });
      if (res.ok) setXpInfo({ xp: res.xp_gained, done: res.challenge_completed, badges: res.newly_unlocked_badges });
      setSubmitted(true);
    }
    setShareOpen(true);
  }, [user, submitted, submitScore]);

  useEffect(() => {
    if (winner === "you" || winner === "cpu") finalize(winner === "you");
  }, [winner, finalize]);

  // If a player has 0 cards after their move, they win (they went out). The other keeps the odd Queen and loses.
  const applyEndCheck = (nextYou, nextCpu) => {
    if (nextYou.length === 0) {
      setWinner("you");
      return true;
    }
    if (nextCpu.length === 0) {
      setWinner("cpu");
      return true;
    }
    return false;
  };

  const drawFromCpu = (cpuIdx) => {
    if (turn !== "you" || !state || winner) return;
    sfx.card();
    const cpu = state.cpu.slice();
    const [taken] = cpu.splice(cpuIdx, 1);
    let you = [...state.you];
    setFlashCard(taken);
    // Check for pair
    const pairIdx = you.findIndex((c) => c.rank === taken.rank);
    if (pairIdx !== -1) {
      const [pair] = you.splice(pairIdx, 1);
      setMessage(`Drew ${taken.rank}${taken.suit} — paired with ${pair.rank}${pair.suit}. Discarded!`);
      sfx.match();
    } else {
      you.push(taken);
      setMessage(`Drew ${taken.rank}${taken.suit}. No pair — hold it.`);
    }
    setTimeout(() => setFlashCard(null), 900);
    setState({ you, cpu });
    if (applyEndCheck(you, cpu)) return;
    setTurn("cpu");
  };

  // CPU turn: pick random card from your hand
  useEffect(() => {
    if (turn !== "cpu" || !state || winner) return;
    const t = setTimeout(() => {
      let cpu = state.cpu.slice();
      let you = state.you.slice();
      if (you.length === 0) { setWinner("you"); return; }
      const idx = Math.floor(Math.random() * you.length);
      const [taken] = you.splice(idx, 1);
      const pairIdx = cpu.findIndex((c) => c.rank === taken.rank);
      let msg;
      if (pairIdx !== -1) {
        const [pair] = cpu.splice(pairIdx, 1);
        msg = `CPU took ${taken.rank}${taken.suit} — paired with ${pair.rank}${pair.suit}.`;
        sfx.match();
      } else {
        cpu.push(taken);
        msg = `CPU took ${taken.rank}${taken.suit}. No pair.`;
        sfx.card();
      }
      setState({ you, cpu });
      setMessage(msg);
      if (applyEndCheck(you, cpu)) return;
      setTurn("you");
    }, 900);
    return () => clearTimeout(t);
  }, [turn, state, winner]);

  if (!state) return null;

  return (
    <GameShell
      title="Old Maid"
      subtitle="Draw from the CPU, match ranks to discard pairs. Empty your hand first."
      color="#FF479A"
      onReset={init}
      extraActions={
        <span className="chip !border-neon-pink/50 !text-neon-pink" data-testid="oldmaid-turn">
          You: {state.you.length} · CPU: {state.cpu.length}
        </span>
      }
    >
      {/* CPU fanned hand */}
      <div className="mb-4">
        <p className="text-center font-pixel text-[10px] uppercase tracking-widest text-neon-pink">
          Pick from CPU
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-1" data-testid="oldmaid-cpu-hand">
          {state.cpu.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => drawFromCpu(i)}
              disabled={turn !== "you" || winner}
              data-testid={`oldmaid-cpu-card-${i}`}
              className="h-14 w-10 rounded-md border-2 border-black/40 bg-[#8a0e48] transition-transform duration-150 hover:-translate-y-2 disabled:opacity-40 disabled:hover:translate-y-0"
              style={{
                background: "repeating-linear-gradient(45deg, #ff479a, #ff479a 3px, #8a0e48 3px, #8a0e48 6px)",
              }}
              aria-label={`Pick card ${i + 1}`}
            />
          ))}
        </div>
      </div>

      {flashCard && (
        <div className="mb-3 flex justify-center">
          <div
            className="grid h-20 w-14 place-items-center rounded-lg border-2 border-neon-yellow bg-white shadow-lg"
            style={{ color: SUIT_COLOR[flashCard.suit], boxShadow: "0 0 22px #FFD100" }}
          >
            <div className="font-display text-lg font-black">{flashCard.rank}</div>
            <div className="text-2xl">{flashCard.suit}</div>
          </div>
        </div>
      )}

      <p className="mb-4 text-center text-sm text-[#c9c8e2]" data-testid="oldmaid-message">{message}</p>

      <p className="mb-2 text-center font-pixel text-xs uppercase tracking-widest text-neon-cyan">
        Your hand
      </p>
      <div className="flex flex-wrap justify-center gap-1.5" data-testid="oldmaid-you-hand">
        {state.you.map((c) => (
          <div
            key={c.id}
            className="grid h-16 w-11 place-items-center rounded-md border-2 border-white/30 bg-white"
            style={{ color: SUIT_COLOR[c.suit] }}
          >
            <div className="font-display text-base font-black leading-none">{c.rank}</div>
            <div className="text-lg">{c.suit}</div>
          </div>
        ))}
      </div>

      <ShareCard
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        game={GAME_MAP.oldmaid}
        won={winner === "you"}
        xpGained={xpInfo.xp}
        challengeCompleted={xpInfo.done}
        newlyUnlockedBadges={xpInfo.badges}
      />
    </GameShell>
  );
}
