// Public privacy policy. Allowlisted in src/lib/auth/middleware.ts so it is
// viewable without authentication (required for Oura/Whoop app review and the
// OAuth consent footer). Starter content — have counsel review before GA.

import Link from "next/link";

export const metadata = {
  title: "Privacy Policy · Grand Health",
  description: "How the Grand Health app collects, uses, and protects your information.",
};

const EFFECTIVE_DATE = "June 22, 2026";
const CONTACT_EMAIL = "tdennis@mygrandhealth.com";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 text-slate-800">
      <Link href="/" className="text-sm text-teal-700">← Back</Link>

      <h1 className="mt-4 text-2xl font-semibold text-slate-900">Privacy Policy</h1>
      <p className="mt-1 text-sm text-slate-500">Effective {EFFECTIVE_DATE}</p>

      <div className="mt-6 space-y-5 text-[15px] leading-relaxed">
        <p>
          This Privacy Policy explains how Grand Health (&ldquo;Grand Health,&rdquo; &ldquo;we,&rdquo;
          &ldquo;us&rdquo;) collects, uses, and protects information in connection with the Grand
          Health patient and clinician application (the &ldquo;App&rdquo;). The App is provided to
          patients of Grand Health and their care teams to support personalized, preventive
          healthcare. By using the App you agree to the practices described here.
        </p>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Information we collect</h2>
          <p className="mt-2">We collect the following categories of information:</p>
          <ul className="mt-2 list-disc pl-5 space-y-1.5">
            <li>
              <span className="font-medium">Account information</span> — your name, email address,
              and the credentials used to sign in.
            </li>
            <li>
              <span className="font-medium">Health and profile information</span> — information you
              or your care team enter, such as date of birth, sex, height, weight, dietary
              preferences, medications and supplements, training plans, food logs, and clinical
              notes.
            </li>
            <li>
              <span className="font-medium">Wearable device data</span> — if you choose to connect a
              third-party device or service (for example, Oura or Whoop), we receive metrics such as
              sleep, heart rate variability, resting heart rate, readiness or recovery scores,
              activity, and calories. We only access this data after you explicitly authorize the
              connection, and you can disconnect at any time from the integrations screen.
            </li>
            <li>
              <span className="font-medium">Usage information</span> — limited technical and audit
              data needed to operate, secure, and troubleshoot the App.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">How we use information</h2>
          <p className="mt-2">
            We use this information to provide and personalize your care, display your health metrics
            and targets, allow communication with your care team, maintain security and audit
            records, and meet our legal and regulatory obligations. We do not sell your personal
            information, and we do not use your health data for advertising.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Wearable data authorization</h2>
          <p className="mt-2">
            When you connect a wearable provider, you are redirected to that provider to sign in and
            grant access. We store the access tokens needed to retrieve your data and the metrics we
            receive. Disconnecting a provider in the App revokes our ongoing access and stops further
            syncing. You can also revoke access directly from the provider&rsquo;s own account
            settings.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">How we share information</h2>
          <p className="mt-2">
            Your information is accessible to the Grand Health clinicians involved in your care. We
            may share information with service providers who host and operate the App on our behalf
            under contractual confidentiality and security obligations, and when required by law. As
            a healthcare provider, Grand Health handles protected health information consistent with
            applicable law, including HIPAA where it applies.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Data security and retention</h2>
          <p className="mt-2">
            We use administrative, technical, and physical safeguards designed to protect your
            information, including access controls and encryption in transit. We retain information
            for as long as needed to provide care and meet legal and recordkeeping requirements.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Your choices and rights</h2>
          <p className="mt-2">
            You may review and update much of your profile information in the App, connect or
            disconnect wearable providers at any time, and contact us to request access to or
            correction of your information, subject to applicable law and our recordkeeping
            obligations.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Children</h2>
          <p className="mt-2">
            The App is intended for use by adult patients of Grand Health and is not directed to
            children.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Changes to this policy</h2>
          <p className="mt-2">
            We may update this Privacy Policy from time to time. We will update the effective date
            above and, where appropriate, notify you within the App.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Contact us</h2>
          <p className="mt-2">
            Questions about this Privacy Policy or your information can be directed to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-teal-700 underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>

      <p className="mt-8 text-sm text-slate-500">
        See also our{" "}
        <Link href="/terms" className="text-teal-700 underline">
          Terms of Service
        </Link>
        .
      </p>
    </main>
  );
}
