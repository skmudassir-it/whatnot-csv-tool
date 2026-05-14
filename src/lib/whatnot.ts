/**
 * Whatnot CSV generation utilities.
 * Matches the official Whatnot bulk import CSV format (US sellers).
 */

import { AmazonProduct } from "./amazon";
import { ouncesToProfile } from "./weight-profiles";

export interface WhatnotItem {
  /** Amazon product data (may be partial if scraping failed) */
  product: Partial<AmazonProduct>;
  /** User-specified quantity */
  quantity: number;
  /** Item weight in ounces (user entered or 0) */
  weightOz: number;
  /** Override title (if scraping failed) */
  manualTitle?: string;
  /** Override price (if scraping failed) */
  manualPrice?: number;
  /** Category override */
  categoryOverride?: string;
  /** Condition (default: "New") */
  condition?: string;
  /** Type: "Buy it Now" or "Auction" */
  type?: string;
  /** SKU override */
  sku?: string;
}

/** Allowed Whatnot condition values */
export const CONDITIONS = [
  "New",
  "New with tags",
  "New without tags",
  "Like New",
  "Good",
  "Fair",
  "Poor",
  "Used",
  "Pre-owned",
] as const;

/** CSV header row matching Whatnot's template exactly */
const CSV_HEADERS = [
  "Category",
  "Sub Category",
  "Title",
  "Description",
  "Quantity",
  "Type",
  "Price",
  "Shipping Profile",
  "Offerable",
  "Hazmat",
  "Condition",
  "Cost Per Item",
  "SKU",
  "Image URL 1",
  "Image URL 2",
  "Image URL 3",
  "Image URL 4",
  "Image URL 5",
  "Image URL 6",
  "Image URL 7",
  "Image URL 8",
];

function escapeCsvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // If the value contains commas, quotes, or newlines, wrap in quotes
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateSKU(asin: string, index: number): string {
  if (asin && asin !== "UNKNOWN") return asin;
  return `ITEM-${String(index + 1).padStart(4, "0")}`;
}

/**
 * Generate a Whatnot-compatible CSV file content from items array.
 */
export function generateWhatnotCSV(items: WhatnotItem[]): string {
  const rows: string[][] = [CSV_HEADERS];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const p = item.product;
    
    const title = item.manualTitle || p.title || "Unknown Product";
    const price = item.manualPrice ?? p.price ?? 0;
    const sku = item.sku || generateSKU(p.asin || "", i);
    const weightOz = item.weightOz || 0;
    const condition = item.condition || "New";
    const type = item.type || "Buy it Now";
    
    // Determine category - use override, or detected category, or fallback
    let category = item.categoryOverride || p.category || "";
    // Map common Amazon categories to Whatnot categories
    if (!category) {
      category = "Other";
    }
    
    const row = [
      category,                    // Category
      "",                           // Sub Category (leave empty by default)
      title.substring(0, 200),      // Title
      p.description?.substring(0, 500) || title,  // Description
      String(item.quantity),        // Quantity
      type,                         // Type
      price.toFixed(2),             // Price
      ouncesToProfile(weightOz),    // Shipping Profile
      "TRUE",                       // Offerable
      "Not Hazmat",                 // Hazmat (always Not Hazmat per user)
      condition,                    // Condition
      price.toFixed(2),             // Cost Per Item
      sku,                          // SKU
      p.imageUrl || "",             // Image URL 1
      "",                           // Image URL 2
      "",                           // Image URL 3
      "",                           // Image URL 4
      "",                           // Image URL 5
      "",                           // Image URL 6
      "",                           // Image URL 7
      "",                           // Image URL 8
    ];

    rows.push(row);
  }

  return rows.map(row => row.map(escapeCsvField).join(",")).join("\n");
}

/**
 * Download a CSV string as a file in the browser.
 */
export function downloadCsv(csvContent: string, filename: string = "whatnot-inventory.csv"): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
