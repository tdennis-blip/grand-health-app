import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth/server";
import { getUsdaFoodPortions } from "@/lib/usda";

// GET /api/foods/portions?fdcId=<id>
// Returns household serving options for a USDA food (cup, slice, medium, …).
// Empty list on anything unusable — the client falls back to 100 g / grams.
export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fdcId = Number(request.nextUrl.searchParams.get("fdcId"));
  if (!fdcId || !Number.isFinite(fdcId)) return NextResponse.json({ portions: [] });

  try {
    const portions = await getUsdaFoodPortions(fdcId);
    return NextResponse.json({ portions });
  } catch {
    return NextResponse.json({ portions: [] });
  }
}
