# SEO & Analytics Setup Guide

## 1. Google Analytics (GA4)

### Get your Measurement ID
1. Go to https://analytics.google.com → Admin → Create Property (name: "RMC CLASSICS")
2. Set up a **Web** data stream with your domain (e.g., `https://rmcclassics.com`)
3. Copy the **Measurement ID** (format: `G-XXXXXXXXXX`)

### Add it to your app
Edit `/app/frontend/.env` and add:
```
REACT_APP_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```
Then `sudo supervisorctl restart frontend` and redeploy.

The app will now:
- Load gtag.js only when the env var is present
- Auto-track pageviews on every route change (via Layout.jsx)
- Expose `trackEvent(name, params)` from `@/lib/analytics` for custom events

## 2. Google Search Console

### Verify ownership
1. Go to https://search.google.com/search-console → Add Property
2. Choose the **URL prefix** method with your domain
3. Pick **HTML tag** verification — copy the value out of the meta tag Google gives you (looks like `content="abcXYZ123..."`)

### Add it to your app
Edit `/app/frontend/public/index.html` and replace:
```html
<meta name="google-site-verification" content="REPLACE_WITH_YOUR_SEARCH_CONSOLE_TOKEN" />
```
with your actual token.

Redeploy, then hit **Verify** in Search Console.

### Submit sitemap
Once verified:
1. In Search Console → Sitemaps → enter `sitemap.xml`
2. Submit — your 16 URLs get crawled within a day or two
3. Also submit to Bing: https://www.bing.com/webmasters

## 3. Testing tools
- **Twitter/X card preview**: https://cards-dev.twitter.com/validator (still works via the "Debugger" replacement)
- **Facebook / OG preview**: https://developers.facebook.com/tools/debug/
- **LinkedIn preview**: https://www.linkedin.com/post-inspector/
- **Google rich results**: https://search.google.com/test/rich-results

## 4. Post-launch quick wins
- Run PageSpeed Insights: https://pagespeed.web.dev/
- Add a Twitter/X account and tag `@rmcclassics` in shared results
- Create a 1200×630 branded PNG for `og:image` — icons alone show poorly on Twitter
