export const MONETIZATION = {
  foundingPilotUrl: process.env.REACT_APP_FOUNDING_PILOT_URL || "https://rmc-classics-founding-pilot-ashy.vercel.app/",
  sponsorEnabled: process.env.REACT_APP_SPONSOR_ENABLED === "true",
  sponsorName: process.env.REACT_APP_SPONSOR_NAME || "",
  sponsorCopy: process.env.REACT_APP_SPONSOR_COPY || "",
  sponsorUrl: process.env.REACT_APP_SPONSOR_URL || "",
  affiliateEnabled: process.env.REACT_APP_AFFILIATE_ENABLED === "true",
  affiliateName: process.env.REACT_APP_AFFILIATE_NAME || "",
  affiliateCopy: process.env.REACT_APP_AFFILIATE_COPY || "",
  affiliateUrl: process.env.REACT_APP_AFFILIATE_URL || "",
};

const AD_PREFERENCE_KEY = "rmc_ad_preference_v1";

export function getAdPreference() {
  if (typeof window === "undefined") return "contextual";
  return window.localStorage.getItem(AD_PREFERENCE_KEY) || "contextual";
}

export function setAdPreference(preference) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AD_PREFERENCE_KEY, preference === "personalized" ? "personalized" : "contextual");
}

export const REVENUE_CHANNELS = [
  { name: "Streak Freeze Packs", status: "live", detail: "Five one-time streak protections for $0.99 in the iOS app", action: "freeze_pack" },
  { name: "Founding Membership", status: "testing", detail: "Help shape optional member benefits in the approved interest pilot", action: "founding_pilot" },
  { name: "Sponsor Placements", status: "ready", detail: "Direct-sold, clearly labeled inventory" },
  { name: "Affiliate Offers", status: "ready", detail: "Commission-earning partner links" },
  { name: "Cosmetic Theme Packs", status: "planned", detail: "Non-competitive visual upgrades" },
  { name: "Tournament Passes", status: "planned", detail: "Optional paid events and leagues" },
  { name: "Physical Merchandise", status: "planned", detail: "Retro apparel and collectibles" },
  { name: "Gift Memberships", status: "planned", detail: "Player-to-player gifting" },
  { name: "Game & Brand Licensing", status: "planned", detail: "Business and event licensing" },
];
