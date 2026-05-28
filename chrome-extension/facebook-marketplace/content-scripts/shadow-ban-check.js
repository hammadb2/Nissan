/**
 * Shadow ban detection utility.
 *
 * Shadow ban checks are now handled from background.js using
 * chrome.windows.create({ incognito: true }). This file is kept
 * as a helper for any content-script-level detection needs.
 *
 * The background service worker:
 * 1. Waits 10 minutes after a listing is posted
 * 2. Opens an incognito window to the listing URL
 * 3. Injects a script to check for "listing not found" / "no longer available"
 * 4. Reports result via POST /api/facebook/shadow-ban-check
 */

/**
 * Checks current page for shadow ban indicators.
 * Used by background.js via chrome.scripting.executeScript injection.
 */
function detectShadowBanIndicators() {
  const text = document.body?.innerText?.toLowerCase() || "";
  const html = document.documentElement?.innerHTML?.toLowerCase() || "";

  const hidden =
    text.includes("this listing is no longer available") ||
    text.includes("listing not found") ||
    text.includes("this content isn't available") ||
    text.includes("this listing has been removed") ||
    html.includes("content isn't available") ||
    html.includes("no longer available");

  return { hidden };
}

if (typeof globalThis !== "undefined") {
  globalThis.detectShadowBanIndicators = detectShadowBanIndicators;
}
