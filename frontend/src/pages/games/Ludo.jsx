import { useEffect, useState, useCallback } from "react";
import GameShell from "@/components/rmc/GameShell";
import ShareCard from "@/components/rmc/ShareCard";
import { sfx } from "@/lib/sound";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { GAME_MAP } from "@/lib/games";

// Simplified Ludo: 2 tokens per player on a 32-step track.
// Positions: -1 = home (unstarted), 0-31 = board, 32 = finished (goal).
// Must roll a 6 to leave home. Landing on opponent (on board 0-31 only) sends them home.

const TRACK_LEN = 32;
const YOU_START = 0;
const CPU_START = 16;
const YOU_SAFE = [0, 8, 16, 24];

function initTokens(count = 2) {
  return Array.from({ length: count }, () => ({ pos: -1 }));
}

function absPos(rel, side) {
  if (rel < 0 || rel >= TRACK_LEN) return null;
  return (rel + (side === "you" ? YOU_START : CPU_START)) % TRACK_LEN;
}

export default function Ludo() {
  const { user, submitScore } = useAuth();
  const [you, setYou] = useState(initTokens);
  const [cpu, setCpu] = useState(initTokens);
  const [turn, setTurn] = useState("you");
  const [dice, setDice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Roll the dice. A 6 lets a token out of home.");
  const [finished, setFinished] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [xpInfo, setXpInfo] = useState({ xp: 0, done: false });
  const [selectable, setSelectable] = useState([]); // indices for player to pick

  const finalize = useCallback(async (won) => {
    won ? sfx.win() : sfx.lose();
    if (user && !submitted) {
      const res = await submitScore({ game_id: "ludo", won, score: won ? 1 : 0 });
      if (res.ok) setXpInfo({ xp: res.xp_gained, done: res.challenge_completed });
      setSubmitted(true);
    }
    setShareOpen(true);
  }, [user, submitted, submitScore]);

  useEffect(() => {
    if (finished) finalize(finished === "you");
  }, [finished, finalize]);

  const rollAndPick = () => {
    if (turn !== "you" || busy || finished) return;
    const r = Math.floor(Math.random() * 6) + 1;
    sfx.dice();
    setDice(r);
    const options = [];
    you.forEach((t, i) => {
      if (t.pos === -1 && r === 6) options.push(i);
      else if (t.pos >= 0 && t.pos + r <= TRACK_LEN) options.push(i);
    });
    if (!options.length) {
      setMessage(`Rolled ${r}. No moves. CPU's turn.`);
      setTurn("cpu");
      return;
    }
    if (options.length === 1) {
      moveYou(options[0], r);
    } else {
      setSelectable(options);
      setMessage(`Rolled ${r}. Pick a token to move.`);
    }
  };

  const moveYou = (idx, r) => {
    setBusy(true);
    setSelectable([]);
    const nt = you.map((t, i) => {
      if (i !== idx) return t;
      if (t.pos === -1) return { pos: 0 };
      return { pos: t.pos + r };
    });
    sfx.drop();
    // check capture
    const moved = nt[idx];
    if (moved.pos >= 0 && moved.pos < TRACK_LEN) {
      const yourAbs = absPos(moved.pos, "you");
      const cpuNew = cpu.map((c) => {
        if (c.pos < 0 || c.pos >= TRACK_LEN) return c;
        if (absPos(c.pos, "cpu") === yourAbs) {
          toast.success("Captured a CPU token!");
          return { pos: -1 };
        }
        return c;
      });
      setCpu(cpuNew);
    }
    setYou(nt);
    const done = nt.every((t) => t.pos === TRACK_LEN);
    setBusy(false);
    if (done) {
      setFinished("you");
      return;
    }
    if (r === 6) {
      setMessage("Rolled 6 — bonus roll.");
      setTurn("you");
    } else {
      setMessage("CPU's turn.");
      setTurn("cpu");
    }
  };

  // CPU AI: try to capture, else advance farthest token, else release
  useEffect(() => {
    if (turn !== "cpu" || finished || busy) return;
    const t = setTimeout(() => {
      const r = Math.floor(Math.random() * 6) + 1;
      sfx.dice();
      setDice(r);
      const options = [];
      cpu.forEach((tok, i) => {
        if (tok.pos === -1 && r === 6) options.push({ i, kind: "release" });
        else if (tok.pos >= 0 && tok.pos + r <= TRACK_LEN) options.push({ i, kind: "move" });
      });
      if (!options.length) {
        setMessage(`CPU rolled ${r}. No moves.`);
        setTurn("you");
        return;
      }
      // capture preference
      let pick = null;
      for (const opt of options) {
        if (opt.kind === "release") continue;
        const newPos = cpu[opt.i].pos + r;
        if (newPos >= TRACK_LEN) continue;
        const abs = absPos(newPos, "cpu");
        if (you.some((y) => y.pos >= 0 && y.pos < TRACK_LEN && absPos(y.pos, "you") === abs)) {
          pick = opt;
          break;
        }
      }
      if (!pick) {
        // pick the one closest to goal
        const move = options.filter((o) => o.kind === "move").sort((a, b) => cpu[b.i].pos - cpu[a.i].pos)[0];
        pick = move || options[0];
      }
      const nt = cpu.map((tok, i) => {
        if (i !== pick.i) return tok;
        if (tok.pos === -1) return { pos: 0 };
        return { pos: tok.pos + r };
      });
      sfx.drop();
      const moved = nt[pick.i];
      if (moved.pos >= 0 && moved.pos < TRACK_LEN) {
        const cpuAbs = absPos(moved.pos, "cpu");
        const youNew = you.map((y) => {
          if (y.pos < 0 || y.pos >= TRACK_LEN) return y;
          if (absPos(y.pos, "you") === cpuAbs) return { pos: -1 };
          return y;
        });
        setYou(youNew);
      }
      setCpu(nt);
      const done = nt.every((t) => t.pos === TRACK_LEN);
      if (done) { setFinished("cpu"); return; }
      setMessage(`CPU rolled ${r}.`);
      if (r === 6) setTurn("cpu");
      else setTurn("you");
    }, 800);
    return () => clearTimeout(t);
  }, [turn, cpu, you, finished, busy]);

  const reset = () => {
    setYou(initTokens()); setCpu(initTokens()); setTurn("you"); setDice(null); setBusy(false);
    setMessage("Roll the dice. A 6 lets a token out of home.");
    setFinished(null); setSubmitted(false); setSelectable([]);
  };

  // Build track cells for visual (32 squares around perimeter)
  const cells = Array.from({ length: TRACK_LEN }, (_, i) => i);

  const tokenAt = (absIdx) => {
    const items = [];
    you.forEach((t, i) => {
      if (t.pos >= 0 && t.pos < TRACK_LEN && absPos(t.pos, "you") === absIdx) items.push({ side: "you", i });
    });
    cpu.forEach((t, i) => {
      if (t.pos >= 0 && t.pos < TRACK_LEN && absPos(t.pos, "cpu") === absIdx) items.push({ side: "cpu", i });
    });
    return items;
  };

  return (
    <GameShell
      title="Ludo"
      subtitle="Roll a 6 to leave home. Get both tokens all the way around to win."
      color="#00F0FF"
      onReset={reset}
      extraActions={
        <span className="chip !border-neon-cyan/50 !text-neon-cyan" data-testid="ludo-dice">
          Dice: {dice ?? "—"}
        </span>
      }
    >
      <div className="grid gap-6 md:grid-cols-[1fr_260px]">
        <div>
          <div className="relative mx-auto aspect-square max-w-[440px]">
            {/* Track around perimeter */}
            <div className="absolute inset-0 grid grid-cols-8 grid-rows-8 gap-0.5 rounded-2xl bg-black/40 p-1">
              {Array.from({ length: 64 }).map((_, i) => {
                const row = Math.floor(i / 8);
                const col = i % 8;
                const perim = row === 0 || row === 7 || col === 0 || col === 7;
                // Assign perimeter cells to track indices sequentially
                let trackIdx = null;
                if (perim) {
                  // clockwise from top-left
                  const order = [];
                  for (let c = 0; c < 8; c++) order.push([0, c]);
                  for (let r = 1; r < 8; r++) order.push([r, 7]);
                  for (let c = 6; c >= 0; c--) order.push([7, c]);
                  for (let r = 6; r >= 1; r--) order.push([r, 0]);
                  const idx = order.findIndex(([r, c]) => r === row && c === col);
                  if (idx !== -1) trackIdx = idx % TRACK_LEN;
                }
                const tokens = trackIdx != null ? tokenAt(trackIdx) : [];
                const isSafe = trackIdx != null && (trackIdx === YOU_START || trackIdx === CPU_START || YOU_SAFE.includes(trackIdx));
                return (
                  <div
                    key={i}
                    className="relative rounded-sm"
                    style={{
                      backgroundColor: perim
                        ? isSafe
                          ? "rgba(255,209,0,0.15)"
                          : "rgba(255,255,255,0.06)"
                        : "transparent",
                    }}
                  >
                    {trackIdx === YOU_START && <span className="absolute left-0.5 top-0 font-pixel text-[8px] text-neon-cyan">Y</span>}
                    {trackIdx === CPU_START && <span className="absolute left-0.5 top-0 font-pixel text-[8px] text-neon-pink">C</span>}
                    {tokens.length > 0 && (
                      <div className="absolute inset-0 flex items-center justify-center gap-0.5">
                        {tokens.map((t, j) => (
                          <span
                            key={j}
                            className="h-2.5 w-2.5 rounded-full sm:h-3 sm:w-3"
                            style={{
                              backgroundColor: t.side === "you" ? "#00F0FF" : "#FF479A",
                              boxShadow: `0 0 8px ${t.side === "you" ? "#00F0FF" : "#FF479A"}`,
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Center label */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-xl border border-white/10 bg-black/60 p-3 text-center">
                <div className="font-pixel text-[10px] text-neon-yellow">GOAL</div>
                <div className="font-display text-lg font-black text-white">
                  {you.filter((t) => t.pos === TRACK_LEN).length}/{you.length} vs {cpu.filter((t) => t.pos === TRACK_LEN).length}/{cpu.length}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <TokenPanel label="You" side="you" tokens={you} selectable={selectable} onSelect={(i) => moveYou(i, dice)} />
          <TokenPanel label="CPU" side="cpu" tokens={cpu} />

          <button
            type="button"
            onClick={rollAndPick}
            disabled={turn !== "you" || !!finished || busy || selectable.length > 0}
            data-testid="ludo-roll"
            className="btn-arcade w-full rounded-2xl py-3 text-sm font-black disabled:opacity-50"
          >
            🎲 Roll dice
          </button>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-xs text-[#c9c8e2]" data-testid="ludo-message">
            {message}
          </div>
        </div>
      </div>

      <ShareCard
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        game={GAME_MAP.ludo}
        won={finished === "you"}
        xpGained={xpInfo.xp}
        challengeCompleted={xpInfo.done}
      />
    </GameShell>
  );
}

function TokenPanel({ label, side, tokens, selectable = [], onSelect }) {
  const color = side === "you" ? "#00F0FF" : "#FF479A";
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-widest text-[#a3a1c6]">
        <span style={{ color }}>{label}</span>
        <span className="font-pixel">{tokens.filter((t) => t.pos === TRACK_LEN).length}/{tokens.length} home</span>
      </div>
      <div className="flex gap-2">
        {tokens.map((t, i) => {
          const canPick = selectable.includes(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => canPick && onSelect(i)}
              disabled={!canPick}
              data-testid={`ludo-${side}-token-${i}`}
              className="flex flex-1 items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-left disabled:cursor-default"
              style={{
                boxShadow: canPick ? `0 0 12px ${color}88` : "none",
                borderColor: canPick ? color : "rgba(255,255,255,0.1)",
              }}
            >
              <span
                className="h-4 w-4 flex-shrink-0 rounded-full"
                style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
              />
              <span className="font-pixel text-[10px] text-white">
                {t.pos === -1 ? "HOME" : t.pos === TRACK_LEN ? "GOAL" : `${t.pos}/${TRACK_LEN}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
