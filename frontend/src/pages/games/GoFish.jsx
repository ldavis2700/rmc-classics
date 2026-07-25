import { useEffect, useState, useCallback, useMemo } from "react";
import GameShell from "@/components/rmc/GameShell";
import ShareCard from "@/components/rmc/ShareCard";
import { sfx } from "@/lib/sound";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { GAME_MAP } from "@/lib/games";

const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const SUITS = ["♠","♥","♦","♣"];
const SUIT_COLOR = { "♠": "#1a1300", "♥": "#c11264", "♦": "#c58800", "♣": "#003b40" };

function buildDeck() {
  const deck = [];
  RANKS.forEach((r) => SUITS.forEach((s) => deck.push({ rank: r, suit: s, id: `${r}${s}` })));
  return deck.sort(() => Math.random() - 0.5);
}

function findBooks(hand) {
  const groups = {};
  hand.forEach((c) => { (groups[c.rank] = groups[c.rank] || []).push(c); });
  const books = [];
  const remaining = [];
  Object.entries(groups).forEach(([r, cards]) => {
    if (cards.length === 4) books.push(r);
    else remaining.push(...cards);
  });
  return { books, remaining };
}

export default function GoFish() {
  const { user, submitScore } = useAuth();
  const [state, setState] = useState(null);
  const [turn, setTurn] = useState("you");
  const [message, setMessage] = useState("Ask the CPU for a rank you already have.");
  const [winner, setWinner] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [xpInfo, setXpInfo] = useState({ xp: 0, done: false, badges: [] });

  const init = () => {
    const deck = buildDeck();
    let you = deck.slice(0, 7);
    let cpu = deck.slice(7, 14);
    let pool = deck.slice(14);
    const yb = findBooks(you); you = yb.remaining;
    const cb = findBooks(cpu); cpu = cb.remaining;
    setState({ you, cpu, pool, yourBooks: yb.books, cpuBooks: cb.books });
    setTurn("you"); setMessage("Ask the CPU for a rank you already have."); setWinner(null); setSubmitted(false); setShareOpen(false);
  };
  useEffect(() => { init(); }, []);

  const finalize = useCallback(async (finalState) => {
    const yourN = finalState.yourBooks.length, cpuN = finalState.cpuBooks.length;
    const won = yourN > cpuN;
    won ? sfx.win() : sfx.lose();
    toast[won ? "success" : "error"](`You: ${yourN} books · CPU: ${cpuN} books`);
    if (user && !submitted) {
      const res = await submitScore({ game_id: "gofish", won, score: yourN });
      if (res.ok) setXpInfo({ xp: res.xp_gained, done: res.challenge_completed, badges: res.newly_unlocked_badges });
      setSubmitted(true);
    }
    setShareOpen(true);
  }, [user, submitted, submitScore]);

  const checkEndAndFinalize = useCallback((next) => {
    if (next.you.length === 0 && next.cpu.length === 0 && next.pool.length === 0) {
      setWinner(next.yourBooks.length >= next.cpuBooks.length ? "you" : "cpu");
      finalize(next);
      return true;
    }
    return false;
  }, [finalize]);

  const uniqueRanks = useMemo(() => {
    if (!state) return [];
    const set = new Set(state.you.map((c) => c.rank));
    return Array.from(set).sort((a, b) => RANKS.indexOf(a) - RANKS.indexOf(b));
  }, [state]);

  const ask = (rank) => {
    if (turn !== "you" || !state || winner) return;
    sfx.click();
    const cpuMatches = state.cpu.filter((c) => c.rank === rank);
    let you = state.you.slice();
    let cpu = state.cpu.slice();
    let pool = state.pool.slice();
    let yourBooks = state.yourBooks.slice();
    let cpuBooks = state.cpuBooks.slice();
    let msg = "";
    if (cpuMatches.length > 0) {
      you = [...you, ...cpuMatches];
      cpu = cpu.filter((c) => c.rank !== rank);
      msg = `CPU had ${cpuMatches.length} ${rank}${cpuMatches.length > 1 ? "s" : ""}. You go again.`;
    } else {
      msg = `Go Fish! Drawing a card…`;
      if (pool.length > 0) {
        const drawn = pool.shift();
        you.push(drawn);
        if (drawn.rank === rank) {
          msg += ` Drew the ${rank} — you go again!`;
        } else {
          setTurn("cpu");
        }
      } else {
        setTurn("cpu");
      }
    }
    // check books
    const yb = findBooks(you);
    if (yb.books.length) {
      yourBooks.push(...yb.books);
      you = yb.remaining;
      msg += ` Booked ${yb.books.join(", ")}!`;
      sfx.match();
    }
    const next = { you, cpu, pool, yourBooks, cpuBooks };
    setState(next);
    setMessage(msg);
    if (checkEndAndFinalize(next)) return;
    if (you.length === 0 && pool.length > 0) {
      // draw one to keep going
      const d = pool.shift();
      you.push(d);
      setState({ ...next, you, pool });
    }
  };

  // CPU turn
  useEffect(() => {
    if (turn !== "cpu" || !state || winner) return;
    const t = setTimeout(() => {
      let you = state.you.slice();
      let cpu = state.cpu.slice();
      let pool = state.pool.slice();
      let yourBooks = state.yourBooks.slice();
      let cpuBooks = state.cpuBooks.slice();
      if (cpu.length === 0) {
        if (pool.length === 0) {
          const next = { you, cpu, pool, yourBooks, cpuBooks };
          setState(next);
          if (checkEndAndFinalize(next)) return;
          setTurn("you");
          return;
        }
        cpu.push(pool.shift());
      }
      const cpuRanks = Array.from(new Set(cpu.map((c) => c.rank)));
      const rank = cpuRanks[Math.floor(Math.random() * cpuRanks.length)];
      const matches = you.filter((c) => c.rank === rank);
      let msg = "";
      if (matches.length > 0) {
        cpu = [...cpu, ...matches];
        you = you.filter((c) => c.rank !== rank);
        msg = `CPU asked for ${rank} — you handed over ${matches.length}. CPU goes again.`;
      } else {
        msg = `CPU asked for ${rank} — Go Fish!`;
        if (pool.length > 0) {
          const drawn = pool.shift();
          cpu.push(drawn);
          if (drawn.rank === rank) {
            msg += " CPU drew the match!";
          } else {
            setTurn("you");
          }
        } else {
          setTurn("you");
        }
      }
      const cb = findBooks(cpu);
      if (cb.books.length) {
        cpuBooks.push(...cb.books);
        cpu = cb.remaining;
        msg += ` CPU booked ${cb.books.join(", ")}.`;
      }
      const next = { you, cpu, pool, yourBooks, cpuBooks };
      setState(next);
      setMessage(msg);
      if (checkEndAndFinalize(next)) return;
    }, 900);
    return () => clearTimeout(t);
  }, [turn, state, winner, checkEndAndFinalize]);

  if (!state) return null;

  return (
    <GameShell
      title="Go Fish"
      subtitle="Ask for a rank, collect the whole set. Most books wins."
      color="#00F0FF"
      onReset={init}
      extraActions={
        <span className="chip !border-neon-cyan/50 !text-neon-cyan" data-testid="gofish-books">
          You: {state.yourBooks.length} · CPU: {state.cpuBooks.length}
        </span>
      }
    >
      {/* CPU hand backs + books */}
      <div className="flex flex-wrap items-center justify-center gap-2" data-testid="gofish-cpu-hand">
        <span className="font-pixel text-xs text-[#a3a1c6]">CPU ({state.cpu.length}):</span>
        {state.cpu.map((_, i) => (
          <div key={i} className="h-10 w-7 rounded border border-white/20 bg-[#8a0e48]" />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-2 text-xs">
        {state.cpuBooks.map((r, i) => (
          <span key={i} className="rounded-full border border-neon-pink/40 bg-neon-pink/10 px-2 py-0.5 font-pixel text-neon-pink">
            📚 {r}
          </span>
        ))}
      </div>

      <div className="my-6 rounded-2xl border border-white/10 bg-black/40 p-3 text-center">
        <p className="font-pixel text-[10px] uppercase tracking-widest text-neon-yellow">// POOL</p>
        <p className="mt-1 font-display text-2xl font-black text-white" data-testid="gofish-pool">{state.pool.length} cards</p>
      </div>

      <p className="mb-4 text-center text-sm text-[#c9c8e2]" data-testid="gofish-message">{message}</p>

      {/* Ask panel */}
      {turn === "you" && !winner && (
        <div className="mb-4">
          <p className="mb-2 text-center font-pixel text-[10px] uppercase tracking-widest text-[#a3a1c6]">Ask CPU for…</p>
          <div className="flex flex-wrap justify-center gap-2">
            {uniqueRanks.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => ask(r)}
                data-testid={`gofish-ask-${r}`}
                className="rounded-lg border-2 border-neon-cyan/60 bg-white px-3 py-2 font-display text-lg font-black text-black hover:-translate-y-1"
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="mb-2 text-center font-pixel text-xs uppercase tracking-widest text-neon-cyan">
        Your hand ({state.you.length})
      </p>
      <div className="flex flex-wrap justify-center gap-1.5" data-testid="gofish-you-hand">
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

      <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
        {state.yourBooks.map((r, i) => (
          <span key={i} className="rounded-full border border-neon-cyan/40 bg-neon-cyan/10 px-2 py-0.5 font-pixel text-neon-cyan">
            📚 {r}
          </span>
        ))}
      </div>

      <ShareCard
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        game={GAME_MAP.gofish}
        won={winner === "you"}
        statLabel="Books"
        statValue={state.yourBooks.length}
        xpGained={xpInfo.xp}
        challengeCompleted={xpInfo.done}
        newlyUnlockedBadges={xpInfo.badges}
      />
    </GameShell>
  );
}
