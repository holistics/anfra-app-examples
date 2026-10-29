// What each number in the Overview's "Current form" banner is: shown in the modal a tile opens.
// Each metric: the series to chart (fields of the overview's `history` query, or `km7` / `km`
// computed from daily run distance), zones and reference lines, and the explanation: what it is,
// how it is computed (as the SQL in db/views.sql and db/views.d does it), how to read it, and
// related metrics the modal can switch to. Sources are in the README.
/* exported RunMetrics */
(function () {
  window.RunMetrics = {
    vo2: {
      title: 'Effective VO2max',
      unit: '',
      digits: 1,
      series: [
        { field: 'vo2e', name: 'Effective VO2max (yours)', color: '--accent-2', width: 2.5 },
        { field: 'vo2g', name: 'Garmin VO2max', color: '--muted', dashed: true, step: true },
      ],
      what: 'Your race fitness: the oxygen uptake your running pace implies at the heart rate you ran it at. The bigger it is, the faster every race distance.',
      how: 'Runalyze\'s method on each run: the oxygen cost of your pace (Daniels & Gilbert) divided by the share of your max heart rate you ran at. The tile is the duration-weighted mean of your runs over the last 30 days. Not calibrated to your races: the race predictions do that.',
      read: 'Watch the trend, not single days: heat and fatigue raise heart rate and pull it down for a while. +1 point is roughly 2 % faster over any distance. Garmin\'s value (dashed) is usually higher; Ran uses yours because it predicted your races better.',
      related: ['ctl', 'shape', 'predictions', 'threshold'],
    },

    shape: {
      title: 'Marathon shape',
      unit: '%',
      digits: 0,
      series: [{ field: 'shape', name: 'Marathon shape', color: '--accent', width: 2.5, area: true }],
      lines: [
        { y: 17, label: '10K needs 17 %' },
        { y: 43, label: 'Half needs 43 %' },
        { y: 100, label: 'Marathon needs 100 %' },
      ],
      what: 'Your endurance for long races: whether your training volume lets you use all of your VO2max over a distance.',
      how: 'Runalyze\'s basic endurance: ⅔ a weekly-km score over the last 26 weeks and ⅓ a long-run score (runs of 13 km or more over 70 days, longer runs weigh more). A distance needs distance^1.23 % (10K 17 %, half 43 %, marathon 100 %). Below that, the share of VO2max you can use is 0.6 + 0.4 × (1 − missing ÷ 100).',
      read: 'It moves slowly: it remembers 26 weeks. More weekly km and regular long runs raise it; a few light weeks lower it a little. For a marathon this is usually the biggest lever on your time.',
      related: ['km7', 'predictions', 'vo2', 'ctl'],
    },

    predictions: {
      title: 'Race predictions (Ran)',
      unit: '/km',
      pace: true,
      series: [
        { field: 'p5', km: 5, name: '5K', color: '--z5' },
        { field: 'p10', km: 10, name: '10K', color: '--z4' },
        { field: 'phalf', km: 21.0975, name: 'Half', color: '--accent-2' },
        { field: 'pmar', km: 42.195, name: 'Marathon', color: '--good', width: 2.5 },
      ],
      what: 'The time you would run each distance fully recovered, with the fitness and endurance you have today, in the conditions you train in, from Ran\'s causal model: the same one the Race Planner uses.',
      how: 'Daniels & Gilbert\'s time for your effective VO2max × the marathon-shape factor for that distance, × your calibration (actual ÷ predicted on your marked races, fitted by garmin-sync fit after every sync). No heat term (race heat = training heat) and no fatigue term: the calibration comes from your races, which you ran rested. Racing tired (form under 10 % of fitness) costs about 2 % more, the Race Planner\'s freshness term. The chart shows pace so the four distances share one axis; the tooltip gives the time.',
      read: 'The range is ± the method\'s mean error on your past races, each predicted only from earlier data. The short races follow VO2max; the marathon follows marathon shape. For a specific race, with its heat and a plan, use the Race Planner.',
      related: ['vo2', 'shape', 'threshold'],
    },

    atl: {
      title: 'Fatigue · ATL',
      unit: '',
      digits: 0,
      series: [
        { field: 'atl', name: 'Fatigue (ATL)', color: '--accent', width: 2.5 },
        { field: 'ctl', name: 'Fitness (CTL)', color: '--accent-2', width: 1.5 },
        { field: 'load', name: 'Daily load', bar: true, color: '--muted' },
      ],
      what: 'Short-term fatigue: how much training you have absorbed in about the last week.',
      how: 'Banister\'s model: a 7-day exponentially weighted average of daily training load (TRIMP, from your per-second heart rate). The tile also shows it as % of the highest it has ever been.',
      read: 'It rises fast after hard days and falls by about 1/7 a day when you rest. Above fitness (CTL) means you are carrying fatigue: normal while building, a reason to ease off if it stays far above for weeks.',
      related: ['ctl', 'tsb', 'acwr', 'load7'],
    },

    ctl: {
      title: 'Fitness · CTL',
      unit: '',
      digits: 0,
      series: [
        { field: 'ctl', name: 'Fitness (CTL)', color: '--accent-2', width: 2.5, area: true },
        { field: 'load', name: 'Daily load', bar: true, color: '--muted' },
      ],
      what: 'Long-term training load: the work your body has adapted to over about six weeks.',
      how: 'Banister\'s model: a 42-day exponentially weighted average of daily TRIMP. The tile also shows it as % of your highest.',
      read: 'It moves slowly; steady consistent weeks raise it. In your own history, effective VO2max rose about 0.11 per point of 30-day mean CTL (95 % range 0.03 to 0.19). Raise it gradually: the weekly increase matters more for injury than the level.',
      related: ['atl', 'tsb', 'vo2', 'load7'],
    },

    tsb: {
      title: 'Form · TSB',
      unit: '',
      digits: 0,
      series: [{ field: 'tsb', name: 'Form (TSB)', color: '--good', width: 2, area: true }],
      zones: [
        { from: 5, to: null, label: 'fresh', color: '--good' },
        { from: -10, to: 5, label: 'balanced', color: null },
        { from: -30, to: -10, label: 'training hard', color: '--warn' },
        { from: null, to: -30, label: 'very fatigued', color: '--bad' },
      ],
      what: 'Freshness: fitness minus fatigue. Negative while you train, positive after rest.',
      how: 'TSB = CTL − ATL, both from daily TRIMP (42- and 7-day averages).',
      read: 'Between −10 and −30 is the normal range of a training block. Below −30 for long raises the risk of overreaching. For a race you want it positive: the planner aims race morning at 10 to 30 % of your fitness (a taper).',
      related: ['ready', 'fresh', 'atl', 'ctl'],
    },

    tofresh: {
      title: 'Rest to form 0',
      unit: 'days',
      digits: 0,
      series: [
        { field: 'rest_days', name: 'Rest days to TSB 0', bar: true, color: '--warn', main: true },
        { field: 'tsb', name: 'Form (TSB)', color: '--good', width: 1.5, axis: 1 },
      ],
      what: 'How deep your fatigue is, in days: how many days with no training it would take to bring form (TSB) back to 0.',
      how: 'With no load, fatigue falls by 1/7 a day and fitness by 1/42, so TSB reaches 0 after ln(ATL ÷ CTL) ÷ (1/7 − 1/42) days, rounded up. When TSB can stay at 0 or above, the tile shows instead the most load tomorrow that keeps it there ("easy load").',
      read: 'It is a measure, not advice: it appears whenever TSB is below 0, which is most of a training block. It turns orange only below TSB −30. Before a race, plan those days into your taper.',
      related: ['tsb', 'atl', 'ctl'],
    },

    ready: {
      title: 'Ready to train',
      unit: 'days',
      digits: 0,
      series: [
        { field: 'ready_days', name: 'Rest days until ready to train', bar: true, color: '--accent-2', main: true },
        { field: 'tsb', name: 'Form (TSB)', color: '--good', width: 1.5, axis: 1 },
      ],
      what: 'How many days with no training you need before a normal training day is fine again. 0 means you can train today.',
      how: 'With no training, fatigue (ATL) falls by 1/7 a day and fitness (CTL) by 1/42. Ran counts the days until form (TSB = fitness − fatigue) is back above −30, the edge of the overload zone.',
      read: 'Most days it says “now”: being somewhat tired is normal while you build. It shows days after a race or a very big week. Easy runs are fine once it says now; keep hard sessions for when form is above about −10.',
      related: ['fresh', 'tsb', 'atl'],
    },

    fresh: {
      title: 'Fully fresh',
      unit: 'days',
      digits: 0,
      series: [
        { field: 'fresh_days', name: 'Rest days until fully fresh', bar: true, color: '--good', main: true },
        { field: 'tsb', name: 'Form (TSB)', color: '--accent-2', width: 1.5, axis: 1 },
      ],
      what: 'How many days with no training until you could race at 100 %: fatigue gone, fitness still there.',
      how: 'Same decay as “Ready to train” (fatigue −1/7 a day, fitness −1/42), counted until form (TSB) reaches +5, the start of the race-ready zone. When your fitness is too low for form to reach +5, it is the day form peaks.',
      read: 'A measure, not advice: you do not need to be fully fresh to train. Before a race, this is what the taper is for; a few easy days instead of full rest take a little longer.',
      related: ['ready', 'tsb', 'ctl'],
    },

    acwr: {
      title: 'A:C ratio',
      unit: '',
      digits: 2,
      series: [{ field: 'acwr', name: 'ATL ÷ CTL', color: '--accent', width: 2 }],
      zones: [
        { from: 1.5, to: null, label: 'spike', color: '--bad' },
        { from: 1.3, to: 1.5, label: 'caution', color: '--warn' },
        { from: 0.8, to: 1.3, label: '0.8–1.3', color: '--good' },
      ],
      what: 'Acute:chronic workload ratio: this week\'s load against what you are used to.',
      how: 'ATL ÷ CTL (7-day over 42-day weighted load).',
      read: 'Above 1.5 is a sudden spike (it raises the D10 ramp caution). Treat it as a caution, not a prediction: the evidence linking this ratio to injury is contested (Impellizzeri 2020). The weekly increase in km is the better-supported guide.',
      related: ['atl', 'ctl', 'km7', 'flags'],
    },

    monotony: {
      title: 'Monotony',
      unit: '',
      digits: 2,
      series: [{ field: 'monotony', name: 'Monotony', color: '--accent-2', width: 2 }],
      zones: [
        { from: 2, to: null, label: 'critical', color: '--bad' },
        { from: 1.5, to: 2, label: 'caution', color: '--warn' },
        { from: null, to: 1.5, label: 'good', color: '--good' },
      ],
      what: 'How alike your training days are. Hard and easy days, and rest days, keep it low.',
      how: 'Foster 1998: the mean of the last 7 days\' load ÷ its standard deviation (capped at 10).',
      read: 'Above 2 means every day looks the same: in Foster\'s athletes, high monotony with high load came before illness and staleness. Add a rest day or make easy days easier.',
      related: ['strain', 'load7', 'flags'],
    },

    strain: {
      title: 'Training strain',
      unit: '',
      digits: 0,
      series: [
        { field: 'strain', name: 'Strain', color: '--accent', width: 2 },
        { field: 'load_7d', name: '7-day load', color: '--muted', width: 1, dashed: true },
      ],
      what: 'The week\'s load weighted by how monotonous it was.',
      how: 'Foster 1998: 7-day load × monotony.',
      read: 'Compare it with your own history: peaks well above your usual are weeks to follow with an easier one.',
      related: ['monotony', 'load7', 'atl'],
    },

    load7: {
      title: 'Load · 7 days',
      unit: 'TRIMP',
      digits: 0,
      series: [
        { field: 'load_7d', name: '7-day load', color: '--accent', width: 2 },
        { field: 'load', name: 'Daily load', bar: true, color: '--muted' },
      ],
      what: 'The total training load of the last 7 days.',
      how: 'Sum of daily TRIMP (Banister): minutes × a weight that grows exponentially with heart-rate reserve, from each run\'s per-second heart rate. Garmin\'s own load is kept only for comparison.',
      read: 'Hard sessions count much more per minute than easy ones. Compare weeks with each other rather than with a fixed number.',
      related: ['atl', 'strain', 'km7'],
    },

    km7: {
      title: 'Running · 7 days',
      unit: 'km',
      digits: 1,
      series: [
        { field: 'km7', name: 'Last 7 days', color: '--accent', width: 2 },
        { field: 'km', name: 'Daily km', bar: true, color: '--muted' },
      ],
      what: 'How far you ran in the last 7 days.',
      how: 'Sum of running activities\' distance over a rolling 7 days.',
      read: 'Weekly km is the strongest training predictor of marathon time, and it feeds the marathon shape. Raise it gradually: increases above about 20 % a week injured more runners in ProjectRun21 (Damsted 2019); the planner flags over 10 % as a caution.',
      related: ['shape', 'load7', 'acwr'],
    },

    rhr: {
      title: 'Resting HR',
      unit: 'bpm',
      digits: 0,
      series: [
        { field: 'rhr7', name: '7-day average', color: '--bad', width: 2 },
        { field: 'rhr', name: 'Daily', color: '--muted', width: 1, dashed: true },
      ],
      what: 'Your heart rate at rest, from the watch overnight.',
      how: 'Garmin\'s daily resting HR; the tile shows the 7-day average.',
      read: 'A slow fall over months goes with better aerobic fitness. A sudden rise of 5 bpm or more above your usual (3-day mean against the 28-day median) can mean fatigue, illness, heat or poor sleep: it raises the D10 resting-HR caution.',
      related: ['flags', 'tsb', 'atl'],
    },

    threshold: {
      title: 'Threshold pace',
      unit: '/km',
      pace: true,
      series: [
        { field: 'lt_pace', name: 'Garmin threshold pace', color: '--muted', dashed: true, step: true },
        { field: 'lt_pace_own', name: 'Your pace at threshold HR', color: '--accent-2', width: 2, main: true },
      ],
      what: 'The fastest pace you can hold for about an hour (lactate threshold): it sets how much of your VO2max you can use in long races.',
      how: 'Garmin\'s lactate-threshold estimate (pace and heart rate). "Yours" is the median pace of your own runs at that threshold heart rate over 42 days, not heat-adjusted. Fractional utilisation = threshold speed ÷ speed at VO2max.',
      read: 'Faster is up. Threshold and cruise-interval sessions raise it. In heat your pace at the same heart rate is slower, so compare like seasons.',
      related: ['vo2', 'predictions'],
    },

    flags: {
      title: 'Injury-risk cautions',
      unit: 'flags',
      digits: 0,
      series: [
        { field: 'f_ramp', name: 'Load spike (A:C > 1.5)', bar: true, stack: 'f', color: '--bad' },
        { field: 'f_monotony', name: 'Monotony > 2', bar: true, stack: 'f', color: '--warn' },
        { field: 'f_no_rest', name: 'No rest day in 7', bar: true, stack: 'f', color: '--z3' },
        { field: 'f_rhr', name: 'Resting HR up', bar: true, stack: 'f', color: '--accent-2' },
      ],
      what: 'Days when a known risk factor was present. Cautions where risk is known to rise, not predictions of injury.',
      how: 'Four checks each day: A:C ratio above 1.5; monotony above 2; no day without training in the last 7; 3-day resting HR at least max(5 bpm, 1 SD) above its 28-day median.',
      read: 'One flag for a day or two is common. Several at once, or the same one for a week, is the time to ease off.',
      related: ['acwr', 'monotony', 'rhr'],
    },

    weight: {
      title: 'Weight',
      unit: 'kg',
      digits: 1,
      series: [{ field: 'weight', name: 'Weight', color: '--accent-2', width: 2, step: true }],
      what: 'Body weight, from your Garmin scale or what you log here.',
      how: 'The latest weigh-in on or before each day.',
      read: 'VO2max is per kg, so at the same fitness less weight means less oxygen per km. Change it slowly, if at all: under-fuelling costs more than a kilo saves.',
      related: ['vo2'],
    },
  };
})();
