import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

// Auto-playing hero reel showing mini gameplay snippets from each classic.
// Each frame is a pure-CSS mini-visualisation, no real gameplay engine required.

const FRAMES = [
  { id: "memory", label: "Memory Match", tag: "FLIP · MATCH · WIN", color: "#FF479A" },
  { id: "connect4", label: "Connect Four", tag: "4 IN A ROW", color: "#00F0FF" },
  { id: "chess", label: "Chess", tag: "STRATEGY, RE-BORN", color: "#FFFFFF" },
  { id: "snakes", label: "Snakes & Ladders", tag: "ROLL TO 100", color: "#39FF14" },
];

const FRAME_MS = 3400;

export default function HeroReel() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % FRAMES.length), FRAME_MS);
    return () => clearInterval(t);
  }, []);
  const f = FRAMES[i];
  return (
    <div className="relative mx-auto aspect-[3/4] max-w-sm rounded-3xl border-2 border-white/15 bg-gradient-to-b from-[#221e42] to-[#0b0a1a] p-4">
      <div className="h-full w-full overflow-hidden rounded-2xl border-2 border-black/40 bg-[#0b0a1a] p-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-pixel text-[10px]" style={{ color: f.color }}>NOW PLAYING</span>
          <span className="flex gap-1">
            {FRAMES.map((_, idx) => (
              <span
                key={idx}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: idx === i ? 18 : 6,
                  backgroundColor: idx === i ? f.color : "rgba(255,255,255,0.2)",
                }}
              />
            ))}
          </span>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={f.id}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.02, y: -8 }}
            transition={{ duration: 0.5 }}
            className="relative h-[240px] w-full overflow-hidden rounded-lg"
          >
            {f.id === "memory" && <MemoryFrame />}
            {f.id === "connect4" && <ConnectFrame />}
            {f.id === "chess" && <ChessFrame />}
            {f.id === "snakes" && <DiceFrame />}
          </motion.div>
        </AnimatePresence>
        <div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-3 text-center">
          <div className="font-pixel text-[10px]" style={{ color: f.color }}>{f.tag}</div>
          <div className="font-display text-xl font-black text-white">{f.label}</div>
        </div>
      </div>
      <div className="mt-4 flex justify-center gap-3">
        <span className="h-3 w-16 rounded-full bg-[#ff479a]" />
        <span className="h-3 w-16 rounded-full bg-[#00f0ff]" />
      </div>
    </div>
  );
}

function MemoryFrame() {
  const symbols = ["★","◆","▲","●","★","◆","▲","●"];
  return (
    <div className="grid h-full grid-cols-4 gap-1.5">
      {symbols.map((s, i) => {
        const delay = 0.1 + (i % 4) * 0.05;
        return (
          <motion.div
            key={i}
            initial={{ rotateY: 180, backgroundColor: "#221e42" }}
            animate={{ rotateY: 0, backgroundColor: "#ff479a" }}
            transition={{ delay, duration: 0.5 }}
            className="grid place-items-center rounded font-display text-lg font-black text-[#0b0a1a]"
          >
            {s}
          </motion.div>
        );
      })}
    </div>
  );
}

function ConnectFrame() {
  // 6x7 board with an animated 4-in-a-row diagonal
  const disks = [
    // preset: [row,col,player] — animate drop for player 1 diagonal win
    [5,0,2],[5,1,1],[5,2,2],[5,3,1],[5,4,2],[5,5,1],
    [4,1,1],[4,3,2],[4,5,2],[3,3,1],[2,5,1],
  ];
  const winCells = [[5,3],[4,4],[3,5],[2,6]]; // fake winning diagonal (we'll place them animated)
  return (
    <div className="grid h-full grid-cols-7 gap-1 rounded bg-[#221e42] p-1.5">
      {Array.from({ length: 42 }).map((_, i) => {
        const r = Math.floor(i / 7), c = i % 7;
        const d = disks.find((x) => x[0] === r && x[1] === c);
        const win = winCells.find((x) => x[0] === r && x[1] === c);
        return (
          <div
            key={i}
            className="relative aspect-square rounded-full bg-black/40"
            style={{ boxShadow: win ? "0 0 6px #FFD100 inset" : "none" }}
          >
            {d && (
              <motion.div
                initial={{ y: -60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.08 * i, duration: 0.35 }}
                className="h-full w-full rounded-full"
                style={{ backgroundColor: d[2] === 1 ? "#00F0FF" : "#FF479A" }}
              />
            )}
            {win && !d && (
              <motion.div
                initial={{ y: -60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 1.2 + 0.1 * i, duration: 0.35 }}
                className="h-full w-full rounded-full"
                style={{ backgroundColor: "#00F0FF", boxShadow: "0 0 8px #FFD100" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChessFrame() {
  return (
    <div className="grid h-full grid-cols-8 grid-rows-8 gap-0 overflow-hidden rounded">
      {Array.from({ length: 64 }).map((_, i) => {
        const r = Math.floor(i / 8), c = i % 8;
        const dark = (r + c) % 2 === 1;
        // Show a knight move animation from b1 (r7,c1) to c3 (r5,c2)
        const startPos = r === 7 && c === 1;
        const endPos = r === 5 && c === 2;
        return (
          <div
            key={i}
            className="relative grid place-items-center text-xs"
            style={{ backgroundColor: dark ? "#3d2b56" : "#c9c1e4" }}
          >
            {startPos && (
              <motion.span
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ delay: 0.8, duration: 0.3 }}
                className="text-white drop-shadow"
              >
                ♞
              </motion.span>
            )}
            {endPos && (
              <motion.span
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.0, duration: 0.4 }}
                className="text-white drop-shadow"
              >
                ♞
              </motion.span>
            )}
            {/* Sprinkle a few other pieces for context */}
            {r === 0 && c === 4 && <span className="text-[#0b0a1a]">♚</span>}
            {r === 7 && c === 4 && <span className="text-white">♔</span>}
            {r === 6 && c === 3 && <span className="text-white">♙</span>}
            {r === 1 && c === 4 && <span className="text-[#0b0a1a]">♟</span>}
          </div>
        );
      })}
    </div>
  );
}

function DiceFrame() {
  return (
    <div className="grid h-full grid-cols-10 gap-0.5 rounded bg-black/40 p-1">
      {Array.from({ length: 100 }).map((_, i) => {
        const num = i + 1;
        const isLadder = [8, 20, 51].includes(num);
        const isSnake = [17, 54, 62].includes(num);
        return (
          <div
            key={i}
            className="relative aspect-square"
            style={{
              backgroundColor: isLadder ? "rgba(57,255,20,0.2)" : isSnake ? "rgba(255,71,154,0.2)" : "rgba(255,255,255,0.04)",
            }}
          />
        );
      })}
      {/* Animated pawn traveling */}
      <motion.div
        className="pointer-events-none absolute h-3 w-3 rounded-full"
        style={{ backgroundColor: "#00F0FF", boxShadow: "0 0 8px #00F0FF", left: 8, top: 8 }}
        animate={{
          left: [8, 40, 72, 110, 60, 30, 90],
          top: [8, 20, 40, 60, 80, 100, 120],
        }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
