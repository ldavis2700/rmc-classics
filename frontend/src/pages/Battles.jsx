import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Swords, Copy, Users } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "@/lib/api";
import { sfx } from "@/lib/sound";
import { useAuth } from "@/context/AuthContext";

export default function Battles() {
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const navigate = useNavigate();

  const createBattle = async () => {
    if (creating) return;
    setCreating(true);
    sfx.click();
    try {
      const { data } = await api.post("/battle/create");
      toast.success(`Battle created: ${data.id}`);
      navigate(`/battle/${data.id}`);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  const joinBattle = async () => {
    const code = roomCode.trim().toUpperCase();
    if (!code || joining) return;
    setJoining(true);
    sfx.click();
    try {
      await api.post(`/battle/${code}/join`);
      navigate(`/battle/${code}`);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to join");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 md:px-8 md:pt-14">
      <p className="font-pixel text-xs text-neon-pink">// FRIEND BATTLES</p>
      <h1 className="mt-1 font-display text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
        Play with a friend
      </h1>
      <p className="mt-2 max-w-xl text-sm text-[#a3a1c6]">
        Real-time Connect Four 1v1. Create a battle, share the link, and go head-to-head.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-[#16152b] p-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-neon-pink/15 glow-pink">
              <Swords className="h-4 w-4 text-neon-pink" />
            </div>
            <div>
              <p className="font-pixel text-xs text-neon-pink">// HOST</p>
              <h3 className="font-display text-lg font-black uppercase tracking-tight text-white">
                Create battle
              </h3>
            </div>
          </div>
          <p className="mt-3 text-sm text-[#c9c8e2]">
            Get a shareable link to invite your friend. You play first (red discs).
          </p>
          <button
            type="button"
            onClick={createBattle}
            disabled={creating}
            data-testid="battle-create-btn"
            className="btn-arcade mt-5 w-full rounded-2xl py-3 text-sm font-black disabled:opacity-60"
          >
            {creating ? "Creating…" : "▶ Create battle"}
          </button>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#16152b] p-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-neon-cyan/15 glow-cyan">
              <Users className="h-4 w-4 text-neon-cyan" />
            </div>
            <div>
              <p className="font-pixel text-xs text-neon-cyan">// JOIN</p>
              <h3 className="font-display text-lg font-black uppercase tracking-tight text-white">
                Enter code
              </h3>
            </div>
          </div>
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            data-testid="battle-code-input"
            className="mt-4 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-center font-pixel text-xl tracking-widest text-white uppercase focus:border-neon-cyan focus:outline-none"
            maxLength={12}
          />
          <button
            type="button"
            onClick={joinBattle}
            disabled={!roomCode.trim() || joining}
            data-testid="battle-join-btn"
            className="btn-arcade btn-arcade-cyan mt-3 w-full rounded-2xl py-3 text-sm font-black disabled:opacity-60"
          >
            {joining ? "Joining…" : "▶ Join battle"}
          </button>
        </div>
      </div>

      <div className="mt-10 rounded-3xl border border-white/10 bg-[#16152b] p-6">
        <p className="font-pixel text-xs text-neon-yellow">// HOW IT WORKS</p>
        <ol className="mt-3 space-y-2 text-sm text-[#c9c8e2]">
          <li>1. Host creates a battle and copies the invite link.</li>
          <li>2. Friend opens the link (they must be logged in) to join.</li>
          <li>3. Take turns dropping discs. First to line up four wins.</li>
          <li>4. Both players get XP; the winner gets counted on the Connect Four leaderboard.</li>
        </ol>
      </div>
    </div>
  );
}
