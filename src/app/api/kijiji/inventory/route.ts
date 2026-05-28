import { NextResponse } from "next/server";
import {
  scrapeAutoTraderInventory,
  generateKijijiTitle,
  generateKijijiDescription,
} from "@/lib/autotrader-scraper";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const vehicles = await scrapeAutoTraderInventory({ offer: "U" });

    const enriched = vehicles.map((v) => ({
      ...v,
      kijiji_title: generateKijijiTitle(v),
      kijiji_description: generateKijijiDescription(v),
    }));

    return NextResponse.json({
      vehicles: enriched,
      total: enriched.length,
      scraped_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scrape failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
