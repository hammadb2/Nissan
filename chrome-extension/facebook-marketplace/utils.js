/**
 * Shared utility functions for the Facebook Marketplace extension.
 */

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  const min = (globalThis.FB_CONFIG || {}).ACTION_DELAY_MIN_MS || 2000;
  const max = (globalThis.FB_CONFIG || {}).ACTION_DELAY_MAX_MS || 5000;
  return sleep(randomBetween(min, max));
}

function getCalgaryHour() {
  return parseInt(
    new Date().toLocaleString("en-CA", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Edmonton",
    })
  );
}

function getCalgaryDay() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Edmonton" })
  ).getDay();
}

function isPostingQuietHours() {
  const hour = getCalgaryHour();
  const config = globalThis.FB_CONFIG || {};
  const start = config.POSTING_QUIET_HOURS_START || 23;
  const end = config.POSTING_QUIET_HOURS_END || 8;
  return hour >= start || hour < end;
}

function isReplyQuietHours() {
  const hour = getCalgaryHour();
  const config = globalThis.FB_CONFIG || {};
  const start = config.REPLY_QUIET_HOURS_START || 21;
  const end = config.REPLY_QUIET_HOURS_END || 8;
  return hour >= start || hour < end;
}

// Legacy compat — used by background.js for posting checks
function isQuietHours() {
  return isPostingQuietHours();
}

function isPreferredPostingWindow() {
  const config = globalThis.FB_CONFIG || {};
  const hour = getCalgaryHour();
  const day = getCalgaryDay();
  const bestHours = config.BEST_POSTING_HOURS || [17, 18, 19, 20];
  const bestDays = config.BEST_POSTING_DAYS || [0, 1];
  return bestDays.includes(day) && bestHours.includes(hour);
}

function getRandomPostingDelay() {
  const minMin = (globalThis.FB_CONFIG || {}).MIN_POSTING_INTERVAL_MIN || 15;
  const maxMin = (globalThis.FB_CONFIG || {}).MAX_POSTING_INTERVAL_MIN || 30;
  return randomBetween(minMin * 60 * 1000, maxMin * 60 * 1000);
}

async function getCrmBaseUrl() {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(["crmBaseUrl"], (result) => {
        const stored = result.crmBaseUrl;
        const config = globalThis.FB_CONFIG || {};
        resolve(stored || config.CRM_BASE_URL || "");
      });
    } else {
      const config = globalThis.FB_CONFIG || {};
      resolve(config.CRM_BASE_URL || "");
    }
  });
}

async function crmFetch(endpoint, options = {}) {
  const baseUrl = await getCrmBaseUrl();

  if (!baseUrl || baseUrl.includes("your-")) {
    throw new Error("CRM Base URL not configured. Set it in the extension popup.");
  }

  const url = `${baseUrl}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`CRM API error ${response.status}: ${text}`);
  }

  return response.json();
}

async function getNextListingJob() {
  return crmFetch("/api/facebook/next-listing-job");
}

async function reportListingPosted(data) {
  return crmFetch("/api/facebook/listing-posted", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function reportListingFailed(data) {
  return crmFetch("/api/facebook/listing-failed", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function sendNewMessage(data) {
  return crmFetch("/api/facebook/new-message", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function getPendingReplies() {
  return crmFetch("/api/facebook/pending-replies");
}

async function confirmReplySent(data) {
  return crmFetch("/api/facebook/reply-sent", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function reportReplyFailed(data) {
  return crmFetch("/api/facebook/reply-failed", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function sendAlert(data) {
  return crmFetch("/api/facebook/warning-detected", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function reportShadowBanCheck(data) {
  return crmFetch("/api/facebook/shadow-ban-check", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function checkInbox() {
  return crmFetch("/api/facebook/inbox-check");
}

async function extensionLog(level, message) {
  try {
    await crmFetch("/api/facebook/extension-log", {
      method: "POST",
      body: JSON.stringify({
        log_level: level,
        message,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error("[FB Bot] Failed to send log:", err);
  }
}

function updateBadge(text, color) {
  chrome.action.setBadgeText({ text: text || "" });
  chrome.action.setBadgeBackgroundColor({ color: color || "#4CAF50" });
}

async function getState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (result) => resolve(result));
  });
}

async function setState(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, resolve);
  });
}

async function incrementPostCount() {
  const state = await getState();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
  const storedDate = state.stats?.date;
  let count = 0;
  if (storedDate === today) {
    count = state.stats?.postsToday || 0;
  }
  count++;
  await setState({
    stats: { date: today, postsToday: count },
    lastPostTime: Date.now(),
    lastAction: { description: `Posted listing #${count} today`, timestamp: Date.now() },
  });
  return count;
}

async function getPostsToday() {
  const state = await getState();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
  if (state.stats?.date === today) {
    return state.stats.postsToday || 0;
  }
  return 0;
}

async function incrementMessagesReceived() {
  const state = await getState();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
  let count = 0;
  if (state.messageStats?.date === today) {
    count = state.messageStats.received || 0;
  }
  count++;
  await setState({ messageStats: { ...state.messageStats, date: today, received: count } });
  return count;
}

async function incrementRepliesSent() {
  const state = await getState();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
  let count = 0;
  if (state.replyStats?.date === today) {
    count = state.replyStats.sent || 0;
  }
  count++;
  await setState({ replyStats: { ...state.replyStats, date: today, sent: count } });
  return count;
}

async function checkIpLocation() {
  const config = globalThis.FB_CONFIG || {};
  const url = config.IP_CHECK_URL || "https://ipapi.co/json/";
  const required = config.REQUIRED_COUNTRY || "CA";

  try {
    const response = await fetch(url);
    const data = await response.json();
    const country = data.country_code || data.country;
    if (country !== required) {
      return { allowed: false, country, reason: `IP is ${country}, required ${required}` };
    }
    return { allowed: true, country };
  } catch (err) {
    return { allowed: false, country: "unknown", reason: `IP check failed: ${err.message}` };
  }
}
