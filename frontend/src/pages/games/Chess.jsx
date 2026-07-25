import { useEffect, useMemo, useState, useCallback } from "react";
import { Chess as ChessEngine } from "chess.js";
import GameShell from "@/components/rmc/GameShell";
import ShareCard from "@/components/rmc/ShareCard";
import { sfx } from "@/lib/sound";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { GAME_MAP } from "@/lib/games";

const PIECE_UNICODE = {
  wP: "♙", wN: "♘", wB: "♗", wR: "♖", wQ: "♕", wK: "♔",
  bP: "♟", bN: "♞", bB: "♝", bR: "♜", bQ: "♛", bK: "♚",
};
const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

function scoreMove(game, move) {
  let s = 0;
  if (move.captured) s += PIECE_VALUES[move.captured] * 10;
  if (move.promotion) s += 8;
  if (move.san.includes("#")) s += 500; // mate
  if (move.san.includes("+")) s += 3;
  // slight center preference
  const centerFiles = ["d", "e"];
  const centerRanks = ["4", "5"];
  if (centerFiles.includes(move.to[0]) && centerRanks.includes(move.to[1])) s += 1;
  s += Math.random() * 2;
  return s;
}

function pickCpuMove(game) {
  const moves = game.moves({ verbose: true });
  if (!moves.length) return null;
  const scored = moves.map((m) => ({ m, s: scoreMove(game, m) }));
  scored.sort((a, b) => b.s - a.s);
  return scored[0].m;
}

export default function Chess() {
  const { user, submitScore } = useAuth();
  const [game, setGame] = useState(() => new ChessEngine());
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState("Your turn (White).");
  const [finished, setFinished] = useState(null); // 'you' | 'cpu' | 'draw'
  const [submitted, setSubmitted] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [xpInfo, setXpInfo] = useState({ xp: 0, done: false });

  const legalFrom = useMemo(() => {
    if (!selected) return [];
    return game.moves({ square: selected, verbose: true });
  }, [selected, game]);

  const board = game.board();
  const submitGameScore = useCallback(async (won) => {
    if (!user) return;
    const res = await submitScore({ game_id: "chess", won, score: won ? 1 : 0 });
    if (res.ok) {
      setXpInfo({ xp: res.xp_gained, done: res.challenge_completed });
      setShareOpen(true);
    }
  }, [user, submitScore]);

  const checkEnd = useCallback(
    (g) => {
      if (g.isCheckmate()) {
        const youWon = g.turn() === "b"; // if black to move and mated, white (you) won
        setFinished(youWon ? "you" : "cpu");
        setStatus(youWon ? "Checkmate. You win!" : "Checkmate. CPU wins.");
        youWon ? sfx.win() : sfx.lose();
        if (!submitted) {
          submitGameScore(youWon);
          setSubmitted(true);
        } else if (!user) {
          setShareOpen(true);
        }
        return true;
      }
      if (g.isDraw() || g.isStalemate() || g.isThreefoldRepetition() || g.isInsufficientMaterial()) {
        setFinished("draw");
        setStatus("Draw.");
        if (!submitted) {
          submitGameScore(false);
          setSubmitted(true);
        }
        return true;
      }
      return false;
    },
    [submitGameScore, submitted, user]
  );

  useEffect(() => {
    if (game.turn() === "b" && !finished) {
      const t = setTimeout(() => {
        const move = pickCpuMove(game);
        if (!move) return;
        const g2 = new ChessEngine(game.fen());
        g2.move(move);
        sfx.drop();
        setGame(g2);
        if (!checkEnd(g2)) setStatus("Your turn.");
      }, 550);
      return () => clearTimeout(t);
    }
  }, [game, finished, checkEnd]);

  const onSquareClick = (sq) => {
    if (finished || game.turn() !== "w") return;
    const piece = game.get(sq);
    if (selected) {
      const move = legalFrom.find((m) => m.to === sq);
      if (move) {
        const g2 = new ChessEngine(game.fen());
        g2.move({ from: selected, to: sq, promotion: "q" });
        sfx.drop();
        setGame(g2);
        setSelected(null);
        if (!checkEnd(g2)) setStatus("CPU thinking…");
        return;
      }
    }
    if (piece && piece.color === "w") {
      setSelected(sq);
      sfx.click();
    } else {
      setSelected(null);
    }
  };

  const reset = () => {
    setGame(new ChessEngine());
    setSelected(null);
    setFinished(null);
    setStatus("Your turn (White).");
    setSubmitted(false);
  };

  return (
    <GameShell
      title="Chess"
      subtitle="You play White. Standard rules. Auto-promote to Queen."
      color="#FFFFFF"
      onReset={reset}
      extraActions={
        <span className="chip !border-white/40 !text-white" data-testid="chess-status">
          {status}
        </span>
      }
    >
      <div className="mx-auto max-w-[560px]">
        <div
          className="grid grid-cols-8 overflow-hidden rounded-2xl border-4 border-black/60 shadow-inner"
          data-testid="chess-board"
        >
          {board.map((row, r) =>
            row.map((cell, c) => {
              const file = FILES[c];
              const rank = 8 - r;
              const sq = `${file}${rank}`;
              const dark = (r + c) % 2 === 1;
              const isSel = selected === sq;
              const isTarget = legalFrom.some((m) => m.to === sq);
              const piece = cell ? `${cell.color === "w" ? "w" : "b"}${cell.type.toUpperCase()}` : null;
              return (
                <button
                  type="button"
                  key={sq}
                  onClick={() => onSquareClick(sq)}
                  data-testid={`chess-cell-${sq}`}
                  className="relative aspect-square text-3xl sm:text-4xl"
                  style={{
                    backgroundColor: dark ? "#3d2b56" : "#c9c1e4",
                    boxShadow: isSel ? "inset 0 0 0 3px #FFD100" : isTarget ? "inset 0 0 0 3px #39FF14" : "none",
                  }}
                >
                  {piece && (
                    <span
                      className="drop-shadow-md"
                      style={{ color: cell.color === "w" ? "#ffffff" : "#0b0a1a" }}
                    >
                      {PIECE_UNICODE[piece]}
                    </span>
                  )}
                  {isTarget && !piece && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="h-3 w-3 rounded-full bg-neon-green/70" />
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
      <ShareCard
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        game={GAME_MAP.chess}
        won={finished === "you"}
        xpGained={xpInfo.xp}
        challengeCompleted={xpInfo.done}
      />
    </GameShell>
  );
}
