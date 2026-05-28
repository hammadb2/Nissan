/**
 * Content script for facebook.com/marketplace/create/vehicle
 *
 * Fills in every field from the CRM listing data, uploads photos,
 * and publishes the listing with human-like delays.
 */

(async function () {
  "use strict";

  const DELAY_MIN = 2000;
  const DELAY_MAX = 5000;
  const KEYSTROKE_MIN = 30;
  const KEYSTROKE_MAX = 120;
  const PAGE_LOAD_WAIT = 4000;

  function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function randomDelay() {
    await sleep(randomBetween(DELAY_MIN, DELAY_MAX));
  }

  async function typeHuman(element, text) {
    element.focus();
    element.value = "";
    element.dispatchEvent(new Event("focus", { bubbles: true }));

    for (const char of text) {
      element.value += char;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
      element.dispatchEvent(new KeyboardEvent("keypress", { key: char, bubbles: true }));
      element.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
      await sleep(randomBetween(KEYSTROKE_MIN, KEYSTROKE_MAX));
    }

    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  async function setReactInput(element, value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, "value"
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findInputByLabel(labelText) {
    const labels = document.querySelectorAll("label, span, div");
    for (const label of labels) {
      if (label.textContent?.trim().toLowerCase().includes(labelText.toLowerCase())) {
        const parent = label.closest("[role='group']") || label.parentElement;
        if (parent) {
          const input = parent.querySelector("input, textarea, select");
          if (input) return input;
        }

        const next = label.nextElementSibling;
        if (next) {
          const input = next.querySelector("input, textarea, select") || next;
          if (input.tagName === "INPUT" || input.tagName === "TEXTAREA") return input;
        }
      }
    }
    return null;
  }

  function findDropdownOption(text) {
    const options = document.querySelectorAll("[role='option'], [role='menuitem'], li");
    for (const opt of options) {
      if (opt.textContent?.trim().toLowerCase() === text.toLowerCase()) {
        return opt;
      }
    }
    return null;
  }

  async function selectDropdownValue(labelText, value) {
    const trigger = findInputByLabel(labelText);
    if (!trigger) {
      console.warn(`[FB Poster] Could not find dropdown for: ${labelText}`);
      return false;
    }

    trigger.click();
    await randomDelay();

    const option = findDropdownOption(value);
    if (option) {
      option.click();
      await sleep(500);
      return true;
    }

    console.warn(`[FB Poster] Could not find option "${value}" in ${labelText}`);
    return false;
  }

  function checkForWarnings() {
    const warningSelectors = [
      "[role='dialog']",
      "[aria-label*='warning']",
      "[aria-label*='restriction']",
      "[aria-label*='blocked']",
    ];

    for (const selector of warningSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.textContent?.toLowerCase() || "";
        if (
          text.includes("restrict") ||
          text.includes("warning") ||
          text.includes("ban") ||
          text.includes("violat") ||
          text.includes("community standards") ||
          text.includes("temporarily blocked")
        ) {
          return { detected: true, message: el.textContent?.slice(0, 200) || "Warning detected" };
        }
      }
    }
    return { detected: false };
  }

  async function uploadPhotos(imageUrls) {
    const fileInput = document.querySelector("input[type='file'][accept*='image']");
    if (!fileInput) {
      console.warn("[FB Poster] Could not find file input for photos.");
      return false;
    }

    // Use watermark stripping utility if available
    let files;
    if (typeof globalThis.processImagesForUpload === "function") {
      console.log("[FB Poster] Processing images with watermark stripping...");
      files = await globalThis.processImagesForUpload(imageUrls);
    } else {
      files = [];
      for (const url of imageUrls) {
        try {
          const response = await fetch(url);
          const blob = await response.blob();
          const filename = url.split("/").pop() || `photo_${Date.now()}.jpg`;
          files.push(new File([blob], filename, { type: blob.type || "image/jpeg" }));
        } catch (err) {
          console.warn(`[FB Poster] Failed to fetch image: ${url}`, err);
        }
      }
    }

    if (files.length === 0) return false;

    const dt = new DataTransfer();
    for (const file of files) {
      dt.items.add(file);
    }
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));

    await sleep(3000);
    return true;
  }

  // ── Main flow ──

  console.log("[FB Poster] Content script loaded on Marketplace create page.");

  await sleep(PAGE_LOAD_WAIT);

  // Check for any warnings before starting
  const preCheck = checkForWarnings();
  if (preCheck.detected) {
    chrome.runtime.sendMessage({
      action: "facebook_warning",
      data: { type: "warning_popup", message: preCheck.message },
    });
    return;
  }

  // Get the current job from background
  const response = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "get_current_job" }, resolve);
  });

  const job = response?.job;
  if (!job) {
    console.log("[FB Poster] No job available. Closing tab.");
    return;
  }

  console.log("[FB Poster] Starting listing:", job.id);

  try {
    // Category is already "Vehicles" since we navigated to /marketplace/create/vehicle
    await randomDelay();

    // Condition: Used
    await selectDropdownValue("condition", "Used");
    await randomDelay();

    // Year
    const yearInput = findInputByLabel("year");
    if (yearInput) {
      await typeHuman(yearInput, String(job.vehicle_year));
      await randomDelay();
    }

    // Make
    const makeInput = findInputByLabel("make");
    if (makeInput) {
      await typeHuman(makeInput, job.vehicle_make);
      await sleep(1500);
      const makeOption = findDropdownOption(job.vehicle_make);
      if (makeOption) {
        makeOption.click();
        await randomDelay();
      }
    }

    // Model
    const modelInput = findInputByLabel("model");
    if (modelInput) {
      await typeHuman(modelInput, job.vehicle_model);
      await sleep(1500);
      const modelOption = findDropdownOption(job.vehicle_model);
      if (modelOption) {
        modelOption.click();
        await randomDelay();
      }
    }

    // Trim
    if (job.vehicle_trim) {
      const trimInput = findInputByLabel("trim");
      if (trimInput) {
        await typeHuman(trimInput, job.vehicle_trim);
        await randomDelay();
      }
    }

    // Price
    if (job.price) {
      const priceInput = findInputByLabel("price");
      if (priceInput) {
        await setReactInput(priceInput, String(Math.round(Number(job.price))));
        await randomDelay();
      }
    }

    // Mileage
    if (job.mileage) {
      const mileageInput = findInputByLabel("mileage") || findInputByLabel("odometer");
      if (mileageInput) {
        await typeHuman(mileageInput, String(job.mileage));
        await randomDelay();
      }
    }

    // Transmission
    if (job.transmission) {
      await selectDropdownValue("transmission", job.transmission);
      await randomDelay();
    }

    // Fuel Type
    if (job.fuel_type) {
      await selectDropdownValue("fuel type", job.fuel_type);
      await randomDelay();
    }

    // Colour
    if (job.colour) {
      await selectDropdownValue("exterior colo", job.colour);
      await randomDelay();
    }

    // Description
    if (job.description) {
      const descInput = findInputByLabel("description") ||
                        document.querySelector("textarea[name*='description']") ||
                        document.querySelector("textarea");
      if (descInput) {
        await typeHuman(descInput, job.description);
        await randomDelay();
      }
    }

    // Photos
    if (job.image_urls && job.image_urls.length > 0) {
      await uploadPhotos(job.image_urls);
      await sleep(5000);
    }

    // Check for warnings again before publishing
    const postCheck = checkForWarnings();
    if (postCheck.detected) {
      chrome.runtime.sendMessage({
        action: "facebook_warning",
        data: {
          type: "warning_popup",
          message: postCheck.message,
          listing_id: job.id,
        },
      });
      return;
    }

    // Find and click Publish/Next button
    await randomDelay();
    const publishBtn = [...document.querySelectorAll("div[role='button'], button")]
      .find((btn) => {
        const text = btn.textContent?.trim().toLowerCase() || "";
        return text === "publish" || text === "next" || text === "post";
      });

    if (publishBtn) {
      publishBtn.click();
      await sleep(5000);

      // Check for success or errors
      const finalCheck = checkForWarnings();
      if (finalCheck.detected) {
        chrome.runtime.sendMessage({
          action: "facebook_warning",
          data: {
            type: "warning_popup",
            message: finalCheck.message,
            listing_id: job.id,
          },
        });
        return;
      }

      // Try to extract the Facebook listing URL from the current page
      let fbListingUrl = null;
      let fbListingId = null;
      const currentUrl = window.location.href;
      const urlMatch = currentUrl.match(/\/marketplace\/item\/(\d+)/);
      if (urlMatch) {
        fbListingId = urlMatch[1];
        fbListingUrl = `https://www.facebook.com/marketplace/item/${fbListingId}`;
      }

      chrome.runtime.sendMessage({
        action: "listing_posted",
        data: {
          listing_id: job.id,
          fb_listing_id: fbListingId,
          fb_listing_url: fbListingUrl,
          success: true,
        },
      });

      // Schedule shadow ban check if available
      if (fbListingUrl && typeof globalThis.scheduleShadowBanCheck === "function") {
        globalThis.scheduleShadowBanCheck(fbListingUrl, job.id);
      }

      console.log("[FB Poster] Listing published successfully:", job.id);
    } else {
      throw new Error("Could not find Publish button");
    }
  } catch (err) {
    console.error("[FB Poster] Error posting listing:", err);
    chrome.runtime.sendMessage({
      action: "listing_failed",
      data: {
        listing_id: job.id,
        success: false,
        error: err.message || "Unknown error during posting",
      },
    });
  }
})();
