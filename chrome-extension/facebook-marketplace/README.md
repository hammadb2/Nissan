# Facebook Marketplace Chrome Extension

Automates Facebook Marketplace vehicle listings, inbox monitoring, and AI-powered replies for the South Trail Nissan CRM.

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `chrome-extension/facebook-marketplace` folder
5. Click the extension icon in the toolbar and set your CRM URL

## Configuration

Click the extension popup icon and enter your CRM Base URL (e.g., `https://your-app.vercel.app`).

## How It Works

### Part 1: Listing Posting
- Polls CRM for queued vehicles every 60 seconds
- Opens `facebook.com/marketplace/create/vehicle` and fills all fields
- Strips watermarks from first photo automatically
- Human-like typing and random delays between actions
- Max 10 listings/day, 15-30 min spacing, no posting 11PM-8AM Calgary time
- Shadow ban check runs 5 minutes after each listing posts

### Part 2: Inbox Monitoring
- Scans Facebook Messages every 5 minutes
- Detects new buyer messages and sends to CRM
- Extracts buyer name, message, listing reference

### Part 3: AI Reply Injection
- Polls CRM for pending AI replies every 10 seconds
- Types replies character-by-character with random keystroke delays
- Confirms delivery back to CRM

### Safety Features
- Stops all activity if Facebook warning/restriction popup detected
- Alerts sent to CRM dashboard immediately
- Random delays (2-5s) between every action
- Never opens more than one Marketplace tab
- Quiet hours enforcement (11PM-8AM Calgary)
- Daily post limit enforcement

## CRM API Endpoints Used

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/facebook/next-listing-job` | GET | Get next vehicle to post |
| `/api/facebook/listing-posted` | POST | Report posting success/failure |
| `/api/facebook/new-message` | POST | Send buyer message to CRM |
| `/api/facebook/pending-replies` | GET | Poll for AI replies to send |
| `/api/facebook/reply-sent` | POST | Confirm reply was sent |
| `/api/facebook/alerts` | POST | Report warnings/restrictions |
| `/api/facebook/queue-listing` | POST | Add vehicle to posting queue |
| `/api/facebook/generate-description` | POST | Generate AI description |
| `/api/facebook/update-listing` | POST | Update listing after CRM change |
