"use client";

import { useState, useTransition } from "react";
import { UserPlus, X } from "lucide-react";
import { createUserAccount } from "./actions";

// canCreateStaff: only admins may mint clinician/staff logins (the server
// action enforces this too — the prop just hides the toggle).
export function AddUserButton({ canCreateStaff = false }: { canCreateStaff?: boolean }) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"patient" | "clinician">("patient");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const valid = firstName.trim() && lastName.trim() && /\S+@\S+\.\S+/.test(email);

  const reset = () => {
    setFirstName(""); setLastName(""); setEmail(""); setRole("patient"); setMsg(null); setOpen(false);
  };

  const submit = () => {
    if (!valid) return;
    setMsg(null);
    startTransition(async () => {
      const res = await createUserAccount({ firstName, lastName, email, role });
      if (res.ok) {
        setMsg({ ok: true, text: `Invite sent to ${res.email}. They'll get a temporary password by email.` });
        setFirstName(""); setLastName(""); setEmail("");
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold bg-teal-700 text-white px-3.5 py-2 rounded-lg hover:bg-teal-800"
      >
        <UserPlus size={15} /> Add patient
      </button>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">New account</div>
        <button onClick={reset} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={16} /></button>
      </div>

      <div className="flex gap-1.5">
        {(canCreateStaff ? (["patient", "clinician"] as const) : (["patient"] as const)).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border ${role === r ? "bg-teal-700 text-white border-teal-700" : "bg-white text-slate-600 border-slate-200"}`}
          >
            {r === "patient" ? "Patient" : "Clinician / staff"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="First name" value={firstName} onChange={setFirstName} />
        <Field label="Last name" value={lastName} onChange={setLastName} />
      </div>
      <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="name@example.com" />

      {msg && (
        <div className={`text-[12px] rounded-lg p-2 ${msg.ok ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"}`}>
          {msg.text}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={!valid || pending}
          className={`text-sm font-semibold px-4 py-2 rounded-lg ${valid && !pending ? "bg-teal-700 text-white hover:bg-teal-800" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
        >
          {pending ? "Creating…" : "Create & send invite"}
        </button>
        <button onClick={reset} className="text-sm text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-50">Done</button>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
      />
    </label>
  );
}
