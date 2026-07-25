import { useEffect, useState } from "react";
import api from "@/lib/api";

// All badges catalog, cached in-memory.
let cache = null;

export function useBadgeCatalog() {
  const [badges, setBadges] = useState(cache || []);
  useEffect(() => {
    if (cache) return;
    api
      .get("/badges")
      .then((res) => {
        cache = res.data.badges || [];
        setBadges(cache);
      })
      .catch(() => {});
  }, []);
  return badges;
}

export function BadgeChip({ badge, unlocked = true, size = "md" }) {
  const s = size === "sm" ? "h-10 w-10 text-lg" : "h-14 w-14 text-2xl";
  return (
    <div
      className={`grid ${s} place-items-center rounded-xl border-2`}
      style={{
        backgroundColor: unlocked ? `${badge.color}22` : "rgba(255,255,255,0.03)",
        borderColor: unlocked ? `${badge.color}88` : "rgba(255,255,255,0.08)",
        boxShadow: unlocked ? `0 0 14px ${badge.color}55` : "none",
        opacity: unlocked ? 1 : 0.35,
        filter: unlocked ? "none" : "grayscale(80%)",
      }}
      title={`${badge.name} — ${badge.desc}`}
    >
      <span>{badge.icon}</span>
    </div>
  );
}

export function BadgeShelf({ userBadges }) {
  const catalog = useBadgeCatalog();
  const owned = new Set(userBadges || []);
  return (
    <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-7" data-testid="badge-shelf">
      {catalog.map((b) => (
        <div key={b.id} className="flex flex-col items-center gap-1" data-testid={`badge-${b.id}`}>
          <BadgeChip badge={b} unlocked={owned.has(b.id)} />
          <span
            className="text-center font-pixel text-[9px] uppercase tracking-widest"
            style={{ color: owned.has(b.id) ? b.color : "#6a6890" }}
          >
            {b.name}
          </span>
        </div>
      ))}
    </div>
  );
}
