"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Search, Plus, Trash2, X, Star, Barcode, Pencil } from "lucide-react";
import type { DayEntry, QuickFood } from "@/lib/diet";
import { addFoodLogEntry, removeFoodLogEntry, quickAddFoodLogEntry } from "./entry-actions";
import { toggleFoodFavorite } from "./favorite-actions";
import type { UsdaFood, FoodServing } from "@/lib/usda";
import { BarcodeScanner } from "./barcode-scanner";
import { CustomFoodForm } from "./custom-food-form";

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
type Meal = typeof MEALS[number];

const MEAL_LABEL: Record<Meal, string> = {
  breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snacks",
};

function defaultMealForNow(): Meal {
  const h = new Date().getHours();
  if (h < 10) return "breakfast";
  if (h < 14) return "lunch";
  if (h < 20) return "dinner";
  return "snack";
}

// Shape returned by /api/foods/barcode for a cache hit. It mirrors UsdaFood
// but carries our cached foodId.
type CachedFood = {
  foodId: string;
  fdcId: number | null;
  name: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  serving?: FoodServing | null;
  nutrients: UsdaFood["nutrients"];
};

export function FoodLogger({
  logDate,
  entries,
  favorites,
  recents,
}: {
  logDate: string;
  entries: DayEntry[];
  favorites: QuickFood[];
  recents: QuickFood[];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMeal, setPickerMeal] = useState<Meal>("breakfast");
  // Optional preselection — set when a quick-add chip is tapped (we still open
  // the picker so the user can confirm grams/meal).
  const [picker_preselect, setPickerPreselect] = useState<QuickFood | null>(null);
  // Barcode-driven preselect: a USDA-shaped record possibly with a cached
  // foodId; the picker handles either.
  const [pickerScanResult, setPickerScanResult] = useState<{
    kind: "usda" | "cache";
    food: UsdaFood | CachedFood;
    code: string;
  } | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState<{ barcode?: string | null } | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const byMeal: Record<Meal, DayEntry[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
  entries.forEach((e) => { byMeal[e.meal as Meal]?.push(e); });

  const handleScanned = async (code: string) => {
    setScannerOpen(false);
    setStatusMsg("Looking up barcode…");
    try {
      const res = await fetch(`/api/foods/barcode?code=${encodeURIComponent(code)}`);
      if (res.status === 404) {
        setStatusMsg(null);
        setCustomOpen({ barcode: code });
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `Lookup failed (${res.status})`);
      }
      const json = await res.json();
      setStatusMsg(null);
      setPickerMeal(defaultMealForNow());
      setPickerScanResult({
        kind: json.source === "cache" ? "cache" : "usda",
        food: json.food,
        code,
      });
      setPickerOpen(true);
    } catch (e: any) {
      setStatusMsg(e?.message ?? "Lookup failed");
      setTimeout(() => setStatusMsg(null), 3000);
    }
  };

  const openPicker = (meal: Meal, preselect?: QuickFood | null) => {
    setPickerMeal(meal);
    setPickerPreselect(preselect ?? null);
    setPickerScanResult(null);
    setPickerOpen(true);
  };

  return (
    <>
      {(favorites.length > 0 || recents.length > 0) && (
        <QuickAddStrip
          logDate={logDate}
          favorites={favorites}
          recents={recents}
          onCustomize={(qf) => openPicker(qf.defaultMeal ?? defaultMealForNow(), qf)}
        />
      )}

      <section className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Today's log</div>
            <div className="text-sm font-semibold text-slate-900">
              {entries.length} {entries.length === 1 ? "entry" : "entries"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScannerOpen(true)}
              title="Scan barcode"
              className="text-xs font-semibold border border-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg flex items-center gap-1 hover:bg-slate-50"
            >
              <Barcode size={13} /> Scan
            </button>
            <button
              onClick={() => openPicker("breakfast")}
              className="text-xs font-semibold bg-teal-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-teal-800"
            >
              <Plus size={13} /> Add food
            </button>
          </div>
        </div>

        {statusMsg && (
          <div className="mb-3 text-[12px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            {statusMsg}
          </div>
        )}

        <div className="space-y-3">
          {MEALS.map((meal) => (
            <MealSection
              key={meal}
              meal={meal}
              entries={byMeal[meal]}
              onAdd={() => openPicker(meal)}
            />
          ))}
        </div>
      </section>

      {pickerOpen && (
        <FoodPicker
          logDate={logDate}
          initialMeal={pickerMeal}
          preselectQuickFood={picker_preselect}
          preselectScan={pickerScanResult}
          onClose={() => {
            setPickerOpen(false);
            setPickerPreselect(null);
            setPickerScanResult(null);
          }}
          onCreateCustom={(barcode) => {
            setPickerOpen(false);
            setPickerPreselect(null);
            setPickerScanResult(null);
            setCustomOpen({ barcode: barcode ?? null });
          }}
        />
      )}

      {scannerOpen && (
        <BarcodeScanner
          onScanned={handleScanned}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {customOpen && (
        <CustomFoodForm
          initialBarcode={customOpen.barcode ?? null}
          onClose={() => setCustomOpen(null)}
          onCreated={(food) => {
            setCustomOpen(null);
            // After saving, drop the user into the picker pre-selected on the
            // new food so they can set grams + meal.
            setPickerMeal(defaultMealForNow());
            setPickerScanResult({
              kind: "cache",
              code: food.barcode ?? "",
              food: {
                foodId: food.foodId,
                fdcId: null,
                name: food.name,
                brand: food.brand,
                category: null,
                barcode: food.barcode,
                nutrients: {
                  kcal: food.kcalPer100,
                  proteinG: food.proteinGPer100,
                  carbsG: food.carbsGPer100,
                  fatG: food.fatGPer100,
                  fiberG: null,
                  vitaminDIu: null, vitaminB12Ug: null,
                  ironMg: null, magnesiumMg: null,
                  calciumMg: null, potassiumMg: null,
                  sodiumMg: null, omega3Mg: null,
                },
              },
            });
            setPickerOpen(true);
          }}
        />
      )}
    </>
  );
}

// -----------------------------------------------------------------------
// Quick-add strip: favorites first, then recent foods
// -----------------------------------------------------------------------

function QuickAddStrip({
  logDate,
  favorites,
  recents,
  onCustomize,
}: {
  logDate: string;
  favorites: QuickFood[];
  recents: QuickFood[];
  onCustomize: (qf: QuickFood) => void;
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      {favorites.length > 0 && (
        <QuickRow
          label="Favorites"
          icon={<Star size={11} className="text-amber-500 fill-amber-400" />}
          logDate={logDate}
          items={favorites}
          onCustomize={onCustomize}
        />
      )}
      {recents.length > 0 && (
        <QuickRow
          label="Recent"
          logDate={logDate}
          items={recents}
          onCustomize={onCustomize}
        />
      )}
    </section>
  );
}

function QuickRow({
  label,
  icon,
  logDate,
  items,
  onCustomize,
}: {
  label: string;
  icon?: React.ReactNode;
  logDate: string;
  items: QuickFood[];
  onCustomize: (qf: QuickFood) => void;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-600 font-semibold mb-2 flex items-center gap-1.5">
        {icon} {label}
      </div>
      <div className="-mx-1 overflow-x-auto">
        <div className="flex gap-2 px-1 pb-1">
          {items.map((it) => (
            <QuickChip key={it.foodId} item={it} logDate={logDate} onCustomize={() => onCustomize(it)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function QuickChip({
  item,
  logDate,
  onCustomize,
}: {
  item: QuickFood;
  logDate: string;
  onCustomize: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const quantity = item.defaultQuantityG ?? 100;
  const meal = item.defaultMeal ?? defaultMealForNow();
  const kcal = item.kcalPer100 != null ? Math.round((item.kcalPer100 * quantity) / 100) : null;

  const tap = () => {
    startTransition(async () => {
      try {
        await quickAddFoodLogEntry({
          logDate,
          meal,
          quantityG: quantity,
          foodId: item.foodId,
        });
      } catch (e) {
        // Fall back to opening the picker so the user can see the error.
        onCustomize();
      }
    });
  };

  return (
    <div className="shrink-0 max-w-[180px] bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-1.5 py-2 flex items-center gap-2">
      <button onClick={tap} disabled={pending} className="text-left min-w-0 disabled:opacity-60">
        <div className="text-[12px] font-medium text-slate-900 truncate">
          {pending ? "Adding…" : item.name}
        </div>
        <div className="text-[10px] text-slate-500 tabular-nums truncate">
          {Math.round(quantity)}g
          {kcal != null && ` · ${kcal} kcal`}
          {item.brand && ` · ${item.brand}`}
        </div>
      </button>
      <button
        onClick={onCustomize}
        title="Adjust grams / meal"
        className="shrink-0 p-1.5 rounded-md text-slate-500 hover:bg-slate-200/60 hover:text-slate-700"
      >
        <Pencil size={11} />
      </button>
    </div>
  );
}

// -----------------------------------------------------------------------
// Existing meal sections / entry rows
// -----------------------------------------------------------------------

function MealSection({ meal, entries, onAdd }: { meal: Meal; entries: DayEntry[]; onAdd: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[11px] uppercase tracking-wide text-slate-600 font-semibold">{MEAL_LABEL[meal]}</div>
        <button
          onClick={onAdd}
          className="text-[11px] font-medium text-teal-700 hover:text-teal-800 inline-flex items-center gap-1"
        >
          <Plus size={11} /> Add
        </button>
      </div>
      {entries.length === 0 ? (
        <div className="text-[12px] text-slate-400 italic bg-slate-50 rounded-lg border border-dashed border-slate-200 px-3 py-2">
          Nothing logged.
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e) => <EntryRow key={e.id} entry={e} />)}
        </div>
      )}
    </div>
  );
}

function EntryRow({ entry }: { entry: DayEntry }) {
  const [pending, startTransition] = useTransition();
  const [favPending, startFavTransition] = useTransition();
  const [favorited, setFavorited] = useState<boolean | null>(null); // null = unknown; we don't load the state here
  const kcal = entry.food.kcalPer100 != null
    ? Math.round((entry.food.kcalPer100 * entry.quantityG) / 100)
    : null;

  const toggleFav = () => {
    startFavTransition(async () => {
      try {
        const res = await toggleFoodFavorite({
          foodId: entry.food.id,
          defaultQuantityG: Math.round(entry.quantityG),
          defaultMeal: entry.meal,
        });
        setFavorited(res.favorited);
      } catch (e) { /* swallow — UI stays as-is */ }
    });
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-900 truncate">
          {entry.food.name}
          {entry.food.brand && <span className="text-slate-400 font-normal"> · {entry.food.brand}</span>}
        </div>
        <div className="text-[11px] text-slate-500 tabular-nums">
          {entry.quantityG}g {kcal != null && `· ${kcal} kcal`}
        </div>
      </div>
      <button
        onClick={toggleFav}
        disabled={favPending}
        title={favorited ? "Remove from favorites" : "Save to favorites"}
        className={`rounded p-1 ${
          favorited
            ? "text-amber-500 hover:bg-amber-50"
            : "text-slate-400 hover:bg-slate-200/60 hover:text-amber-500"
        }`}
      >
        <Star size={13} className={favorited ? "fill-amber-400" : ""} />
      </button>
      <button
        onClick={() => {
          if (!confirm("Remove this entry?")) return;
          startTransition(() => removeFoodLogEntry({ id: entry.id }));
        }}
        disabled={pending}
        className="text-rose-600 hover:bg-rose-50 rounded p-1"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// -----------------------------------------------------------------------
// Food picker — search USDA / accept a preselect (quick-add or scan).
// -----------------------------------------------------------------------

function FoodPicker({
  logDate,
  initialMeal,
  preselectQuickFood,
  preselectScan,
  onClose,
  onCreateCustom,
}: {
  logDate: string;
  initialMeal: Meal;
  preselectQuickFood: QuickFood | null;
  preselectScan: { kind: "usda" | "cache"; food: UsdaFood | CachedFood; code: string } | null;
  onClose: () => void;
  onCreateCustom: (barcode?: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UsdaFood[]>([]);
  const [searching, setSearching] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  // Two selection paths:
  //   - selectedUsda: a fresh USDA hit, will be cached on insert via addFoodLogEntry
  //   - selectedQuick: a known foods.id, added via quickAddFoodLogEntry
  const [selectedUsda, setSelectedUsda] = useState<UsdaFood | null>(null);
  const [selectedQuick, setSelectedQuick] = useState<
    | { foodId: string; name: string; brand: string | null; kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; serving: FoodServing | null }
    | null
  >(null);
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [quantity, setQuantity] = useState<string>("1");
  const [unitKey, setUnitKey] = useState<string>("g100");
  // Per-food household portions fetched from USDA's detail endpoint on select.
  const [extraServings, setExtraServings] = useState<FoodServing[]>([]);
  const [pending, startTransition] = useTransition();

  const servingKey = (s: FoodServing) => `s:${Math.round(s.gramWeight)}|${s.label.toLowerCase()}`;

  // Serving for the currently selected food (USDA hit or cached/quick row).
  const selectedServing: FoodServing | null =
    selectedUsda?.serving ?? selectedQuick?.serving ?? null;

  // Unit options. All known servings first (branded serving + USDA portions),
  // de-duplicated, then 100 g and raw grams. Each maps to grams so we always
  // store grams under the hood.
  const units = useMemo(() => {
    const arr: { key: string; label: string; grams: number }[] = [];
    const seen = new Set<string>();
    const add = (s: FoodServing | null) => {
      if (!s || s.gramWeight <= 0) return;
      const key = servingKey(s);
      if (seen.has(key)) return;
      seen.add(key);
      arr.push({ key, label: s.label, grams: s.gramWeight });
    };
    add(selectedServing);
    extraServings.forEach(add);
    arr.push({ key: "g100", label: "100 g", grams: 100 });
    arr.push({ key: "g", label: "grams", grams: 1 });
    return arr;
  }, [selectedServing, extraServings]);

  const activeUnit = units.find((u) => u.key === unitKey) ?? units[units.length - 1];
  const gramsToLog = Math.max(1, Math.round((Number(quantity) || 0) * activeUnit.grams));

  // Pick sensible defaults when a food is chosen. presetGrams (from a
  // favorite/recent's remembered amount) wins; else 1 serving when known,
  // else 100 g.
  const applyDefaults = (serving: FoodServing | null, presetGrams?: number | null) => {
    if (presetGrams != null && presetGrams > 0) {
      setUnitKey("g");
      setQuantity(String(Math.round(presetGrams)));
    } else if (serving && serving.gramWeight > 0) {
      setUnitKey(servingKey(serving));
      setQuantity("1");
    } else {
      setUnitKey("g100");
      setQuantity("1");
    }
  };

  // Load household portions for a USDA food (by fdcId) and merge them in. If
  // the food had no serving yet, adopt the first portion as its serving so it
  // both defaults nicely and gets persisted with the food on add.
  const loadPortions = async (fdcId: number | null, hadServing: boolean) => {
    setExtraServings([]);
    if (!fdcId) return;
    try {
      const res = await fetch(`/api/foods/portions?fdcId=${fdcId}`);
      if (!res.ok) return;
      const json = await res.json();
      const portions: FoodServing[] = Array.isArray(json.portions) ? json.portions : [];
      if (portions.length === 0) return;
      setExtraServings(portions);
      if (!hadServing) {
        setSelectedUsda((prev) => (prev && !prev.serving ? { ...prev, serving: portions[0] } : prev));
        applyDefaults(portions[0], null);
      }
    } catch {
      /* ignore — fall back to 100 g / grams */
    }
  };

  // Hydrate from preselect on mount
  useEffect(() => {
    if (preselectQuickFood) {
      const serving = preselectQuickFood.servingSizeG
        ? { gramWeight: preselectQuickFood.servingSizeG, label: preselectQuickFood.servingLabel ?? `1 serving (${Math.round(preselectQuickFood.servingSizeG)} g)` }
        : null;
      setSelectedQuick({
        foodId: preselectQuickFood.foodId,
        name: preselectQuickFood.name,
        brand: preselectQuickFood.brand,
        kcal: preselectQuickFood.kcalPer100,
        protein: preselectQuickFood.proteinGPer100,
        carbs: preselectQuickFood.carbsGPer100,
        fat: preselectQuickFood.fatGPer100,
        serving,
      });
      applyDefaults(serving, preselectQuickFood.defaultQuantityG);
      if (preselectQuickFood.defaultMeal) setMeal(preselectQuickFood.defaultMeal);
    } else if (preselectScan) {
      if (preselectScan.kind === "cache") {
        const cf = preselectScan.food as CachedFood;
        const serving = cf.serving ?? null;
        setSelectedQuick({
          foodId: cf.foodId,
          name: cf.name,
          brand: cf.brand,
          kcal: cf.nutrients.kcal,
          protein: cf.nutrients.proteinG,
          carbs: cf.nutrients.carbsG,
          fat: cf.nutrients.fatG,
          serving,
        });
        applyDefaults(serving, null);
        loadPortions(cf.fdcId, !!serving);
      } else {
        const uf = preselectScan.food as UsdaFood;
        setSelectedUsda(uf);
        applyDefaults(uf.serving, null);
        loadPortions(uf.fdcId, !!uf.serving);
      }
    }
  }, [preselectQuickFood, preselectScan]);

  // Debounced search
  useEffect(() => {
    if (selectedUsda || selectedQuick) return;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      setErrMsg(null);
      try {
        const res = await fetch(`/api/foods/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error ?? `Search failed (${res.status})`);
        }
        const json = await res.json();
        setResults(json.foods ?? []);
      } catch (e: any) {
        setErrMsg(e?.message ?? "Search failed");
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, selectedUsda, selectedQuick]);

  const addEntry = () => {
    const q = gramsToLog;
    startTransition(async () => {
      try {
        if (selectedQuick) {
          await quickAddFoodLogEntry({
            logDate,
            meal,
            quantityG: q,
            foodId: selectedQuick.foodId,
          });
        } else if (selectedUsda) {
          await addFoodLogEntry({
            logDate,
            meal,
            quantityG: q,
            food: selectedUsda,
          });
        } else {
          return;
        }
        onClose();
      } catch (e: any) {
        setErrMsg(e?.message ?? "Failed to add");
      }
    });
  };

  const selectedName = selectedQuick?.name ?? selectedUsda?.name ?? null;
  const selectedBrand = selectedQuick?.brand ?? selectedUsda?.brand ?? null;
  const selectedKcal = selectedQuick?.kcal ?? selectedUsda?.nutrients.kcal ?? null;
  const selectedProtein = selectedQuick?.protein ?? selectedUsda?.nutrients.proteinG ?? null;
  const selectedCarbs = selectedQuick?.carbs ?? selectedUsda?.nutrients.carbsG ?? null;
  const selectedFat = selectedQuick?.fat ?? selectedUsda?.nutrients.fatG ?? null;

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/50 z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Add food</div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700"><X size={18} /></button>
        </div>

        {!selectedName ? (
          <>
            <div className="px-5 py-3">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <Search size={14} className="text-slate-400" />
                <input
                  autoFocus
                  className="flex-1 bg-transparent text-sm outline-none"
                  placeholder="Search foods — chicken, oatmeal, etc."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {searching && <span className="text-[11px] text-slate-400">…</span>}
              </div>
              {errMsg && <div className="text-xs text-rose-600 mt-2">{errMsg}</div>}
              {query.trim().length < 2 && (
                <div className="text-[11px] text-slate-500 mt-2">Type at least 2 characters to search USDA.</div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
              {results.map((f) => (
                <button
                  key={f.fdcId}
                  onClick={() => { setSelectedUsda(f); applyDefaults(f.serving, null); loadPortions(f.fdcId, !!f.serving); }}
                  className="w-full text-left bg-white border border-slate-200 rounded-xl px-3 py-2 hover:border-teal-300 transition"
                >
                  <div className="text-sm font-medium text-slate-900 truncate">
                    {f.name}
                    {f.brand && <span className="text-slate-400 font-normal"> · {f.brand}</span>}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate tabular-nums">
                    {f.nutrients.kcal != null ? `${Math.round(f.nutrients.kcal)} kcal` : "no kcal"} ·
                    {f.nutrients.proteinG != null ? ` ${Math.round(f.nutrients.proteinG)}P` : ""}
                    {f.nutrients.carbsG != null ? ` ${Math.round(f.nutrients.carbsG)}C` : ""}
                    {f.nutrients.fatG != null ? ` ${Math.round(f.nutrients.fatG)}F` : ""}
                    {f.category ? ` · ${f.category}` : ""}
                    <span className="text-slate-400"> · per 100g</span>
                  </div>
                </button>
              ))}
              {!searching && results.length === 0 && query.trim().length >= 2 && !errMsg && (
                <div className="text-sm text-slate-500 italic py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No matches. Try a simpler search term.
                </div>
              )}
              <button
                onClick={() => onCreateCustom(null)}
                className="w-full text-left bg-white border border-dashed border-slate-300 rounded-xl px-3 py-3 hover:border-teal-400 transition text-[12px] text-slate-600"
              >
                Don&apos;t see it? <span className="text-teal-700 font-semibold">Create a custom food</span>
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <button
              onClick={() => { setSelectedUsda(null); setSelectedQuick(null); setExtraServings([]); }}
              className="text-xs text-teal-700"
            >
              ← Back to search
            </button>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="text-sm font-semibold text-slate-900">
                {selectedName}
                {selectedBrand && <span className="text-slate-400 font-normal"> · {selectedBrand}</span>}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
                Per 100g: {selectedKcal != null ? `${Math.round(selectedKcal)} kcal` : "—"} ·
                {selectedProtein != null ? ` ${Math.round(selectedProtein)}g P` : ""}
                {selectedCarbs != null ? ` ${Math.round(selectedCarbs)}g C` : ""}
                {selectedFat != null ? ` ${Math.round(selectedFat)}g F` : ""}
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Amount</span>
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-24 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500 tabular-nums"
                  inputMode="decimal"
                  min={0}
                  step="any"
                />
                <select
                  value={activeUnit.key}
                  onChange={(e) => setUnitKey(e.target.value)}
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500"
                >
                  {units.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
                </select>
              </div>
              <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
                = {gramsToLog} g
                {selectedKcal != null && ` · ${Math.round((selectedKcal * gramsToLog) / 100)} kcal`}
              </div>
            </div>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Meal</span>
              <select
                value={meal}
                onChange={(e) => setMeal(e.target.value as Meal)}
                className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500"
              >
                {MEALS.map((m) => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}
              </select>
            </label>
            {errMsg && <div className="text-xs text-rose-600">{errMsg}</div>}
            <button
              onClick={addEntry}
              disabled={pending}
              className="w-full text-sm font-semibold bg-teal-700 text-white px-4 py-2.5 rounded-lg hover:bg-teal-800 disabled:opacity-60"
            >
              {pending ? "Adding…" : "Add to log"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
