"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { createCustomFood } from "./custom-food-actions";

type Created = {
  foodId: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  kcalPer100: number | null;
  proteinGPer100: number | null;
  carbsGPer100: number | null;
  fatGPer100: number | null;
};

export function CustomFoodForm({
  initialBarcode,
  onClose,
  onCreated,
}: {
  initialBarcode?: string | null;
  onClose: () => void;
  onCreated: (food: Created) => void;
}) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [barcode, setBarcode] = useState(initialBarcode ?? "");
  // Per-100g macros + a couple of key micros. Everything else can be added later.
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fiber, setFiber] = useState("");
  const [sodium, setSodium] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const parseNum = (s: string): number | null => {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  const submit = () => {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await createCustomFood({
          name: name.trim(),
          brand: brand.trim() || null,
          category: category.trim() || null,
          barcode: barcode.trim() || null,
          nutrients: {
            kcal: parseNum(kcal),
            proteinG: parseNum(protein),
            carbsG: parseNum(carbs),
            fatG: parseNum(fat),
            fiberG: parseNum(fiber),
            sodiumMg: parseNum(sodium),
          },
        });
        onCreated({
          foodId: res.id,
          name: name.trim(),
          brand: brand.trim() || null,
          barcode: barcode.trim() || null,
          kcalPer100: parseNum(kcal),
          proteinGPer100: parseNum(protein),
          carbsGPer100: parseNum(carbs),
          fatGPer100: parseNum(fat),
        });
      } catch (e: any) {
        setError(e?.message ?? "Failed to save");
      }
    });
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/50 z-[55]" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[56] bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Add custom food</div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <Field label="Name" required>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mom's protein smoothie"
              className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand (optional)">
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
              />
            </Field>
            <Field label="Category (optional)">
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Smoothie"
                className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
              />
            </Field>
          </div>

          <Field label="Barcode (optional)">
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500 tabular-nums"
            />
          </Field>

          <div className="pt-2 border-t border-slate-100">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
              Nutrition per 100g
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Calories (kcal)">
                <NumInput value={kcal} onChange={setKcal} />
              </Field>
              <Field label="Protein (g)">
                <NumInput value={protein} onChange={setProtein} />
              </Field>
              <Field label="Carbs (g)">
                <NumInput value={carbs} onChange={setCarbs} />
              </Field>
              <Field label="Fat (g)">
                <NumInput value={fat} onChange={setFat} />
              </Field>
              <Field label="Fiber (g)">
                <NumInput value={fiber} onChange={setFiber} />
              </Field>
              <Field label="Sodium (mg)">
                <NumInput value={sodium} onChange={setSodium} />
              </Field>
            </div>
          </div>

          {error && <div className="text-xs text-rose-600">{error}</div>}
        </div>

        <div className="px-5 py-3 border-t border-slate-200">
          <button
            onClick={submit}
            disabled={pending || !name.trim()}
            className="w-full text-sm font-semibold bg-teal-700 text-white px-4 py-2.5 rounded-lg hover:bg-teal-800 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save & continue"}
          </button>
        </div>
      </div>
    </>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
        {label}{required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

function NumInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
      className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500 tabular-nums"
    />
  );
}
