import { useEffect, useMemo, useState } from "react";
import GameShell from "@/components/rmc/GameShell";
import ShareCard from "@/components/rmc/ShareCard";
import { sfx } from "@/lib/sound";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { GAME_MAP } from "@/lib/games";

const SYMBOLS = ["★", "◆", "▲", "●", "♥", "♣", "☀", "☾"];

function makeDeck() {
  const cards = [...SYMBOLS, ...SYMBOLS]
    .map((s, i) => ({ id: i, symbol: s, matched: false }))
    .sort(() => Math.random() - 0.5);
  return cards;
}

export default function MemoryMatch() {
  const { user, submitScore } = useAuth();
  const [deck, setDeck] = useState(makeDeck);
  const [flipped, setFlipped] = useState([]);
  const [moves, setMoves] = useState(0);
  const [locked, setLocked] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [xpInfo, setXpInfo] = useState({ xp: 0, done: false });

  const won = useMemo(() => deck.every((c) => c.matched), [deck]);

  useEffect(() => {
    if (won && !submitted) {
      sfx.win();
      toast.success(`Cleared in ${moves} moves!`);
      setSubmitted(true);
      if (user) {
        submitScore({ game_id: "memory", won: true, score: moves }).then((res) => {
          if (res.ok) setXpInfo({ xp: res.xp_gained, done: res.challenge_completed });
          setShareOpen(true);
        });
      } else {
        setShareOpen(true);
      }
    }
  }, [won, submitted, moves, user, submitScore]);

  const handleFlip = (idx) => {
    if (locked) return;
    const card = deck[idx];
    if (card.matched) return;
    if (flipped.includes(idx)) return;
    sfx.flip();
    const next = [...flipped, idx];
    setFlipped(next);
    if (next.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = next;
      if (deck[a].symbol === deck[b].symbol) {
        setTimeout(() => {
          setDeck((d) => d.map((c, i) => (i === a || i === b ? { ...c, matched: true } : c)));
          setFlipped([]);
          sfx.match();
        }, 350);
      } else {
        setLocked(true);
        setTimeout(() => {
          setFlipped([]);
          setLocked(false);
        }, 800);
      }
    }
  };

  const reset = () => {
    setDeck(makeDeck());
    setFlipped([]);
    setMoves(0);
    setLocked(false);
    setSubmitted(false);
    setShareOpen(false);
  };

  return (
    <GameShell
      title="Memory Match"
      subtitle="Flip two cards. Find every pair."
      color="#FF479A"
      onReset={reset}
      extraActions={
        <span className="chip !border-neon-pink/50 !text-neon-pink" data-testid="memory-moves">
          Moves: {moves}
        </span>
      }
    >
      <div
        className="grid gap-2 sm:gap-3"
        style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
        data-testid="memory-board"
      >
        {deck.map((card, i) => {
          const isOpen = card.matched || flipped.includes(i);
          return (
            <button
              type="button"
              key={card.id}
              onClick={() => handleFlip(i)}
              data-testid={`memory-card-${i}`}
              className="relative aspect-square rounded-xl border border-white/10 text-3xl font-black transition-transform duration-200 sm:text-4xl"
              style={{
                backgroundColor: isOpen ? "#ff479a" : "#221e42",
                color: isOpen ? "#0b0a1a" : "transparent",
                boxShadow: card.matched ? "0 0 20px rgba(255,71,154,0.5)" : "none",
                transform: isOpen ? "rotateY(0deg)" : "rotateY(0deg)",
              }}
            >
              {isOpen ? card.symbol : "?"}
            </button>
          );
        })}
      </div>
      {won && (
        <div className="mt-6 rounded-2xl border border-neon-pink/40 bg-white/5 p-4 text-center">
          <p className="font-pixel text-neon-yellow">// CLEARED</p>
          <p className="mt-1 font-display text-xl font-black uppercase text-white">
            {moves} moves — nice memory!
          </p>
        </div>
      )}
      <ShareCard
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        game={GAME_MAP.memory}
        won={won}
        statLabel="Moves"
        statValue={moves}
        xpGained={xpInfo.xp}
        challengeCompleted={xpInfo.done}
      />
    </GameShell>
  );
}
