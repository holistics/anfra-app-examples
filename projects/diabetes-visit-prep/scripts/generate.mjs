// Writes the synthetic Diabetes Visit Prep data to data/health.duckdb. Seeded: every run produces the same rows.
// Maria's story is ported from the mockup (https://claude.ai/artifact/G2jbmeSjcZbqARJAVBMrHM): CGM and basal
// insulin start on day CGM_START, and she titrates basal up to 18 U, where the mornings are still high. A phone review
// on day TITRATION_RESTART resumes the titration; she reaches 24 U on day DOSE; over the next three weeks the
// mornings come down but night lows (02:00–04:00) appear. No Somogyi rebound: after a night with a low the morning
// is lower, not higher, and lower the deeper the low (learning session, 2026-10-18).
import { mkdirSync, rmSync } from 'node:fs';
import { DuckDBInstance } from '@duckdb/node-api';

const DB_PATH = new URL('../data/health.duckdb', import.meta.url).pathname;
// Days are indexed 0..TODAY (two years); TODAY_MS is the calendar date of day TODAY.
const TODAY = 727, DOSE = 682, CGM_START = 420, TITRATION_RESTART = 675;
const TODAY_MS = Date.UTC(2026, 9, 12);
// The sensor came off on day SENSOR_GAP.from with no spare until the pharmacy refill: no readings for whole days.
const SENSOR_GAP = { from: 527, to: 536 };
// Everyday CGM gaps (learning session, 2026-10-18): a 30–60 min warm-up after every sensor change; sensors that end
// early (Dexcom: 73.9% of 15-day sensors lasted the full 15 days), then a wait for the next one; and signal loss when
// the phone is out of range, more often at night, not backfilled. Drawn from their own seed after the readings are
// generated, so the glucose story does not move.
const SENSOR = { lifeDays: 15, warmUpMinutes: [30, 60], earlyEndShare: 0.26, earlyEndAfterDays: [3, 15], replacementDelayHours: [1, 8] };
const SIGNAL_LOSS = { chancePerDay: 0.45, nightShare: 0.6, minutes: [10, 150] };
const READING_INTERVAL_MINUTES = 5;
// Treatment changes are the clinician's decisions (treatment_events); a titration's dose steps are the patient carrying
// out the plan, recorded as daily doses (insulin_doses), as an insulin pen or a dose log would. The steps follow a common
// self-titration: +2 U every 3 days towards a fasting target.
const BASAL_STEPS = [[CGM_START, 10], [423, 12], [426, 14], [429, 16], [432, 18], [676, 20], [679, 22], [DOSE, 24]];
const BASAL_UNITS_BEFORE_RESTART = 18;
const BASAL_INJECTION_TIME = '22:00:00';
// Tomas wore his sensor on only 6 of the last 14 days, so his glucose status falls back to a recent lab HbA1c.
const TOMAS = { id: 2, wornDaysBeforeToday: [0, 2, 3, 7, 9, 12], baselineMgdl: 140, hba1cDaysBeforeToday: 40, hba1c: 7.4 };
// Vera has no CGM at all; only a lab HbA1c describes her glucose.
const VERA = { id: 3, hba1cDaysBeforeToday: 30, hba1c: 8.6 };
// Visits every 3 months for two years, newest first, the latest latestVisitDaysBeforeToday days ago: HbA1c (ADA 2026
// rec. 6.2: every 3 months after a treatment change or with goals unmet) and blood pressure (rec. 10.1) at each; the
// other tests where given. annualReview: lipid profile (rec. 10.17), retinal and foot exams that day.
const VISIT_INTERVAL_DAYS = 91;
// Sofia is well controlled since semaglutide was added at a visit a year ago: HbA1c 7.4–7.6% on metformin alone, then
// 6.5–6.9%; a month of steady CGM; kidney tests yearly (no CKD, rec. 11.1). No flags.
const SOFIA = {
  id: 4, cgmDays: 30, baselineMgdl: 125, latestVisitDaysBeforeToday: 20,
  visits: [
    { hba1c: 6.6, bloodPressure: [122, 76], egfr: 94, uacr: 9, ldl: 82, annualReview: true },
    { hba1c: 6.5, bloodPressure: [124, 78] },
    { hba1c: 6.7, bloodPressure: [120, 74] },
    { hba1c: 6.9, bloodPressure: [126, 78] },
    { hba1c: 7.6, bloodPressure: [128, 78], egfr: 96, uacr: 11, ldl: 85, annualReview: true },
    { hba1c: 7.4, bloodPressure: [124, 76] },
    { hba1c: 7.5, bloodPressure: [122, 74] },
    { hba1c: 7.3, bloodPressure: [126, 78] },
    { hba1c: 7.4, bloodPressure: [124, 76], egfr: 95, uacr: 8, ldl: 88, annualReview: true },
  ],
};
const SOFIA_SEMAGLUTIDE_VISIT_INDEX = 4;
// Rafael, 79, is on the older / high-risk glucose targets (ADA 2026 Table 13.2, complex/intermediate health: type 2 on
// basal insulin, CKD G3b, hypertension). On glargine 18 U his HbA1c sat near 7.2% with lows at home, so at the visit
// before last his clinician moved him to those targets and cut it to 14 U (rec. 13.7b: in complex health, put avoiding
// lows first); HbA1c rose to 7.5%, under his 8.0% target. CGM started at the latest visit (rec. 13.5: CGM for older
// adults with type 2 on insulin): wide swings after meals and rare lows, time in range in the 50s, below range under 1%,
// so on target for his set and "Review" on the standard one. eGFR drifts 47 → 42 over two years (about −2.5 a year,
// under the −5 of rapid decline); eGFR and UACR twice a year (KDIGO 2024: G3b A1).
const RAFAEL = {
  id: 5, cgmDays: 30, baselineMgdl: 142, dayToDayMgdl: 18, noiseSdMgdl: 26, basalUnits: 14, basalUnitsBefore: 18, latestVisitDaysBeforeToday: 29,
  visits: [
    { hba1c: 7.5, bloodPressure: [124, 72], egfr: 42, uacr: 18, ldl: 66, annualReview: true },
    { hba1c: 7.1, bloodPressure: [127, 74] },
    { hba1c: 7.2, bloodPressure: [121, 70], egfr: 44, uacr: 24 },
    { hba1c: 7.0, bloodPressure: [126, 73] },
    { hba1c: 7.3, bloodPressure: [129, 76], egfr: 43, uacr: 14, ldl: 64, annualReview: true },
    { hba1c: 7.1, bloodPressure: [123, 71] },
    { hba1c: 7.4, bloodPressure: [125, 74], egfr: 46, uacr: 21 },
    { hba1c: 7.2, bloodPressure: [128, 75] },
    { hba1c: 7.3, bloodPressure: [122, 70], egfr: 47, uacr: 16, ldl: 68, annualReview: true },
  ],
};
const RAFAEL_DOSE_CUT_VISIT_INDEX = 1;
const getVisitDay = ({ latestVisitDaysBeforeToday }, visitIndex) => TODAY - latestVisitDaysBeforeToday - visitIndex * VISIT_INTERVAL_DAYS;
// `on` is a day index, or an ISO date for a change before the data starts. Maria's LDL and blood pressure come down
// from week HEART_TREATED_FROM_WEEK's labs, so the statin and ACE inhibitor were raised at the visit before (week 25).
const HEART_TREATMENT_VISIT_DAY = 7 * 25 + 3;
const TREATMENT_HISTORY = [
  { patient: 1, on: '2016-05-02', kind: 'drug_started', drug: 'Metformin', drugClass: 'biguanide', doseAfter: 2000, unit: 'mg/day', lowersGlucose: true, text: 'Metformin started, 1000 mg twice daily' },
  { patient: 1, on: '2019-09-16', kind: 'drug_started', drug: 'Ramipril', drugClass: 'ACE inhibitor', doseAfter: 5, unit: 'mg/day', lowersGlucose: false, lowersBloodPressure: true, text: 'Ramipril started, 5 mg once daily (blood pressure)' },
  { patient: 1, on: '2020-11-23', kind: 'drug_started', drug: 'Atorvastatin', drugClass: 'statin', doseAfter: 20, unit: 'mg/day', lowersGlucose: false, text: 'Atorvastatin started, 20 mg once daily' },
  { patient: 1, on: '2022-06-20', kind: 'drug_started', drug: 'Gliclazide', drugClass: 'sulfonylurea', doseAfter: 80, unit: 'mg/day', lowersGlucose: true, text: 'Gliclazide added, 80 mg once daily' },
  { patient: 1, on: HEART_TREATMENT_VISIT_DAY, kind: 'dose_changed', drug: 'Atorvastatin', drugClass: 'statin', doseBefore: 20, doseAfter: 40, unit: 'mg/day', lowersGlucose: false, text: 'Atorvastatin 20 → 40 mg (LDL above target)' },
  { patient: 1, on: HEART_TREATMENT_VISIT_DAY, kind: 'dose_changed', drug: 'Ramipril', drugClass: 'ACE inhibitor', doseBefore: 5, doseAfter: 10, unit: 'mg/day', lowersGlucose: false, lowersBloodPressure: true, text: 'Ramipril 5 → 10 mg (blood pressure above target)' },
  { patient: 1, on: CGM_START, kind: 'drug_stopped', drug: 'Gliclazide', drugClass: 'sulfonylurea', doseBefore: 80, unit: 'mg/day', lowersGlucose: true, text: 'Gliclazide stopped as basal insulin starts, to avoid lows' },
  { patient: 1, on: CGM_START, kind: 'drug_started', drug: 'Insulin glargine', drugClass: 'basal insulin', doseAfter: BASAL_STEPS[0][1], unit: 'U/day', lowersGlucose: true, text: `Basal insulin glargine started at ${BASAL_STEPS[0][1]} U at bedtime; raise 2 U every 3 days until fasting glucose is 80–130 mg/dL` },
  { patient: 1, on: CGM_START, kind: 'cgm_started', text: 'CGM sensor started' },
  { patient: 1, on: SENSOR_GAP.from, kind: 'cgm_interrupted', text: 'CGM sensor came off; no spare sensor until the pharmacy refill' },
  { patient: 1, on: SENSOR_GAP.to + 1, kind: 'cgm_resumed', text: 'New CGM sensor started' },
  { patient: 1, on: TITRATION_RESTART, kind: 'titration_started', drug: 'Insulin glargine', drugClass: 'basal insulin', doseBefore: BASAL_UNITS_BEFORE_RESTART, unit: 'U/day', lowersGlucose: true, text: `Phone review: mornings still high on ${BASAL_UNITS_BEFORE_RESTART} U; raise basal 2 U every 3 days until fasting glucose is 80–130 mg/dL` },
  { patient: TOMAS.id, on: '2019-04-08', kind: 'drug_started', drug: 'Metformin', drugClass: 'biguanide', doseAfter: 2000, unit: 'mg/day', lowersGlucose: true, text: 'Metformin started, 1000 mg twice daily' },
  { patient: TOMAS.id, on: '2023-02-13', kind: 'drug_started', drug: 'Sitagliptin', drugClass: 'DPP-4 inhibitor', doseAfter: 100, unit: 'mg/day', lowersGlucose: true, text: 'Sitagliptin added, 100 mg once daily' },
  { patient: VERA.id, on: '2014-10-06', kind: 'drug_started', drug: 'Metformin', drugClass: 'biguanide', doseAfter: 2000, unit: 'mg/day', lowersGlucose: true, text: 'Metformin started, 1000 mg twice daily' },
  { patient: VERA.id, on: '2018-03-19', kind: 'drug_started', drug: 'Gliclazide', drugClass: 'sulfonylurea', doseAfter: 160, unit: 'mg/day', lowersGlucose: true, text: 'Gliclazide added, 80 mg twice daily' },
  { patient: SOFIA.id, on: '2020-07-27', kind: 'drug_started', drug: 'Metformin', drugClass: 'biguanide', doseAfter: 2000, unit: 'mg/day', lowersGlucose: true, text: 'Metformin started, 1000 mg twice daily' },
  // ADA 2026 rec. 10.18: a moderate-intensity statin for everyone with diabetes aged 40–75, whatever their LDL. Tomas (47)
  // has none: the common gap the heart status and the "No statin" flag catch.
  { patient: VERA.id, on: '2018-03-19', kind: 'drug_started', drug: 'Atorvastatin', drugClass: 'statin', doseAfter: 20, unit: 'mg/day', lowersGlucose: false, text: 'Atorvastatin started, 20 mg once daily' },
  { patient: SOFIA.id, on: '2021-03-08', kind: 'drug_started', drug: 'Atorvastatin', drugClass: 'statin', doseAfter: 20, unit: 'mg/day', lowersGlucose: false, text: 'Atorvastatin started, 20 mg once daily' },
  { patient: RAFAEL.id, on: '2009-05-11', kind: 'drug_started', drug: 'Metformin', drugClass: 'biguanide', doseAfter: 2000, unit: 'mg/day', lowersGlucose: true, text: 'Metformin started, 1000 mg twice daily' },
  { patient: RAFAEL.id, on: '2015-02-02', kind: 'drug_started', drug: 'Amlodipine', drugClass: 'calcium channel blocker', doseAfter: 5, unit: 'mg/day', lowersGlucose: false, lowersBloodPressure: true, text: 'Amlodipine started, 5 mg once daily (blood pressure)' },
  { patient: RAFAEL.id, on: '2015-02-02', kind: 'drug_started', drug: 'Atorvastatin', drugClass: 'statin', doseAfter: 20, unit: 'mg/day', lowersGlucose: false, text: 'Atorvastatin started, 20 mg once daily' },
  { patient: RAFAEL.id, on: '2021-09-06', kind: 'drug_started', drug: 'Insulin glargine', drugClass: 'basal insulin', doseAfter: RAFAEL.basalUnitsBefore, unit: 'U/day', lowersGlucose: true, text: `Basal insulin glargine started, ${RAFAEL.basalUnitsBefore} U at bedtime` },
  // Metformin at most 1000 mg/day once eGFR is 30–45 (ADA 2026 sec. 9 and FDA labeling).
  { patient: RAFAEL.id, on: '2024-03-18', kind: 'dose_changed', drug: 'Metformin', drugClass: 'biguanide', doseBefore: 2000, doseAfter: 1000, unit: 'mg/day', lowersGlucose: true, text: 'Metformin 2000 → 1000 mg (eGFR under 45)' },
  { patient: RAFAEL.id, on: getVisitDay(RAFAEL, RAFAEL_DOSE_CUT_VISIT_INDEX), kind: 'dose_changed', drug: 'Insulin glargine', drugClass: 'basal insulin', doseBefore: RAFAEL.basalUnitsBefore, doseAfter: RAFAEL.basalUnits, unit: 'U/day', lowersGlucose: true, text: `Insulin glargine ${RAFAEL.basalUnitsBefore} → ${RAFAEL.basalUnits} U (lows at home; older / high-risk targets)` },
  { patient: RAFAEL.id, on: TODAY - RAFAEL.cgmDays + 1, kind: 'cgm_started', text: 'CGM sensor started' },
  { patient: SOFIA.id, on: getVisitDay(SOFIA, SOFIA_SEMAGLUTIDE_VISIT_INDEX), kind: 'drug_started', drug: 'Semaglutide', drugClass: 'GLP-1 receptor agonist', doseAfter: 1, unit: 'mg/week', lowersGlucose: true, text: 'Semaglutide added, 1 mg once weekly' },
];
// Quarterly, back from week 103 (the week ending TODAY). Week -1 is a baseline before day 0, so every day of the two years has a result.
const LAB_WEEKS = Array.from({ length: 9 }, (_, i) => 103 - 13 * (8 - i));
const VISIT_DAY_IN_WEEK = 3;
// LDL and blood pressure come down from the first visit on or after this week (statin and BP medication adjusted).
const HEART_TREATED_FROM_WEEK = 36;
// Retinal screening is now overdue (last one in week 38, 15 months ago); the foot exam is up to date.
const SCREENING_WEEKS = { retinal: [-14, 38], foot: [-30, 18, 70] };
const SCREENING_RESULTS = { retinal: 'no_retinopathy', foot: 'normal' };

// Curve parameters, tuned so the raw readings reproduce the mockup's numbers (scripts/check-story.mjs).
const CURVE = {
  baselineMgdl: 130,
  dayToDayMgdl: 4,
  highMorningMgdl: 70,   // high mornings before the dose change (fasting near 210), gone once it takes full effect
  startDoseMorningMgdl: 30, // extra morning height at the 10 U starting dose, gone by 18 U
  nightDipMgdl: 25,      // 03:00 dip from the higher dose
  lowMorningShare: 0.35, // share of a night low's depth still pulling the 06:00–08:00 glucose down
  noiseSdMgdl: 36,
  noiseSdAddedByDoseMgdl: 4,
  nightNoiseReduction: 0.6,
  nightLowDepthMgdl: 69,
};

function mulberry32 (seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The mockup's per-day hash in [-1, 1]. Kept so night-low days land on the same dates as in the mockup.
function noise (d) { const x = Math.sin(d * 12.9898 + 78.233) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; }
function basalUnits (d) { return BASAL_STEPS.findLast(([day]) => day <= d)?.[1] ?? 0; }
// How far the doses above 18 U have taken effect: each restart step adds its share over three weeks, so 1 once 24 U
// has acted for three weeks.
const RESTART_STEPS = BASAL_STEPS.filter(([day]) => day > TITRATION_RESTART);
function ramp (d) {
  return RESTART_STEPS.reduce((total, [day]) => total + (d >= day ? Math.min(1, (d - day) / 21) : 0), 0) / RESTART_STEPS.length;
}
function nightLow (d) { return noise(d + 11) < -0.6 + 1.2 * ramp(d); }
function bump (hour, peakHour, width) { return Math.exp(-((hour - peakHour) ** 2) / (2 * width * width)); }
function dateOf (d) { return new Date(TODAY_MS - (TODAY - d) * 86400000); }
function isoDay (d) { return dateOf(d).toISOString().slice(0, 10); }

function between (random, [low, high]) { return low + random() * (high - low); }
function drawGaussian (random) { return Math.sqrt(-2 * Math.log(random() || 1e-9)) * Math.cos(2 * Math.PI * random()); }

// The 5-minute reading slots (minutes since day 0, divided by 5) that have no reading, for days firstDay..lastDay.
function planMissingSlots (firstDay, lastDay, random, wholeDayGap) {
  const missing = new Set();
  const dropMinutes = (from, to) => {
    for (let minute = Math.ceil(from / READING_INTERVAL_MINUTES) * READING_INTERVAL_MINUTES; minute < to; minute += READING_INTERVAL_MINUTES) missing.add(minute / READING_INTERVAL_MINUTES);
  };
  const lastMinute = (lastDay + 1) * 1440;
  for (let sensorStart = firstDay * 1440; sensorStart < lastMinute;) {
    dropMinutes(sensorStart, sensorStart + between(random, SENSOR.warmUpMinutes));
    const endsEarly = random() < SENSOR.earlyEndShare;
    let sensorEnd = sensorStart + (endsEarly ? between(random, SENSOR.earlyEndAfterDays) : SENSOR.lifeDays) * 1440;
    let nextStart = endsEarly ? sensorEnd + between(random, SENSOR.replacementDelayHours) * 60 : sensorEnd;
    if (wholeDayGap && sensorStart < (wholeDayGap.to + 1) * 1440 && sensorEnd > wholeDayGap.from * 1440) {
      sensorEnd = wholeDayGap.from * 1440;
      nextStart = (wholeDayGap.to + 1) * 1440;
    }
    dropMinutes(sensorEnd, nextStart);
    sensorStart = nextStart;
  }
  for (let d = firstDay; d <= lastDay; d++) {
    if (random() >= SIGNAL_LOSS.chancePerDay) continue;
    const startHour = random() < SIGNAL_LOSS.nightShare ? between(random, [0, 6]) : between(random, [6, 24]);
    const from = d * 1440 + startHour * 60;
    dropMinutes(from, from + between(random, SIGNAL_LOSS.minutes));
  }
  return missing;
}

// Repeat results scatter around each trend by their within-person variation: eGFR about 5% (creatinine CVw 5.4% in CKD),
// UACR about 30% (CVw 30–33%; ADA sec. 11: over 20%), LDL 7% (EFLM meta-analysis, CVI 7.0%), office blood pressure
// SD 8/5 mmHg (visit-to-visit systolic SD 10–14 mmHg, partly from treatment changes). The first eGFR and the latest
// result of each test stay on the trend, so the story's start and today's numbers do not move.
const LAB_VARIATION = { egfrCv: 0.05, uacrLogSd: 0.29, ldlCv: 0.07, systolicSdMmhg: 8, diastolicSdMmhg: 5 };
const LAB_SEED = 4;
const LAB_DRAWS = (() => {
  const random = mulberry32(LAB_SEED);
  const isLatestLabWeek = (week) => week === LAB_WEEKS.at(-1);
  return new Map(LAB_WEEKS.map((week) => {
    const draws = { egfr: drawGaussian(random), uacr: drawGaussian(random), ldl: drawGaussian(random), systolic: drawGaussian(random), diastolic: drawGaussian(random) };
    return [week, isLatestLabWeek(week) ? Object.fromEntries(Object.keys(draws).map((key) => [key, 0])) : draws];
  }));
})();
// Maria's kidneys hold steady, then decline: eGFR in diabetes often falls unevenly rather than in a straight line.
// Albuminuria comes first (one raised UACR in Oct 2025, confirmed by a second in Jan 2026: "Review"), then eGFR falls
// fast enough that this month's result makes the trend rapid decline, so today's visit is the first with the kidneys at
// "Act now"; not a year of "Act now" that no visit acted on.
// [week, value] points, joined by straight lines.
const KIDNEY_TRENDS = { egfr: [[-1, 74], [51, 76], [90, 70], [103, 58]], uacr: [[-1, 18], [51, 22], [77, 36], [103, 42]] };
function getTrendValue (points, week) {
  const end = points.findIndex(([pointWeek]) => pointWeek >= week);
  if (end <= 0) return points[Math.max(end, 0)][1];
  const [[fromWeek, fromValue], [toWeek, toValue]] = [points[end - 1], points[end]];
  return fromValue + (toValue - fromValue) * (week - fromWeek) / (toWeek - fromWeek);
}
function generateKidneyLabs (week) {
  const draws = LAB_DRAWS.get(week);
  const egfrDraw = week === LAB_WEEKS[0] ? 0 : draws.egfr;
  return [
    ['egfr', Math.round(getTrendValue(KIDNEY_TRENDS.egfr, week) * (1 + LAB_VARIATION.egfrCv * egfrDraw)), 'mL/min/1.73m²'],
    ['uacr', Math.round(getTrendValue(KIDNEY_TRENDS.uacr, week) * Math.exp(LAB_VARIATION.uacrLogSd * draws.uacr)), 'mg/g'],
  ];
}

// HbA1c stays quarterly once CGM starts: CGM adds to it, not replaces it, and every 3 months while goals are not met or
// treatment changed (ADA 2026 rec. 6.2). From CGM on it tracks the readings' GMI (6.9% over each 90 days); the first one,
// 4 weeks after insulin started, still carries the months before it.
const HBA1C_AFTER_CGM_START = { 64: 7.3, 77: 7.2, 90: 7.2, 103: 6.8 };
function generateGlucoseLabs (week) {
  const day = 7 * week + VISIT_DAY_IN_WEEK;
  return [['hba1c', day < 210 ? 8.4 : day < CGM_START ? 7.6 : HBA1C_AFTER_CGM_START[week], '%']];
}

// Atorvastatin 20 → 40 mg moves from moderate to high intensity (ADA Table 10.1) but lowers LDL only about 5 points more
// (STELLAR: 43% at 20 mg, 48% at 40 mg), so 112 becomes about 102, still over her goal of 70.
function generateHeartLabs (week) {
  return [['ldl', Math.round((week < HEART_TREATED_FROM_WEEK ? 112 : 102) * (1 + LAB_VARIATION.ldlCv * LAB_DRAWS.get(week).ldl)), 'mg/dL']];
}

function generateBloodPressure (week) {
  const [systolic, diastolic] = week < HEART_TREATED_FROM_WEEK ? [136, 82] : [128, 78];
  const draws = LAB_DRAWS.get(week);
  return [Math.round(systolic + LAB_VARIATION.systolicSdMmhg * draws.systolic), Math.round(diastolic + LAB_VARIATION.diastolicSdMmhg * draws.diastolic)];
}

function generateSteadyDayOfReadings (d, random, baselineMgdl) {
  const readings = [];
  for (let minute = 0; minute < 24 * 60; minute += READING_INTERVAL_MINUTES) {
    const hour = minute / 60;
    const meals = 45 * bump(hour, 8, 1) + 40 * bump(hour, 13, 1) + 50 * bump(hour, 19.5, 1.1);
    const mgdl = baselineMgdl + meals + 20 * (random() * 2 - 1);
    const hh = String(Math.floor(minute / 60)).padStart(2, '0');
    const mm = String(minute % 60).padStart(2, '0');
    readings.push([`${isoDay(d)} ${hh}:${mm}:00`, Math.round(mgdl)]);
  }
  return readings;
}

// Day-to-day level and AR(1) noise, like a real sensor trace; a mild dip before lunch is his only time below range.
function generateOlderDayOfReadings (d, random, { baselineMgdl, dayToDayMgdl, noiseSdMgdl }) {
  const dayLevel = noise(d + 41) * dayToDayMgdl;
  const preLunchDip = noise(d + 53) > 0.55 ? 75 : 40;
  let readingNoise = 0;
  const readings = [];
  for (let minute = 0; minute < 24 * 60; minute += READING_INTERVAL_MINUTES) {
    const hour = minute / 60;
    const meals = 85 * bump(hour, 8.5, 1.1) + 70 * bump(hour, 13.5, 1.1) + 90 * bump(hour, 19.5, 1.3);
    readingNoise = 0.9 * readingNoise + Math.sqrt(1 - 0.81) * drawGaussian(random);
    const mgdl = baselineMgdl + dayLevel + meals - preLunchDip * bump(hour, 11.5, 0.8) + noiseSdMgdl * readingNoise;
    const hh = String(Math.floor(minute / 60)).padStart(2, '0');
    const mm = String(minute % 60).padStart(2, '0');
    readings.push([`${isoDay(d)} ${hh}:${mm}:00`, Math.round(Math.max(40, Math.min(400, mgdl)))]);
  }
  return readings;
}

function generateDayOfReadings (d, random, sensor) {
  const doseRamp = ramp(d);
  const dayLevel = noise(d + 7) * CURVE.dayToDayMgdl;
  const lowPeakHour = 2.4 + (noise(d + 21) + 1);
  const lowDepth = CURVE.nightLowDepthMgdl + noise(d + 31) * 10;
  const readings = [];
  for (let minute = 0; minute < 24 * 60; minute += READING_INTERVAL_MINUTES) {
    const hour = minute / 60;
    const meals = 52 * bump(hour, 8.5, 0.9) + 42 * bump(hour, 13.2, 1.0) + 58 * bump(hour, 19.5, 1.1) + 18 * bump(hour, 5.5, 1.2);
    const doseEffect = -CURVE.nightDipMgdl * bump(hour, 3, 0.9);
    const startDoseShare = Math.max(0, BASAL_UNITS_BEFORE_RESTART - basalUnits(d)) / (BASAL_UNITS_BEFORE_RESTART - BASAL_STEPS[0][1]);
    const highMorning = (CURVE.highMorningMgdl + CURVE.startDoseMorningMgdl * startDoseShare) * bump(hour, 6.5, 1.5);
    const sd = (CURVE.noiseSdMgdl + CURVE.noiseSdAddedByDoseMgdl * doseRamp) * (1 + 0.3 * bump(hour, 19.5, 2)) * (1 - CURVE.nightNoiseReduction * bump(hour, 3, 1.6));
    // AR(1) noise, so consecutive readings drift together like a real sensor trace.
    sensor.readingNoise = 0.9 * sensor.readingNoise + Math.sqrt(1 - 0.81) * drawGaussian(random);
    let mgdl = CURVE.baselineMgdl + meals + dayLevel + doseRamp * doseEffect + (1 - doseRamp) * highMorning + sd * sensor.readingNoise;
    if (nightLow(d)) mgdl -= lowDepth * (bump(hour, lowPeakHour, 0.45) + CURVE.lowMorningShare * bump(hour, 7, 1.2));
    const hh = String(Math.floor(minute / 60)).padStart(2, '0');
    const mm = String(minute % 60).padStart(2, '0');
    readings.push([`${isoDay(d)} ${hh}:${mm}:00`, Math.round(Math.max(40, Math.min(400, mgdl)))]);
  }
  return readings;
}

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
rmSync(DB_PATH, { force: true });
const connection = await (await DuckDBInstance.create(DB_PATH)).connect();

await connection.run(`
  create table patients (id integer primary key, display_name varchar, birth_year integer, diabetes_type varchar, glucose_target_set varchar, sex varchar);
  create table cgm_readings (id integer primary key, patient_id integer, read_at timestamp, glucose_mgdl integer);
  create table insulin_doses (id integer primary key, patient_id integer, given_at timestamp, kind varchar, units double);
  create table treatment_events (id integer primary key, patient_id integer, occurred_on date, kind varchar, description varchar,
    drug varchar, drug_class varchar, dose_before double, dose_after double, dose_unit varchar, lowers_glucose boolean,
    lowers_blood_pressure boolean);
  create table lab_results (id integer primary key, patient_id integer, taken_on date, test varchar, value double, unit varchar);
  create table blood_pressure_readings (id integer primary key, patient_id integer, measured_on date, systolic_mmhg integer, diastolic_mmhg integer);
  create table complication_screenings (id integer primary key, patient_id integer, screened_on date, kind varchar, result varchar);
`);
await connection.run(`insert into patients values (1, 'Maria Alves', 1968, 'T2', 'standard', 'female'), (${TOMAS.id}, 'Tomas Novak', 1979, 'T2', 'standard', 'male'),
  (${VERA.id}, 'Vera Petrova', 1961, 'T2', 'standard', 'female'), (${SOFIA.id}, 'Sofia Lindqvist', 1975, 'T2', 'standard', 'female'),
  (${RAFAEL.id}, 'Rafael Ortega', 1947, 'T2', 'older_high_risk', 'male')`);
const formatSqlLiteral = (value) => value == null ? 'null' : typeof value === 'string' ? `'${value.replaceAll("'", "''")}'` : String(value);
await connection.run(`insert into treatment_events values ${TREATMENT_HISTORY.map((event, i) => `(${[
  i + 1, event.patient, typeof event.on === 'number' ? isoDay(event.on) : event.on, event.kind, event.text, event.drug, event.drugClass,
  event.doseBefore, event.doseAfter, event.unit, event.lowersGlucose ?? false, event.lowersBloodPressure ?? false,
].map(formatSqlLiteral).join(', ')})`).join(',\n  ')}`);

const labRows = LAB_WEEKS.flatMap((week) => [...generateGlucoseLabs(week), ...generateKidneyLabs(week), ...generateHeartLabs(week)]
  .map(([test, value, unit]) => `(1, '${isoDay(7 * week + VISIT_DAY_IN_WEEK)}', '${test}', ${value}, '${unit}')`));
await connection.run(`insert into lab_results select row_number() over (), * from (values ${labRows.join(', ')})`);
// Blood pressure is taken at the same visits as the labs.
const bloodPressureRows = LAB_WEEKS.map((week) => `(1, '${isoDay(7 * week + VISIT_DAY_IN_WEEK)}', ${generateBloodPressure(week).join(', ')})`);
await connection.run(`insert into blood_pressure_readings select row_number() over (), * from (values ${bloodPressureRows.join(', ')})`);
const screeningRows = Object.entries(SCREENING_WEEKS).flatMap(([kind, weeks]) =>
  weeks.map((week) => `(1, '${isoDay(7 * week + VISIT_DAY_IN_WEEK)}', '${kind}', '${SCREENING_RESULTS[kind]}')`));
await connection.run(`insert into complication_screenings select row_number() over (), * from (values ${screeningRows.join(', ')})`);

const random = mulberry32(42);
const sensor = { readingNoise: 0 };
const SLOTS_PER_DAY = 1440 / READING_INTERVAL_MINUTES;
const mariaMissingSlots = planMissingSlots(CGM_START, TODAY, mulberry32(99), SENSOR_GAP);
const readingAppender = await connection.createAppender('cgm_readings');
const doseAppender = await connection.createAppender('insulin_doses');
let readingId = 0;
for (let d = CGM_START; d <= TODAY; d++) {
  doseAppender.appendInteger(d - CGM_START + 1);
  doseAppender.appendInteger(1);
  doseAppender.appendVarchar(`${isoDay(d)} ${BASAL_INJECTION_TIME}`);
  doseAppender.appendVarchar('basal');
  doseAppender.appendDouble(basalUnits(d));
  doseAppender.endRow();

  // Generated through every gap too and then dropped, so the gaps do not shift the random sequence.
  const readings = generateDayOfReadings(d, random, sensor);
  for (const [slot, [readAt, mgdl]] of readings.entries()) {
    if (mariaMissingSlots.has(d * SLOTS_PER_DAY + slot)) continue;
    readingAppender.appendInteger(++readingId);
    readingAppender.appendInteger(1);
    readingAppender.appendVarchar(readAt);
    readingAppender.appendInteger(mgdl);
    readingAppender.endRow();
  }
}

const tomasRandom = mulberry32(7);
for (const daysBefore of TOMAS.wornDaysBeforeToday) {
  for (const [readAt, mgdl] of generateSteadyDayOfReadings(TODAY - daysBefore, tomasRandom, TOMAS.baselineMgdl)) {
    readingAppender.appendInteger(++readingId);
    readingAppender.appendInteger(TOMAS.id);
    readingAppender.appendVarchar(readAt);
    readingAppender.appendInteger(mgdl);
    readingAppender.endRow();
  }
}
for (const { id, hba1cDaysBeforeToday, hba1c } of [TOMAS, VERA]) {
  await connection.run(`insert into lab_results select max(id) + 1, ${id}, '${isoDay(TODAY - hba1cDaysBeforeToday)}', 'hba1c', ${hba1c}, '%' from lab_results`);
}
const sofiaRandom = mulberry32(11);
const sofiaMissingSlots = planMissingSlots(TODAY - SOFIA.cgmDays + 1, TODAY, mulberry32(13));
for (let d = TODAY - SOFIA.cgmDays + 1; d <= TODAY; d++) {
  for (const [slot, [readAt, mgdl]] of generateSteadyDayOfReadings(d, sofiaRandom, SOFIA.baselineMgdl).entries()) {
    if (sofiaMissingSlots.has(d * SLOTS_PER_DAY + slot)) continue;
    readingAppender.appendInteger(++readingId);
    readingAppender.appendInteger(SOFIA.id);
    readingAppender.appendVarchar(readAt);
    readingAppender.appendInteger(mgdl);
    readingAppender.endRow();
  }
}
const rafaelRandom = mulberry32(17);
const rafaelMissingSlots = planMissingSlots(TODAY - RAFAEL.cgmDays + 1, TODAY, mulberry32(19));
let doseId = TODAY - CGM_START + 1;
for (let d = TODAY - RAFAEL.cgmDays + 1; d <= TODAY; d++) {
  for (const [slot, [readAt, mgdl]] of generateOlderDayOfReadings(d, rafaelRandom, RAFAEL).entries()) {
    if (rafaelMissingSlots.has(d * SLOTS_PER_DAY + slot)) continue;
    readingAppender.appendInteger(++readingId);
    readingAppender.appendInteger(RAFAEL.id);
    readingAppender.appendVarchar(readAt);
    readingAppender.appendInteger(mgdl);
    readingAppender.endRow();
  }
  doseAppender.appendInteger(++doseId);
  doseAppender.appendInteger(RAFAEL.id);
  doseAppender.appendVarchar(`${isoDay(d)} ${BASAL_INJECTION_TIME}`);
  doseAppender.appendVarchar('basal');
  doseAppender.appendDouble(RAFAEL.basalUnits);
  doseAppender.endRow();
}
const LAB_UNITS = { hba1c: '%', egfr: 'mL/min/1.73m²', uacr: 'mg/g', ldl: 'mg/dL' };
for (const patient of [SOFIA, RAFAEL]) {
  for (const [visitIndex, { bloodPressure, annualReview, ...labs }] of patient.visits.entries()) {
    const visitDay = isoDay(getVisitDay(patient, visitIndex));
    for (const [test, value] of Object.entries(labs)) {
      await connection.run(`insert into lab_results select max(id) + 1, ${patient.id}, '${visitDay}', '${test}', ${value}, '${LAB_UNITS[test]}' from lab_results`);
    }
    await connection.run(`insert into blood_pressure_readings select max(id) + 1, ${patient.id}, '${visitDay}', ${bloodPressure.join(', ')} from blood_pressure_readings`);
    if (!annualReview) continue;
    for (const [kind, result] of Object.entries(SCREENING_RESULTS)) {
      await connection.run(`insert into complication_screenings select max(id) + 1, ${patient.id}, '${visitDay}', '${kind}', '${result}' from complication_screenings`);
    }
  }
}
readingAppender.closeSync();
doseAppender.closeSync();

const summary = await connection.runAndReadAll(
  'select count(*) as readings, round(avg(glucose_mgdl), 1) as mean_mgdl from cgm_readings',
);
console.log(`wrote ${DB_PATH}`, summary.getRowObjectsJson()[0]);
connection.closeSync();
