import { useState } from "react";
import { Crown, ExternalLink, Mail, ShieldCheck, ShoppingBag } from "lucide-react";
import { MONETIZATION, REVENUE_CHANNELS, getAdPreference, setAdPreference } from "@/lib/monetization";
import { trackEvent } from "@/lib/analytics";

const EMAIL = "hello@rmcclassics.com";

function interestLink(subject, channel) {
  const body = `I'm interested in ${channel} for RMC CLASSICS.`;
  return `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function SupportRMC() {
  const [preference, setPreference] = useState(getAdPreference());
  const updatePreference = (value) => {
    setAdPreference(value);
    setPreference(value);
    trackEvent("ad_preference_updated", { preference: value });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-8 md:px-8 md:pt-14">
      <p className="font-pixel text-xs text-neon-yellow">// SUPPORT RMC CLASSICS</p>
      <h1 className="mt-2 font-display text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
        Help keep the classics alive
      </h1>
      <p className="mt-3 max-w-2xl text-[#a3a1c6]">
        Choose how you want to support the arcade. Core games stay playable without paying, and competitive results are never sold.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              <a
                href="/profile"
                onClick={() => trackEvent("freeze_pack_store_clicked", { placement: "support_rmc" })}
                className="mt-4 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-neon-cyan"
              >
                <ShoppingBag className="h-3.5 w-3.5" /> Open the iOS store
              </a>
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

      <section className="mt-10 rounded-3xl border border-neon-pink/30 bg-[#16152b] p-6 text-center">
        <h2 className="font-display text-xl font-black uppercase text-white">Advertise, license, or partner with us</h2>
        <p className="mt-2 text-sm text-[#a3a1c6]">Request sponsor inventory, branded tournaments, bulk access, or licensing.</p>
        <a
          href={interestLink("RMC CLASSICS partnership inquiry", "a sponsorship or licensing partnership")}
          onClick={() => trackEvent("partner_inquiry_started", { placement: "support_rmc" })}
          className="btn-arcade mt-5 inline-flex rounded-full px-6 py-3 text-sm"
        >
          Start a partnership inquiry
        </a>
      </section>
    </div>
  );
}
