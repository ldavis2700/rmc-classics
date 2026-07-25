import { useEffect, useState } from "react";
import GameShell from "@/components/rmc/GameShell";
import ShareCard from "@/components/rmc/ShareCard";
import { sfx } from "@/lib/sound";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { GAME_MAP } from "@/lib/games";

const SUITS = [
  { id: "♠", color: "#FFFFFF" },
  { id: "♥", color: "#FF479A" },
  { id: "♦", color: "#FFD100" },
  { id: "♣", color: "#00F0FF" },
];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function buildDeck() {
  const deck = [];
  SUITS.forEach((s) => RANKS.forEach((r) => deck.push({ suit: s.id, rank: r, color: s.color, id: `${r}${s.id}` })));
  return deck.sort(() => Math.random() - 0.5);
}

function canPlay(card, top, wildSuit) {
  if (card.rank === "8") return true;
  if (top.rank === "8" && wildSuit) return card.suit === wildSuit;
  return card.suit === top.suit || card.rank === top.rank;
}

function firstNonEight(deck) {
  const idx = deck.findIndex((c) => c.rank !== "8");
  if (idx === -1) return { start: deck[0], rest: deck.slice(1) };
  const start = deck[idx];
  const rest = [...deck.slice(0, idx), ...deck.slice(idx + 1)];
  return { start, rest };
}

export default function CrazyEights() {
  const { user, submitScore } = useAuth();
  const [state, setState] = useState(null);
  const [turn, setTurn] = useState("you");
  const [wildSuit, setWildSuit] = useState(null);
  const [pickSuit, setPickSuit] = useState(false); // player picks after playing 8
  const [winner, setWinner] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("Play a card that matches suit or rank.");
  const [shareOpen, setShareOpen] = useState(false);
  const [xpInfo, setXpInfo] = useState({ xp: 0, done: false });

  const init = () => {
    let deck = buildDeck();
    const you = deck.slice(0, 7);
    const cpu = deck.slice(7, 14);
    deck = deck.slice(14);
    const { start, rest } = firstNonEight(deck);
    setState({ you, cpu, deck: rest, discard: [start] });
    setTurn("you");
    setWildSuit(null);
    setPickSuit(false);
    setWinner(null);
    setSubmitted(false);
    setShareOpen(false);
    setMessage("Play a card that matches suit or rank.");
  };

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (winner && !submitted) {
      const won = winner === "you";
      won ? sfx.win() : sfx.lose();
      toast[won ? "success" : "error"](won ? "Empty hand — you win!" : "CPU emptied first.");
      setSubmitted(true);
      if (user) {
        submitScore({ game_id: "crazy8", won, score: won ? 1 : 0 }).then((res) => {
          if (res.ok) setXpInfo({ xp: res.xp_gained, done: res.challenge_completed, badges: res.newly_unlocked_badges });
          setShareOpen(true);
        });
      } else {
        setShareOpen(true);
      }
    }
  }, [winner, submitted, user, submitScore]);

  // CPU turn
  useEffect(() => {
    if (!state || turn !== "cpu" || winner || pickSuit) return;
    const t = setTimeout(() => {
      const top = state.discard[state.discard.length - 1];
      let hand = state.cpu.slice();
      let deck = state.deck.slice();
      let discard = state.discard.slice();
      let currentWild = wildSuit;
      let played = false;
      let idx = hand.findIndex((c) => canPlay(c, top, currentWild));
      // draw until playable, but keep it reasonable
      let safety = 25;
      while (idx === -1 && deck.length > 0 && safety-- > 0) {
        const drawn = deck.shift();
        hand.push(drawn);
        idx = hand.findIndex((c) => canPlay(c, top, currentWild));
      }
      if (idx !== -1) {
        const card = hand.splice(idx, 1)[0];
        discard.push(card);
        sfx.card();
        played = true;
        if (card.rank === "8") {
          const suitCounts = {};
          hand.forEach((c) => { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
          const chosen = Object.entries(suitCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || SUITS[0].id;
          currentWild = chosen;
          setMessage(`CPU played 8 and picked ${chosen}.`);
        } else {
          currentWild = null;
          setMessage(`CPU played ${card.rank}${card.suit}.`);
        }
      } else {
        setMessage("CPU passed (deck empty).");
      }
      setWildSuit(currentWild);
      setState({ ...state, cpu: hand, deck, discard });
      if (hand.length === 0) {
        setWinner("cpu");
        return;
      }
      if (played) setTurn("you");
      else setTurn("you"); // pass
    }, 700);
    return () => clearTimeout(t);
  }, [state, turn, winner, wildSuit, pickSuit]);

  if (!state) return null;

  const top = state.discard[state.discard.length - 1];

  const playCard = (i) => {
    if (turn !== "you" || pickSuit || winner) return;
    const card = state.you[i];
    if (!canPlay(card, top, wildSuit)) {
      setMessage("Card doesn't match. Draw or pick another.");
      return;
    }
    const hand = state.you.slice();
    const played = hand.splice(i, 1)[0];
    const discard = state.discard.slice();
    discard.push(played);
    sfx.card();
    const next = { ...state, you: hand, discard };
    setState(next);
    if (played.rank === "8") {
      setPickSuit(true);
      setMessage("Pick a suit.");
      // stay on your turn until suit picked
      return;
    }
    setWildSuit(null);
    if (hand.length === 0) {
      setWinner("you");
      return;
    }
    setMessage("CPU thinking…");
    setTurn("cpu");
  };

  const drawCard = () => {
    if (turn !== "you" || pickSuit || winner) return;
    const deck = state.deck.slice();
    if (deck.length === 0) {
      setMessage("Deck empty — pass.");
      setTurn("cpu");
      return;
    }
    const card = deck.shift();
    sfx.flip();
    setState({ ...state, deck, you: [...state.you, card] });
    setMessage(`Drew ${card.rank}${card.suit}. Play if you can, otherwise draw again or the CPU takes over.`);
  };

  const pickSuitBtn = (suit) => {
    setWildSuit(suit);
    setPickSuit(false);
    sfx.click();
    if (state.you.length === 0) {
      setWinner("you");
      return;
    }
    setMessage(`You picked ${suit}. CPU's turn.`);
    setTurn("cpu");
  };

  return (
    <GameShell
      title="Crazy Eights"
      subtitle="Match suit or rank. 8s are wild — pick a suit when you play one."
      color="#39FF14"
      onReset={init}
      extraActions={
        <span className="chip !border-neon-green/50 !text-neon-green" data-testid="c8-turn">
          {winner ? (winner === "you" ? "You won" : "CPU won") : turn === "you" ? "Your turn" : "CPU"}
        </span>
      }
    >
      {/* CPU hand (backs) */}
      <div className="flex flex-wrap justify-center gap-1" data-testid="c8-cpu-hand">
        {state.cpu.map((_, i) => (
          <div
            key={i}
            className="h-16 w-11 rounded-md border border-white/20 bg-[#ff479a]"
            style={{
              background: "repeating-linear-gradient(45deg, #ff479a, #ff479a 4px, #c11264 4px, #c11264 8px)",
            }}
          />
        ))}
      </div>

      {/* Discard + Deck */}
      <div className="my-6 flex items-center justify-center gap-8">
        <button
          type="button"
          onClick={drawCard}
          disabled={turn !== "you" || pickSuit || !!winner}
          data-testid="c8-draw"
          className="grid h-24 w-16 place-items-center rounded-lg border border-white/20 bg-black/50 font-pixel text-xs text-neon-yellow disabled:opacity-40"
          style={{
            background: "repeating-linear-gradient(-45deg, #221e42, #221e42 4px, #16152b 4px, #16152b 8px)",
          }}
        >
          Draw ({state.deck.length})
        </button>
        <div
          className="grid h-24 w-16 place-items-center rounded-lg border-2 bg-white text-black shadow-lg"
          style={{
            borderColor: wildSuit ? "#39FF14" : "rgba(0,0,0,0.2)",
            boxShadow: wildSuit ? "0 0 18px #39FF1466" : "none",
          }}
          data-testid="c8-top-card"
        >
          <div className="font-display text-2xl font-black leading-none" style={{ color: top.color === "#FFFFFF" ? "#111" : top.color }}>
            {top.rank}
          </div>
          <div className="text-3xl" style={{ color: top.color === "#FFFFFF" ? "#111" : top.color }}>
            {top.suit}
          </div>
          {wildSuit && (
            <div className="font-pixel text-[9px] text-neon-green">→ {wildSuit}</div>
          )}
        </div>
      </div>

      {/* Message */}
      <p className="mb-4 text-center text-sm text-[#c9c8e2]" data-testid="c8-message">{message}</p>

      {/* Suit picker */}
      {pickSuit && (
        <div className="mb-4 flex justify-center gap-2">
          {SUITS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => pickSuitBtn(s.id)}
              data-testid={`c8-pick-${s.id}`}
              className="grid h-12 w-12 place-items-center rounded-lg border border-white/20 bg-white text-2xl font-black"
              style={{ color: s.color === "#FFFFFF" ? "#111" : s.color }}
            >
              {s.id}
            </button>
          ))}
        </div>
      )}

      {/* Your hand */}
      <div className="flex flex-wrap justify-center gap-2" data-testid="c8-you-hand">
        {state.you.map((c, i) => {
          const playable = canPlay(c, top, wildSuit);
          return (
            <button
              key={c.id + i}
              type="button"
              onClick={() => playCard(i)}
              disabled={turn !== "you" || pickSuit || !!winner || !playable}
              data-testid={`c8-card-${i}`}
              className="grid h-24 w-16 place-items-center rounded-lg border-2 bg-white text-black transition-transform duration-150 hover:-translate-y-2 disabled:opacity-50 disabled:hover:translate-y-0"
              style={{
                borderColor: playable ? "#39FF14" : "rgba(0,0,0,0.2)",
                boxShadow: playable ? "0 0 14px #39FF1444" : "none",
              }}
            >
              <div className="font-display text-2xl font-black leading-none" style={{ color: c.color === "#FFFFFF" ? "#111" : c.color }}>
                {c.rank}
              </div>
              <div className="text-3xl" style={{ color: c.color === "#FFFFFF" ? "#111" : c.color }}>{c.suit}</div>
            </button>
          );
        })}
      </div>
      <ShareCard
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        game={GAME_MAP.crazy8}
        won={winner === "you"}
        statLabel="Cards left"
        statValue={winner === "cpu" ? state.you.length : 0}
        xpGained={xpInfo.xp}
        challengeCompleted={xpInfo.done}
        newlyUnlockedBadges={xpInfo.badges}
      />
    </GameShell>
  );
}
