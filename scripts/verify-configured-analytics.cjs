/* Compiled-app GA queue acceptance. No provider script or telemetry may leave CI. */
const assert = require("node:assert/strict");
const FIXTURE_ID = "G-RMCCITEST0";
async function verifyConfiguredAnalytics(browser, base) {
  assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
  for (const blockedLoader of [false, true]) {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const loaders = [];
    const pageErrors = [];
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(base).origin) return route.continue();
      if (url.origin === "https://www.googletagmanager.com" && url.pathname === "/gtag/js") {
        loaders.push({ id: url.searchParams.get("id"), referer: route.request().headers().referer });
        // This is intentionally NOT Google's SDK or an assertion about its transport.
        return blockedLoader ? route.abort() : route.fulfill({
          status: 200, contentType: "application/javascript", body: "/* isolated GA loader fixture */",
        });
      }
      return route.abort(); // Includes GA collection, PostHog, fonts and every other external origin.
    });
    try {
      const page = await context.newPage();
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(base + "/privacy?token=private-query-marker#private-fragment-marker", {
        referer: base + "/private-referrer-marker",
      });
      await page.getByTestId("legal-title").waitFor();
      await page.waitForFunction(() => Array.from(window.dataLayer || []).some(
        (call) => call[0] === "event" && call[1] === "page_view" && call[2].page_path === "/privacy"));
      assert.equal(await page.locator('script[src*="googletagmanager.com/gtag/js"]').getAttribute("referrerpolicy"), "no-referrer");
      await page.evaluate(() => {
        document.title = "private-title-marker";
        history.pushState({}, "", "/terms?token=private-query-marker#private-fragment-marker");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      await page.waitForFunction(() => Array.from(window.dataLayer || []).some(
        (call) => call[0] === "event" && call[1] === "page_view" && call[2].page_path === "/terms"));
      const calls = await page.evaluate(() => Array.from(window.dataLayer || [], (call) => Array.from(call)));
      const configs = calls.filter((call) => call[0] === "config");
      const views = calls.filter((call) => call[0] === "event" && call[1] === "page_view");
      assert(configs.length >= 2, "Initialization and history navigation must configure GA");
      assert.deepEqual(views.map((call) => call[2].page_path), ["/privacy", "/terms"],
        "Require one manual page view per route without duplicates");
      for (const call of [...configs, ...views]) {
        const fields = call[2];
        assert(["/privacy", "/terms"].includes(fields.page_path));
        assert.deepEqual(fields, {
          page_path: fields.page_path, page_location: "https://rmcclassics.com" + fields.page_path,
          page_referrer: "", page_title: "RMC CLASSICS",
          ...(call[0] === "config" ? { send_page_view: false } : {}),
        });
        if (call[0] === "config") assert.equal(call[1], FIXTURE_ID);
      }
      assert(!JSON.stringify(calls).includes("private-"), "Private URL, referrer and title markers must not reach the queue");
      assert.equal(loaders.length, 1, "Initialize the configured loader once");
      assert.equal(loaders[0].id, FIXTURE_ID);
      assert.equal(loaders[0].referer, undefined, "Loader request must suppress the document referrer");
      assert.deepEqual(pageErrors, []);
    } finally { await context.close(); }
  }
  console.log("PASS: configured compiled GA initialization/history pageviews, private-field filtering and blocked-loader recovery; external traffic intercepted; provider transport/settings unverified");
}
module.exports = { verifyConfiguredAnalytics };
