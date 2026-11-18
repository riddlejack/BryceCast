/* Which chapter gets which signature visual (Career round 3). A chapter with
 * none keeps round 2's tiles and strip. */

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
import { IndyNxtSignature } from './indyNxt';

export { useOldChapters } from './common';

interface Context {
  narrative: string;
  extra?: string | null;
}

const SIGNATURES: Record<string, (context: Context) => ReactNode> = {
  scca: () => <SccaSignature />,
  f1600: () => <F1600Signature />,
  rcffs: () => <RcffsSignature />,
  'formula-ford': () => <FormulaFordSignature />,
  gb3: () => <Gb3Signature />,
  euroformula: () => <EuroformulaSignature />,
  'fr-oceania': () => <FrocSignature />,
  'usf-pro-2000': () => <UsfSignature />,
  daytona: () => <DaytonaSignature />,
  'indy-nxt': ({ narrative, extra }) => <IndyNxtSignature narrative={narrative} extra={extra} />
};

/** The chapter's signature visual (with its own opening line), or null. */
export const chapterSignature = (key: string): ((context: Context) => ReactNode) | null => SIGNATURES[key] ?? null;
