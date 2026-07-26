# Meta Tags & Domain Configuration Guide

When you connect a custom domain (e.g., `rmcclassics.com`), do a **single find-and-replace** across these files:

## Find & Replace
Replace ALL occurrences of `childhood-games-5.emergent.host` with your custom domain (without the protocol):

**Files to update:**
- `/app/frontend/public/index.html` (canonical URL, og:url, og:image, twitter:image)
- `/app/frontend/public/robots.txt` (sitemap URL)
- `/app/frontend/public/sitemap.xml` (16 URL entries)

## Quick command
```bash
cd /app/frontend/public
sed -i 's|childhood-games-5.emergent.host|yourdomain.com|g' index.html robots.txt sitemap.xml
```

## What's already domain-agnostic (no changes needed)
- **Share Card** uses `window.location.origin` — automatically picks up whichever domain the user is on
- **Battle invite links** in `BattlePlay.jsx` use `window.location.origin`
- **Frontend API calls** use `REACT_APP_BACKEND_URL` (set in `frontend/.env`)
- **PWA manifest** uses relative paths (`/logo.svg`, `/`)
- **Service worker** intercepts same-origin requests only

## Post-domain-swap checklist
1. Update `frontend/.env` → set `REACT_APP_BACKEND_URL=https://yourdomain.com` (backend already served on same domain via ingress)
2. Redeploy from Emergent dashboard
3. Verify with:
   - https://cards-dev.twitter.com/validator — Twitter card preview
   - https://developers.facebook.com/tools/debug/ — Facebook OG preview  
   - https://www.linkedin.com/post-inspector/ — LinkedIn preview
4. Submit sitemap to Google Search Console: `https://yourdomain.com/sitemap.xml`

## Social share preview
When someone shares your link, they'll see:
- **Title**: RMC CLASSICS — Remembering My Childhood
- **Description**: The arcade that raised us — reborn. 13 classic childhood games, real-time friend battles, global leaderboards. Zero downloads.
- **Image**: Your logo (`/logo.svg`)
