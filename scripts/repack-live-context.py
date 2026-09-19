"""Regenerate only the live context pack after an API-source change.

Uses the owning producer and manifest builder; never patches a hash by hand,
refreshes a source, fits a model, or touches a live archive. Restore the licensed
canonical dataset first; see DATA_RELEASE.md.
"""
import importlib.util
from pathlib import Path

root = Path(__file__).resolve().parents[1]
if not (root / 'data/career/career.dataset.json').is_file():
    raise SystemExit('Canonical dataset is not included in this Git release. See DATA_RELEASE.md before restoring it.')
producer = root / 'analysis/predictive-race-intelligence/scripts/build_predictive_race_intelligence.py'
spec = importlib.util.spec_from_file_location('predictive_producer', producer)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
path = module.PACK_DIR / 'context-pack-manifest.json'
old = module.load_json(path)
live = module.build_live_race_day_pack()
refs = [live if row['id'] == live['id'] else row for row in old['packs']]
module.write_json(path, module.build_manifest(refs, old['upstreamCoverage']))
print('Regenerated live context and its manifest through the owning producer; model results unchanged.')
