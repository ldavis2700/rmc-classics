import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, ExternalLink, Mail, ShieldCheck, ShoppingBag } from "lucide-react";
import { MONETIZATION, REVENUE_CHANNELS, getAdPreference, setAdPreference } from "@/lib/monetization";
import { trackEvent } from "@/lib/analytics";

const EMAIL = "hello@rmcclassics.com";
const PAGE_TITLE = "Sponsor or Partner with RMC CLASSICS";
const PAGE_DESCRIPTION = "Sponsor RMC CLASSICS, license the classic-games collection, or explore branded tournaments and partnership opportunities.";

function interestLink(subject, channel) {
  const body = `I'm interested in ${channel} for RMC CLASSICS.`;
  return `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function partnershipLink() {
  const body = [
    "I'm interested in partnering with RMC CLASSICS.",
    "",
    "Organization:",
    "Website:",
    "Opportunity: sponsorship / branded tournament / bulk access / licensing",
    "Audience or campaign goal:",
    "Desired timing:",
  ].join("\n");

  return `mailto:${EMAIL}?subject=${encodeURIComponent("RMC CLASSICS partnership inquiry")}&body=${encodeURIComponent(body)}`;
}

export default function SupportRMC() {
  const [preference, setPreference] = useState(getAdPreference());

  useEffect(() => {
    const description = document.querySelector('meta[name="description"]');
    const canonical = document.querySelector('link[rel="canonical"]');
    const previous = {
      title: document.title,
      description: description?.getAttribute("content"),
      canonical: canonical?.getAttribute("href"),
    };

    document.title = PAGE_TITLE;
    description?.setAttribute("content", PAGE_DESCRIPTION);
    canonical?.setAttribute("href", "https://rmcclassics.com/support-rmc");

    return () => {
      document.title = previous.title;
      if (previous.description) description?.setAttribute("content", previous.description);
      if (previous.canonical) canonical?.setAttribute("href", previous.canonical);
    };
  }, []);
  const updatePreference = (value) => {
    setAdPreference(value);
    setPreference(value);
    trackEvent("ad_preference_updated", { preference: value });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-8 md:px-8 md:pt-14">
      <p className="font-pixel text-xs text-neon-yellow">// PARTNERSHIPS</p>
      <h1 className="mt-2 font-display text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
        Sponsor or partner with RMC CLASSICS
      </h1>
      <p className="mt-3 max-w-2xl text-[#a3a1c6]">
        Reach classic-game players through clearly labeled sponsor placements, branded tournaments, bulk access, or licensing. Tell us what you want to accomplish and we will confirm fit, scope, and availability.
      </p>
      <a
        href={partnershipLink()}
        onClick={() => trackEvent("partner_inquiry_started", { placement: "support_rmc_hero" })}
        className="btn-arcade mt-5 inline-flex rounded-full px-6 py-3 text-sm"
      >
        Request partnership details
      </a>
      <p className="mt-3 text-xs text-[#77749d]">No obligation. Your email opens with a short qualification checklist.</p>

      <h2 className="mt-10 font-display text-xl font-black uppercase text-white">Ways to work with RMC</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REVENUE_CHANNELS.map((channel) => (
          <article key={channel.name} className="rounded-2xl border border-white/10 bg-[#16152b] p-5">
            <div className="flex items-start justify-between gap-3">
              <Crown className="h-5 w-5 text-neon-yellow" />
              <span className="rounded-full border border-white/10 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-[#a3a1c6]">
                {channel.status}
              </span>
            </div>
            <h2 className="mt-4 font-display text-lg font-black uppercase text-white">{channel.name}</h2>
            <p className="mt-1 min-h-10 text-sm text-[#a3a1c6]">{channel.detail}</p>
            {channel.action === "freeze_pack" ? (
              <Link
                to="/profile"
                onClick={() => trackEvent("freeze_pack_store_clicked", { placement: "support_rmc" })}
                className="mt-4 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-neon-cyan"
              >
                <ShoppingBag className="h-3.5 w-3.5" /> Open the iOS store
              </Link>
            ) : channel.action === "founding_pilot" ? (
              <a
                href={MONETIZATION.foundingPilotUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("founding_pilot_opened", { placement: "support_rmc" })}
                className="mt-4 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-neon-cyan"
              >
                <ExternalLink className="h-3.5 w-3.5" /> View founding pilot
              </a>
            ) : (
              <a
                href={interestLink(`RMC CLASSICS: ${channel.name}`, channel.name)}
                onClick={() => trackEvent("revenue_channel_interest", { channel: channel.name })}
                className="mt-4 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-neon-cyan"
              >
                <Mail className="h-3.5 w-3.5" /> Tell us you're interested
              </a>
            )}
          </article>
        ))}
      </div>

      <section className="mt-10 rounded-3xl border border-neon-cyan/30 bg-[#16152b] p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-1 h-5 w-5 text-neon-cyan" />
          <div>
            <h2 className="font-display text-xl font-black uppercase text-white">Advertising preference</h2>
            <p className="mt-1 text-sm text-[#a3a1c6]">
              Contextual ads use the page or game you are viewing. Personalized ads may use your RMC CLASSICS activity, but only when you opt in. We do not sell personal information.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3" role="group" aria-label="Advertising preference">
          {["contextual", "personalized"].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => updatePreference(value)}
              className={`rounded-full border px-5 py-2.5 text-xs font-black uppercase tracking-widest ${
                preference === value
                  ? "border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan"
                  : "border-white/10 bg-white/5 text-[#a3a1c6]"
              }`}
            >
              {value === "contextual" ? "Contextual only" : "Allow personalization"}
            </button>
          ))}
        </div>
      </section>

    </div>
  );
}
