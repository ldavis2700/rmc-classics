import { useEffect, useState } from "react";
import GameShell from "@/components/rmc/GameShell";
import ShareCard from "@/components/rmc/ShareCard";
import { sfx } from "@/lib/sound";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { GAME_MAP } from "@/lib/games";

const ROWS = 6;
const COLS = 7;

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function dropDisc(board, col, player) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === 0) {
      const nb = board.map((row) => row.slice());
      nb[r][col] = player;
      return { board: nb, row: r };
    }
  }
  return null;
}

function checkWin(board, player) {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== player) continue;
      for (const [dr, dc] of dirs) {
        let ok = true;
        const cells = [];
        for (let k = 0; k < 4; k++) {
          const nr = r + dr * k;
          const nc = c + dc * k;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== player) {
            ok = false;
            break;
          }
          cells.push([nr, nc]);
        }
        if (ok) return cells;
      }
    }
  }
  return null;
}

function isFull(board) {
  return board[0].every((v) => v !== 0);
}

function cpuMove(board) {
  // 1. try to win
  for (let c = 0; c < COLS; c++) {
    const drop = dropDisc(board, c, 2);
    if (drop && checkWin(drop.board, 2)) return c;
  }
  // 2. block player win
  for (let c = 0; c < COLS; c++) {
    const drop = dropDisc(board, c, 1);
    if (drop && checkWin(drop.board, 1)) return c;
  }
  // 3. prefer center-ish
  const order = [3, 2, 4, 1, 5, 0, 6];
  for (const c of order) {
    if (board[0][c] === 0) return c;
  }
  return 0;
}

export default function ConnectFour() {
  const { user, submitScore } = useAuth();
  const [board, setBoard] = useState(emptyBoard);
  const [turn, setTurn] = useState(1); // 1 you, 2 cpu
  const [winCells, setWinCells] = useState(null);
  const [winner, setWinner] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [xpInfo, setXpInfo] = useState({ xp: 0, done: false });

  useEffect(() => {
    if (winner && !submitted) {
      const won = winner === 1;
      won ? sfx.win() : sfx.lose();
      toast[won ? "success" : "error"](won ? "Four in a row!" : "CPU got four.");
      setSubmitted(true);
      if (user) {
        submitScore({ game_id: "connect4", won, score: won ? 1 : 0 }).then((res) => {
          if (res.ok) setXpInfo({ xp: res.xp_gained, done: res.challenge_completed, badges: res.newly_unlocked_badges });
          setShareOpen(true);
        });
      } else {
        setShareOpen(true);
      }
    }
  }, [winner, submitted, user, submitScore]);

  useEffect(() => {
    if (turn === 2 && !winner) {
      const t = setTimeout(() => {
        const col = cpuMove(board);
        const drop = dropDisc(board, col, 2);
        if (!drop) return;
        sfx.drop();
        setBoard(drop.board);
        const win = checkWin(drop.board, 2);
        if (win) {
          setWinCells(win);
          setWinner(2);
        } else if (isFull(drop.board)) {
          setWinner(-1);
        } else {
          setTurn(1);
        }
      }, 500);
      return () => clearTimeout(t);
    }
  }, [turn, board, winner]);

  const play = (c) => {
    if (turn !== 1 || winner) return;
    const drop = dropDisc(board, c, 1);
    if (!drop) return;
    sfx.drop();
    setBoard(drop.board);
    const win = checkWin(drop.board, 1);
    if (win) {
      setWinCells(win);
      setWinner(1);
      return;
    }
    if (isFull(drop.board)) {
      setWinner(-1);
      return;
    }
    setTurn(2);
  };

  const reset = () => {
    setBoard(emptyBoard());
    setTurn(1);
    setWinCells(null);
    setWinner(0);
    setSubmitted(false);
    setShareOpen(false);
  };

  const cellHighlight = (r, c) => winCells?.some(([wr, wc]) => wr === r && wc === c);

  return (
    <GameShell
      title="Connect Four"
      subtitle="First to four in a row wins."
      color="#00F0FF"
      onReset={reset}
      extraActions={
        <span className="chip !border-neon-cyan/50 !text-neon-cyan" data-testid="c4-turn">
          {winner === 0 ? (turn === 1 ? "Your turn" : "CPU thinking…") : winner === 1 ? "You won" : winner === 2 ? "CPU won" : "Draw"}
        </span>
      }
    >
      <div className="mx-auto max-w-[560px]" data-testid="c4-board">
        <div className="mb-2 grid grid-cols-7 gap-2">
          {Array.from({ length: COLS }).map((_, c) => (
            <button
              key={c}
              type="button"
              onClick={() => play(c)}
              disabled={turn !== 1 || !!winner || board[0][c] !== 0}
              data-testid={`c4-drop-${c}`}
              className="rounded-lg border border-white/10 bg-white/5 py-2 font-pixel text-xs text-neon-yellow transition-colors hover:bg-white/10 disabled:opacity-40"
            >
              ▼
            </button>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2 rounded-2xl bg-[#221e42] p-2 sm:p-3">
          {board.map((row, r) =>
            row.map((v, c) => {
              const highlight = cellHighlight(r, c);
              return (
                <div
                  key={`${r}-${c}`}
                  className="aspect-square rounded-full border border-black/30 bg-black/40"
                  style={{
                    boxShadow: highlight ? "0 0 18px #FFD100 inset, 0 0 22px #FFD100" : "inset 0 4px 0 rgba(0,0,0,0.3)",
                  }}
                >
                  {v !== 0 && (
                    <div
                      className="h-full w-full rounded-full"
                      data-testid={v === 1 ? "c4-cell-you" : "c4-cell-cpu"}
                      style={{
                        backgroundColor: v === 1 ? "#00F0FF" : "#FF479A",
                        boxShadow: `inset 0 -4px 0 rgba(0,0,0,0.25), 0 0 14px ${v === 1 ? "#00F0FF" : "#FF479A"}66`,
                      }}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
      <ShareCard
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        game={GAME_MAP.connect4}
        won={winner === 1}
        xpGained={xpInfo.xp}
        challengeCompleted={xpInfo.done}
        newlyUnlockedBadges={xpInfo.badges}
      />
    </GameShell>
  );
}
