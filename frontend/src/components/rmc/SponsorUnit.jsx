import { useEffect } from "react";
import { ExternalLink } from "lucide-react";
import { MONETIZATION, getAdPreference } from "@/lib/monetization";
import { trackEvent } from "@/lib/analytics";

export default function SponsorUnit({ placement = "home" }) {
  const campaign = MONETIZATION.sponsorEnabled
    ? { type: "sponsor", name: MONETIZATION.sponsorName, copy: MONETIZATION.sponsorCopy, url: MONETIZATION.sponsorUrl }
    : MONETIZATION.affiliateEnabled
      ? { type: "affiliate", name: MONETIZATION.affiliateName, copy: MONETIZATION.affiliateCopy, url: MONETIZATION.affiliateUrl }
      : null;

  useEffect(() => {
    if (!campaign?.name || !campaign?.url) return;
    trackEvent("sponsor_impression", {
      placement,
      campaign_type: campaign.type,
      ad_preference: getAdPreference(),
    });
  }, [campaign?.name, campaign?.type, campaign?.url, placement]);

  if (!campaign?.name || !campaign?.url) return null;

  const openCampaign = () => {
    trackEvent(campaign.type === "affiliate" ? "affiliate_outbound_click" : "sponsor_click", {
      placement,
      partner: campaign.name,
      ad_preference: getAdPreference(),
    });
  };

  return (
    <aside className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5" data-testid="sponsor-unit">
      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#7a789e]">
        {campaign.type === "affiliate" ? "Partner offer · We may earn a commission" : "Sponsored"}
      </p>
      <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-display text-lg font-black uppercase text-white">{campaign.name}</h3>
          {campaign.copy && <p className="mt-1 text-sm text-[#a3a1c6]">{campaign.copy}</p>}
        </div>
        <a
          href={campaign.url}
          target="_blank"
          rel="noopener noreferrer sponsored"
          onClick={openCampaign}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-neon-cyan/40 bg-neon-cyan/10 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-neon-cyan"
        >
          Learn more <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </aside>
  );
}
