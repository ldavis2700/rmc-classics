import { useEffect, useMemo, useState } from "react";
import GameShell from "@/components/rmc/GameShell";
import { sfx } from "@/lib/sound";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

// Cell: 0 empty, 1 you-man, 2 cpu-man, 3 you-king, 4 cpu-king
const SIZE = 8;

function initialBoard() {
  const b = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < SIZE; c++) {
      if ((r + c) % 2 === 1) b[r][c] = 2;
    }
  }
  for (let r = 5; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if ((r + c) % 2 === 1) b[r][c] = 1;
    }
  }
  return b;
}

const isYou = (v) => v === 1 || v === 3;
const isCpu = (v) => v === 2 || v === 4;
const isKing = (v) => v === 3 || v === 4;
const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

function directionsFor(v) {
  if (v === 1) return [[-1, -1], [-1, 1]]; // you moves up
  if (v === 2) return [[1, -1], [1, 1]]; // cpu moves down
  return [[-1, -1], [-1, 1], [1, -1], [1, 1]]; // king
}

function movesForPiece(board, r, c) {
  const v = board[r][c];
  if (!v) return [];
  const dirs = directionsFor(v);
  const captures = [];
  const simple = [];
  for (const [dr, dc] of dirs) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    if (board[nr][nc] === 0) {
      simple.push({ from: [r, c], to: [nr, nc], captured: null });
    } else {
      // possible capture
      const isEnemy = isYou(v) ? isCpu(board[nr][nc]) : isYou(board[nr][nc]);
      if (isEnemy) {
        const jr = nr + dr;
        const jc = nc + dc;
        if (inBounds(jr, jc) && board[jr][jc] === 0) {
          captures.push({ from: [r, c], to: [jr, jc], captured: [nr, nc] });
        }
      }
    }
  }
  return { simple, captures };
}

function allMoves(board, side) {
  const captures = [];
  const simple = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = board[r][c];
      if (side === "you" && !isYou(v)) continue;
      if (side === "cpu" && !isCpu(v)) continue;
      const m = movesForPiece(board, r, c);
      captures.push(...m.captures);
      simple.push(...m.simple);
    }
  }
  return captures.length ? captures : simple;
}

function applyMove(board, move) {
  const b = board.map((row) => row.slice());
  const [fr, fc] = move.from;
  const [tr, tc] = move.to;
  const v = b[fr][fc];
  b[fr][fc] = 0;
  let nv = v;
  // promote
  if (v === 1 && tr === 0) nv = 3;
  if (v === 2 && tr === SIZE - 1) nv = 4;
  b[tr][tc] = nv;
  if (move.captured) {
    const [cr, cc] = move.captured;
    b[cr][cc] = 0;
  }
  return b;
}

export default function Checkers() {
  const { user, submitScore } = useAuth();
  const [board, setBoard] = useState(initialBoard);
  const [selected, setSelected] = useState(null);
  const [turn, setTurn] = useState("you");
  const [winner, setWinner] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const legal = useMemo(() => (turn === "you" ? allMoves(board, "you") : []), [board, turn]);
  const highlightForSelected = useMemo(() => {
    if (!selected) return [];
    return legal.filter((m) => m.from[0] === selected[0] && m.from[1] === selected[1]);
  }, [legal, selected]);

  useEffect(() => {
    if (winner && !submitted) {
      const won = winner === "you";
      won ? sfx.win() : sfx.lose();
      toast[won ? "success" : "error"](won ? "You cleaned the board!" : "CPU cleaned the board.");
      if (user) {
        submitScore({ game_id: "checkers", won, score: won ? 1 : 0 }).then(() => setSubmitted(true));
      } else {
        setSubmitted(true);
      }
    }
  }, [winner, submitted, user, submitScore]);

  // CPU turn logic
  useEffect(() => {
    if (turn !== "cpu" || winner) return;
    const moves = allMoves(board, "cpu");
    if (moves.length === 0) {
      setWinner("you");
      return;
    }
    const t = setTimeout(() => {
      // prefer captures (already prioritised), random pick
      const move = moves[Math.floor(Math.random() * moves.length)];
      const newB = applyMove(board, move);
      sfx.drop();
      setBoard(newB);
      // multi-jump: keep jumping if possible from destination
      let cur = newB;
      let curMove = move;
      while (curMove.captured) {
        const pieceMoves = movesForPiece(cur, curMove.to[0], curMove.to[1]);
        if (!pieceMoves.captures || pieceMoves.captures.length === 0) break;
        const nxt = pieceMoves.captures[0];
        cur = applyMove(cur, nxt);
        curMove = nxt;
      }
      if (cur !== newB) {
        setBoard(cur);
      }
      // check if you have moves
      const youMoves = allMoves(cur, "you");
      if (youMoves.length === 0) {
        setWinner("cpu");
        return;
      }
      setTurn("you");
    }, 600);
    return () => clearTimeout(t);
  }, [turn, board, winner]);

  const onCell = (r, c) => {
    if (turn !== "you" || winner) return;
    const v = board[r][c];
    if (isYou(v)) {
      setSelected([r, c]);
      sfx.click();
      return;
    }
    if (!selected) return;
    const move = highlightForSelected.find((m) => m.to[0] === r && m.to[1] === c);
    if (!move) return;
    let newB = applyMove(board, move);
    sfx.drop();
    // multi-jump chain for player: keep same piece if further captures
    let cur = newB;
    let landing = move.to;
    let more = true;
    while (more && move.captured) {
      const pm = movesForPiece(cur, landing[0], landing[1]);
      if (!pm.captures || pm.captures.length === 0) break;
      const nxt = pm.captures[0];
      cur = applyMove(cur, nxt);
      landing = nxt.to;
      more = true;
    }
    setBoard(cur);
    setSelected(null);
    // check cpu still has pieces
    const cpuMoves = allMoves(cur, "cpu");
    if (cpuMoves.length === 0) {
      setWinner("you");
      return;
    }
    setTurn("cpu");
  };

  const reset = () => {
    setBoard(initialBoard());
    setSelected(null);
    setTurn("you");
    setWinner(null);
    setSubmitted(false);
  };

  const isTarget = (r, c) => highlightForSelected.some((m) => m.to[0] === r && m.to[1] === c);

  return (
    <GameShell
      title="Checkers"
      subtitle="Jump the CPU's pieces. Reach the last row to become a king."
      color="#FFD100"
      onReset={reset}
      extraActions={
        <span className="chip !border-neon-yellow/50 !text-neon-yellow" data-testid="checkers-turn">
          {winner ? (winner === "you" ? "You won" : "CPU won") : turn === "you" ? "Your turn" : "CPU…"}
        </span>
      }
    >
      <div className="mx-auto max-w-[520px]">
        <div
          className="grid gap-0.5 rounded-2xl bg-black/50 p-2"
          style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0,1fr))` }}
          data-testid="checkers-board"
        >
          {board.map((row, r) =>
            row.map((v, c) => {
              const dark = (r + c) % 2 === 1;
              const sel = selected && selected[0] === r && selected[1] === c;
              const target = isTarget(r, c);
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  onClick={() => onCell(r, c)}
                  data-testid={`checkers-cell-${r}-${c}`}
                  className="relative aspect-square"
                  style={{
                    backgroundColor: dark ? "#221e42" : "#3d2b56",
                    boxShadow: sel
                      ? "inset 0 0 0 3px #FFD100"
                      : target
                      ? "inset 0 0 0 3px #39FF14"
                      : "none",
                  }}
                >
                  {v !== 0 && (
                    <div className="absolute inset-1 flex items-center justify-center">
                      <div
                        className="h-full w-full rounded-full border-2"
                        style={{
                          backgroundColor: isYou(v) ? "#00F0FF" : "#FF479A",
                          borderColor: isYou(v) ? "#007a83" : "#c11264",
                          boxShadow: `0 3px 0 ${isYou(v) ? "#005a63" : "#8a0e48"}, 0 0 14px ${
                            isYou(v) ? "#00F0FF77" : "#FF479A77"
                          }`,
                        }}
                      >
                        {isKing(v) && (
                          <div className="grid h-full w-full place-items-center font-pixel text-[10px] text-white">
                            K
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </GameShell>
  );
}
