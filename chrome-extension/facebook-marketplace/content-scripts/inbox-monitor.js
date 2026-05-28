/**
 * Content script for facebook.com/messages
 *
 * Part 2: Monitors inbox for new buyer messages, sends to CRM.
 * Part 3: Injects AI replies with human-like typing.
 */

(async function () {
  "use strict";

  const KEYSTROKE_MIN = 80;
  const KEYSTROKE_MAX = 150;
  const ACTION_DELAY_MIN = 2000;
  const ACTION_DELAY_MAX = 5000;

  function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function randomDelay() {
    await sleep(randomBetween(ACTION_DELAY_MIN, ACTION_DELAY_MAX));
  }

  // ── Inbox Scanning ──

  function extractConversationId() {
    const url = window.location.href;
    const match = url.match(/\/messages\/t\/([^/?]+)/);
    return match ? match[1] : null;
  }

  function extractBuyerName() {
    const nameEl = document.querySelector(
      "div[data-testid='mwthreadlist-item-open'] span, " +
      "h2 span, " +
      "[role='heading'] span"
    );
    return nameEl?.textContent?.trim() || null;
  }

  function extractMessages() {
    const messages = [];
    const messageRows = document.querySelectorAll(
      "[role='row'], [data-testid='message-container'], div[class*='message']"
    );

    for (const row of messageRows) {
      const textEl = row.querySelector("div[dir='auto'], span[dir='auto']");
      if (!textEl) continue;

      const text = textEl.textContent?.trim();
      if (!text) continue;

      const isOutbound = row.querySelector("[class*='outgoing'], [class*='sent']") !== null ||
        row.getAttribute("class")?.includes("outgoing") || false;

      messages.push({
        text,
        direction: isOutbound ? "outbound" : "inbound",
        element: row,
      });
    }

    return messages;
  }

  function extractListingInfo() {
    const listingEls = document.querySelectorAll(
      "a[href*='/marketplace/item/'], [data-testid='marketplace_pdp_component']"
    );

    for (const el of listingEls) {
      const href = el.getAttribute("href") || "";
      const idMatch = href.match(/\/marketplace\/item\/(\d+)/);
      if (idMatch) {
        return {
          listing_fb_id: idMatch[1],
          listing_url: `https://www.facebook.com/marketplace/item/${idMatch[1]}`,
        };
      }
    }

    return null;
  }

  function extractBuyerProfileUrl() {
    const profileLinks = document.querySelectorAll(
      "a[href*='facebook.com/profile'], a[href*='facebook.com/people']"
    );
    for (const link of profileLinks) {
      return link.getAttribute("href");
    }
    return null;
  }

  async function scanForNewMessages() {
    const conversationId = extractConversationId();
    if (!conversationId) return;

    const messages = extractMessages();
    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.direction !== "inbound") return;

    const storageKey = `processed_${conversationId}`;
    const stored = await new Promise((resolve) => {
      chrome.storage.local.get([storageKey], (result) => {
        resolve(result[storageKey] || { lastMessageText: "", count: 0 });
      });
    });

    if (stored.lastMessageText === lastMessage.text) return;

    const buyerName = extractBuyerName();
    const listingInfo = extractListingInfo();
    const profileUrl = extractBuyerProfileUrl();

    chrome.runtime.sendMessage({
      action: "new_message",
      data: {
        fb_conversation_id: conversationId,
        buyer_name: buyerName,
        message: lastMessage.text,
        listing_fb_id: listingInfo?.listing_fb_id || null,
        buyer_profile_url: profileUrl,
      },
    });

    chrome.storage.local.set({
      [storageKey]: {
        lastMessageText: lastMessage.text,
        count: (stored.count || 0) + 1,
        timestamp: Date.now(),
      },
    });

    console.log("[FB Inbox] New message detected and sent to CRM:", lastMessage.text);
  }

  // ── Reply Injection ──

  async function typeHumanIntoReplyBox(text) {
    const replyBox = document.querySelector(
      "div[role='textbox'][contenteditable='true'], " +
      "div[aria-label*='message'][contenteditable='true'], " +
      "div[data-testid='message-input'] div[contenteditable='true']"
    );

    if (!replyBox) {
      console.warn("[FB Inbox] Could not find reply text box.");
      return false;
    }

    replyBox.focus();
    await sleep(500);

    for (const char of text) {
      const inputEvent = new InputEvent("beforeinput", {
        inputType: "insertText",
        data: char,
        bubbles: true,
        cancelable: true,
      });
      replyBox.dispatchEvent(inputEvent);

      document.execCommand("insertText", false, char);

      await sleep(randomBetween(KEYSTROKE_MIN, KEYSTROKE_MAX));
    }

    await sleep(500);
    return true;
  }

  async function clickSendButton() {
    const sendBtn = document.querySelector(
      "div[aria-label='Press enter to send'][role='button'], " +
      "[aria-label='Send'][role='button'], " +
      "div[data-testid='message-send-button']"
    );

    if (!sendBtn) {
      const enterEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
      });
      document.activeElement?.dispatchEvent(enterEvent);
      return true;
    }

    sendBtn.click();
    return true;
  }

  async function injectReply(reply) {
    const conversationId = extractConversationId();
    if (conversationId !== reply.fb_conversation_id) {
      console.log("[FB Inbox] Wrong conversation open. Need:", reply.fb_conversation_id);
      return false;
    }

    console.log("[FB Inbox] Injecting reply:", reply.message);

    await randomDelay();

    const typed = await typeHumanIntoReplyBox(reply.message);
    if (!typed) return false;

    await randomDelay();

    const sent = await clickSendButton();
    if (!sent) return false;

    await sleep(2000);

    chrome.runtime.sendMessage({
      action: "reply_sent",
      data: {
        message_id: reply.message_id,
        fb_message_id: `sent-${Date.now()}`,
      },
    });

    console.log("[FB Inbox] Reply sent successfully for:", reply.message_id);
    return true;
  }

  async function checkAndInjectReplies() {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "get_pending_replies" }, resolve);
    });

    if (!response?.replies || response.replies.length === 0) return;

    const conversationId = extractConversationId();
    const matchingReply = response.replies.find(
      (r) => r.fb_conversation_id === conversationId
    );

    if (matchingReply) {
      await injectReply(matchingReply);
    }
  }

  // ── Warning Detection ──

  function checkForWarnings() {
    const warningTexts = [
      "restrict",
      "warning",
      "ban",
      "violat",
      "community standards",
      "temporarily blocked",
      "suspicious activity",
    ];

    const dialogs = document.querySelectorAll("[role='dialog']");
    for (const dialog of dialogs) {
      const text = dialog.textContent?.toLowerCase() || "";
      for (const warning of warningTexts) {
        if (text.includes(warning)) {
          chrome.runtime.sendMessage({
            action: "facebook_warning",
            data: {
              type: "restriction",
              message: dialog.textContent?.slice(0, 200) || "Warning detected in Messages",
            },
          });
          return true;
        }
      }
    }
    return false;
  }

  // ── Message listener from background ──

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "scan_inbox") {
      scanForNewMessages();
      sendResponse({ ok: true });
    }
    return true;
  });

  // ── Main loop ──

  console.log("[FB Inbox] Content script loaded on Messages page.");

  await sleep(3000);

  if (checkForWarnings()) return;

  await scanForNewMessages();

  await checkAndInjectReplies();

  // Periodic scan every 30 seconds while the tab is open
  setInterval(async () => {
    if (checkForWarnings()) return;
    await scanForNewMessages();
    await checkAndInjectReplies();
  }, 30000);
})();
