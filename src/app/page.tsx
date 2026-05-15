"use client";

import { useState, useCallback } from "react";
import { AmazonProduct } from "@/lib/amazon";
import { WhatnotItem, generateWhatnotCSV, downloadCsv } from "@/lib/whatnot";
import { parseWeight } from "@/lib/weight-profiles";

interface ProductEntry {
  url: string;
  product: Partial<AmazonProduct> | null;
  loading: boolean;
  error: string | null;
  quantity: number;
  weightInput: string;
  weightOz: number;
  manualTitle: string;
  manualPrice: string;
  condition: string;
  // Apify-enriched fields
  weightDisplay?: string;
  stars?: number | null;
  reviewsCount?: number | null;
  brand?: string | null;
  inStock?: boolean;
}

export default function Home() {
  const [urls, setUrls] = useState("");
  const [entries, setEntries] = useState<ProductEntry[]>([]);
  const [scraping, setScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState({ current: 0, total: 0 });

  const handleSubmitUrls = useCallback(async () => {
    // Parse lines: "URL | quantity | weight" or just "URL"
    const lines = urls
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    const parsed = lines.map((line) => {
      const parts = line.split("|").map((s) => s.trim());
      const url = parts[0] || "";
      const qty = parseInt(parts[1]) || 1;
      const weightInput = parts[2] || "";
      const parsedWeight = weightInput ? parseWeight(weightInput) : null;
      return { url, quantity: qty, weightInput, weightOz: parsedWeight?.ounces || 0 };
    });

    const withAmazonUrls = parsed.filter((p) => p.url.includes("amazon."));

    if (withAmazonUrls.length === 0) {
      alert("Please paste at least one valid Amazon URL.");
      return;
    }

    // Set all entries to loading with pre-filled quantity/weight
    const initial: ProductEntry[] = withAmazonUrls.map((p) => ({
      url: p.url,
      product: null,
      loading: true,
      error: null,
      quantity: p.quantity,
      weightInput: p.weightInput,
      weightOz: p.weightOz,
      manualTitle: "",
      manualPrice: "",
      condition: "New",
    }));

    setEntries(initial);
    setScraping(true);
    setScrapeProgress({ current: 0, total: withAmazonUrls.length });

    try {
      const res = await fetch("/api/scrape-apify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: urlList }),
      });

      const data = await res.json();

      if (data.error) {
        // Global error — mark all as failed with manual fallback
        setEntries((prev) =>
          prev.map((e) => ({
            ...e,
            loading: false,
            error: data.error,
            product: {
              title: "Unknown Product",
              price: null,
              priceDisplay: "Price not found",
              imageUrl: "",
              description: "",
              asin: "UNKNOWN",
              url: e.url,
              category: "",
            },
          }))
        );
      } else {
        // Populate from batch results
        const results = data.results || [];
        setEntries((prev) =>
          prev.map((e, i) => {
            const result = results[i];
            if (!result || result.error) {
              return {
                ...e,
                loading: false,
                error: result?.error || "Failed to fetch product",
                product: result || {
                  title: "Unknown Product",
                  price: null,
                  priceDisplay: "Price not found",
                  imageUrl: "",
                  description: "",
                  asin: "UNKNOWN",
                  url: e.url,
                  category: "",
                },
                manualTitle: result?.title || "",
                manualPrice: result?.priceDisplay || "",
              };
            }
            return {
              ...e,
              loading: false,
              product: result,
              manualTitle: result.title || "",
              manualPrice: result.price?.toString() || "",
              // Auto-fill weight from Apify data
              weightInput: (result as any).weightDisplay || "",
              weightOz: (result as any).weightDisplay
                ? parseWeight((result as any).weightDisplay)?.ounces || 0
                : 0,
              weightDisplay: (result as any).weightDisplay,
              stars: (result as any).stars,
              reviewsCount: (result as any).reviewsCount,
              brand: (result as any).brand,
              inStock: (result as any).inStock,
            };
          })
        );
      }
    } catch (err: any) {
      setEntries((prev) =>
        prev.map((e) => ({
          ...e,
          loading: false,
          error: "Failed to connect to scraper",
        }))
      );
    } finally {
      setScraping(false);
      setScrapeProgress({ current: urlList.length, total: urlList.length });
    }
  }, [urls]);

  const updateEntry = useCallback(
    (index: number, updates: Partial<ProductEntry>) => {
      setEntries((prev) =>
        prev.map((e, i) => {
          if (i !== index) return e;
          const updated = { ...e, ...updates };
          
          // If weight input changed, recalculate ounces
          if ("weightInput" in updates && updates.weightInput !== undefined) {
            const parsed = parseWeight(updated.weightInput);
            updated.weightOz = parsed?.ounces || 0;
          }
          
          return updated;
        })
      );
    },
    []
  );

  const handleGenerateCsv = useCallback(() => {
    const items: WhatnotItem[] = entries.map((e) => ({
      product: e.product || {},
      quantity: e.quantity,
      weightOz: e.weightOz,
      manualTitle: e.manualTitle || undefined,
      manualPrice: e.manualPrice ? parseFloat(e.manualPrice) || undefined : undefined,
      condition: e.condition,
    }));

    if (items.length === 0) {
      alert("No items to generate CSV from.");
      return;
    }

    const csv = generateWhatnotCSV(items);
    downloadCsv(csv);
  }, [entries]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Amazon → Whatnot{" "}
              <span className="text-purple-400">CSV</span>
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Paste Amazon URLs, set quantity &amp; weight, download inventory CSV
            </p>
          </div>
          {entries.length > 0 && (
            <button
              onClick={handleGenerateCsv}
              className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl text-sm transition-colors shadow-lg shadow-purple-600/20"
            >
              ⬇ Generate CSV
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* URL Input Section */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold mb-1">Paste Amazon URLs</h2>
            <p className="text-sm text-zinc-500">
              Format: <code className="bg-zinc-800 px-1 rounded text-purple-400">URL | quantity | weight</code> — one per line
            </p>
          </div>
          <textarea
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder={`https://www.amazon.com/dp/B0EXAMPLE1 | 5 | 8 oz\nhttps://www.amazon.com/dp/B0EXAMPLE2 | 2 | 1.5 lbs\nhttps://www.amazon.com/dp/B0EXAMPLE3 | 1 | 4 oz`}
            className="w-full h-32 bg-zinc-950 border border-zinc-700 rounded-xl p-4 text-sm font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 resize-y transition-colors"
            disabled={scraping}
          />
          <button
            onClick={handleSubmitUrls}
            disabled={scraping || !urls.trim()}
            className="px-6 py-2.5 bg-zinc-100 hover:bg-white text-zinc-900 font-semibold rounded-xl text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {scraping ? (
              <span className="flex items-center gap-2">
                <Spinner />
                Scraping via Apify...
              </span>
            ) : (
              "🔍 Scrape Products"
            )}
          </button>
        </section>

        {/* Results Section */}
        {entries.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Products ({entries.length})
              </h2>
              <span className="text-xs text-zinc-500">
                Hazmat set to <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-green-400">Not Hazmat</code> for all items
              </span>
            </div>

            <div className="space-y-3">
              {entries.map((entry, i) => (
                <ProductCard
                  key={`${entry.url}-${i}`}
                  entry={entry}
                  index={i}
                  onChange={(updates) => updateEntry(i, updates)}
                />
              ))}
            </div>

            {/* Bottom Generate Button */}
            <div className="flex justify-center pt-4">
              <button
                onClick={handleGenerateCsv}
                className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-base transition-colors shadow-lg shadow-purple-600/25"
              >
                ⬇ Download Whatnot CSV ({entries.length} items)
              </button>
            </div>
          </section>
        )}

        {/* Empty state */}
        {entries.length === 0 && (
          <div className="text-center py-16 text-zinc-600">
            <div className="text-5xl mb-4">📦</div>
            <p className="text-lg font-medium">Paste Amazon URLs above to get started</p>
            <p className="text-sm mt-1">
              The app will extract product details and let you set quantity &amp; weight
            </p>

            {/* CSV Details */}
            <div className="mt-8 inline-block text-left bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-400 mb-2">
                Whatnot CSV format generated:
              </h3>
              <div className="text-xs text-zinc-500 space-y-0.5 font-mono">
                <p>Category · Sub Category · Title · Description</p>
                <p>Quantity · Type · Price · Shipping Profile</p>
                <p>Offerable · <span className="text-green-400">Hazmat</span> · Condition</p>
                <p>Cost Per Item · SKU · Image URL 1–8</p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-4 text-center text-xs text-zinc-600">
        Amazon → Whatnot CSV Tool · Hazmat always <code className="bg-zinc-800 px-1 rounded">Not Hazmat</code> ·
        No batteries ⚡
      </footer>
    </div>
  );
}

/* ── Product Card Component ── */

function ProductCard({
  entry,
  index,
  onChange,
}: {
  entry: ProductEntry;
  index: number;
  onChange: (updates: Partial<ProductEntry>) => void;
}) {
  const p = entry.product;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 transition-colors hover:border-zinc-700">
      {/* Loading State */}
      {entry.loading && (
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-zinc-800 rounded-xl animate-pulse shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-zinc-800 rounded animate-pulse w-3/4" />
            <div className="h-3 bg-zinc-800 rounded animate-pulse w-1/2" />
          </div>
          <Spinner />
        </div>
      )}

      {/* Error State */}
      {!entry.loading && entry.error && !p?.title && (
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <span className="text-red-400 shrink-0 mt-0.5">⚠️</span>
            <div>
              <p className="text-sm text-red-400 font-medium">Scraping failed</p>
              <p className="text-xs text-zinc-500 mt-0.5">{entry.error}</p>
              <a
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-purple-400 hover:underline mt-1 inline-block"
              >
                Open on Amazon ↗
              </a>
            </div>
          </div>
          <p className="text-xs text-zinc-500 font-medium">Enter details manually:</p>
          <ManualEntry entry={entry} onChange={onChange} />
        </div>
      )}

      {/* Success State */}
      {!entry.loading && (p?.title || entry.error) && (
        <div className="space-y-4">
          {/* Product Info Row */}
          <div className="flex gap-4">
            {/* Image */}
            {p?.imageUrl && (
              <div className="w-20 h-20 bg-zinc-800 rounded-xl overflow-hidden shrink-0">
                <img
                  src={p.imageUrl}
                  alt={p.title}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}

            {/* Details */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm leading-snug line-clamp-2">
                {p?.title || entry.manualTitle || "Unknown Product"}
              </h3>
              <div className="flex items-center gap-3 mt-1.5">
                {p?.priceDisplay && (
                  <span className="text-purple-400 font-bold text-sm">
                    {p.priceDisplay}
                  </span>
                )}
                {p?.asin && p.asin !== "UNKNOWN" && (
                  <span className="text-xs text-zinc-600 font-mono">
                    {p.asin}
                  </span>
                )}
              </div>
              {p?.description && p.description !== p?.title && (
                <p className="text-xs text-zinc-500 mt-1.5 line-clamp-2">
                  {p.description}
                </p>
              )}
              {entry.error && p?.title && (
                <p className="text-xs text-amber-400/70 mt-1">
                  ⚠️ Partial data — verify before exporting
                </p>
              )}
              {/* Apify-enriched details */}
              {entry.stars && (
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-yellow-400 text-xs">{"★".repeat(Math.round(entry.stars))}</span>
                  <span className="text-xs text-zinc-400">{entry.stars}</span>
                  {entry.reviewsCount && (
                    <span className="text-xs text-zinc-500">({entry.reviewsCount.toLocaleString()} reviews)</span>
                  )}
                </div>
              )}
              {entry.brand && (
                <p className="text-xs text-zinc-500 mt-0.5">by {entry.brand}</p>
              )}
              {entry.inStock !== undefined && (
                <span className={`text-xs mt-1 inline-block ${entry.inStock ? "text-green-400" : "text-red-400"}`}>
                  {entry.inStock ? "● In Stock" : "○ Out of Stock"}
                </span>
              )}
            </div>

            {/* Item number badge */}
            <span className="text-xs text-zinc-600 font-mono shrink-0">
              #{index + 1}
            </span>
          </div>

          {/* Inputs Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Quantity */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Quantity</label>
              <input
                type="number"
                min={1}
                max={999}
                value={entry.quantity}
                onChange={(e) =>
                  onChange({ quantity: parseInt(e.target.value) || 1 })
                }
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            {/* Weight */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                Weight <span className="text-zinc-600">(oz or lbs)</span>
              </label>
              <input
                type="text"
                value={entry.weightInput}
                onChange={(e) => onChange({ weightInput: e.target.value })}
                placeholder='e.g. "8 oz"'
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            {/* Shipping Profile (auto) */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                Shipping Profile
              </label>
              <div className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-400">
                {entry.weightOz > 0
                  ? parseWeight(entry.weightInput)?.profile || "—"
                  : "—"}
              </div>
            </div>

            {/* Condition */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Condition</label>
              <select
                value={entry.condition}
                onChange={(e) => onChange({ condition: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-purple-500 transition-colors"
              >
                <option>New</option>
                <option>New with tags</option>
                <option>New without tags</option>
                <option>Like New</option>
                <option>Good</option>
                <option>Fair</option>
                <option>Poor</option>
                <option>Used</option>
                <option>Pre-owned</option>
              </select>
            </div>
          </div>

          {/* Hazmat indicator */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-600">Hazmat:</span>
            <span className="bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-md font-medium">
              Not Hazmat ✓
            </span>
            <span className="text-zinc-600">· No batteries</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Manual Entry (when scraping fails) ── */

function ManualEntry({
  entry,
  onChange,
}: {
  entry: ProductEntry;
  onChange: (updates: Partial<ProductEntry>) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="sm:col-span-2">
        <label className="block text-xs text-zinc-500 mb-1">Title</label>
        <input
          type="text"
          value={entry.manualTitle}
          onChange={(e) => onChange({ manualTitle: e.target.value })}
          placeholder="Product title"
          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 transition-colors"
        />
      </div>
      <div>
        <label className="block text-xs text-zinc-500 mb-1">Price ($)</label>
        <input
          type="text"
          value={entry.manualPrice}
          onChange={(e) => onChange({ manualPrice: e.target.value })}
          placeholder="29.99"
          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 transition-colors"
        />
      </div>
    </div>
  );
}

/* ── Spinner ── */

function Spinner() {
  return (
    <div className="w-5 h-5 border-2 border-zinc-600 border-t-purple-400 rounded-full animate-spin shrink-0" />
  );
}
