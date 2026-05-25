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

Point Quo's webhooks to:
```
POST https://your-domain.vercel.app/api/webhooks/quo
```

Expected payload format:
```json
{
  "call_id": "unique-call-id",
  "type": "transcript",
  "transcript": "Full call transcript text...",
  "caller_name": "John Smith",
  "caller_phone": "+1234567890",
  "agent_name": "Jea",
  "duration_seconds": 180,
  "started_at": "2025-01-15T10:00:00Z",
  "ended_at": "2025-01-15T10:03:00Z"
}
```

Send a second webhook with `"type": "summary"` and `"summary"` field for the AI summary.

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/webhooks/quo` | POST | Receives Quo webhooks (transcript + summary) |
| `/api/calls` | GET | List calls (query: `agent`, `date`, `limit`, `offset`) |
| `/api/calls/[id]` | GET | Get single call details |
| `/api/customers` | GET/POST | Customer lookup and creation |
| `/api/stats` | GET | Dashboard statistics for today |
| `/api/weekly-report` | GET/POST | Weekly coaching reports |
