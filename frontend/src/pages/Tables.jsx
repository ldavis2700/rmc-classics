import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api, { formatApiErrorDetail } from "@/lib/api";

export default function Tables() {
  const [params] = useSearchParams();
  const [game, setGame] = useState(params.get("game") === "spades" ? "spades" : "dominoes");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(null);
  const lock = useRef(false);
  const navigate = useNavigate();
  useEffect(() => {
    const controller = new AbortController();
    api.get("/tables/current", { signal: controller.signal, timeout: 15000 })
      .then(({ data }) => setCurrent(data.room))
      .catch((e) => { if (!controller.signal.aborted) setError(formatApiErrorDetail(e.response?.data?.detail) || "Could not connect. Try again."); });
    return () => controller.abort();
  }, []);
  const enter = async (visibility, join = false) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const { data } = join ? await api.post(`/tables/${encodeURIComponent(code.trim())}/join`, {}, { timeout: 15000 }) :
        await api.post("/tables/match", { game, visibility }, { timeout: 15000 });
      navigate(`/table/${data.id}`);
    } catch (e) { setError(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { lock.current = false; setBusy(false); }
  };
  return <section className="mx-auto max-w-3xl px-4 py-8 md:py-12">
    <p className="font-pixel text-xs text-neon-cyan">// WORLD TABLES</p>
    <h1 className="mt-2 font-display text-3xl font-black text-white">Dominoes &amp; Spades online</h1>
    <p className="mt-3 text-sm text-[#c9c8e2]">Find players around the world or invite your friends. Dominoes needs two players; Spades needs four.</p>
    {error && <p role="alert" className="mt-4 rounded-xl border border-neon-pink/40 p-3 text-neon-pink">{error}</p>}
    {current && <Link className="mt-5 block rounded-xl border border-neon-yellow p-4 text-neon-yellow" to={`/table/${current.id}`}>Resume your {current.game === "spades" ? "Spades" : "Dominoes"} table · {current.id}</Link>}
    <fieldset className="mt-6"><legend className="mb-2 text-sm text-white">Choose a game</legend>
      <div className="flex gap-3">{["dominoes", "spades"].map((id) => <button type="button" key={id} disabled={busy} aria-pressed={game === id} onClick={() => setGame(id)}
        className={`rounded-xl border px-6 py-3 font-bold capitalize ${game === id ? "border-neon-cyan bg-neon-cyan/10 text-neon-cyan" : "border-white/20 text-white"}`}>{id}</button>)}</div>
    </fieldset>
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-[#16152b] p-5"><h2 className="text-xl font-bold text-white">Play worldwide</h2>
        <p className="mt-2 text-sm text-[#c9c8e2]">Join the next available public table. If no one is waiting, we’ll open one for you. Matches begin when all seats are filled.</p>
        <button type="button" onClick={() => enter("public")} disabled={busy} className="btn-arcade btn-arcade-cyan mt-5 w-full rounded-xl py-3 font-bold disabled:opacity-40">{busy ? "Connecting…" : "Find players"}</button>
      </div>
      <div className="rounded-2xl border border-white/10 bg-[#16152b] p-5"><h2 className="text-xl font-bold text-white">Play with friends</h2>
        <p className="mt-2 text-sm text-[#c9c8e2]">Create a private table and share its invitation or eight-character code. Private tables stay out of public matchmaking.</p>
        <button type="button" onClick={() => enter("private")} disabled={busy} className="btn-arcade mt-5 w-full rounded-xl py-3 font-bold disabled:opacity-40">Create private table</button>
      </div>
    </div>
    <form className="mt-6 rounded-2xl border border-white/10 p-5" onSubmit={(e) => { e.preventDefault(); enter("private", true); }}>
      <label className="block text-sm font-semibold text-white" htmlFor="table-code">Have a table code?</label>
      <div className="mt-3 flex flex-wrap gap-3"><input id="table-code" autoCapitalize="characters" autoComplete="off" maxLength={8} minLength={8} required value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="8-character code" className="min-w-0 flex-1 rounded-xl border border-white/20 bg-black/40 px-4 py-3 text-white" />
        <button type="submit" disabled={busy || code.length !== 8} className="rounded-xl border border-neon-cyan px-5 py-3 text-neon-cyan disabled:opacity-40">Join table</button></div>
    </form>
    <p className="mt-5 text-sm text-[#a3a1c6]">Prefer a quick game? <Link to={`/play/${game}`} className="text-neon-cyan underline">Play against the computer</Link>.</p>
    <p className="mt-3 text-sm text-[#a3a1c6]">Online turns allow 90 seconds. If a player times out, the computer makes one legal move for them. Leaving an active table forfeits the game for your side.</p>
  </section>;
}
