import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "@/lib/api";
import { publicAppBaseUrl } from "@/lib/routes";
import { share } from "@/lib/native";
import TableBoard, { TableRules } from "@/components/rmc/TableBoard";

function OnlineTable({ roomId }) {
  const [room, setRoom] = useState(null);
  const [error, setError] = useState("");
  const [fatal, setFatal] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [report, setReport] = useState(null);
  const [reason, setReason] = useState("");
  const lock = useRef(false);
  const navigate = useNavigate();
  const receive = useCallback((data) => {
    setRoom((old) => !old || data.version >= old.version ? data : old);
    setConnected(true); setError("");
  }, []);
  const refresh = useCallback(async () => {
    const { data } = await api.get(`/tables/${roomId}`, { timeout: 12000 });
    receive(data);
  }, [roomId, receive]);

  useEffect(() => {
    let cancelled = false;
    let timer;
    let joined = false;
    let inFlight = false;
    const controller = new AbortController();
    const poll = async () => {
      if (cancelled || inFlight) return;
      if (document.visibilityState !== "visible") { timer = setTimeout(poll, 2000); return; }
      inFlight = true;
      try {
        const config = { timeout: 12000, signal: controller.signal };
        const { data } = joined ? await api.get(`/tables/${roomId}`, config) : await api.post(`/tables/${roomId}/join`, {}, config);
        joined = true;
        if (!cancelled) receive(data);
        if (data.status === "ended") return;
      } catch (e) {
        if (cancelled) return;
        const status = e.response?.status;
        if ([400, 401, 403, 404, 409, 410].includes(status)) {
          setFatal(true); setError(formatApiErrorDetail(e.response?.data?.detail)); return;
        }
        setConnected(false); setError("Connection lost. Reconnecting to your table…");
      } finally { inFlight = false; }
      if (!cancelled) timer = setTimeout(poll, 2000);
    };
    const resume = () => { if (document.visibilityState === "visible") { clearTimeout(timer); poll(); } };
    poll();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); document.removeEventListener("visibilitychange", resume); window.removeEventListener("online", resume); };
  }, [roomId, receive]);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);

  const move = async (action) => {
    if (lock.current || !room || !connected) return;
    lock.current = true; setBusy(true);
    try { const { data } = await api.post(`/tables/${roomId}/move`, { ...action, version: room.version }, { timeout: 12000 }); receive(data); }
    catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
      // A lost response may still represent a committed move. Refresh, never resend.
      try { await refresh(); } catch { setConnected(false); }
    } finally { lock.current = false; setBusy(false); }
  };
  const leave = async () => {
    if (lock.current) return;
    if (room?.status === "playing" && !window.confirm("Leave this game? Your side will forfeit.")) return;
    lock.current = true; setBusy(true);
    try { await api.post(`/tables/${roomId}/leave`, {}, { timeout: 12000 }); navigate(`/tables?game=${room.game}`); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { lock.current = false; setBusy(false); }
  };
  const invite = async () => {
    const result = await share({ title: "RMC CLASSICS table", text: `Join my ${room.game === "spades" ? "Spades" : "Dominoes"} table. Code: ${roomId}`, url: `${publicAppBaseUrl()}/table/${roomId}` });
    if (result === false) toast.error("Could not share the invite. You can send the table code instead.");
  };
  const reportUser = async (event) => {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await api.post("/safety/report", { reported_user_id: report.id, reason: reason.trim(), context: "battle" }, { timeout: 12000 }); toast.success("Report received."); setReport(null); setReason(""); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { lock.current = false; setBusy(false); }
  };
  const blockUser = async (member) => {
    if (lock.current || !window.confirm(`Block ${member.name}? This table will close and you won’t be matched together again.`)) return;
    lock.current = true; setBusy(true);
    try { await api.post(`/safety/block/${member.id}`, {}, { timeout: 12000 }); toast.success("Player blocked."); navigate("/tables"); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { lock.current = false; setBusy(false); }
  };

  if (fatal) return <section className="mx-auto max-w-lg p-6"><p role="alert" className="text-neon-pink">{error}</p><Link className="mt-4 inline-block text-neon-cyan underline" to="/tables">Return to online tables</Link></section>;
  if (!room) return <section className="p-8 text-center text-white"><p role="status">{error || "Joining your table…"}</p><Link to="/tables" className="mt-4 inline-block text-neon-cyan underline">Back to tables</Link></section>;
  return <section className="mx-auto max-w-5xl px-4 py-8 md:py-12">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div>
      <Link to="/tables" className="text-sm text-neon-cyan">Online tables</Link>
      <h1 className="mt-2 font-display text-3xl font-black capitalize text-white">{room.game}</h1>
      <p className="mt-2 text-sm text-[#c9c8e2]">{room.visibility === "public" ? "Public" : "Private"} table · <strong className="font-mono text-neon-yellow">{roomId}</strong> · {connected ? "Connected" : "Reconnecting"}</p>
    </div><div className="flex gap-2">
      {room.status === "waiting" && <button type="button" onClick={invite} className="btn-arcade btn-arcade-cyan rounded-xl px-4 py-3 font-bold">Invite friends</button>}
      {room.status !== "ended" && <button type="button" onClick={leave} disabled={busy} className="rounded-xl border border-white/20 px-4 py-3 text-sm text-white">Leave table</button>}
    </div></div>
    {error && <p role="alert" className="mb-4 text-neon-yellow">{error}</p>}
    {room.deadline && room.status === "playing" && <p className="mb-3 text-center text-sm text-[#c9c8e2]">Turn timer: {Math.max(0, Math.ceil(room.deadline - clock / 1000))}s · A legal move is made automatically at timeout.</p>}
    <div className="rounded-3xl border border-white/10 bg-[#16152b] p-4 sm:p-6">
      {room.state ? <TableBoard state={room.state} seat={room.seat} members={room.members} onAction={move} busy={busy || !connected} /> : <>
        <h2 className="text-center text-xl font-bold text-white">Waiting for players · {room.members.filter(Boolean).length}/{room.capacity}</h2>
        <p className="mt-3 text-center text-sm text-[#c9c8e2]">{room.visibility === "public" ? "You’re in the worldwide queue. The game starts when all seats are filled. You can also invite friends." : "Send your table code or invitation to your friends. All players need an RMC CLASSICS account."}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">{room.members.map((m, i) => <div key={i} className="rounded-xl border border-white/10 p-4 text-white">Seat {i + 1}: {m?.name || "Waiting…"}{room.game === "spades" ? ` · Team ${i % 2 + 1}` : ""}</div>)}</div>
        <p className="mt-4 text-center text-xs text-[#a3a1c6]">Waiting tables expire after 15 minutes. You can return to this table after closing the app.</p><TableRules game={room.game} />
      </>}
    </div>
    {room.status === "ended" && <Link to={`/tables?game=${room.game}`} className="btn-arcade mt-5 inline-block rounded-xl px-6 py-3 font-bold">Play another online game</Link>}
    <details className="mt-5 rounded-xl border border-white/10 p-4 text-sm text-[#c9c8e2]"><summary className="cursor-pointer">Player safety · Report or block</summary>
      {room.members.filter((m, i) => m && i !== room.seat).map((m) => <div key={m.id} className="mt-3 flex flex-wrap items-center gap-3"><span>{m.name}</span>
        <button type="button" disabled={busy} aria-label={`Report ${m.name}`} className="text-neon-yellow underline" onClick={() => { setReport(m); setReason(""); }}>Report</button>
        <button type="button" disabled={busy} aria-label={`Block ${m.name}`} className="text-neon-pink underline" onClick={() => blockUser(m)}>Block</button></div>)}
      {report && <form className="mt-4" onSubmit={reportUser}><label htmlFor="table-report">Report {report.name}</label>
        <textarea id="table-report" required minLength={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-2 block w-full rounded-xl bg-black/40 p-3 text-white" placeholder="Describe the behavior" />
        <button type="submit" disabled={busy || reason.trim().length < 3} className="mt-3 rounded-lg border border-neon-yellow px-4 py-2 text-neon-yellow">Send report</button>
        <button type="button" onClick={() => setReport(null)} className="ml-4 text-white underline">Cancel</button></form>}
    </details>
  </section>;
}

export default function TablePlay() {
  const { roomId } = useParams();
  return <OnlineTable key={roomId} roomId={roomId.toUpperCase()} />;
}
