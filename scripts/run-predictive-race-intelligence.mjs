import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = process.cwd();
const bundledPythonPath = path.join(
  process.env.HOME ?? '',
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'
);

const predictiveScripts = [
  'analysis/predictive-race-intelligence/scripts/build_predictive_race_intelligence.py',
  'analysis/predictive-race-intelligence/scripts/validate_predictive_race_intelligence.py'
];
const requirementsPath = 'analysis/requirements.txt';
const projectPythonPath = path.join(process.env.HOME ?? '', '.brycecast/runtime/analytics/bin/python');

export const analyticsPython = () => {
  if (process.env.BRYCECAST_ANALYTICS_PYTHON) return process.env.BRYCECAST_ANALYTICS_PYTHON;
  if (fs.existsSync(projectPythonPath)) return projectPythonPath;
  if (fs.existsSync(bundledPythonPath)) return bundledPythonPath;
  return 'python3';
};

export const runPredictiveRaceIntelligence = ({ cwd = repoRoot, stdio = 'inherit' } = {}) => {
  const python = analyticsPython();
  const dependencyCheck = spawnSync(python, ['-c', 'import numpy, pandas, PIL'], { cwd, stdio: 'pipe' });
  if (dependencyCheck.error) {
    throw new Error(`Failed to run Python dependency preflight with ${python}: ${dependencyCheck.error.message}`);
  }
  if (dependencyCheck.status !== 0) {
    throw new Error(
      `Predictive analytics requires numpy, pandas and Pillow. Run npm run analytics:setup. Set BRYCECAST_ANALYTICS_PYTHON to a prepared Python, or install ${requirementsPath} for ${python}.`
    );
  }
  for (const script of predictiveScripts) {
    const result = spawnSync(python, [script], { cwd, stdio });
    if (result.error) {
      throw new Error(`Failed to run ${script} with ${python}: ${result.error.message}`);
    }
    if (result.status !== 0) {
      throw new Error(`${script} exited ${result.status ?? 'without a status'} using ${python}`);
    }
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPredictiveRaceIntelligence();
}
