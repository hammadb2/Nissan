/**
 * Background service worker — orchestrates all automation.
 *
 * Responsibilities:
 * 1. IP geolocation check on startup and every 30 minutes
 * 2. Polls CRM for next listing job, opens Marketplace create page
 * 3. Polls CRM for pending AI replies, dispatches to inbox tab
 * 4. Triggers inbox monitoring on schedule
 * 5. Enforces pacing rules, quiet hours, and preferred posting windows
 * 6. Manages reply queue during quiet hours (9PM-8AM)
 */

importScripts("config.js", "utils.js");

const ALARM_LISTING_POLL = "fb-listing-poll";
const ALARM_REPLY_POLL = "fb-reply-poll";
const ALARM_INBOX_POLL = "fb-inbox-poll";
const ALARM_IP_CHECK = "fb-ip-check";
const ALARM_REPLY_FLUSH = "fb-reply-flush";

// ── Lifecycle ──

chrome.runtime.onInstalled.addListener(() => {
  setState({ enabled: false, stats: { date: "", postsToday: 0 } });
  extensionLog("info", "Extension installed. Enable via popup.");
  console.log("[FB Bot] Extension installed. Enable via popup.");
});

// ── Alarm-based polling ──

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const state = await getState();

  switch (alarm.name) {
    case ALARM_IP_CHECK:
      await runIpCheck();
      break;
    case ALARM_REPLY_FLUSH:
      await flushQueuedReplies();
      break;
  }

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

async function runIpCheck() {
  const result = await checkIpLocation();
  if (!result.allowed) {
    console.error("[FB Bot] IP CHECK FAILED:", result.reason);
    extensionLog("error", `IP check failed: ${result.reason}`);
    await sendAlert({
      warning_text: `Non-Canadian IP detected: ${result.country}`,
      reason: "non-canadian-ip",
      timestamp: new Date().toISOString(),
    });
    await setState({ enabled: false, lastWarning: { text: `Non-Canadian IP: ${result.country}`, timestamp: Date.now() } });
    await stopPolling();
    updateBadge("IP!", "#F44336");
  } else {
    console.log("[FB Bot] IP check passed:", result.country);
  }
}

async function startPolling() {
  // IP check first — do not proceed if non-Canadian
  const ipResult = await checkIpLocation();
  if (!ipResult.allowed) {
    console.error("[FB Bot] Cannot start — non-Canadian IP:", ipResult.reason);
    extensionLog("error", `Startup blocked: ${ipResult.reason}`);
    await sendAlert({
      warning_text: `Non-Canadian IP detected on startup: ${ipResult.country}`,
      reason: "non-canadian-ip",
      timestamp: new Date().toISOString(),
    });
    await setState({ enabled: false, lastWarning: { text: `Non-Canadian IP: ${ipResult.country}`, timestamp: Date.now() } });
    updateBadge("IP!", "#F44336");
    return;
  }

  // Auto-queue all inventory from Supabase on start
  try {
    console.log("[FB Bot] Auto-queuing inventory from CRM...");
    updateBadge("...", "#FFC107");
    const queueResult = await crmFetch("/api/facebook/auto-queue", { method: "POST" });
    console.log(`[FB Bot] Auto-queue result: ${queueResult.queued} queued, ${queueResult.skipped} skipped`);
    extensionLog("info", `Auto-queue: ${queueResult.queued} queued, ${queueResult.skipped} skipped`);
  } catch (err) {
    console.error("[FB Bot] Auto-queue failed:", err);
    await setState({ lastError: "Auto-queue failed: " + err.message });
    extensionLog("warning", "Auto-queue failed: " + err.message);
  }

  // Fire first listing immediately — don't wait for the alarm
  console.log("[FB Bot] Triggering first listing immediately...");
  await handleListingPoll();

  chrome.alarms.create(ALARM_LISTING_POLL, { periodInMinutes: 1 });
  chrome.alarms.create(ALARM_REPLY_POLL, { periodInMinutes: 0.17 }); // ~10 seconds
  chrome.alarms.create(ALARM_INBOX_POLL, { periodInMinutes: 5 });
  chrome.alarms.create(ALARM_IP_CHECK, { periodInMinutes: 30 });
  chrome.alarms.create(ALARM_REPLY_FLUSH, { periodInMinutes: 1 }); // check every minute for 8AM flush
  updateBadge("ON", "#4CAF50");
  extensionLog("info", "Polling started.");
  console.log("[FB Bot] Polling started.");
}

async function stopPolling() {
  chrome.alarms.clearAll();
  updateBadge("OFF", "#9E9E9E");
  extensionLog("info", "Polling stopped.");
  console.log("[FB Bot] Polling stopped.");
}

// ── Listing poll handler ──

async function handleListingPoll() {
  if (isPostingQuietHours()) {
    console.log("[FB Bot] Posting quiet hours — skipping listing poll.");
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

  // Preferred posting window: Sun/Mon 5-8 PM. Delay non-urgent jobs if outside window.
  if (!isPreferredPostingWindow() && postsToday === 0) {
    // If no posts yet today and outside preferred window, wait for preferred window
    // unless it's past 8 PM on best days or it's a non-preferred day past noon
    const hour = getCalgaryHour();
    const day = getCalgaryDay();
    const bestDays = CONFIG.BEST_POSTING_DAYS || [0, 1];
    if (bestDays.includes(day) && hour < 17) {
      console.log("[FB Bot] Preferred posting window not yet open. Waiting for 5 PM Calgary.");
      return;
    }
  }

  // One tab limit: check if a Marketplace create tab is already open
  try {
    const tabs = await chrome.tabs.query({ url: "https://www.facebook.com/marketplace/create/*" });
    if (tabs.length > 0) {
      console.log("[FB Bot] Marketplace create tab already open. Waiting for it to close.");
      return;
    }
  } catch (err) {
    console.warn("[FB Bot] Tab query failed:", err);
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
    extensionLog("info", `Posting: ${result.job.vehicle_year} ${result.job.vehicle_make} ${result.job.vehicle_model}`);

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
    extensionLog("error", "Listing poll error: " + err.message);
    await setState({ lastError: "Listing poll: " + err.message });
  }
}

// ── Reply poll handler ──

async function handleReplyPoll() {
  // Check reply-specific quiet hours (9 PM - 8 AM)
  if (isReplyQuietHours()) {
    console.log("[FB Bot] Reply quiet hours — queuing replies for 8 AM.");
    try {
      const result = await getPendingReplies();
      if (result.replies && result.replies.length > 0) {
        // Queue replies for later
        const state = await getState();
        const queuedReplies = state.queuedReplies || [];
        for (const reply of result.replies) {
          const already = queuedReplies.find(
            (r) => r.message_id === reply.message_id
          );
          if (!already) {
            queuedReplies.push(reply);
          }
        }
        await setState({ queuedReplies });
        console.log(`[FB Bot] Queued ${result.replies.length} replies for 8 AM send.`);
      }
    } catch (err) {
      console.error("[FB Bot] Reply queue error:", err);
    }
    return;
  }

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
    extensionLog("error", "Reply poll error: " + err.message);
  }
}

async function flushQueuedReplies() {
  const hour = getCalgaryHour();
  if (hour !== 8) return; // Only flush at 8 AM Calgary

  const state = await getState();
  if (!state.enabled) return;

  const queuedReplies = state.queuedReplies || [];
  if (queuedReplies.length === 0) return;

  console.log(`[FB Bot] Flushing ${queuedReplies.length} queued replies at 8 AM...`);
  extensionLog("info", `Flushing ${queuedReplies.length} queued replies.`);

  for (const reply of queuedReplies) {
    const pendingReplies = (await getStoredReplies()) || [];
    pendingReplies.push(reply);
    await setState({ pendingReplies });

    const conversationUrl = `https://www.facebook.com/messages/t/${reply.fb_conversation_id}`;
    const tabs = await chrome.tabs.query({ url: "https://www.facebook.com/messages/*" });
    const existingTab = tabs.find((t) => t.url && t.url.includes(reply.fb_conversation_id));
    if (!existingTab) {
      chrome.tabs.create({ url: conversationUrl, active: false });
    }

    await sleep(2000); // Small delay between opening tabs
  }

  await setState({ queuedReplies: [] });
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
  // Check with backend whether we should scan
  try {
    const result = await checkInbox();
    if (!result.should_check) {
      console.log("[FB Bot] Inbox check not needed yet.");
      return;
    }
  } catch (err) {
    console.warn("[FB Bot] Inbox check API failed, scanning anyway:", err);
  }

  const tabs = await chrome.tabs.query({ url: "https://www.facebook.com/messages/*" });

  if (tabs.length === 0) {
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
        extensionLog("info", `Listing posted successfully. Count: ${count}/${CONFIG.MAX_LISTINGS_PER_DAY}`);

        const desc = message.data.fb_listing_url
          ? `Posted ${message.data.fb_listing_url}`
          : `Posted listing ${message.data.listing_id}`;
        await setState({ lastAction: { description: desc, timestamp: Date.now() } });

        // Schedule shadow ban check after 10 minutes
        if (message.data.fb_listing_url) {
          setTimeout(async () => {
            try {
              await runShadowBanCheck(message.data.fb_listing_url, message.data.listing_id);
            } catch (err) {
              console.error("[FB Bot] Shadow ban check error:", err);
              extensionLog("error", "Shadow ban check error: " + err.message);
            }
          }, CONFIG.SHADOW_BAN_CHECK_DELAY_MS || 10 * 60 * 1000);
        }

        // Close the posting tab after a delay
        if (sender.tab?.id) {
          setTimeout(() => {
            chrome.tabs.remove(sender.tab.id).catch(() => {});
          }, 5000);
        }

        // Schedule randomized wait before next post (15-30 min)
        const waitMs = getRandomPostingDelay();
        console.log(`[FB Bot] Next post in ${Math.round(waitMs / 60000)} minutes.`);
        await setState({ lastPostTime: Date.now(), nextPostAfter: Date.now() + waitMs });

        sendResponse({ ok: true });
        break;
      }

      case "listing_failed": {
        console.error("[FB Bot] Listing failed:", message.data);
        await reportListingFailed(message.data);
        extensionLog("error", `Listing failed: ${message.data.error || message.data.error_message}`);
        await setState({
          lastAction: { description: `Listing failed: ${message.data.error || message.data.error_message}`, timestamp: Date.now() },
        });
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
        await incrementMessagesReceived();
        extensionLog("info", `New message from ${message.data.buyer_name || "unknown"}`);
        await setState({
          lastAction: { description: `Received message from ${message.data.buyer_name || "buyer"}`, timestamp: Date.now() },
        });
        sendResponse(result);
        break;
      }

      case "reply_sent": {
        console.log("[FB Bot] Reply sent:", message.data);
        await confirmReplySent(message.data);
        await incrementRepliesSent();
        extensionLog("info", `Reply sent for message ${message.data.message_id}`);
        await setState({
          lastAction: { description: "Sent AI reply to buyer", timestamp: Date.now() },
        });

        // Remove from pending replies
        const replies = await getStoredReplies();
        const updated = replies.filter((r) => r.message_id !== message.data.message_id);
        await setState({ pendingReplies: updated });
        sendResponse({ ok: true });
        break;
      }

      case "reply_failed": {
        console.error("[FB Bot] Reply failed:", message.data);
        await reportReplyFailed(message.data);
        extensionLog("error", `Reply failed: ${message.data.error_message}`);
        sendResponse({ ok: true });
        break;
      }

      case "facebook_warning": {
        console.error("[FB Bot] FACEBOOK WARNING DETECTED:", message.data);
        await sendAlert({
          warning_text: message.data.message || "Facebook warning detected",
          reason: message.data.type || "warning_popup",
          timestamp: new Date().toISOString(),
        });
        extensionLog("error", `WARNING: ${message.data.message}`);
        await setState({
          enabled: false,
          lastWarning: { text: message.data.message, timestamp: Date.now() },
          lastAction: { description: `Warning: ${message.data.message}`, timestamp: Date.now() },
        });
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
          // Report manual pause
          await sendAlert({
            warning_text: "Manual pause from extension popup",
            reason: "manual-pause",
            timestamp: new Date().toISOString(),
          });
        }
        sendResponse({ enabled: newEnabled });
        break;
      }

      case "get_status": {
        const st = await getState();
        const posts = await getPostsToday();
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
        sendResponse({
          enabled: st.enabled || false,
          postsToday: posts,
          maxDaily: CONFIG.MAX_LISTINGS_PER_DAY,
          lastError: st.lastError || null,
          isQuietHours: isPostingQuietHours(),
          isReplyQuietHours: isReplyQuietHours(),
          messagesReceived: (st.messageStats?.date === today ? st.messageStats.received : 0) || 0,
          repliesSent: (st.replyStats?.date === today ? st.replyStats.sent : 0) || 0,
          lastAction: st.lastAction || null,
          lastWarning: st.lastWarning || null,
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

// ── Shadow ban check using incognito window ──

async function runShadowBanCheck(fbListingUrl, listingId) {
  console.log("[FB Bot] Running shadow ban check for:", fbListingUrl);
  extensionLog("info", `Shadow ban check: ${fbListingUrl}`);

  try {
    // Open incognito window
    const win = await chrome.windows.create({
      url: fbListingUrl,
      incognito: true,
      focused: false,
      width: 800,
      height: 600,
    });

    // Wait for page to load
    await sleep(10000);

    // Get the tab in the incognito window
    const tabs = await chrome.tabs.query({ windowId: win.id });
    if (tabs.length === 0) {
      await chrome.windows.remove(win.id);
      return;
    }

    const tab = tabs[0];

    // Inject a script to check page content
    let result = { hidden: false };
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
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
        },
      });
      if (results && results[0]) {
        result = results[0].result;
      }
    } catch (scriptErr) {
      console.warn("[FB Bot] Shadow ban script injection failed:", scriptErr);
    }

    // Close the incognito window
    await chrome.windows.remove(win.id);

    // Report result
    const checkResult = result.hidden ? "hidden" : "visible";
    await reportShadowBanCheck({
      listing_id: listingId,
      result: checkResult,
      checked_at: new Date().toISOString(),
    });

    if (result.hidden) {
      console.error("[FB Bot] SHADOW BAN DETECTED for listing:", listingId);
      extensionLog("error", `Shadow ban detected: ${fbListingUrl}`);
      await setState({
        enabled: false,
        lastWarning: { text: "Shadow ban detected — posting stopped", timestamp: Date.now() },
      });
      await stopPolling();
      updateBadge("BAN", "#F44336");
    } else {
      console.log("[FB Bot] Shadow ban check passed — listing is visible.");
    }
  } catch (err) {
    console.error("[FB Bot] Shadow ban check error:", err);
    extensionLog("error", "Shadow ban check error: " + err.message);
  }
}
