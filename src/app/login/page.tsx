"use client";

import { useState } from "react";
import {
  configureAmplify,
  signInWithPassword,
  confirmNewPassword,
  confirmTotpCode,
  getIdToken,
  requestPasswordReset,
  confirmPasswordReset,
} from "@/lib/auth/client";

configureAmplify();

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // First-login "set a new password" challenge.
  const [needNewPassword, setNeedNewPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // MFA (TOTP) code challenge for enrolled clinicians.
  const [needTotp, setNeedTotp] = useState(false);
  const [totpCode, setTotpCode] = useState("");

  // Password recovery flow: 'request' (email a code) → 'confirm' (code + new pw).
  const [view, setView] = useState<"signin" | "forgotRequest" | "forgotConfirm">("signin");
  const [resetCode, setResetCode] = useState("");
  const [info, setInfo] = useState<string | null>(null);

  const goTo = (v: "signin" | "forgotRequest" | "forgotConfirm") => {
    setView(v);
    setStatus("idle");
    setErrorMsg(null);
    setInfo(null);
  };

  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg(null);
    setInfo(null);
    try {
      await requestPasswordReset(email.trim());
      setStatus("idle");
      setView("forgotConfirm");
      setInfo(`We sent a 6-digit code to ${email.trim()}. Enter it below with your new password.`);
    } catch (err: unknown) {
      // Don't reveal whether an account exists — generic guidance, still advance.
      const name = err instanceof Error ? err.name : "";
      if (name === "LimitExceededException") {
        setStatus("error");
        setErrorMsg("Too many attempts. Please wait a few minutes and try again.");
      } else {
        setStatus("idle");
        setView("forgotConfirm");
        setInfo(`If an account exists for ${email.trim()}, a code has been sent. Enter it below with your new password.`);
      }
    }
  };

  const handleForgotConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setStatus("error");
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus("error");
      setErrorMsg("Passwords don't match.");
      return;
    }
    setStatus("sending");
    setErrorMsg(null);
    try {
      await confirmPasswordReset(email.trim(), resetCode.trim(), newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setResetCode("");
      setPassword("");
      goTo("signin");
      setInfo("Password updated. Sign in with your new password.");
    } catch (err: unknown) {
      setStatus("error");
      const name = err instanceof Error ? err.name : "";
      if (name === "CodeMismatchException") setErrorMsg("That code is incorrect. Check the email and try again.");
      else if (name === "ExpiredCodeException") setErrorMsg("That code has expired. Request a new one.");
      else if (name === "InvalidPasswordException") setErrorMsg("Password doesn't meet requirements (8+ chars, with letters and numbers).");
      else setErrorMsg(err instanceof Error ? err.message : "Couldn't reset password.");
    }
  };

  // Token → httpOnly cookie → full nav so middleware routes to the role home.
  const finish = async (): Promise<boolean> => {
    const idToken = await getIdToken();
    if (!idToken) return false;
    await fetch("/auth/set-cookie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    window.location.assign("/");
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg(null);
    try {
      const result = await signInWithPassword(email, password);
      if (result.isSignedIn) {
        if (!(await finish())) {
          setStatus("error");
          setErrorMsg("Signed in but couldn't establish a session. Please try again.");
        }
        return;
      }
      if (result.nextStep?.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
        setNeedNewPassword(true);
        setStatus("idle");
        return;
      }
      if (result.nextStep?.signInStep === "CONFIRM_SIGN_IN_WITH_TOTP_CODE") {
        setNeedTotp(true);
        setStatus("idle");
        return;
      }
      // A clinician who hasn't enrolled yet signs in normally (pool MFA is
      // OPTIONAL); the clinician area then redirects them to /mfa-setup. So we
      // don't expect a TOTP *setup* challenge here — but guard just in case.
      if (result.nextStep?.signInStep === "CONTINUE_SIGN_IN_WITH_TOTP_SETUP") {
        setStatus("error");
        setErrorMsg("Your account needs multi-factor setup. Sign in again and follow the setup prompt, or contact your administrator.");
        return;
      }
      setStatus("error");
      setErrorMsg("Sign-in incomplete — please try again.");
    } catch (err: unknown) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Sign-in failed.");
    }
  };

  const handleTotpCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg(null);
    try {
      const result = await confirmTotpCode(totpCode);
      if (result.isSignedIn) {
        if (!(await finish())) {
          setStatus("error");
          setErrorMsg("Verified but couldn't establish a session. Please try again.");
        }
        return;
      }
      setStatus("error");
      setErrorMsg("Couldn't verify that code — please try again.");
    } catch (err: unknown) {
      setStatus("error");
      const name = err instanceof Error ? err.name : "";
      if (name === "CodeMismatchException" || name === "EnableSoftwareTokenMFAException") {
        setErrorMsg("That code is incorrect or expired. Enter the current 6-digit code from your authenticator app.");
      } else {
        setErrorMsg(err instanceof Error ? err.message : "Couldn't verify code.");
      }
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setStatus("error");
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus("error");
      setErrorMsg("Passwords don't match.");
      return;
    }
    setStatus("sending");
    setErrorMsg(null);
    try {
      const result = await confirmNewPassword(newPassword);
      if (result.isSignedIn) {
        if (!(await finish())) {
          setStatus("error");
          setErrorMsg("Password set but couldn't establish a session. Please sign in again.");
        }
        return;
      }
      setStatus("error");
      setErrorMsg("Couldn't complete setup — please try again.");
    } catch (err: unknown) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Couldn't set password.");
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
            <div className="text-[11px] text-slate-500 -mt-0.5">
              {needTotp
                ? "Enter your authenticator code"
                : needNewPassword
                ? "Set your password"
                : view === "forgotRequest"
                ? "Reset your password"
                : view === "forgotConfirm"
                ? "Enter your code"
                : "Sign in to continue"}
            </div>
          </div>
        </div>

        {info && (
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">{info}</div>
        )}

        {needTotp ? (
          <form onSubmit={handleTotpCode} className="space-y-3">
            <p className="text-[12px] text-slate-600 leading-snug">
              Open your authenticator app and enter the current 6-digit code for Grand Health.
            </p>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Authenticator code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="123456"
                className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500 tracking-widest"
              />
            </label>
            {errorMsg && (
              <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">{errorMsg}</div>
            )}
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full bg-teal-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-teal-800 disabled:opacity-60"
            >
              {status === "sending" ? "Verifying…" : "Verify & sign in"}
            </button>
          </form>
        ) : view === "forgotRequest" ? (
          <form onSubmit={handleForgotRequest} className="space-y-3">
            <p className="text-[12px] text-slate-600 leading-snug">
              Enter your account email and we&apos;ll send a verification code to reset your password.
            </p>
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
            {errorMsg && (
              <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">{errorMsg}</div>
            )}
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full bg-teal-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-teal-800 disabled:opacity-60"
            >
              {status === "sending" ? "Sending code…" : "Send reset code"}
            </button>
            <button
              type="button"
              onClick={() => goTo("signin")}
              className="w-full text-[12px] text-slate-500 hover:text-slate-700"
            >
              ← Back to sign in
            </button>
          </form>
        ) : view === "forgotConfirm" ? (
          <form onSubmit={handleForgotConfirm} className="space-y-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Verification code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                placeholder="123456"
                className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500 tracking-widest"
              />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">New password</span>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
              />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Confirm password</span>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
              />
            </label>
            {errorMsg && (
              <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">{errorMsg}</div>
            )}
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full bg-teal-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-teal-800 disabled:opacity-60"
            >
              {status === "sending" ? "Updating…" : "Set new password"}
            </button>
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => goTo("forgotRequest")} className="text-[12px] text-slate-500 hover:text-slate-700">
                Resend code
              </button>
              <button type="button" onClick={() => goTo("signin")} className="text-[12px] text-slate-500 hover:text-slate-700">
                ← Back to sign in
              </button>
            </div>
          </form>
        ) : !needNewPassword ? (
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
              <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">{errorMsg}</div>
            )}
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full bg-teal-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-teal-800 disabled:opacity-60"
            >
              {status === "sending" ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => goTo("forgotRequest")}
              className="w-full text-center text-[12px] text-teal-700 hover:text-teal-800 font-medium"
            >
              Forgot password?
            </button>
            <p className="text-[11px] text-slate-500 leading-snug">
              Patients and clinicians use the same login — your role is set by your clinician.
            </p>
          </form>
        ) : (
          <form onSubmit={handleSetPassword} className="space-y-3">
            <p className="text-[12px] text-slate-600 leading-snug">
              Welcome! Choose a permanent password to finish setting up your account.
            </p>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">New password</span>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
              />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Confirm password</span>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
              />
            </label>
            {errorMsg && (
              <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">{errorMsg}</div>
            )}
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full bg-teal-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-teal-800 disabled:opacity-60"
            >
              {status === "sending" ? "Saving…" : "Set password & continue"}
            </button>
          </form>
        )}

        <div className="pt-1 text-center text-[11px] text-slate-400">
          <a href="/privacy" className="hover:text-slate-600 underline underline-offset-2">Privacy Policy</a>
          <span className="mx-2">·</span>
          <a href="/terms" className="hover:text-slate-600 underline underline-offset-2">Terms of Service</a>
        </div>
      </div>
    </main>
  );
}
