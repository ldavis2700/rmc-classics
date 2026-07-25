import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { sfx } from "@/lib/sound";

export default function InstallPrompt() {
  const [event, setEvent] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem("rmc_pwa_dismissed") === "1";
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setEvent(e);
    };
    const handleInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", handleInstalled);
    // If already running in standalone mode, don't show
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const install = async () => {
    if (!event) return;
    sfx.click();
    event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setEvent(null);
  };

  const dismiss = () => {
    sfx.click();
    setDismissed(true);
    try { localStorage.setItem("rmc_pwa_dismissed", "1"); } catch (e) { /* ignore */ }
  };

  if (installed || dismissed || !event) return null;

  return (
    <div
      className="glass fixed bottom-24 left-3 right-3 z-30 flex items-center gap-3 rounded-2xl border border-neon-cyan/30 p-3 md:bottom-6 md:left-auto md:right-6 md:max-w-sm"
      data-testid="pwa-install-banner"
    >
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-neon-cyan/15 glow-cyan">
        <Download className="h-4 w-4 text-neon-cyan" />
      </div>
      <div className="flex-1">
        <div className="font-pixel text-[10px] text-neon-cyan">// INSTALL APP</div>
        <div className="text-sm font-semibold text-white">Add RMC to your home screen</div>
      </div>
      <button
        type="button"
        onClick={install}
        data-testid="pwa-install-btn"
        className="btn-arcade rounded-full px-4 py-2 text-xs font-black"
      >
        Install
      </button>
      <button
        type="button"
        onClick={dismiss}
        data-testid="pwa-dismiss-btn"
        aria-label="Dismiss"
        className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-[#a3a1c6] hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
