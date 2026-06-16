# Live POV Access Findings

> Legacy research archive. Preserve this memo as evidence for why live #9 POV is out of active BryceCast scope; do not use it as active product direction or UI taste reference.

Current date of this research pass: June 8, 2026.

Target: Bryce Aron, car #9, Chip Ganassi Racing, INDY NXT.

Product reset: after a direct call with Bryce, live #9 POV is not available for BryceCast to include during races. This document is now a historical research memo, not an active product requirement.

Former hard gate: Bryce's onboard/POV would have needed to play live during the actual INDY NXT race, before the checkered flag, in the same race window as the official broadcast, for at least 60 seconds. That gate is now closed for the current product unless a rights-holder-controlled feed is explicitly offered later.

## Current Bottom Line

No authorized public or team-approved route is available for same-race live #9 Bryce Aron INDY NXT POV in BryceCast. Current evidence confirms live INDY NXT broadcast access, confirms official select-driver onboard capability as a general feature, and confirms that production-side in-car camera paths can exist when INDYCAR requests them. Bryce has now confirmed that this does not produce a feed BryceCast can use.

Active product posture:

1. Remove live POV as a core UI promise.
2. Show only a concise unavailable-state note if POV is mentioned.
3. Focus product value on live timing, Bryce analytics, alerts, source health, official broadcast routing, and mobile/desktop ergonomics.
4. Keep delayed onboard/team footage as a future replay-analysis lane only if Bryce or the rights holder later provides it.

## Evidence Matrix

| Surface | Finding | Confidence | Product posture |
| --- | --- | --- | --- |
| FS1 / FS2 / FOX Sports / FOX One | Live INDY NXT race broadcast access is confirmed for U.S. viewers, including Road America on FS1. | High. | Main official race broadcast route. It does not satisfy #9 POV by itself. |
| INDYCAR App | Official listings advertise live onboard camera streaming for select drivers and INDY NXT app coverage, but no public source confirms INDY NXT #9 Bryce Aron as selectable. | Medium-high for app onboard feature, low for Bryce availability. | Historical research only; do not design current UI around it. |
| INDYCAR LIVE U.S. | Official territory materials list United States as 24-hour delayed for INDY NXT. | High. | Fails same-race live gate in the U.S. unless an exception is proven. |
| INDYCAR LIVE catalog | Staylive metadata exposes `Onboards` channel `6368` and `Indy NXT` channel `4173`. Current probe found 15 top-series onboard objects, 23 INDY NXT session objects, zero strict Bryce/Aron matches. | High for current metadata snapshot. | Monitor automatically during live windows. A Bryce/Aron match creates a proof target, not final acceptance. |
| FOX One multiview | FOX One supports general multiview, but current evidence does not show user-selectable INDY NXT #9 POV. | Medium-high for multiview feature, low for #9 POV. | Ask support, but treat as broadcast routing until proved otherwise. |
| Hulu / Xfinity | Channel/provider access to FOX/FS1/FS2. | High. | Useful authorization route for the broadcast, no evidence of driver POV. |
| CGR / Bryce | Bryce has confirmed there is no live POV feed available for this project. CGR/rights holders may still control delayed footage or future special access. | High for current unavailability. | Closed for current product; revisit only if new access is offered. |
| INDYCAR / FOX / IMS Productions | Research points to INDYCAR and broadcast rights holders controlling live exhibition, with IMS Productions operating production access and BSI/NEP involved only as technical vendor when approved. | High for control model, low for approval odds without a closed approved setup. | Ask for closed, non-recorded, named-viewer monitor access. |
| AiM / SmartyCam / team footage | INDY NXT rules require onboard camera equipment, and policies allow certain delayed team/driver highlight use. | High. | Replay/analysis fallback only. It never completes the live POV requirement. |

## Archived Public-Route Questions

These questions are no longer on the active race-day checklist. Keep them only if future access changes:

1. INDYCAR support: `Will Bryce Aron No. 9 have a selectable live onboard camera in the INDYCAR App or INDYCAR LIVE for INDY NXT Road America Race 1 on June 20, 2026 and Race 2 on June 21, 2026?`
2. INDYCAR LIVE support: `Does INDYCAR LIVE provide live, driver-selectable INDY NXT onboard feeds, and is Bryce Aron No. 9 included for Road America?`
3. FOX One / FOX Sports support: `Will FOX One or the FOX Sports App expose alternate camera, Driver's Eye, in-car, or onboard selectors for INDY NXT Road America, specifically Bryce Aron No. 9?`
4. CGR/Bryce: `Is No. 9 carrying a live BSI/production onboard for Road America, and can CGR sponsor a closed private monitor request if the public app path fails?`

## Verified Automated Probe

Command:

```bash
npm run probe:pov
```

Latest verified result from this workspace:

```json
{
  "status": "series_onboards_only",
  "passGate": false,
  "counts": {
    "onboardItems": 15,
    "indyNxtItems": 23,
    "indyNxtDriverLevelItems": 0,
    "strictBryceMatches": 0,
    "weakNineMatches": 0
  }
}
```

The probe writes:

- `data/live/onboard-catalog.jsonl`
- `data/live/onboard-catalog.json`
- `public/data/onboard-catalog.json`

Use `npm run probe:pov:watch` during live windows.

Important matching rule: strict matches require `Bryce` or `Aron`. Generic `#9` should not be treated as success because the top series also has a #9 Chip Ganassi Racing entry.

## Archived Human Ask

Do not send this as part of the active build unless Bryce/CGR says a rights-holder route may exist:

```text
Could INDYCAR/IMS Productions, with FOX Sports approval as needed, authorize a one-time closed, non-recorded, non-public monitor feed of Bryce Aron’s No. 9 Chip Ganassi Racing INDY NXT live in-car camera for [event/session]?

The feed would be viewable only by named family/friends/sponsor guests in [private room / CGR hospitality / sponsor suite], under NDA if required, with no capture, retransmission, restreaming, social posting, public display, or protected-feed extraction. IMS Productions/BSI/approved production staff would retain technical control.

If #9 is not carrying a live BSI/production onboard at this event, can #9 be selected or equipped for a future race? Please share the approval path, cost, and deadline. If live access cannot be cleared, please route us to the correct post-session AiM or broadcast footage licensing process.
```

## Race-Window Proof

No race-window POV proof is required for the active product because live POV is unavailable. If a new authorized route appears later, log all of these in BryceCast Sources mode:

1. Official UI shows onboard, in-car, camera, or multiview selector.
2. Selector explicitly lists `#9`, `Bryce Aron`, or `#9 CGR` in an INDY NXT context.
3. Feed opens during the actual live race, before the checkered flag.
4. Feed stays live for at least 60 seconds and matches Bryce timing.
5. Evidence reference is a screenshot or note proving availability, not captured video.

## Dead Ends

- Normal FS1/FOX/Hulu/Xfinity access: useful broadcast route, no dedicated Bryce POV found.
- Direct Bryce/team path for current live POV: unavailable for BryceCast per Bryce call.
- INDYCAR LIVE U.S. delayed coverage: legal delayed route, fails live gate.
- INDYCAR LIVE `Onboards` current catalog: top-series onboards only in the checked snapshot.
- Race Control timing feeds: excellent timing data, no video.
- Public remote scanner/SDR: may help audio in narrow cases, does not solve POV.
- Delayed AiM/SmartyCam: valuable replay asset, fails live gate.
