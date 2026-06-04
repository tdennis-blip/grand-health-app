import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { lookupUsdaFoodByBarcode, type UsdaFood } from "@/lib/usda";

// GET /api/foods/barcode?code=<gtin/upc/ean>
//
// Resolution order:
//   1. Look in our own foods table by `barcode`. If present, return it as a
//      USDA-shaped row keyed by our cached foodId (the client treats either
//      shape the same way for quick-add).
//   2. Otherwise ask USDA. If USDA returns a match, return it AS a UsdaFood
//      and let the client's add-entry action cache it on insert.
//   3. Otherwise 404 — the UI offers to create a custom food prefilled with
//      the scanned code.
export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = request.nextUrl.searchParams.get("code") ?? "";
  const code = raw.replace(/\D/g, "");
  if (code.length < 6) {
    return NextResponse.json({ error: "Bad barcode" }, { status: 400 });
  }

  // 1. Local cache hit
  const [cached] = await withAuth(user, (sql) =>
    sql`SELECT id, source, source_id, name, brand, category, barcode, kcal_per_100, protein_g_per_100, carbs_g_per_100, fat_g_per_100, fiber_g_per_100, vitamin_d_iu_per_100, vitamin_b12_ug_per_100, iron_mg_per_100, magnesium_mg_per_100, calcium_mg_per_100, potassium_mg_per_100, sodium_mg_per_100, omega3_mg_per_100 FROM foods WHERE barcode = ${code} LIMIT 1`
  );

  if (cached) {
    return NextResponse.json({ source: "cache", food: cachedToShape(cached) });
  }

  // 2. USDA lookup
  let hit: UsdaFood | null = null;
  try {
    hit = await lookupUsdaFoodByBarcode(code);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Lookup failed" }, { status: 502 });
  }

  if (hit) {
    return NextResponse.json({ source: "usda", food: hit });
  }

  return NextResponse.json({ source: "none", code }, { status: 404 });
}

function num(v: any): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cachedToShape(row: any) {
  // Mirror the UsdaFood-ish shape so the client can hand it to either
  // addFoodLogEntry (which dedups by source/source_id) or quickAdd (by id).
  return {
    foodId: row.id as string,
    fdcId: row.source === "usda" && row.source_id ? Number(row.source_id) : null,
    name: row.name as string,
    brand: row.brand ?? null,
    category: row.category ?? null,
    barcode: row.barcode ?? null,
    nutrients: {
      kcal: num(row.kcal_per_100),
      proteinG: num(row.protein_g_per_100),
      carbsG: num(row.carbs_g_per_100),
      fatG: num(row.fat_g_per_100),
      fiberG: num(row.fiber_g_per_100),
      vitaminDIu: num(row.vitamin_d_iu_per_100),
      vitaminB12Ug: num(row.vitamin_b12_ug_per_100),
      ironMg: num(row.iron_mg_per_100),
      magnesiumMg: num(row.magnesium_mg_per_100),
      calciumMg: num(row.calcium_mg_per_100),
      potassiumMg: num(row.potassium_mg_per_100),
      sodiumMg: num(row.sodium_mg_per_100),
      omega3Mg: num(row.omega3_mg_per_100),
    },
  };
}
