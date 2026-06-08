import { loadApiJson, postApiJson } from './api';
import type { PovSource, PovState, PovStatus } from './types';

const storageKey = 'brycecast:pov-state:v1';

export const livePovDefinition =
  'Live #9 during actual race: Bryce Aron onboard plays during the same INDY NXT race window as the official broadcast, before the checkered flag, for at least 60 seconds.';

export const defaultPovState: PovState = {
  status: 'unproven',
  source: 'INDYCAR App',
  device: 'iPhone or iPad',
  session: 'Road America Race 1',
  verifiedAt: '',
  selectorLabel: '',
  latencyNote: '',
  evidenceRef: '',
  liveConfirmedSeconds: 0,
  notes:
    'Live #9 onboard remains unverified. This gate only passes when Bryce POV is live during the actual race. Delayed footage, cutaways, and replay clips stay in the fallback lane.',
  proofItems: [
    { label: 'Official UI shows onboard/camera selector', done: false },
    { label: 'Selector explicitly lists #9, Bryce Aron, or #9 CGR', done: false },
    { label: 'Feed opens during the actual live race, in the same official-broadcast window, before checkered flag', done: false },
    { label: 'Feed stays live for 60 seconds and matches Bryce timing', done: false }
  ]
};

export const povStatuses: Array<{ value: PovStatus; label: string }> = [
  { value: 'unproven', label: 'Unproven' },
  { value: 'available', label: 'Live #9 Same-Race Available' },
  { value: 'unavailable', label: '#9 Absent' },
  { value: 'locked', label: 'Locked' },
  { value: 'delayed', label: 'Delayed Only' },
  { value: 'broadcast_cutaway', label: 'Broadcast Cutaway Only' },
  { value: 'postrace_only', label: 'Post-Race Only' },
  { value: 'inconclusive', label: 'Inconclusive' }
];

export const povSources: PovSource[] = ['INDYCAR App', 'INDYCAR LIVE', 'FOX/FOX One', 'CGR/INDYCAR/FOX approved monitor', 'Other authorized surface'];

export const povEscalationLanes = [
  {
    owner: 'INDYCAR App selector',
    ask: 'Find a live onboard, in-car, driver cam, or multiview selector that explicitly includes #9 Bryce Aron.',
    pass: 'Public app surface plays #9 live for 60 seconds during the same race window as FS1/FOX.'
  },
  {
    owner: 'Bryce or CGR',
    ask: 'Identify who controls live #9 onboard access and whether a private family/friend/sponsor monitor route can be approved.',
    pass: 'Team or driver camp names the real approver, entitlement, device, or monitor surface for live #9 viewing.'
  },
  {
    owner: 'INDYCAR, FOX, IMS Productions',
    ask: 'Request an authorized private monitor or entitlement when #9 has a production-visible onboard feed.',
    pass: 'Rights holder grants written live local access or gives the exact denial and future condition.'
  },
  {
    owner: 'Delayed replay lane',
    ask: 'Use AiM/SmartyCam, social clips, or licensed footage only after the live route is exhausted for that session.',
    pass: 'Never counts as live POV completion. It supports post-race replay and analytics only.'
  }
];

export const roadAmericaChecklist = [
  { time: 'Sat Jun 20, 8:35 CT', task: 'Open INDYCAR App, confirm login and Road America INDY NXT session listing.' },
  { time: 'Sat Jun 20, 9:00 CT', task: 'During qualifying, check for Onboard, In-Car, Driver Cams, or Multiview and search #9/Bryce Aron.' },
  { time: 'Sat Jun 20, 11:20 CT', task: 'Final pre-race check in INDYCAR App and INDYCAR LIVE before Race 1.' },
  { time: 'Sat Jun 20, 11:36 CT', task: 'If #9 appears, run the 60-second live proof while BryceCast timing is visible.' },
  { time: 'Sun Jun 21, 10:55 CT', task: 'Repeat the live #9 onboard selector check before Race 2.' },
  { time: 'Sun Jun 21, 11:06 CT', task: 'Log available, absent, locked, delayed, broadcast-cutaway-only, post-race-only, or inconclusive with non-video UI evidence.' }
];

const isPovStatus = (value: string): value is PovStatus =>
  ['unproven', 'available', 'unavailable', 'locked', 'delayed', 'broadcast_cutaway', 'postrace_only', 'inconclusive'].includes(value);

const normalize = (candidate: Partial<PovState>): PovState => ({
  ...defaultPovState,
  ...candidate,
  status: candidate.status && isPovStatus(candidate.status) ? candidate.status : defaultPovState.status,
  proofItems:
    Array.isArray(candidate.proofItems) && candidate.proofItems.length === defaultPovState.proofItems.length
      ? candidate.proofItems.map((item, index) => ({
          label: defaultPovState.proofItems[index].label,
          done: Boolean(item.done)
        }))
      : defaultPovState.proofItems
});

export const loadPovState = (): PovState => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? normalize(JSON.parse(raw) as Partial<PovState>) : defaultPovState;
  } catch {
    return defaultPovState;
  }
};

export const savePovState = (state: PovState) => {
  window.localStorage.setItem(storageKey, JSON.stringify(state));
};

export const loadRemotePovState = async (): Promise<PovState | null> => {
  const remote = await loadApiJson<Partial<PovState> & { available?: boolean }>('/api/pov-proof');
  if (!remote || remote.available === false) return null;
  return normalize(remote);
};

export const saveRemotePovState = async (state: PovState) => {
  await postApiJson('/api/pov-proof', state);
};

export const povStatusCopy = (status: PovStatus) => {
  if (status === 'available') return { label: 'Live #9 POV verified', tone: 'green' as const };
  if (status === 'unavailable') return { label: '#9 absent in official selector', tone: 'red' as const };
  if (status === 'locked') return { label: 'Official source locked', tone: 'amber' as const };
  if (status === 'delayed') return { label: 'Delayed only', tone: 'amber' as const };
  if (status === 'broadcast_cutaway') return { label: 'Broadcast cutaway only', tone: 'red' as const };
  if (status === 'postrace_only') return { label: 'Post-race only', tone: 'red' as const };
  if (status === 'inconclusive') return { label: 'Needs another live test', tone: 'cyan' as const };
  return { label: 'Live #9 POV unproven', tone: 'red' as const };
};

export const povGateCopy = (state: PovState) => {
  const allProof = state.proofItems.every((item) => item.done);
  const hasProofMetadata = Boolean(state.verifiedAt.trim() && state.selectorLabel.trim() && state.evidenceRef.trim());
  if (state.status === 'available' && allProof && state.liveConfirmedSeconds >= 60 && hasProofMetadata) {
    return { label: 'Live #9 POV verified', tone: 'green' as const, acceptance: 'passing' as const };
  }
  if (state.status === 'available') {
    return { label: 'Incomplete live POV proof', tone: 'amber' as const, acceptance: 'failing' as const };
  }
  if (state.status === 'delayed') {
    return { label: 'Delayed only, live gate failing', tone: 'red' as const, acceptance: 'failing' as const };
  }
  if (state.status === 'broadcast_cutaway') {
    return { label: 'Broadcast cutaway only, live gate failing', tone: 'red' as const, acceptance: 'failing' as const };
  }
  if (state.status === 'postrace_only') {
    return { label: 'Post-race only, live gate failing', tone: 'red' as const, acceptance: 'failing' as const };
  }
  const copy = povStatusCopy(state.status);
  return { ...copy, acceptance: 'failing' as const };
};
