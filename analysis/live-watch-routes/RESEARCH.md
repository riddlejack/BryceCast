# Live watch routes — official embed audit

Checked: 2026-07-12

## Question

Does an official, legally embeddable INDY NXT full-session stream exist for a
race, practice, or qualifying session that BryceCast can place inside the Live
page?

## Official-source findings

1. INDYCAR's 2026 television announcement assigns every U.S. INDY NXT race to
   FS1 or FS2. It says practice and qualifying air through FS1, FS2, the FOX
   Sports app, and FOX One. Those are official watch destinations, but the
   announcement does not publish an embeddable player URL.
   Source: [FOX Sports, INDYCAR Announce 2026 INDY NXT by Firestone TV Schedule](https://www.indycar.com/news/2025/12/12-19-nxt-tv-times-2026)
2. INDYCAR's official 2026 schedule announcement says international coverage
   for every race, practice, and qualifying session is available through
   INDYCAR LIVE. Availability is market-dependent; the route is the official
   service, not a third-party embed contract.
   Source: [INDYCAR Announces 17-Race 2026 INDY NXT by Firestone Schedule](https://www.indycar.com/news/2025/09/09-25-2026-nxt-schedule)
3. INDYCAR's international coverage announcement describes INDYCAR LIVE as its
   direct-to-consumer service for full INDY NXT races, practice, and qualifying.
   Its country guide directs viewers to the service or a local rights holder.
   Sources: [INDYCAR Expands Global Broadcast Presence for 2026](https://www.indycar.com/news/2026/02/02-19-international-tv),
   [2026 International Broadcasters](https://www.indycar.com/how-to-follow/international)
4. The official INDYCAR video catalog contains embeddable INDY NXT highlight
   clips, including practice and qualifying highlights. These are edited clips,
   not live or complete session streams, so they do not satisfy the watch-along
   requirement.
   Sources: [Practice 1 Highlights: 2026 INDY NXT at St. Petersburg](https://www.indycar.com/videos/2026/02/02-27-practice-1-highlights-2026-indy-nxt-by-firestone-grand-prix-of-st-petersburg),
   [Qualifying Highlights: 2026 INDY NXT at Detroit](https://www.indycar.com/videos/2026/05/05-30-qualifying-highlights-2026-indy-nxt-at-detroit)

Searches of INDYCAR's official site/video catalog and its official YouTube
presence found no official full-session YouTube player or other embed URL for a
2026 INDY NXT race, practice, or qualifying session.

## Product decision

No embed ships. The Live page uses the session-matched official route from
`/api/session` / `/api/readiness`, opens that destination in a new tab, and
explains picture-in-picture. BryceCast does not iframe, proxy, scrape, or ask a
viewer to connect a broadcast account.

Re-open the embed decision only when an official source publishes all of:

- a full INDY NXT session;
- an explicit embeddable player URL;
- a session type BryceCast can match without guessing; and
- terms that permit third-party embedding.
