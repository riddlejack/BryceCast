# Reproduce the pit-lane lap-counting problem

Run `npm run example:timing` (or `node examples/timing-sections/run.mjs`). No dependencies or source-data download are needed.

The input is entirely synthetic: three invented drivers, three 60-second laps, and one pit-lane start/finish crossing. The command invokes the actual decoder in `analysis/semantic-layer/lib/racetools-semantic.mjs`. It verifies:

- Integer source-format time ticks divide by 10,000 to yield seconds.
- A section ends at a named timing loop; it is not a GPS coordinate.
- The pit start/finish crossing completes the same lap as the mainline finish plane.
- Removing that crossing in a negative control loses a lap.

Expected result: 3 completed laps with the pit crossing, 2 when it is missing, and `[60, 60, 60]` decoded lap durations. This demonstrates a real failure mode without redistributing any third-party timing record. It is not a replacement for the historical validation corpus, and it does not establish GPS positions, source coverage, or live readiness.
