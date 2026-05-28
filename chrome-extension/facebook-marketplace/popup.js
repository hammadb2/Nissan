document.addEventListener("DOMContentLoaded", () => {
  const statusText = document.getElementById("statusText");
  const postsToday = document.getElementById("postsToday");
  const quietHours = document.getElementById("quietHours");
  const toggleBtn = document.getElementById("toggleBtn");
  const errorContainer = document.getElementById("errorContainer");
  const crmUrlInput = document.getElementById("crmUrl");
  const saveBtn = document.getElementById("saveBtn");

  function updateUI(status) {
    if (status.enabled) {
      statusText.textContent = "Running";
      statusText.className = "status-value green";
      toggleBtn.textContent = "Stop Bot";
      toggleBtn.className = "toggle-btn stop";
    } else {
      statusText.textContent = "Stopped";
      statusText.className = "status-value red";
      toggleBtn.textContent = "Start Bot";
      toggleBtn.className = "toggle-btn start";
    }

    postsToday.textContent = `${status.postsToday} / ${status.maxDaily}`;
    postsToday.className = `status-value ${status.postsToday >= status.maxDaily ? "red" : "green"}`;

    if (status.isQuietHours) {
      quietHours.textContent = "Active (no posting)";
      quietHours.className = "status-value yellow";
    } else {
      quietHours.textContent = "Inactive";
      quietHours.className = "status-value green";
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
  const DEFAULT_CRM_URL = "https://nissan-eight.vercel.app";
  chrome.storage.local.get(["crmBaseUrl"], (result) => {
    if (result.crmBaseUrl) {
      crmUrlInput.value = result.crmBaseUrl;
    } else {
      crmUrlInput.value = DEFAULT_CRM_URL;
      chrome.storage.local.set({ crmBaseUrl: DEFAULT_CRM_URL });
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
