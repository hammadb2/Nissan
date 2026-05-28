/**
 * Background service worker — orchestrates all automation.
 *
 * Responsibilities:
 * 1. Polls CRM for next listing job, opens Marketplace create page
 * 2. Polls CRM for pending AI replies, dispatches to inbox tab
 * 3. Triggers inbox monitoring on schedule
 * 4. Enforces pacing rules and quiet hours
 */

importScripts("config.js", "utils.js");

const ALARM_LISTING_POLL = "fb-listing-poll";
const ALARM_REPLY_POLL = "fb-reply-poll";
const ALARM_INBOX_POLL = "fb-inbox-poll";

// ── Lifecycle ──

chrome.runtime.onInstalled.addListener(() => {
  setState({ enabled: false, stats: { date: "", postsToday: 0 } });
  console.log("[FB Bot] Extension installed. Enable via popup.");
});

// ── Alarm-based polling ──

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const state = await getState();
  if (!state.enabled) return;

  switch (alarm.name) {
    case ALARM_LISTING_POLL:
      await handleListingPoll();
      break;
    case ALARM_REPLY_POLL:
      await handleReplyPoll();
      break;
    case ALARM_INBOX_POLL:
      await handleInboxPoll();
      break;
  }
});

async function startPolling() {
  // Auto-queue all inventory from Supabase on start
  try {
    console.log("[FB Bot] Auto-queuing inventory from CRM...");
    updateBadge("...", "#FFC107");
    const queueResult = await crmFetch("/api/facebook/auto-queue", { method: "POST" });
    console.log(`[FB Bot] Auto-queue result: ${queueResult.queued} queued, ${queueResult.skipped} skipped`);
  } catch (err) {
    console.error("[FB Bot] Auto-queue failed:", err);
    await setState({ lastError: "Auto-queue failed: " + err.message });
  }

  // Fire first listing immediately — don't wait for the alarm
  console.log("[FB Bot] Triggering first listing immediately...");
  await handleListingPoll();

  chrome.alarms.create(ALARM_LISTING_POLL, { periodInMinutes: 1 });
  chrome.alarms.create(ALARM_REPLY_POLL, { periodInMinutes: 0.17 }); // ~10 seconds
  chrome.alarms.create(ALARM_INBOX_POLL, { periodInMinutes: 5 });
  updateBadge("ON", "#4CAF50");
  console.log("[FB Bot] Polling started.");
}

async function stopPolling() {
  chrome.alarms.clearAll();
  updateBadge("OFF", "#9E9E9E");
  console.log("[FB Bot] Polling stopped.");
}

// ── Listing poll handler ──

async function handleListingPoll() {
  if (isQuietHours()) {
    console.log("[FB Bot] Quiet hours — skipping listing poll.");
    return;
  }

  const postsToday = await getPostsToday();
  if (postsToday >= CONFIG.MAX_LISTINGS_PER_DAY) {
    console.log(`[FB Bot] Daily limit reached (${postsToday}/${CONFIG.MAX_LISTINGS_PER_DAY}).`);
    return;
  }

  const state = await getState();
  const lastPost = state.lastPostTime || 0;
  const elapsed = Date.now() - lastPost;
  const minGap = CONFIG.MIN_POSTING_INTERVAL_MIN * 60 * 1000;
  if (elapsed < minGap) {
    console.log(`[FB Bot] Too soon since last post. Wait ${Math.ceil((minGap - elapsed) / 60000)} min.`);
    return;
  }

  try {
    console.log("[FB Bot] Fetching next listing job from CRM...");
    const result = await getNextListingJob();
    console.log("[FB Bot] API response:", JSON.stringify(result).slice(0, 300));

    if (!result.job) {
      console.log(`[FB Bot] No listing job: ${result.reason}`);
      await setState({ lastError: result.reason || "No jobs available" });
      return;
    }

    console.log(`[FB Bot] Got listing job: ${result.job.vehicle_year} ${result.job.vehicle_make} ${result.job.vehicle_model} (${result.job.id})`);
    console.log(`[FB Bot] Description: ${(result.job.description || "NONE").slice(0, 100)}...`);
    console.log(`[FB Bot] Images: ${(result.job.image_urls || []).length} photos`);

    // Store the current job for the content script to pick up
    await setState({ currentJob: result.job });

    // Open the Facebook Marketplace create vehicle page
    console.log("[FB Bot] Opening Marketplace create page...");
    chrome.tabs.create({
      url: "https://www.facebook.com/marketplace/create/vehicle",
      active: false,
    });
  } catch (err) {
    console.error("[FB Bot] Listing poll error:", err);
    console.error("[FB Bot] Error details:", err.message, err.stack);
    await setState({ lastError: "Listing poll: " + err.message });
  }
}

// ── Reply poll handler ──

async function handleReplyPoll() {
  try {
    const result = await getPendingReplies();
    if (!result.replies || result.replies.length === 0) return;

    for (const reply of result.replies) {
      console.log(`[FB Bot] Pending reply for conversation ${reply.fb_conversation_id}`);

      // Store reply for the inbox content script
      const pendingReplies = (await getStoredReplies()) || [];
      pendingReplies.push(reply);
      await setState({ pendingReplies });

      // Open the conversation in Facebook Messages if not already open
      const conversationUrl = `https://www.facebook.com/messages/t/${reply.fb_conversation_id}`;

      const tabs = await chrome.tabs.query({ url: "https://www.facebook.com/messages/*" });
      const existingTab = tabs.find((t) => t.url && t.url.includes(reply.fb_conversation_id));

      if (!existingTab) {
        chrome.tabs.create({ url: conversationUrl, active: false });
      }
    }
  } catch (err) {
    console.error("[FB Bot] Reply poll error:", err);
  }
}

async function getStoredReplies() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["pendingReplies"], (result) => {
      resolve(result.pendingReplies || []);
    });
  });
}

// ── Inbox poll handler ──

async function handleInboxPoll() {
  // Send a message to any open Facebook messages tab to trigger a scan
  const tabs = await chrome.tabs.query({ url: "https://www.facebook.com/messages/*" });

  if (tabs.length === 0) {
    // Open Facebook messages to scan
    chrome.tabs.create({
      url: "https://www.facebook.com/messages/",
      active: false,
    });
  } else {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: "scan_inbox" }).catch(() => {});
      }
    }
  }
}

// ── Message handler from content scripts ──

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.action) {
      case "listing_posted": {
        const count = await incrementPostCount();
        console.log(`[FB Bot] Listing posted. Total today: ${count}`);
        updateBadge(String(count), "#4CAF50");
        await reportListingPosted(message.data);

        // Close the posting tab after a delay
        if (sender.tab?.id) {
          setTimeout(() => {
            chrome.tabs.remove(sender.tab.id).catch(() => {});
          }, 5000);
        }
        sendResponse({ ok: true });
        break;
      }

      case "listing_failed": {
        console.error("[FB Bot] Listing failed:", message.data);
        await reportListingPosted({ ...message.data, success: false });
        if (sender.tab?.id) {
          setTimeout(() => {
            chrome.tabs.remove(sender.tab.id).catch(() => {});
          }, 5000);
        }
        sendResponse({ ok: true });
        break;
      }

      case "new_message": {
        console.log("[FB Bot] New message from buyer:", message.data);
        const result = await sendNewMessage(message.data);
        sendResponse(result);
        break;
      }

      case "reply_sent": {
        console.log("[FB Bot] Reply sent:", message.data);
        await confirmReplySent(message.data);

        // Remove from pending replies
        const replies = await getStoredReplies();
        const updated = replies.filter((r) => r.message_id !== message.data.message_id);
        await setState({ pendingReplies: updated });
        sendResponse({ ok: true });
        break;
      }

      case "facebook_warning": {
        console.error("[FB Bot] FACEBOOK WARNING DETECTED:", message.data);
        await sendAlert({
          alert_type: message.data.type || "warning_popup",
          message: message.data.message || "Facebook warning detected",
          listing_id: message.data.listing_id || null,
        });
        // Stop all activity immediately
        await setState({ enabled: false });
        await stopPolling();
        updateBadge("!", "#F44336");
        sendResponse({ ok: true });
        break;
      }

      case "get_current_job": {
        const state = await getState();
        sendResponse({ job: state.currentJob || null });
        break;
      }

      case "get_pending_replies": {
        const pendingReplies = await getStoredReplies();
        sendResponse({ replies: pendingReplies });
        break;
      }

      case "toggle_enabled": {
        const currentState = await getState();
        const newEnabled = !currentState.enabled;
        await setState({ enabled: newEnabled });
        if (newEnabled) {
          await startPolling();
        } else {
          await stopPolling();
        }
        sendResponse({ enabled: newEnabled });
        break;
      }

      case "get_status": {
        const st = await getState();
        const posts = await getPostsToday();
        sendResponse({
          enabled: st.enabled || false,
          postsToday: posts,
          maxDaily: CONFIG.MAX_LISTINGS_PER_DAY,
          lastError: st.lastError || null,
          isQuietHours: isQuietHours(),
        });
        break;
      }

      default:
        sendResponse({ error: "Unknown action" });
    }
  })();

  // Return true to indicate async sendResponse
  return true;
});
