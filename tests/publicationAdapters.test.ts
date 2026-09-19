import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildBryceCastUiContext } from '../src/data/uiContextAdapter';
import { lapScopesForObservedLaps, selectableSectionLap, resolveHeatSections, type SectionObservationSet } from '../src/data/sectionObservations';
import type { TrackSectionAnchorSet } from '../src/assets/tracks/sections';

// Hydrate the actual included snapshot through its production SHA-256 loaders.
const context = await buildBryceCastUiContext();
assert.equal(context.dataPackage.asOfDate, '2026-09-10');
assert.equal(context.raceDebrief.featuredDebriefs.length, 3, 'The dated snapshot must hydrate all three featured debriefs');
assert.ok(context.contextPackIntegrity.checkedRefs >= 6);
const manifest = JSON.parse(await readFile('analysis/predictive-race-intelligence/output/context-packs/context-pack-manifest.json', 'utf8'));
assert.equal(manifest.packs.filter((p: { type: string }) => p.type === 'race_debrief').length, 45);
for (const pack of manifest.packs) {
  const bytes = await readFile(pack.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), pack.sha256, `Pack integrity: ${pack.path}`);
}
assert.ok(context.careerLab.contextPack);
assert.ok(context.liveCompanion.fixtures.some(f => f.state === 'pre_session'));

// Invented examples exercise spatial honesty and real qualifying lap selection.
assert.deepEqual(lapScopesForObservedLaps([1, 2]), [{ kind: 'full_race' }], 'No artificial thirds for two-lap qualifying');
assert.equal(selectableSectionLap(99, [2, 4, 7], 4), 4, 'Fall back to a real observed lap');
assert.equal(selectableSectionLap(1, []), null, 'Missing lap data must stay unavailable');
const anchors = { sections: [
  { familyId: 'measured', sectionName: 'S1', label: 'Measured', startT: 0, endT: 0.25 },
  { familyId: 'remainder', sectionName: 'Rest', label: 'Derived remainder', startT: 0.25, endT: 0.5, kind: 'derived_remainder' },
  { familyId: 'missing', sectionName: 'S3', label: 'Missing', startT: 0.5, endT: 1 }
] } as unknown as TrackSectionAnchorSet;
const observations = { sections: [
  { sectionName: 'S1', percentile: 0.6 },
  { sectionName: 'Rest', percentile: 0.99 },
  { sectionName: 'S3', percentile: null }
] } as unknown as SectionObservationSet;
const heat = resolveHeatSections(anchors, observations);
assert.equal(heat.length, 2, 'Missing observations must not gain a map color');
assert.equal(heat.find(s => s.familyId === 'measured')?.isTopSection, true);
assert.equal(heat.find(s => s.familyId === 'remainder')?.isTopSection, false, 'A derived remainder cannot become a measured gold highlight');
console.log(`PASS: ${manifest.packs.length} historical context-pack hashes and ${context.contextPackIntegrity.checkedRefs} hydrated references; qualifying and heat-map honesty controls`);
