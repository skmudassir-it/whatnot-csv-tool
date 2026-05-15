/**
 * Apify Amazon Product Scraper client.
 * Uses the junglee/Amazon-crawler actor to scrape product details
 * via Apify's residential proxy network — bypasses Amazon's bot detection.
 */

import { AmazonProduct } from "./amazon";

const APIFY_TOKEN = process.env.APIFY_API_KEY || "";
const ACTOR_ID = "junglee~Amazon-crawler";
const BASE_URL = "https://api.apify.com/v2";

interface ApifyPrice {
  value: number;
  currency: string;
}

interface ApifyAttribute {
  key: string;
  value: string;
}

interface ApifyProductResult {
  title: string;
  url: string;
  asin: string;
  price?: ApifyPrice | null;
  listPrice?: ApifyPrice | null;
  inStock?: boolean;
  brand?: string | null;
  author?: string | null;
  stars?: number | null;
  reviewsCount?: number | null;
  breadCrumbs?: string;
  thumbnailImage?: string;
  galleryThumbnails?: string[];
  highResolutionImages?: string[];
  description?: string | null;
  features?: string[];
  attributes?: ApifyAttribute[];
  condition?: string | null;
}

export interface ApifyScrapeResult extends AmazonProduct {
  /** Apify-enriched fields beyond the base AmazonProduct interface */
  weightDisplay?: string;
  stars?: number | null;
  reviewsCount?: number | null;
  brand?: string | null;
  inStock?: boolean;
  images?: string[];
}

/**
 * Extract weight from Apify attributes and return as display string + ounces.
 */
function extractWeight(attributes?: ApifyAttribute[]): {
  display: string;
} | null {
  if (!attributes) return null;
  const weightAttr = attributes.find(
    (a) => a.key.toLowerCase().includes("weight")
  );
  if (!weightAttr) return null;
  return { display: weightAttr.value };
}

/**
 * Map an Apify result to AmazonProduct format.
 */
function mapApifyToProduct(
  item: ApifyProductResult,
  originalUrl: string
): ApifyScrapeResult {
  const price = item.price || item.listPrice;
  const priceValue = price?.value ?? null;
  const priceDisplay = priceValue
    ? `$${priceValue.toFixed(2)}`
    : "Price not found";

  // Best image: first high-res, then thumbnail
  const images = item.highResolutionImages?.length
    ? item.highResolutionImages
    : item.galleryThumbnails?.length
      ? item.galleryThumbnails
      : [];
  const imageUrl = images[0] || item.thumbnailImage || "";

  // Description: from description field or features list
  let description = item.description || "";
  if (!description && item.features?.length) {
    description = item.features.slice(0, 5).join(" | ");
  }

  // Category: last breadcrumb segment
  let category = "";
  if (item.breadCrumbs) {
    const parts = item.breadCrumbs.split(">").map((s) => s.trim());
    category = parts[parts.length - 1] || "";
  }

  // Weight from attributes
  const weight = extractWeight(item.attributes);

  const brand = item.brand || item.author || null;

  return {
    title: item.title || "Unknown Product",
    price: priceValue,
    priceDisplay,
    imageUrl,
    description: description.substring(0, 500),
    asin: item.asin,
    url: item.url || originalUrl,
    category,
    // Apify extras
    weightDisplay: weight?.display,
    stars: item.stars ?? null,
    reviewsCount: item.reviewsCount ?? null,
    brand,
    inStock: item.inStock ?? undefined,
    images: images.length > 1 ? images.slice(1) : [],
  };
}

/**
 * Start an Apify actor run with the given Amazon URLs.
 * Returns the run ID and dataset ID.
 */
async function startRun(
  urls: string[]
): Promise<{ runId: string; datasetId: string }> {
  const res = await fetch(
    `${BASE_URL}/acts/${ACTOR_ID}/runs?token=${APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryOrProductUrls: urls.map((url) => ({ url })),
        maxItems: urls.length,
        proxyConfiguration: { useApifyProxy: true },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Apify API error: ${res.status} ${res.statusText}`);
  }

  const { data } = await res.json();
  return { runId: data.id, datasetId: data.defaultDatasetId };
}

/**
 * Poll an Apify run until it completes or fails.
 */
async function waitForRun(runId: string): Promise<string> {
  const maxAttempts = 60; // 5 min max
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `${BASE_URL}/acts/${ACTOR_ID}/runs/${runId}?token=${APIFY_TOKEN}`
    );
    const { data } = await res.json();
    const status = data.status;

    if (
      status === "SUCCEEDED" ||
      status === "FAILED" ||
      status === "ABORTED" ||
      status === "TIMED-OUT"
    ) {
      return status;
    }

    // Wait 5 seconds between polls
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error("Apify run timed out after 5 minutes");
}

/**
 * Fetch all items from an Apify dataset.
 */
async function getDatasetItems(datasetId: string): Promise<ApifyProductResult[]> {
  const res = await fetch(
    `${BASE_URL}/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&format=json&clean=true`
  );
  if (!res.ok) {
    throw new Error(
      `Failed to fetch dataset: ${res.status} ${res.statusText}`
    );
  }
  return res.json();
}

/**
 * Scrape multiple Amazon product URLs using Apify.
 * Returns an array of results in the same order as inputs.
 * Unknown/missing results are returned with error status.
 */
export async function scrapeAmazonWithApify(
  urls: string[]
): Promise<ApifyScrapeResult[]> {
  if (!APIFY_TOKEN) {
    throw new Error("APIFY_API_KEY is not configured");
  }

  // Start the run
  const { runId, datasetId } = await startRun(urls);

  // Wait for completion
  const status = await waitForRun(runId);

  if (status !== "SUCCEEDED") {
    throw new Error(`Apify run ended with status: ${status}`);
  }

  // Fetch results
  const rawResults = await getDatasetItems(datasetId);

  // Build a lookup by ASIN for matching results back to input URLs
  // Also match by URL
  const resultByUrl = new Map<string, ApifyProductResult>();
  const resultByAsin = new Map<string, ApifyProductResult>();

  for (const item of rawResults) {
    if (item.url) resultByUrl.set(item.url, item);
    if (item.asin) resultByAsin.set(item.asin, item);
  }

  // Match results to input URLs using ASIN extraction
  const { extractAsin } = await import("./amazon");

  return urls.map((url) => {
    // Try exact URL match first
    const exact = resultByUrl.get(url);
    if (exact) return mapApifyToProduct(exact, url);

    // Try ASIN match
    const asin = extractAsin(url);
    if (asin) {
      const asinMatch = resultByAsin.get(asin);
      if (asinMatch) return mapApifyToProduct(asinMatch, url);
    }

    // No result found — return error placeholder
    return {
      title: "Unknown Product",
      price: null,
      priceDisplay: "Price not found",
      imageUrl: "",
      description: "",
      asin: asin || "UNKNOWN",
      url,
      category: "",
      error: "Product not found via Apify — try entering details manually",
    };
  });
}
