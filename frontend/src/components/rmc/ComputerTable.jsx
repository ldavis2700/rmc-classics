import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { newGame, applyAction, computerAction, playerView } from "@/lib/tableRules";
import TableBoard from "@/components/rmc/TableBoard";

export default function ComputerTable({ game }) {
  const [state, setState] = useState(() => newGame(game));
  const [saved, setSaved] = useState("");
  const submitted = useRef(false);
  const generation = useRef(0);
  const { user, submitScore } = useAuth();
  useEffect(() => {
    if (!["playing", "bidding"].includes(state.phase) || state.turn === 0) return undefined;
    const timer = setTimeout(() => setState((s) => s === state ? applyAction(s, s.turn, computerAction(s, s.turn)) : s), 650);
    return () => clearTimeout(timer);
  }, [state]);
  useEffect(() => {
    if (state.phase !== "ended" || submitted.current || !user) return;
    submitted.current = true;
    const started = generation.current;
    submitScore({ game_id: game, won: state.winner === 0, score: game === "spades" ? state.scores[0] : (state.winner === 0 ? 1 : 0) })
      .then((result) => { if (started === generation.current) setSaved(result.ok ? "Result saved to your profile." : "Result could not be saved."); })
      .catch(() => { if (started === generation.current) setSaved("Result could not be saved."); });
  }, [state, user, submitScore, game]);
  const reset = () => { generation.current += 1; submitted.current = false; setSaved(""); setState(newGame(game)); };
  const members = game === "spades" ? [{ name: "You" }, { name: "Computer West" }, { name: "Computer Partner" }, { name: "Computer East" }] : [{ name: "You" }, { name: "Computer" }];
  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <span className="chip">Playing against the computer</span>
      <Link to={`/tables?game=${game}`} className="btn-arcade btn-arcade-cyan rounded-xl px-4 py-3 text-sm font-bold">Play online</Link>
    </div>
    <TableBoard state={playerView(state, 0)} members={members} onAction={(a) => setState((s) => applyAction(s, 0, a))} />
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[#a3a1c6]">{saved || "Computer games work without an account or internet connection once loaded."}</p>
      <button type="button" onClick={reset} className="rounded-xl border border-white/20 px-4 py-3 text-sm text-white">{state.phase === "ended" ? "Play again" : "New computer game"}</button>
    </div>
  </>;
}
