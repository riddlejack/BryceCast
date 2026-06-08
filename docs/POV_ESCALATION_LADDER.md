# BryceCast POV Escalation Ladder

Current target: Bryce Aron, car #9, Chip Ganassi Racing, INDY NXT.

June 2026 product reset: this escalation ladder is superseded for the active BryceCast build. Bryce has confirmed that there is no live #9 POV feed available for BryceCast to include during races. Do not keep chasing POV as a blocking requirement, and do not design UI surfaces that imply a live feed is pending. The product should now ship as a polished Bryce-centric timing, analytics, alerting, source-health, and broadcast-companion system.

Only reopen this document if Bryce, CGR, INDYCAR, FOX, IMS Productions, or another rights holder explicitly offers a rights-holder-controlled live feed or delayed footage package.

Acceptable live outcomes:

1. Live public selectable #9 onboard in the INDYCAR App or another official surface.
2. Live team, sponsor, family, or production-approved #9 onboard viewing access that stays local and private.
3. Live rights-holder-approved production monitor access from INDYCAR, FOX, IMS Productions, CGR, or their designated partner.

Delayed team, driver, INDYCAR, licensed AiM/SmartyCam footage, highlights, and broadcast cutaways are valuable for replay and proof-of-concept analysis, but they do not satisfy the live POV requirement.

Hard acceptance rule: live #9 POV means Bryce's onboard plays during the actual INDY NXT race, before the checkered flag, in the same race window as the official broadcast, for at least 60 seconds. A feed that appears after the race, appears only as a broadcast cutaway, or appears only in a delayed replay has failed the live gate for that session.

The June 7, 2026 INDY NXT race at World Wide Technology Raceway is now a completed reference case. The next live proof window is Road America Race 1 on Saturday, June 20, 2026 and Race 2 on Sunday, June 21, 2026. Update the proof packet for each future event/session.

## Ground Truth

- Bryce is the #9 Chip Ganassi Racing INDY NXT driver. Official driver pages: `https://www.indynxt.com/drivers/bryce-aron` and `https://chipganassiracing.com/drivers/baron`.
- The WWTR spotter guide lists #9 Bryce Aron, Chip Ganassi Racing, radio frequency `452.7000`: `https://www.indynxt.com/Schedule/2026/WWTR/spotter-guide`.
- The official INDYCAR App advertises live onboard camera streaming for select drivers, live driver/pit radio, telemetry, and INDY NXT coverage. App content is subject to change: `https://apps.apple.com/us/app/indycar/id606905722` and `https://play.google.com/store/apps/details?id=com.vzw.indycar`.
- INDYCAR LIVE can still be tested because the INDY NXT site references exclusive onboard views, but the 2026 territory PDF lists the United States as 24-hour delay for practice, qualifying, race, highlights, and INDY NXT. A delayed U.S. INDYCAR LIVE feed does not satisfy live POV: `https://www.indycar.com/-/media/Files/2026/News/OTT_TERRITORIES_2026.pdf`.
- The official INDYCAR LIVE catalog currently exposes an `Onboards` channel plus an `Indy NXT` channel through Staylive metadata. Current checks found top-series in-car objects in `Onboards` and INDY NXT session-level objects in `Indy NXT`, with no strict Bryce/Aron match. Run `npm run probe:pov:watch` during live windows to catch surprise additions.
- FOX/FS1/FOX Sports App/Hulu Live TV/Xfinity currently look like authorized linear broadcast routes for INDY NXT, not public selectable #9 onboard routes. FOX One has general multiview/ISO-cam marketing language, but no current source has confirmed INDY NXT #9 live onboard availability through FOX consumer products. Treat FOX as a production escalation route, not the primary consumer POV route, until support or production confirms otherwise.
- The 2026 INDY NXT rulebook creates two important camera facts. INDYCAR-requested in-car cameras are supplied through Broadcast Sports Inc. The entrant must also use an AiM SmartyCam GP HD 2.2 or 2.3 onboard camera during all on-track activity: `https://epaddock.indycar.com/docs/default-source/rules-regulations-and-policies/2026-indy-nxt-rulebook.pdf?sfvrsn=f77d165b_20`.
- The 2026 Photography/Videography Policy says video must be properly obtained from INDYCAR or an INDYCAR-licensed third party, and requests go through the INDYCAR Footage License Request. Team/driver highlight use can include in-car AiM camera footage, with AiM footage posting no earlier than two hours after the checkered flag: `https://www.indycar.com/-/media/Files/2026/Imagen-Only/INDYCAR-Photo-Video-Policy-2026.pdf`.

## Immediate Race-Day Procedure

1. Open the authorized race broadcast through FS1, FOX Sports, FOX One, Hulu Live TV, Xfinity Stream, or another licensed TV provider.
2. Run BryceCast locally. Keep its video boundary intact: no protected-video embedding, capture, recording, rebroadcast, or redistribution.
3. Run `npm run poll:race:watch` for Race Control evidence and `npm run probe:pov:watch` for official INDYCAR LIVE catalog evidence.
4. On iPhone and iPad, update the INDYCAR App and select Bryce, Chip Ganassi Racing, and INDY NXT as favorites where possible.
5. At T-minus 30 minutes and again when the session is live, check the app for selectable onboard or in-car camera entries. Record evidence as screenshots only for proof of availability or non-availability, not as video capture.
6. If #9 is available, dedicate the iPad or iPhone to the onboard feed and put BryceCast beside the official broadcast through AirPlay or HDMI. Keep it local to the room.
7. If #9 is unavailable, save a proof packet and immediately move to the CGR/Bryce/family route while continuing the live watch with broadcast, timing, and radio. Do not treat delayed footage as success.

## Pre-Race Binary Checks

Send these before Road America so the live-window test is not the first time the question is asked:

1. INDYCAR support: `Will Bryce Aron No. 9 have a selectable live onboard camera in the INDYCAR App or INDYCAR LIVE for INDY NXT Road America Race 1 on June 20, 2026 and Race 2 on June 21, 2026?`
2. INDYCAR LIVE support: `Does INDYCAR LIVE provide live, driver-selectable INDY NXT onboard feeds, and is Bryce Aron No. 9 included for Road America?`
3. FOX One / FOX Sports support: `Will FOX One or the FOX Sports App expose alternate camera, Driver's Eye, in-car, or onboard selectors for INDY NXT Road America, specifically Bryce Aron No. 9?`
4. CGR/Bryce: `Is No. 9 carrying a live BSI/production onboard for Road America, and can CGR sponsor a closed private monitor request if the public app path fails?`

If #9 is absent during qualifying, treat the public app route as unlikely for that weekend and push the rights-holder private-monitor path immediately.

## Proof Packet

Prepare this before asking anyone with rights to help:

- Event and session: Road America INDY NXT Race 1, June 20, 2026, or Road America Race 2, June 21, 2026. Replace with the current live session for future events.
- Identity: Bryce Aron, #9, Chip Ganassi Racing, plus relationship or basis for request: family, friend, sponsor, private watch party, or media/content project.
- Use case: private local viewing for BryceCast watch setup, or clearly bounded delayed recap. State that BryceCast will not embed, record, rebroadcast, restream, redistribute, or bypass protected feeds.
- Screenshots: INDYCAR App version, device, time, location, camera/onboard list, and whether #9 appears.
- Catalog evidence: latest `public/data/onboard-catalog.json`, including whether official INDYCAR LIVE metadata contains a strict Bryce/Aron match.
- Official facts: current spotter guide #9 row, INDY NXT event page, app feature description, INDY NXT rulebook camera clauses, and photo/video policy.
- Desired outcome: authorized live #9 POV during the race. Team-approved delayed AiM/SmartyCam clips are a secondary replay deliverable only.
- Distribution boundaries: private local room only unless a written license or team/INDYCAR public-post approval says otherwise.

## Archived Escalation Ladder

The table below is preserved only as research history. It is not the active build plan after Bryce confirmed live POV is unavailable.

| Level | Surface | Exact contact or entry point | Ask | Proof needed | Success criterion | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | INDYCAR App and catalog live check | INDYCAR App on iPhone/iPad. BryceCast `npm run probe:pov:watch`. Support form: `https://indianapolismotorspeedway.formstack.com/forms/indycar_support`. General support/contact: `indycar@indycar.com`, `support@indycar.com`, `317.492.6526`. | Confirm whether #9 Bryce Aron is selectable for INDY NXT onboard during the live race, and whether any device, account class, catalog listing, or guest entitlement exposes it. | Device/app version, live race timestamp, screenshots of onboard list, U.S. location, official event link, catalog snapshot. | #9 appears and plays live for at least 60 seconds during the same live race window as FS1/FOX. | Move to Level 3 and 4 with screenshots and catalog proof showing the public/app path failed. |
| 2 | Authorized local viewing orchestration | FS1/FOX Sports live: `https://www.foxsports.com/live/fs1`; FOX One/FOX: `https://www.fox.com/sports`; Hulu Live TV; Xfinity Stream; INDYCAR Radio: `https://www.indycar.com/Radio`; BryceCast local dashboard. | Keep the live room Bryce-centered while POV access is being escalated: official broadcast plus app/radio plus Race Control timing. | Active TV subscription or legal streaming account; no screen recording; local-only setup. | Operational continuity only. The watch party remains functional, but the live #9 POV gate is still failing. | Continue Levels 3-7 for live access. Delayed footage remains a replay-only lane. |
| 3 | Bryce direct and family route | Bryce official contact form: `https://www.brycearon.com/contact`; Bryce official social links from `https://www.indynxt.com/drivers/bryce-aron`. | Ask who controls live #9 onboard access during races and whether family/friends can be granted an authorized live guest/sponsor viewing route. | Proof packet, relationship context, private-use statement, desired devices, race/session dates. | Bryce or his camp names the actual live approver or confirms a guest/sponsor entitlement path. | If they point to CGR, send the same packet to Level 4. |
| 4 | Chip Ganassi Racing | Public relations: `pr@ganassi.com`; phone `317-802-0000`; partnership route for sponsor framing: `partnership@ganassi.com`; contact page `https://chipganassiracing.com/contact`. | Ask CGR to sponsor a rights-holder-controlled closed monitor request and confirm whether #9 has or can get a live BSI/production onboard. | Proof packet, Bryce relationship or sponsor/family basis, no-distribution promise, requested dates/sessions, exact named audience, NDA willingness. | CGR confirms an approved live path or introduces the correct INDYCAR/FOX/IMS Productions approver. | If CGR says rights sit with INDYCAR/FOX, escalate to Levels 5 and 6 with CGR context attached. |
| 5 | INDYCAR media, credentials, content site | General: `indycar@indycar.com`; credentials: `credentials@indycar.com`; marketing/licensing route: `marketing@indycar.com`; sponsorship only if the ask is commercial: `sponsorship@indycar.com`; media site: `https://pec.imagencloud.com/`; content-site registration via `https://pec.imagencloud.com/register`. Additional-rights contact from News Access Guidelines: `kdavis@INDYCAR.COM`. | Ask for the official process to approve live private #9 onboard viewing for a family/friend/sponsor watch setup, including whether INDYCAR App entitlements, media room monitors, production feeds, or another official surface can be authorized. | Proof packet, distribution plan, entity/contact info, whether use is private, sponsor, editorial, commercial, or public. | Written guidance, approved live access, or the exact approver and required terms. | If live access is denied, preserve the denial and ask what would change the answer. Delayed licensing remains a separate replay path. |
| 6 | FOX Sports and production | FOX Sports PressPass contact: `NewsFromFOXSports@fox.com`; PressPass: `https://www.foxsports.com/presspass`; INDYCAR press page: `https://www.foxsports.com/motor/indycar/press`. | Ask whether #9 has a production-visible onboard during INDY NXT and whether a private, no-recording family/sponsor monitor route can be approved through FOX, INDYCAR, IMS Productions, or CGR. | Proof packet, CGR or INDYCAR introduction if available, sponsor/family value case, no-distribution promise. | FOX or production confirms a live monitor route or forwards to the rights holder. | If no private route exists, ask for #9 to be considered for future selectable onboard/broadcast selection. |
| 7 | INDYCAR/IMS footage licensing and IMS Productions | Event access request: `https://www.imsproductionstv.com/indycar-ims-event-access`. Footage License Request: `https://www.imsproductionstv.com/footage-licensing`; IMS Productions overview/contact: `https://www.imsproductionstv.com/`; production contacts from current research: `bannakin@imsptv.com`, `ksublette@imsptv.com`, `317-492-8711`, `317-492-8723`. | Ask whether IMS/INDYCAR can provide or approve a closed, non-recorded, rights-holder-controlled monitor of the #9 live onboard feed during a race. Use delayed footage licensing only as the replay fallback. | Exact event/session, intended audience, platforms/devices, no-recording/no-distribution terms, sponsor/family relationship, CGR sponsorship if available. | Live access agreement, technical route, or explicit denial. | If live access is impossible, request delayed #9 onboard footage for replay/analysis. |
| 8 | Camera vendor or production technology | Use only after INDYCAR, FOX, CGR, or IMS Productions tells you to. The rulebook names Broadcast Sports Inc. for INDYCAR-requested broadcast onboard cameras, but vendor hardware access does not equal viewing rights. | Technical confirmation only: whether #9 had a broadcast camera package, who owns the feed, and which rights holder must approve viewing. | Referral from rights holder, event/session, car number, rights-holder context. | Vendor names the rights owner or confirms no technical feed existed. | Return to INDYCAR/FOX/CGR. |

## Message Templates

### INDYCAR App Support

Subject: INDY NXT #9 Bryce Aron onboard availability during Road America race

```text
During the Road America INDY NXT race weekend, I am trying to watch Bryce Aron, car #9, through official INDYCAR surfaces only.

The INDYCAR App advertises live onboard camera streaming for select drivers. Can you confirm whether #9 Bryce Aron is selectable for INDY NXT onboard/in-car video during this event, and whether availability differs by device, account, territory, or session?

Use case: private local BryceCast watch setup. No recording, embedding, restreaming, redistribution, or protected-feed capture.

Attached: app version, device, timestamped screenshot of the onboard list, and event/session details.
```

### Bryce or CGR

Subject: Authorized #9 onboard access question for BryceCast family watch setup

```text
I am building a Bryce-focused watch setup for friends/family around INDY NXT. The goal is official broadcast plus Bryce timing, gaps, radio when allowed, and ideally an authorized #9 onboard/POV.

Can you confirm who controls #9 live onboard access during INDY NXT sessions: INDYCAR App, FOX/production, CGR, or another production partner?

If live #9 POV cannot be shared, who can approve a live private family/friend/sponsor viewing route for a future session? Delayed AiM/SmartyCam clips would be useful for replay only, but they do not solve the live-viewing goal.

I am not asking for credentials, protected feed capture, DRM workarounds, or redistribution rights. I am trying to find the clean authorized route.
```

### Closed Monitor Rights Request

Subject: Closed monitor request for Bryce Aron #9 live INDY NXT onboard

```text
Could INDYCAR/IMS Productions, with FOX Sports approval as needed, authorize a one-time closed, non-recorded, non-public monitor feed of Bryce Aron’s No. 9 Chip Ganassi Racing INDY NXT live in-car camera for [event/session]?

The feed would be viewable only by named family/friends/sponsor guests in [private room / CGR hospitality / sponsor suite], under NDA if required, with no capture, retransmission, restreaming, social posting, public display, or protected-feed extraction. IMS Productions/BSI/approved production staff would retain technical control.

If #9 is not carrying a live BSI/production onboard at this event, can #9 be selected or equipped for a future race? Please share the approval path, cost, and deadline. If live access cannot be cleared, please route us to the correct post-session AiM or broadcast footage licensing process.
```

### INDYCAR Content or Licensing

Subject: Rights path for #9 Bryce Aron onboard footage

```text
I need the official rights path for Bryce Aron #9 INDY NXT onboard/POV footage from [event/session].

Desired use: [private local viewing / delayed recap / public clip / sponsor-family content].
Footage requested: #9 onboard or AiM/SmartyCam, ideally [lap/time/session].
Distribution: [private only / platforms], duration [seconds/minutes], term [one-time/archive], commercial status [yes/no].

Please confirm whether this is handled through INDYCAR, IMS Productions, FOX, CGR, the driver/team, or the INDYCAR Footage License Request process.
```

## Delayed-Only Fallback

If live #9 POV is unavailable or denied, delayed footage becomes a separate replay lane. It should never be counted as product completion:

- Label it `Delayed #9 POV`, never `Live`.
- Use team/driver-approved AiM/SmartyCam clips only after the session and only within the permission granted.
- For public social clips, stay inside the INDYCAR policy unless a broader license is signed. The policy references up to three one-minute race-weekend highlights per car/driver combination on team/driver controlled channels, outside live exhibition windows, with AiM camera footage no earlier than two hours after the checkered flag.
- For any non-team publication, route through the INDYCAR/IMS footage licensing form and wait for approval.
- Pair every delayed clip with Race Control timing snapshots, lap number, flag state, position, gap, and radio note so BryceCast can produce a post-race POV recap while the live-access track continues.

## Practical Conclusion

Fastest credible route: live-test the INDYCAR App, then immediately ask Bryce/CGR for the real owner of live #9 onboard access and whether a private family/sponsor entitlement or monitor route exists. The app path can succeed only if #9 is one of the selected live onboard drivers. The CGR/Bryce path has the best chance of finding a real live guest/sponsor route. INDYCAR/FOX/IMS paths are slower but are the likely rights-holder path if production has a feed that normal fans cannot select.

Confidence levels:

- High: Official broadcast, app, radio, spotter-guide, schedule, and U.S. INDYCAR LIVE delay facts.
- High: AiM onboard camera is required by the INDY NXT rulebook.
- Medium: CGR/Bryce can route the request to the correct live rights holder, because team standing and the personal relationship create a credible reason to ask.
- Low but critical: Private live production/onboard access through FOX/INDYCAR without sponsor, family, team, or media standing.
