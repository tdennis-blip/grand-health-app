"use client";

import { useState } from "react";
import { configureAmplify, signInWithPassword } from "@/lib/auth/client";

configureAmplify();

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg(null);

    try {
      const result = await signInWithPassword(email, password);

      if (result.isSignedIn) {
        // Post the ID token to our server so it can set an httpOnly cookie.
        const { getIdToken } = await import("@/lib/auth/client");
        const idToken = await getIdToken();
        if (!idToken) {
          setStatus("error");
          setErrorMsg("Signed in but couldn't establish a session. Please try again.");
          return;
        }
        await fetch("/auth/set-cookie", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });
        // Full navigation so server middleware runs and routes to the
        // role-appropriate home (/home or /clinician/dashboard).
        window.location.assign("/");
      } else {
        setStatus("error");
        setErrorMsg("Sign-in incomplete — please try again.");
      }
    } catch (err: unknown) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Sign-in failed.");
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7 w-full max-w-sm space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-700 to-emerald-600 text-white font-bold flex items-center justify-center">
            G
          </div>
          <div>
            <div className="font-semibold tracking-tight">Grand Health</div>
            <div className="text-[11px] text-slate-500 -mt-0.5">Sign in to continue</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
            />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
            />
          </label>
          {errorMsg && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">
              {errorMsg}
            </div>
          )}
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full bg-teal-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-teal-800 disabled:opacity-60"
          >
            {status === "sending" ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-[11px] text-slate-500 leading-snug">
            Patients and clinicians use the same login — your role is set by your clinician.
          </p>
        </form>

        <div className="pt-1 text-center text-[11px] text-slate-400">
          <a href="/privacy" className="hover:text-slate-600 underline underline-offset-2">Privacy Policy</a>
          <span className="mx-2">·</span>
          <a href="/terms" className="hover:text-slate-600 underline underline-offset-2">Terms of Service</a>
        </div>
      </div>
    </main>
  );
}
