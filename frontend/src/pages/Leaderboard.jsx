import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Crown, Medal } from "lucide-react";
import api from "@/lib/api";
import { GAMES, GAME_MAP } from "@/lib/games";
import { sfx } from "@/lib/sound";

const TABS = [{ id: "overall", label: "Overall" }, ...GAMES.map((g) => ({ id: g.id, label: g.name }))];

function rankBadge(i) {
  if (i === 0) return { color: "#FFD100", icon: Crown };
  if (i === 1) return { color: "#C0C0C0", icon: Medal };
  if (i === 2) return { color: "#CD7F32", icon: Medal };
  return null;
}

export default function Leaderboard() {
  const [tab, setTab] = useState("overall");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = tab === "overall" ? "/games/leaderboard" : `/games/leaderboard/${tab}`;
    api
      .get(url)
      .then((res) => {
        if (!cancelled) setRows(res.data.rows || []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tab]);

  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 md:px-8 md:pt-14">
      <div className="mb-6">
        <p className="font-pixel text-xs text-neon-yellow">// HALL OF FAME</p>
        <h1 className="mt-1 font-display text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
          Global leaderboards
        </h1>
        <p className="mt-2 text-sm text-[#a3a1c6]">
          Compete against players around the world. Top 20 for every game.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              data-testid={`lb-tab-${t.id}`}
              onClick={() => { sfx.click(); setTab(t.id); }}
              className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-colors ${
                active
                  ? "border-neon-pink bg-[#ff479a] text-white"
                  : "border-white/10 bg-white/5 text-[#a3a1c6] hover:text-white"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-2" data-testid="leaderboard-list">
        {loading && <div className="font-pixel text-neon-cyan">LOADING…</div>}
        {!loading && rows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
            <p className="font-pixel text-neon-yellow">NO SCORES YET</p>
            <p className="mt-2 text-sm text-[#a3a1c6]">Be the first to set the high score!</p>
          </div>
        )}
        {!loading &&
          rows.map((row, i) => {
            const badge = rankBadge(i);
            const RankIcon = badge?.icon;
            const isOverall = tab === "overall";
            const game = GAME_MAP[tab];
            return (
              <motion.div
                key={(row.user_id || row.id) + i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4"
                style={badge ? { borderColor: `${badge.color}55`, boxShadow: `0 0 20px ${badge.color}22` } : {}}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="grid h-10 w-10 place-items-center rounded-full font-pixel text-sm"
                    style={{
                      backgroundColor: badge ? `${badge.color}22` : "rgba(255,255,255,0.05)",
                      color: badge ? badge.color : "#ffffff",
                    }}
                  >
                    {RankIcon ? <RankIcon className="h-4 w-4" /> : `#${i + 1}`}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{row.name || "Player"}</div>
                    <div className="mt-0.5 text-xs uppercase tracking-widest text-[#a3a1c6]">
                      {isOverall
                        ? `${row.total_plays || 0} games played`
                        : `${row.plays} plays · ${row.wins} wins`}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  {isOverall ? (
                    <div className="font-pixel text-xl text-neon-yellow">
                      {row.total_wins || 0}<span className="ml-1 text-xs text-[#a3a1c6]">W</span>
                    </div>
                  ) : (
                    <div>
                      <div className="font-pixel text-xl text-neon-yellow">{row.wins} W</div>
                      {row.best_score != null && (
                        <div className="text-[10px] uppercase tracking-widest text-[#a3a1c6]">
                          Best {row.best_score}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
      </div>

      {tab !== "overall" && (
        <p className="mt-6 text-center text-xs text-[#6a6890]">
          {GAME_MAP[tab]?.name}: ranked by wins, then best score.
        </p>
      )}
    </div>
  );
}
