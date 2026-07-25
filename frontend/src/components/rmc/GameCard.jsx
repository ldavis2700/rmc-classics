import { Link } from "react-router-dom";
import { sfx } from "@/lib/sound";

export default function GameCard({ game, index = 0 }) {
  return (
    <Link
      to={game.path}
      data-testid={`game-card-${game.id}`}
      onMouseEnter={() => sfx.hover()}
      onClick={() => sfx.click()}
      className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-[#16152b] p-5 transition-transform duration-300 hover:-translate-y-2"
      style={{
        boxShadow: `0 0 0 rgba(0,0,0,0)`,
        transitionProperty: "transform, box-shadow, border-color",
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.boxShadow = `0 0 22px ${game.color}55, 0 0 44px ${game.color}22`;
        e.currentTarget.style.borderColor = `${game.color}77`;
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.boxShadow = `0 0 0 rgba(0,0,0,0)`;
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
      }}
    >
      <div
        className="absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-40 blur-2xl transition-opacity duration-300 group-hover:opacity-70"
        style={{ backgroundColor: game.color }}
      />
      <div className="relative z-10 flex h-full flex-col">
        <div className="flex items-center justify-between">
          <span
            className="chip"
            style={{ borderColor: `${game.color}55`, color: game.color }}
          >
            <span className="font-pixel">#{String(index + 1).padStart(2, "0")}</span>
            {game.era}
          </span>
          <span className="font-pixel text-xs" style={{ color: game.accent }}>
            PLAY ▸
          </span>
        </div>
        <h3 className="mt-6 font-display text-2xl font-black uppercase leading-none tracking-tight text-white">
          {game.name}
        </h3>
        <p className="mt-2 text-sm font-medium text-[#a3a1c6]">{game.tagline}</p>
        <p className="mt-4 text-sm leading-relaxed text-white/70">{game.description}</p>
        <div className="mt-6 flex items-center gap-2 text-xs uppercase tracking-widest text-white/60">
          <span className="h-1 w-8 rounded-full" style={{ backgroundColor: game.color }} />
          Tap to play
        </div>
      </div>
    </Link>
  );
}
