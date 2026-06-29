// Server-only USDA FoodData Central client.
// Free signup at https://fdc.nal.usda.gov/api-key-signup.html.
// DEMO_KEY works for local testing.
//
// Nutrient numbers we extract — see https://fdc.nal.usda.gov/portal-data/external/dataDictionary
//
// 208  Energy (kcal)
// 203  Protein (g)
// 204  Total lipid / fat (g)
// 205  Carbohydrate, by difference (g)
// 291  Fiber, total dietary (g)
// 324  Vitamin D (D2 + D3) — IU
// 328  Vitamin D (D2 + D3) — µg (use whichever is present)
// 418  Vitamin B-12 (µg)
// 303  Iron (mg)
// 304  Magnesium (mg)
// 301  Calcium (mg)
// 306  Potassium (mg)
// 307  Sodium (mg)
// 627  PUFA 18:3 n-3 c,c,c (ALA) g
// 629  PUFA 20:5 n-3 c,c,c,c,c (EPA) g
// 631  PUFA 22:6 n-3 c,c,c,c,c,c (DHA) g

export type FoodServing = {
  gramWeight: number; // grams in one serving
  label: string;      // human label, e.g. "1 container (170 g)"
};

export type UsdaFood = {
  fdcId: number;
  name: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  // Natural serving for unit-based logging, when USDA provides one.
  serving: FoodServing | null;
  // All values are per 100g of the food.
  nutrients: {
    kcal: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    fiberG: number | null;
    vitaminDIu: number | null;
    vitaminB12Ug: number | null;
    ironMg: number | null;
    magnesiumMg: number | null;
    calciumMg: number | null;
    potassiumMg: number | null;
    sodiumMg: number | null;
    omega3Mg: number | null;
  };
};

const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";

function apiKey(): string {
  const k = process.env.USDA_API_KEY;
  if (!k) throw new Error("USDA_API_KEY missing in env");
  return k;
}

function num(v: unknown): number | null {
  if (typeof v !== "number" || Number.isNaN(v)) return null;
  return v;
}

// Parse a USDA foodNutrients array (from /foods/search) into our compact shape.
function pickNutrients(arr: any[]): UsdaFood["nutrients"] {
  // The /foods/search endpoint returns objects shaped like:
  //   { nutrientId, nutrientName, nutrientNumber, unitName, value }
  // Sometimes the field is `nutrientNumber` as a string, e.g. "208".
  const byNumber: Record<string, { value: number | null; unit: string }> = {};
  for (const n of arr ?? []) {
    const number = String(n.nutrientNumber ?? "");
    const value = num(n.value);
    const unit = String(n.unitName ?? "").toUpperCase();
    if (!number) continue;
    byNumber[number] = { value, unit };
  }

  const valOf = (number: string) => byNumber[number]?.value ?? null;
  const unitOf = (number: string) => byNumber[number]?.unit ?? "";

  // Vitamin D: USDA may report as IU (208 → ID 324) or µg (ID 328). Prefer IU,
  // fall back to converting µg → IU (×40).
  let vitaminDIu: number | null = null;
  if (valOf("324") != null) {
    vitaminDIu = valOf("324");
  } else if (valOf("328") != null) {
    vitaminDIu = (valOf("328") as number) * 40;
  }

  // Omega-3: sum of ALA + EPA + DHA (all in g per 100g), convert to mg.
  const ala = valOf("627") ?? 0;
  const epa = valOf("629") ?? 0;
  const dha = valOf("631") ?? 0;
  const omega3G = ala + epa + dha;
  const omega3Mg = omega3G > 0 ? omega3G * 1000 : null;

  return {
    kcal:           valOf("208"),
    proteinG:       valOf("203"),
    carbsG:         valOf("205"),
    fatG:           valOf("204"),
    fiberG:         valOf("291"),
    vitaminDIu,
    vitaminB12Ug:   valOf("418"),
    ironMg:         valOf("303"),
    magnesiumMg:    valOf("304"),
    calciumMg:      valOf("301"),
    potassiumMg:    valOf("306"),
    sodiumMg:       valOf("307"),
    omega3Mg,
  };
}

// Derive a natural serving (grams + label) for unit-based logging.
// Priority: branded serving fields (best for packaged food), then the first
// usable foodPortion (whole foods). Returns null when nothing usable.
function pickServing(hit: any): FoodServing | null {
  const size = num(hit.servingSize);
  const unit = String(hit.servingSizeUnit ?? "").trim().toLowerCase();
  const household = String(hit.householdServingFullText ?? "").trim();
  // grams and milliliters (≈1 g/ml for most foods) are usable directly.
  const massOrVol = ["g", "grm", "gram", "ml", "mlt", "milliliter"].includes(unit);
  if (size != null && size > 0 && massOrVol) {
    const grams = Math.round(size * 100) / 100;
    const label = household ? `${household} (${Math.round(grams)} g)` : `1 serving (${Math.round(grams)} g)`;
    return { gramWeight: grams, label };
  }
  // Whole-food portions (search sometimes includes these).
  const portions = Array.isArray(hit.foodPortions) ? hit.foodPortions : [];
  for (const p of portions) {
    const g = num(p.gramWeight);
    if (g != null && g > 0) {
      const desc = String(
        p.portionDescription || p.modifier || p.measureUnit?.name || "1 serving"
      ).trim();
      return { gramWeight: Math.round(g * 100) / 100, label: `${desc} (${Math.round(g)} g)` };
    }
  }
  return null;
}

function mapHit(hit: any): UsdaFood {
  const rawBarcode = hit.gtinUpc ?? hit.gtin_upc ?? null;
  return {
    fdcId: hit.fdcId,
    name: hit.description || hit.lowercaseDescription || "(unknown)",
    brand: hit.brandOwner || hit.brandName || null,
    category: hit.foodCategory || hit.brandedFoodCategory || null,
    barcode: rawBarcode ? String(rawBarcode).replace(/\D/g, "") || null : null,
    serving: pickServing(hit),
    nutrients: pickNutrients(hit.foodNutrients ?? []),
  };
}

export async function searchUsdaFoods(query: string, pageSize = 15): Promise<UsdaFood[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const url = new URL(`${USDA_BASE}/foods/search`);
  url.searchParams.set("api_key", apiKey());
  url.searchParams.set("query", trimmed);
  url.searchParams.set("pageSize", String(pageSize));
  // Prefer whole foods + branded foods, skip the older SR Legacy noise.
  url.searchParams.set("dataType", "Foundation,SR Legacy,Branded");

  const res = await fetch(url.toString(), {
    // No-store: USDA's data is mostly static but we don't need Vercel caching here.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`USDA search failed (${res.status})`);
  }
  const json = await res.json();
  return (json.foods ?? []).map(mapHit);
}

// Fetch the per-food household portions from USDA's detail endpoint
// (/food/{fdcId}). The search endpoint omits foodPortions, so whole foods
// (apple, oatmeal, chicken) only get real measures — "1 cup", "1 medium",
// "1 slice" — from here. Returns a de-duplicated list of usable servings,
// most common first, capped so the picker stays tidy. Never throws — returns
// [] on any failure so the UI degrades gracefully to 100 g / grams.
export async function getUsdaFoodPortions(fdcId: number): Promise<FoodServing[]> {
  if (!fdcId || !Number.isFinite(fdcId)) return [];
  const url = new URL(`${USDA_BASE}/food/${fdcId}`);
  url.searchParams.set("api_key", apiKey());
  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return [];
    const food = await res.json();

    const out: FoodServing[] = [];
    const seen = new Set<string>();
    const push = (gram: number | null, label: string) => {
      if (gram == null || gram <= 0) return;
      const g = Math.round(gram * 100) / 100;
      const key = `${Math.round(g)}|${label.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ gramWeight: g, label: `${label} (${Math.round(g)} g)` });
    };

    // Branded serving (if this is a branded food).
    const bSize = num(food.servingSize);
    const bUnit = String(food.servingSizeUnit ?? "").trim().toLowerCase();
    const bHousehold = String(food.householdServingFullText ?? "").trim();
    if (bSize != null && bSize > 0 && ["g", "grm", "gram", "ml", "mlt", "milliliter"].includes(bUnit)) {
      push(bSize, bHousehold || "1 serving");
    }

    // Whole-food portions.
    const portions = Array.isArray(food.foodPortions) ? food.foodPortions : [];
    for (const p of portions) {
      const g = num(p.gramWeight);
      const amount = num(p.amount);
      const unitName = p.measureUnit?.name && p.measureUnit.name !== "undetermined" ? String(p.measureUnit.name) : "";
      const modifier = String(p.modifier ?? "").trim();
      const desc = String(p.portionDescription ?? "").trim();
      let label: string;
      if (desc && desc.toLowerCase() !== "quantity not specified") {
        label = desc;
      } else {
        const unit = unitName || modifier || "serving";
        label = `${amount ?? 1} ${unit}`.trim();
      }
      push(g, label);
    }

    return out.slice(0, 6);
  } catch {
    return [];
  }
}

// Barcode → UsdaFood, or null if no match in USDA's Branded set. USDA's
// /foods/search accepts the barcode as a query and returns hits where
// `gtinUpc` matches. We prefer an exact gtinUpc match; if nothing matches
// exactly we return null rather than guessing.
export async function lookupUsdaFoodByBarcode(rawCode: string): Promise<UsdaFood | null> {
  const code = String(rawCode).replace(/\D/g, "");
  if (code.length < 6) return null;
  const url = new URL(`${USDA_BASE}/foods/search`);
  url.searchParams.set("api_key", apiKey());
  url.searchParams.set("query", code);
  url.searchParams.set("pageSize", "10");
  url.searchParams.set("dataType", "Branded");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`USDA barcode lookup failed (${res.status})`);
  }
  const json = await res.json();
  const hits = (json.foods ?? []) as any[];
  // Prefer exact gtinUpc match. USDA sometimes pads UPC-A → 13-digit EAN, so
  // also accept matches where one is a zero-padded version of the other.
  const exact = hits.find((h) => {
    const v = String(h.gtinUpc ?? "").replace(/\D/g, "");
    return v === code || v.replace(/^0+/, "") === code.replace(/^0+/, "");
  });
  if (!exact) return null;
  return mapHit(exact);
}
