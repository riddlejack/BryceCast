import { loadApiJson, postApiJson } from './api';
import type { AudioSource, AudioState, AudioStatus } from './types';

const storageKey = 'brycecast:audio-state:v1';

export const audioStatuses: Array<{ value: AudioStatus; label: string }> = [
  { value: 'untested', label: 'Untested' },
  { value: 'official_race_audio_available', label: 'Official Race Audio Available' },
  { value: 'bryce_radio_available', label: 'Bryce Radio Available' },
  { value: 'bryce_radio_absent', label: 'Bryce Radio Absent' },
  { value: 'official_app_locked', label: 'Official App Locked' },
  { value: 'official_app_silent', label: 'Official App Silent' },
  { value: 'frequency_only', label: 'Frequency Only' },
  { value: 'scanner_confirmed', label: 'Scanner Confirmed' },
  { value: 'sdr_candidate', label: 'SDR Candidate' },
  { value: 'permission_blocked', label: 'Permission Blocked' },
  { value: 'inconclusive', label: 'Inconclusive' }
];

export const audioSources: AudioSource[] = [
  'INDYCAR App',
  'INDYCAR Radio',
  'SiriusXM',
  'TuneIn',
  'Mixlr',
  'Published frequency',
  'Scanner/SDR',
  'Other authorized source'
];

export const defaultAudioState: AudioState = {
  status: 'frequency_only',
  source: 'Published frequency',
  device: 'MacBook plus iPhone/iPad',
  session: 'Road America Race 1',
  verifiedAt: '',
  selectorLabel: '',
  frequency: '452.7000',
  frequencySource: 'Driver feed',
  officialRaceAudioAvailable: false,
  permissionBucket: 'Private listening only',
  latencyNote: '',
  evidenceRef: '',
  liveConfirmedSeconds: 0,
  notes: 'Published #9 frequency is metadata only. Bryce-specific app radio and official race audio still need live-session proof.',
  proofItems: [
    { label: 'Official live session audio surface opens', done: false },
    { label: 'Selector/source is clearly Bryce #9 or official race audio', done: false },
    { label: 'Audio plays for 60 seconds during a live INDY NXT session', done: false },
    { label: 'Permission bucket and source evidence are recorded', done: false }
  ]
};

const validStatuses = new Set<AudioStatus>(audioStatuses.map((status) => status.value));
const validSources = new Set<AudioSource>(audioSources);

const normalize = (candidate: Partial<AudioState>): AudioState => ({
  ...defaultAudioState,
  ...candidate,
  status: candidate.status && validStatuses.has(candidate.status) ? candidate.status : defaultAudioState.status,
  source: candidate.source && validSources.has(candidate.source) ? candidate.source : defaultAudioState.source,
  officialRaceAudioAvailable: Boolean(candidate.officialRaceAudioAvailable),
  liveConfirmedSeconds: Number.isFinite(Number(candidate.liveConfirmedSeconds)) ? Number(candidate.liveConfirmedSeconds) : 0,
  proofItems:
    Array.isArray(candidate.proofItems) && candidate.proofItems.length === defaultAudioState.proofItems.length
      ? candidate.proofItems.map((item, index) => ({
          label: defaultAudioState.proofItems[index].label,
          done: Boolean(item.done)
        }))
      : defaultAudioState.proofItems
});

export const loadAudioState = (): AudioState => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? normalize(JSON.parse(raw) as Partial<AudioState>) : defaultAudioState;
  } catch {
    return defaultAudioState;
  }
};

export const saveAudioState = (state: AudioState) => {
  window.localStorage.setItem(storageKey, JSON.stringify(normalize(state)));
};

export const loadRemoteAudioState = async (): Promise<AudioState | null> => {
  const remote = await loadApiJson<Partial<AudioState> & { available?: boolean }>('/api/audio-proof');
  if (!remote || remote.available === false) return null;
  return normalize(remote);
};

export const saveRemoteAudioState = async (state: AudioState) => {
  await postApiJson('/api/audio-proof', normalize(state));
};

export const audioGateCopy = (state: AudioState) => {
  const allProof = state.proofItems.every((item) => item.done);
  const hasProofMetadata = Boolean(state.verifiedAt.trim() && state.evidenceRef.trim());
  const hasBryceMetadata = Boolean(state.selectorLabel.trim());

  if (state.status === 'bryce_radio_available' && allProof && hasProofMetadata && hasBryceMetadata && state.liveConfirmedSeconds >= 60) {
    return {
      label: 'Bryce radio verified',
      detail: 'Bryce-specific audio is live and proof-complete.',
      tone: 'green' as const,
      acceptance: 'bryce_passing' as const
    };
  }

  if (state.status === 'bryce_radio_available') {
    return {
      label: 'Incomplete Bryce radio proof',
      detail: 'Bryce-specific audio was marked available, but the 60-second proof packet is incomplete.',
      tone: 'amber' as const,
      acceptance: 'failing' as const
    };
  }

  if (state.status === 'official_race_audio_available' || state.officialRaceAudioAvailable) {
    return {
      label: state.status === 'bryce_radio_absent' ? 'Bryce-specific radio unavailable. Official race audio active.' : 'Official race audio active',
      detail: 'Room audio is covered by an official race-call path. Bryce isolated radio still needs its own proof.',
      tone: 'green' as const,
      acceptance: 'race_audio_passing' as const
    };
  }

  if (state.status === 'frequency_only') {
    return {
      label: 'Frequency only',
      detail: 'Published frequency metadata is useful, but it is not a no-hardware audio stream.',
      tone: 'amber' as const,
      acceptance: 'metadata_only' as const
    };
  }

  if (state.status === 'scanner_confirmed') {
    return {
      label: 'Scanner route confirmed',
      detail: 'A receiver-assisted path works for the operator who has that access. Keep official race audio as the room fallback.',
      tone: 'green' as const,
      acceptance: 'operator_passing' as const
    };
  }

  if (state.status === 'official_app_locked') {
    return {
      label: 'Official app audio locked',
      detail: 'The app route exists but is blocked by account, device, entitlement, or territory.',
      tone: 'amber' as const,
      acceptance: 'failing' as const
    };
  }

  if (state.status === 'official_app_silent') {
    return {
      label: 'Official app audio silent',
      detail: 'The selector appeared, but playback failed or produced no usable audio.',
      tone: 'red' as const,
      acceptance: 'failing' as const
    };
  }

  if (state.status === 'permission_blocked') {
    return {
      label: 'Permission blocked',
      detail: 'The desired listening or sharing route is outside the recorded permission bucket.',
      tone: 'red' as const,
      acceptance: 'failing' as const
    };
  }

  if (state.status === 'sdr_candidate') {
    return {
      label: 'SDR candidate only',
      detail: 'A remote receiver path is a research lead, not a proven race-day audio source.',
      tone: 'amber' as const,
      acceptance: 'failing' as const
    };
  }

  if (state.status === 'bryce_radio_absent') {
    return {
      label: 'Bryce radio absent',
      detail: 'Bryce-specific radio was not found. Official race audio should be used if available.',
      tone: 'amber' as const,
      acceptance: 'failing' as const
    };
  }

  if (state.status === 'inconclusive') {
    return {
      label: 'Audio check inconclusive',
      detail: 'Evidence is incomplete or contradictory. Run the live-session checklist again.',
      tone: 'cyan' as const,
      acceptance: 'failing' as const
    };
  }

  return {
    label: 'Audio untested',
    detail: 'No current-session audio proof has been recorded.',
    tone: 'red' as const,
    acceptance: 'failing' as const
  };
};
