import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, ExternalLink, Mail, ShieldCheck, ShoppingBag } from "lucide-react";
import { MONETIZATION, REVENUE_CHANNELS, getAdPreference, setAdPreference } from "@/lib/monetization";
import { trackEvent } from "@/lib/analytics";

const EMAIL = "hello@rmcclassics.com";
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

function sponsorPreviewLink() {
  const body = [
    "I'd like to review a Founding Sponsor preview for RMC CLASSICS.",
    "",
    "Organization:",
    "Website:",
    "What we offer:",
    "Preferred destination link:",
    "Desired timing:",
  ].join("\n");

  return `mailto:${EMAIL}?subject=${encodeURIComponent("RMC CLASSICS Founding Sponsor preview")}&body=${encodeURIComponent(body)}`;
}

export default function SupportRMC() {
  const [preference, setPreference] = useState(getAdPreference());
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    if (window.location.hash !== "#sponsorships") return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("sponsorships")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const updatePreference = (value) => {
    setAdPreference(value);
    setPreference(value);
    trackEvent("ad_preference_updated", { preference: value });
  };

  const copySponsorEmail = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setCopyStatus("Email copied");
      trackEvent("founding_sponsor_email_copied", { placement: "support_rmc" });
    } catch {
      setCopyStatus(`Email us at ${EMAIL}`);
    }
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

      <section id="sponsorships" className="mt-10 scroll-mt-24 rounded-3xl border border-neon-pink/35 bg-[#16152b] p-6 sm:p-8">
        <p className="font-pixel text-xs text-neon-pink">// FOUNDING SPONSOR</p>
        <h2 className="mt-2 font-display text-2xl font-black uppercase tracking-tight text-white">
          Preview the placement before deciding
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#c9c8e2]">
          RMC CLASSICS is preparing one clearly labeled, direct-sold sponsor placement for a relevant business or organization. We will confirm fit and availability, then show the proposed name, short message, destination link, and dates before either side commits.
        </p>
        <div className="mt-6 rounded-2xl border border-neon-pink/25 bg-[#0d0c1d] p-5" data-testid="founding-sponsor-placement-preview">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#7a789e]">Sponsored · Placement preview</p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-lg font-black uppercase text-white">Your organization</h3>
              <p className="mt-1 text-sm text-[#a3a1c6]">Your approved one-sentence message appears here.</p>
            </div>
            <span className="inline-flex shrink-0 items-center justify-center rounded-full border border-neon-cyan/40 bg-neon-cyan/10 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-neon-cyan">
              Learn more
            </span>
          </div>
          <p className="mt-4 text-xs text-[#77749d]">Illustrative preview only—not a live sponsor, endorsement, audience-size claim, or performance claim.</p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            ["Contextual by default", "Placement is based on the RMC CLASSICS experience—not sensitive traits or cross-app tracking."],
            ["Reviewed before launch", "Creative and destination links require approval. No campaign activates from this inquiry."],
            ["Truthful measurement", "We can report first-party placement activity, but we do not promise traffic, clicks, conversions, or revenue."],
          ].map(([title, detail]) => (
            <article key={title} className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h3 className="font-display text-base font-black uppercase text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#a3a1c6]">{detail}</p>
            </article>
          ))}
        </div>
        <ol className="mt-6 grid gap-3 text-sm text-[#c9c8e2] sm:grid-cols-3">
          <li><b className="text-white">1.</b> Send the short qualification email.</li>
          <li><b className="text-white">2.</b> Review a placement preview and written scope.</li>
          <li><b className="text-white">3.</b> Activation requires separate approval and confirmed payment.</li>
        </ol>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a
            href={sponsorPreviewLink()}
            onClick={() => trackEvent("founding_sponsor_preview_started", { placement: "support_rmc" })}
            className="btn-arcade inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm"
            data-testid="founding-sponsor-preview-btn"
          >
            Request a sponsor preview <Mail className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={copySponsorEmail}
            className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-xs font-black uppercase tracking-widest text-[#c9c8e2] hover:border-neon-cyan/40 hover:text-neon-cyan"
            data-testid="founding-sponsor-copy-email-btn"
          >
            Copy contact email
          </button>
        </div>
        <p className="mt-3 text-xs text-[#77749d]">
          Inquiry only. No purchase, campaign, or recurring commitment is created. If the email button does not open, contact <span className="select-all text-[#c9c8e2]">{EMAIL}</span> directly.
        </p>
        <p className="mt-2 text-xs text-neon-cyan" role="status" aria-live="polite">{copyStatus}</p>
      </section>

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
