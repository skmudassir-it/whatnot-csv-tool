/**
 * Weight → Whatnot Shipping Profile mapping
 * Based on Whatnot's allowed shipping profile values (US sellers)
 */

export interface WeightProfile {
  label: string;       // Display label
  value: string;       // Whatnot CSV value
  maxOunces: number;   // Upper bound in ounces
}

export const SHIPPING_PROFILES: WeightProfile[] = [
  { label: "0–1 oz", value: "0-1 oz", maxOunces: 1 },
  { label: "1–4 oz", value: "1-4 oz", maxOunces: 4 },
  { label: "4–8 oz", value: "4-8 oz", maxOunces: 8 },
  { label: "8–12 oz", value: "8-12 oz", maxOunces: 12 },
  { label: "12–16 oz", value: "12-16 oz", maxOunces: 16 },
  { label: "1–2 lbs", value: "1-2 lbs", maxOunces: 32 },
  { label: "2–3 lbs", value: "2-3 lbs", maxOunces: 48 },
  { label: "3–4 lbs", value: "3-4 lbs", maxOunces: 64 },
  { label: "4–5 lbs", value: "4-5 lbs", maxOunces: 80 },
  { label: "5–10 lbs", value: "5-10 lbs", maxOunces: 160 },
  { label: "10–20 lbs", value: "10-20 lbs", maxOunces: 320 },
  { label: "20+ lbs", value: "20+ lbs", maxOunces: Infinity },
];

/**
 * Convert ounces to the closest matching Whatnot shipping profile.
 */
export function ouncesToProfile(totalOz: number): string {
  for (const profile of SHIPPING_PROFILES) {
    if (totalOz <= profile.maxOunces) {
      return profile.value;
    }
  }
  return "20+ lbs";
}

/**
 * Convert pounds to ounces, then get the profile.
 */
export function poundsToProfile(lbs: number): string {
  return ouncesToProfile(lbs * 16);
}

/**
 * Parse a weight string like "1.5 lbs", "12 oz", "2lb", "8oz" into ounces.
 */
export function parseWeight(input: string): { ounces: number; profile: string } | null {
  const cleaned = input.trim().toLowerCase().replace(/\s+/g, " ");
  
  // Try "X lbs" / "X lb" / "X pounds" / "X pound"
  const lbsMatch = cleaned.match(/^([\d.]+)\s*(lbs?|pounds?)$/);
  if (lbsMatch) {
    const lbs = parseFloat(lbsMatch[1]);
    if (isNaN(lbs)) return null;
    const ounces = lbs * 16;
    return { ounces, profile: poundsToProfile(lbs) };
  }
  
  // Try "X oz" / "X ounces" / "X ounce"
  const ozMatch = cleaned.match(/^([\d.]+)\s*(oz|ounces?)$/);
  if (ozMatch) {
    const oz = parseFloat(ozMatch[1]);
    if (isNaN(oz)) return null;
    return { ounces: oz, profile: ouncesToProfile(oz) };
  }
  
  // Try just a number (assume ounces)
  const numMatch = cleaned.match(/^([\d.]+)$/);
  if (numMatch) {
    const oz = parseFloat(numMatch[1]);
    if (isNaN(oz)) return null;
    return { ounces: oz, profile: ouncesToProfile(oz) };
  }
  
  return null;
}
