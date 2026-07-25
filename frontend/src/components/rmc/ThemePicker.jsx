import { Lock, Check, Palette } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { sfx } from "@/lib/sound";

export default function ThemePicker() {
  const { themes, current, applyTheme } = useTheme();
  const { user } = useAuth();
  const unlocked = new Set(user?.unlocked_themes || ["neon"]);

  const pick = async (id) => {
    if (!unlocked.has(id)) return;
    sfx.click();
    const res = await applyTheme(id);
    if (res.ok) toast.success("Theme applied!");
    else toast.error(res.error || "Couldn't apply theme");
  };

  return (
    <div className="mt-10">
      <div className="flex items-center gap-2">
        <Palette className="h-4 w-4 text-neon-yellow" />
        <p className="font-pixel text-xs text-neon-yellow">// SKIN SHOP</p>
      </div>
      <h2 className="mt-1 font-display text-xl font-black uppercase tracking-tight text-white sm:text-2xl">
        Pick your theme
      </h2>
      <p className="mt-1 text-sm text-[#a3a1c6]">
        Unlock skins as you climb the XP ladder. Show off your grind.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="theme-grid">
        {themes.map((t) => {
          const isUnlocked = unlocked.has(t.id);
          const isCurrent = current === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t.id)}
              disabled={!isUnlocked}
              data-testid={`theme-${t.id}`}
              className="group relative overflow-hidden rounded-2xl border p-4 text-left transition-transform hover:-translate-y-1 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              style={{
                borderColor: isCurrent ? t.primary : "rgba(255,255,255,0.1)",
                boxShadow: isCurrent ? `0 0 22px ${t.primary}66` : "none",
                backgroundColor: "#16152b",
                opacity: isUnlocked ? 1 : 0.55,
              }}
            >
              {/* preview swatches */}
              <div className="flex gap-1">
                <span className="h-8 w-8 rounded-md" style={{ backgroundColor: t.primary }} />
                <span className="h-8 w-8 rounded-md" style={{ backgroundColor: t.accent }} />
                <span className="h-8 w-8 rounded-md bg-[#0b0a1a]" />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <h3 className="font-display text-lg font-black uppercase tracking-tight text-white">
                  {t.name}
                </h3>
                {isCurrent && <Check className="h-4 w-4 text-neon-green" />}
                {!isUnlocked && <Lock className="h-4 w-4 text-[#a3a1c6]" />}
              </div>
              <p className="mt-1 font-pixel text-[10px] uppercase tracking-widest" style={{ color: t.primary }}>
                {isUnlocked ? (isCurrent ? "Active" : "Tap to apply") : `${t.unlock_xp} XP to unlock`}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
