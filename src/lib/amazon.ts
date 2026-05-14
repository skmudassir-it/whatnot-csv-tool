/**
 * Amazon product scraping utilities.
 * Extracts product details from Amazon product pages.
 */

export interface AmazonProduct {
  title: string;
  price: number | null;
  priceDisplay: string;
  imageUrl: string;
  description: string;
  asin: string;
  url: string;
  category: string;
  error?: string;
}

/**
 * Extract ASIN from Amazon URL.
 * Supports: /dp/ASIN, /gp/product/ASIN, ?asin=ASIN
 */
export function extractAsin(url: string): string | null {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/,
    /\/gp\/product\/([A-Z0-9]{10})/,
    /\/ASIN\/([A-Z0-9]{10})/,
    /\/product\/([A-Z0-9]{10})/,
    /[?&]asin=([A-Z0-9]{10})/i,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/**
 * Clean an Amazon URL to just the canonical /dp/ASIN form.
 */
export function cleanAmazonUrl(url: string): string {
  const asin = extractAsin(url);
  if (!asin) return url;
  // Extract the domain
  const domainMatch = url.match(/https?:\/\/(?:www\.)?([^\/]+)/);
  const domain = domainMatch ? domainMatch[0] : "https://www.amazon.com";
  return `${domain}/dp/${asin}`;
}

/**
 * Fetch and parse an Amazon product page.
 * Returns product details or throws an error.
 */
export async function scrapeAmazonProduct(url: string): Promise<AmazonProduct> {
  const cleanUrl = cleanAmazonUrl(url);
  const asin = extractAsin(url) || "UNKNOWN";

  // Try multiple User-Agent strings
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  ];

  let html = "";
  let lastError: Error | null = null;

  for (const ua of userAgents) {
    try {
      const response = await fetch(cleanUrl, {
        headers: {
          "User-Agent": ua,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (response.status === 503 || response.status === 403) {
        // Bot detection — try next UA
        lastError = new Error(`Amazon blocked the request (${response.status})`);
        continue;
      }

      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        continue;
      }

      html = await response.text();
      
      // Check for bot detection page
      if (html.includes("Type the characters you see") || 
          html.includes("Enter the characters you see") ||
          html.includes("robot check") ||
          html.length < 1000) {
        lastError = new Error("Amazon returned a bot detection page");
        continue;
      }
      
      lastError = null;
      break;
    } catch (err: any) {
      lastError = err;
      if (err.name === "AbortError" || err.name === "TimeoutError") {
        continue;
      }
      break;
    }
  }

  if (lastError || !html) {
    throw lastError || new Error("Failed to fetch Amazon page");
  }

  // Parse with cheerio (dynamic import for server-side usage)
  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);

  // --- Extract Title ---
  let title = $("#productTitle").text().trim();
  if (!title) {
    title = $('meta[property="og:title"]').attr("content")?.trim() || "";
  }
  if (!title) {
    title = $("title").text().trim().replace(/:? Amazon\.com.*$/, "").trim();
  }
  title = title.replace(/\s+/g, " ").trim();

  // --- Extract Price ---
  let price: number | null = null;
  let priceDisplay = "";

  // Try og:price:amount meta tag
  const metaPrice = $('meta[property="product:price:amount"]').attr("content");
  if (metaPrice) {
    price = parseFloat(metaPrice);
    if (!isNaN(price)) {
      priceDisplay = `$${price.toFixed(2)}`;
    }
  }

  // Try various price selectors
  if (!price) {
    const priceText = $(".a-price .a-offscreen").first().text().trim() ||
      $("#priceblock_ourprice").text().trim() ||
      $("#priceblock_dealprice").text().trim() ||
      $(".a-price-whole").first().text().trim();
    
    if (priceText) {
      const num = parseFloat(priceText.replace(/[^0-9.]/g, ""));
      if (!isNaN(num)) {
        price = num;
        priceDisplay = `$${num.toFixed(2)}`;
      }
    }
  }

  // --- Extract Image ---
  let imageUrl = "";
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) {
    imageUrl = ogImage;
  } else {
    const imgEl = $("#landingImage");
    if (imgEl.length) {
      imageUrl = imgEl.attr("src") || "";
      // Try data-old-hires for higher resolution
      const hires = imgEl.attr("data-old-hires");
      if (hires) imageUrl = hires;
    }
  }

  // --- Extract Description ---
  let description = "";
  
  // Feature bullets
  const bullets = $("#feature-bullets .a-list-item")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  
  if (bullets.length > 0) {
    description = bullets.slice(0, 5).join(" | ");
  }

  // Fallback to product description
  if (!description) {
    description = $("#productDescription p").first().text().trim() ||
      $("#productDescription").text().trim() || "";
    description = description.replace(/\s+/g, " ").trim().substring(0, 500);
  }

  if (!description && title) {
    description = title;
  }

  // --- Category ---
  let category = "";
  const breadcrumbs = $("#wayfinding-breadcrumbs_feature_div .a-link-normal, #breadcrumb-feature_div .a-link-normal")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  if (breadcrumbs.length > 0) {
    category = breadcrumbs[breadcrumbs.length - 1];
  }

  return {
    title: title || "Unknown Product",
    price,
    priceDisplay: priceDisplay || "Price not found",
    imageUrl,
    description: description.substring(0, 500),
    asin,
    url: cleanUrl,
    category,
  };
}
