import { CONNECTIONS } from "../_content";
import type { ConnectionListRow } from "./_connections";

const CELL = "border-line-soft border-b py-3 pr-4 text-sm last:pr-0 align-top";
const HEAD = "border-line-soft text-ink-subtle border-b pb-2 pr-4 font-normal last:pr-0";

/**
 * One row per connection.
 *
 * TIMESTAMPS ARE PRINTED AS THE DATABASE HOLDS THEM, with their offset, exactly as the dashboard's
 * live table prints `fetched_at`. Reformatting one into a local time would mean choosing a zone,
 * and the connection's own `timezone` column describes the reporting day rather than the moment a
 * pull finished -- so a friendlier rendering here would be a quiet guess.
 *
 * A NULL `last_backfill_at` READS "Never" AND NOT AS A BLANK CELL. Nothing has ever completed a
 * pull on that connection, which is a fact worth stating rather than an absence to skim past.
 */
export function ConnectionTable({ rows }: { rows: readonly ConnectionListRow[] }) {
  return (
    <>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="text-xs">
              <th scope="col" className={HEAD}>
                {CONNECTIONS.columns.provider}
              </th>
              <th scope="col" className={HEAD}>
                {CONNECTIONS.columns.account}
              </th>
              <th scope="col" className={HEAD}>
                {CONNECTIONS.columns.lane}
              </th>
              <th scope="col" className={HEAD}>
                {CONNECTIONS.columns.status}
              </th>
              <th scope="col" className={HEAD}>
                {CONNECTIONS.columns.lastRead}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row" className={`${CELL} text-ink font-bold`}>
                  {CONNECTIONS.providerNames[row.provider] ?? row.provider}
                  {row.timezone === null ? (
                    <span className="text-ink-muted mt-1 block text-xs font-normal">
                      {CONNECTIONS.timezoneMissing}
                    </span>
                  ) : null}
                </th>
                <td className={`${CELL} text-ink-muted`}>
                  {row.display_name === null ? null : (
                    <span className="text-ink block">{row.display_name}</span>
                  )}
                  <span className="font-mono text-xs break-all">{row.external_account_id}</span>
                </td>
                <td className={`${CELL} text-ink-muted`}>
                  {CONNECTIONS.laneNames[row.credential_lane] ?? row.credential_lane}
                </td>
                <td className={`${CELL} text-ink`}>
                  {CONNECTIONS.statusNames[row.status] ?? row.status}
                </td>
                <td className={`${CELL} text-ink-muted font-mono text-xs`}>
                  {row.last_backfill_at ?? CONNECTIONS.never}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-ink-subtle mt-3 text-xs leading-relaxed">{CONNECTIONS.lastReadNote}</p>
      {rows.some((row) => row.timezone === null) ? (
        <p className="text-ink-muted mt-2 text-xs leading-relaxed">{CONNECTIONS.timezoneNote}</p>
      ) : null}
    </>
  );
}
