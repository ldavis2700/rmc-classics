/* eslint-disable react/no-unescaped-entities */
import { Link } from "react-router-dom";

const LAST_UPDATED = "August 27, 2026";
const CONTACT_EMAIL = "hello@rmcclassics.com";

function Shell({ eyebrow, title, children }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 md:px-8 md:pt-14">
      <p className="font-pixel text-xs text-neon-cyan">// {eyebrow}</p>
      <h1
        className="mt-1 font-display text-3xl font-black uppercase tracking-tight text-white sm:text-4xl"
        data-testid="legal-title"
      >
        {title}
      </h1>
      <p className="mt-2 text-xs text-[#7a789e]">Last updated: {LAST_UPDATED}</p>
      <div className="prose prose-invert mt-8 max-w-none text-sm leading-relaxed text-[#c9c7e6] [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:uppercase [&_h2]:tracking-tight [&_h2]:text-white [&_a]:text-neon-cyan [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1">
        {children}
        <p className="mt-10 text-xs text-[#7a789e]">
          Questions?{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> · Or visit our{" "}
          <Link to="/support">support page</Link>.
        </p>
      </div>
    </div>
  );
}

export function Privacy() {
  return (
    <Shell eyebrow="PRIVACY POLICY" title="Your data, in plain English">
      <p>
        RMC CLASSICS ("we", "us") builds a nostalgic collection of classic games at{" "}
        <a href="https://rmcclassics.com">rmcclassics.com</a>. This policy explains what we collect,
        why, and how you can control it.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <b>Account data:</b> email address, chosen username, and a bcrypt-hashed password (we
          never store or see your plaintext password).
        </li>
        <li>
          <b>Gameplay data:</b> games played, scores, wins, XP, streak, badges, unlocked themes,
          and friend connections — used for leaderboards, daily challenges, and matchmaking.
        </li>
        <li>
          <b>Device data:</b> anonymous device type and screen size for responsive rendering.
        </li>
        <li>
          <b>Analytics:</b> aggregated, non-identifying usage counts (page views, game starts,
          voluntary share completions, and visits from player-shared game links) via
          privacy-friendly analytics. We do not record who receives a shared link.
        </li>
        <li>
          <b>Advertising preference:</b> whether you selected contextual or personalized advertising.
          Contextual advertising is the default.
        </li>
      </ul>

      <h2>What we do NOT collect</h2>
      <ul>
        <li>We do not collect location, contacts, camera, microphone, or health data.</li>
        <li>We do not sell personal information to third parties.</li>
        <li>We do not track you across other apps or websites.</li>
        <li>We do not use sensitive traits, precise location, contacts, health data, or children's data for advertising.</li>
      </ul>

      <h2>How we use your data</h2>
      <ul>
        <li>To power leaderboards, friend battles, and daily challenges.</li>
        <li>To save your progress so you can log in on any device.</li>
        <li>To improve the app and fix bugs (aggregated only).</li>
        <li>To show contextual sponsor or affiliate offers.</li>
        <li>Only with your opt-in, to personalize offers using activity inside RMC CLASSICS.</li>
      </ul>

      <h2>Data storage & security</h2>
      <p>
        Your data is stored in MongoDB with encryption at rest and in transit (HTTPS/TLS 1.2+).
        Passwords are hashed with bcrypt. We use industry-standard JWT for session tokens.
      </p>

      <h2>Your rights</h2>
      <ul>
        <li>
          <b>Access:</b> View your data on the Profile screen at any time.
        </li>
        <li>
          <b>Delete:</b> Permanently delete your account and associated personal account data from inside the app at Profile → Account Settings → Delete Account. Limited transaction and safety evidence may be retained under a non-identifying reference when necessary for purchase integrity, disputes, fraud prevention, accounting, or moderation. It is no longer linked to an active profile or email. If you cannot access your account, contact support for assistance.
        </li>
        <li>
          <b>Export:</b> Request a copy of your data by email.
        </li>
      </ul>

      <h2>Children</h2>
      <p>
        RMC CLASSICS is rated for ages 4+ and does not knowingly collect data from children under
        13. If you are a parent or guardian and believe your child registered without consent,
        contact us and we will delete the account immediately.
      </p>

      <h2>Third-party services</h2>
      <ul>
        <li>MongoDB Atlas (data storage)</li>
        <li>Cloudflare (CDN + DDoS protection)</li>
        <li>Apple App Store / Google Play (distribution)</li>
        <li>RevenueCat (in-app purchase processing)</li>
        <li>Approved sponsors and affiliate partners, when a clearly labeled offer is active</li>
      </ul>

      <h2>Advertising and affiliate disclosure</h2>
      <p>
        Clearly labeled sponsor and partner offers may appear outside active gameplay. We may earn
        money from impressions, clicks, or qualifying purchases. Personalized advertising is off by
        default and requires an affirmative choice on the Support RMC page. You can return there to
        change your preference. Enabling personalization does not permit cross-app tracking; any
        tracking that would require platform permission will remain disabled unless that permission
        is separately requested and granted.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We'll post any material changes here and update the "Last updated" date above. Continued
        use of the app means you accept the current policy.
      </p>
    </Shell>
  );
}

export function Terms() {
  return (
    <Shell eyebrow="TERMS OF SERVICE" title="The house rules">
      <p>
        By using RMC CLASSICS you agree to these terms. If you don't, please don't use the app.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be at least 13 to create an account.</li>
        <li>You are responsible for your own login credentials.</li>
        <li>One account per person. No sharing.</li>
      </ul>

      <h2>Fair play</h2>
      <ul>
        <li>No cheating, botting, or exploiting bugs to inflate scores.</li>
        <li>No harassment, hate speech, or spam in chat or usernames.</li>
        <li>Use the in-app Report and Block controls when another player violates these rules.</li>
        <li>We reserve the right to reset scores or suspend or ban accounts that violate fair play or safety rules.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        Your username and profile are visible to other players. Don't include personal info,
        contact details, or anything you wouldn't want on a public leaderboard.
      </p>

      <h2>Our content</h2>
      <p>
        The games, art, sound, and code in RMC CLASSICS are © RMC CLASSICS. Classic public-domain
        game mechanics remain free for all — our specific implementations, look, and branding are
        ours.
      </p>

      <h2>Trademark note</h2>
      <p>
        All trademarks referenced in classic game descriptions are the property of their
        respective owners. RMC CLASSICS is not affiliated with, sponsored by, or endorsed by any
        toy or game brand.
      </p>

      <h2>Disclaimer</h2>
      <p>
        The app is provided "as is" without warranties. We work hard to keep it up, but we're not
        liable for lost progress from outages, device issues, or force majeure events.
      </p>

      <h2>Termination</h2>
      <p>
        You can permanently delete your account at any time from Profile → Account Settings → Delete Account. We may suspend accounts that violate these terms.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of the United States. Any disputes will be resolved
        in binding arbitration.
      </p>
    </Shell>
  );
}

export function Support() {
  return (
    <Shell eyebrow="SUPPORT" title="Need a hand? We got you.">
      <p>
        Real humans, real replies. Most issues are answered within 24 hours.
      </p>

      <h2>Contact us</h2>
      <ul>
        <li>
          <b>Email:</b> <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </li>
        <li>
          <b>Response time:</b> within 24 hours, Monday–Friday
        </li>
      </ul>

      <h2>Common questions</h2>

      <h2>How do I reset my password?</h2>
      <p>
        Email us from the address you registered with and we'll send a reset link within a few
        minutes.
      </p>

      <h2>My score didn't save</h2>
      <p>
        Scores save automatically when you're logged in. If you played as a guest, scores stay on
        your device only. Log in before playing to sync with the global leaderboard.
      </p>

      <h2>How do I delete my account?</h2>
      <p>
        While signed in, open Profile → Account Settings → Delete Account. Enter your current password, type DELETE, and confirm permanent deletion. If you cannot sign in, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> for assistance.
      </p>

      <h2>How do I report or block another player?</h2>
      <p>
        Open Friends, select the player, then use Report or Block. Blocking removes that player from your social and friends surfaces, and reports are recorded for moderation review.
      </p>

      <h2>Why did I lose my streak?</h2>
      <p>
        You get one streak freeze per week — it kicks in automatically if you miss a day. If you
        run out, the streak resets. Play the Daily Challenge every day to keep it alive.
      </p>

      <h2>How do friend battles work?</h2>
      <p>
        Add a friend by email under the Friends tab. From the Battles screen, pick a game and
        invite them. When both are online, the battle starts in real time. Winner takes host
        privileges on the rematch.
      </p>

      <h2>Report a bug or suggest a game</h2>
      <p>
        We love feedback. Email us with "BUG" or "IDEA" in the subject. Include your device and
        what happened. Screenshots help.
      </p>
    </Shell>
  );
}

export default Support;
