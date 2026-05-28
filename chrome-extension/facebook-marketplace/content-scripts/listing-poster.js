/**
 * Content script for facebook.com/marketplace/create/vehicle
 *
 * Fills in every field from the CRM listing data, uploads photos,
 * and publishes the listing with human-like delays.
 *
 * Uses setNativeValue to bypass React's virtual DOM (same pattern as
 * the working Kijiji extension).
 */

(async function () {
  "use strict";

  const DELAY_MIN = 2000;
  const DELAY_MAX = 5000;
  const KEYSTROKE_MIN = 30;
  const KEYSTROKE_MAX = 120;
  const PAGE_LOAD_WAIT = 5000;

  function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function randomDelay() {
    await sleep(randomBetween(DELAY_MIN, DELAY_MAX));
  }

  // React-aware value setter — bypasses React's internal state tracking
  function setNativeValue(el, val) {
    const proto = el.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) {
      setter.call(el, val);
    } else {
      el.value = val;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  // Type text character by character with human-like delays
  async function typeHuman(element, text) {
    element.focus();
    element.dispatchEvent(new Event("focus", { bubbles: true }));
    setNativeValue(element, "");
    await sleep(300);

    for (const char of text) {
      const current = element.value || "";
      setNativeValue(element, current + char);
      element.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
      element.dispatchEvent(new KeyboardEvent("keypress", { key: char, bubbles: true }));
      element.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
      await sleep(randomBetween(KEYSTROKE_MIN, KEYSTROKE_MAX));
    }

    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  // Promisified sendMessage
  function msg(data) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(data, (resp) => resolve(resp));
    });
  }

  // Wait for the Facebook form to be ready
  async function waitForForm(timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      // Facebook's vehicle form has aria-label attributes on inputs
      const allInputs = document.querySelectorAll("input, textarea");
      const labels = document.querySelectorAll("label span, label");
      // Look for key form elements
      const hasYear = findFormField("year");
      const hasMake = findFormField("make");
      if (hasYear || hasMake || allInputs.length >= 3) {
        console.log(`[FB Poster] Form detected: ${allInputs.length} inputs, ${labels.length} labels`);
        return true;
      }
      await sleep(500);
    }
    return false;
  }

  // Find a form field by scanning labels, aria-labels, and placeholder text
  function findFormField(fieldName) {
    const lower = fieldName.toLowerCase();

    // Strategy 1: aria-label on input
    const ariaInputs = document.querySelectorAll(`input[aria-label], textarea[aria-label]`);
    for (const el of ariaInputs) {
      const label = (el.getAttribute("aria-label") || "").toLowerCase();
      if (label.includes(lower)) return el;
    }

    // Strategy 2: placeholder text
    const placeholderInputs = document.querySelectorAll(`input[placeholder], textarea[placeholder]`);
    for (const el of placeholderInputs) {
      const ph = (el.getAttribute("placeholder") || "").toLowerCase();
      if (ph.includes(lower)) return el;
    }

    // Strategy 3: label text content -> find associated input
    const allLabels = document.querySelectorAll("label");
    for (const lbl of allLabels) {
      const text = (lbl.textContent || "").toLowerCase().trim();
      if (text.includes(lower)) {
        // Check for input inside the label
        const inner = lbl.querySelector("input, textarea, select");
        if (inner) return inner;
        // Check for input in the parent container
        const container = lbl.closest("div[class]") || lbl.parentElement;
        if (container) {
          const sibling = container.querySelector("input, textarea, select");
          if (sibling) return sibling;
        }
        // Check for for= attribute
        const forId = lbl.getAttribute("for");
        if (forId) {
          const target = document.getElementById(forId);
          if (target) return target;
        }
      }
    }

    // Strategy 4: span text content -> find input in same container
    const allSpans = document.querySelectorAll("span");
    for (const span of allSpans) {
      const text = (span.textContent || "").toLowerCase().trim();
      if (text === lower || text.includes(lower)) {
        // Walk up to find a container with an input
        let parent = span.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          const input = parent.querySelector("input, textarea");
          if (input) return input;
          parent = parent.parentElement;
        }
      }
    }

    return null;
  }

  // Find and click a dropdown trigger, then select an option
  async function selectDropdown(fieldName, value) {
    if (!value) return false;
    const lower = value.toLowerCase();

    // Find the dropdown trigger element
    const trigger = findFormField(fieldName);
    if (!trigger) {
      // Try clicking span/label text directly (FB uses div-based dropdowns)
      const allSpans = document.querySelectorAll("span");
      for (const span of allSpans) {
        const text = (span.textContent || "").toLowerCase().trim();
        if (text.includes(fieldName.toLowerCase())) {
          const clickable = span.closest("[role='button'], [role='combobox'], [tabindex]") || span.closest("div[class]");
          if (clickable) {
            clickable.click();
            await sleep(1500);
            return await pickOption(lower);
          }
        }
      }
      console.warn(`[FB Poster] Dropdown not found: ${fieldName}`);
      return false;
    }

    // Click to open dropdown
    trigger.click();
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await sleep(1500);

    return await pickOption(lower);
  }

  // Pick an option from an open dropdown/listbox
  async function pickOption(valueLower) {
    // Look for role=option, role=menuitem, or li elements
    const selectors = "[role='option'], [role='menuitem'], [role='listbox'] div, li";
    const options = document.querySelectorAll(selectors);

    for (const opt of options) {
      const text = (opt.textContent || "").toLowerCase().trim();
      if (text === valueLower || text.includes(valueLower)) {
        opt.click();
        await sleep(800);
        return true;
      }
    }

    // Also check for div-based option menus
    const allDivs = document.querySelectorAll("div[role='listbox'] > div, div[role='menu'] > div");
    for (const div of allDivs) {
      const text = (div.textContent || "").toLowerCase().trim();
      if (text === valueLower || text.includes(valueLower)) {
        div.click();
        await sleep(800);
        return true;
      }
    }

    console.warn(`[FB Poster] Option not found: ${valueLower}`);
    return false;
  }

  function checkForWarnings() {
    const warningSelectors = [
      "[role='dialog']",
      "[aria-label*='warning' i]",
      "[aria-label*='restriction' i]",
      "[aria-label*='blocked' i]",
    ];

    for (const selector of warningSelectors) {
      let elements;
      try { elements = document.querySelectorAll(selector); } catch (e) { continue; }
      for (const el of elements) {
        const text = (el.textContent || "").toLowerCase();
        if (
          text.includes("restrict") ||
          text.includes("warning") ||
          text.includes("ban") ||
          text.includes("violat") ||
          text.includes("community standards") ||
          text.includes("temporarily blocked")
        ) {
          return { detected: true, message: (el.textContent || "").slice(0, 200) };
        }
      }
    }
    return { detected: false };
  }

  async function uploadPhotos(imageUrls) {
    // Find the file input — Facebook hides it but it exists in the DOM
    const fileInput = document.querySelector("input[type='file'][accept*='image']")
      || document.querySelector("input[type='file']");
    if (!fileInput) {
      console.warn("[FB Poster] Could not find file input for photos.");

      // Fallback: try clicking the "Add photos" area to trigger file dialog
      const addPhotos = [...document.querySelectorAll("div[role='button'], span")]
        .find((el) => (el.textContent || "").toLowerCase().includes("add photo"));
      if (addPhotos) {
        addPhotos.click();
        await sleep(1000);
        const retryInput = document.querySelector("input[type='file']");
        if (!retryInput) return false;
        return await doUpload(retryInput, imageUrls);
      }
      return false;
    }

    return await doUpload(fileInput, imageUrls);
  }

  async function doUpload(fileInput, imageUrls) {
    // Use watermark stripping utility if available
    let files;
    if (typeof globalThis.processImagesForUpload === "function") {
      console.log("[FB Poster] Processing images with watermark stripping...");
      files = await globalThis.processImagesForUpload(imageUrls);
    } else {
      files = [];
      for (let i = 0; i < imageUrls.length && i < 20; i++) {
        try {
          const response = await fetch(imageUrls[i]);
          const blob = await response.blob();
          const filename = `photo_${i + 1}.jpg`;
          files.push(new File([blob], filename, { type: blob.type || "image/jpeg" }));
        } catch (err) {
          console.warn(`[FB Poster] Failed to fetch image ${i}: ${imageUrls[i]}`, err);
        }
      }
    }

    if (files.length === 0) return false;

    console.log(`[FB Poster] Uploading ${files.length} photos...`);
    const dt = new DataTransfer();
    for (const file of files) {
      dt.items.add(file);
    }
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));

    // Wait for upload to process
    await sleep(5000 + files.length * 500);
    return true;
  }

  // ── Main flow ──

  console.log("[FB Poster] Content script loaded on Marketplace create page.");
  console.log("[FB Poster] URL:", window.location.href);

  await sleep(PAGE_LOAD_WAIT);

  // Check for any warnings before starting
  const preCheck = checkForWarnings();
  if (preCheck.detected) {
    console.error("[FB Poster] WARNING DETECTED before starting:", preCheck.message);
    await msg({
      action: "facebook_warning",
      data: { type: "warning_popup", message: preCheck.message },
    });
    return;
  }

  // Get the current job from background
  const response = await msg({ action: "get_current_job" });
  const job = response?.job;

  if (!job) {
    console.log("[FB Poster] No job available. Page may have been opened manually.");
    return;
  }

  console.log(`[FB Poster] Starting listing: ${job.vehicle_year} ${job.vehicle_make} ${job.vehicle_model}`);
  console.log(`[FB Poster] Job ID: ${job.id}`);

  // Wait for the form to be ready
  const formReady = await waitForForm(10000);
  if (!formReady) {
    console.error("[FB Poster] Form not ready after 10s — dumping page structure");
    console.log("[FB Poster] Inputs found:", document.querySelectorAll("input").length);
    console.log("[FB Poster] Textareas found:", document.querySelectorAll("textarea").length);
    console.log("[FB Poster] Labels found:", document.querySelectorAll("label").length);
    await msg({
      action: "listing_failed",
      data: { listing_id: job.id, success: false, error: "Form not ready after 10s" },
    });
    return;
  }

  try {
    // 1. Vehicle type dropdown (Car/Truck is usually pre-selected for /create/vehicle)
    await randomDelay();

    // 2. Select "Vehicle type" if visible
    const vehicleTypeDropdown = findFormField("vehicle type");
    if (vehicleTypeDropdown) {
      vehicleTypeDropdown.click();
      await sleep(1000);
      await pickOption("car/truck");
      await randomDelay();
    }

    // 3. Year
    console.log("[FB Poster] Setting year:", job.vehicle_year);
    const yearField = findFormField("year");
    if (yearField) {
      if (yearField.tagName === "INPUT" && yearField.getAttribute("role") === "combobox") {
        // Dropdown-style year selector
        yearField.click();
        await sleep(1000);
        await pickOption(String(job.vehicle_year));
      } else {
        setNativeValue(yearField, String(job.vehicle_year));
        await sleep(1000);
        await pickOption(String(job.vehicle_year));
      }
      await randomDelay();
    } else {
      console.warn("[FB Poster] Year field not found");
    }

    // 4. Make
    console.log("[FB Poster] Setting make:", job.vehicle_make);
    const makeField = findFormField("make");
    if (makeField) {
      makeField.click();
      await sleep(500);
      setNativeValue(makeField, job.vehicle_make);
      await sleep(1500);
      // Select from autocomplete
      await pickOption(job.vehicle_make.toLowerCase());
      await randomDelay();
    } else {
      console.warn("[FB Poster] Make field not found");
    }

    // 5. Model
    console.log("[FB Poster] Setting model:", job.vehicle_model);
    const modelField = findFormField("model");
    if (modelField) {
      modelField.click();
      await sleep(500);
      setNativeValue(modelField, job.vehicle_model);
      await sleep(1500);
      await pickOption(job.vehicle_model.toLowerCase());
      await randomDelay();
    } else {
      console.warn("[FB Poster] Model field not found");
    }

    // 6. Trim
    if (job.vehicle_trim) {
      console.log("[FB Poster] Setting trim:", job.vehicle_trim);
      const trimField = findFormField("trim");
      if (trimField) {
        setNativeValue(trimField, job.vehicle_trim);
        await sleep(1000);
        // Try to pick from autocomplete, otherwise leave typed value
        await pickOption(job.vehicle_trim.toLowerCase()).catch(() => {});
        await randomDelay();
      }
    }

    // 7. Price
    if (job.price) {
      console.log("[FB Poster] Setting price:", job.price);
      const priceField = findFormField("price");
      if (priceField) {
        setNativeValue(priceField, String(Math.round(Number(job.price))));
        await randomDelay();
      }
    }

    // 8. Mileage / Odometer
    if (job.mileage) {
      console.log("[FB Poster] Setting mileage:", job.mileage);
      const mileageField = findFormField("mileage") || findFormField("odometer");
      if (mileageField) {
        setNativeValue(mileageField, String(job.mileage));
        await randomDelay();
      }
    }

    // 9. Condition: Used
    console.log("[FB Poster] Setting condition: Used");
    await selectDropdown("condition", "used");
    await randomDelay();

    // 10. Transmission
    if (job.transmission) {
      console.log("[FB Poster] Setting transmission:", job.transmission);
      await selectDropdown("transmission", job.transmission.toLowerCase());
      await randomDelay();
    }

    // 11. Fuel Type
    if (job.fuel_type) {
      console.log("[FB Poster] Setting fuel type:", job.fuel_type);
      await selectDropdown("fuel", job.fuel_type.toLowerCase());
      await randomDelay();
    }

    // 12. Exterior Colour
    if (job.colour) {
      console.log("[FB Poster] Setting colour:", job.colour);
      await selectDropdown("colour", job.colour.toLowerCase())
        || await selectDropdown("color", job.colour.toLowerCase())
        || await selectDropdown("exterior", job.colour.toLowerCase());
      await randomDelay();
    }

    // 13. Description
    if (job.description) {
      console.log("[FB Poster] Setting description...");
      const descField = findFormField("description")
        || document.querySelector("textarea[aria-label*='escription']")
        || document.querySelector("textarea");
      if (descField) {
        // Type description with human-like speed
        await typeHuman(descField, job.description);
        await randomDelay();
      } else {
        console.warn("[FB Poster] Description field not found");
      }
    }

    // 14. Photos
    if (job.image_urls && job.image_urls.length > 0) {
      console.log(`[FB Poster] Uploading ${job.image_urls.length} photos...`);
      const uploaded = await uploadPhotos(job.image_urls);
      if (!uploaded) {
        console.warn("[FB Poster] Photo upload may have failed");
      }
      await sleep(5000);
    }

    // Check for warnings before publishing
    const postCheck = checkForWarnings();
    if (postCheck.detected) {
      console.error("[FB Poster] WARNING DETECTED before publish:", postCheck.message);
      await msg({
        action: "facebook_warning",
        data: { type: "warning_popup", message: postCheck.message, listing_id: job.id },
      });
      return;
    }

    // 15. Click Next / Publish
    await randomDelay();
    console.log("[FB Poster] Looking for Publish/Next button...");

    const publishBtn = [...document.querySelectorAll("div[role='button'], button, [aria-label='Publish'], [aria-label='Next']")]
      .find((btn) => {
        const text = (btn.textContent || "").trim().toLowerCase();
        const ariaLabel = (btn.getAttribute("aria-label") || "").toLowerCase();
        return text === "publish" || text === "next" || text === "post"
          || ariaLabel === "publish" || ariaLabel === "next" || ariaLabel === "post";
      });

    if (publishBtn) {
      console.log("[FB Poster] Clicking publish/next button...");
      publishBtn.click();
      await sleep(5000);

      // Check for success or errors
      const finalCheck = checkForWarnings();
      if (finalCheck.detected) {
        console.error("[FB Poster] WARNING after publish:", finalCheck.message);
        await msg({
          action: "facebook_warning",
          data: { type: "warning_popup", message: finalCheck.message, listing_id: job.id },
        });
        return;
      }

      // Try to extract the Facebook listing URL
      let fbListingUrl = null;
      let fbListingId = null;
      const currentUrl = window.location.href;
      const urlMatch = currentUrl.match(/\/marketplace\/item\/(\d+)/);
      if (urlMatch) {
        fbListingId = urlMatch[1];
        fbListingUrl = `https://www.facebook.com/marketplace/item/${fbListingId}`;
      }

      await msg({
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
      console.warn("[FB Poster] Publish button not found. Buttons on page:");
      document.querySelectorAll("div[role='button'], button").forEach((b) => {
        console.log("  Button:", (b.textContent || "").trim().slice(0, 50));
      });
      throw new Error("Could not find Publish/Next button");
    }
  } catch (err) {
    console.error("[FB Poster] Error posting listing:", err);
    await msg({
      action: "listing_failed",
      data: {
        listing_id: job.id,
        success: false,
        error: err.message || "Unknown error during posting",
      },
    });
  }
})();
