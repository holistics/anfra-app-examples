// Checks that data/health.duckdb tells Maria's story. Windows are derived from the data the same way
// the AML does: "last 14 days" counts back from her latest reading, "before the change" is the 14 days
// before the titration she restarted at the phone review (titration_started), when she was on a steady dose.
import { DuckDBInstance } from '@duckdb/node-api';

const DB_PATH = new URL('../data/health.duckdb', import.meta.url).pathname;
const instance = await DuckDBInstance.create(DB_PATH, { access_mode: 'READ_ONLY' }).catch((error) => {
  if (!/Could not set lock/.test(error.message)) throw error;
  console.error('data/health.duckdb is locked, probably by `anfra serve`. Stop it, run the check, then start it again.');
  process.exit(2);
});
const connection = await instance.connect();
const queryRows = async (sql) => (await connection.runAndReadAll(sql)).getRowObjectsJson();

const [windowStats] = await queryRows(`
  with anchors as (
    select max(read_at)::date as last_read_day,
           (select occurred_on from treatment_events where patient_id = 1 and kind = 'titration_started') as change_day
    from cgm_readings where patient_id = 1
  ),
  labelled as (
    select c.glucose_mgdl as mgdl,
           case when c.read_at::date > a.last_read_day - 14 then 'now'
                when c.read_at::date >= a.change_day - 14 and c.read_at::date < a.change_day then 'before' end as win,
           hour(c.read_at) < 6 as night, c.read_at::date as day,
           hour(c.read_at) = 3 and minute(c.read_at) < 15 as slot_0300
    from cgm_readings c, anchors a where c.patient_id = 1
  )
  select
    round(100.0 * count_if(win = 'now' and mgdl between 70 and 180) / count_if(win = 'now'), 1) as tir_now,
    round(100.0 * count_if(win = 'now' and mgdl < 70) / count_if(win = 'now'), 1) as tbr_now,
    round(100.0 * count_if(win = 'before' and mgdl between 70 and 180) / count_if(win = 'before'), 1) as tir_before,
    round(100.0 * count_if(win = 'before' and mgdl < 70) / count_if(win = 'before'), 1) as tbr_before,
    quantile_disc(mgdl, 0.5) filter (where win = 'now' and slot_0300) as agp_0300_now,
    quantile_disc(mgdl, 0.5) filter (where win = 'before' and slot_0300) as agp_0300_before,
    count(distinct day) filter (where win = 'now' and night and mgdl < 70) as low_nights_now,
    count(distinct day) filter (where win = 'before' and night and mgdl < 70) as low_nights_before
  from labelled
`);
// Fasting = 06:00–08:00. Evidence (learning session, 2026-10-18): no Somogyi rebound; fasting is lower after a night
// with a low, and a higher basal dose lowers fasting. Compared over every day since the change: the last 14 days alone
// have too few nights without a low to compare. "After" starts on the day she reached her final dose.
const [mornings] = await queryRows(`
  with anchors as (
    select max(read_at)::date as last_read_day,
           (select occurred_on from treatment_events where patient_id = 1 and kind = 'titration_started') as change_day,
           (select min(given_at)::date from insulin_doses where patient_id = 1 and kind = 'basal'
            and units = (select max(units) from insulin_doses where patient_id = 1 and kind = 'basal')) as final_dose_day
    from cgm_readings where patient_id = 1
  ),
  days as (
    select c.read_at::date as day,
           case when c.read_at::date >= a.final_dose_day then 'after'
                when c.read_at::date >= a.change_day - 14 and c.read_at::date < a.change_day then 'before' end as win,
           bool_or(hour(c.read_at) < 6 and c.glucose_mgdl < 70) as low_night,
           avg(c.glucose_mgdl) filter (where hour(c.read_at) >= 6 and hour(c.read_at) < 8) as fasting,
           avg(c.glucose_mgdl) filter (where hour(c.read_at) = 8) as at_0800
    from cgm_readings c, anchors a where c.patient_id = 1
    group by 1, 2
  )
  select round(avg(fasting) filter (where win = 'after' and low_night) - avg(fasting) filter (where win = 'after' and not low_night)) as fasting_low_minus_normal_after,
         round(avg(fasting) filter (where win = 'after') - avg(fasting) filter (where win = 'before')) as fasting_after_minus_before,
         round(avg(at_0800) filter (where win = 'after' and low_night) - avg(at_0800) filter (where win = 'after' and not low_night)) as at_0800_low_minus_normal_after
  from days
`);
const [kidneys] = await queryRows(`
  select max_by(value, taken_on) filter (where test = 'egfr') as egfr_latest,
         max_by(value, taken_on) filter (where test = 'uacr') as uacr_latest,
         min_by(value, taken_on) filter (where test = 'egfr') as egfr_first,
         round(365.25 * regr_slope(value, epoch(taken_on) / 86400.0) filter (where test = 'egfr'), 1) as egfr_slope_per_year,
         (select median(value) from (select value from lab_results where patient_id = 1 and test = 'uacr' order by taken_on desc limit 3)) as uacr_last_3_median,
         round(365.25 * regr_slope(value, epoch(taken_on) / 86400.0) filter (where test = 'egfr' and taken_on < '2026-10-01'), 1) as egfr_slope_per_year_before_latest,
         count(*) filter (where test = 'uacr' and value >= 30 and taken_on < '2026-01-01') as uacr_single_raised_before_ckd
  from lab_results where patient_id = 1
`);
// "Months since" counts calendar months to her latest data, as the AML does; her last CGM reading is later than her last lab.
const [heartEyesFeet] = await queryRows(`
  with as_of as (select max(read_at) as day from cgm_readings where patient_id = 1)
  select (select max_by(value, taken_on) from lab_results where patient_id = 1 and test = 'ldl') as ldl_latest,
         (select max_by(systolic_mmhg, measured_on) from blood_pressure_readings where patient_id = 1) as systolic_latest,
         (select max_by(diastolic_mmhg, measured_on) from blood_pressure_readings where patient_id = 1) as diastolic_latest,
         (select date_diff('month', max(screened_on), (select day from as_of)) from complication_screenings where patient_id = 1 and kind = 'retinal') as months_since_retinal,
         (select date_diff('month', max(screened_on), (select day from as_of)) from complication_screenings where patient_id = 1 and kind = 'foot') as months_since_foot_exam
`);
const [counts] = await queryRows(`
  select (select count(*) from patients) as patients,
         (select count(*) from cgm_readings where patient_id = 1) as cgm_readings,
         (select count(distinct read_at::date) from cgm_readings where patient_id = 1) as cgm_days,
         (select count(*) from insulin_doses where patient_id = 1) as insulin_doses,
         (select count(*) from treatment_events where patient_id = 1) as treatment_events,
         (select count(*) from lab_results where patient_id = 1) as lab_results,
         (select count(*) from lab_results where patient_id = 1 and test = 'hba1c') as lab_hba1c,
         (select min_by(value, taken_on) from lab_results where patient_id = 1 and test = 'hba1c') as hba1c_first,
         (select max_by(value, taken_on) from lab_results where patient_id = 1 and test = 'hba1c') as hba1c_last,
         (select count(*) from blood_pressure_readings where patient_id = 1) as blood_pressure_readings,
         (select count(*) from complication_screenings where patient_id = 1) as complication_screenings,
         (select count(*) from treatment_events where patient_id = 1 and kind = 'cgm_interrupted') as cgm_interruptions,
         (select round(100.0 * count(*) / (14 * 288), 1) from cgm_readings
          where patient_id = 1 and read_at::date > (select max(read_at)::date from cgm_readings where patient_id = 1) - 14) as wear_now
`);
// The basal doses carry out the recorded plans: start at 10 U, +2 U every 3 days, stalled at 18 U until the phone
// review restarted the titration, final dose 24 U.
const [doses] = await queryRows(`
  with daily as (
    select given_at::date as day, units, lag(units) over (order by given_at) as units_before
    from insulin_doses where patient_id = 1 and kind = 'basal'
  ),
  steps as (select day, units, units - lag(units) over (order by day) as step_units, lag(day) over (order by day) as previous_step_day
             from daily where units_before is null or units != units_before),
  restart as (select occurred_on as day, dose_before from treatment_events where patient_id = 1 and kind = 'titration_started')
  select (select count(*) from steps) as basal_steps,
         (select min(units) from steps) as basal_start_units,
         (select max(units) from steps) as basal_final_units,
         (select max(step_units) from steps) as largest_step_units,
         -- The first step after the phone review counts from the review itself.
         (select max(day - greatest(previous_step_day, (select day from restart))) from steps where day > (select day from restart)) as restart_days_between_steps,
         (select units from daily where day = (select day from restart)) as units_on_restart_day,
         (select dose_before from restart) as restart_dose_before,
         (select count(*) from treatment_events where patient_id = 1 and kind = 'drug_stopped' and drug_class = 'sulfonylurea'
          and occurred_on = (select min(day) from daily)) as sulfonylurea_stopped_at_basal_start,
         (select count(*) from treatment_events where lowers_glucose and drug is null) as glucose_changes_without_drug,
         (select count(distinct patient_id) from treatment_events where kind = 'drug_started' and lowers_glucose) as patients_with_glucose_treatment
`);
// Tomas wore his sensor on 6 of his last 14 days; Vera has no CGM. Both have one recent lab HbA1c.
const [fallbackPatients] = await queryRows(`
  select (select count(distinct read_at::date) from cgm_readings where patient_id = 2) as tomas_cgm_days,
         (select count(*) from cgm_readings where patient_id = 3) as vera_cgm_readings,
         (select max_by(value, taken_on) from lab_results where patient_id = 2 and test = 'hba1c') as tomas_hba1c,
         (select count(*) from treatment_events where patient_id = 2 and drug_class = 'statin') as tomas_statin_events,
         (select max_by(value, taken_on) from lab_results where patient_id = 3 and test = 'hba1c') as vera_hba1c
`);
// Sofia is the well-controlled patient: steady CGM, normal labs, screenings up to date.
const [sofia] = await queryRows(`
  with last_day as (select max(read_at)::date as day from cgm_readings where patient_id = 4)
  select (select count(distinct read_at::date) from cgm_readings where patient_id = 4) as sofia_cgm_days,
         (select round(100.0 * count_if(glucose_mgdl between 70 and 180) / count(*), 1) from cgm_readings, last_day
          where patient_id = 4 and read_at::date > last_day.day - 14) as sofia_tir_now,
         (select count_if(glucose_mgdl < 70) from cgm_readings where patient_id = 4) as sofia_low_readings,
         (select round(3.31 + 0.02392 * avg(glucose_mgdl), 2) from cgm_readings, last_day
          where patient_id = 4 and read_at::date > last_day.day - 14) as sofia_gmi_now,
         (select max_by(value, taken_on) from lab_results where patient_id = 4 and test = 'egfr') as sofia_egfr,
         (select max_by(value, taken_on) from lab_results where patient_id = 4 and test = 'ldl') as sofia_ldl,
         (select count(*) from complication_screenings where patient_id = 4) as sofia_screenings,
         (select count(*) from blood_pressure_readings where patient_id = 4) as sofia_visits,
         (select max_by(value, taken_on) from lab_results where patient_id = 4 and test = 'hba1c') as sofia_hba1c,
         (select max_by(l.value, l.taken_on) from lab_results l, treatment_events t
          where l.patient_id = 4 and l.test = 'hba1c' and t.patient_id = 4 and t.drug = 'Semaglutide' and l.taken_on <= t.occurred_on) as sofia_hba1c_at_semaglutide,
         (select round(100.0 * count(*) / (14 * 288), 1) from cgm_readings, last_day
          where patient_id = 4 and read_at::date > last_day.day - 14) as sofia_wear_now
`);
// Rafael is on the older / high-risk targets (time in range at least 50%, below range under 1%; ADA 2026 Table 13.2):
// on target in every 14-day window of her CGM month, under the standard 70% throughout.
const [rafael] = await queryRows(`
  with days as (select distinct read_at::date as day from cgm_readings where patient_id = 5),
  windows as (
    select days.day,
           100.0 * count_if(glucose_mgdl between 70 and 180) / count(*) as tir,
           100.0 * count_if(glucose_mgdl < 70) / count(*) as tbr,
           100.0 * count_if(glucose_mgdl < 70 and hour(read_at) < 6) / count_if(hour(read_at) < 6) as overnight_tbr
    from days, cgm_readings c
    where c.patient_id = 5 and c.read_at::date between days.day - 13 and days.day
    group by days.day having days.day >= (select min(day) from days) + 13
  )
  select (select glucose_target_set from patients where id = 5) = 'older_high_risk' as rafael_older_targets,
         (select count(distinct read_at::date) from cgm_readings where patient_id = 5) as rafael_cgm_days,
         round(min(tir), 1) as rafael_tir_min, round(max(tir), 1) as rafael_tir_max,
         round(max(tbr), 2) as rafael_tbr_max, round(max(overnight_tbr), 2) as rafael_overnight_tbr_max,
         (select max_by(value, taken_on) from lab_results where patient_id = 5 and test = 'hba1c') as rafael_hba1c,
         (select max_by(value, taken_on) from lab_results where patient_id = 5 and test = 'egfr') as rafael_egfr,
         (select max_by(value, taken_on) from lab_results where patient_id = 5 and test = 'uacr') as rafael_uacr,
         (select max_by(value, taken_on) from lab_results where patient_id = 5 and test = 'ldl') as rafael_ldl,
         (select max_by(systolic_mmhg, measured_on) from blood_pressure_readings where patient_id = 5) as rafael_systolic,
         (select max(systolic_mmhg) from blood_pressure_readings where patient_id = 5) as rafael_systolic_max,
         (select count(*) from blood_pressure_readings where patient_id = 5) as rafael_visits,
         (select min_by(value, taken_on) from lab_results where patient_id = 5 and test = 'egfr') as rafael_egfr_first,
         (select count(*) from lab_results where patient_id = 5 and test = 'egfr') as rafael_egfr_tests,
         (select count(*) from treatment_events where patient_id = 5 and drug = 'Insulin glargine' and kind = 'dose_changed' and dose_after < dose_before) as rafael_dose_cuts,
         (select count(*) from insulin_doses where patient_id = 5) as rafael_insulin_doses
  from windows
`);

// Targets come from the mockup's story: https://claude.ai/artifact/G2jbmeSjcZbqARJAVBMrHM
const expectations = [
  // The higher dose fixed the mornings, so time in range rose; glucose is "Act now" through the night lows alone.
  ['tir_now', windowStats.tir_now, 74, 78],
  ['tbr_now', windowStats.tbr_now, 5, 7],
  // The 14 days before the titration restart, on a steady 18 U (7–20 Aug): mornings high.
  ['tir_before', windowStats.tir_before, 65, 69],
  // The titration raised time in range by at least tir_meaningful_change_pts (5), so the report reads "A meaningful change".
  ['tir_gain', Math.round(10 * (windowStats.tir_now - windowStats.tir_before)) / 10, 5, 12],
  ['tbr_before', windowStats.tbr_before, 0.5, 3],
  ['agp_0300_now', windowStats.agp_0300_now, 80, 95],
  ['agp_0300_before', windowStats.agp_0300_before, 120, 140],
  ['low_nights_now', windowStats.low_nights_now, 9, 12],
  ['low_nights_before', windowStats.low_nights_before, 2, 4],
  ['fasting_low_minus_normal_after', mornings.fasting_low_minus_normal_after, -60, -5],
  ['fasting_after_minus_before', mornings.fasting_after_minus_before, -80, -5],
  // With ~30 low nights against ~15 normal ones, 08:00 means differ by up to ±15 from noise alone; a rebound added +33 to +41.
  ['at_0800_low_minus_normal_after', mornings.at_0800_low_minus_normal_after, -60, 20],
  ['egfr_first', kidneys.egfr_first, 74, 74],
  ['egfr_latest', kidneys.egfr_latest, 58, 58],
  ['uacr_latest', kidneys.uacr_latest, 42, 42],
  // Rapid decline (under -5 a year) only with this month's eGFR, so today's visit is the first with kidneys at "Act now".
  ['egfr_slope_per_year', kidneys.egfr_slope_per_year, -7, -5.5],
  ['egfr_slope_per_year_before_latest', kidneys.egfr_slope_per_year_before_latest, -4.5, 0],
  // Repeat UACRs scatter (CVw ~30%): one raised result (38, Oct 2025) before 2 of 3 confirm her albuminuria, in Jan 2026.
  ['uacr_last_3_median', kidneys.uacr_last_3_median, 37, 37],
  ['uacr_single_raised_before_ckd', kidneys.uacr_single_raised_before_ckd, 1, 1],
  ['ldl_latest', heartEyesFeet.ldl_latest, 102, 102],
  ['systolic_latest', heartEyesFeet.systolic_latest, 128, 128],
  ['diastolic_latest', heartEyesFeet.diastolic_latest, 78, 78],
  ['months_since_retinal', heartEyesFeet.months_since_retinal, 15, 15],
  ['months_since_foot_exam', heartEyesFeet.months_since_foot_exam, 8, 8],
  ['patients', counts.patients, 5, 5],
  // Day 420 (CGM start) to day 727 (today) is 308 days, minus the 10-day sensor gap. Within those days, warm-ups,
  // early sensor failures and signal loss leave readings missing, as in real CGM data.
  ['cgm_days', counts.cgm_days, 298, 298],
  ['cgm_readings', counts.cgm_readings, Math.round(0.9 * 298 * 288), Math.round(0.99 * 298 * 288)],
  ['wear_now', counts.wear_now, 90, 99],
  ['cgm_interruptions', counts.cgm_interruptions, 1, 1],
  ['insulin_doses', counts.insulin_doses, 308, 308],
  // Metformin, ramipril, atorvastatin and gliclazide before the data; the statin and ACE inhibitor raised at week 25;
  // gliclazide stopped and basal started; CGM start; the sensor gap's start and end; the titration restart.
  ['treatment_events', counts.treatment_events, 12, 12],
  ['basal_steps', doses.basal_steps, 8, 8],
  ['basal_start_units', doses.basal_start_units, 10, 10],
  ['basal_final_units', doses.basal_final_units, 24, 24],
  ['largest_step_units', doses.largest_step_units, 2, 2],
  ['restart_days_between_steps', doses.restart_days_between_steps, 3, 3],
  ['units_on_restart_day', doses.units_on_restart_day, 18, 18],
  ['restart_dose_before', doses.restart_dose_before, 18, 18],
  ['sulfonylurea_stopped_at_basal_start', doses.sulfonylurea_stopped_at_basal_start, 1, 1],
  ['glucose_changes_without_drug', doses.glucose_changes_without_drug, 0, 0],
  ['patients_with_glucose_treatment', doses.patients_with_glucose_treatment, 5, 5],
  // Quarterly eGFR + UACR + LDL over two years plus the baseline draw just before day 0 (27),
  // and HbA1c at every one of those visits (9).
  ['lab_results', counts.lab_results, 36, 36],
  ['lab_hba1c', counts.lab_hba1c, 9, 9],
  ['hba1c_first', counts.hba1c_first, 8.4, 8.4],
  ['hba1c_last', counts.hba1c_last, 6.8, 6.8],
  ['blood_pressure_readings', counts.blood_pressure_readings, 9, 9],
  ['complication_screenings', counts.complication_screenings, 5, 5],
  ['tomas_cgm_days', fallbackPatients.tomas_cgm_days, 6, 6],
  ['tomas_hba1c', fallbackPatients.tomas_hba1c, 7.4, 7.4],
  // Tomas (47) is on no statin: the care gap the "No statin" flag catches.
  ['tomas_statin_events', fallbackPatients.tomas_statin_events, 0, 0],
  ['vera_cgm_readings', fallbackPatients.vera_cgm_readings, 0, 0],
  ['vera_hba1c', fallbackPatients.vera_hba1c, 8.6, 8.6],
  ['sofia_cgm_days', sofia.sofia_cgm_days, 30, 30],
  ['sofia_wear_now', sofia.sofia_wear_now, 90, 99],
  ['sofia_tir_now', sofia.sofia_tir_now, 90, 100],
  ['sofia_gmi_now', sofia.sofia_gmi_now, 6, 6.9],
  ['sofia_low_readings', sofia.sofia_low_readings, 0, 0],
  ['sofia_egfr', sofia.sofia_egfr, 94, 94],
  ['sofia_ldl', sofia.sofia_ldl, 82, 82],
  // Quarterly visits for two years; an annual review (lipids, retinal and foot exams) every fourth.
  ['sofia_visits', sofia.sofia_visits, 9, 9],
  ['sofia_screenings', sofia.sofia_screenings, 6, 6],
  // Semaglutide was added at the visit whose HbA1c was over 7.0%; on it she reaches 6.6%, near her CGM's GMI (6.7%).
  ['sofia_hba1c_at_semaglutide', sofia.sofia_hba1c_at_semaglutide, 7.6, 7.6],
  ['sofia_hba1c', sofia.sofia_hba1c, 6.6, 6.6],
  ['rafael_older_targets', Number(rafael.rafael_older_targets), 1, 1],
  ['rafael_cgm_days', rafael.rafael_cgm_days, 30, 30],
  ['rafael_tir_min', rafael.rafael_tir_min, 50, 70],
  ['rafael_tir_max', rafael.rafael_tir_max, 50, 65],
  ['rafael_tbr_max', rafael.rafael_tbr_max, 0, 0.99],
  ['rafael_overnight_tbr_max', rafael.rafael_overnight_tbr_max, 0, 0.99],
  // GMI over her report is about 7.4%; the lab HbA1c sits close by, under her 8.0% target and over the standard 7.0%.
  ['rafael_hba1c', rafael.rafael_hba1c, 7.5, 7.5],
  // CKD G3b, A1: kidneys "Review" (CKD), not "Act now" (no albuminuria, eGFR over 30).
  ['rafael_egfr', rafael.rafael_egfr, 42, 42],
  ['rafael_uacr', rafael.rafael_uacr, 18, 18],
  ['rafael_ldl', rafael.rafael_ldl, 66, 66],
  // Under 130/80, her goal on the older / high-risk targets (ADA 2026 Table 13.2), at every visit.
  ['rafael_systolic', rafael.rafael_systolic, 124, 124],
  ['rafael_systolic_max', rafael.rafael_systolic_max, 120, 129],
  ['rafael_visits', rafael.rafael_visits, 9, 9],
  // eGFR twice a year (KDIGO 2024, G3b A1), 47 → 42: about −2.5 a year, under the −5 of rapid decline.
  ['rafael_egfr_first', rafael.rafael_egfr_first, 47, 47],
  ['rafael_egfr_tests', rafael.rafael_egfr_tests, 5, 5],
  ['rafael_dose_cuts', rafael.rafael_dose_cuts, 1, 1],
  ['rafael_insulin_doses', rafael.rafael_insulin_doses, 30, 30],
];
let failed = 0;
for (const [name, actual, min, max] of expectations) {
  const ok = Number(actual) >= min && Number(actual) <= max;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(24)} ${String(actual).padStart(7)}   expected ${min === max ? min : `${min}–${max}`}`);
}
connection.closeSync();
process.exit(failed ? 1 : 0);
