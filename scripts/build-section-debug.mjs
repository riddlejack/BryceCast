/** Dev helper (not shipped): render a debug overlay per oval so the curated
 *  section spans in src/assets/tracks/sections/<slug>.ts can be VERIFIED
 *  VISUALLY against the outline geometry (Brief E / Brief H acceptance:
 *  S/F anchor, turns on arcs, straights between). Writes one HTML page with all
 *  four ovals to reports/brief-h/section-anchor-debug.html for screenshotting.
 *
 *  Colours here are DIAGNOSTIC (a distinct hue per span so boundaries are
 *  obvious) — this is a verification tool, not shipped UI, so it does not use
 *  the house ink↔gold ramp.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const repoRoot = process.cwd();
const OVALS = [
  'nashville-superspeedway',
  'world-wide-technology-raceway',
  'iowa-speedway',
  'the-milwaukee-mile'
];
const DIAG = ['#0066cc', '#e09a2f', '#2f9377', '#b05a73', '#5581c2', '#b98a3f', '#2e9ac2'];

const parsePoints = (d) => {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const points = [];
  for (let i = 0; i + 1 < nums.length; i += 2) points.push({ x: nums[i], y: nums[i + 1] });
  return points;
};

const geometryFor = (mainPath) => {
  const points = parsePoints(mainPath);
  const n = points.length;
  const cum = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    cum[i + 1] = cum[i] + Math.hypot(b.x - a.x, b.y - a.y);
  }
  const total = cum[n] || 1;
  const pointAtT = (t) => {
    const d = ((((t % 1) + 1) % 1) * total);
    let i = 0;
    while (i < n && cum[i + 1] < d) i += 1;
    const a = points[i % n];
    const b = points[(i + 1) % n];
    const segLen = cum[i + 1] - cum[i] || 1;
    const frac = (d - cum[i]) / segLen;
    return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
  };
  return { pointAtT };
};

const spanLen = (start, end) => ((end - start + 1) % 1) || (end === start ? 0 : 1);
const spanMid = (start, end) => (start + spanLen(start, end) / 2) % 1;

const dashesFor = (start, end) =>
  start <= end
    ? [{ arr: `${end - start} 2`, off: -start }]
    : [
        { arr: `${1 - start} 2`, off: -start },
        { arr: `${end} 2`, off: 0 }
      ];

/** Extract the curated section anchors from a <slug>.ts file with a regex —
 *  the files have a fixed object-literal shape authored by this slice. */
const readSections = (slug) => {
  const src = fs.readFileSync(path.join(repoRoot, `src/assets/tracks/sections/${slug}.ts`), 'utf8');
  const confidence = /confidence:\s*'([^']+)'/.exec(src)?.[1] ?? 'unknown';
  const re =
    /sectionName:\s*'((?:[^'\\]|\\.)*)',\s*label:\s*'((?:[^'\\]|\\.)*)',\s*startT:\s*([\d.]+),\s*endT:\s*([\d.]+)/g;
  const sections = [];
  let match;
  while ((match = re.exec(src)) !== null) {
    sections.push({
      sectionName: match[1].replace(/\\'/g, "'"),
      label: match[2].replace(/\\'/g, "'"),
      startT: Number(match[3]),
      endT: Number(match[4])
    });
  }
  return { confidence, sections };
};

const svgFor = (slug) => {
  const asset = JSON.parse(fs.readFileSync(path.join(repoRoot, `src/assets/tracks/${slug}.json`), 'utf8'));
  const [, , vw, vh] = asset.viewBox.split(' ').map(Number);
  const { pointAtT } = geometryFor(asset.mainPath);
  const { confidence, sections } = readSections(slug);
  const px = (v) => (v / 760) * vw; // debug renders ~760px wide

  const spans = sections
    .map((section, index) => {
      const color = DIAG[index % DIAG.length];
      const paths = dashesFor(section.startT, section.endT)
        .map(
          (d) =>
            `<path d="${asset.mainPath}" fill="none" pathLength="1" stroke="${color}" stroke-width="${px(6)}" stroke-linecap="round" stroke-dasharray="${d.arr}" stroke-dashoffset="${d.off}" opacity="0.9"/>`
        )
        .join('');
      const mid = pointAtT(spanMid(section.startT, section.endT));
      const label = `<text x="${mid.x}" y="${mid.y}" text-anchor="middle" dominant-baseline="middle" font-size="${px(13)}" font-family="system-ui" font-weight="600" fill="#111">${index + 1}</text>`;
      return { paths, label, color, section };
    })
    .filter(Boolean);

  const cornerMarks = asset.cornerArcs
    .map((arc, i) => {
      const dot = (p, r, fill) => `<circle cx="${p.x}" cy="${p.y}" r="${px(r)}" fill="${fill}"/>`;
      return (
        dot(arc.apex, 4, '#d62828') +
        dot(arc.entryQuarter, 2.5, '#888') +
        dot(arc.exitQuarter, 2.5, '#888') +
        `<text x="${arc.apex.x}" y="${arc.apex.y - px(9)}" text-anchor="middle" font-size="${px(11)}" font-family="system-ui" fill="#d62828">${arc.label ?? `arc${i}`}</text>`
      );
    })
    .join('');

  const sf = asset.startFinish
    ? `<g transform="translate(${asset.startFinish.x} ${asset.startFinish.y}) rotate(${asset.startFinish.angleDeg + 90})"><line x1="${-px(10)}" x2="${px(10)}" stroke="#f5b63f" stroke-width="${px(5)}" stroke-linecap="round"/></g><text x="${asset.startFinish.x}" y="${asset.startFinish.y + px(16)}" text-anchor="middle" font-size="${px(11)}" font-family="system-ui" fill="#b8860b">S/F</text>`
    : '';

  const legend = spans
    .map(
      (s, i) =>
        `<div class="legend-row"><span class="swatch" style="background:${s.color}"></span><b>${i + 1}</b> <code>${s.section.sectionName}</code> → “${s.section.label}” <span class="t">t ${s.section.startT.toFixed(3)}–${s.section.endT.toFixed(3)}</span></div>`
    )
    .join('');

  return `<section class="oval">
    <h2>${asset.name} <small>(${confidence}, ${sections.length} sections, ${asset.drivingDirection})</small></h2>
    <svg viewBox="${asset.viewBox}" width="760" style="max-width:100%;height:auto;background:#fff;border:1px solid #eee">
      <path d="${asset.mainPath}" fill="none" stroke="#ccc" stroke-width="${px(2)}" stroke-linejoin="round"/>
      ${spans.map((s) => s.paths).join('')}
      ${sf}
      ${cornerMarks}
      ${spans.map((s) => s.label).join('')}
    </svg>
    <div class="legend">${legend}</div>
  </section>`;
};

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Brief H — section anchor debug</title>
<style>
  body{font-family:system-ui;margin:24px;color:#1d1d1f;background:#fafafa}
  h1{font-size:20px} h2{font-size:15px;margin:24px 0 8px} h2 small{color:#888;font-weight:400}
  .oval{background:#fff;border:1px solid #eee;border-radius:12px;padding:16px;margin-bottom:20px}
  .legend{margin-top:10px;font-size:12px;display:grid;gap:4px}
  .legend-row{display:flex;gap:8px;align-items:center}
  .swatch{width:14px;height:14px;border-radius:3px;display:inline-block}
  code{background:#f2f2f4;padding:1px 5px;border-radius:4px}
  .t{color:#888;margin-left:auto}
  p.note{font-size:12px;color:#666;max-width:70ch}
</style></head><body>
<h1>Brief H — oval section anchor debug overlay</h1>
<p class="note">Diagnostic colours (one hue per span, numbered in driving order) prove span alignment: the gold S/F tick should fall on the start/finish straight, each numbered span should cover its named turn(s) with the red corner-apex dots inside, and boundaries should land on straights. These colours are NOT the shipped ink↔gold heat ramp.</p>
${OVALS.map(svgFor).join('')}
</body></html>`;

const outDir = path.join(os.homedir(), '.brycecast/reports/brief-h');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'section-anchor-debug.html');
fs.writeFileSync(outPath, html);
console.log(`wrote ${outPath}`);
