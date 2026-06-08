# BryceCast Radio and Official Audio Plan

## Recommendation

Treat INDYCAR Radio and other official race-call paths as the reliable audio baseline. Treat Bryce/team radio as frequency metadata only until a legal, reliable route is proven. Bryce has said the exact team frequency may be obtainable, but without a scanner or receiver at the track it should not be treated as a dependable product feature. Do not require scanner hardware, SDR hardware, or scraped stream URLs for BryceCast to be considered usable on race day.

Confidence: high that official INDYCAR Radio paths are the right product architecture. Low-to-medium that Bryce #9 isolated audio will be available without trackside receiver access. Low that public SDR can solve remote team-radio access cleanly.

## Source Priority

| Rank | Source | What it gives | Hardware required | BryceCast posture |
| --- | --- | --- | --- | --- |
| 1 | INDYCAR Radio web stream | Official race-call stream from `https://www.indycar.com/Radio`. | No scanner. Browser only. | Default external audio launch path. |
| 2 | INDYCAR App INDYCAR Radio audio | Official race-call stream for NTT INDYCAR SERIES and INDY NXT sessions. | No scanner. Phone or tablet required. | First-class fallback/alternate. |
| 3 | Official INDYCAR App driver/pit radio | Possible isolated Bryce/team radio without scanner hardware if #9 appears. | No scanner. Phone or tablet required. | Opportunistic candidate only. |
| 4 | TuneIn, SiriusXM, local affiliates, Mixlr-backed stream | Alternate official or affiliated race-call paths. | No scanner. Subscription may be required for SiriusXM. | Offer as external launch options, not embedded assumptions. |
| 5 | Published event frequency from spotter guide or driver feed | Direct RF team channel when near the venue or when a legal receiver exists near the venue. | Scanner or SDR receiver required. | Fallback metadata. Display frequency and proof source, but do not make it a prerequisite. |
| 6 | Unofficial/public SDR feeds | Possible only if a receiver near the track legally exposes the right frequency with acceptable quality. | Remote SDR exists, but not owned by user. | Research-only fallback. Avoid depending on it. |

## Ground Truth Sources

- Official app feature claim: the App Store listing says the INDYCAR App includes live onboard streams for select drivers, live driver and pit crew radio transmissions, INDY NXT coverage, and INDYCAR Radio audio during race weekends. It also says features and content can change: `https://apps.apple.com/us/app/indycar/id606905722`.
- Official scanner FAQ: INDYCAR says fans can listen to driver radio streams free through the INDYCAR App during each race, and the app also carries INDYCAR Radio Network broadcasts for NTT INDYCAR SERIES and INDY NXT on-track sessions: `https://www.indycar.com/scanner-info`.
- Official radio page: `https://www.indycar.com/Radio` publishes the event audio schedule and links to streaming paths including SiriusXM and TuneIn.
- Published frequencies: INDYCAR says driver frequencies are found through the race schedule, Race Info, and Spotter Guide. BryceCast should also keep using the NXT driver feed value when present, currently represented in the app as Bryce #9 frequency metadata.
- Audio production context: INDYCAR and IMS Productions have publicly emphasized driver and pit crew audio as part of the broadcast/app experience: `https://www.indycar.com/News/2023/08/08-01-IRIS`.

## Official INDYCAR App Driver Radio

The INDYCAR App remains the only plausible no-scanner isolated-radio candidate because it is official, free to download, works without scanner hardware, and is explicitly described as carrying driver/pit radio streams. It is not reliable enough to drive the active product design unless #9 is proven in a live session:

1. Can the app open the live INDY NXT session?
2. Does the audio/radio selector exist during the live session?
3. Does the selector list `#9`, `Bryce Aron`, `CGR`, or another unambiguous Bryce label?
4. Does the stream play for at least 60 seconds while Bryce is active in Race Control timing?
5. Does the audio match session timing closely enough to be useful beside the broadcast?

Acceptance status should be per event and per session. A successful Road America Race 1 check should not be assumed for Road America Race 2, qualifying, or a later venue.

## INDYCAR Radio, Mixlr, TuneIn, and SiriusXM

INDYCAR Radio is the race-call baseline. It is valuable even when isolated Bryce audio is unavailable because it gives official flag-to-flag context, incident explanation, pit-cycle interpretation, and continuity during TV commercial breaks or app failures.

BryceCast should expose these as external routes:

- `INDYCAR Radio`: primary browser path at `https://www.indycar.com/Radio`.
- `INDYCAR App Radio`: app path when a phone or tablet is dedicated to audio.
- `TuneIn`: alternate official radio stream path from the INDYCAR Radio page.
- `SiriusXM INDYCAR Nation`: alternate subscribed path, commonly useful in cars and on the SiriusXM app.
- `Mixlr`: underlying or historical INDYCAR Radio streaming route when available through official links or `indycar.mixlr.com`, but avoid hard-coding it as the only path.

Product rule: if isolated #9 audio is absent, BryceCast should degrade to official race-call audio without marking the radio layer as failed. The failed state should be specific: `#9 isolated radio unavailable`, while `official race audio available` can still be green.

## Published Frequency Fallback

The published frequency is useful metadata, not the default access method. For Bryce #9, BryceCast already has a frequency surface through the driver profile and docs, with WWTR showing `452.7000` in the current project references. That value must be treated as event-scoped, because spotter guides and team assignments can change.

Future data handling:

- Prefer live `driversfeed_nxt.json` `radiofrequency` for the current event.
- Cross-check against the event spotter guide when available.
- Show the frequency with a source label: `Driver feed`, `Spotter guide`, `Manual race-day entry`, or `Unverified`.
- Display a stale warning when the frequency is from a previous event.
- Never imply that frequency metadata creates a no-hardware remote audio route.

## SDR and No-Hardware Reality

Scanner hardware is optional for BryceCast users. A scanner or SDR can improve trackside reliability, but requiring one would shrink the product into an equipment setup rather than a watch-party companion.

Practical reality:

- A normal phone/laptop cannot tune UHF team-radio frequencies by itself.
- SDR requires a receiver physically close enough to the venue, an antenna, software, and permission to receive and use the signal.
- Public web SDR directories rarely have a correctly located receiver, correct band coverage, good event-day uptime, and permission clarity.
- RF reception near a race venue can be excellent with the right hardware and poor with casual hardware.

Architecture consequence: BryceCast should show SDR/scanner access as an optional operator note only. It should not build a core feature around public SDR discovery until a legal, repeatable receiver path is confirmed.

## Legal and Permission Boundaries

BryceCast should stay inside authorized listening and private local viewing boundaries.

Allowed product behavior:

- Link to official app, INDYCAR Radio, TuneIn, SiriusXM, local affiliate, and official schedule pages.
- Display published frequency metadata with source and freshness.
- Let an operator record proof notes that audio was available or unavailable.
- Use race-call or radio notes for private live context without storing protected audio.

Disallowed product behavior:

- Scrape, reverse engineer, or redistribute app audio stream URLs.
- Embed protected streams unless the provider offers an embeddable player or explicit permission.
- Record, clip, archive, transcribe for publication, restream, rebroadcast, or redistribute team radio without written permission.
- Treat a scanner frequency as permission to publish audio.
- Route around DRM, app entitlements, geofencing, subscription gates, or venue rules.

Private listening, public posting, team-approved clips, media usage, and commercial sponsor usage are different permission buckets. BryceCast should make the bucket visible in Ops mode before anyone captures or shares audio.

## Race-Day Test Workflow

Run this workflow for each live INDY NXT session.

| Time | Check | Pass condition | Failure action |
| --- | --- | --- | --- |
| T-minus 60 minutes | Update INDYCAR App and sign in if needed. | App opens event and session pages. | Switch to browser INDYCAR Radio for baseline audio. |
| T-minus 45 minutes | Open `https://www.indycar.com/Radio` and confirm event schedule. | Race-call path is visible for current session. | Try TuneIn, SiriusXM, local affiliate, or app radio. |
| T-minus 30 minutes | Confirm Bryce frequency from driver feed and event spotter guide. | Frequency and source are logged. | Mark frequency stale or unavailable. |
| T-minus 15 minutes | Check app radio/audio selector. | Selector exists for live session. | Log `official_app_no_selector`. |
| Green-session window | Search for `#9`, `Bryce Aron`, `CGR`, or team label. | Bryce-specific stream appears. | Log `bryce_radio_absent`; keep INDYCAR Radio active. |
| Live proof | Play Bryce-specific stream for 60 seconds beside Race Control timing. | Audio plays, remains live, and has usable latency. | Log locked, silent, delayed, wrong driver, dropped, or inconclusive. |
| Post-session | Save proof notes. | Status, source, device, timestamp, session, latency, and evidence reference are complete. | Carry uncertainty into next session. |

Evidence should be non-video UI evidence: app version, device, timestamp, selector screenshot, session name, and notes. Do not screen-record protected audio/video.

## Future App States

These now exist as a separate audio state model, parallel to the existing POV proof model, using localStorage key `brycecast:audio-state:v1`:

| State | Meaning | UI tone |
| --- | --- | --- |
| `untested` | No current-session audio check has been run. | Red |
| `official_race_audio_available` | INDYCAR Radio or official race-call path works. | Green |
| `bryce_radio_available` | Official app or approved route exposes Bryce-specific audio and plays for 60 seconds. | Green |
| `bryce_radio_absent` | Official audio works, but Bryce-specific stream is missing. | Amber |
| `official_app_locked` | App path exists but requires unavailable account, entitlement, territory, or device support. | Amber |
| `official_app_silent` | Selector appears, but playback is silent or fails. | Red |
| `frequency_only` | Published frequency exists, but no no-hardware audio stream is available. | Amber |
| `scanner_confirmed` | Trackside scanner or approved receiver confirms the frequency works. | Green for operator, amber for general product |
| `sdr_candidate` | A potential legal SDR route exists but is not proven for race day. | Amber |
| `permission_blocked` | Listening or sharing use is outside permission boundaries. | Red |
| `inconclusive` | Evidence is incomplete or contradictory. | Cyan |

Minimum fields:

- `status`
- `session`
- `source`
- `device`
- `frequency`
- `frequencySource`
- `verifiedAt`
- `latencyNote`
- `evidenceRef`
- `permissionBucket`
- `notes`

Additional implemented field: `officialRaceAudioAvailable`, so Bryce-specific radio can be absent while official race-call audio remains usable for the room.

## Mode Treatment

### TV Mode

TV Mode should surface audio as a small, high-signal layer:

- Primary line: `Official radio` or `Frequency only`. Use `Bryce radio` only after a proven route exists.
- Secondary line: source and latency note.
- Button set: `Open INDYCAR App`, `Open INDYCAR Radio`, `Open TuneIn/SiriusXM`.
- Failure copy: `Bryce-specific radio unavailable. Official race audio active.`
- Keep the broadcast boundary intact: no protected audio embedding unless explicitly provided by an official embeddable player.

### Engineer Mode

Engineer Mode should treat audio as analytical context:

- Show radio status next to flag, lap, pit, gap, and alert panels.
- Allow manual notes: `Bryce asked about balance`, `team called fuel number`, `spotter traffic`, `radio silent`.
- Attach notes to lap/time/session, but do not store raw audio.
- Show latency relative to Race Control timing, because race-call audio and app audio may lag TV or timing differently.

### Sources Mode

Sources Mode should be the proof console:

- Show all audio sources with state, freshness, and source URL.
- Separate `official race audio` from `Bryce isolated radio`.
- Include the race-day checklist and the 60-second proof gate.
- Require a source label before marking `bryce_radio_available`.
- Record whether frequency came from driver feed, spotter guide, or manual entry.

### Race Ops Mode

Race Ops should make the room setup unambiguous:

- Device assignment: TV broadcast, iPad app radio, MacBook BryceCast, phone backup.
- Fallback order: official race audio, TuneIn, SiriusXM, local affiliate, opportunistic Bryce app radio if it appears, frequency/scanner only if someone has a legal receiver path.
- Permission reminder before capture or sharing.
- Escalation prompt when Bryce-specific audio is absent: ask Bryce/CGR whether app/team radio is approved for family/friends, and whether published frequency monitoring is acceptable.

## Build Order

1. Done: add an audio proof model separate from POV proof.
2. Done: add source buttons and status copy in TV Mode and Sources Mode.
3. Done: add Race Ops audio proof card and fallback order.
4. Partially done: frequency source labels are in the proof model. Next pass should cross-check driver feed against spotter guide.
5. Add manual audio notes in Engineer Mode.
6. Add optional scanner/SDR notes only after an approved or legal receiver route is proven.

## Bottom Line

BryceCast should make official audio feel first-class without turning the project into a scanner build. The best product path is official INDYCAR Radio as the baseline, opportunistic Bryce app radio only if it appears, and published or Bryce-provided frequency metadata as useful context for people who already have legal trackside receiver access.
