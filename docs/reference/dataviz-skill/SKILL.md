# Data Visualization (house method — vendored for Codex execution)

A chart is read by people and executed by you. This method turns "make it look
good" into a procedure with checks. The `references/` and `scripts/` folders
beside this file are the full rulebook; this page is the procedure.

> The single most important habit: **the color part is computable, so compute
> it.** Never eyeball whether a palette is colorblind-safe — run
> `node scripts/validate_palette.js "<hex,hex,…>" --mode light`.

## The procedure — do these in order (color comes LAST)

1. **Pick the form.** What is the data's job — magnitude, identity, polarity,
   a single headline, change-over-time? The job picks the chart type, and
   sometimes the answer is *not a chart* (a stat tile).
   → `references/choosing-a-form.md`
2. **Assign color by the job it does.** Categorical (identity), sequential
   (magnitude), diverging (polarity), status (state). Fixed hue order, never
   cycled. → `references/color-formula.md`
3. **VALIDATE the palette — run the script, don't reason about ΔE.** Fix any
   FAIL before continuing.
4. **Apply mark specs & spacers.** Thin marks, 2px lines, ≥8px markers,
   2px surface gaps between fills, selective direct labels.
   → `references/marks-and-anatomy.md`
5. **Add the hover layer — by default.** Crosshair+tooltip on line/area,
   per-mark tooltip on bar/dot/cell. → `references/interaction.md`
6. **Final accessibility pass.** Legend for ≥2 series, identity never
   color-alone, reduced-motion respected.
7. **Render it and look at it.** Screenshot and eyeball for collisions,
   geometry, overflow. Then check `references/anti-patterns.md` — if your
   chart matches an entry, it's wrong.

## Non-negotiables

- Categorical hues in fixed order, never cycled; a 9th series folds into
  "Other", never a generated hue.
- **One axis. Never dual-axis.** Two measures → two charts or indexed lines.
- Color follows the entity, never its rank; filters must not repaint survivors.
- Sequential = one hue light→dark. Diverging = two hues + neutral gray
  midpoint. Never rainbow.
- CVD ≥ 12 target; 8–12 legal only with secondary encoding.
- Text wears text tokens, never the series color.
- Status colors are reserved and ship with icon + label, never color alone.

## BryceCast-specific parameters (the system this method plugs into)

- Surfaces: white page, `#f5f5f7` cards. Ink `#1d1d1f`/`#6e6e73`/`#86868b`.
- **Gold (`--bryce`) = Bryce's marker, one meaning per chart, always keyed
  in a caption.** Never gold as text/background/border.
- Chapter tints (validated 2026-07-12): `--chapter-f1600 #5581c2`,
  `--chapter-ff #2f9377`, `--chapter-gb3 #b98a3f`, `--chapter-euro #b05a73`,
  `--chapter-fro #6c9455`, `--chapter-imsa #2e9ac2`; INDY NXT stays ink.
  Rendered ~0.5 opacity at rest, full hue on hover.
- Rivals diverging: ink `#3a3a3f` ↔ neutral `#c6c6cb` ↔ gold `#e09a2f`
  (`recordColor()` in src/screens/careerExplorer.tsx).
- Status: darkened Apple semantic green/orange/red, dot+words, never alone.
  Red ▽ / green ▲ deltas sitewide; red never used as a brand accent in charts.
- House chart tokens live in `src/app/charts.tsx` (ChartTipCard,
  useMeasuredWidth — pixel-space SVG, never scale text through viewBox,
  chartFont, inkConnector, focusFade 0.22) — reuse, don't reinvent.
