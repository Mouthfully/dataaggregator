import type { MetricName } from "@repo/contract";

import type { PerformanceRow } from "../_auth/workspace";
import { DASHBOARD_LIVE } from "../_content";
import { type Figure, formatFigure, presentMetrics } from "./_figures";

/**
 * THE WORKSPACE'S OWN ROWS, WITH THEIR FIGURES.
 *
 * Until this component existed the dashboard selected six metadata columns and rendered none of
 * them: a paying customer could learn that rows EXISTED and could not learn what they said. The
 * metric columns are now selected in `../_auth/workspace.ts` and printed here.
 *
 * FOUR RULES, AND EACH OF THEM IS A NUMBER THIS TABLE REFUSES TO PRINT.
 *
 * 1. A CURRENCY METRIC CARRIES ITS OWN CURRENCY. The code comes off the row, so two rows in two
 *    currencies read as two currencies rather than as one total nobody can spend.
 * 2. A PROVISIONAL FIGURE IS MARKED ON THE FIGURE. `is_provisional` was already being selected and
 *    thrown away. A row-level status column alone would be too far from the number: the mark rides
 *    on the digits so it survives being read aloud or pasted into a message.
 * 3. A NULL IS ABSENT, NEVER ZERO. See `_figures.ts`.
 * 4. EVERY ROW SAYS WHEN IT WAS READ. `fetched_at` is printed verbatim, with its offset, because
 *    reformatting it into a local time would mean choosing a timezone -- and the row's own
 *    `timezone` column describes the reporting day, not the moment of the fetch.
 *
 * The metric COLUMN HEADINGS are the dictionary's own names -- `conversions_value`, not "Conv.
 * value". They are the vocabulary the API, the docs and the contract use, and a prettier label
 * invented here would be a thirteenth name for twelve metrics.
 *
 * Every sentence comes from `DASHBOARD_LIVE`; nothing on this page is prose typed into the JSX.
 */

const CELL = "border-line-soft border-b py-2 pr-4 text-sm last:pr-0";
const HEAD = "border-line-soft text-ink-subtle border-b pb-2 pr-4 font-normal last:pr-0";
const FIGURE_CELL = `${CELL} text-right tabular-nums`;

function FigureText({ figure, provisional }: { figure: Figure; provisional: boolean }) {
  if (figure.kind === "absent") {
    return (
      <span className="text-ink-faint" title={DASHBOARD_LIVE.absentTitle}>
        {DASHBOARD_LIVE.absentMark}
      </span>
    );
  }

  if (figure.kind === "unreadable") {
    return (
      <span className="text-ink-faint" title={DASHBOARD_LIVE.unreadableTitle}>
        {DASHBOARD_LIVE.unreadableMark}
      </span>
    );
  }

  return (
    <span className="text-ink">
      {figure.text}
      {provisional ? (
        <sup className="text-ink-muted" title={DASHBOARD_LIVE.provisionalTitle}>
          {DASHBOARD_LIVE.provisionalMark}
        </sup>
      ) : null}
    </span>
  );
}

function Status({ provisional }: { provisional: boolean }) {
  // Provisional gets the border and the inset ground; final is quiet text. The distinction is
  // carried by the WORD in both cases -- the surface only makes the unsettled one harder to skim
  // past, and nothing here depends on a reader telling two colours apart.
  return provisional ? (
    <span className="border-line bg-surface-inset text-ink rounded-[10px] border px-2 py-1 text-xs font-bold">
      {DASHBOARD_LIVE.provisional}
    </span>
  ) : (
    <span className="text-ink-subtle text-xs">{DASHBOARD_LIVE.final}</span>
  );
}

export function LiveRows({ rows }: { rows: readonly PerformanceRow[] }) {
  // Derived from the rows rather than from the dictionary: a source that reports four of the
  // twelve metrics gets four columns, and the other eight do not become a wall of dashes.
  const metrics: readonly MetricName[] = presentMetrics(rows);

  return (
    <section className="border-line bg-surface rounded-xl border p-6">
      <h2 className="font-display text-ink text-2xl font-semibold tracking-[-0.02em]">
        {DASHBOARD_LIVE.heading}
      </h2>
      <p className="text-ink-muted mt-2 max-w-[720px] text-sm leading-relaxed">
        {DASHBOARD_LIVE.note}
      </p>

      {metrics.length === 0 ? (
        <p className="border-line text-ink-muted mt-4 rounded-lg border border-dashed px-4 py-3 text-sm">
          {DASHBOARD_LIVE.noMetrics}
        </p>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-xs">
              <th scope="col" className={HEAD}>
                {DASHBOARD_LIVE.columns.source}
              </th>
              <th scope="col" className={HEAD}>
                {DASHBOARD_LIVE.columns.entity}
              </th>
              <th scope="col" className={HEAD}>
                {DASHBOARD_LIVE.columns.date}
              </th>
              <th scope="col" className={HEAD}>
                {DASHBOARD_LIVE.columns.window}
              </th>
              {metrics.map((metric) => (
                <th key={metric} scope="col" className={`${HEAD} text-right font-mono`}>
                  {metric}
                </th>
              ))}
              <th scope="col" className={HEAD}>
                {DASHBOARD_LIVE.columns.status}
              </th>
              <th scope="col" className={HEAD}>
                {DASHBOARD_LIVE.columns.fetched}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                // The section 7 upsert key, minus the workspace the policy already fixed. Anything
                // shorter -- entity and date, say -- collides between two attribution windows of
                // the same entity, which is a legitimate pair of rows and not a duplicate.
                key={`${row.source} ${row.entity_id} ${row.date} ${row.attribution_window ?? ""}`}
                className="last:[&>*]:border-b-0"
              >
                <th scope="row" className={`${CELL} text-ink font-mono text-xs font-bold`}>
                  {row.source}
                </th>
                <td className={`${CELL} text-ink-muted font-mono text-xs`}>{row.entity_id}</td>
                <td className={`${CELL} text-ink-muted font-mono text-xs`}>
                  <time dateTime={row.date}>{row.date}</time>
                </td>
                <td className={`${CELL} text-ink-muted text-xs`}>
                  {row.attribution_window ?? DASHBOARD_LIVE.unattributed}
                </td>
                {metrics.map((metric) => (
                  <td key={metric} className={FIGURE_CELL}>
                    <FigureText
                      figure={formatFigure(metric, row[metric], row.currency)}
                      provisional={row.is_provisional}
                    />
                  </td>
                ))}
                <td className={CELL}>
                  <Status provisional={row.is_provisional} />
                </td>
                <td className={`${CELL} text-ink-subtle font-mono text-xs`}>
                  <time dateTime={row.fetched_at}>{row.fetched_at}</time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="text-ink-subtle mt-4 grid gap-1 text-xs">
        {DASHBOARD_LIVE.legend.map((entry) => (
          <li key={entry.id}>
            <span className="text-ink font-bold">{entry.mark}</span> {entry.body}
          </li>
        ))}
      </ul>
    </section>
  );
}
