/**
 * API route: POST /api/scrape-apify
 * Accepts multiple Amazon URLs, scrapes them all via Apify in a single batch,
 * and returns results in order. Much more reliable than direct scraping.
 */

import { NextRequest, NextResponse } from "next/server";
import { scrapeAmazonWithApify } from "@/lib/apify";
import { extractAsin } from "@/lib/amazon";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const urls: string[] = (body.urls || [])
      .map((u: string) => u.trim())
      .filter((u: string) => u.length > 0);

    if (urls.length === 0) {
      return NextResponse.json(
        { error: "No URLs provided" },
        { status: 400 }
      );
    }

    // Validate URLs
    const invalid = urls.filter(
      (u) => !u.includes("amazon.") || !extractAsin(u)
    );
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: "Invalid Amazon URLs",
          invalidUrls: invalid,
        },
        { status: 400 }
      );
    }

    console.log(`[scrape-apify] Starting batch scrape of ${urls.length} URLs`);

    const results = await scrapeAmazonWithApify(urls);

    const successCount = results.filter(
      (r) => r.title && r.title !== "Unknown Product"
    ).length;

    console.log(
      `[scrape-apify] Done: ${successCount}/${urls.length} products found`
    );

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error("[scrape-apify] Error:", error.message);
    return NextResponse.json(
      { error: error.message || "Apify scraping failed" },
      { status: 500 }
    );
  }
}
