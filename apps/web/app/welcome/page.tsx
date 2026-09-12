import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { isAuthConfigured } from "../_auth/env";
import { currentUser } from "../_auth/server";
import { SiteHeader } from "../_chrome";
import { WelcomeForm } from "./form";

export const dynamic = "force-dynamic";

const COPY = {
  eyebrow: "One more step",
  heading: "Name your company.",
  lead: "This creates your organisation and its first workspace. You can rename either later.",
  label: "Company name",
  hint: "This is what appears on invoices and in your workspace.",
  submit: "Create workspace",
  pending: "Creating…",
} as const;

export const metadata: Metadata = {
  title: "Welcome",
  description: COPY.lead,
  robots: { index: false, follow: false },
};

/**
 * The screen a person sees once, between signing in and having anywhere to put data.
 *
 * It is not skippable and it is not a modal on the dashboard: until `create_organisation` runs,
 * there is no workspace to connect a source to and no organisation to bill, so every other signed-in
 * screen would have to carry an empty state for a condition that lasts one click.
 */
export default async function WelcomePage() {
  if (!isAuthConfigured()) redirect("/signin");
  const user = await currentUser();
  if (!user) redirect("/signin?next=%2Fwelcome");

  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-ground min-h-[calc(100dvh-94px)]">
        <div className="mx-auto flex max-w-[520px] flex-col px-8 py-16">
          <span className="text-ink-faint block text-xs font-bold tracking-[0.14em] uppercase">
            {COPY.eyebrow}
          </span>
          <h1 className="font-display text-ink mt-3 text-[clamp(30px,3.4vw,40px)] leading-[1.1] font-bold tracking-[-0.04em]">
            {COPY.heading}
          </h1>
          <p className="text-ink-muted mt-4 leading-relaxed">{COPY.lead}</p>

          <div className="border-line bg-surface mt-8 rounded-xl border p-8">
            <WelcomeForm copy={COPY} />
          </div>
        </div>
      </main>
    </>
  );
}
