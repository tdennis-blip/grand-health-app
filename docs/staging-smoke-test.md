# Grand Health — Staging Smoke Test

First-pass checklist for internal testers. Goal: confirm the core clinician →
patient loop works end-to-end on the staging URL before deeper testing. Should
take ~15 minutes. Note anything that fails with the page URL + what you did.

**Staging URL:** `__________________`  (the Amplify domain)

Test accounts (create with `scripts/create-test-user.sh`):
- Clinician: `__________________`
- Patient:   `__________________`

---

## 0. Smoke (is it even up?)
- [ ] Staging URL loads and redirects to `/login` when signed out.
- [ ] No build/500 error page; browser console has no fatal red errors on load.

## 1. Clinician login + roster
- [ ] Sign in as the clinician at `/login`.
- [ ] Lands on the clinician dashboard (`/clinician/dashboard`) — not the patient home.
- [ ] Patient roster shows your seeded/created patient(s).
- [ ] Open a patient detail page (`/clinician/patient/[id]`) — loads without error.

## 2. Clinician sets up the patient
On the patient detail page, exercise the editors that had the bugs I fixed:
- [ ] **Diet plan** — edit RMR / macros / targets, Save → shows "Saved." and persists on reload.
- [ ] **Grand 100 baseline** — set VO2 / grip etc., Save → persists on reload.
      *(These two write the audit log; previously they would have errored.)*
- [ ] **Stack** — add a medication or supplement with a dose schedule; Save.
- [ ] **Pillars** — confirm at least one pillar is visible (toggle visibility if needed).

## 3. Patient login + daily loop
- [ ] Sign out, sign in as the patient → lands on patient home (`/home`), not clinician.
- [ ] Bottom tab bar shows 5 tabs (Today / Pillars / Grand 100 / Chat / Me).
- [ ] **Today** card renders training + diet without error.
- [ ] **Diet** → search a food (USDA), add it to a meal → daily totals update.
- [ ] **Stack** → today's doses show; tap one to check it off → state sticks on reload.
- [ ] **Grand 100** → hero + VO2 trajectory chart render.
- [ ] **Me** (profile) → demographics show; edit height/weight (cm↔ft toggle) and Save.

## 4. Two-way messaging
- [ ] As patient: **Chat** → send a message to the clinic.
- [ ] As clinician: **Messages** inbox shows the thread with an unread badge.
- [ ] Reply as clinician → patient sees it (live or on refresh); unread badge clears.

## 5. Audit + permissions (quick)
- [ ] As clinician: `/clinician/audit` loads; the diet/stack/baseline edits above appear as rows.
- [ ] As patient: try opening a `/clinician/...` URL directly → redirected away (role gate works).

---

## What to capture for any failure
- Page URL, which account (patient/clinician), and the action taken.
- Screenshot if visual; browser console error text if it 500s.
- Whether it reproduces on reload.

## Known not-yet-built (don't file these)
- Apple Health / Eight Sleep integrations (placeholder tiles).
- Clinician-entered food logs on a patient's behalf.
- Per-factor genetic flag gating.
