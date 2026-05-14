/**
 * API route: POST /api/scrape
 * Accepts an Amazon URL and returns scraped product details.
 */

import { NextRequest, NextResponse } from "next/server";
import { scrapeAmazonProduct, extractAsin } from "@/lib/amazon";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = body.url?.trim();

    if (!url) {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Validate it looks like an Amazon URL
    if (!url.includes("amazon.") || !extractAsin(url)) {
      return NextResponse.json(
        { error: "Invalid Amazon URL. Please provide a valid Amazon product URL." },
        { status: 400 }
      );
    }

    const product = await scrapeAmazonProduct(url);

    if (!product.title || product.title === "Unknown Product") {
      return NextResponse.json(
        { ...product, error: "Could not extract product details. Try entering details manually." },
        { status: 206 }
      );
    }

    return NextResponse.json(product);
  } catch (error: any) {
    console.error("Scrape error:", error.message);
    return NextResponse.json(
      { error: error.message || "Failed to scrape product. Amazon may be blocking the request." },
      { status: 500 }
    );
  }
}
