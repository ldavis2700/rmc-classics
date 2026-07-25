import { useEffect, useState } from "react";
import GameShell from "@/components/rmc/GameShell";
import ShareCard from "@/components/rmc/ShareCard";
import { sfx } from "@/lib/sound";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { GAME_MAP } from "@/lib/games";

const LADDERS = { 3: 22, 8: 30, 20: 42, 27: 84, 51: 67, 71: 91, 80: 100 };
const SNAKES = { 17: 4, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 98: 79 };

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function applyBoard(pos, roll) {
  let target = pos + roll;
  let event = null;
  if (target > 100) return { pos, event: "overshoot" };
  if (LADDERS[target]) {
    event = { type: "ladder", from: target, to: LADDERS[target] };
    target = LADDERS[target];
  } else if (SNAKES[target]) {
    event = { type: "snake", from: target, to: SNAKES[target] };
    target = SNAKES[target];
  }
  return { pos: target, event };
}

export default function SnakesLadders() {
  const { user, submitScore } = useAuth();
  const [you, setYou] = useState(0);
  const [cpu, setCpu] = useState(0);
  const [turn, setTurn] = useState("you");
  const [dice, setDice] = useState(null);
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(null); // 'you' or 'cpu'
  const [submitted, setSubmitted] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [xpInfo, setXpInfo] = useState({ xp: 0, done: false });

  const appendLog = (msg) => setLog((l) => [msg, ...l].slice(0, 6));

  useEffect(() => {
    if (finished && !submitted) {
      const won = finished === "you";
      won ? sfx.win() : sfx.lose();
      toast[won ? "success" : "error"](won ? "You won!" : "CPU won");
      setSubmitted(true);
      if (user) {
        submitScore({ game_id: "snakes", won, score: won ? 1 : 0 }).then((res) => {
          if (res.ok) setXpInfo({ xp: res.xp_gained, done: res.challenge_completed, badges: res.newly_unlocked_badges });
          setShareOpen(true);
        });
      } else {
        setShareOpen(true);
      }
    }
  }, [finished, submitted, user, submitScore]);

  useEffect(() => {
    if (turn === "cpu" && !finished && !busy) {
      setBusy(true);
      setTimeout(() => {
        const r = rollDie();
        sfx.dice();
        setDice(r);
        const { pos, event } = applyBoard(cpu, r);
        if (event === "overshoot") {
          appendLog(`CPU rolled ${r} — overshoot, stays at ${cpu}`);
        } else {
          appendLog(`CPU rolled ${r} → ${pos}${event ? ` (${event.type})` : ""}`);
          setCpu(pos);
          if (pos === 100) {
            setFinished("cpu");
            setBusy(false);
            return;
          }
        }
        setTurn("you");
        setBusy(false);
      }, 700);
    }
  }, [turn, cpu, finished, busy]);

  const rollYou = () => {
    if (turn !== "you" || busy || finished) return;
    setBusy(true);
    const r = rollDie();
    sfx.dice();
    setDice(r);
    const { pos, event } = applyBoard(you, r);
    if (event === "overshoot") {
      appendLog(`You rolled ${r} — overshoot, stay at ${you}`);
      setTurn("cpu");
      setBusy(false);
      return;
    }
    appendLog(`You rolled ${r} → ${pos}${event ? ` (${event.type})` : ""}`);
    setYou(pos);
    if (pos === 100) {
      setFinished("you");
      setBusy(false);
      return;
    }
    setTurn("cpu");
    setBusy(false);
  };

  const reset = () => {
    setYou(0); setCpu(0); setTurn("you"); setDice(null); setLog([]); setFinished(null); setSubmitted(false); setShareOpen(false);
  };

  // Board rendering: 10x10 grid, zig-zag numbering
  const cells = [];
  for (let row = 9; row >= 0; row--) {
    const rowCells = [];
    for (let col = 0; col < 10; col++) {
      const num = row * 10 + (row % 2 === 0 ? col + 1 : 10 - col);
      rowCells.push(num);
    }
    cells.push(rowCells);
  }

  return (
    <GameShell
      title="Snakes & Ladders"
      subtitle="Roll to 100. Beware the snakes."
      color="#39FF14"
      onReset={reset}
      extraActions={
        <span className="chip !border-neon-green/50 !text-neon-green" data-testid="snakes-dice">
          Dice: {dice ?? "—"}
        </span>
      }
    >
      <div className="grid gap-4 md:grid-cols-[1fr_240px]">
        <div>
          <div className="grid grid-cols-10 gap-0.5 rounded-xl bg-black/40 p-1" data-testid="snakes-board">
            {cells.flat().map((num) => {
              const isYou = you === num;
              const isCpu = cpu === num;
              const isLadder = !!LADDERS[num];
              const isSnake = !!SNAKES[num];
              return (
                <div
                  key={num}
                  className="relative aspect-square rounded text-[9px] font-bold sm:text-xs"
                  style={{
                    backgroundColor: isLadder
                      ? "rgba(57,255,20,0.14)"
                      : isSnake
                      ? "rgba(255,71,154,0.14)"
                      : "rgba(255,255,255,0.03)",
                    color: "#a3a1c6",
                  }}
                >
                  <span className="absolute left-1 top-0.5 font-pixel">{num}</span>
                  {isLadder && (
                    <span className="absolute right-0.5 top-0.5 text-neon-green">↑</span>
                  )}
                  {isSnake && (
                    <span className="absolute right-0.5 top-0.5 text-neon-pink">↓</span>
                  )}
                  {(isYou || isCpu) && (
                    <div className="absolute inset-1 flex items-center justify-center gap-0.5">
                      {isYou && (
                        <span
                          className="h-3 w-3 rounded-full sm:h-4 sm:w-4"
                          style={{ backgroundColor: "#00F0FF", boxShadow: "0 0 8px #00F0FF" }}
                          data-testid="snakes-you-pawn"
                        />
                      )}
                      {isCpu && (
                        <span
                          className="h-3 w-3 rounded-full sm:h-4 sm:w-4"
                          style={{ backgroundColor: "#FF479A", boxShadow: "0 0 8px #FF479A" }}
                          data-testid="snakes-cpu-pawn"
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-widest text-[#a3a1c6]">
              <span>You</span>
              <span className="font-pixel text-neon-cyan">{you}/100</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs uppercase tracking-widest text-[#a3a1c6]">
              <span>CPU</span>
              <span className="font-pixel text-neon-pink">{cpu}/100</span>
            </div>
          </div>

          <button
            type="button"
            onClick={rollYou}
            disabled={turn !== "you" || !!finished || busy}
            data-testid="snakes-roll-btn"
            className="btn-arcade w-full rounded-2xl py-3 text-sm font-black disabled:opacity-50"
          >
            🎲 Roll dice
          </button>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <p className="mb-2 font-pixel text-[10px] text-neon-yellow">// LOG</p>
            <ul className="space-y-1 text-xs text-[#c9c8e2]" data-testid="snakes-log">
              {log.length === 0 && <li className="text-[#6a6890]">Roll to start.</li>}
              {log.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>

          {finished && (
            <div
              className="rounded-2xl border p-4 text-center"
              style={{
                borderColor: finished === "you" ? "rgba(57,255,20,0.5)" : "rgba(255,71,154,0.5)",
              }}
            >
              <p className="font-pixel text-neon-yellow">
                {finished === "you" ? "// YOU WIN" : "// CPU WINS"}
              </p>
            </div>
          )}
        </div>
      </div>
      <ShareCard
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        game={GAME_MAP.snakes}
        won={finished === "you"}
        xpGained={xpInfo.xp}
        challengeCompleted={xpInfo.done}
        newlyUnlockedBadges={xpInfo.badges}
      />
    </GameShell>
  );
}
