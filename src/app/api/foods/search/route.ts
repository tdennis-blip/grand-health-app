import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth/server";
import { searchUsdaFoods } from "@/lib/usda";

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ foods: [] });

  try {
    const foods = await searchUsdaFoods(q, 15);
    return NextResponse.json({ foods });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "USDA search failed" }, { status: 500 });
  }
}
