document.addEventListener("DOMContentLoaded", () => {
  const statusText = document.getElementById("statusText");
  const postsToday = document.getElementById("postsToday");
  const messagesReceived = document.getElementById("messagesReceived");
  const repliesSent = document.getElementById("repliesSent");
  const quietHours = document.getElementById("quietHours");
  const lastAction = document.getElementById("lastAction");
  const lastWarning = document.getElementById("lastWarning");
  const lastWarningContainer = document.getElementById("lastWarningContainer");
  const toggleBtn = document.getElementById("toggleBtn");
  const errorContainer = document.getElementById("errorContainer");
  const crmUrlInput = document.getElementById("crmUrl");
  const saveBtn = document.getElementById("saveBtn");

  function timeAgo(timestamp) {
    if (!timestamp) return "";
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  function updateUI(status) {
    if (status.enabled) {
      statusText.textContent = "Running";
      statusText.className = "status-value green";
      toggleBtn.textContent = "Pause All Activity";
      toggleBtn.className = "toggle-btn stop";
    } else {
      statusText.textContent = "Paused";
      statusText.className = "status-value red";
      toggleBtn.textContent = "Start Bot";
      toggleBtn.className = "toggle-btn start";
    }

    postsToday.textContent = `${status.postsToday} / ${status.maxDaily}`;
    postsToday.className = `status-value ${status.postsToday >= status.maxDaily ? "red" : "green"}`;

    messagesReceived.textContent = String(status.messagesReceived || 0);
    repliesSent.textContent = String(status.repliesSent || 0);

    if (status.isQuietHours) {
      quietHours.textContent = "Active (no posting)";
      quietHours.className = "status-value yellow";
    } else if (status.isReplyQuietHours) {
      quietHours.textContent = "Replies paused (9PM-8AM)";
      quietHours.className = "status-value yellow";
    } else {
      quietHours.textContent = "Inactive";
      quietHours.className = "status-value green";
    }

    if (status.lastAction) {
      const ago = timeAgo(status.lastAction.timestamp);
      lastAction.textContent = `${status.lastAction.description} — ${ago}`;
    } else {
      lastAction.textContent = "--";
    }

    if (status.lastWarning && status.lastWarning.text) {
      lastWarningContainer.style.display = "block";
      const ago = timeAgo(status.lastWarning.timestamp);
      lastWarning.textContent = `${status.lastWarning.text} — ${ago}`;
    } else {
      lastWarningContainer.style.display = "none";
    }

    if (status.lastError) {
      errorContainer.innerHTML = `<div class="error-msg">Last error: ${status.lastError}</div>`;
    } else {
      errorContainer.innerHTML = "";
    }
  }

  function loadStatus() {
    chrome.runtime.sendMessage({ action: "get_status" }, (response) => {
      if (response) updateUI(response);
    });
  }

  // Load saved CRM URL, default to production URL
  const DEFAULT_CRM_URL = "https://hammadatnissan.vercel.app";
  chrome.storage.local.get(["crmBaseUrl"], (result) => {
    const saved = result.crmBaseUrl;
    if (!saved || saved.includes("nissan-eight") || saved.includes("your-")) {
      crmUrlInput.value = DEFAULT_CRM_URL;
      chrome.storage.local.set({ crmBaseUrl: DEFAULT_CRM_URL });
    } else {
      crmUrlInput.value = saved;
    }
  });

  toggleBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "toggle_enabled" }, (response) => {
      if (response) loadStatus();
    });
  });

  saveBtn.addEventListener("click", () => {
    const url = crmUrlInput.value.trim().replace(/\/$/, "");
    chrome.storage.local.set({ crmBaseUrl: url }, () => {
      saveBtn.textContent = "Saved!";
      setTimeout(() => {
        saveBtn.textContent = "Save Settings";
      }, 1500);
    });
  });

  loadStatus();
  setInterval(loadStatus, 5000);
});
