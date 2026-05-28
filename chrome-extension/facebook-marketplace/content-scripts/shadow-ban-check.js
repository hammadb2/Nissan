/**
 * Shadow ban detection utility.
 *
 * After posting a listing, opens it in an incognito-like context
 * to verify it is publicly visible. If the listing is not visible,
 * alerts the dashboard.
 *
 * Approach: Fetches the listing URL without Facebook cookies
 * and checks if the page contains listing content.
 */

async function checkShadowBan(fbListingUrl) {
  if (!fbListingUrl) return { banned: false, reason: "No URL to check" };

  try {
    // Fetch the listing page without auth cookies using a clean context
    // We use the listing URL and check the response for key indicators
    const response = await fetch(fbListingUrl, {
      credentials: "omit",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          banned: true,
          reason: "Listing returns 404 — may be removed or shadow banned",
        };
      }
      return {
        banned: false,
        reason: `Unexpected status: ${response.status}`,
      };
    }

    const html = await response.text();

    // Check for signs the listing is publicly visible
    const hasContent = html.includes("marketplace") || html.includes("Marketplace");
    const hasLoginWall =
      html.includes("You must log in") ||
      html.includes("Log In") ||
      html.includes("log_in");

    // Facebook often requires login for marketplace — so we check
    // if the content is there vs a complete removal
    const hasRemoved =
      html.includes("This listing has been removed") ||
      html.includes("no longer available") ||
      html.includes("content isn't available");

    if (hasRemoved) {
      return {
        banned: true,
        reason: "Listing appears to be removed or unavailable publicly",
      };
    }

    if (!hasContent && hasLoginWall) {
      // Facebook requires login for most marketplace content — this is normal
      return {
        banned: false,
        reason: "Login required (normal for Facebook Marketplace)",
      };
    }

    return { banned: false, reason: "Listing appears to be publicly accessible" };
  } catch (err) {
    return {
      banned: false,
      reason: `Check failed: ${err.message}`,
    };
  }
}

/**
 * Schedules a shadow ban check after a listing is posted.
 * Waits a few minutes before checking to allow Facebook to index.
 */
async function scheduleShadowBanCheck(fbListingUrl, listingId) {
  // Wait 5 minutes before checking
  setTimeout(async () => {
    const result = await checkShadowBan(fbListingUrl);

    if (result.banned) {
      console.warn("[Shadow Ban] DETECTED:", result.reason);
      chrome.runtime.sendMessage({
        action: "facebook_warning",
        data: {
          type: "shadow_ban",
          message: `Shadow ban detected: ${result.reason}`,
          listing_id: listingId,
        },
      });
    } else {
      console.log("[Shadow Ban] Check passed:", result.reason);
    }
  }, 5 * 60 * 1000);
}

if (typeof globalThis !== "undefined") {
  globalThis.checkShadowBan = checkShadowBan;
  globalThis.scheduleShadowBanCheck = scheduleShadowBanCheck;
}
