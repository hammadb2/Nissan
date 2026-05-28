/**
 * Content script for facebook.com/marketplace/create/vehicle
 *
 * Uses the exact Facebook Marketplace DOM selectors verified from working
 * implementations. Fields are found via span text labels inside their parent
 * containers, matching Facebook's React component structure.
 *
 * Form field patterns:
 * - Text inputs: <div><span>Label</span><input/></div> → find span, get parent div, find input
 * - Dropdowns:   <span>Label</span> in parent clickable → click parent, pick option by span text
 * - Textarea:    <span>Description</span> sibling div contains <textarea>
 * - Photos:      input[type="file"][accept*="image"]
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

  function msg(data) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(data, (resp) => resolve(resp));
    });
  }

  // ── Facebook-specific DOM helpers ──

  // Evaluate an XPath and return the first matching element
  function xpath(expression) {
    const result = document.evaluate(
      expression, document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null
    );
    return result.singleNodeValue;
  }

  // Evaluate an XPath and return all matching elements
  function xpathAll(expression) {
    const result = document.evaluate(
      expression, document, null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
    );
    const nodes = [];
    for (let i = 0; i < result.snapshotLength; i++) {
      nodes.push(result.snapshotItem(i));
    }
    return nodes;
  }

  // Find a text input by its label span text
  // Facebook pattern: <div><span>Label</span><input/></div>
  function findTextInput(labelText) {
    // Primary: XPath matching the exact Facebook DOM pattern
    const byXpath = xpath(`//div[span/text() = "${labelText}"]/input`);
    if (byXpath) return byXpath;

    // Fallback 1: aria-label
    const byAria = document.querySelector(`input[aria-label="${labelText}"]`);
    if (byAria) return byAria;

    // Fallback 2: placeholder
    const byPlaceholder = document.querySelector(`input[placeholder="${labelText}"]`);
    if (byPlaceholder) return byPlaceholder;

    // Fallback 3: span text search in parent hierarchy
    const spans = document.querySelectorAll("span");
    for (const span of spans) {
      if (span.textContent.trim() === labelText) {
        const parent = span.parentElement;
        if (parent) {
          const input = parent.querySelector("input");
          if (input) return input;
        }
      }
    }

    return null;
  }

  // Find the description textarea
  function findDescriptionTextarea() {
    // Primary: XPath from reference implementation
    const byXpath = xpath("//span[text()='Description']//following-sibling::div//textarea");
    if (byXpath) return byXpath;

    // Fallback: any textarea on the page
    const textarea = document.querySelector("textarea");
    if (textarea) return textarea;

    return null;
  }

  // Click a dropdown by its label text, then select an option
  async function selectDropdownByLabel(labelText, optionText) {
    console.log(`[FB Poster] Selecting dropdown "${labelText}" → "${optionText}"`);

    // Find the dropdown trigger: span with label text → click parent
    const triggerSpan = xpath(`//span[text()='${labelText}']/..`);
    if (!triggerSpan) {
      console.warn(`[FB Poster] Dropdown trigger not found: "${labelText}"`);
      return false;
    }

    // Click to open dropdown
    triggerSpan.click();
    await sleep(1500);

    // Find the option — Facebook wraps options in nested divs with span text
    // Pattern: //span[normalize-space()='Option Text']/../../../..
    const optionEl = xpath(`//span[normalize-space()='${optionText}']/../../../..`);
    if (optionEl) {
      optionEl.click();
      await sleep(800);
      console.log(`[FB Poster] Selected "${optionText}" for "${labelText}"`);
      return true;
    }

    // Fallback: try finding by role=option or simpler span match
    const allOptions = document.querySelectorAll("[role='option'], [role='menuitem']");
    for (const opt of allOptions) {
      if (opt.textContent.trim().toLowerCase() === optionText.toLowerCase()) {
        opt.click();
        await sleep(800);
        console.log(`[FB Poster] Selected "${optionText}" via role for "${labelText}"`);
        return true;
      }
    }

    // Fallback: click any span that matches the option text
    const optionSpans = document.querySelectorAll("span");
    for (const span of optionSpans) {
      if (span.textContent.trim() === optionText) {
        span.click();
        await sleep(800);
        console.log(`[FB Poster] Selected "${optionText}" via span text for "${labelText}"`);
        return true;
      }
    }

    console.warn(`[FB Poster] Option "${optionText}" not found for "${labelText}"`);
    // Close dropdown by pressing Escape
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(500);
    return false;
  }

  function checkForWarnings() {
    const warningKeywords = ["restrict", "warning", "ban", "violat", "community standards", "temporarily blocked"];
    const dialogs = document.querySelectorAll("[role='dialog']");
    for (const el of dialogs) {
      const text = (el.textContent || "").toLowerCase();
      for (const keyword of warningKeywords) {
        if (text.includes(keyword)) {
          return { detected: true, message: (el.textContent || "").slice(0, 200) };
        }
      }
    }
    return { detected: false };
  }

  // Wait for the Facebook vehicle form to load
  async function waitForForm(timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      // Check for the "Year" dropdown which is always present on vehicle form
      const yearDropdown = xpath("//span[text()='Year']/..");
      const makeField = xpath("//span[text()='Make']");
      if (yearDropdown || makeField) {
        console.log("[FB Poster] Vehicle form detected (found Year/Make elements)");
        return true;
      }
      // Also check for any input fields as a secondary signal
      const inputs = document.querySelectorAll("input, textarea");
      if (inputs.length >= 3) {
        console.log(`[FB Poster] Form detected: ${inputs.length} input elements`);
        return true;
      }
      await sleep(500);
    }
    return false;
  }

  async function uploadPhotos(imageUrls) {
    const fileInput = document.querySelector("input[type='file'][accept*='image']")
      || document.querySelector("input[type='file']");
    if (!fileInput) {
      console.warn("[FB Poster] File input not found for photos");
      // Try clicking "Add photos" area
      const addPhotosArea = [...document.querySelectorAll("div[role='button'], span")]
        .find((el) => (el.textContent || "").toLowerCase().includes("add photo"));
      if (addPhotosArea) {
        addPhotosArea.click();
        await sleep(1000);
        const retryInput = document.querySelector("input[type='file']");
        if (!retryInput) return false;
        return await doUpload(retryInput, imageUrls);
      }
      return false;
    }

    // Make file input visible if hidden (Facebook hides it)
    fileInput.style.display = "block";
    fileInput.style.visibility = "visible";
    fileInput.style.opacity = "1";
    fileInput.style.position = "relative";
    fileInput.style.width = "auto";
    fileInput.style.height = "auto";

    return await doUpload(fileInput, imageUrls);
  }

  async function doUpload(fileInput, imageUrls) {
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
          files.push(new File([blob], `photo_${i + 1}.jpg`, { type: blob.type || "image/jpeg" }));
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

    await sleep(5000 + files.length * 500);
    return true;
  }

  // ── Main flow ──

  console.log("[FB Poster] Content script loaded on Marketplace create page.");
  console.log("[FB Poster] URL:", window.location.href);

  await sleep(PAGE_LOAD_WAIT);

  // Check for warnings
  const preCheck = checkForWarnings();
  if (preCheck.detected) {
    console.error("[FB Poster] WARNING DETECTED:", preCheck.message);
    await msg({ action: "facebook_warning", data: { type: "warning_popup", message: preCheck.message } });
    return;
  }

  // Get the current job from background
  const response = await msg({ action: "get_current_job" });
  const job = response?.job;

  if (!job) {
    console.log("[FB Poster] No job available.");
    return;
  }

  console.log(`[FB Poster] Posting: ${job.vehicle_year} ${job.vehicle_make} ${job.vehicle_model}`);
  console.log(`[FB Poster] Job ID: ${job.id}`);

  // Wait for form
  const formReady = await waitForForm(15000);
  if (!formReady) {
    console.error("[FB Poster] Form not ready after 15s");
    // Dump page info for debugging
    const allSpans = document.querySelectorAll("span");
    console.log("[FB Poster] Page spans:", [...allSpans].slice(0, 20).map(s => s.textContent.trim()).filter(Boolean));
    console.log("[FB Poster] Page inputs:", document.querySelectorAll("input").length);
    await msg({ action: "listing_failed", data: { listing_id: job.id, success: false, error: "Form not ready after 15s" } });
    return;
  }

  try {
    // ── Step 1: Upload photos first ──
    if (job.image_urls && job.image_urls.length > 0) {
      console.log(`[FB Poster] Uploading ${job.image_urls.length} photos...`);
      const uploaded = await uploadPhotos(job.image_urls);
      console.log(`[FB Poster] Photo upload ${uploaded ? "succeeded" : "failed"}`);
      await randomDelay();
    }

    // ── Step 2: Vehicle type → Car/Truck ──
    console.log("[FB Poster] Setting vehicle type...");
    await selectDropdownByLabel("Vehicle type", "Car/Truck");
    await randomDelay();

    // ── Step 3: Year ──
    console.log("[FB Poster] Setting year:", job.vehicle_year);
    await selectDropdownByLabel("Year", String(job.vehicle_year));
    await randomDelay();

    // ── Step 4: Make ──
    console.log("[FB Poster] Setting make:", job.vehicle_make);
    // Make is a dropdown — click the parent of the "Make" span to open it
    const makeSpan = xpath("//span[text()='Make']");
    if (makeSpan) {
      const makeParent = makeSpan.closest("div") || makeSpan.parentElement;
      if (makeParent) {
        makeParent.click();
        await sleep(1500);
        // Select the make from the dropdown options
        const makeOption = xpath(`//span[normalize-space()='${job.vehicle_make}']/../../../..`);
        if (makeOption) {
          makeOption.click();
          console.log(`[FB Poster] Selected make: ${job.vehicle_make}`);
        } else {
          // Fallback: try clicking span directly
          const allSpans = document.querySelectorAll("span");
          for (const s of allSpans) {
            if (s.textContent.trim() === job.vehicle_make) {
              s.click();
              console.log(`[FB Poster] Selected make via span: ${job.vehicle_make}`);
              break;
            }
          }
        }
      }
    } else {
      // Fallback: Make might be a text input on some versions
      const makeInput = findTextInput("Make");
      if (makeInput) {
        setNativeValue(makeInput, job.vehicle_make);
        await sleep(1000);
      }
    }
    await randomDelay();

    // ── Step 5: Model ──
    console.log("[FB Poster] Setting model:", job.vehicle_model);
    const modelInput = findTextInput("Model");
    if (modelInput) {
      modelInput.click();
      await sleep(300);
      setNativeValue(modelInput, job.vehicle_model);
      console.log("[FB Poster] Model set");
    } else {
      console.warn("[FB Poster] Model input not found");
    }
    await randomDelay();

    // ── Step 6: Trim ──
    if (job.vehicle_trim) {
      console.log("[FB Poster] Setting trim:", job.vehicle_trim);
      const trimInput = findTextInput("Trim");
      if (trimInput) {
        trimInput.click();
        await sleep(300);
        setNativeValue(trimInput, job.vehicle_trim);
      }
      await randomDelay();
    }

    // ── Step 7: Mileage ──
    if (job.mileage) {
      console.log("[FB Poster] Setting mileage:", job.mileage);
      const mileageInput = findTextInput("Mileage");
      if (mileageInput) {
        mileageInput.click();
        await sleep(300);
        setNativeValue(mileageInput, String(job.mileage));
        console.log("[FB Poster] Mileage set");
      } else {
        console.warn("[FB Poster] Mileage input not found");
      }
      await randomDelay();
    }

    // ── Step 8: Price ──
    if (job.price) {
      console.log("[FB Poster] Setting price:", job.price);
      const priceInput = findTextInput("Price");
      if (priceInput) {
        priceInput.click();
        await sleep(300);
        setNativeValue(priceInput, String(Math.round(Number(job.price))));
        console.log("[FB Poster] Price set");
      } else {
        console.warn("[FB Poster] Price input not found");
      }
      await randomDelay();
    }

    // ── Step 9: Body style (SUV, Sedan, etc) ──
    console.log("[FB Poster] Setting body style...");
    await selectDropdownByLabel("Body style", "Other");
    await randomDelay();

    // ── Step 10: Exterior colour ──
    if (job.colour) {
      console.log("[FB Poster] Setting exterior colour:", job.colour);
      // Facebook uses title-case colour names
      const colourTitleCase = job.colour.charAt(0).toUpperCase() + job.colour.slice(1).toLowerCase();
      await selectDropdownByLabel("Exterior color", colourTitleCase);
      // Also try Canadian spelling
      if (!xpath(`//span[text()='Exterior colour']`)) {
        // Already tried "color" above
      }
      await randomDelay();
    }

    // ── Step 11: Fuel type ──
    if (job.fuel_type) {
      console.log("[FB Poster] Setting fuel type:", job.fuel_type);
      // Facebook uses specific labels like "Gasoline", "Diesel", "Electric"
      const fuelMap = {
        gasoline: "Gasoline",
        gas: "Gasoline",
        diesel: "Diesel",
        electric: "Electric",
        hybrid: "Hybrid",
        "plug-in hybrid": "Plug-in hybrid",
        other: "Other",
      };
      const fuelOption = fuelMap[job.fuel_type.toLowerCase()] || job.fuel_type;
      await selectDropdownByLabel("Fuel type", fuelOption);
      await randomDelay();
    }

    // ── Step 12: Transmission ──
    if (job.transmission) {
      console.log("[FB Poster] Setting transmission:", job.transmission);
      const transMap = {
        automatic: "Automatic transmission",
        manual: "Manual transmission",
        other: "Other",
      };
      const transOption = transMap[job.transmission.toLowerCase()] || job.transmission;
      await selectDropdownByLabel("Transmission", transOption);
      await randomDelay();
    }

    // ── Step 13: Condition → Used ──
    console.log("[FB Poster] Setting condition: Used");
    await selectDropdownByLabel("Condition", "Used");
    await randomDelay();

    // ── Step 14: Description ──
    if (job.description) {
      console.log("[FB Poster] Setting description...");
      const descTextarea = findDescriptionTextarea();
      if (descTextarea) {
        await typeHuman(descTextarea, job.description);
        console.log("[FB Poster] Description set");
      } else {
        console.warn("[FB Poster] Description textarea not found");
      }
      await randomDelay();
    }

    // Check for warnings before proceeding
    const midCheck = checkForWarnings();
    if (midCheck.detected) {
      console.error("[FB Poster] WARNING DETECTED before Next:", midCheck.message);
      await msg({ action: "facebook_warning", data: { type: "warning_popup", message: midCheck.message, listing_id: job.id } });
      return;
    }

    // ── Step 15: Click "Next" button ──
    console.log("[FB Poster] Clicking Next...");
    await randomDelay();

    const nextBtn = xpath('//span/span[text()="Next"]')
      || xpath('//span[text()="Next"]');
    if (nextBtn) {
      const clickTarget = nextBtn.closest("[role='button']") || nextBtn.closest("div[tabindex]") || nextBtn;
      clickTarget.click();
      console.log("[FB Poster] Clicked Next");
      await sleep(5000);
    } else {
      console.warn("[FB Poster] Next button not found. Looking for alternatives...");
      const buttons = document.querySelectorAll("div[role='button'], button");
      for (const btn of buttons) {
        const text = (btn.textContent || "").trim().toLowerCase();
        if (text === "next") {
          btn.click();
          console.log("[FB Poster] Clicked Next (fallback)");
          await sleep(5000);
          break;
        }
      }
    }

    // ── Step 16: Click "Post" / "Publish" button (on the review page) ──
    console.log("[FB Poster] Looking for Post/Publish button...");
    await sleep(3000);

    const postBtn = xpath('//div[not(@aria-disabled)]/div/div/div/span/span[text()="Post"]')
      || xpath('//span/span[text()="Publish"]')
      || xpath('//span/span[text()="Post"]');
    if (postBtn) {
      const clickTarget = postBtn.closest("[role='button']") || postBtn.closest("div[tabindex]") || postBtn;

      // Final warning check
      const finalCheck = checkForWarnings();
      if (finalCheck.detected) {
        console.error("[FB Poster] WARNING DETECTED before Publish:", finalCheck.message);
        await msg({ action: "facebook_warning", data: { type: "warning_popup", message: finalCheck.message, listing_id: job.id } });
        return;
      }

      clickTarget.click();
      console.log("[FB Poster] Clicked Post/Publish");
      await sleep(8000);
    } else {
      // Fallback: look for any button with Post/Publish text
      const allButtons = document.querySelectorAll("div[role='button'], button");
      let found = false;
      for (const btn of allButtons) {
        const text = (btn.textContent || "").trim().toLowerCase();
        if (text === "post" || text === "publish") {
          if (!btn.closest("[aria-disabled='true']")) {
            btn.click();
            console.log("[FB Poster] Clicked Post (fallback)");
            found = true;
            await sleep(8000);
            break;
          }
        }
      }
      if (!found) {
        console.warn("[FB Poster] Post/Publish button not found");
        console.warn("[FB Poster] Buttons on page:", [...allButtons].map(b => b.textContent.trim().slice(0, 30)));
        throw new Error("Could not find Post/Publish button");
      }
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

    if (fbListingUrl && typeof globalThis.scheduleShadowBanCheck === "function") {
      globalThis.scheduleShadowBanCheck(fbListingUrl, job.id);
    }

    console.log("[FB Poster] Listing published successfully:", job.id);
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
