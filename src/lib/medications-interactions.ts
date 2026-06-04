// Drug-interaction rule checker.
//
// Rules live in public.medication_interactions and are clinic-scoped. Each
// rule is a (pattern_a, pattern_b) pair — bare substrings, case-insensitive
// — plus a severity and a message. The checker pulls the active rules for
// the caller's clinic, then matches them against a list of stack item names.
//
// Matching is intentionally dumb: case-insensitive substring on both names.
// This avoids us needing a curated drug name dictionary; the clinic enters
// the patterns they care about. "warfarin" + "aspirin" catches "Warfarin
// 5 mg" and "Aspirin 81 mg".

import { getUser } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";

export type InteractionRule = {
  id: string;
  clinicId: string;
  namePatternA: string;
  namePatternB: string;
  severity: InteractionSeverity;
  message: string;
  source: string | null;
  active: boolean;
};

export type InteractionSeverity = "info" | "warn" | "severe";

export type InteractionHit = {
  ruleId: string;
  severity: InteractionSeverity;
  message: string;
  source: string | null;
  // The two medication names (from the stack) that triggered the hit.
  matchedA: string;
  matchedB: string;
  // Medication ids on the patient stack that this rule pairs.
  medicationIdA: string;
  medicationIdB: string;
};

function normaliseSeverity(s: string | null | undefined): InteractionSeverity {
  if (s === "info" || s === "severe") return s;
  return "warn";
}

function patternMatchesName(pattern: string, name: string): boolean {
  if (!pattern || !name) return false;
  return name.toLowerCase().includes(pattern.toLowerCase().trim());
}

// Pull the active rules for the caller's clinic. RLS handles scoping.
export async function getInteractionRules(): Promise<InteractionRule[]> {
  const user = await getUser();
  if (!user) return [];
  const rows = await withAuth(user, (sql) =>
    sql`SELECT id, clinic_id, name_pattern_a, name_pattern_b, severity, message, source, active FROM medication_interactions WHERE active = true ORDER BY severity DESC, name_pattern_a ASC`
  );
  return rows.map((r: any) => ({
    id: r.id,
    clinicId: r.clinic_id,
    namePatternA: r.name_pattern_a,
    namePatternB: r.name_pattern_b,
    severity: normaliseSeverity(r.severity),
    message: r.message,
    source: r.source ?? null,
    active: !!r.active,
  }));
}

// Also include inactive rules so the library editor can show + toggle them.
export async function getAllInteractionRules(): Promise<InteractionRule[]> {
  const user = await getUser();
  if (!user) return [];
  const rows = await withAuth(user, (sql) =>
    sql`SELECT id, clinic_id, name_pattern_a, name_pattern_b, severity, message, source, active FROM medication_interactions ORDER BY active DESC, severity DESC, name_pattern_a ASC`
  );
  return rows.map((r: any) => ({
    id: r.id,
    clinicId: r.clinic_id,
    namePatternA: r.name_pattern_a,
    namePatternB: r.name_pattern_b,
    severity: normaliseSeverity(r.severity),
    message: r.message,
    source: r.source ?? null,
    active: !!r.active,
  }));
}

// Check a flat list of meds (id + name) against the active rules. Pairs are
// undirected — we try both orderings so a rule "warfarin"+"aspirin" hits
// regardless of which med the patient took first.
export type CheckCandidate = { id: string; name: string };

export function checkInteractions(
  items: CheckCandidate[],
  rules: InteractionRule[],
): InteractionHit[] {
  const hits: InteractionHit[] = [];
  // Dedupe by unordered pair of medication ids + rule id.
  const seen = new Set<string>();

  for (const rule of rules) {
    for (let i = 0; i < items.length; i++) {
      for (let j = 0; j < items.length; j++) {
        if (i === j) continue;
        const a = items[i];
        const b = items[j];
        if (
          patternMatchesName(rule.namePatternA, a.name)
          && patternMatchesName(rule.namePatternB, b.name)
        ) {
          const pairKey = [rule.id, ...[a.id, b.id].sort()].join("|");
          if (seen.has(pairKey)) continue;
          seen.add(pairKey);
          hits.push({
            ruleId: rule.id,
            severity: rule.severity,
            message: rule.message,
            source: rule.source,
            matchedA: a.name,
            matchedB: b.name,
            medicationIdA: a.id,
            medicationIdB: b.id,
          });
        }
      }
    }
  }

  // Sort severe > warn > info.
  const rank: Record<InteractionSeverity, number> = { severe: 0, warn: 1, info: 2 };
  hits.sort((x, y) => rank[x.severity] - rank[y.severity]);
  return hits;
}

// Convenience: check an entire patient stack (active items only).
export async function checkPatientStack(
  items: { id: string; name: string; active: boolean }[],
): Promise<InteractionHit[]> {
  const rules = await getInteractionRules();
  if (rules.length === 0) return [];
  return checkInteractions(
    items.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name })),
    rules,
  );
}
