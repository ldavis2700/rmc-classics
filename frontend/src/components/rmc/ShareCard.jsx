import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Share2, Copy, Trophy } from "lucide-react";
import { toast } from "sonner";
import { sfx } from "@/lib/sound";

export default function ShareCard({ open, onClose, game, won, statLabel, statValue, xpGained, challengeCompleted }) {
  const [copied, setCopied] = useState(false);

  const shareText = useMemo(() => {
    const verdict = won ? "just won" : "just played";
    const stat = statValue != null ? ` · ${statLabel}: ${statValue}` : "";
    return `I ${verdict} ${game?.name} on RMC CLASSICS${stat} 🎮\nPlay every childhood classic → ${typeof window !== "undefined" ? window.location.origin : ""}`;
  }, [game, won, statLabel, statValue]);

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}${game?.path || "/"}` : "";

  const doShare = async () => {
    sfx.click();
    if (navigator.share) {
      try {
        await navigator.share({ title: "RMC CLASSICS", text: shareText, url: shareUrl });
        toast.success("Shared!");
      } catch (e) {
        // user cancelled
      }
    } else {
      copyText();
    }
  };

  const copyText = async () => {
    sfx.click();
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast.success("Copied to clipboard");
    } catch (e) {
      toast.error("Couldn't copy");
    }
  };

  if (!game) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md border-white/10 bg-[#16152b] text-white sm:rounded-3xl" data-testid="share-card-modal">
        <DialogHeader className="sr-only">Share your result</DialogHeader>
        <div className="relative overflow-hidden rounded-2xl border-2 p-6" style={{ borderColor: `${game.color}88` }}>
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-50 blur-3xl"
            style={{ backgroundColor: game.color }}
          />
          <div className="relative">
            <p className="font-pixel text-xs" style={{ color: game.accent }}>
              // RMC CLASSICS
            </p>
            <h2 className="mt-2 font-display text-3xl font-black uppercase leading-none tracking-tight">
              {won ? "Victory!" : "Nice run"}
            </h2>
            <p className="mt-2 text-sm text-[#a3a1c6]">{game.name} — {game.tagline}</p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="font-pixel text-[10px] uppercase tracking-widest text-[#a3a1c6]">Result</div>
                <div className="mt-1 font-display text-lg font-black" style={{ color: won ? "#39FF14" : "#a3a1c6" }}>
                  {won ? "WIN" : "PLAYED"}
                </div>
              </div>
              {statValue != null && (
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="font-pixel text-[10px] uppercase tracking-widest text-[#a3a1c6]">{statLabel}</div>
                  <div className="mt-1 font-pixel text-2xl" style={{ color: game.accent }}>{statValue}</div>
                </div>
              )}
              {xpGained ? (
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="font-pixel text-[10px] uppercase tracking-widest text-[#a3a1c6]">XP earned</div>
                  <div className="mt-1 font-pixel text-2xl text-neon-yellow">+{xpGained}</div>
                </div>
              ) : null}
              {challengeCompleted && (
                <div className="col-span-2 flex items-center gap-2 rounded-xl border border-neon-yellow/40 bg-neon-yellow/10 p-3">
                  <Trophy className="h-4 w-4 text-neon-yellow" />
                  <span className="text-sm font-semibold text-neon-yellow">Daily Challenge complete!</span>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={doShare}
                data-testid="share-native-btn"
                className="btn-arcade flex-1 rounded-2xl px-4 py-3 text-sm font-black"
              >
                <Share2 className="mr-2 inline h-4 w-4" /> Share
              </button>
              <button
                type="button"
                onClick={copyText}
                data-testid="share-copy-btn"
                className="btn-arcade btn-arcade-cyan flex-1 rounded-2xl px-4 py-3 text-sm font-black"
              >
                <Copy className="mr-2 inline h-4 w-4" /> {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => { sfx.click(); onClose(); }}
              data-testid="share-close-btn"
              className="mt-3 w-full rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-widest text-[#a3a1c6] hover:text-white"
            >
              Close
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
