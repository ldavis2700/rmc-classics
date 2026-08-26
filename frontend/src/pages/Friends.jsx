import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { UserPlus, Swords, Trash2, Users, Flag, Ban } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "@/lib/api";
import { sfx } from "@/lib/sound";

export default function Friends() {
  const [friends, setFriends] = useState([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get("/friends")
      .then((res) => setFriends(res.data.friends || []))
      .catch(() => setFriends([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  const addFriend = async (e) => {
    e.preventDefault();
    if (adding || !email.trim()) return;
    setAdding(true);
    sfx.click();
    try {
      await api.post("/friends/add", { email: email.trim() });
      toast.success(`Added ${email.trim()}`);
      setEmail("");
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't add friend");
    } finally {
      setAdding(false);
    }
  };

  const removeFriend = async (id) => {
    sfx.click();
    try {
      await api.delete(`/friends/${id}`);
      setFriends((f) => f.filter((x) => x.id !== id));
    } catch (e) {
      toast.error("Couldn't remove");
    }
  };

  const reportUser = async (friend) => {
    const reason = window.prompt(
      `Report ${friend.name || "Player"}. Briefly describe the objectionable or abusive behavior:`
    );
    if (!reason?.trim()) return;
    sfx.click();
    try {
      await api.post("/safety/report", {
        reported_user_id: friend.id,
        reason: reason.trim(),
        context: "friends",
      });
      toast.success("Report received. Thank you for helping keep RMC Classics safe.");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't submit report");
    }
  };

  const blockUser = async (friend) => {
    const confirmed = window.confirm(
      `Block ${friend.name || "Player"}? They will be removed from your friends list and their user-generated content will no longer be shown to you.`
    );
    if (!confirmed) return;
    sfx.click();
    try {
      await api.post(`/safety/block/${friend.id}`);
      setFriends((current) => current.filter((x) => x.id !== friend.id));
      toast.success("User blocked and removed from your view.");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't block user");
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 md:px-8 md:pt-14">
      <p className="font-pixel text-xs text-neon-cyan">// FRIENDS</p>
      <h1 className="mt-1 font-display text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
        Your circle
      </h1>
      <p className="mt-2 max-w-xl text-sm text-[#a3a1c6]">
        Save friends by email. See who&apos;s online. Battle them in one tap. Use Report or Block whenever a player behaves abusively or shares objectionable content.
      </p>

      <form onSubmit={addFriend} className="mt-6 flex flex-wrap gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="friend@email.com"
          data-testid="friend-email-input"
          className="flex-1 min-w-[220px] rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-neon-cyan"
          required
        />
        <button
          type="submit"
          disabled={adding}
          data-testid="friend-add-btn"
          className="btn-arcade btn-arcade-cyan inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-xs font-black disabled:opacity-60"
        >
          <UserPlus className="h-4 w-4" /> {adding ? "Adding…" : "Add friend"}
        </button>
      </form>

      <div className="mt-8 space-y-2" data-testid="friends-list">
        {loading && <div className="font-pixel text-neon-cyan">LOADING…</div>}
        {!loading && friends.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
            <Users className="mx-auto h-8 w-8 text-[#6a6890]" />
            <p className="mt-3 font-pixel text-neon-yellow">NO FRIENDS YET</p>
            <p className="mt-1 text-sm text-[#a3a1c6]">Add someone by their sign-up email.</p>
          </div>
        )}
        {friends.map((f) => (
          <div
            key={f.id}
            data-testid={`friend-row-${f.id}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
          >
            <div className="flex items-center gap-3">
              <div
                className="grid h-10 w-10 place-items-center rounded-xl font-display text-lg font-black text-white"
                style={{ backgroundColor: f.online ? "#39FF14" : "#3d2b56" }}
              >
                {(f.name || "Player").charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{f.name || "Player"}</span>
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-pixel text-[9px] uppercase tracking-widest"
                    style={{
                      backgroundColor: f.online ? "rgba(57,255,20,0.15)" : "rgba(255,255,255,0.05)",
                      color: f.online ? "#39FF14" : "#6a6890",
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: f.online ? "#39FF14" : "#6a6890" }} />
                    {f.online ? "online" : "offline"}
                  </span>
                </div>
                <div className="mt-0.5 text-xs uppercase tracking-widest text-[#a3a1c6]">
                  {f.total_wins || 0} wins · {f.xp || 0} XP
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/battles"
                data-testid={`friend-battle-${f.id}`}
                className="btn-arcade inline-flex items-center gap-1 rounded-full px-4 py-2 text-xs font-black"
              >
                <Swords className="h-3.5 w-3.5" /> Battle
              </Link>
              <button
                type="button"
                onClick={() => reportUser(f)}
                data-testid={`friend-report-${f.id}`}
                className="inline-flex items-center gap-1 rounded-full border border-yellow-400/30 bg-yellow-400/5 px-3 py-2 text-xs font-semibold text-yellow-200 hover:bg-yellow-400/10"
                aria-label="Report user"
              >
                <Flag className="h-3.5 w-3.5" /> Report
              </button>
              <button
                type="button"
                onClick={() => blockUser(f)}
                data-testid={`friend-block-${f.id}`}
                className="inline-flex items-center gap-1 rounded-full border border-red-400/30 bg-red-400/5 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-400/10"
                aria-label="Block user"
              >
                <Ban className="h-3.5 w-3.5" /> Block
              </button>
              <button
                type="button"
                onClick={() => removeFriend(f.id)}
                data-testid={`friend-remove-${f.id}`}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-[#a3a1c6] hover:text-white"
                aria-label="Remove friend"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
