"use client";

import { useState, useTransition } from "react";
import { configureAmplify, changePassword, requestEmailChange, confirmEmailChange } from "@/lib/auth/client";
import { updateClinicianProfile, syncEmailAfterChange } from "./actions";

configureAmplify();

type Initial = {
  firstName: string;
  lastName: string;
  email: string;
  professionalRole: string;
  title: string;
  credentials: string;
};

export function ProviderProfileEditor({ initial }: { initial: Initial }) {
  return (
    <div className="space-y-4">
      <DetailsCard initial={initial} />
      <PasswordCard />
      <EmailCard currentEmail={initial.email} />
    </div>
  );
}

// ---- Name / role / credentials -----------------------------------------
function DetailsCard({ initial }: { initial: Initial }) {
  const [form, setForm] = useState(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Initial>(k: K, v: string) => { setForm((p) => ({ ...p, [k]: v })); setSaved(false); };

  const save = () => {
    setErr(null); setSaved(false);
    start(async () => {
      try {
        await updateClinicianProfile({
          firstName: form.firstName,
          lastName: form.lastName,
          professionalRole: form.professionalRole || null,
          title: form.title || null,
          credentials: form.credentials || null,
        });
        setSaved(true);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  };

  return (
    <Card title="Details">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" value={form.firstName} onChange={(v) => set("firstName", v)} />
        <Field label="Last name" value={form.lastName} onChange={(v) => set("lastName", v)} />
      </div>
      <Field label="Professional role" value={form.professionalRole} onChange={(v) => set("professionalRole", v)} placeholder="Physician, Nurse Practitioner, Dietitian…" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Title" value={form.title} onChange={(v) => set("title", v)} placeholder="Dr." />
        <Field label="Credentials" value={form.credentials} onChange={(v) => set("credentials", v)} placeholder="MD, RN, MSN…" />
      </div>
      {err && <Err msg={err} />}
      <SaveRow pending={pending} saved={saved} onClick={save} label="Save details" />
    </Card>
  );
}

// ---- Password -----------------------------------------------------------
function PasswordCard() {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = () => {
    setErr(null); setDone(false);
    if (newPw.length < 8) { setErr("New password must be at least 8 characters."); return; }
    if (newPw !== confirmPw) { setErr("New passwords don't match."); return; }
    start(async () => {
      try {
        await changePassword(oldPw, newPw);
        setOldPw(""); setNewPw(""); setConfirmPw(""); setDone(true);
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        if (name === "NotAuthorizedException") setErr("Current password is incorrect.");
        else if (name === "InvalidPasswordException") setErr("New password doesn't meet requirements.");
        else if (name === "LimitExceededException") setErr("Too many attempts — try again later.");
        else setErr(e instanceof Error ? e.message : "Couldn't change password.");
      }
    });
  };

  return (
    <Card title="Change password">
      <Field label="Current password" type="password" value={oldPw} onChange={setOldPw} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="New password" type="password" value={newPw} onChange={setNewPw} placeholder="8+ characters" />
        <Field label="Confirm new password" type="password" value={confirmPw} onChange={setConfirmPw} />
      </div>
      {err && <Err msg={err} />}
      {done && <Ok msg="Password updated." />}
      <SaveRow pending={pending} saved={false} onClick={save} label="Update password" disabled={!oldPw || !newPw} />
    </Card>
  );
}

// ---- Email --------------------------------------------------------------
function EmailCard({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<"idle" | "confirm">("idle");
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const request = () => {
    setErr(null); setInfo(null);
    start(async () => {
      try {
        const step = await requestEmailChange(email.trim());
        if (step === "CONFIRM_ATTRIBUTE_WITH_CODE") {
          setStage("confirm");
          setInfo(`We sent a code to ${email.trim()}. Enter it to confirm.`);
        } else {
          // No confirmation required — sync immediately.
          await syncEmailAfterChange({ email: email.trim() });
          setInfo("Email updated.");
          setEmail("");
        }
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        if (name === "AliasExistsException") setErr("That email is already in use.");
        else setErr(e instanceof Error ? e.message : "Couldn't start email change.");
      }
    });
  };

  const confirm = () => {
    setErr(null); setInfo(null);
    start(async () => {
      try {
        await confirmEmailChange(code.trim());
        await syncEmailAfterChange({ email: email.trim() });
        setInfo("Email updated. Use the new address next time you sign in.");
        setStage("idle"); setCode(""); setEmail("");
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        if (name === "CodeMismatchException") setErr("That code is incorrect.");
        else if (name === "ExpiredCodeException") setErr("That code expired — request a new one.");
        else setErr(e instanceof Error ? e.message : "Couldn't confirm email.");
      }
    });
  };

  return (
    <Card title="Change email">
      <div className="text-[12px] text-slate-500">Current: <span className="font-medium text-slate-700">{currentEmail || "—"}</span></div>
      {stage === "idle" ? (
        <>
          <Field label="New email" type="email" value={email} onChange={setEmail} placeholder="you@clinic.com" />
          {err && <Err msg={err} />}
          {info && <Ok msg={info} />}
          <SaveRow pending={pending} saved={false} onClick={request} label="Send verification code" disabled={!email.trim()} />
        </>
      ) : (
        <>
          <div className="text-[12px] text-slate-600">Enter the code sent to {email}.</div>
          <Field label="Verification code" value={code} onChange={setCode} placeholder="123456" />
          {err && <Err msg={err} />}
          {info && <Ok msg={info} />}
          <div className="flex items-center gap-2">
            <SaveRow pending={pending} saved={false} onClick={confirm} label="Confirm new email" disabled={!code.trim()} />
            <button type="button" onClick={() => { setStage("idle"); setCode(""); setErr(null); setInfo(null); }} className="text-[12px] text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        </>
      )}
    </Card>
  );
}

// ---- Small shared UI ----------------------------------------------------
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, type, placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</span>
      <input
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
      />
    </label>
  );
}

function SaveRow({ pending, saved, onClick, label, disabled }: { pending: boolean; saved: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <button
        onClick={onClick}
        disabled={pending || disabled}
        className="text-sm font-semibold px-4 py-2 rounded-lg bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50"
      >
        {pending ? "Saving…" : label}
      </button>
      {saved && <span className="text-xs text-emerald-700">Saved.</span>}
    </div>
  );
}

function Err({ msg }: { msg: string }) {
  return <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">{msg}</div>;
}
function Ok({ msg }: { msg: string }) {
  return <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">{msg}</div>;
}
