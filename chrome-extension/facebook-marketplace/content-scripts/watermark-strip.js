/**
 * Watermark and phone number stripping utility.
 *
 * Processes vehicle images before upload to Facebook.
 * Crops out the bottom region of the first photo where
 * dealer watermarks and phone numbers typically appear.
 *
 * This runs as a utility module imported by listing-poster.js.
 */

const WATERMARK_CONFIG = {
  // Percentage of the image height to crop from the bottom
  CROP_BOTTOM_PERCENT: 8,
  // Percentage of the image height to crop from the top (for top watermarks)
  CROP_TOP_PERCENT: 0,
  // Max width/height for processed images
  MAX_DIMENSION: 2048,
  // JPEG quality
  JPEG_QUALITY: 0.92,
};

/**
 * Strips the watermark region from an image.
 * Crops the bottom portion where dealer info typically sits.
 *
 * @param {Blob} imageBlob - The original image blob
 * @param {boolean} isFirstPhoto - Whether this is the first/main photo (more aggressive crop)
 * @returns {Promise<Blob>} - The processed image blob
 */
async function stripWatermark(imageBlob, isFirstPhoto = false) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        resolve(imageBlob);
        return;
      }

      let cropTop = 0;
      let cropBottom = 0;

      if (isFirstPhoto) {
        // First photo: more aggressive crop (dealer logos, phone numbers)
        cropBottom = Math.floor(img.height * (WATERMARK_CONFIG.CROP_BOTTOM_PERCENT / 100));
        cropTop = Math.floor(img.height * (WATERMARK_CONFIG.CROP_TOP_PERCENT / 100));
      }

      const sourceX = 0;
      const sourceY = cropTop;
      const sourceWidth = img.width;
      const sourceHeight = img.height - cropTop - cropBottom;

      // Scale down if needed
      let destWidth = sourceWidth;
      let destHeight = sourceHeight;

      if (destWidth > WATERMARK_CONFIG.MAX_DIMENSION || destHeight > WATERMARK_CONFIG.MAX_DIMENSION) {
        const ratio = Math.min(
          WATERMARK_CONFIG.MAX_DIMENSION / destWidth,
          WATERMARK_CONFIG.MAX_DIMENSION / destHeight
        );
        destWidth = Math.floor(destWidth * ratio);
        destHeight = Math.floor(destHeight * ratio);
      }

      canvas.width = destWidth;
      canvas.height = destHeight;

      ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, destWidth, destHeight);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            resolve(imageBlob);
          }
        },
        "image/jpeg",
        WATERMARK_CONFIG.JPEG_QUALITY
      );
    };

    img.onerror = () => {
      console.warn("[Watermark] Failed to load image for processing.");
      resolve(imageBlob);
    };

    img.src = URL.createObjectURL(imageBlob);
  });
}

/**
 * Processes all vehicle images before upload.
 * Strips watermarks from the first photo (most likely to have dealer branding).
 *
 * @param {string[]} imageUrls - Array of image URLs from the CRM
 * @returns {Promise<File[]>} - Array of processed File objects ready for upload
 */
async function processImagesForUpload(imageUrls) {
  const processedFiles = [];

  for (let i = 0; i < imageUrls.length; i++) {
    try {
      const response = await fetch(imageUrls[i]);
      let blob = await response.blob();

      // Strip watermark from first photo (most aggressive)
      // Also strip from other photos but less aggressively
      const isFirst = i === 0;
      blob = await stripWatermark(blob, isFirst);

      const filename = `vehicle_photo_${i + 1}.jpg`;
      processedFiles.push(new File([blob], filename, { type: "image/jpeg" }));
    } catch (err) {
      console.warn(`[Watermark] Failed to process image ${i + 1}:`, err);
    }
  }

  return processedFiles;
}

// Export for use in listing-poster.js
if (typeof globalThis !== "undefined") {
  globalThis.stripWatermark = stripWatermark;
  globalThis.processImagesForUpload = processImagesForUpload;
}
