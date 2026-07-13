"use client";

import { useEffect, useState } from "react";
import {
  configureAmplify,
  startTotpEnrollment,
  confirmTotpEnrollment,
  signOut,
} from "@/lib/auth/client";

configureAmplify();

export function MfaSetupClient({ accountName }: { accountName: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<"loading" | "ready" | "verifying" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Kick off enrollment once: Cognito mints a shared secret bound to this session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { uri, secret } = await startTotpEnrollment(accountName);
        if (cancelled) return;
        setUri(uri);
        setSecret(secret);
        setPhase("ready");
      } catch (err: unknown) {
        if (cancelled) return;
        setPhase("error");
        setErrorMsg(err instanceof Error ? err.message : "Couldn't start MFA setup.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountName]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhase("verifying");
    setErrorMsg(null);
    try {
      await confirmTotpEnrollment(code);
      // MFA is now required for this account. Full nav so the clinician layout
      // re-runs its gate (which will now pass) and lands on the dashboard.
      window.location.assign("/clinician/dashboard");
    } catch (err: unknown) {
      setPhase("ready");
      const name = err instanceof Error ? err.name : "";
      if (name === "EnableSoftwareTokenMFAException" || name === "CodeMismatchException") {
        setErrorMsg("That code didn't match. Enter the current 6-digit code from your app and try again.");
      } else {
        setErrorMsg(err instanceof Error ? err.message : "Couldn't verify code.");
      }
    }
  };

  const prettySecret = secret ? secret.replace(/(.{4})/g, "$1 ").trim() : "";

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7 w-full max-w-sm space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-700 to-emerald-600 text-white font-bold flex items-center justify-center">
            G
          </div>
          <div>
            <div className="font-semibold tracking-tight">Set up two-factor auth</div>
            <div className="text-[11px] text-slate-500 -mt-0.5">Required for clinician accounts</div>
          </div>
        </div>

        <p className="text-[12px] text-slate-600 leading-snug">
          Add Grand Health to an authenticator app (Google Authenticator, Authy, 1Password, etc.),
          then enter the 6-digit code it shows to finish.
        </p>

        {phase === "loading" && (
          <div className="text-sm text-slate-500 py-6 text-center">Preparing your setup key…</div>
        )}

        {phase === "error" && (
          <div className="space-y-3">
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">
              {errorMsg}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-teal-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-teal-800"
            >
              Try again
            </button>
          </div>
        )}

        {(phase === "ready" || phase === "verifying") && (
          <>
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">
                Setup key (enter manually in your app)
              </div>
              <div className="font-mono text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 break-all tracking-wide">
                {prettySecret}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => secret && navigator.clipboard?.writeText(secret)}
                  className="text-[12px] text-teal-700 hover:text-teal-800 font-medium"
                >
                  Copy key
                </button>
                {uri && (
                  <a href={uri} className="text-[12px] text-teal-700 hover:text-teal-800 font-medium">
                    Open in app (mobile)
                  </a>
                )}
              </div>
            </div>

            <form onSubmit={handleVerify} className="space-y-3">
              <label className="block">
                <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">
                  6-digit code
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500 tracking-widest"
                />
              </label>
              {errorMsg && (
                <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">
                  {errorMsg}
                </div>
              )}
              <button
                type="submit"
                disabled={phase === "verifying"}
                className="w-full bg-teal-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-teal-800 disabled:opacity-60"
              >
                {phase === "verifying" ? "Verifying…" : "Verify & finish"}
              </button>
            </form>
          </>
        )}

        <button
          type="button"
          onClick={() => signOut().finally(() => window.location.assign("/login"))}
          className="w-full text-center text-[12px] text-slate-500 hover:text-slate-700"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
