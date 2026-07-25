import { Link } from "react-router-dom";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { sfx } from "@/lib/sound";

export default function GameShell({ title, subtitle, color = "#FF479A", children, onReset, extraActions }) {
  return (
    <section className="mx-auto max-w-5xl px-4 pt-8 md:px-8 md:pt-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/library"
            data-testid="game-back"
            onClick={() => sfx.click()}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5 text-white hover:border-white/20"
            aria-label="Back to library"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1
              className="font-display text-2xl font-black uppercase leading-none tracking-tight text-white sm:text-3xl"
              style={{ textShadow: `0 0 22px ${color}55` }}
            >
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-sm text-[#a3a1c6]">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {extraActions}
          {onReset && (
            <button
              type="button"
              onClick={() => { sfx.click(); onReset(); }}
              data-testid="game-reset"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-white hover:border-white/20"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          )}
        </div>
      </div>
      <div className="rounded-3xl border border-white/10 bg-[#16152b] p-4 sm:p-6">
        {children}
      </div>
    </section>
  );
}
