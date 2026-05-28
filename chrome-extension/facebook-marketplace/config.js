/**
 * Extension configuration — edit CRM_BASE_URL before loading.
 */
const CONFIG = {
  CRM_BASE_URL: "https://hammadatnissan.vercel.app",

  // Pacing rules
  MAX_LISTINGS_PER_DAY: 10,
  MIN_POSTING_INTERVAL_MIN: 15,
  MAX_POSTING_INTERVAL_MIN: 30,
  POSTING_QUIET_HOURS_START: 23, // 11 PM Calgary — posting stops
  POSTING_QUIET_HOURS_END: 8,    // 8 AM Calgary — posting resumes
  REPLY_QUIET_HOURS_START: 21,   // 9 PM Calgary — replies stop
  REPLY_QUIET_HOURS_END: 8,      // 8 AM Calgary — replies resume

  // Polling intervals
  LISTING_POLL_INTERVAL_MS: 60 * 1000,        // 1 minute
  INBOX_POLL_INTERVAL_MS: 5 * 60 * 1000,      // 5 minutes
  REPLY_POLL_INTERVAL_MS: 10 * 1000,           // 10 seconds

  // Human simulation delays
  ACTION_DELAY_MIN_MS: 2000,
  ACTION_DELAY_MAX_MS: 5000,
  KEYSTROKE_DELAY_MIN_MS: 80,
  KEYSTROKE_DELAY_MAX_MS: 150,
  PAGE_LOAD_WAIT_MS: 3000,

  // Best posting times (Calgary time)
  BEST_POSTING_HOURS: [17, 18, 19, 20], // 5 PM to 8 PM
  BEST_POSTING_DAYS: [0, 1],            // Sunday, Monday

  // Safety
  MAX_ABSOLUTE_DAILY: 10,
  SHADOW_BAN_CHECK_ENABLED: true,
  SHADOW_BAN_CHECK_DELAY_MS: 10 * 60 * 1000, // 10 minutes after posting
  WATERMARK_STRIP_ENABLED: true,

  // IP check
  IP_CHECK_INTERVAL_MS: 30 * 60 * 1000, // 30 minutes
  IP_CHECK_URL: "https://ipapi.co/json/",
  REQUIRED_COUNTRY: "CA",

  TIMEZONE: "America/Edmonton",
};

// Make config available to all extension scripts
if (typeof globalThis !== "undefined") {
  globalThis.FB_CONFIG = CONFIG;
}
