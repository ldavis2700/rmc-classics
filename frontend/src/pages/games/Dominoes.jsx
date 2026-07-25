import { useEffect, useState, useCallback } from "react";
import GameShell from "@/components/rmc/GameShell";
import ShareCard from "@/components/rmc/ShareCard";
import { sfx } from "@/lib/sound";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { GAME_MAP } from "@/lib/games";

function buildSet() {
  const set = [];
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      set.push({ a, b, id: `${a}-${b}` });
    }
  }
  return set.sort(() => Math.random() - 0.5);
}

// A domino "matches" if either end equals the given number.
function otherEnd(d, end) {
  return d.a === end ? d.b : d.a;
}

export default function Dominoes() {
  const { user, submitScore } = useAuth();
  const [pool, setPool] = useState([]);
  const [you, setYou] = useState([]);
  const [cpu, setCpu] = useState([]);
  const [chain, setChain] = useState([]); // array of {a,b} in order placed left->right
  const [leftEnd, setLeftEnd] = useState(null);
  const [rightEnd, setRightEnd] = useState(null);
  const [turn, setTurn] = useState("you");
  const [message, setMessage] = useState("Play a matching tile or draw from the pile.");
  const [winner, setWinner] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [xpInfo, setXpInfo] = useState({ xp: 0, done: false });
  const [selected, setSelected] = useState(null); // idx in your hand
  const [ready, setReady] = useState(false);

  const init = () => {
    const all = buildSet();
    const y = all.slice(0, 7);
    const c = all.slice(7, 14);
    const rest = all.slice(14);
    // Pick starter: highest double, or highest tile
    let starter = null;
    let starterSide = "you";
    let starterIdx = null;
    for (let d = 6; d >= 0; d--) {
      const yi = y.findIndex((t) => t.a === d && t.b === d);
      if (yi !== -1) { starter = y[yi]; starterSide = "you"; starterIdx = yi; break; }
      const ci = c.findIndex((t) => t.a === d && t.b === d);
      if (ci !== -1) { starter = c[ci]; starterSide = "cpu"; starterIdx = ci; break; }
    }
    if (!starter) {
      // no doubles, pick highest in you
      const yi = 0;
      starter = y[yi];
      starterSide = "you";
      starterIdx = 0;
    }
    const yh = y.slice();
    const ch = c.slice();
    if (starterSide === "you") yh.splice(starterIdx, 1);
    else ch.splice(starterIdx, 1);
    setPool(rest);
    setYou(yh);
    setCpu(ch);
    setChain([starter]);
    setLeftEnd(starter.a);
    setRightEnd(starter.b);
    setTurn(starterSide === "you" ? "cpu" : "you");
    setMessage(
      starterSide === "you"
        ? `You opened with ${starter.a}|${starter.b}. CPU's turn.`
        : `CPU opened with ${starter.a}|${starter.b}. Your turn.`
    );
    setWinner(null);
    setSubmitted(false);
    setShareOpen(false);
    setSelected(null);
    setReady(true);
  };

  useEffect(() => { init(); }, []);

  const finalize = useCallback(async (won) => {
    won ? sfx.win() : sfx.lose();
    toast[won ? "success" : "error"](won ? "Empty hand — you win!" : "CPU emptied first.");
    if (user && !submitted) {
      const res = await submitScore({ game_id: "dominoes", won, score: won ? 1 : 0 });
      if (res.ok) setXpInfo({ xp: res.xp_gained, done: res.challenge_completed, badges: res.newly_unlocked_badges });
      setSubmitted(true);
    }
    setShareOpen(true);
  }, [user, submitted, submitScore]);

  useEffect(() => {
    if (winner) finalize(winner === "you");
  }, [winner, finalize]);

  const canPlay = (tile, side) => {
    const target = side === "left" ? leftEnd : rightEnd;
    return tile.a === target || tile.b === target;
  };
  const canPlayAny = (hand) => hand.some((t) => t.a === leftEnd || t.b === leftEnd || t.a === rightEnd || t.b === rightEnd);

  const placeTile = (tile, side, from) => {
    // Orient tile so matching pip is on the connecting side
    let a = tile.a, b = tile.b;
    if (side === "left") {
      // needs to end with the matching pip on the right side of this tile (b matches leftEnd)
      if (b !== leftEnd) { a = tile.b; b = tile.a; }
    } else {
      // right side: a matches rightEnd
      if (a !== rightEnd) { a = tile.b; b = tile.a; }
    }
    const oriented = { a, b, id: tile.id };
    if (side === "left") {
      setChain((c) => [oriented, ...c]);
      setLeftEnd(a);
    } else {
      setChain((c) => [...c, oriented]);
      setRightEnd(b);
    }
    sfx.card();
    if (from === "you") {
      const rest = you.filter((t) => t.id !== tile.id);
      setYou(rest);
      if (rest.length === 0) { setWinner("you"); return; }
      setMessage("CPU's turn.");
      setTurn("cpu");
    } else {
      const rest = cpu.filter((t) => t.id !== tile.id);
      setCpu(rest);
      if (rest.length === 0) { setWinner("cpu"); return; }
      setMessage(`CPU played ${tile.a}|${tile.b}. Your turn.`);
      setTurn("you");
    }
  };

  const drawForYou = () => {
    if (turn !== "you" || winner) return;
    if (canPlayAny(you)) { setMessage("You have a playable tile — play it."); return; }
    if (pool.length === 0) {
      setMessage("Pool empty. Turn passes.");
      setTurn("cpu");
      return;
    }
    const pl = pool.slice();
    const drawn = pl.shift();
    sfx.flip();
    setPool(pl);
    setYou((y) => [...y, drawn]);
    setMessage(`Drew ${drawn.a}|${drawn.b}.`);
  };

  const playSelected = (side) => {
    if (turn !== "you" || winner || selected == null) return;
    const tile = you[selected];
    if (!tile || !canPlay(tile, side)) {
      setMessage("Tile doesn't match that end.");
      return;
    }
    setSelected(null);
    placeTile(tile, side, "you");
  };

  // CPU turn
  useEffect(() => {
    if (turn !== "cpu" || winner || !ready) return;
    const t = setTimeout(() => {
      // find best playable
      const options = [];
      cpu.forEach((tile) => {
        if (canPlay(tile, "left")) options.push({ tile, side: "left" });
        if (canPlay(tile, "right")) options.push({ tile, side: "right" });
      });
      if (options.length === 0) {
        if (pool.length === 0) {
          // both stuck? Count pips, lower wins
          if (!canPlayAny(you)) {
            const youPips = you.reduce((s, t) => s + t.a + t.b, 0);
            const cpuPips = cpu.reduce((s, t) => s + t.a + t.b, 0);
            setWinner(youPips <= cpuPips ? "you" : "cpu");
            return;
          }
          setMessage("CPU passed.");
          setTurn("you");
          return;
        }
        // CPU draws
        const pl = pool.slice();
        const drawn = pl.shift();
        setPool(pl);
        setCpu((c) => [...c, drawn]);
        setMessage("CPU drew a tile.");
        return; // stay on CPU turn to retry
      }
      // choose highest-value option
      options.sort((a, b) => (b.tile.a + b.tile.b) - (a.tile.a + a.tile.b));
      const pick = options[0];
      placeTile(pick.tile, pick.side, "cpu");
    }, 800);
    return () => clearTimeout(t);
  }, [turn, cpu, pool, leftEnd, rightEnd, winner, you, ready]);

  return (
    <GameShell
      title="Dominoes"
      subtitle="Match either end. Empty your hand first to win."
      color="#FFD100"
      onReset={init}
      extraActions={
        <span className="chip !border-neon-yellow/50 !text-neon-yellow" data-testid="dominoes-turn">
          {winner ? (winner === "you" ? "You won" : "CPU won") : turn === "you" ? "Your turn" : "CPU"}
        </span>
      }
    >
      {/* CPU hand backs */}
      <div className="flex justify-center gap-1" data-testid="dominoes-cpu-hand">
        {cpu.map((t) => (
          <div
            key={t.id}
            className="h-8 w-16 rounded-md border-2 border-black/40"
            style={{
              background: "repeating-linear-gradient(45deg, #FFD100, #FFD100 4px, #8B7A3A 4px, #8B7A3A 8px)",
            }}
          />
        ))}
      </div>

      {/* Chain */}
      <div className="my-6 rounded-2xl border border-white/10 bg-black/40 p-3">
        <p className="mb-2 text-center font-pixel text-[10px] uppercase tracking-widest text-[#a3a1c6]">
          Chain — Left end: {leftEnd} · Right end: {rightEnd}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-1 overflow-x-auto py-2" data-testid="dominoes-chain">
          {chain.map((t, i) => (
            <DominoTile key={i} tile={t} placed />
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => playSelected("left")}
          disabled={turn !== "you" || selected == null || winner}
          data-testid="dominoes-play-left"
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-white hover:border-white/20 disabled:opacity-40"
        >
          ← Play left
        </button>
        <button
          type="button"
          onClick={() => playSelected("right")}
          disabled={turn !== "you" || selected == null || winner}
          data-testid="dominoes-play-right"
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-white hover:border-white/20 disabled:opacity-40"
        >
          Play right →
        </button>
        <button
          type="button"
          onClick={drawForYou}
          disabled={turn !== "you" || winner}
          data-testid="dominoes-draw"
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-neon-yellow hover:border-white/20 disabled:opacity-40"
        >
          Draw ({pool.length})
        </button>
      </div>

      <p className="mb-4 text-center text-sm text-[#c9c8e2]" data-testid="dominoes-message">{message}</p>

      <div className="flex flex-wrap justify-center gap-2" data-testid="dominoes-you-hand">
        {you.map((t, i) => (
          <DominoTile
            key={t.id}
            tile={t}
            onClick={() => { setSelected(i === selected ? null : i); sfx.click(); }}
            active={selected === i}
            testId={`dominoes-tile-${i}`}
          />
        ))}
      </div>

      <ShareCard
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        game={GAME_MAP.dominoes}
        won={winner === "you"}
        statLabel="Tiles left"
        statValue={you.length}
        xpGained={xpInfo.xp}
        challengeCompleted={xpInfo.done}
        newlyUnlockedBadges={xpInfo.badges}
      />
    </GameShell>
  );
}

function DominoTile({ tile, onClick, active, placed, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={placed}
      data-testid={testId}
      className="grid h-9 w-16 grid-cols-2 items-center justify-items-center rounded-md border-2 shadow-md transition-transform duration-150 disabled:cursor-default"
      style={{
        backgroundColor: "#F1E9C8",
        borderColor: active ? "#FF479A" : placed ? "#8B7A3A" : "#8B7A3A",
        color: "#1a1300",
        boxShadow: active ? "0 0 12px rgba(255,71,154,0.55)" : "inset 0 -3px 0 rgba(0,0,0,0.12)",
        transform: active ? "translateY(-4px)" : "none",
      }}
    >
      <span className="font-display text-sm font-black">{tile.a}</span>
      <span className="font-display text-sm font-black">{tile.b}</span>
    </button>
  );
}
