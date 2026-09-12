import { brand } from "@repo/brand";
import type { Metadata } from "next";

import { isGated } from "../_gate/token";
import { SITE } from "../_content";
import { WaitlistForm } from "./form";

export const dynamic = "force-dynamic";

const COPY = {
  eyebrow: "Not open yet",
  lead: "We're still building. Leave your address and we'll tell you when it's ready.",
  passwordHeading: "Have a password?",
  passwordLabel: "Preview password",
  passwordCta: "Enter",
  wrong: "That password is not right.",
} as const;

export const metadata: Metadata = {
  title: "Waiting list",
  description: COPY.lead,
  // The one page a stranger can reach while the gate is up, and the only one worth indexing until
  // there is a product behind it.
  robots: { index: true, follow: true },
};

/**
 * THE PRE-LAUNCH DOOR.
 *
 * Every route redirects here until someone enters the password, which is what `isGated()` and the
 * middleware do between them. Two things live on it and they are for two different people: a
 * stranger leaves an address, and someone with the password gets in.
 *
 * THE PASSWORD FORM IS A PLAIN POST to /api/gate, not a client component calling an action. It
 * therefore works with JavaScript disabled, and -- more to the point -- the password never enters
 * React state, a URL, or anything a browser extension reads off the page.
 */
export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; wrong?: string }>;
}) {
  const { from, wrong } = await searchParams;
  // Only ever a path off this site. A full URL here would be an open redirect.
  const next = from && /^\/(?!\/)/.test(from) ? from : "/";

  return (
    <main id="main" className="bg-ground flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-center px-8 py-16">
        <img src={brand.logoPath} alt={brand.productName} width={160} height={46} />

        <span className="text-ink-faint mt-12 block text-xs font-bold tracking-[0.14em] uppercase">
          {COPY.eyebrow}
        </span>
        <h1 className="font-display text-ink mt-3 text-[clamp(30px,4vw,44px)] leading-[1.06] font-normal tracking-[-0.045em]">
          {SITE.heroLine1}
          <br />
          <span className="brand-gradient-text">{SITE.heroLine2}</span>
        </h1>
        <p className="text-ink-muted mt-4 leading-relaxed">{COPY.lead}</p>

        <div className="border-line bg-surface mt-8 rounded-xl border p-7">
          <WaitlistForm source={next} />
        </div>

        {isGated() ? (
          <div className="border-line mt-6 rounded-xl border border-dashed p-7">
            <p className="text-ink text-sm font-bold">{COPY.passwordHeading}</p>
            <form action="/api/gate" method="post" className="mt-3 flex flex-wrap gap-3">
              <input type="hidden" name="from" value={next} />
              <input
                name="password"
                type="password"
                required
                aria-label={COPY.passwordLabel}
                autoComplete="current-password"
                className="border-line text-ink focus-visible:outline-accent min-h-[46px] min-w-[200px] flex-1 rounded-md border px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-[3px]"
              />
              <button
                type="submit"
                className="border-line text-ink hover:bg-surface-inset min-h-[46px] rounded-md border px-6 text-sm font-bold transition-colors"
              >
                {COPY.passwordCta}
              </button>
            </form>
            {wrong ? (
              <p role="alert" className="text-accent-hover mt-2 text-xs font-bold">
                {COPY.wrong}
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="text-ink-faint mt-10 text-xs">
          {brand.legalEntity} &middot; {brand.companyRegistration}
        </p>
      </div>
    </main>
  );
}
