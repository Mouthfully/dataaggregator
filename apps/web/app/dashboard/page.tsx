import type { Metadata } from "next";

import { Footer, SiteHeader } from "../_chrome";
import {
  DASHBOARD_ACTIVITY,
  DASHBOARD_CHANNELS,
  DASHBOARD_INSIGHTS,
  DASHBOARD_METRICS,
  DASHBOARD_NAV,
  DASHBOARD_PRODUCTS,
  SITE_DASHBOARD,
} from "../_content";

export const metadata: Metadata = {
  title: "Client dashboard",
  description: SITE_DASHBOARD.lead,
  // A concept screen must not be indexed as if it were the product. When it reads live data this
  // line comes off, and not before.
  robots: { index: false, follow: true },
};

/**
 * The client workspace, built to the supplied `assets/client-dashboard.png` concept.
 *
 * EVERY NUMBER ON THIS PAGE IS ILLUSTRATIVE, and the page says so where a reader will see it rather
 * than only in a comment. `envelope_rows` holds zero rows, there is no workspace and no API key, so
 * there is nothing to render live -- see docs/marketplane/MVP-PLAN.md section 5, steps 8 and 9.
 *
 * The figures live in `_content.ts` rather than in this file so that the change from concept to
 * product is a change to where the arrays come from, and the constants are deleted in one piece.
 * A figure typed into this JSX would have to be hunted for.
 *
 * `robots: noindex` above is the other half of that honesty: nothing here should reach a search
 * result as though it were a live product screen.
 */
export default function DashboardPage() {
  return (
    <>
      <SiteHeader />

      <main id="main" className="bg-ground">
        <div className="mx-auto max-w-[1200px] px-8 pt-10 pb-6">
          <span className="text-ink-faint block text-xs font-bold tracking-[0.14em] uppercase">
            {SITE_DASHBOARD.eyebrow}
          </span>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <h1 className="font-display text-ink text-[clamp(30px,3.4vw,44px)] leading-[1.08] font-bold tracking-[-0.04em]">
              {SITE_DASHBOARD.heroLine1}
              <br />
              <span className="brand-gradient-text">{SITE_DASHBOARD.heroLine2}</span>
            </h1>
            <p className="border-line bg-surface text-ink-subtle rounded-[10px] border px-4 py-2 text-xs">
              {SITE_DASHBOARD.notice}
            </p>
          </div>
          <p className="text-ink-muted mt-4 max-w-[560px] text-lg leading-relaxed">
            {SITE_DASHBOARD.lead}
          </p>
        </div>

        <div className="mx-auto max-w-[1200px] px-8 pb-20">
          <div className="border-line bg-surface grid overflow-hidden rounded-xl border md:grid-cols-[232px_1fr]">
            <Sidebar />

            <div className="min-w-0 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-ink text-2xl font-bold tracking-[-0.02em]">
                  {SITE_DASHBOARD.title}
                </h2>
                <span className="border-line text-ink-muted rounded-[10px] border px-4 py-2 text-xs">
                  {SITE_DASHBOARD.period}
                </span>
              </div>

              <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {DASHBOARD_METRICS.map((metric) => (
                  <li key={metric.id} className="border-line rounded-lg border p-4">
                    <span className="text-ink-subtle block text-sm">{metric.label}</span>
                    <strong className="text-ink mt-1 block text-3xl font-bold tracking-[-0.03em]">
                      {metric.value}
                    </strong>
                    <Delta value={metric.delta} />
                  </li>
                ))}
              </ul>

              <div className="mt-5 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
                <RevenueChart />
                <Insights />
              </div>

              <Channels />

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <Panel title="Top products">
                  <ul>
                    {DASHBOARD_PRODUCTS.map((product) => (
                      <li
                        key={product.id}
                        className="border-line-soft flex items-center gap-4 border-b py-3 last:border-b-0"
                      >
                        <span
                          className="bg-surface-inset h-10 w-10 shrink-0 rounded-md"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <strong className="text-ink block truncate text-sm font-bold">
                            {product.name}
                          </strong>
                          <span className="text-ink-subtle block text-xs">{product.units}</span>
                        </span>
                        <span className="text-ink text-sm font-bold">{product.value}</span>
                        <Delta value={product.delta} />
                      </li>
                    ))}
                  </ul>
                </Panel>

                <Panel title="Recent activity">
                  <ul>
                    {DASHBOARD_ACTIVITY.map((entry) => (
                      <li
                        key={entry.id}
                        className="border-line-soft flex items-start gap-4 border-b py-3 last:border-b-0"
                      >
                        <span
                          className="bg-surface-inset h-9 w-9 shrink-0 rounded-full"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <strong className="text-ink block text-sm font-bold">
                            {entry.title}
                          </strong>
                          <span className="text-ink-subtle block text-xs">{entry.body}</span>
                        </span>
                        <span className="text-ink-faint shrink-0 text-xs">{entry.when}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}

function Sidebar() {
  return (
    <aside className="border-line bg-surface-subtle border-b p-5 md:border-r md:border-b-0">
      <div className="border-line bg-surface flex items-center gap-3 rounded-[10px] border px-3 py-2.5">
        <span className="bg-surface-inset text-accent flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold">
          {SITE_DASHBOARD.workspaceInitials}
        </span>
        <span className="text-ink truncate text-sm font-bold">{SITE_DASHBOARD.workspace}</span>
      </div>
      <nav className="mt-5">
        <ul>
          {DASHBOARD_NAV.map((item, index) => (
            <li key={item.id}>
              <span
                className={
                  index === 0
                    ? "bg-surface-inset text-accent mb-1 flex rounded-[10px] px-3 py-2.5 text-sm font-bold"
                    : "text-ink-muted mb-1 flex rounded-[10px] px-3 py-2.5 text-sm"
                }
              >
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

/** A positive delta. The arrow is decorative; the sign is already in the string. */
function Delta({ value }: { value: string }) {
  return (
    <span className="text-brand-mint text-xs font-bold">
      <span aria-hidden="true">&uarr;</span> {value}
    </span>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-line rounded-lg border p-5">
      <h3 className="font-display text-ink text-base font-bold">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function RevenueChart() {
  return (
    <section className="border-line rounded-lg border p-5">
      <h3 className="font-display text-ink text-base font-bold">Revenue over time</h3>
      <svg
        viewBox="0 0 640 220"
        className="mt-4 block w-full"
        role="img"
        aria-label="Revenue over time"
      >
        <title>Revenue over time</title>
        <defs>
          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="text-brand-mint">
          <path
            d="M0 186 L53 170 L107 176 L160 132 L213 146 L267 104 L320 118 L373 80 L427 92 L480 52 L533 66 L587 28 L640 14 L640 220 L0 220 Z"
            fill="url(#fill)"
          />
          <path
            d="M0 186 L53 170 L107 176 L160 132 L213 146 L267 104 L320 118 L373 80 L427 92 L480 52 L533 66 L587 28 L640 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </g>
      </svg>
      <ul className="text-ink-faint mt-2 flex justify-between text-xs">
        {["Jun 1", "Jun 10", "Jun 20", "Jun 30"].map((tick) => (
          <li key={tick}>{tick}</li>
        ))}
      </ul>
    </section>
  );
}

function Insights() {
  return (
    <section className="border-line rounded-lg border p-5">
      <h3 className="font-display text-ink text-base font-bold">AI insights</h3>
      <ul className="mt-2">
        {DASHBOARD_INSIGHTS.map((insight) => (
          <li key={insight.id} className="border-line-soft border-b py-3 last:border-b-0">
            <strong className="text-ink block text-sm font-bold">{insight.title}</strong>
            <span className="text-ink-muted mt-1 block text-xs leading-relaxed">
              {insight.body}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Channels() {
  return (
    <section className="border-line mt-5 rounded-lg border p-5">
      <h3 className="font-display text-ink text-base font-bold">Channel performance</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="text-ink-subtle text-xs">
              {["Channel", "Revenue", "Ad spend", "ROAS"].map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="border-line-soft border-b pb-2 font-normal"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DASHBOARD_CHANNELS.map((row) => (
              <tr key={row.id} className="border-line-soft border-b last:border-b-0">
                <th scope="row" className="text-ink py-3 text-sm font-bold">
                  {row.channel}
                </th>
                <td className="py-3 text-sm">
                  <span className="text-ink">{row.revenue}</span> <Delta value={row.rd} />
                </td>
                <td className="py-3 text-sm">
                  <span className="text-ink">{row.spend}</span> <Delta value={row.sd} />
                </td>
                <td className="py-3 text-sm">
                  <span className="text-ink">{row.roas}</span> <Delta value={row.od} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
