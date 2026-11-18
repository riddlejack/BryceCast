/* Which chapter gets which signature visual (Career round 3). A chapter with
 * none keeps round 2's tiles and strip.
 *
 * Switch `chapters`: default, the pictures below; `dots`, the first round-3
 * pictures for SCCA, F1600, Formula Ford and FR Oceania (finishes as dots on a
 * position axis, which proxy review 3 judged too close to a plain chart);
 * `boxes`, the default but with F1600's podiums as three plain grey steps;
 * `old`, round 2's tiles and strip. */

import type { ReactNode } from 'react';
import { SccaSignature } from './scca';
import { F1600Signature } from './f1600';
import { RcffsSignature } from './rcffs';
import { FormulaFordSignature } from './formulaFord';
import { Gb3Signature } from './gb3';
import { EuroformulaSignature } from './euroformula';
import { FrocSignature } from './froc';
import { UsfSignature } from './usf';
import { DaytonaSignature } from './daytona';
import { SccaCircuits } from './sccaCircuits';
import { F1600Podiums } from './f1600Podiums';
import { FormulaFordRain } from './formulaFordRain';
import { FrocGrids } from './frocGrids';
import { switchValue } from '../../review/switches';
import { IndyNxtSignature } from './indyNxt';

export { useOldChapters } from './common';

interface Context {
  narrative: string;
  extra?: string | null;
}

const dots = (): boolean => switchValue('chapters') === 'dots';

const SIGNATURES: Record<string, (context: Context) => ReactNode> = {
  scca: () => (dots() ? <SccaSignature /> : <SccaCircuits />),
  f1600: () => (dots() ? <F1600Signature /> : <F1600Podiums steps={switchValue('chapters') === 'boxes' ? 'boxes' : 'drawn'} />),
  rcffs: () => <RcffsSignature />,
  'formula-ford': () => (dots() ? <FormulaFordSignature /> : <FormulaFordRain />),
  gb3: () => <Gb3Signature />,
  euroformula: () => <EuroformulaSignature />,
  'fr-oceania': () => (dots() ? <FrocSignature /> : <FrocGrids />),
  'usf-pro-2000': () => <UsfSignature />,
  daytona: ({ narrative }) => <DaytonaSignature narrative={narrative} />,
  'indy-nxt': ({ narrative, extra }) => <IndyNxtSignature narrative={narrative} extra={extra} />
};

/** The chapter's signature visual (with its own opening line), or null. */
export const chapterSignature = (key: string): ((context: Context) => ReactNode) | null => SIGNATURES[key] ?? null;
