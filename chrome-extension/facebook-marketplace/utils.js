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

function isQuietHours() {
  const hour = getCalgaryHour();
  return hour >= 23 || hour < 8;
}

function getRandomPostingDelay() {
  const minMin = (globalThis.FB_CONFIG || {}).MIN_POSTING_INTERVAL_MIN || 15;
  const maxMin = (globalThis.FB_CONFIG || {}).MAX_POSTING_INTERVAL_MIN || 30;
  return randomBetween(minMin * 60 * 1000, maxMin * 60 * 1000);
}

async function crmFetch(endpoint, options = {}) {
  const config = globalThis.FB_CONFIG || {};
  const baseUrl = config.CRM_BASE_URL || "";

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

async function sendAlert(data) {
  return crmFetch("/api/facebook/alerts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

function updateBadge(text, color) {
  chrome.action.setBadgeText({ text: text || "" });
  chrome.action.setBadgeBackgroundColor({ color: color || "#4CAF50" });
}

async function getState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ["enabled", "postsToday", "lastPostTime", "lastError", "stats"],
      (result) => resolve(result)
    );
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
