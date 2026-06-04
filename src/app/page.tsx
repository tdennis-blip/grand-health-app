// Public landing. The middleware will redirect logged-in users to their
// role-appropriate home before this ever renders.
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-md text-center space-y-6">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-teal-700 to-emerald-600 text-white font-bold flex items-center justify-center text-2xl">
          G
        </div>
        <div>
          <div className="text-2xl font-semibold tracking-tight">Grand Health</div>
          <div className="text-sm text-slate-500 mt-1">Your Path to Longevity</div>
        </div>
        <Link
          href="/login"
          className="inline-block bg-teal-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-teal-800"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
