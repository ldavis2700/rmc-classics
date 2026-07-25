import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "@/lib/api";
import { sfx } from "@/lib/sound";
import { useAuth } from "@/context/AuthContext";

const POLL_MS = 3000; // fallback if WS is down

function wsUrlFor(roomId) {
  const httpBase = process.env.REACT_APP_BACKEND_URL || "";
  let base = httpBase.replace(/^http/, "ws"); // http->ws, https->wss
  if (!base) {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    base = `${proto}://${window.location.host}`;
  }
  const token = localStorage.getItem("rmc_token") || "";
  return `${base}/api/ws/battle/${roomId}?token=${encodeURIComponent(token)}`;
}

export default function BattlePlay() {
  const { roomId } = useParams();
  const { user } = useAuth();
  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [joined, setJoined] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const wsRef = useRef(null);
  const pollRef = useRef(null);

  const isHost = room && user && room.host_id === user.id;
  const isGuest = room && user && room.guest_id === user.id;
  const myTurn = room && ((isHost && room.turn === "host") || (isGuest && room.turn === "guest"));

  const fetchRoom = useCallback(async () => {
    try {
      const { data } = await api.get(`/battle/${roomId}`);
      setRoom(data);
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail) || "Battle not found");
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [roomId]);

  // Initial join
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await api.post(`/battle/${roomId}/join`);
        setRoom(data);
        setJoined(true);
      } catch (e) {
        setError(formatApiErrorDetail(e.response?.data?.detail) || "Cannot join battle");
      }
    })();
  }, [roomId, user]);

  // WebSocket connection
  useEffect(() => {
    if (!joined) return;
    let cancelled = false;
    const openWs = () => {
      try {
        const ws = new WebSocket(wsUrlFor(roomId));
        wsRef.current = ws;
        ws.onopen = () => {
          if (cancelled) { ws.close(); return; }
          setWsOpen(true);
        };
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === "state" && msg.room) setRoom(msg.room);
            else if (msg.type === "error") toast.error(msg.detail || "Error");
          } catch (e) { /* ignore */ }
        };
        ws.onclose = () => {
          setWsOpen(false);
          if (cancelled) return;
          // start polling fallback
          if (!pollRef.current) {
            pollRef.current = setInterval(() => {
              if (document.visibilityState === "visible") fetchRoom();
            }, POLL_MS);
          }
          // Try to reconnect once after delay
          setTimeout(() => { if (!cancelled) openWs(); }, 2500);
        };
        ws.onerror = () => { /* handled by close */ };
      } catch (e) {
        // fallback to polling
        pollRef.current = setInterval(fetchRoom, POLL_MS);
      }
    };
    openWs();
    return () => {
      cancelled = true;
      if (wsRef.current) wsRef.current.close();
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [joined, roomId, fetchRoom]);

  // Sound on win
  const prevStatus = useRef(null);
  useEffect(() => {
    if (!room) return;
    if (prevStatus.current !== "ended" && room.status === "ended") {
      const won = (isHost && room.winner === "host") || (isGuest && room.winner === "guest");
      won ? sfx.win() : sfx.lose();
    }
    prevStatus.current = room.status;
  }, [room, isHost, isGuest]);

  const drop = async (col) => {
    if (!room || room.status !== "playing" || !myTurn) return;
    sfx.drop();
    // Prefer WS
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "move", col }));
      return;
    }
    try {
      const { data } = await api.post(`/battle/${roomId}/move`, { col });
      setRoom(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/battle/${roomId}` : "";

  const copyLink = async () => {
    sfx.click();
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast.success("Link copied. Send it to your friend!");
    } catch (e) {
      toast.error("Couldn't copy link");
    }
  };

  const shareLink = async () => {
    sfx.click();
    if (navigator.share) {
      try {
        await navigator.share({
          title: "RMC CLASSICS Battle",
          text: `Join my Connect Four battle on RMC CLASSICS: ${roomId}`,
          url: inviteUrl,
        });
      } catch (e) { /* cancelled */ }
    } else {
      copyLink();
    }
  };

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 pt-10 text-center">
        <p className="font-pixel text-neon-pink">// ERROR</p>
        <p className="mt-2 text-white">{error}</p>
        <Link to="/battles" className="btn-arcade mt-6 inline-block rounded-full px-6 py-2 text-xs">
          Back to battles
        </Link>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <div className="font-pixel text-neon-cyan">LOADING BATTLE…</div>
      </div>
    );
  }

  const winCell = (r, c) => room.win_cells?.some(([wr, wc]) => wr === r && wc === c);
  const winnerText = () => {
    if (!room.winner) return null;
    if (room.winner === "draw") return "Draw";
    const won = (isHost && room.winner === "host") || (isGuest && room.winner === "guest");
    return won ? "You won!" : `${room.winner === "host" ? room.host_name : room.guest_name} won`;
  };

  return (
    <section className="mx-auto max-w-4xl px-4 pt-8 md:px-8 md:pt-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/battles" data-testid="battle-back" className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5 text-white hover:border-white/20">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="font-pixel text-xs text-neon-pink">
              // FRIEND BATTLE · CONNECT FOUR · {wsOpen ? <span className="text-neon-green">LIVE</span> : <span className="text-neon-yellow">RECONNECTING…</span>}
            </p>
            <h1 className="font-display text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
              Room <span className="font-pixel text-neon-yellow" data-testid="battle-room-id">{room.id}</span>
            </h1>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={copyLink} data-testid="battle-copy-link" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white hover:border-white/20">
            <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy link"}
          </button>
          <button type="button" onClick={shareLink} data-testid="battle-share" className="btn-arcade rounded-full px-4 py-2 text-xs font-black">
            <Share2 className="mr-1.5 inline h-3.5 w-3.5" /> Share
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_240px]">
        <div className="rounded-3xl border border-white/10 bg-[#16152b] p-4 sm:p-6">
          <div className="mb-2 grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, c) => (
              <button
                key={c}
                type="button"
                onClick={() => drop(c)}
                disabled={room.status !== "playing" || !myTurn || (room.board[0]?.[c] ?? 0) !== 0}
                data-testid={`battle-drop-${c}`}
                className="rounded-lg border border-white/10 bg-white/5 py-2 font-pixel text-xs text-neon-yellow transition-colors hover:bg-white/10 disabled:opacity-30"
              >
                ▼
              </button>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2 rounded-2xl bg-[#221e42] p-2 sm:p-3" data-testid="battle-board">
            {room.board.map((row, r) =>
              row.map((v, c) => {
                const highlight = winCell(r, c);
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
                        style={{
                          backgroundColor: v === 1 ? "#FF479A" : "#00F0FF",
                          boxShadow: `inset 0 -4px 0 rgba(0,0,0,0.25), 0 0 14px ${v === 1 ? "#FF479A" : "#00F0FF"}66`,
                        }}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-3">
          <PlayerCard label="Host (Pink)" name={room.host_name} color="#FF479A" active={room.turn === "host" && room.status === "playing"} you={isHost} />
          <PlayerCard label="Guest (Cyan)" name={room.guest_name || "Waiting…"} color="#00F0FF" active={room.turn === "guest" && room.status === "playing"} you={isGuest} />
          <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-center" data-testid="battle-status">
            {room.status === "waiting" && (<p className="font-pixel text-xs text-neon-yellow">Waiting for opponent…</p>)}
            {room.status === "playing" && (<p className="font-pixel text-xs" style={{ color: myTurn ? "#39FF14" : "#a3a1c6" }}>{myTurn ? "// YOUR TURN" : "// OPPONENT'S TURN"}</p>)}
            {room.status === "ended" && (
              <div>
                <p className="font-pixel text-xs text-neon-yellow">// GAME OVER</p>
                <p className="mt-1 font-display text-lg font-black text-white">{winnerText()}</p>
              </div>
            )}
          </div>
          <p className="text-center text-[10px] uppercase tracking-widest text-[#6a6890]">Moves: {room.moves}</p>
        </div>
      </div>
    </section>
  );
}

function PlayerCard({ label, name, color, active, you }) {
  return (
    <div
      className="rounded-2xl border p-3 transition-colors"
      style={{
        borderColor: active ? color : "rgba(255,255,255,0.1)",
        boxShadow: active ? `0 0 20px ${color}55` : "none",
        backgroundColor: "rgba(255,255,255,0.03)",
      }}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-pixel uppercase tracking-widest" style={{ color }}>
          {label} {you && "· YOU"}
        </span>
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
      </div>
      <div className="mt-1 font-display text-lg font-bold uppercase tracking-tight text-white">{name}</div>
    </div>
  );
}
