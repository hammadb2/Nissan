# Call Intelligence Dashboard

AI-powered call analysis and coaching dashboard for Nissan outbound sales. Integrates with **Quo** for call transcripts and **OpenAI GPT-4o-mini** for automated analysis.

## How It Works

1. Agent (Jea) makes a call through Quo
2. Call ends — Quo fires webhooks with transcript + AI summary
3. Server receives both, sends to OpenAI GPT-4o-mini for analysis
4. AI generates: summary, CRM notes, next action, coaching tip, recent buyer flag
5. Everything appears on the dashboard in real time

## Features

### Agent View (`/dashboard/agent`)
- **Call Summary** — plain English summary of each call
- **CRM Notes** — copy-paste ready, one click to copy
- **Next Task** — exactly what to do, which day, what time
- **Coaching Tip** — one strength and one improvement per call
- **Pre-Call Check** — enter a phone number to check if they're a recent buyer before dialing

### Manager View (`/dashboard/manager`)
- **Stats** — calls today vs 200 target, remaining, appointments booked
- **Live Feed** — every call with full analysis in real time
- **Recent Buyer Flags** — automatic flagging of customers who bought < 12 months ago
- **Weekly Report** — AI-generated coaching report based on all weekly calls

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **Supabase** (PostgreSQL for call records, transcripts, summaries, tasks)
- **OpenAI GPT-4o-mini** (cost-effective transcript analysis)
- **Tailwind CSS v4** (UI styling)
- **Vercel** (deployment)

## Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Fill in your keys in .env.local:
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY
# - OPENAI_API_KEY

# Run the Supabase migration
# (apply supabase/migrations/001_initial_schema.sql to your Supabase project)

# Start dev server
npm run dev
```

## Quo Webhook Configuration

In Quo's webhook settings, create a webhook with:
- **URL:** `https://your-domain.vercel.app/api/webhooks/quo`
- **Label:** `Call Intelligence Dashboard`
- **Events:** Check `call.transcript.completed` and `call.summary.completed`
- **Receive updates from all phone numbers:** ON

Quo sends two separate webhook events per call:

**`call.transcript.completed`** — contains the full dialogue as structured entries:
```json
{
  "type": "call.transcript.completed",
  "data": {
    "resource": {
      "callId": "AC-call-id",
      "duration": 180,
      "processingStatus": "completed",
      "dialogue": [
        { "userId": "US123", "identifier": null, "content": "Hi, how can I help?", "start": 0, "end": 3 },
        { "userId": null, "identifier": "+15550000002", "content": "I'm interested in a vehicle.", "start": 3, "end": 7 }
      ]
    },
    "context": {
      "participants": { "workspace": ["+15550000001"], "external": ["+15550000002"] }
    }
  }
}
```

**`call.summary.completed`** — contains the AI-generated summary and next steps:
```json
{
  "type": "call.summary.completed",
  "data": {
    "resource": {
      "callId": "AC-call-id",
      "processingStatus": "completed",
      "summary": ["Customer asked about pricing for a 2024 Sentra."],
      "nextSteps": ["Send follow-up email with pricing details."]
    }
  }
}
```

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/webhooks/quo` | POST | Receives Quo webhooks (transcript + summary) |
| `/api/calls` | GET | List calls (query: `agent`, `date`, `limit`, `offset`) |
| `/api/calls/[id]` | GET | Get single call details |
| `/api/customers` | GET/POST | Customer lookup and creation |
| `/api/stats` | GET | Dashboard statistics for today |
| `/api/weekly-report` | GET/POST | Weekly coaching reports |
