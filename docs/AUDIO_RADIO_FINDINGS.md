# Audio and Radio Findings

Current research pass: June 7, 2026.

Target: Bryce Aron, car #9, Chip Ganassi Racing, INDY NXT.

## Bottom Line

Official race-call audio is a strong, repeatable BryceCast layer. Bryce has said the team frequency may be obtainable, but reliability without a scanner or receiver at the track is unknown. Treat Bryce-specific team radio as frequency metadata only until a legal, reliable live listening route is proven. The published frequency `452.7000` is useful metadata, not a playable remote audio stream.

## Provable Now

| Item | Finding | Confidence | Product posture |
| --- | --- | --- | --- |
| Bryce frequency | WWTR spotter guide and current driver feed identify Bryce #9 and frequency `452.7000`. | High. | Display as event-scoped frequency metadata with source/freshness. |
| INDYCAR Radio | Official race-call coverage exists for INDY NXT race weekends through INDYCAR Radio paths. | High. | Treat as the room baseline when Bryce-specific radio is absent. |
| INDYCAR App driver radio | Official sources claim driver and pit radio streams are available through the app during races. #9 access is not proven. | Medium. | Candidate only. Do not make it a core dependency. |
| SiriusXM / TuneIn / Mixlr | Official or affiliated race-call paths exist, with subscription or current-playback caveats. | Medium-high for availability, medium for exact live session playback until tested. | External launch links only. Do not embed or assume live playback. |
| Scanner / SDR | The frequency can be useful near the venue with permitted receiver access. | High for hardware reality, low for public remote repeatability. | Optional operator fallback, never a core requirement. |

## Required Audio States

BryceCast now tracks audio separately from POV with localStorage key `brycecast:audio-state:v1`.

Supported states:

- `untested`
- `official_race_audio_available`
- `bryce_radio_available`
- `bryce_radio_absent`
- `official_app_locked`
- `official_app_silent`
- `frequency_only`
- `scanner_confirmed`
- `sdr_candidate`
- `permission_blocked`
- `inconclusive`

Acceptance rules:

- `bryce_radio_available` passes only with source, selector label, timestamp, evidence reference, all proof checklist items, and at least 60 seconds of live playback. Until that exists, the active product should treat Bryce radio as unavailable/frequency-only.
- `official_race_audio_available` is a valid green room-audio state, but it does not prove Bryce-specific radio.
- `bryce_radio_absent` can still coexist with official race audio being available.
- `frequency_only` is amber metadata. It must never be labeled as live audio.
- `scanner_confirmed` is useful for the operator who has permitted receiver access, but it is not a general no-hardware path.

## Race-Day Proof Checklist

1. Open INDYCAR App before the session and confirm the live INDY NXT event page.
2. Open `https://www.indycar.com/Radio` and confirm official race audio route.
3. Check whether app radio selector lists `#9`, `Bryce Aron`, `CGR`, or an equivalent label.
4. If Bryce appears, play it for at least 60 seconds beside Race Control timing.
5. Record selector screenshot/evidence reference, device, session, timestamp, latency note, and permission bucket.
6. If Bryce is absent, mark Bryce-specific radio absent and keep official race audio active.
7. Keep frequency source visible: driver feed, spotter guide, manual entry, or unverified.

## Boundaries

Allowed:

- Launch official app/radio routes.
- Record proof notes and non-audio screenshots of selectors.
- Display published frequency metadata.
- Use official race-call audio privately during the watch setup.

Out of scope:

- Stream ripping, protected-feed extraction, DRM or entitlement bypass, app reverse engineering, restreaming, rebroadcasting, publishing team radio, or treating a frequency as permission to distribute audio.
