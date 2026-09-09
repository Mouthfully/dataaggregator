import fs from "node:fs";
import { chromium } from "playwright";

const body = fs.readFileSync("cost-model.html", "utf8");
const printCss = `
<style>
  @page { size: A4 portrait; margin: 14mm 0 14mm 0; }
  html, body { background: #FFFFFF !important; }
  body { padding: 0 !important; }
  header.masthead, .fx-note, .kpis, .legend, section, footer,
  .col, .wide, .tw, figure, .finding, .note, .pull, .tiers { max-width: 980px !important; margin-inline: auto !important; }
  figure, table, .finding, .note, .kpis, .pull, .tw, .tier, .chart-frame { break-inside: avoid; page-break-inside: avoid; }
  h2, h3 { break-after: avoid; page-break-after: avoid; }
  section { padding-top: 30px !important; }
  .tw { overflow: visible !important; }
  table { min-width: 0 !important; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  footer { break-before: page; page-break-before: always; }
</style>`;
fs.writeFileSync(
  "print.html",
  `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:14px system-ui}img{max-width:100%}</style></head><body>${body}${printCss}</body></html>`,
);
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const pg = await b.newPage({ viewport: { width: 1120, height: 1600 }, colorScheme: "light" });
await pg.goto("file://" + process.cwd() + "/print.html", { waitUntil: "networkidle" });
await pg.evaluate(() => document.fonts.ready);
await pg.waitForTimeout(2500);
await pg.pdf({
  path: "SME-data-plane-model.pdf",
  format: "A4",
  printBackground: true,
  scale: 0.72,
  margin: { top: "12mm", bottom: "14mm", left: "10mm", right: "10mm" },
  displayHeaderFooter: true,
  headerTemplate: "<div></div>",
  footerTemplate:
    '<div style="width:100%;font:9px -apple-system,sans-serif;color:#77837F;padding:0 14mm;display:flex;justify-content:space-between"><span>SME data plane — operating and financial model, v9</span><span class="pageNumber"></span></div>',
});
await b.close();
console.log("done");
