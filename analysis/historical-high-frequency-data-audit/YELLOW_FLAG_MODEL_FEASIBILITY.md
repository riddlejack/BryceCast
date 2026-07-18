# Yellow-flag and collision model requirements

## Target first, model second

The anecdotal tool description conflates at least four targets. They are not interchangeable.

1. **Pairwise contact within 5–10 seconds**

   `C_ij(t,H) = 1` if cars `i` and `j` physically contact during `(t,t+H]`, while both are green, on track, and co-located in a known segment.

2. **Incident in a track segment**

   `I_s(t,H) = 1` if an incident begins in segment `s` during `(t,t+H]`.

3. **Full-course-yellow onset in the next minute**

   `Y(t) = 1` if the first FCY onset occurs during `(t+10s,t+70s]`, evaluated only while green. The ten-second guard reduces the risk of calling an already-visible incident a prediction of a delayed flag.

4. **Caution before the leader completes the next lap**

   `Y_l = 1` if caution begins before the next leader lap boundary, evaluated while green at the current lap boundary.

Current official historical labels align only with target 4. The two RaceTools samples contain millisecond `Yellow Flag at` control text with a reported reason, car, and turn, making target 3 plausibly labelable after cross-event validation. That is a flag-decision timestamp, not proven physical incident onset. Targets 1–2 remain structurally unsupported.

## Minimum feature and label observability

| Requirement | Pair/turn collision | Next-lap/minute FCY | Current live | Official historical | RaceTools candidate |
|---|---:|---:|---|---|---|
| stable car/driver identity | required | required | yes, live ID | yes, different historical ID | observed ID 2143 in two samples; broader crosswalk needed |
| adjacent timing gap | useful but insufficient | useful | `liveGap`, ~3–6 s changes | no chronology | likely derivable at loops; raw mapping needed |
| closing rate | required proxy | useful | noisy/asynchronous derivative | section/lap only | candidate loop-to-loop derivative |
| absolute longitudinal position | required | helpful | no | named section by lap only | timing-point crossing; between-loop position derived |
| lateral position / racing line | required | not required | no | no | no demonstrated field |
| heading/yaw / relative velocity vector | required | not required | no | no | no demonstrated field |
| track geometry | required | useful prior | static map assets, no car join | section names | timing-point labels; coordinate mapping unknown |
| flag/restart state | required context | required | yes prospectively | caution lap range | raw flag/control messages need validation |
| exact physical incident onset | required label | needed to prevent leakage | no | no | not demonstrated |
| exact involved pair | required label | optional cause label | no | only 27 multi-car caution texts | not demonstrated |
| tires/fuel/pit context | potentially useful | potentially useful | partial/unvalidated | pit summaries | tire/overtake/pit fields vary by year; fuel unavailable |
| weather/surface | useful | useful | track activity not validated as weather | modeled Open-Meteo | weather messages present; units/source need validation |
| driver/pair history | prior only | prior only | canonical career history | sparse pair events | can join after identity validation |
| safety/recovery state | not physical collision | important to FCY decision | no | no | race-control messages may be incomplete |

A genuine high-speed motion-prediction stack uses 2-D position, heading, speed/yaw rate, state history, and track boundaries at much higher rates. A published autonomous-motorsport example stored object states at 100 Hz and predicted five seconds forward. That is the correct requirements comparison, not transferable INDY NXT training data. [TUM opponent-prediction paper](https://mediatum.ub.tum.de/doc/1719764/1719764.pdf)

The open RACECAR dataset likewise contains LiDAR, radar, cameras, and localization across 27 autonomous-racing sessions. It demonstrates the sensor burden of physical collision geometry; it does not solve INDY NXT coverage. [RACECAR dataset paper](https://arxiv.org/abs/2306.03252)

## Effective sample size

The canonical dataset contains 72 official caution-summary episodes across 34 race sessions:

- 50 contact;
- 8 off-course;
- 4 debris;
- 10 generic;
- 65 with a turn named in text;
- 27 naming two or more cars.

Those 72 episodes—not millions of repeated green-second rows—determine the positive-event information. Repeated timestamps within one race share drivers, track, conditions, and latent state. They are not independent observations.

Twenty-seven vaguely pair-labeled multi-car cautions cannot support a driver-pair collision model. Even 72 caution episodes will produce unstable subgroup estimates across track type, race phase, season, and cause.

## Recommended baseline design

If replay rights and flag semantics clear, use a discrete-time hazard model at 10-second landmarks, not a row per poll and not a neural model.

Baseline ladder:

1. constant/base-rate hazard;
2. track type, race phase, time since green, lap one, and restart indicator;
3. add field spread, count of close adjacent pairs, gap-closing summaries, recent order changes, and loop congestion;
4. add weather only after point-in-time lineage is complete;
5. test a shallow boosted model only if regularized hazard/logistic baselines are beaten out of event.

Discrete-time survival analysis is appropriate for time-varying covariates and censoring; recurrent-event methods are needed for multiple cautions within a race. [Singer and Willett](https://journals.sagepub.com/doi/10.3102/10769986018002155), [Andersen and Gill](https://doi.org/10.1214/aos/1176345976)

Separate cause-specific hazards for contact, off-course, debris/mechanical, and other. FCY is an officiating response, not a synonym for collision. INDYCAR publicly changed FCY decision inputs in May 2026, so a pre/post-policy regime variable and holdout are mandatory. [INDYCAR officiating update](https://www.indycar.com/news/2026/05/05-12-officaiting-update)

## Leakage and censoring gates

Exclude from pre-onset features:

- current yellow/flag onset state;
- `flagTimes` or control messages that include the current event;
- order/status changes after physical contact but before delayed FCY, unless the explicit target is “FCY escalation after an observed incident”;
- final result, terminal status, post-race incident report, caution duration, post-event pit/retirement, or full-lap aggregates unavailable at prediction time;
- future-published weather or corrected timing;
- preprocessing, imputation, calibration, or feature selection fit outside the training fold.

Censor at:

- red/checkered/session end;
- source outages or mid-session starts;
- all yellow periods plus a pre-registered restart cooldown;
- ambiguous identity, pit transitions, or missing source state;
- pair rows where either car is no longer in an observable eligible risk set.

Do not forward-fill a car through an incident-induced disappearance.

## Train/test design

Never randomly split seconds, laps, drivers, or pairs from the same event.

Use:

- forward season split: oldest train, next validate, newest test;
- whole-event grouped folds inside training;
- at least one whole-track holdout;
- driver/pair holdouts if history features are tested;
- separate post-May-2026 policy-regime evaluation;
- event-cluster bootstrap confidence intervals;
- a purge at least as long as the prediction horizon around boundaries.

Blocked/grouped validation is required when observations are temporally and hierarchically dependent. [Roberts et al.](https://www.biom.uni-freiburg.de/mitarbeiter/dormann/roberts-et-al-2017-ecography.pdf/at_download/file)

## Honest evaluation

Report all of:

- event prevalence and no-skill precision-recall baseline;
- AUPRC/average precision, with AUROC secondary;
- log loss and Brier score;
- reliability curve, calibration intercept/slope, and event-bootstrap intervals;
- event-level recall after collapsing repeated adjacent warnings into one alert episode;
- false alerts per race and per green hour;
- median/IQR lead time from first alert to onset;
- precision at a fixed operational alert budget, initially no more than one false alert per race;
- track, season, and policy-regime holdout results.

Precision-recall is more informative than ROC under strong class imbalance. [Saito and Rehmsmeier](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0118432) Probability quality must be measured directly; classification accuracy is not calibration. [Guo et al.](https://proceedings.mlr.press/v70/guo17a.html)

Compare against naive baselines:

- overall prevalence;
- track type × race phase historical rate;
- time-since-green hazard;
- lap-one/restart indicator;
- simple close-pair-count threshold.

A model that does not beat those baselines on held-out events has no predictive product value.

## Product and legal verdict

Do not publish a named-driver or named-pair “collision risk” score. It would imply physical knowledge absent from the feed, attach blame to sparse histories, and create salient reputational false positives. It may also be interpreted as safety or wagering guidance.

If data rights and validation eventually clear, the public label should be no stronger than:

> Experimental FCY likelihood in the next 60 seconds

It must display source freshness, calibration regime, abstention state, and no driver blame. A safer near-term product is descriptive:

- official historical caution hotspots by turn with sample counts;
- live field-compression/battle-density context;
- race-phase and restart context;
- no fused pseudo-physical “risk” number.

The 2026 INDY NXT rulebook’s data-sharing and ownership provisions make public model use a licensing stop gate, not an afterthought. [2026 INDY NXT rulebook](https://epaddock.indycar.com/docs/default-source/rules-regulations-and-policies/2026-indy-nxt-rulebook.pdf?sfvrsn=f77d165b_20)
