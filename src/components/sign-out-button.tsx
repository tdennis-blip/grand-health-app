"use client";

import { useTransition } from "react";
import { configureAmplify, signOut as amplifySignOut } from "@/lib/auth/client";

configureAmplify();

// Full sign-out: clears the Amplify client session AND the server cookie, then
// hard-navigates to /login. (The server-only sign-out left the Amplify session
// alive, so the next sign-in reused the old user.)
export function SignOutButton({ className }: { className?: string }) {
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      try {
        await amplifySignOut();
      } catch {
        /* ignore — still clear the cookie below */
      }
      try {
        await fetch("/auth/sign-out", { method: "POST" });
      } catch {
        /* ignore */
      }
      window.location.assign("/login");
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={
        className ??
        "text-sm font-semibold text-slate-700 bg-white border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 disabled:opacity-60"
      }
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
