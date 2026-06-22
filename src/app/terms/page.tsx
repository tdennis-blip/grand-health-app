// Public terms of service. Allowlisted in src/lib/auth/middleware.ts so it is
// viewable without authentication (required for Oura/Whoop app review and the
// OAuth consent footer). Starter content — have counsel review before GA.

import Link from "next/link";

export const metadata = {
  title: "Terms of Service · Grand Health",
  description: "The terms governing use of the Grand Health app.",
};

const EFFECTIVE_DATE = "June 22, 2026";
const CONTACT_EMAIL = "tdennis@mygrandhealth.com";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 text-slate-800">
      <Link href="/" className="text-sm text-teal-700">← Back</Link>

      <h1 className="mt-4 text-2xl font-semibold text-slate-900">Terms of Service</h1>
      <p className="mt-1 text-sm text-slate-500">Effective {EFFECTIVE_DATE}</p>

      <div className="mt-6 space-y-5 text-[15px] leading-relaxed">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the Grand
          Health patient and clinician application (the &ldquo;App&rdquo;) provided by Grand Health
          (&ldquo;Grand Health,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;). By using the App you agree
          to these Terms.
        </p>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Who can use the App</h2>
          <p className="mt-2">
            The App is made available to patients of Grand Health and their authorized care teams.
            Accounts are created and managed by Grand Health; there is no public self-signup. You are
            responsible for keeping your login credentials confidential and for activity under your
            account.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Not an emergency service</h2>
          <p className="mt-2">
            The App supports your care but is not a substitute for professional medical judgment and
            is not for emergencies. If you think you may have a medical emergency, call your local
            emergency number immediately. Do not rely on the App for urgent communication with your
            care team.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Connected devices and data</h2>
          <p className="mt-2">
            You may choose to connect third-party wearable providers (for example, Oura or Whoop).
            When you do, you authorize us to retrieve your data from that provider for use in the
            App. Your use of those third-party services is governed by their own terms and privacy
            policies. The accuracy and availability of device data depends on the provider, and we do
            not guarantee it. You can disconnect a provider at any time from the integrations screen.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Acceptable use</h2>
          <p className="mt-2">
            You agree to use the App only for its intended purpose and in compliance with applicable
            law. You agree not to attempt to access data that is not yours, disrupt or compromise the
            security of the App, or misuse the service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Your information</h2>
          <p className="mt-2">
            Our handling of your information is described in our{" "}
            <Link href="/privacy" className="text-teal-700 underline">
              Privacy Policy
            </Link>
            , which is incorporated into these Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Disclaimers and limitation of liability</h2>
          <p className="mt-2">
            The App is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. To the
            fullest extent permitted by law, Grand Health disclaims warranties not expressly stated
            and is not liable for indirect, incidental, or consequential damages arising from your
            use of the App. Nothing in these Terms limits any rights you have that cannot be limited
            under applicable law, or our obligations as your healthcare provider.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Changes to these Terms</h2>
          <p className="mt-2">
            We may update these Terms from time to time. We will update the effective date above and,
            where appropriate, notify you within the App. Continued use after changes take effect
            constitutes acceptance.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Contact us</h2>
          <p className="mt-2">
            Questions about these Terms can be directed to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-teal-700 underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>

      <p className="mt-8 text-sm text-slate-500">
        See also our{" "}
        <Link href="/privacy" className="text-teal-700 underline">
          Privacy Policy
        </Link>
        .
      </p>
    </main>
  );
}
