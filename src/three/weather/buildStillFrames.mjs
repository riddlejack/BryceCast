// Bakes src/three/weather/stillFrames.json: for every venue with a 3D still, the camera of its opening view (the one
// the still was drawn from: the model's own `camera`, azimuth and elevation in degrees) and the model's north as a
// unit vector in the model's xz frame. The weather overlay on a still uses it to lay the wind arrow on the picture's
// ground plane without loading the model. Run from the repo root after the stills or models change:
//   node src/three/weather/buildStillFrames.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../../../public/tracks-3d/', import.meta.url);
const stills = JSON.parse(readFileSync(new URL('stills/index.json', root), 'utf8'));
const models = JSON.parse(readFileSync(new URL('models/index.json', root), 'utf8')).venues;
const out = {};
for (const slug of Object.keys(stills.venues).sort()) {
  const entry = models[slug];
  if (!entry) continue;
  const data = JSON.parse(readFileSync(new URL('.' + entry.file.replace('/tracks-3d', ''), root), 'utf8'));
  // venue and city models: metres, x east, north toward -z. Laguna: map north (0, -1) turned by the model's turnY.
  const turn = data.kind === 'laguna' ? data.model.turnY : 0;
  const north = [-Math.sin(turn), -Math.cos(turn)].map((v) => Math.round(v * 1e5) / 1e5);
  out[slug] = { azim: data.camera.azim, elev: data.camera.elev, north };
}
writeFileSync(new URL('./stillFrames.json', import.meta.url), JSON.stringify(out, null, 0) + '\n');
console.log(Object.keys(out).length, 'venues');
