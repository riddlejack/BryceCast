> Historical record — see the [current documentation](../../README.md). Dates, plans, and status below describe the original investigation.

# BryceCast Design Taste

Updated: 2026-07-11. This supersedes the visual system in UI_V3_DESIGN_BRIEF.md
(the product structure, data contracts, and editorial rules there still stand).

Direction: Apple-grade clean minimalism. Light, typography-first, near-
monochrome, one small brand mark. If a pattern below appears in a diff, it's a
bug — regardless of how good it looks in isolation.

## The blacklist — AI-frontend tropes we do not ship

Compiled from impeccable.style/slop, developersdigest.tech's 16 patterns,
prg.sh's "purple gradient website" essay, and Emil Kowalski's skills repo.

**Color & surface**
1. Dark mode as the default. (Light is the default; dark can come later as a
   real, designed mode.)
2. Purple/violet anything. Cyan-on-dark. Neon accents.
3. Gradients as decoration — gradient card fills, gradient text, gradient
   buttons, radial "glow" washes, floating gradient orbs.
4. Colored box-shadow glows. Any shadow that has a hue.
5. Glassmorphism as decoration (blur cards, frosted panels). Translucency is
   allowed in exactly one place: system chrome (nav/tab bar), per Apple's
   material rules.
6. Soft-tinted pill chips in five colors doing the job of plain text.
7. Cream/beige "tasteful default" washes.

**Typography**
8. Uppercase tracked eyebrow/kicker labels ("RACE WEEK HQ") above headings —
   the single most repeated AI tell. Context lines are sentence-case, gray,
   and quiet.
9. All-caps stat labels with wide letter-spacing.
10. Inter/Space Grotesk/Geist/Instrument-Serif branding. We use the platform
    system font (SF on Apple devices), which also ships optical sizing.
11. Gradient text. Single italic-serif accent words.
12. Crushed or inflated tracking. Large display text gets ~-0.02em; body ~0.

**Layout**
13. Colored left/top border stripes on cards ("almost as reliable a sign of
    AI design as em-dashes").
14. Badge/chip stacked directly above the H1.
15. Identical icon-card grids; icon tiles stacked above headings.
16. Nested cards. Cards inside cards inside cards.
17. Numbered gold/tinted step tiles (01/02/03 markers).
18. "Big gradient number + tiny caps label" stat banners.
19. One border-radius for everything, especially 24px+ blob-rounding.
20. Hairline border AND wide shadow on the same element (pick one; usually
    neither — a quiet fill separates enough).

**Motion & misc**
21. Bounce/elastic entrances on non-gesture UI. Springs are for gestures.
22. Hover scale/rotate on images; shimmer everywhere.
23. Decorative background textures (speed-lines, grids, etched watermarks).
24. Em-dash-chained marketing copy; "supercharge/streamline" verbs.
25. Emoji as iconography.

## The system we ship instead

- **Surfaces**: white page (#fff). Modules are quiet fills (#f5f5f7, radius
  18, no border, no shadow). Rows divide with 1px rgba(0,0,0,0.06). Never
  border+shadow together; almost always neither.
- **Ink**: #1d1d1f primary, #6e6e73 secondary, #86868b tertiary. Contrast per
  WCAG AA minimum everywhere.
- **Type**: system-ui stack. Hierarchy from size+weight+leading as a set.
  Display: 28–44px, weight 650–700, -0.02em, line-height ~1.05. Body 15px/1.5.
  Labels 12–13px sentence case. Numerals always tabular.
- **Accent discipline**: interactive = system blue (#0066cc text links,
  iOS-blue active tab). Brand = the gold №9 plate, used as a mark only —
  never as text color, background wash, or border. Status = darkened Apple
  semantic green/orange/red, always dot/icon + words, never color alone.
- **Bryce emphasis in tables**: white row on the gray fill + a small №9 plate
  glyph. No colored stripe, no tinted row.
- **Charts** (dataviz method still binding): ink line for single-series, gold
  only as the current-point marker; categorical palette validated for white
  with the six-checks script; recessive grid; tooltips on white cards.
- **Motion**: fast, crisp, few. 150–250ms ease-out fades/settles; springs only
  if we ever ship gestures; full prefers-reduced-motion support.
- **Copy**: plain sentences, facts first, no hype verbs, fewer em-dashes.

## Review ritual

Before shipping any UI change: diff against the blacklist, screenshot at 390px
and 1440px, and ask "would this screen look at home inside apple.com/health?"
If a decoration can be deleted without losing information, delete it.
