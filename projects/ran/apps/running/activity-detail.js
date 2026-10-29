// The activity detail, shared by the Activities page and the Overview: a modal with the route map,
// the key numbers, Ran's take, the pace / heart-rate chart and the analysis tabs (splits & laps,
// effort, pace and heart-rate zones, the lap table). Its styles are in activity-detail.css; the
// page loads ECharts and Leaflet.
//   const detailView = Run.activityDetail(app, { dataset: 'running', nav: { rows, hasMore, more } })
//   detailView.open(id)
// `onClose` runs when the modal closes (a page with its own modal underneath keeps the page from scrolling).
// `nav` is the list the page opens activities from, for ‹ ›: rows() with an `id` each, hasMore() and
// more() (fetch the next page). The modal's queries are declared on the first open, so per-second
// data is never queried unfiltered.
/* global Run, L, echarts */
(function () {
  const MARKUP = `
<div class="backdrop" id="backdrop" aria-hidden="true">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="d-name" data-anfra-container="modal" data-anfra-label="Activity detail">
    <div class="modal-head">
      <div data-anfra-block="detail-title" data-anfra-label="Title" data-anfra-query="detail" data-anfra-control="activityId">
        <h2 id="d-name"></h2>
        <div id="d-when" class="small muted"></div>
      </div>
      <div class="modal-nav">
        <button id="prev" type="button" title="Previous (←)">‹</button>
        <button id="next" type="button" title="Next (→)">›</button>
        <button id="close" type="button" title="Close (Esc)" aria-label="Close">×</button>
      </div>
    </div>
    <div class="modal-body">
      <div class="hero" id="hero" data-anfra-block="route" data-anfra-label="Route map" data-anfra-query="samples">
        <div id="map"></div>
        <div class="map-tools" role="group" aria-label="Colour the route by">
          <button type="button" data-colour="plain" aria-pressed="true">Route</button>
          <button type="button" data-colour="pace" aria-pressed="false">Pace</button>
          <button type="button" data-colour="hr" aria-pressed="false">Heart rate</button>
        </div>
        <div class="map-legend" id="map-legend" hidden></div>
        <div class="map-readout" id="map-readout" hidden></div>
      </div>

      <div class="headline" id="d-headline" data-anfra-block="detail-stats" data-anfra-label="Key numbers" data-anfra-query="detail"></div>

      <div class="take" id="take" data-anfra-block="take" data-anfra-label="Ran's take" data-anfra-query="detail run_plan run_context heat_param run_efforts">
        <div class="take-head"><span class="take-icon" aria-hidden="true">✦</span><b>Ran's take</b></div>
        <p id="take-text" data-skeleton style="--sk-h:40px"></p>
        <div class="chips" id="take-chips"></div>
      </div>

      <div class="run-efforts" id="d-efforts" data-anfra-block="run-efforts" data-anfra-label="Best efforts in this run" data-anfra-query="run_efforts" hidden></div>

      <div class="section streams" id="streams-wrap" data-anfra-block="streams" data-anfra-label="Pace, HR, elevation" data-anfra-query="samples">
        <div id="samples-chart"></div>
        <div class="note" id="streams-note">Pace smoothed over 15 s. Hover the map or the chart: both follow.</div>
      </div>

      <div class="section analysis" data-anfra-block="analysis" data-anfra-label="Analysis" data-anfra-query="laps samples hr_zones detail">
        <div class="tabs" role="tablist" aria-label="Analysis">
          <button type="button" role="tab" data-tab="splits" aria-selected="true">Splits &amp; laps</button>
          <button type="button" role="tab" data-tab="effort" aria-selected="false">Effort</button>
          <button type="button" role="tab" data-tab="pacezones" aria-selected="false">Pace zones</button>
          <button type="button" role="tab" data-tab="hrzones" aria-selected="false">Heart rate</button>
          <button type="button" role="tab" data-tab="laptable" aria-selected="false">Lap table</button>
        </div>
        <div class="tab" data-panel="splits">
          <div class="seg-row">
            <div class="seg" role="group" aria-label="Bars"><button type="button" data-bars="splits" aria-pressed="true">Splits (km)</button><button type="button" data-bars="laps" aria-pressed="false">Laps</button></div>
            <div class="seg" role="group" aria-label="Measure"><button type="button" data-measure="pace" aria-pressed="true">Pace</button><button type="button" data-measure="gap" aria-pressed="false">GAP</button></div>
          </div>
          <div id="bars-chart"></div>
          <div class="note">Each bar is a split or lap, as wide as its distance and as tall as its speed. GAP = grade-adjusted pace: the flat-ground equivalent. Hover a bar to see it on the map.</div>
        </div>
        <div class="tab" data-panel="effort" hidden>
          <div class="effort">
            <div class="re">
              <div class="t">Relative effort <span class="muted small" title="TRIMP: training load from your heart rate, minute by minute (Banister). Comparable across runs, rides and gym sessions.">ⓘ</span></div>
              <div class="big" id="re-value"></div>
              <p id="re-text"></p>
            </div>
            <div class="we">
              <div class="we-head">
                <div><div class="t">Weekly effort</div><div class="small muted" id="we-dates"></div></div>
                <div class="we-days" id="we-days" aria-label="Effort per day"></div>
                <div><div class="big2" id="we-value"></div><div class="we-verdict" id="we-verdict"></div><div class="small muted" id="we-sub"></div></div>
              </div>
              <div id="we-chart"></div>
              <table class="we-list"><tbody id="we-list"></tbody></table>
            </div>
          </div>
        </div>
        <div class="tab" data-panel="pacezones" hidden>
          <table class="zt" id="pz-table"></table>
          <div class="note" id="pz-note"></div>
        </div>
        <div class="tab" data-panel="hrzones" hidden>
          <table class="zt hr" id="hz-table"></table>
          <div class="note" id="hz-note"></div>
        </div>
        <div class="tab" data-panel="laptable" hidden>
          <div class="lap-filter" id="lap-filter" role="group" aria-label="Show laps of type"></div>
          <div class="lap-sum" id="lap-sum"></div>
          <div class="table-wrap">
            <table class="laps">
              <thead><tr>
                <th>#</th><th class="l">Type</th><th>Distance</th><th>Time</th><th>Pace</th><th>GAP</th>
                <th>Avg HR</th><th>Max HR</th><th>Cadence</th><th>Stride</th><th>Elev +/−</th>
              </tr></thead>
              <tbody id="laps-body"></tbody>
            </table>
          </div>
          <div class="note">Type is detected from each lap: its grade-adjusted pace against your threshold pace that day, its length and its place in the session (Garmin's own warm-up, cool-down and rest marks are kept). Back-to-back hard laps count as one effort: under 10 min it is an interval, 10 min+ (or 5 min+ at a comfortably hard pace) a tempo. Rest: a stop or slow jog between work laps. Warm-up and cool-down: easy laps before the first and after the last work lap.</div>
        </div>
      </div>

      <details class="fold section" id="all-numbers">
        <summary><b>All numbers</b> <span class="muted">· running form, training effect, VO2max, weather, fitness markers</span></summary>
        <div class="stats" id="d-stats" data-anfra-block="detail-more" data-anfra-label="All numbers" data-anfra-query="detail"></div>
      </details>

      <div data-anfra-block="race-marker" data-anfra-label="Race" data-anfra-query="detail" class="section">
        <div class="race-bar" id="race-bar"></div>
      </div>
      <div id="detail-status" class="status"></div>
    </div>
  </div>
</div>
`;

  function activityDetail (app, { dataset, nav = { rows: () => [], hasMore: () => false, more: async () => {} }, onClose }) {
    const { num, fmt0, fmt1, fmt2, pace, paceFromSpeed, duration, or, localWhen, esc, css, axisBase, dash } = Run;
    const $ = (id) => document.getElementById(id);
    const isTrue = (v) => v === true || v === 'true' || v === 1 || v === '1';
    const changed = Run.changeTracker();
    const logFirst = Run.logFirstResults();
    document.body.insertAdjacentHTML('beforeend', MARKUP);

    // ---------- detail (declared on first open, so per-second data is never queried unfiltered) ----------
    let activityId, detail, samples, laps, runEfforts, hrZones, planDay, runPlan, context, runContext;
    // the heat coefficient fitted on your runs (Overview → Model evidence): % slower per °C WBGT around your usual heat
    const heatParam = app.createQuery('heat_param', { dataset, aql: `
      explore {
        dimensions { name: model_param.name, value: model_param.value }
        filters { model_param.name in ["heat_pct_per_c", "heat_ref_wbgt_c"] }
      }` });
    function ensureDetailQueries () {
      if (laps) return;
      activityId = app.createFilter('activityId', { dataset, field: 'activity.activity_id', label: 'Activity' });
      runEfforts = app.createQuery('run_efforts', { dataset, aql: `
        explore {
          dimensions {
            km: best_effort.distance_km, label: best_effort.distance_label, time: best_effort.time_s,
            pace: best_effort.pace_s_per_km, start_m: best_effort.start_m, pb: best_effort.is_pb,
            rank: best_effort.rank_all, indoor: best_effort.is_indoor
          }
          sorts { km asc }
        }` });
      app.mapControl(activityId, runEfforts, { field: 'best_effort.activity_id' });
      detail = app.createQuery('detail', { dataset, aql: `
        explore {
          dimensions {
            id: activity.activity_id, name: activity.activity_name, started: activity.start_label,
            kind: activity.activity_type, place: activity.location_name,
            km: activity.distance_km, secs: activity.duration_s, moving: activity.moving_s, elapsed: activity.elapsed_s,
            pace: activity.pace_s_per_km, gap_speed: activity.avg_gap_speed_mps,
            hr: activity.avg_hr, max_hr: activity.max_hr, cadence: activity.avg_cadence_spm,
            elev: activity.elevation_gain_m, elev_loss: activity.elevation_loss_m, load: activity.training_load, trimp: activity_load.trimp, trimp_src: activity_load.load_source,
            aerobic: activity.aerobic_te, anaerobic: activity.anaerobic_te, te: activity.te_label,
            vo2max: activity.vo2max, vo2e: activity.vo2_effective, kcal: activity.calories,
            stride: activity.avg_stride_cm, gct: activity.avg_gct_ms, vosc: activity.avg_vert_osc_cm, power: activity.avg_power_w,
            temp_min: activity.min_temp_c, temp_max: activity.max_temp_c,
            z1: activity.hr_z1_s, z2: activity.hr_z2_s, z3: activity.hr_z3_s, z4: activity.hr_z4_s, z5: activity.hr_z5_s,
            is_race: activity.is_race, race_id: activity.race_id, race_name: activity.race_name,
            race_km: activity.race_distance_km, race_time: activity.race_time_s, race_priority: activity.race_priority, race_goal: activity.race_goal_time_s,
            is_workout: activity.is_workout, easy_ref: activity_marker.easy_hr_ref, easy_pace: activity_marker.easy_hr_pace_s_per_km,
            lt_ref: activity_marker.lthr_ref, lt_pace: activity_marker.lthr_pace_s_per_km, decoupling: activity_marker.decoupling_pct,
            second_half: activity_marker.second_half_pct, reps: activity_marker.rep_count, rep_cv: activity_marker.rep_pace_cv_pct,
            rep_fade: activity_marker.rep_fade_pct,
            maybe_race: activity.is_race_candidate, std_km: activity.standard_distance_km,
            date: activity.start_date, start_local: activity.start_time_local, is_run: activity.is_run, sport: activity.sport, wbgt: activity.wbgt_c, laps_n: activity.lap_count,
            tsb_morning: day.tsb_morning, sleep_s: day.sleep_s, sleep_score: day.sleep_score, rhr_up: day.flag_resting_hr,
            easy_usual: day.easy_hr_pace_s_per_km, lt_pace_day: day.lt_pace_s_per_km, lt_own_day: day.lt_pace_own_s_per_km
          }
        }` });
      // Garmin's heart-rate zones for this run: bpm range and time in each.
      hrZones = app.createQuery('hr_zones', { dataset, aql: `
        explore {
          dimensions { zone: activity_hr_zone.zone, low: activity_hr_zone.low_bpm, high: activity_hr_zone.high_bpm }
          measures { secs: activity_hr_zone.time_s }
          sorts { zone asc }
        }` });
      app.mapControl(activityId, hrZones, { field: 'activity_hr_zone.activity_id' });
      // The saved plan for the run's date (set once the run's date is known), goal race first.
      planDay = app.createFilter('planDay', { dataset, field: 'plan_day.day', label: 'Plan day',
        default: { operator: 'is', values: ['1900-01-01'] } });
      runPlan = app.createQuery('run_plan', { dataset, aql: `
        explore {
          dimensions {
            race: race.name, race_date: race.race_date, priority: race.priority, session: plan_day.session,
            km: plan_day.km_est, minutes: plan_day.min_est, target_pace: plan_day.target_pace_s_per_km,
            status: plan_day.status, vs_target: plan_day.pace_vs_target_s, done_km: plan_day.done_km, done_id: plan_day.done_activity_id
          }
          sorts { priority asc, race_date asc }
        }` });
      app.mapControl(planDay, runPlan, { field: 'plan_day.day' });
      // Activities (all sports) of the 16 weeks to the end of the run's week: streaks, the week so far,
      // the usual for this kind of run, and weekly effort against its range.
      context = app.createFilter('context', { dataset, field: 'activity.start_date', label: 'Run context',
        default: { operator: 'between', values: ['1900-01-01', '1900-01-02'] } });
      runContext = app.createQuery('run_context', { dataset, aql: `
        explore {
          dimensions {
            id: activity.activity_id, date: activity.start_date, started: activity.start_time_local, te: activity.te_label,
            name: activity.activity_name, sport: activity.sport, is_run: activity.is_run,
            km: activity.distance_km, secs: activity.duration_s, pace: activity.pace_s_per_km, hr: activity.avg_hr, trimp: activity_load.trimp
          }
          sorts { started asc }
        }` });
      app.mapControl(context, runContext, { field: 'activity.start_date' });
      samples = app.createQuery('samples', { dataset, aql: `
        explore {
          dimensions {
            seq: activity_sample.seq, el: activity_sample.elapsed_s, dist: activity_sample.distance_m, hr: activity_sample.heart_rate,
            speed: activity_sample.speed_mps, gap: activity_sample.grade_adj_speed_mps,
            elev: activity_sample.elevation_m, cad: activity_sample.cadence_spm,
            lat: activity_sample.latitude, lon: activity_sample.longitude
          }
          sorts { seq asc }
        }` });
      laps = app.createQuery('laps', { dataset, aql: `
        explore {
          dimensions {
            lap_no: lap.lap_index, intensity: lap.intensity_type, step: lap.workout_step, km: lap.distance_km, secs: lap.duration_s,
            pace: lap.pace_s_per_km, gap_speed: lap.avg_gap_speed_mps, hr: lap.avg_hr, max_hr: lap.max_hr,
            cadence: lap.avg_cadence_spm, stride: lap.stride_cm, gain: lap.elevation_gain_m, loss: lap.elevation_loss_m
          }
          sorts { lap_no asc }
        }` });
      app.mapControl(activityId, detail, { field: 'activity.activity_id' });
      app.mapControl(activityId, samples, { field: 'activity_sample.activity_id' });
      app.mapControl(activityId, laps, { field: 'lap.activity_id' });
    }

    // ---------- modal ----------
    const backdrop = $('backdrop');
    let openId = null;
    let opener = null;   // where focus goes back when the modal closes
    function openActivity (id) {
      if (!openId) opener = document.activeElement;
      openId = id;
      ensureDetailQueries();
      activityId.setCondition({ operator: 'is', values: [String(id)] });
      backdrop.classList.add('open');
      backdrop.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      updateNav();
      app.execute();
      $('close').focus();
    }
    function closeModal () {
      openId = null;
      opener?.focus?.();
      backdrop.classList.remove('open');
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      detail?.abort(); samples?.abort(); laps?.abort();
      clearFocus();
      onClose?.();
    }
    // ‹ › step through the list the page opened the activity from
    function neighbours () {
      const rows = nav.rows();
      const i = rows.findIndex((r) => String(r.id) === String(openId));
      return { rows, i };
    }
    function updateNav () {
      const { rows, i } = neighbours();
      $('prev').disabled = i <= 0;
      $('next').disabled = i < 0 || (i >= rows.length - 1 && !nav.hasMore());
    }
    async function step (delta) {
      let { rows, i } = neighbours();
      if (i < 0) return;
      if (i + delta >= rows.length && nav.hasMore()) {
        await nav.more().catch((err) => console.error(err));
        ({ rows, i } = neighbours());
      }
      const target = rows[i + delta];
      if (target) openActivity(target.id);
    }

    let contextDay = null;
    const shiftDay = (day, n) => { const t = new Date(`${day}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
    const isDay = (v, day) => String(v ?? '').slice(0, 10) === day;

    function renderDetail () {
      if (!detail || !samples || !laps || !openId) return;
      const failed = [detail, samples, laps].find((q) => q.state === 'error');
      const loading = detail.state === 'executing' && !detail.result;
      const st = $('detail-status');
      st.textContent = failed ? `Couldn't load: ${failed.error.message}` : loading ? 'Loading…' : '';
      st.classList.toggle('visible', !!failed || loading);
      st.classList.toggle('error', !!failed);

      // each query's new result, read once per render
      const fresh = Object.fromEntries([detail, samples, laps, runEfforts, hrZones, runPlan, runContext, heatParam].map((q) => [q.name, changed(q)]));
      const d = detail.result?.rows[0];
      if (d && fresh.detail) {
        currentDetail = d;
        renderRaceMarker();
        $('d-name').textContent = d.name ?? 'Activity';
        $('d-when').textContent = `${localWhen(d.started)}${d.place ? ` · ${d.place}` : ''} · ${(d.kind ?? '').replaceAll('_', ' ')}`;
        // the run's date drives its plan and its context (the runs of the 8 weeks before)
        const day = String(d.date ?? '').slice(0, 10);
        if (day && day !== contextDay) {
          contextDay = day;
          planDay.setCondition({ operator: 'is', values: [day] });
          const dow = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
          context.setCondition({ operator: 'between', values: [shiftDay(day, -dow - 7 * 16), shiftDay(day, 6 - dow)] });
          app.execute();
        }
        renderHeadline(d);
        renderAllNumbers(d);
      }

      if (fresh.run_efforts) {
        // This run's best efforts; PB = faster than every earlier outdoor effort at that distance.
        const rows = runEfforts.result.rows;
        const badge = (e) => isTrue(e.pb) ? ' <span class="pb">PB</span>' : num(e.rank) === 1 ? ' <span class="pb">all-time best</span>' : '';
        $('d-efforts').innerHTML = rows.length
          ? '<span class="muted small">Best efforts</span>' + rows.map((e) =>
            `<span title="Fastest ${esc(e.label)} within this run, from ${fmt2.format(num(e.start_m) / 1000)} km">${esc(e.label)} <b>${duration(e.time)}</b> <span class="muted">${pace(e.pace)} /km</span>${badge(e)}</span>`).join('')
            + (rows.some((e) => isTrue(e.indoor)) ? '<span class="muted small">indoor: not ranked</span>' : '')
          : '';
        $('d-efforts').hidden = !rows.length;
      }

      if (fresh.laps || fresh.detail) renderLaps();

      if (fresh.samples) drawStreams(samples.result.rows);
      if (fresh.samples || fresh.laps) drawBars();
      if (fresh.samples || fresh.detail) renderPaceZones();
      if (fresh.hr_zones || fresh.detail) renderHrZones();
      if (Object.values(fresh).some(Boolean)) { renderTake(); renderEffort(); }
    }

    // ---------- key numbers (always shown) and all numbers (folded) ----------
    const teText = (d) => (d.te ?? '').replaceAll('_', ' ').toLowerCase().replace('aerobic base', 'base').replace('unknown', '');
    function renderHeadline (d) {
      const hasKm = num(d.km) > 0;
      const items = [
        hasKm && ['Distance', fmt2.format(num(d.km)), 'km'],
        hasKm && ['Pace', pace(d.pace), '/km'],
        ['Time', duration(d.secs), ''],
        num(d.elev) !== null && hasKm && ['Elevation', fmt0.format(num(d.elev)), 'm'],
        num(d.hr) !== null && ['Avg heart rate', fmt0.format(num(d.hr)), 'bpm'],
        num(d.trimp) !== null && ['TRIMP', fmt0.format(num(d.trimp)), '', 'Training load from your heart rate (Banister TRIMP): how hard the run was for you'],
        num(d.laps_n) > 1 && ['Laps', fmt0.format(num(d.laps_n)), ''],
        teText(d) && ['Effect', teText(d), '', `Garmin training effect: aerobic ${or(d.aerobic, fmt1.format)}, anaerobic ${or(d.anaerobic, fmt1.format)} (0–5)`, 'effect'],
      ].filter(Boolean);
      $('d-headline').innerHTML = items.map(([l, v, u, t, cls]) => `<div class="h ${cls ?? ''}"${t ? ` title="${esc(t)}"` : ''}>
        <div class="v">${esc(v)}${u ? `<small>${u}</small>` : ''}</div><div class="l">${l}</div></div>`).join('');
    }

    function renderAllNumbers (d) {
      const hasKm = num(d.km) > 0;
      const pct = (v) => `${num(v) > 0 ? '+' : ''}${fmt1.format(num(v))} %`;
      const stats = [
        ['Grade-adj. pace', `${paceFromSpeed(d.gap_speed)} /km`, 'the pace on flat ground for the same effort'],
        ['Max heart rate', `${or(d.max_hr, fmt0.format)} bpm`],
        ['Cadence', num(d.cadence) === null ? dash : `${fmt0.format(num(d.cadence))} spm`],
        ['Stride', num(d.stride) === null ? dash : `${fmt2.format(num(d.stride) / 100)} m`],
        ['Ground contact', num(d.gct) === null ? dash : `${fmt0.format(num(d.gct))} ms`],
        ['Vertical osc.', num(d.vosc) === null ? dash : `${fmt1.format(num(d.vosc))} cm`],
        ['Power', num(d.power) === null ? dash : `${fmt0.format(num(d.power))} W`],
        ['Elevation', num(d.elev) === null ? dash : `+${fmt0.format(num(d.elev))} / −${fmt0.format(num(d.elev_loss) ?? 0)} m`],
        ['Moving / elapsed', `${duration(d.moving)} / ${duration(d.elapsed)}`],
        ['Calories', or(d.kcal, fmt0.format)],
        ['Training effect', num(d.aerobic) === null ? dash : `${fmt1.format(num(d.aerobic))} / ${fmt1.format(num(d.anaerobic) ?? 0)}`, 'aerobic / anaerobic, 0–5'],
        ['Garmin load', or(d.load, fmt0.format), `TRIMP from ${String(d.trimp_src ?? 'samples').replace('_', ' ')}`],
        ['Effective VO2max', or(d.vo2e, fmt1.format), 'Runalyze method on this run: pace against heart rate'],
        ['Garmin VO2max', or(d.vo2max, fmt0.format)],
        ['Temperature', num(d.temp_max) === null ? dash : `${fmt0.format(num(d.temp_min))}–${fmt0.format(num(d.temp_max))} °C`],
        ['WBGT', num(d.wbgt) === null ? dash : `${fmt1.format(num(d.wbgt))} °C`, 'heat stress from temperature and humidity'],
        ['Form that morning', num(d.tsb_morning) === null ? dash : `${num(d.tsb_morning) > 0 ? '+' : ''}${fmt0.format(num(d.tsb_morning))}`, 'TSB before the run: below −10 you started tired'],
        ['Sleep', num(d.sleep_s) === null ? dash : `${duration(num(d.sleep_s)).replace(/:\d\d$/, '')} h${num(d.sleep_score) ? ` · ${fmt0.format(num(d.sleep_score))}` : ''}`],
        // causal-model markers (README): only those this run has
        num(d.easy_pace) !== null && [`Pace @ easy HR ${fmt0.format(num(d.easy_ref))}`, `${pace(d.easy_pace)} /km`, 'median grade-adjusted pace at 77 % HRmax ± 5 bpm, after 10 min'],
        num(d.lt_pace) !== null && [`Pace @ threshold HR ${fmt0.format(num(d.lt_ref))}`, `${pace(d.lt_pace)} /km`, 'median grade-adjusted pace at threshold HR ± 3 bpm, after 10 min'],
        num(d.decoupling) !== null && ['Decoupling', pct(d.decoupling), 'efficiency lost from the first half to the second. Under 5 % = durable'],
        num(d.second_half) !== null && hasKm && ['2nd half vs 1st', pct(d.second_half), 'time of the second half of the distance vs the first. Positive = slowed down'],
        num(d.reps) !== null && ['Main set', `${fmt0.format(num(d.reps))} reps · ±${fmt1.format(num(d.rep_cv))} %`, 'pace spread of the reps of the main set'],
        num(d.rep_fade) !== null && ['Rep fade', pct(d.rep_fade), 'last third of the reps vs the first third. Positive = slowed down'],
      ].filter(Boolean);
      $('d-stats').innerHTML = stats.map(([l, v, t]) => `<div class="stat"${t ? ` title="${esc(t)}"` : ''}><div class="label">${l}</div><div class="value">${esc(v)}</div></div>`).join('');
    }

    // ---------- Ran's take: a written read of the run from its own numbers and its context ----------
    const KIND = { RECOVERY: 'recovery run', AEROBIC_BASE: 'easy run', TEMPO: 'tempo run', LACTATE_THRESHOLD: 'threshold session',
      VO2MAX: 'VO2max session', ANAEROBIC_CAPACITY: 'speed session', SPEED: 'speed session' };
    const SESSION = { easy: 'easy run', long: 'long run', threshold: 'threshold session', intervals: 'interval session', race: 'race', strength: 'strength session' };
    const s0 = (v) => fmt0.format(Math.abs(v));
    const signedNum = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt0.format(Math.abs(v))}`;

    // What the run's context says, as facts with a tone: used by the text and the chips alike.
    function runFacts (d) {
      const day = String(d.date ?? '').slice(0, 10);
      const f = { day };
      const P = Object.fromEntries((heatParam.result?.rows ?? []).map((r) => [r.name, num(r.value)]));
      // heat: the coefficient fitted on your runs, around the heat you usually train in
      if (num(d.wbgt) !== null && P.heat_pct_per_c && P.heat_ref_wbgt_c && num(d.pace)) {
        const diffC = num(d.wbgt) - P.heat_ref_wbgt_c;
        f.heat = { wbgt: num(d.wbgt), ref: P.heat_ref_wbgt_c, diffC, secs: num(d.pace) * P.heat_pct_per_c * diffC / 100 };
      }
      if (num(d.tsb_morning) !== null) f.form = num(d.tsb_morning);
      if (num(d.sleep_s) !== null) f.sleep = { h: num(d.sleep_s) / 3600, score: num(d.sleep_score) };
      f.rhrUp = isTrue(d.rhr_up);
      // efficiency: pace at easy heart rate against your 28-day norm on that date (negative = faster)
      if (num(d.easy_pace) !== null && num(d.easy_usual) !== null) f.eff = num(d.easy_pace) - num(d.easy_usual);
      // hills: what the climbing cost, from pace against grade-adjusted pace
      if (num(d.gap_speed) && num(d.pace) && num(d.km) > 0) f.hills = { secs: num(d.pace) - 1000 / num(d.gap_speed), perKm: (num(d.elev) ?? 0) / num(d.km) };
      // plan: the row this run did, goal race first
      if (isTrue(d.is_run) && runPlan.result && runPlan.state !== 'executing' && contextDay === day) {
        const rows = runPlan.result.rows;
        f.plan = rows.find((r) => String(r.done_id) === String(d.id)) ?? rows[0] ?? null;
      }
      // context: runs of the 8 weeks up to this one
      if (runContext.result && runContext.state !== 'executing' && contextDay === day) {
        const runs = runContext.result.rows.filter((r) => isTrue(r.is_run) && String(r.date).slice(0, 10) >= shiftDay(day, -56)
          && (String(r.started) <= String(d.start_local) || String(r.id) === String(d.id)));
        const days = new Set(runs.map((r) => String(r.date).slice(0, 10)));
        let streak = 0;
        while (days.has(shiftDay(day, -streak))) streak++;
        const dow = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
        const week = runs.filter((r) => String(r.date).slice(0, 10) >= shiftDay(day, -dow));
        const same = runs.filter((r) => r.te === d.te && String(r.id) !== String(d.id) && num(r.pace) && num(r.hr));
        const mid = (xs) => { const v = xs.slice().sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
        f.ctx = { streak, weekRuns: week.length, weekKm: week.reduce((s, r) => s + (num(r.km) ?? 0), 0) };
        if (same.length >= 3) f.same = { n: same.length, pace: mid(same.map((r) => num(r.pace))), hr: mid(same.map((r) => num(r.hr))) };
      }
      f.pb = (runEfforts.result?.rows ?? []).filter((e) => isTrue(e.pb));
      return f;
    }

    function renderTake () {
      const d = currentDetail;
      if (!d || String(d.id) !== String(openId)) return;
      const f = runFacts(d);
      const isRace = isTrue(d.is_race), reps = num(d.reps), km = num(d.km) ?? 0;
      const long = km >= 18 || (num(d.secs) >= 5400 && ['RECOVERY', 'AEROBIC_BASE', 'TEMPO'].includes(d.te));
      // the plan's name for the session when there is one, else what the run itself shows
      const planned = f.plan && f.plan.session !== 'rest' && f.plan.status !== 'extra' ? SESSION[f.plan.session] : null;
      const OTHER = { Strength: 'strength session', Cycling: 'ride', 'Walking & hiking': 'walk' };
      const kind = !isTrue(d.is_run) ? OTHER[d.sport] ?? 'workout' : isRace ? 'race' : reps >= 3 ? `interval session (${fmt0.format(reps)} reps)` : planned ?? (long ? 'long run' : KIND[d.te] ?? 'run');
      const hour = Number(String(d.start_local ?? '').slice(11, 13));
      const when = hour < 11 ? 'morning' : hour < 14 ? 'midday' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

      // how it went, scored for the opening word
      let good = 0, bad = 0, tough = 0;
      if (f.eff !== undefined) { if (f.eff <= -5) good++; if (f.eff >= 8) bad++; }
      if (num(d.decoupling) !== null) { if (num(d.decoupling) < 5) good++; else if (num(d.decoupling) > 8) bad++; }
      if (num(d.rep_fade) !== null) { if (num(d.rep_fade) <= 3) good++; else if (num(d.rep_fade) > 5) bad++; }
      if (f.plan?.status === 'done') good++;
      if (f.heat && f.heat.diffC >= 1.5) tough++;
      if (f.form !== undefined && f.form < -20) tough++;
      if (f.sleep && (f.sleep.h < 6 || (f.sleep.score && f.sleep.score < 60))) tough++;
      if (f.hills && f.hills.perKm >= 15) tough++;
      const word = f.pb.length ? 'Breakthrough' : good >= 2 && bad === 0 ? 'Strong' : tough && bad <= good ? 'Gritty' : bad > good ? 'Tough' : 'Solid';

      // 1. what it was and how it was run
      let how = '';
      if (num(d.rep_fade) !== null) {
        how = num(d.rep_fade) <= 3 ? `, with even reps from first to last (±${fmt1.format(num(d.rep_cv) ?? 0)} %)` : `, though your reps faded ${fmt1.format(num(d.rep_fade))} % by the end`;
      } else if (num(d.decoupling) !== null) {
        how = num(d.decoupling) < 5 ? ` — pace and heart rate stayed together to the end (${fmt1.format(num(d.decoupling))} % drift)`
          : ` — your heart rate drifted ${fmt1.format(num(d.decoupling))} % in the second half, so this distance is still building`;
      } else if (num(d.second_half) !== null && num(d.second_half) < -2) {
        how = `, finishing with a negative split (second half ${fmt1.format(-num(d.second_half))} % faster)`;
      } else if (f.same && num(d.pace) && num(d.hr)) {
        const dp = num(d.pace) - f.same.pace, dh = num(d.hr) - f.same.hr;
        how = dp <= -5 && dh <= 3 ? ` — ${s0(dp)} s/km faster than your usual ${KIND[d.te] ?? 'run'}s without a higher heart rate`
          : dp >= 5 && dh >= 3 ? ` — slower than your usual ${KIND[d.te] ?? 'run'}s (${s0(dp)} s/km) at a higher heart rate: a harder day than it looks`
          : ` — in line with your usual ${KIND[d.te] ?? 'run'}s`;
      }
      const sentences = [`${word} ${when} ${kind}${how}.`];

      // 2. efficiency, and what the conditions did to it
      const reasons = [];
      if (f.heat && f.heat.diffC >= 1.5) reasons.push(`the heat (${fmt0.format(f.heat.wbgt)} °C WBGT, about ${s0(f.heat.secs)} s/km)`);
      if (f.form !== undefined && f.form < -20) reasons.push(`tired legs (form ${signedNum(f.form)})`);
      if (f.hills && f.hills.perKm >= 10 && f.hills.secs >= 5) reasons.push(`the hills (about ${s0(f.hills.secs)} s/km)`);
      if (f.sleep && f.sleep.h < 6) reasons.push(`a short night (${fmt1.format(f.sleep.h)} h)`);
      if (f.eff !== undefined && f.eff <= -5) {
        sentences.push(`At easy heart rate you ran ${s0(f.eff)} s/km faster than your recent norm: your aerobic fitness is moving up${reasons.length ? `, even with ${reasons.join(' and ')}` : ''}.`);
      } else if (f.eff !== undefined && f.eff >= 8) {
        sentences.push(`At easy heart rate you were ${s0(f.eff)} s/km slower than your recent norm${reasons.length ? `, mostly ${reasons.join(' and ')}` : ': if that repeats, look at sleep, illness or fatigue'}.`);
      } else if (reasons.length) {
        sentences.push(`It cost you a little: ${reasons.join(', ')}.`);
      } else if (f.heat && f.heat.diffC <= -1.5) {
        sentences.push(`Cooler than you usually train (${fmt0.format(f.heat.wbgt)} °C WBGT): worth about ${s0(f.heat.secs)} s/km.`);
      }

      // 3. the plan, records and consistency
      const p = f.plan;
      if (f.pb.length) sentences.push(`New best ${f.pb.map((e) => `${e.label} ${duration(e.time)}`).join(' and ')}!`);
      if (p && p.session !== 'rest') {
        const planned = `${SESSION[p.session] ?? p.session}${num(p.km) ? ` of ${fmt0.format(num(p.km))} km` : ''}`;
        const vs = num(p.vs_target);
        sentences.push(p.status === 'done'
          ? (vs !== null && vs < -10 && ['easy', 'long'].includes(p.session)
            ? `It was the plan's ${planned}, but ${s0(vs)} s/km faster than its target ${pace(p.target_pace)}: keep easy days easy.`
            : `Right on the plan: the ${planned} for ${p.race}.`)
          : p.status === 'partial' ? `Shorter than the plan's ${planned} (${fmt1.format(num(p.done_km) ?? km)} km done).` : '');
      } else if (p && p.session === 'rest') {
        sentences.push('The plan had a rest day here: an extra run.');
      }
      if (f.ctx && isTrue(d.is_run) && !f.pb.length && sentences.length < 3) {
        sentences.push(f.ctx.streak >= 3 ? `That's ${f.ctx.streak} days in a row and ${fmt0.format(f.ctx.weekKm)} km this week.`
          : `Run ${f.ctx.weekRuns} of the week: ${fmt0.format(f.ctx.weekKm)} km so far.`);
      }
      $('take-text').textContent = sentences.filter(Boolean).slice(0, 4).join(' ');

      // the facts behind it
      const chip = (text, cls = '', title = '') => `<span class="chip ${cls}"${title ? ` title="${esc(title)}"` : ''}>${text}</span>`;
      const chips = [];
      if (p) {
        chips.push(p.session === 'rest' ? chip('Plan: <b>rest day</b> · extra run', 'warn')
          : p.status === 'done' ? chip(`Plan: <b>✓ followed</b> · ${esc(SESSION[p.session] ?? p.session)}`, 'good')
          : p.status === 'partial' ? chip(`Plan: <b>partly</b> · ${esc(SESSION[p.session] ?? p.session)}`, 'warn')
          : chip(`Plan: ${esc(p.status)}`));
      } else if (isTrue(d.is_run) && runPlan.result && contextDay === f.day) chips.push(chip('No plan for this day', '', 'Save a plan on the Race planner to compare'));
      if (f.eff !== undefined) chips.push(chip(`Efficiency: <b>${f.eff <= 0 ? '−' : '+'}${s0(f.eff)} s/km</b> at easy HR`, f.eff <= -5 ? 'good' : f.eff >= 8 ? 'warn' : '',
        `Pace at easy heart rate (${pace(d.easy_pace)} /km) against your 28-day norm (${pace(d.easy_usual)} /km). Negative = faster for the same effort`));
      if (f.heat) chips.push(chip(`Heat: <b>${fmt0.format(f.heat.wbgt)} °C</b> WBGT · ${f.heat.secs >= 0 ? '+' : '−'}${s0(f.heat.secs)} s/km`, f.heat.diffC >= 1.5 ? 'warn' : '',
        `Against the heat you usually train in (${fmt1.format(f.heat.ref)} °C WBGT), with your own heat coefficient`));
      if (f.hills && f.hills.perKm >= 10) chips.push(chip(`Hills: <b>+${fmt0.format(num(d.elev))} m</b> · +${s0(f.hills.secs)} s/km`, f.hills.secs >= 5 ? 'warn' : ''));
      if (f.form !== undefined) chips.push(chip(`Started <b>${f.form < -20 ? 'tired' : f.form < -10 ? 'a bit tired' : f.form > 5 ? 'fresh' : 'rested'}</b> · form ${signedNum(f.form)}`,
        f.form < -20 ? 'warn' : f.form > 5 ? 'good' : '', 'Form (TSB) the morning of the run'));
      if (f.sleep) chips.push(chip(`Sleep <b>${fmt1.format(f.sleep.h)} h</b>${f.sleep.score ? ` · score ${fmt0.format(f.sleep.score)}` : ''}`, f.sleep.h < 6 ? 'warn' : ''));
      if (f.rhrUp) chips.push(chip('<b>Resting HR up</b> that day', 'warn', 'Can mean illness, stress or fatigue'));
      if (f.ctx?.streak >= 3) chips.push(chip(`<b>${f.ctx.streak}</b> days in a row`));
      $('take-chips').innerHTML = chips.join('');
    }

    // ---------- laps: each lap's role in the session, and a filter by role ----------
    const LAP_TYPES = {
      warmup: { label: 'Warm-up', color: 'var(--accent-2)' },
      interval: { label: 'Interval', color: 'var(--accent)' },
      tempo: { label: 'Tempo', color: 'var(--plum)' },
      rest: { label: 'Rest', color: 'var(--muted)' },
      easy: { label: 'Easy', color: 'var(--good)' },
      cooldown: { label: 'Cool-down', color: 'var(--z1)' },
    };
    let lapRoles = {}, lapFilter = 'all';
    // Each lap's role, from its grade-adjusted pace against the threshold pace T of that day (else the
    // run's average pace ÷ 1.25, as most of a run is easy), its length and its place in the session.
    // Garmin marks nearly every manual lap INTERVAL, so only its WARMUP, COOLDOWN, REST and RECOVERY count.
    function lapTypes (rows, d) {
      const lapPace = (l) => (num(l.gap_speed) ? 1000 / num(l.gap_speed) : num(l.pace));
      const T = num(d?.lt_pace_day) ?? num(d?.lt_own_day) ?? (num(d?.pace) ? num(d.pace) / 1.25 : null);
      const base = rows.map((l) => {
        const g = String(l.intensity ?? '').toUpperCase(), p = lapPace(l), r = T && p ? p / T : null;
        const km = num(l.km) ?? 0;
        if (g === 'WARMUP') return 'warmup';
        if (g === 'COOLDOWN') return 'cooldown';
        if (g === 'REST' || g === 'RECOVERY') return 'rest';
        if (r === null || r > 1.6 || (km < 0.25 && r > 1.16)) return 'stop';      // standing or walking, or a sliver of a lap
        if (r <= 1.04) return 'hard';                                           // threshold pace or faster
        if (r <= 1.16) return 'moderate';                                       // comfortably hard
        return 'slow';
      });
      // work comes in blocks of back-to-back hard or moderate laps (auto-laps split one effort into
      // many): a block of 10 min+, or of 5 min+ at moderate pace only, is tempo; a shorter one, an interval
      for (let i = 0; i < base.length;) {
        if (base[i] !== 'hard' && base[i] !== 'moderate') { i++; continue; }
        let j = i;
        while (j < base.length && (base[j] === 'hard' || base[j] === 'moderate')) j++;
        const mins = rows.slice(i, j).reduce((m, l) => m + (num(l.secs) ?? 0) / 60, 0);
        const type = mins >= 10 || (mins >= 5 && base.slice(i, j).every((t) => t === 'moderate')) ? 'tempo' : 'interval';
        for (let k = i; k < j; k++) base[k] = type;
        i = j;
      }
      const work = base.map((t, i) => (t === 'interval' || t === 'tempo' ? i : -1)).filter((i) => i >= 0);
      const first = work[0] ?? Infinity, last = work.at(-1) ?? -Infinity;
      const secsOf = (from, to) => rows.slice(from, to).reduce((s, l) => s + (num(l.secs) ?? 0), 0);
      const lead = secsOf(0, first === Infinity ? 0 : first), trail = secsOf(last + 1, rows.length);
      return base.map((t, i) => {
        if (t !== 'stop' && t !== 'slow') return t;
        if (!work.length) return t === 'stop' ? 'rest' : 'easy';
        if (i < first) return lead <= 30 * 60 ? 'warmup' : t === 'stop' ? 'rest' : 'easy';
        if (i > last) return (num(rows[i].secs) ?? 0) < 120 && t === 'stop' ? 'rest' : trail <= 20 * 60 ? 'cooldown' : 'easy';
        return t === 'stop' || (num(rows[i].secs) ?? 0) <= 300 ? 'rest' : 'easy';
      });
    }

    function renderLaps () {
      const rows = laps.result?.rows ?? [], d = currentDetail;
      const types = lapTypes(rows, d);
      lapRoles = Object.fromEntries(rows.map((l, i) => [l.lap_no, types[i]]));
      const counts = types.reduce((m, t) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {});
      if (lapFilter !== 'all' && !counts[lapFilter]) lapFilter = 'all';
      $('lap-filter').innerHTML = rows.length < 2 ? '' : [`<button type="button" data-lapf="all" aria-pressed="${lapFilter === 'all'}">All ${rows.length}</button>`]
        .concat(Object.keys(LAP_TYPES).filter((k) => counts[k]).map((k) => `<button type="button" data-lapf="${k}" aria-pressed="${lapFilter === k}">
          <i style="background:${LAP_TYPES[k].color}"></i>${LAP_TYPES[k].label} ${counts[k]}</button>`)).join('');
      const shown = rows.filter((_, i) => lapFilter === 'all' || types[i] === lapFilter);
      $('laps-body').innerHTML = shown.map((l) => {
        const t = LAP_TYPES[lapRoles[l.lap_no]];
        const garmin = `${String(l.intensity ?? '').toLowerCase()}${num(l.step) === null ? '' : ` · step ${l.step}`}`;
        return `<tr>
          <td>${esc(l.lap_no)}</td>
          <td class="l"><span class="ltag" title="Garmin: ${esc(garmin || 'no type')}"><i style="background:${t.color}"></i>${t.label}</span></td>
          <td>${or(l.km, fmt2.format)} km</td>
          <td>${duration(l.secs)}</td>
          <td>${pace(l.pace)}</td>
          <td>${paceFromSpeed(l.gap_speed)}</td>
          <td>${or(l.hr, fmt0.format)}</td>
          <td>${or(l.max_hr, fmt0.format)}</td>
          <td>${or(l.cadence, fmt0.format)}</td>
          <td>${num(l.stride) === null ? dash : `${fmt2.format(num(l.stride) / 100)} m`}</td>
          <td>${or(l.gain, fmt0.format)} / ${or(l.loss, fmt0.format)}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="11" class="muted">No laps recorded</td></tr>';

      // the shown laps' totals; for intervals, how even they were
      const km = shown.reduce((s, l) => s + (num(l.km) ?? 0), 0), secs = shown.reduce((s, l) => s + (num(l.secs) ?? 0), 0);
      const hrT = shown.filter((l) => num(l.hr)).reduce((s, l) => s + num(l.secs), 0);
      const hr = hrT ? shown.filter((l) => num(l.hr)).reduce((s, l) => s + num(l.hr) * num(l.secs), 0) / hrT : null;
      const paces = shown.map((l) => num(l.pace)).filter(Boolean);
      const spread = lapFilter === 'interval' && paces.length > 1 ? ` · fastest ${pace(Math.min(...paces))}, slowest ${pace(Math.max(...paces))}` : '';
      $('lap-sum').innerHTML = !rows.length ? '' : `<b>${shown.length} ${lapFilter === 'all' ? 'laps' : LAP_TYPES[lapFilter].label.toLowerCase() + (shown.length === 1 ? '' : 's')}</b>`
        + ` · ${fmt2.format(km)} km in ${duration(secs)}${km > 0.05 ? ` · avg ${pace(secs / km)} /km` : ''}${hr ? ` · ${fmt0.format(hr)} bpm` : ''}${spread}`;
      if (barsMode === 'laps') drawBars();
    }
    $('lap-filter').addEventListener('click', (e) => {
      const b = e.target.closest('[data-lapf]');
      if (!b) return;
      lapFilter = b.dataset.lapf;
      renderLaps();
    });

    // ---------- effort: this run's TRIMP, and its week against your usual range (Strava's relative effort) ----------
    const weChart = echarts.init($('we-chart'));
    const monday = (day) => shiftDay(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
    const dayLabel = (day, opts) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', ...opts });
    const SPORT_ICON = { Running: '🏃', Cycling: '🚴', Strength: '🏋️', 'Walking & hiking': '🚶' };
    function renderEffort () {
      const d = currentDetail;
      if (!d || String(d.id) !== String(openId)) return;
      const day = String(d.date ?? '').slice(0, 10), effort = num(d.trimp);
      $('re-value').textContent = effort === null ? dash : fmt0.format(effort);
      if (!(runContext.result && runContext.state !== 'executing' && contextDay === day)) return;
      const rows = runContext.result.rows.map((r) => ({ ...r, day: String(r.date).slice(0, 10), e: num(r.trimp) ?? 0 }));

      // weekly totals, the 16 weeks before and this one; the usual range of a week is 0.8–1.3 × the
      // mean of the 4 weeks before it: the acute:chronic band Ran uses for load everywhere
      const wk0 = monday(day);
      const weeks = Array.from({ length: 17 }, (_, i) => ({ start: shiftDay(wk0, -7 * (16 - i)), total: 0 }));
      const at = new Map(weeks.map((w, i) => [w.start, i]));
      for (const r of rows) { const i = at.get(monday(r.day)); if (i !== undefined) weeks[i].total += r.e; }
      weeks.forEach((w, i) => {
        if (i < 4) return;
        w.mean = weeks.slice(i - 4, i).reduce((s, x) => s + x.total, 0) / 4;
        w.lo = w.mean * 0.8; w.hi = w.mean * 1.3;
      });
      const cur = weeks.at(-1), ratio = cur.mean ? cur.total / cur.mean : null;
      const today = new Date().toLocaleDateString('en-CA', { timeZone: Run.TZ });
      const sofar = shiftDay(wk0, 6) > today;
      const [verdict, tone] = ratio === null ? ['', ''] : ratio < 0.8 ? ['Below your weekly range', 'muted'] : ratio <= 1.3 ? ['Within your weekly range', 'good']
        : ratio <= 1.5 ? ['Above your weekly range', 'warn'] : ['Well above your weekly range', 'bad'];
      $('we-dates').textContent = `${dayLabel(wk0, { month: 'short', day: 'numeric' })} – ${dayLabel(shiftDay(wk0, 6), { month: 'short', day: 'numeric', year: 'numeric' })}`;
      $('we-value').textContent = fmt0.format(cur.total);
      $('we-value').className = `big2 ${tone === 'muted' ? '' : tone}`;
      $('we-verdict').textContent = verdict + (sofar ? ' so far' : '');
      $('we-sub').textContent = cur.mean ? `${fmt0.format(ratio * 100)} % of your usual week (${fmt0.format(cur.mean)}, the 4 weeks before); range ${fmt0.format(cur.lo)}–${fmt0.format(cur.hi)}` : '';

      // the week by day
      const byDay = Array.from({ length: 7 }, (_, i) => rows.filter((r) => r.day === shiftDay(wk0, i)).reduce((s, r) => s + r.e, 0));
      const top = Math.max(...byDay, 1);
      $('we-days').innerHTML = byDay.map((v, i) => `<span class="${shiftDay(wk0, i) === day ? 'today' : ''}" title="${dayLabel(shiftDay(wk0, i), { weekday: 'long' })}: ${fmt0.format(v)}">
        <i style="height:${(v / top) * 52}px"></i>${'MTWTFSS'[i]}</span>`).join('');

      // this run against your runs of the 4 weeks before it
      const recent = rows.filter((r) => isTrue(r.is_run) && String(r.id) !== String(d.id) && r.day >= shiftDay(day, -28) && r.day <= day && r.e > 0).map((r) => r.e);
      const below = recent.filter((v) => v < (effort ?? 0)).length / (recent.length || 1);
      const runLine = effort === null ? 'No heart rate: no effort for this activity.'
        : recent.length < 3 ? 'Not enough recent runs to compare yet.'
        : effort >= Math.max(...recent) ? 'Your hardest effort in 4 weeks: give it the recovery it asks for.'
        : below >= 0.75 ? 'A big effort next to your recent runs.'
        : below <= 0.25 ? 'An easy effort next to your recent runs: the kind that lets the hard days work.'
        : 'Good work. You’re holding steady with your recent efforts.';
      const weekLine = ratio === null ? '' : ratio > 1.5 ? ' This week is well above your usual range: an easy day or two would help.'
        : ratio > 1.3 ? ' This week is above your usual range.' : ratio < 0.8 && !sofar ? ' A lighter week than usual.' : '';
      $('re-text').textContent = runLine + weekLine;

      // the week's activities, all sports; a click opens one
      const week = rows.filter((r) => r.day >= wk0 && r.day <= shiftDay(wk0, 6));
      $('we-list').innerHTML = week.map((r) => `<tr data-open="${esc(r.id)}" class="${String(r.id) === String(d.id) ? 'this' : ''}">
        <td>${SPORT_ICON[r.sport] ?? '•'}</td><td class="l">${dayLabel(r.day, { weekday: 'short', month: 'numeric', day: 'numeric' })}</td>
        <td class="n">${esc(r.name)}</td><td>${duration(r.secs)}</td>
        <td class="e" style="${r.e >= 150 ? 'color:var(--bad-text)' : ''}">${fmt0.format(r.e)}</td></tr>`).join('');

      // 17 weeks: the range as a band, each week's total as a dot, this week filled
      const shown = weeks.slice(4);
      weChart.resize();
      weChart.setOption({
        animation: false,
        grid: { left: 16, right: 48, top: 14, bottom: 24 },
        tooltip: { trigger: 'axis', formatter: (ps) => { const w = shown[ps[0].dataIndex];
          return `Week of ${dayLabel(w.start, { month: 'short', day: 'numeric' })}<br>Effort <b>${fmt0.format(w.total)}</b><br>Usual range ${fmt0.format(w.lo)}–${fmt0.format(w.hi)}`; } },
        xAxis: { type: 'category', data: shown.map((w) => dayLabel(w.start, { month: 'short', day: 'numeric' })), boundaryGap: false, ...axisBase(),
          axisLabel: { color: css('--muted'), fontSize: 10 } },
        yAxis: { type: 'value', position: 'right', ...axisBase(), splitNumber: 2, axisLabel: { color: css('--muted'), fontSize: 10 } },
        series: [
          { type: 'line', stack: 'range', data: shown.map((w) => w.lo), lineStyle: { opacity: 0 }, showSymbol: false, silent: true },
          { type: 'line', stack: 'range', data: shown.map((w) => w.hi - w.lo), lineStyle: { opacity: 0 }, showSymbol: false, silent: true,
            areaStyle: { color: css('--track'), opacity: 1 } },
          { type: 'line', name: 'Effort', data: shown.map((w, i) => ({ value: w.total,
              itemStyle: i === shown.length - 1 ? { color: css('--plum'), borderColor: css('--plum') } : { color: css('--panel'), borderColor: css('--text') } })),
            lineStyle: { opacity: 0 }, symbol: 'circle', symbolSize: (v, p) => (p.dataIndex === shown.length - 1 ? 11 : 7), z: 3,
            markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: css('--plum'), type: 'solid' },
              data: [{ xAxis: shown.length - 1 }] } },
        ],
      }, { replaceMerge: ['series'] });
    }
    $('we-list').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-open]'); if (tr) openActivity(tr.dataset.open); });

    // ---------- zones: pace (from your threshold pace) and heart rate (Garmin's zones) ----------
    // Pace zones as multiples of your threshold pace that day, on grade-adjusted pace (Strava-like bands).
    const PACE_ZONES = [['Z6', 'Anaerobic', 0, 0.92], ['Z5', 'VO2max', 0.92, 0.98], ['Z4', 'Threshold', 0.98, 1.04],
      ['Z3', 'Tempo', 1.04, 1.16], ['Z2', 'Endurance', 1.16, 1.35], ['Z1', 'Recovery', 1.35, Infinity]];
    function zoneRows (rows, colour, total) {
      const max = Math.max(...rows.map((r) => r.secs), 1);
      return `<tbody>${rows.map((r, i) => `<tr>
        <td class="z">${r.z}</td><td class="n">${r.name}</td><td>${r.range}</td><td><b>${duration(r.secs)}</b></td>
        <td>${total ? `${fmt1.format((r.secs / total) * 100)} %` : ''}</td>
        <td class="bar"><i style="width:${(r.secs / max) * 100}%;background:${colour(i, rows.length)}"></i></td></tr>`).join('')}</tbody>`;
    }
    function renderPaceZones () {
      const d = currentDetail, T = num(d?.lt_pace_day) ?? num(d?.lt_own_day);
      if (!S.pts.length || !S.byDistance || !T) {
        $('pz-table').innerHTML = '';
        $('pz-note').textContent = !T ? 'No threshold pace for this date yet: pace zones need one.' : 'No distance recorded.';
        return;
      }
      const secs = PACE_ZONES.map(() => 0);
      for (let i = 1; i < S.pts.length; i++) {
        const v = S.gap[i] ?? S.pace[i], dt = S.pts[i].el - S.pts[i - 1].el;
        if (!v || !(dt > 0) || dt > 10) continue;
        secs[PACE_ZONES.findIndex(([, , lo, hi]) => v >= lo * T && v < hi * T)] += dt;
      }
      const total = secs.reduce((a, b) => a + b, 0);
      const rows = PACE_ZONES.map(([z, name, lo, hi], i) => ({ z, name, secs: secs[i],
        range: lo === 0 ? `< ${pace(hi * T)}` : hi === Infinity ? `> ${pace(lo * T)}` : `${pace(lo * T)} – ${pace(hi * T)}` }));
      $('pz-table').innerHTML = zoneRows(rows, (i, n) => `color-mix(in srgb, var(--accent-2) ${100 - (i * 70) / (n - 1)}%, transparent)`, total);
      $('pz-note').textContent = `Grade-adjusted pace, as bands around your threshold pace that day (${pace(T)} /km, ${num(d.lt_pace_day) ? 'Garmin' : 'from your runs'}). Stops are left out.`;
    }
    function renderHrZones () {
      const d = currentDetail;
      if (!d) return;
      const NAMES = ['Warm-up', 'Easy', 'Aerobic', 'Threshold', 'Maximum'];
      let rows = (hrZones.result?.rows ?? []).map((r) => ({ z: `Z${r.zone}`, name: NAMES[num(r.zone) - 1] ?? '', secs: num(r.secs) ?? 0,
        range: num(r.high) === null ? `> ${fmt0.format(num(r.low))}` : `${fmt0.format(num(r.low))} – ${fmt0.format(num(r.high))}` }));
      if (!rows.length) rows = ['z1', 'z2', 'z3', 'z4', 'z5'].map((k, i) => ({ z: `Z${i + 1}`, name: NAMES[i], secs: num(d[k]) ?? 0, range: '' }));
      rows.reverse();
      const total = rows.reduce((a, r) => a + r.secs, 0);
      if (!total) { $('hz-table').innerHTML = ''; $('hz-note').textContent = 'No heart-rate data for this activity.'; return; }
      $('hz-table').innerHTML = zoneRows(rows, (i) => `var(--z${5 - i})`, total);
      $('hz-note').textContent = 'bpm ranges are your Garmin heart-rate zones on the day of the run.';
    }

    // ---------- the race this run was, if any (races are marked in the database, not from here) ----------
    let currentDetail = null;
    const distLabel = (km) => ({ 5: '5K', 10: '10K', 21.0975: 'Half marathon', 42.195: 'Marathon' }[num(km)] ?? `${fmt2.format(num(km))} km`);

    // " · goal 3:59:59, 2:10 faster" next to a race's result.
    function goalNote (d) {
      const goal = num(d.race_goal), diff = num(d.race_time) - goal;
      if (!goal) return '';
      if (Math.abs(diff) < 1) return ` · goal ${duration(goal)}, on target`;
      return ` · goal ${duration(goal)}, ${duration(Math.abs(diff))} ${diff < 0 ? 'faster' : 'slower'}`;
    }

    function renderRaceMarker () {
      const d = currentDetail, bar = $('race-bar');
      if (!d) return;
      if (isTrue(d.is_race)) {
        bar.innerHTML = `<span>🏁</span><b>${esc(d.race_name)}</b>
          <span class="muted">${distLabel(d.race_km)} · ${duration(d.race_time)} (${pace(num(d.race_time) / num(d.race_km))} /km) · priority ${esc(d.race_priority)}${goalNote(d)}</span>`;
      } else {
        bar.innerHTML = isTrue(d.maybe_race) ? `<span class="muted">Looks like a ${distLabel(d.std_km)} race: standard distance at a hard effort.</span>` : '<span class="muted">Not a race.</span>';
      }
    }

    // ---------- route map, streams and splits: hover any of them and the others follow ----------
    const streamChart = echarts.init($('samples-chart'));
    const barsChart = echarts.init($('bars-chart'));
    // the run's samples and their 15-s smoothed pace and GAP (s/km), one entry per sample
    const S = { pts: [], byDistance: true, x: [], pace: [], gap: [], geo: [] };
    let map, routeLayer, pinLayer, kmLayer, segLayer, hoverMarker, colourBy = 'plain', bars = [], barsMode = 'splits', barsMeasure = 'pace';

    function drawStreams (rows) {
      const all = rows.map((r) => ({
        el: num(r.el), dist: num(r.dist), hr: num(r.hr), speed: num(r.speed), gap: num(r.gap), elev: num(r.elev),
        cad: num(r.cad), lat: num(r.lat), lon: num(r.lon),
      }));
      // Over distance when the activity has any; otherwise (strength, some indoor) over elapsed time.
      S.byDistance = all.some((p) => p.dist > 0);
      const pts = S.pts = S.byDistance ? all.filter((p) => p.dist !== null) : all.filter((p) => p.el !== null);
      const win = 15;
      const smooth = (key) => pts.map((_, i) => {
        let s = 0, n = 0;
        for (let j = Math.max(0, i - win + 1); j <= i; j++) { if (pts[j][key] > 0.3) { s += pts[j][key]; n++; } }
        const v = n ? 1000 / (s / n) : null;
        return v && v < 900 ? v : null;
      });
      S.pace = smooth('speed');
      S.gap = smooth('gap');
      S.x = S.byDistance ? pts.map((p) => +(p.dist / 1000).toFixed(3)) : pts.map((p) => +(p.el / 60).toFixed(2));
      S.geo = pts.map((p, i) => (p.lat !== null && p.lon !== null ? i : -1)).filter((i) => i >= 0);
      $('hero').hidden = S.geo.length < 2;
      $('streams-wrap').hidden = pts.length === 0;
      $('streams-note').textContent = S.byDistance
        ? `Pace smoothed over 15 s; the legend adds grade-adjusted pace and cadence.${S.geo.length > 1 ? ' Hover the map or the chart: both follow, and so do the splits.' : ''}`
        : 'No distance recorded: heart rate over elapsed time.';
      drawMap();
      if (!pts.length) return;

      const x = S.x, byDistance = S.byDistance;
      const xLabel = byDistance ? (v) => `${+v.toFixed(1)} km` : (v) => `${Math.round(v)} min`;
      const paces = S.pace.filter((v) => v !== null).sort((a, b) => a - b);
      const pct = (q) => paces[Math.min(paces.length - 1, Math.floor(q * paces.length))];
      const paceMin = paces.length ? Math.floor((pct(0.02) - 15) / 30) * 30 : undefined;
      const paceMax = paces.length ? Math.ceil((pct(0.98) + 15) / 30) * 30 : undefined;
      const elevs = pts.map((p) => p.elev).filter((v) => v !== null);
      const minElev = elevs.length ? Math.min(...elevs) : 0;

      streamChart.resize(); // the modal was hidden when the chart was created
      streamChart.setOption({
        animation: false,
        grid: { left: 48, right: 40, top: 36, bottom: 32 },
        legend: { top: 0, textStyle: { color: css('--muted') }, inactiveColor: css('--border'), inactiveBorderColor: css('--border'), selected: { Pace: byDistance, GAP: false, 'Heart rate': true, Elevation: byDistance, Cadence: false } },
        tooltip: { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: css('--text') } },
          formatter: (ps) => {
            const i = ps[0]?.dataIndex ?? 0, p = pts[i];
            if (!p) return '';
            return `${byDistance ? `${fmt2.format(p.dist / 1000)} km` : duration(p.el)} · ${duration(p.el)}<br>Pace ${pace(S.pace[i])} /km · GAP ${pace(S.gap[i])}<br>HR ${or(p.hr, fmt0.format)} bpm<br>`
              + `Elevation ${or(p.elev, fmt0.format)} m<br>Cadence ${or(p.cad, fmt0.format)} spm`;
          } },
        xAxis: { type: 'value', min: 0, max: x.at(-1) ?? 1, ...axisBase(), axisLabel: { color: css('--muted'), formatter: xLabel } },
        yAxis: [
          { type: 'value', inverse: true, min: paceMin, max: paceMax, ...axisBase(),
            interval: paces.length ? Math.max(30, Math.ceil((paceMax - paceMin) / 6 / 30) * 30) : undefined,
            axisLabel: { color: css('--muted'), formatter: (v) => pace(v) } },
          { type: 'value', scale: true, ...axisBase(), splitLine: { show: false }, axisLabel: { color: css('--bad') } },
          { type: 'value', show: false, min: minElev - 5 },
          { type: 'value', show: false, scale: true },
        ],
        series: [
          { name: 'Elevation', type: 'line', yAxisIndex: 2, showSymbol: false, data: pts.map((p, i) => [x[i], p.elev]),
            lineStyle: { width: 0 }, areaStyle: { color: css('--border'), opacity: 0.8 }, color: css('--muted'), z: 1 },
          { name: 'Pace', type: 'line', yAxisIndex: 0, showSymbol: false, data: S.pace.map((v, i) => [x[i], v]), lineStyle: { width: 1.5 }, color: css('--accent-2'), z: 3, clip: true },
          { name: 'GAP', type: 'line', yAxisIndex: 0, showSymbol: false, data: S.gap.map((v, i) => [x[i], v]), lineStyle: { width: 1, type: 'dashed' }, color: css('--accent-2'), z: 3, clip: true },
          { name: 'Heart rate', type: 'line', yAxisIndex: 1, showSymbol: false, data: pts.map((p, i) => [x[i], p.hr]), lineStyle: { width: 1.2 }, color: css('--bad'), z: 2 },
          { name: 'Cadence', type: 'line', yAxisIndex: 3, showSymbol: false, data: pts.map((p, i) => [x[i], p.cad]), lineStyle: { width: 0.8 }, color: css('--good'), z: 2 },
        ],
      }, { replaceMerge: ['series'] });
    }

    // Colour ramp for the route: low = calm blue, high = Ran orange-red.
    const RAMP = ['#4f86c6', '#5fa8c9', '#69c07b', '#f5c84c', '#f59a3c', '#e8432a'];
    function drawMap () {
      if (S.geo.length < 2) return;
      if (!map) {
        map = L.map('map', { zoomControl: false, scrollWheelZoom: false });
        L.control.zoom({ position: 'topright' }).addTo(map);
        // Esri's street map (it serves a sandboxed frame, which sends no Referer; OSM's and CARTO's
        // servers do not), turned grey or dark by CSS so the route stands out
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 19, attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
        }).addTo(map);
        // scrolling the modal must not zoom the map: the wheel zooms once the map is clicked
        map.on('click', () => map.scrollWheelZoom.enable());
        map.on('mouseout', () => { map.scrollWheelZoom.disable(); clearFocus(); });
        map.on('mousemove', onMapMove);
      }
      map.invalidateSize();
      routeLayer?.remove();
      routeLayer = L.polyline(S.geo.map((i) => [S.pts[i].lat, S.pts[i].lon]));
      map.fitBounds(routeLayer.getBounds(), { padding: [36, 36], animate: false });
      drawRoute();
    }

    function drawRoute () {
      if (!map || S.geo.length < 2) return;
      routeLayer?.remove(); pinLayer?.remove(); kmLayer?.remove(); segLayer?.remove(); segLayer = null;
      const ll = (i) => [S.pts[i].lat, S.pts[i].lon];
      const casing = css('--ink');
      routeLayer = L.featureGroup().addTo(map);
      L.polyline(S.geo.map(ll), { color: casing, weight: 8, opacity: 0.55, lineCap: 'round', lineJoin: 'round' }).addTo(routeLayer);
      const legend = $('map-legend');
      if (colourBy === 'plain') {
        L.polyline(S.geo.map(ll), { color: css('--accent'), weight: 5, lineCap: 'round', lineJoin: 'round' }).addTo(routeLayer);
        legend.hidden = true;
      } else {
        // pace: fast = hot; heart rate: high = hot; ends at the 5th and 95th percentiles
        const val = colourBy === 'pace' ? (i) => (S.pace[i] ? -S.pace[i] : null) : (i) => S.pts[i].hr;
        const vs = S.geo.map(val).filter((v) => v !== null).sort((a, b) => a - b);
        const lo = vs[Math.floor(vs.length * 0.05)], hi = vs[Math.floor(vs.length * 0.95)];
        const bucket = (v) => (v === null ? null : Math.max(0, Math.min(RAMP.length - 1, Math.floor(((v - lo) / ((hi - lo) || 1)) * RAMP.length))));
        let run = [], b = null;
        const flush = () => { if (run.length > 1) L.polyline(run, { color: RAMP[b ?? 0], weight: 5, lineCap: 'round', lineJoin: 'round' }).addTo(routeLayer); };
        for (const i of S.geo) {
          const nb = bucket(val(i)) ?? b;
          if (nb !== b && run.length) { run.push(ll(i)); flush(); run = []; }
          b = nb;
          run.push(ll(i));
        }
        flush();
        const fmt = colourBy === 'pace' ? (v) => `${pace(-v)} /km` : (v) => `${fmt0.format(v)} bpm`;
        legend.innerHTML = `<b>${colourBy === 'pace' ? 'Pace' : 'Heart rate'}</b><div class="ramp" style="background:linear-gradient(90deg, ${RAMP.join(', ')})"></div>
          <div class="ends"><span>${fmt(lo)}</span><span>${fmt(hi)}</span></div>`;
        legend.hidden = false;
      }
      // start, finish and a marker each km (every 5 km on long runs)
      pinLayer = L.layerGroup().addTo(map);
      const first = S.geo[0], last = S.geo.at(-1);
      L.marker(ll(first), { icon: L.divIcon({ className: 'pin start' }), title: 'Start', keyboard: false }).addTo(pinLayer);
      L.marker(ll(last), { icon: L.divIcon({ className: 'pin finish' }), title: 'Finish', keyboard: false }).addTo(pinLayer);
      kmLayer = L.layerGroup().addTo(map);
      if (S.byDistance) {
        const every = (S.pts[last].dist ?? 0) > 25000 ? 5 : 1;
        let next = every;
        const placed = [];   // on a loop or a track the km markers pile up: keep the ones with room
        for (const i of S.geo) {
          if (S.pts[i].dist / 1000 >= next && i !== last) {
            const at = map.latLngToContainerPoint(ll(i));
            if (placed.some((q) => q.distanceTo(at) < 26) || map.latLngToContainerPoint(ll(first)).distanceTo(at) < 20) { next += every; continue; }
            placed.push(at);
            L.marker(ll(i), { icon: L.divIcon({ className: 'km-mark', html: String(next) }), interactive: false, keyboard: false }).addTo(kmLayer);
            next += every;
          }
        }
      }
    }

    // one place for "the runner was here": the map marker and readout, the streams tooltip, the split bar
    let lastFocus = -1;
    function focusAt (i, from) {
      const p = S.pts[i];
      if (!p) return;
      lastFocus = i;
      if (map && p.lat !== null) {
        if (!hoverMarker) hoverMarker = L.circleMarker([p.lat, p.lon], { radius: 7, color: '#fff', weight: 3, fillColor: css('--ink'), fillOpacity: 1, interactive: false });
        hoverMarker.setLatLng([p.lat, p.lon]);
        if (!map.hasLayer(hoverMarker)) hoverMarker.addTo(map);
        const r = $('map-readout');
        r.innerHTML = `${S.byDistance ? `${fmt2.format(p.dist / 1000)} km · ` : ''}${pace(S.pace[i])} /km · ${or(p.hr, fmt0.format)} bpm${p.elev !== null ? ` · ${fmt0.format(p.elev)} m` : ''}`;
        r.hidden = false;
      }
      if (from !== 'stream') streamChart.dispatchAction({ type: 'showTip', seriesIndex: 1, dataIndex: i });
      if (from !== 'bars' && S.byDistance) {
        const km = p.dist / 1000, b = bars.findIndex((x) => km >= x.start && km < x.end);
        barsChart.dispatchAction({ type: 'downplay', seriesIndex: 0 });
        if (b >= 0) barsChart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: b });
      }
    }
    function clearFocus () {
      lastFocus = -1;
      hoverMarker?.remove();
      $('map-readout').hidden = true;
      streamChart.dispatchAction({ type: 'hideTip' });
      barsChart.dispatchAction({ type: 'downplay', seriesIndex: 0 });
    }
    // the map: the sample nearest the pointer, if the pointer is on the route
    let moveFrame = null;
    function onMapMove (e) {
      if (moveFrame) return;
      moveFrame = requestAnimationFrame(() => {
        moveFrame = null;
        // on a loop or a track several laps pass under the pointer: of the points within 12 px of the
        // nearest, take the one closest in time to the last one shown, so moving along the route stays on its lap
        const { lat, lng } = e.latlng, k = Math.cos((lat * Math.PI) / 180);
        const d2 = (i) => { const dy = S.pts[i].lat - lat, dx = (S.pts[i].lon - lng) * k; return dx * dx + dy * dy; };
        let best = -1, bestD = Infinity;
        for (const i of S.geo) { const dd = d2(i); if (dd < bestD) { bestD = dd; best = i; } }
        if (best < 0) return;
        const px = (i) => map.latLngToContainerPoint([S.pts[i].lat, S.pts[i].lon]).distanceTo(e.containerPoint);
        const near = px(best);
        if (near > 40) { clearFocus(); return; }
        if (lastFocus >= 0) {
          let pick = best;
          for (const i of S.geo) if (Math.abs(i - lastFocus) < Math.abs(pick - lastFocus) && px(i) <= near + 12) pick = i;
          best = pick;
        }
        focusAt(best, 'map');
      });
    }
    // the streams chart moves the map marker and the split
    streamChart.on('updateAxisPointer', (e) => {
      const xv = e.axesInfo?.[0]?.value;
      if (xv === undefined || !S.pts.length) return;
      let lo = 0, hi = S.x.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (S.x[mid] < xv) lo = mid + 1; else hi = mid; }
      focusAt(lo, 'stream');
    });
    streamChart.on('globalout', clearFocus);

    // ---------- splits & laps: bars as wide as their distance, as tall as their speed ----------
    function splitBars () {
      const pts = S.pts, out = [];
      if (!S.byDistance || pts.length < 2) return out;
      let start = 0, t0 = pts[0].el, hrS = 0, hrT = 0, gapD = 0, gapT = 0, gain = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], dt = b.el - a.el;
        if (dt > 0 && dt <= 10) {
          if (b.hr) { hrS += b.hr * dt; hrT += dt; }
          if (b.gap > 0.3) { gapD += b.gap * dt; gapT += dt; }
        }
        if (a.elev !== null && b.elev !== null && b.elev > a.elev) gain += b.elev - a.elev;
        const end = Math.floor(b.dist / 1000) > Math.floor(a.dist / 1000) || i === pts.length - 1;
        if (end && b.dist - start > 50) {
          const km = (b.dist - start) / 1000, secs = b.el - t0;
          out.push({ label: `Km ${out.length + 1}`, start: start / 1000, end: b.dist / 1000, km, secs,
            speed: (km * 1000) / secs, gap: gapT ? gapD / gapT : null, hr: hrT ? hrS / hrT : null, gain });
          start = b.dist; t0 = b.el; hrS = hrT = gapD = gapT = gain = 0;
        }
      }
      return out;
    }
    function lapBars () {
      let at = 0;
      return (laps.result?.rows ?? []).filter((l) => num(l.km) > 0 && num(l.secs) > 0).map((l) => {
        const km = num(l.km), b = { label: `Lap ${l.lap_no}`, start: at, end: at + km, km, secs: num(l.secs),
          speed: (km * 1000) / num(l.secs), gap: num(l.gap_speed), hr: num(l.hr), gain: num(l.gain), kind: LAP_TYPES[lapRoles[l.lap_no]]?.label ?? '' };
        at += km;
        return b;
      });
    }
    function drawBars () {
      bars = barsMode === 'laps' ? lapBars() : splitBars();
      if (!bars.length && barsMode === 'splits') bars = lapBars();
      const val = (b) => (barsMeasure === 'gap' ? b.gap ?? b.speed : b.speed);
      const vs = bars.map(val).filter(Boolean);
      if (!vs.length) { barsChart.clear(); return; }
      // the floor: 15 % under the slowest bar that is still running pace (slower than 15:00/km is a stop)
      const floor = Math.max(0, Math.min(...vs.filter((v) => v > 1000 / 900)) * 0.85);
      const elev = S.pts.length ? S.pts.filter((_, i) => i % 5 === 0).map((p) => [p.dist / 1000, p.elev]) : [];
      const accent = css('--accent-2'), quiet = css('--border');
      barsChart.resize();
      barsChart.setOption({
        animation: false,
        grid: { left: 56, right: 40, top: 12, bottom: 32 },
        tooltip: { trigger: 'item', formatter: (p) => { const b = bars[p.dataIndex]; if (!b) return '';
          return `<b>${b.label}</b>${b.kind ? ` · ${esc(b.kind)}` : ''}<br>${fmt2.format(b.km)} km in ${duration(b.secs)}<br>Pace ${pace(1000 / b.speed)} /km`
            + `${b.gap ? ` · GAP ${pace(1000 / b.gap)}` : ''}<br>HR ${or(b.hr, fmt0.format)} bpm${b.gain !== null ? ` · +${fmt0.format(b.gain)} m` : ''}`; } },
        xAxis: { type: 'value', min: 0, max: bars.at(-1).end, ...axisBase(), axisLabel: { color: css('--muted'), showMaxLabel: false, formatter: (v) => `${+v.toFixed(1)} km` } },
        yAxis: [
          { type: 'value', min: floor, ...axisBase(), axisLabel: { color: css('--muted'), formatter: (v) => (v > 0 ? pace(1000 / v) : '') } },
          { type: 'value', show: false, scale: true, max: (e) => e.max + (e.max - e.min) * 3 },
        ],
        series: [
          { type: 'custom', name: 'bars', z: 3,
            data: bars.map((b) => [b.start, b.end, Math.max(val(b) ?? 0, floor)]),
            renderItem: (params, api) => {
              const a = api.coord([api.value(0), api.value(2)]), z = api.coord([api.value(1), floor]);
              const w = Math.max(1, z[0] - a[0] - 2);
              const v = api.value(2), slow = v <= floor * 1.18;
              return { type: 'rect', shape: { x: a[0] + 1, y: a[1], width: w, height: z[1] - a[1], r: [3, 3, 0, 0] },
                style: { fill: slow ? quiet : accent, opacity: slow ? 1 : 0.55 + 0.45 * ((v - floor) / ((Math.max(...vs) - floor) || 1)) },
                emphasis: { style: { fill: css('--accent'), opacity: 1 } } };
            },
            encode: { x: [0, 1], y: 2 } },
          { type: 'line', name: 'Elevation', yAxisIndex: 1, data: elev, showSymbol: false, silent: true, z: 1,
            lineStyle: { width: 0 }, areaStyle: { color: css('--border'), opacity: 0.9 }, tooltip: { show: false } },
        ],
      }, { replaceMerge: ['series'] });
    }
    // a bar: its stretch of the route lights up on the map
    barsChart.on('mouseover', { seriesIndex: 0 }, (p) => {
      const b = bars[p.dataIndex];
      if (!map || !b || !S.geo.length) return;
      segLayer?.remove();
      const seg = S.geo.filter((i) => S.pts[i].dist / 1000 >= b.start && S.pts[i].dist / 1000 <= b.end).map((i) => [S.pts[i].lat, S.pts[i].lon]);
      segLayer = L.layerGroup([
        L.polyline(seg, { color: '#fff', weight: 11, opacity: 0.95, lineCap: 'round' }),
        L.polyline(seg, { color: css('--ink'), weight: 6, lineCap: 'round' }),
      ]).addTo(map);
    });
    barsChart.on('mouseout', { seriesIndex: 0 }, () => { segLayer?.remove(); segLayer = null; });

    // ---------- tabs and toggles ----------
    document.querySelectorAll('.tabs [data-tab]').forEach((t) => t.addEventListener('click', () => {
      document.querySelectorAll('.tabs [data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === t)));
      document.querySelectorAll('.analysis [data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== t.dataset.tab; });
      if (t.dataset.tab === 'splits') barsChart.resize();
      if (t.dataset.tab === 'effort') renderEffort();
    }));
    const press = (sel, btn) => document.querySelectorAll(sel).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    document.querySelectorAll('[data-bars]').forEach((b) => b.addEventListener('click', () => { barsMode = b.dataset.bars; press('[data-bars]', b); drawBars(); }));
    document.querySelectorAll('[data-measure]').forEach((b) => b.addEventListener('click', () => { barsMeasure = b.dataset.measure; press('[data-measure]', b); drawBars(); }));
    document.querySelectorAll('[data-colour]').forEach((b) => b.addEventListener('click', () => { colourBy = b.dataset.colour; press('[data-colour]', b); drawRoute(); }));


    $('close').addEventListener('click', closeModal);
    $('prev').addEventListener('click', () => step(-1));
    $('next').addEventListener('click', () => step(1));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (!openId) return;
      if (e.key === 'Escape') closeModal();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    });
    window.addEventListener('resize', () => { streamChart.resize(); barsChart.resize(); weChart.resize(); map?.invalidateSize(); });

    app.subscribe(() => {
      logFirst(detail, samples, laps, hrZones, runPlan, runContext, heatParam);
      renderDetail();
      if (openId) updateNav();
    });

    return { open: openActivity, close: closeModal, isOpen: () => !!openId, refreshNav: () => { if (openId) updateNav(); } };
  }

  window.Run.activityDetail = activityDetail;
})();
