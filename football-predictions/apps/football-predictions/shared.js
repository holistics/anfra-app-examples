// Football predictions: everything the four pages in this folder share.
// Each page calls setupFootball(view, title) after the Anfra SDK is loaded. The app list on the left is the navigation between pages.
window.setupFootball = function setupFootball (VIEW, TITLE) {
  // ---------- constants ----------
  const DATASET = 'football';
  const TZ = 'Asia/Ho_Chi_Minh';           // the same zone models/matches.model.aml uses for kickoff_date and kickoff_time
  // 16px stroke icons (HDS uses a 16px icon grid); no emoji anywhere in the UI
  const ICONS = {
    calendar: '<rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 7h12M5 1.5v3M11 1.5v3"/>',
    list: '<path d="M5 4h9M5 8h9M5 12h9"/><circle cx="2.5" cy="4" r=".8" fill="currentColor"/><circle cx="2.5" cy="8" r=".8" fill="currentColor"/><circle cx="2.5" cy="12" r=".8" fill="currentColor"/>',
    target: '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r=".6" fill="currentColor"/>',
    info: '<circle cx="8" cy="8" r="6"/><path d="M8 7.5v3.5M8 5.2v.2"/>',
    ball: '<circle cx="8" cy="8" r="6"/><path d="M8 5.2l2.6 1.9-1 3.1H6.4l-1-3.1L8 5.2zM8 2v3.2M3.4 6.9l2 .2M12.6 6.9l-2 .2M5.6 13.4l.8-3.2M10.4 13.4l-.8-3.2"/>',
    trend: '<path d="M2 12l3.5-4 2.5 2.5L14 4"/><path d="M10.5 4H14v3.5"/>',
    bandage: '<rect x="1.5" y="6" width="13" height="4" rx="2" transform="rotate(-45 8 8)"/><path d="M7 7l.01.01M9 9l.01.01M9 7l.01.01M7 9l.01.01"/>',
    card: '<rect x="4.5" y="2" width="7" height="12" rx="1.2"/>',
    stadium: '<path d="M2 7.5L8 3l6 4.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7.5z"/><path d="M6.5 14V9.5h3V14"/>',
    handshake: '<path d="M2 8.5l3-3 2.5 2.5a1.2 1.2 0 0 0 1.7 0L11 6l3 3M4 10.5l3 3M6 12.5l2 2M9.5 9.5l3 3"/>',
    bank: '<path d="M2 6.5L8 3l6 3.5H2zM3 6.5V12M6.5 6.5V12M9.5 6.5V12M13 6.5V12M2 13.5h12"/>',
    scale: '<path d="M8 2.5v11M3 13.5h10M8 4.5l-4 1.5m4-1.5l4 1.5M2 10.5a2 2 0 0 0 4 0L4 6zM10 10.5a2 2 0 0 0 4 0L12 6z"/>',
    flag: '<path d="M3.5 14V2.5M3.5 3h8l-1.5 2.5L11.5 8h-8"/>',
    swap: '<path d="M4 6l2.5-2.5L9 6M6.5 3.5V10M12 10l-2.5 2.5L7 10M9.5 12.5V6"/>',
    users: '<circle cx="6" cy="5.5" r="2.5"/><path d="M1.5 13.5a4.5 4.5 0 0 1 9 0M10.5 3.5a2.5 2.5 0 0 1 0 5M14.5 13.5a4.5 4.5 0 0 0-3-4.2"/>',
    check: '<path d="M3 8.5l3 3 7-7"/>',
    cross: '<path d="M4 4l8 8M12 4l-8 8"/>',
  };
  const icon = (name, cls = '') => `<span class="ic ${cls}" aria-hidden="true"><svg viewBox="0 0 16 16">${ICONS[name] || ''}</svg></span>`;
  // HDS icons from @holistics/icon (24px grid, filled). Used only where the UI mirrors an HDS component.
  const HICONS = {
    'sidebar-light': '<path fill-rule="evenodd" clip-rule="evenodd" d="M16.9 3.15c.548 0 1.004 0 1.375.03.38.03.737.098 1.074.27.517.264.938.685 1.202 1.202.172.337.238.694.27 1.074.03.37.03.827.03 1.375v9.8c0 .547 0 1.003-.03 1.374-.032.38-.099.737-.27 1.074a2.752 2.752 0 0 1-1.202 1.202c-.337.172-.694.238-1.074.27-.37.03-.827.03-1.375.03H7.1c-.547 0-1.003 0-1.374-.03-.38-.032-.737-.099-1.074-.27a2.752 2.752 0 0 1-1.202-1.202c-.172-.337-.24-.694-.27-1.074-.03-.37-.03-.827-.03-1.375V7.1c0-.547 0-1.003.03-1.374.03-.38.098-.737.27-1.074A2.752 2.752 0 0 1 4.652 3.45c.337-.172.694-.24 1.074-.27.37-.03.827-.03 1.375-.03h9.8Zm-6.85 16.2h6.85c.573 0 .957 0 1.253-.025.287-.023.425-.065.515-.111.235-.12.426-.311.546-.546.046-.09.088-.228.111-.515.024-.296.026-.68.026-1.253V7.1c0-.572-.002-.956-.026-1.252-.023-.287-.065-.424-.111-.515a1.25 1.25 0 0 0-.546-.546c-.09-.046-.228-.089-.515-.112-.296-.024-.68-.025-1.253-.025h-6.85v14.7ZM7.1 4.65c-.572 0-.956 0-1.252.025-.287.023-.424.066-.515.112a1.25 1.25 0 0 0-.546.546c-.046.09-.089.228-.112.515-.024.296-.025.68-.025 1.253v9.8c0 .572 0 .956.025 1.252.023.287.066.425.112.515.12.235.31.426.546.546.09.046.228.088.515.111.296.024.68.026 1.253.026h1.45V4.65H7.1Z"/>',
    'chevron-left': '<path d="M15.669 3.97a.75.75 0 1 1 1.06 1.06L9.56 12.2l7.17 7.168a.75.75 0 0 1-1.061 1.06l-7.7-7.699a.75.75 0 0 1 0-1.06l7.7-7.7Z"/>',
    'chevron-right': '<path d="M7.47 3.97a.75.75 0 0 1 1.06 0l7.7 7.7a.75.75 0 0 1 0 1.06l-7.7 7.7a.75.75 0 0 1-1.06-1.06l7.17-7.17-7.17-7.17a.75.75 0 0 1 0-1.06Z"/>',
    'collapse': '<path d="M10.57 6.97a.75.75 0 1 1 1.06 1.06L7.66 12l3.97 3.97a.75.75 0 1 1-1.06 1.06l-4.5-4.5a.75.75 0 0 1 0-1.06l4.5-4.5ZM16.87 6.97a.75.75 0 1 1 1.06 1.06L13.96 12l3.97 3.97a.75.75 0 1 1-1.06 1.06l-4.5-4.5a.75.75 0 0 1 0-1.06l4.5-4.5Z"/>',
    'sort-asc': '<path opacity=".3" d="M7.35 4a.75.75 0 0 1 .75.75v12.588l2.32-2.32a.75.75 0 1 1 1.06 1.061L7.89 19.67l-.032.03a.743.743 0 0 1-.508.202.743.743 0 0 1-.508-.203c-.01-.01-.022-.019-.031-.03L3.22 16.08a.75.75 0 1 1 1.06-1.06l2.32 2.319V4.75A.75.75 0 0 1 7.35 4Z"/><path d="m16.35 4 .076.004c.019.002.038.005.056.009.005 0 .01 0 .014.002.02.004.038.01.058.016.027.008.055.015.082.026.023.01.045.023.067.035a.748.748 0 0 1 .177.128l3.6 3.6a.75.75 0 0 1-1.06 1.06L17.1 6.56v12.59a.75.75 0 0 1-1.5 0V6.56l-2.32 2.32a.75.75 0 0 1-1.06-1.06l3.6-3.6a.747.747 0 0 1 .176-.13c.02-.01.04-.022.062-.031l.01-.004c.03-.013.061-.02.093-.029.013-.003.026-.009.039-.011l.017-.003A.757.757 0 0 1 16.35 4Z"/>',
    'sort-desc': '<path d="M7.35 4a.75.75 0 0 1 .75.75v12.588l2.32-2.32a.75.75 0 1 1 1.06 1.061L7.89 19.67l-.032.03a.743.743 0 0 1-.508.202.743.743 0 0 1-.508-.203c-.01-.01-.022-.019-.031-.03L3.22 16.08a.75.75 0 1 1 1.06-1.06l2.32 2.319V4.75A.75.75 0 0 1 7.35 4Z"/><path opacity=".3" d="m16.35 4 .076.004c.019.002.038.005.056.009.005 0 .01 0 .014.002.02.004.038.01.058.016.027.008.055.015.082.026.023.01.045.023.067.035a.748.748 0 0 1 .177.128l3.6 3.6a.75.75 0 0 1-1.06 1.06L17.1 6.56v12.59a.75.75 0 0 1-1.5 0V6.56l-2.32 2.32a.75.75 0 0 1-1.06-1.06l3.6-3.6a.747.747 0 0 1 .176-.13c.02-.01.04-.022.062-.031l.01-.004c.03-.013.061-.02.093-.029.013-.003.026-.009.039-.011l.017-.003A.757.757 0 0 1 16.35 4Z"/>',
    'exchange-arrow': '<path d="M7.5 4.05a.75.75 0 0 1 .75.75V17.39l2.32-2.32a.75.75 0 0 1 1.06 1.06L8.04 19.72l-.031.03a.754.754 0 0 1-.508.202.744.744 0 0 1-.509-.202l-.031-.03-3.59-3.59a.75.75 0 1 1 1.06-1.06l2.32 2.32V4.8a.75.75 0 0 1 .75-.75ZM16.5 4.05l.076.005.057.008.013.002c.02.004.039.012.058.017.027.008.055.014.082.025.024.01.045.024.067.036a.747.747 0 0 1 .177.128l3.6 3.6a.75.75 0 0 1-1.06 1.06l-2.32-2.32V19.2a.75.75 0 0 1-1.5 0V6.611l-2.32 2.32a.75.75 0 0 1-1.06-1.06l3.6-3.6c.056-.057.12-.1.187-.134.017-.01.033-.02.051-.028l.01-.004c.03-.012.062-.02.093-.028.014-.003.026-.009.04-.012l.016-.003a.755.755 0 0 1 .133-.011Z"/>',
    'ellipsis-horizontal': '<path d="M5.7 10.2a1.8 1.8 0 1 1 0 3.599 1.8 1.8 0 0 1 0-3.6ZM12 10.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6ZM18.3 10.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6Z"/>',
  };
  const hicon = (name, cls = '') => `<span class="ic hic ${cls}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor">${HICONS[name] || ''}</svg></span>`;
  const FORM_GROUP_ICON = { form: 'trend', venue: 'stadium', availability: 'bandage', discipline: 'card', h2h: 'handshake', market: 'bank' };

  // ---------- app and queries ----------
  const app = Anfra.createApp({ title: TITLE, timezone: TZ });

  const dayList = app.createQuery('dayList', { dataset: DATASET, aql: `
    explore {
      dimensions {
        match_id: matches.id, season: matches.season, round: matches.round,
        league_id: matches.league_id, league: matches.league_name, league_order: matches.league_order,
        kickoff_at: matches.kickoff_at, kickoff_date: matches.kickoff_date, time: matches.kickoff_time,
        status: matches.status, venue: matches.venue,
        home_id: matches.home_team_id, home: matches.home_team_name, home_short: matches.home_short, home_color: matches.home_color, home_crest: matches.home_crest_url,
        away_id: matches.away_team_id, away: matches.away_team_name, away_short: matches.away_short, away_color: matches.away_color, away_crest: matches.away_crest_url,
        home_goals: matches.home_goals, away_goals: matches.away_goals, ht_home: matches.ht_home, ht_away: matches.ht_away,
        home_corners: matches.home_corners, away_corners: matches.away_corners,
        pred_home: matches.pred_home, pred_away: matches.pred_away,
        p_home: matches.p_home, p_draw: matches.p_draw, p_away: matches.p_away, confidence: matches.confidence,
        predicted_outcome: matches.predicted_outcome, actual_outcome: matches.actual_outcome,
        result_hit: matches.result_hit, exact_hit: matches.exact_hit
      }
      sorts { league_order asc, kickoff_at asc, match_id asc }
    }` });

  const prediction = app.createQuery('prediction', { dataset: DATASET, aql: `
    explore {
      dimensions {
        match_id: predictions.match_id, generated_at: predictions.generated_at, model_version: predictions.model_version,
        league_avg: predictions.league_avg, lambda_home: predictions.lambda_home, lambda_away: predictions.lambda_away,
        pred_home: predictions.pred_home, pred_away: predictions.pred_away, p_top_score: predictions.p_top_score,
        pred_ht_home: predictions.pred_ht_home, pred_ht_away: predictions.pred_ht_away,
        p_home: predictions.p_home, p_draw: predictions.p_draw, p_away: predictions.p_away,
        p_over25: predictions.p_over25, p_btts: predictions.p_btts,
        exp_corners_home: predictions.exp_corners_home, exp_corners_away: predictions.exp_corners_away, p_corners_over95: predictions.p_corners_over95,
        confidence: predictions.confidence, confidence_label: predictions.confidence_label, signals: predictions.signals,
        pick_team_id: predictions.pick_team_id, pick_team: predictions.pick_team_name, key_scorer: predictions.key_scorer_name,
        insight: predictions.insight_text
      }
      sorts { match_id asc }
    }` });

  const factors = app.createQuery('factors', { dataset: DATASET, aql: `
    explore {
      dimensions { id: prediction_factors.id, team_id: prediction_factors.team_id, team: prediction_factors.team_name,
                   factor: prediction_factors.factor, multiplier: prediction_factors.multiplier, note: prediction_factors.note, grp: prediction_factors.group }
      sorts { team_id asc, id asc }
    }` });

  const whyRows = app.createQuery('whyRows', { dataset: DATASET, aql: `
    explore {
      dimensions { id: why.id, team_id: why.team_id, team: why.team_name, grp: why.grp, kind: why.kind, label: why.label, detail: why.detail,
                   value: why.value, at: why.happened_at, ord: why.ord }
      sorts { team_id asc, grp asc, ord asc, id asc }
    }` });

  const sides = app.createQuery('sides', { dataset: DATASET, aql: `
    explore { dimensions { team_id: team_matches.team_id, team: team_matches.team_name, is_home: team_matches.is_home } sorts { is_home desc } }` });

  const trend = app.createQuery('trend', { dataset: DATASET, aql: `
    explore {
      dimensions { period: team_matches.kickoff_at, team: team_matches.team_name }
      measures { gf: goals_for, ga: goals_against, pts: points, p: played }
      filters { team_matches.status == 'finished' }
      sorts { period asc, team asc }
    }` });

  const absences = app.createQuery('absences', { dataset: DATASET, aql: `
    explore {
      dimensions { id: availability.id, team_id: availability.team_id, team: availability.team_name, player: availability.player_name,
                   position: availability.position, shirt: availability.shirt_number, status: availability.status, reason: availability.reason,
                   since: availability.since, return_round: availability.expected_return_round }
      sorts { team_id asc, status asc, player asc }
    }` });

  const h2hRecord = app.createQuery('h2hRecord', { dataset: DATASET, aql: `
    explore {
      measures { played: played, w: wins, d: draws, l: losses, gf: goals_for, ga: goals_against }
      filters { team_matches.status == 'finished' }
    }` });

  const h2hMeetings = app.createQuery('h2hMeetings', { dataset: DATASET, pageSize: 10, aql: `
    explore {
      dimensions { id: team_matches.id, played_at: team_matches.kickoff_at, season: team_matches.season, is_home: team_matches.is_home,
                   gf: team_matches.goals_for, ga: team_matches.goals_against, result: team_matches.result }
      filters { team_matches.status == 'finished' }
      sorts { played_at desc }
    }` });

  const matrix = app.createQuery('matrix', { dataset: DATASET, aql: `
    explore {
      dimensions { home_goals: prediction_score_matrix.home_goals, away_goals: prediction_score_matrix.away_goals, p: prediction_score_matrix.probability }
      sorts { home_goals asc, away_goals asc }
    }` });

  const histQ = app.createQuery('history', { dataset: DATASET, aql: `
    explore {
      dimensions { id: prediction_history.id, at: prediction_history.generated_at, p_home: prediction_history.p_home, p_draw: prediction_history.p_draw,
                   p_away: prediction_history.p_away, signals: prediction_history.signals, reason: prediction_history.reason }
      sorts { at asc }
    }` });

  const odds = app.createQuery('odds', { dataset: DATASET, aql: `
    explore {
      dimensions { id: odds.id, at: odds.captured_at, bookmaker: odds.bookmaker, p_home: odds.p_home, p_draw: odds.p_draw, p_away: odds.p_away, p_over25: odds.p_over25 }
      sorts { at asc }
    }` });

  const scorers = app.createQuery('scorers', { dataset: DATASET, aql: `
    explore {
      dimensions { id: prediction_scorers.id, team_id: prediction_scorers.team_id, player: prediction_scorers.player_name, position: prediction_scorers.position,
                   shirt: prediction_scorers.shirt_number, share: prediction_scorers.goal_share, p: prediction_scorers.p_anytime }
      sorts { p desc }
    }` });

  const lineupQ = app.createQuery('lineups', { dataset: DATASET, aql: `
    explore {
      dimensions { id: lineups.id, team_id: lineups.team_id, team: lineups.team_name, coach: lineups.coach, player: lineups.player_name, shirt: lineups.shirt_number,
                   position: lineups.position, slot: lineups.slot_order, formation: lineups.formation, is_starter: lineups.is_starter, is_predicted: lineups.is_predicted,
                   is_captain: lineups.is_captain, age: lineups.age }
      sorts { team_id asc, slot asc }
    }` });

  const eventsQ = app.createQuery('events', { dataset: DATASET, aql: `
    explore {
      dimensions { id: match_events.id, team_id: match_events.team_id, minute: match_events.minute, type: match_events.type, player: match_events.player_name,
                   shirt: match_events.shirt_number, detail: match_events.detail }
      sorts { minute asc, id asc }
    }` });

  const STANDINGS_AQL = `
    explore {
      dimensions { team_id: team_matches.team_id, team: team_matches.team_name }
      measures { p: played, w: wins, d: draws, l: losses, gf: goals_for, ga: goals_against, gd: goals_for - goals_against, pts: points }
      filters { team_matches.status == 'finished' }
      sorts { pts desc, gd desc, gf desc, team asc }
    }`;
  const standingsQ = app.createQuery('standings', { dataset: DATASET, aql: STANDINGS_AQL });        // the selected match's league and season
  const leagueTableQ = app.createQuery('leagueTable', { dataset: DATASET, aql: STANDINGS_AQL });    // the Leagues page's pick

  const teamStatsQ = app.createQuery('teamStats', { dataset: DATASET, aql: `
    explore {
      dimensions { team_id: team_matches.team_id, team: team_matches.team_name }
      measures { p: played, w: wins, d: draws, l: losses, gf: goals_for, ga: goals_against, pts: points, gpm: goals_per_match, cpm: conceded_per_match,
                 corners: corners_per_match, cards: cards_per_match, cs: clean_sheets }
      filters { team_matches.status == 'finished' }
      sorts { team_id asc }
    }` });

  const leaguesQ = app.createQuery('leagues', { dataset: DATASET, aql: `
    explore { dimensions { id: leagues.id, name: leagues.name, country: leagues.country, order: leagues.sort_order } sorts { order asc } }` });

  const MATCH_ROW_DIMS = `
        match_id: matches.id, season: matches.season, round: matches.round,
        league_id: matches.league_id, league: matches.league_name, league_order: matches.league_order,
        kickoff_at: matches.kickoff_at, kickoff_date: matches.kickoff_date, time: matches.kickoff_time,
        status: matches.status, venue: matches.venue,
        home_id: matches.home_team_id, home: matches.home_team_name, home_short: matches.home_short, home_color: matches.home_color, home_crest: matches.home_crest_url,
        away_id: matches.away_team_id, away: matches.away_team_name, away_short: matches.away_short, away_color: matches.away_color, away_crest: matches.away_crest_url,
        home_goals: matches.home_goals, away_goals: matches.away_goals, ht_home: matches.ht_home, ht_away: matches.ht_away,
        home_corners: matches.home_corners, away_corners: matches.away_corners,
        pred_home: matches.pred_home, pred_away: matches.pred_away,
        p_home: matches.p_home, p_draw: matches.p_draw, p_away: matches.p_away, confidence: matches.confidence,
        predicted_outcome: matches.predicted_outcome, actual_outcome: matches.actual_outcome,
        result_hit: matches.result_hit, exact_hit: matches.exact_hit, api_outcome: matches.api_predicted_outcome, api_result_hit: matches.api_result_hit`;

  const leagueFixturesQ = app.createQuery('leagueFixtures', { dataset: DATASET, pageSize: 12, aql: `
    explore { dimensions { ${MATCH_ROW_DIMS} } filters { matches.status == 'upcoming' } sorts { kickoff_at asc, match_id asc } }` });

  const ACC_MEASURES = `measures { n: graded, hit: result_hit_rate, exact: exact_hit_rate, ou: over25_hit_rate, btts: btts_hit_rate, api_n: api_graded, api_hit: api_result_hit_rate, api_ou: api_over25_hit_rate }`;
  const accKpis = app.createQuery('accKpis', { dataset: DATASET, aql: `explore { ${ACC_MEASURES} filters { matches.status == 'finished' } }` });
  const accByBand = app.createQuery('accByBand', { dataset: DATASET, aql: `explore { dimensions { band: matches.confidence_band } ${ACC_MEASURES} filters { matches.status == 'finished' } sorts { band asc } }` });
  const accByLeague = app.createQuery('accByLeague', { dataset: DATASET, aql: `explore { dimensions { league: matches.league_name } ${ACC_MEASURES} filters { matches.status == 'finished' } sorts { n desc } }` });
  const gradedList = app.createQuery('gradedList', { dataset: DATASET, aql: `
    explore { dimensions { ${MATCH_ROW_DIMS} } filters { matches.status == 'finished' } sorts { kickoff_at desc, match_id desc } }` });

  const apiPred = app.createQuery('apiPred', { dataset: DATASET, aql: `
    explore {
      dimensions { match_id: api_predictions.match_id, p_home: api_predictions.p_home, p_draw: api_predictions.p_draw, p_away: api_predictions.p_away,
                   winner: api_predictions.winner_name, win_or_draw: api_predictions.win_or_draw, under_over: api_predictions.under_over,
                   goals_home: api_predictions.goals_home, goals_away: api_predictions.goals_away, advice: api_predictions.advice,
                   form_home: api_predictions.cmp_form_home, form_away: api_predictions.cmp_form_away, att_home: api_predictions.cmp_att_home, att_away: api_predictions.cmp_att_away,
                   def_home: api_predictions.cmp_def_home, def_away: api_predictions.cmp_def_away, h2h_home: api_predictions.cmp_h2h_home, h2h_away: api_predictions.cmp_h2h_away,
                   total_home: api_predictions.cmp_total_home, total_away: api_predictions.cmp_total_away }
    }` });
  // The instant the data was predicted at. scripts/predict.py stamps upcoming matches with its --now, so in a replay
  // (real past seasons fetched by scripts/fetch_api_football.py) this is the pretend today, and the app follows it.
  const asOfQ = app.createQuery('asOf', { dataset: DATASET, pageSize: 1, aql: `explore { dimensions { at: predictions.generated_at } sorts { at desc } }` });
  const nextDayQ = app.createQuery('nextDay', { dataset: DATASET, pageSize: 1, aql: `explore { dimensions { d: matches.kickoff_date } filters { matches.status == 'upcoming' } sorts { d asc } }` });

  const DETAIL = [prediction, factors, whyRows, sides, trend, absences, h2hRecord, h2hMeetings, matrix, histQ, odds, scorers, lineupQ, eventsQ, standingsQ, teamStatsQ, apiPred];
  const ALL = [dayList, ...DETAIL, leaguesQ, leagueTableQ, leagueFixturesQ, accKpis, accByBand, accByLeague, gradedList, asOfQ, nextDayQ];

  // ---------- controls (what the reader changes never goes into AQL text) ----------
  const sentinel = { operator: 'is', values: ['-1'] };
  const dayFilter = app.createFilter('day', { type: 'date', label: 'Day' });
  const matchId = app.createFilter('matchId', { type: 'number', default: sentinel });
  const homeTeamId = app.createFilter('homeTeamId', { type: 'number', default: sentinel });
  const awayTeamId = app.createFilter('awayTeamId', { type: 'number', default: sentinel });
  const teamIds = app.createFilter('teamIds', { type: 'number', default: sentinel });
  const cutoff = app.createFilter('cutoff', { type: 'date', default: { operator: 'before', values: ['1900-01-01'] } });

  app.mapControl(dayFilter, dayList, { field: 'matches.kickoff_date' });
  app.mapControl(matchId, prediction, { field: 'predictions.match_id' });
  app.mapControl(matchId, factors, { field: 'prediction_factors.match_id' });
  app.mapControl(matchId, whyRows, { field: 'why.match_id' });
  app.mapControl(matchId, sides, { field: 'team_matches.match_id' });
  app.mapControl(teamIds, trend, { field: 'team_matches.team_id' });
  app.mapCrossFilter(sides, trend);               // a side chip scopes the trend to that team
  const grain = app.createDateDrill('grain', { default: 'month', label: 'Trend grain' });
  app.mapControl(grain, trend, { field: 'team_matches.kickoff_at' });
  app.mapControl(matchId, matrix, { field: 'prediction_score_matrix.match_id' });
  app.mapControl(matchId, histQ, { field: 'prediction_history.match_id' });
  app.mapControl(matchId, odds, { field: 'odds.match_id' });
  app.mapControl(matchId, scorers, { field: 'prediction_scorers.match_id' });
  app.mapControl(teamIds, absences, { field: 'availability.team_id' });
  const absSince = app.createFilter('absSince', { type: 'date', default: { operator: 'before', values: ['1900-01-01'] } });
  app.mapControl(absSince, absences, { field: 'availability.since' });   // reports from the week before kickoff only
  app.mapControl(matchId, apiPred, { field: 'api_predictions.match_id' });
  for (const q of [h2hRecord, h2hMeetings]) {
    app.mapControl(homeTeamId, q, { field: 'team_matches.team_id' });
    app.mapControl(awayTeamId, q, { field: 'team_matches.opponent_id' });
    app.mapControl(cutoff, q, { field: 'team_matches.kickoff_at' });
  }
  const leagueId = app.createFilter('leagueId', { type: 'number', default: sentinel });
  const seasonF = app.createFilter('season', { type: 'string', default: { operator: 'is', values: ['-'] } });
  const pickLeagueId = app.createFilter('pickLeagueId', { type: 'number', default: { operator: 'is', values: ['1'] } });
  const pickSeason = app.createFilter('pickSeason', { dataset: DATASET, field: 'team_matches.season', label: 'Season', default: { operator: 'is', values: ['-'] } });
  const accLeague = app.createFilter('accLeague', { dataset: DATASET, field: 'matches.league_name', label: 'League' });
  const accSeason = app.createFilter('accSeason', { dataset: DATASET, field: 'matches.season', label: 'Season' });

  app.mapControl(matchId, lineupQ, { field: 'lineups.match_id' });
  app.mapControl(matchId, eventsQ, { field: 'match_events.match_id' });
  app.mapControl(leagueId, standingsQ, { field: 'team_matches.league_id' });
  app.mapControl(seasonF, standingsQ, { field: 'team_matches.season' });
  app.mapControl(teamIds, teamStatsQ, { field: 'team_matches.team_id' });
  app.mapControl(seasonF, teamStatsQ, { field: 'team_matches.season' });
  app.mapControl(seasonF, trend, { field: 'team_matches.season' });
  app.mapControl(pickLeagueId, leagueTableQ, { field: 'team_matches.league_id' });
  app.mapControl(pickSeason, leagueTableQ, { field: 'team_matches.season' });
  app.mapControl(pickLeagueId, leagueFixturesQ, { field: 'matches.league_id' });
  for (const q of [accKpis, accByBand, accByLeague, gradedList]) {
    app.mapControl(accLeague, q, { field: 'matches.league_name' });
    app.mapControl(accSeason, q, { field: 'matches.season' });
  }

  // ---------- state ----------
  let todayKey = dateKey(new Date());
  let nowMs = Date.now();
  function applyAsOf () {
    const at = parseTs(asOfQ.result?.rows?.[0]?.at);
    if (!at || Math.abs(at.getTime() - Date.now()) < 36 * 3600 * 1000) return;   // live data: the clock is right
    const key = dateKey(at);
    if (key === todayKey) return;
    todayKey = key; nowMs = at.getTime();
    if (!state.dayChosen) {
      // open on the first upcoming matchday (the as-of day itself may be an international break)
      const next = String(nextDayQ.result?.rows?.[0]?.d || '').slice(0, 10);
      state.day = next && next >= key ? next : key;
      dayFilter.setCondition({ operator: 'between', values: [state.day, state.day] });
      app.execute();
    }
  }
  // the Leagues tab starts on the first league in the data rather than a hardcoded id
  function applyDefaultLeague () {
    const rows = leaguesQ.result?.rows || [];
    if (state.leagueChosen || !rows.length || rows.some((r) => String(r.id) === state.pickLeague)) return;
    state.pickLeague = String(rows[0].id);
    pickLeagueId.setCondition({ operator: 'is', values: [state.pickLeague] });
    app.execute();
  }
  const state = { listCollapsed: false, view: VIEW, day: todayKey, match: null, tab: 'prediction', grain: 'month', pickLeague: '1', pickSeason: null, accLeague: '', accSeason: '', accFilter: '', accPage: 1, accPageSize: 25, focus: 'conf', off: new Set() };

  // ---------- helpers ----------
  function dateKey (d) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }
  function addDays (key, n) { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function dayLabel (key) {
    if (key === todayKey) return 'Today';
    if (key === addDays(todayKey, -1)) return 'Yesterday';
    if (key === addDays(todayKey, 1)) return 'Tomorrow';
    return new Date(`${key}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  }
  // The app declares timezone TZ, so the server returns datetimes as wall-clock time in TZ with no offset.
  // Read such a string as TZ wall time: take it as UTC first, then shift by TZ's offset at that moment.
  const tzParts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  function tzOffsetMs (utcDate) {
    const p = Object.fromEntries(tzParts.formatToParts(utcDate).map((x) => [x.type, x.value]));
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return wall - utcDate.getTime();
  }
  function parseTs (v) {
    if (v == null) return null;
    const s = String(v).replace(' ', 'T');
    if (/[zZ]|[+-]\d\d:\d\d$/.test(s)) return new Date(s);
    const asUtc = new Date(s + 'Z');
    if (Number.isNaN(asUtc.getTime())) return null;
    return new Date(asUtc.getTime() - tzOffsetMs(asUtc));
  }
  function fmtDate (v) { const d = parseTs(v); return d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ }) : ''; }
  function fmtDateTime (v) { const d = parseTs(v); return d ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }) : ''; }
  function ago (v) {
    const d = parseTs(v); if (!d) return '';
    const mins = Math.round((nowMs - d.getTime()) / 60000);
    if (Math.abs(mins) < 2) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
    return `${Math.round(mins / 1440)}d ago`;
  }
  function untilKickoff (v) {
    const d = parseTs(v); if (!d) return '';
    const mins = Math.round((d.getTime() - nowMs) / 60000);
    if (mins <= 0) return 'kicked off';
    if (mins < 60) return `kickoff in ${mins}m`;
    if (mins < 48 * 60) return `kickoff in ${Math.floor(mins / 60)}h ${mins % 60}m`;
    return `kickoff in ${Math.round(mins / 1440)}d`;
  }
  const num = (v) => (v == null || v === '' ? null : Number(v));
  const pct = (v, d = 0) => (num(v) == null ? '–' : `${(num(v) * 100).toFixed(d)}%`);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = (short, name) => esc(short || String(name || '').slice(0, 3).toUpperCase());
  function crest (color, short, name, size = '', url = '') {
    if (url && /^https?:\/\//.test(url)) return `<span class="crest ${size} img"><img src="${esc(url)}" alt="${esc(name)}" loading="lazy" referrerpolicy="no-referrer"></span>`;
    return `<span class="crest ${size}" style="background:${esc(color || '#555')}">${initials(short, name)}</span>`;
  }
  function confClass (c) { c = num(c); return c == null ? 'low' : c < 45 ? 'low' : c < 65 ? '' : 'high'; }
  function multClass (m) { m = num(m); return m > 1.005 ? 'up' : m < 0.995 ? 'down' : 'flat'; }
  function multText (m) { m = num(m); if (m == null) return ''; const d = (m - 1) * 100; return `${d >= 0 ? '+' : ''}${d.toFixed(0)}%`; }

  // The factors that really multiply into a team's λ, in the order predict.py applies them.
  // predict.py stores form_defence under the *opponent's* id ("Conceded N in last 5; applied to X's attack"),
  // so a team's chain is its own rows minus that one, plus the opponent's form_defence row.
  const CHAIN_LABEL = { form_attack: 'attack', form_defence: 'opp defence', home_advantage: 'home', away_disadvantage: 'away', discipline: 'discipline', head_to_head: 'h2h' };
  function lambdaChain (tid, oppId) {
    const rows = factors.result?.rows || [];
    const own = rows.filter((r) => String(r.team_id) === String(tid) && r.factor !== 'form_defence');
    const def = rows.find((r) => String(r.team_id) === String(oppId) && r.factor === 'form_defence');
    const order = ['form_attack', 'form_defence', 'home_advantage', 'away_disadvantage', 'discipline', 'head_to_head'];
    const all = def ? [...own, def] : own;
    const label = (r) => CHAIN_LABEL[r.factor] || (r.grp === 'availability' ? `${String(r.factor).split(':')[0]}: ${String(r.factor).split(':').slice(1).join(':')}` : r.factor);
    return all
      .sort((a, b) => (order.indexOf(a.factor) < 0 ? 99 : order.indexOf(a.factor)) - (order.indexOf(b.factor) < 0 ? 99 : order.indexOf(b.factor)))
      .map((r) => ({ id: String(r.id), label: label(r), mult: num(r.multiplier), note: r.note, grp: r.grp, team_id: r.team_id }));
  }
  const chainText = (chain, avg) => `${num(avg).toFixed(2)} avg ${chain.map((c) => `× ${c.mult.toFixed(2)} ${esc(c.label)}`).join(' ')}`;

  // ---------- "How was this number calculated", written for readers, top-down ----------
  const PLAIN_FACTOR = { attack: 'Recent attack (last 5)', 'opp defence': "Opponent's recent defence (last 5)", home: 'Home advantage', away: 'Away disadvantage', discipline: 'Discipline (red cards, last 5)', h2h: 'Head-to-head (last meetings)' };
  const factorName = (f) => (f.grp === 'availability' ? `Missing: ${String(f.label).split(': ').slice(1).join(': ')}` : PLAIN_FACTOR[f.label] || f.label);
  const factorWhy = (f) => (f.label === 'discipline' && Math.abs(f.mult - 1) < 0.0005 ? 'No red cards counted in the last 5' : String(f.note || '').replace(/league avg/g, 'league average').replace(/; applied to .*$/, ''));
  const f1 = (v) => (num(v) * 100).toFixed(1);
  const eq = (lhs, rhs, meaning) => `<div class="hm-formula"><b>${lhs}</b> = ${rhs}${meaning ? `<div class="meaning">${meaning}</div>` : ''}</div>`;
  const h = (t) => `<h4 class="hm-h">${t}</h4>`;
  const rowList = (rows) => `<div class="hm-rows">${rows.map((r) => `<div class="hm-row ${r.cur ? 'cur' : ''}"><div class="name">${r.name}${r.why ? `<span class="why">${r.why}</span>` : ''}</div>${r.val != null ? `<div class="val">${r.val}</div>` : ''}</div>`).join('')}</div>`;
  // collapsible level; open state survives switching explanations in the footer
  const openSecs = new Map();
  document.addEventListener('toggle', (e) => { const d = e.target; if (d.matches && d.matches('details.hm-sec')) openSecs.set(d.dataset.sec, d.open); }, true);
  const section = (id, title, html, open) => `<details class="hm-sec" data-sec="${id}" ${(openSecs.has(id) ? openSecs.get(id) : open) ? 'open' : ''}><summary>${title}</summary><div class="hm-sec-body">${html}</div></details>`;
  const sideName = (m, o) => (o === 'H' ? m.home : o === 'A' ? m.away : 'Draw');
  const outcomeName = (m, o) => (o === 'D' ? 'Draw' : `${sideName(m, o)} win`);
  const fact = (k) => (k <= 1 ? 1 : k * fact(k - 1));
  const poisson = (lam, k) => Math.exp(-lam) * Math.pow(lam, k) / fact(k);
  const HT_SHARE = 0.44;   // share of goals scored before half-time; a constant in scripts/predict.py
  function poissonGrid (lh, la) {
    let cells = [];
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) cells.push({ i, j, pv: poisson(lh, i) * poisson(la, j) });
    const tot = cells.reduce((a, x) => a + x.pv, 0);
    return cells.map((x) => ({ ...x, pv: x.pv / tot }));
  }
  // the projections predict.py derives from the same expected goals and grid
  function projectionsOf (lh, la, cells) {
    const over25 = cells.filter((x) => x.i + x.j >= 3).reduce((a, x) => a + x.pv, 0);
    const btts = cells.filter((x) => x.i > 0 && x.j > 0).reduce((a, x) => a + x.pv, 0);
    const htCells = poissonGrid(lh * HT_SHARE, la * HT_SHARE);
    const ht = [...htCells].sort((a, b) => b.pv - a.pv)[0];
    return { over25, btts, htCells, ht };
  }
  const scorerP = (lam, share) => 1 - Math.exp(-lam * num(share));
  function explainCtx () {
    const m = state.match, p = prediction.result?.rows?.[0];
    if (!m || !p) return null;
    const cells = (matrix.result?.rows || []).map((r) => ({ i: num(r.home_goals), j: num(r.away_goals), pv: num(r.p) }));
    const sorted = [...cells].sort((a, b) => b.pv - a.pv);
    const out = { H: num(p.p_home), D: num(p.p_draw), A: num(p.p_away) };
    const c = { m, p, cells, sorted, out, frows: factors.result?.rows || [], lh: num(p.lambda_home), la: num(p.lambda_away) };
    if (state.off.size && c.frows.length) {
      const w = computeCall(c, state.off);
      Object.assign(c, { cells: w.cells, sorted: w.sorted, out: w.out, lh: w.lh, la: w.la,
        p: { ...p, lambda_home: w.lh, lambda_away: w.la, p_home: w.out.H, p_draw: w.out.D, p_away: w.out.A, confidence: w.conf, p_top_score: w.top.pv, pred_home: w.top.i, pred_away: w.top.j } });
    }
    return c;
  }
  // the whole call recomputed in the browser from the factors that are switched on
  function computeCall (c, off) {
    const avg = num(c.p.league_avg);
    const prod = (tid, opp) => lambdaChain(tid, opp).filter((f) => !off.has(f.id)).reduce((a, f) => a * f.mult, avg);
    const lh = prod(c.m.home_id, c.m.away_id), la = prod(c.m.away_id, c.m.home_id);
    let cells = [];
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) cells.push({ i, j, pv: poisson(lh, i) * poisson(la, j) });
    const tot = cells.reduce((a, x) => a + x.pv, 0);
    cells = cells.map((x) => ({ ...x, pv: x.pv / tot }));
    const sorted = [...cells].sort((a, b) => b.pv - a.pv);
    const out = { H: 0, D: 0, A: 0 };
    cells.forEach((x) => { out[x.i > x.j ? 'H' : x.i < x.j ? 'A' : 'D'] += x.pv; });
    const r = Object.values(out).sort((a, b) => b - a);
    return { lh, la, cells, sorted, out, top: sorted[0], conf: Math.round(100 * (r[0] + (r[0] - r[1]) / 2)), ...projectionsOf(lh, la, cells) };
  }
  const sideOf = (c, side) => (side === 'H' ? { tid: c.m.home_id, opp: c.m.away_id, lam: c.lh, name: c.m.home, short: c.m.home_short } : { tid: c.m.away_id, opp: c.m.home_id, lam: c.la, name: c.m.away, short: c.m.away_short });
  function goalChances (c, side) {
    const s = sideOf(c, side);
    const ks = [0, 1, 2, 3, 4];
    const ps = ks.map((k) => poisson(s.lam, k));
    const rest = 1 - ps.reduce((a, v) => a + v, 0);
    return `<table class="hm-table hm-fixed"><thead><tr><th>${esc(s.short)} scores exactly</th>${ks.map((k) => `<th class="r">${k}</th>`).join('')}<th class="r">5+</th></tr></thead>
      <tbody><tr><td class="ev">from ${s.lam.toFixed(2)} expected goals</td>${ps.map((v) => `<td class="r">${f1(v)}%</td>`).join('')}<td class="r">${f1(rest)}%</td></tr></tbody></table>`;
  }
  const activeChain = (tid, opp) => lambdaChain(tid, opp).filter((f) => !state.off.has(f.id));
  function expectedGoalsEq (c, side) {
    const s = sideOf(c, side);
    const chain = activeChain(s.tid, s.opp);
    if (!c.frows.length) return `<p class="note">Factors still loading.</p>`;
    const avg = num(c.p.league_avg);
    return eq(s.lam.toFixed(2), `${avg.toFixed(2)} ${chain.map((f) => `× ${f.mult.toFixed(2)}`).join(' ')}`, `${esc(s.name)} expected goals = league average × ${chain.map((f) => esc(factorName(f)).toLowerCase()).join(' × ')}`) +
      rowList([{ name: 'League average', why: 'Goals per team per match in this league this season', val: avg.toFixed(2) },
        ...chain.map((f) => ({ name: `${icon(FORM_GROUP_ICON[f.grp] || 'info')} ${esc(factorName(f))}`, why: esc(factorWhy(f)), val: `× ${f.mult.toFixed(2)}` }))]);
  }
  function outcomeEq (c, key) {
    const test = key === 'H' ? (x) => x.i > x.j : key === 'A' ? (x) => x.i < x.j : (x) => x.i === x.j;
    const mine = c.sorted.filter(test);
    if (!mine.length) return eq(f1(c.out[key]), 'scoreline table still loading', '');
    const top = mine.slice(0, 4), rest = mine.slice(4).reduce((a, x) => a + x.pv, 0);
    const who = key === 'H' ? `${esc(c.m.home)} scores more than ${esc(c.m.away)}` : key === 'A' ? `${esc(c.m.away)} scores more than ${esc(c.m.home)}` : 'both sides score the same';
    return eq(f1(c.out[key]), `${top.map((x) => `${f1(x.pv)} (${x.i}–${x.j})`).join(' + ')}${mine.length > 4 ? ` + ${f1(rest)} (${mine.length - 4} smaller scorelines)` : ''}`,
      `${outcomeName(c.m, key)} chance = the chances of all ${mine.length} scorelines where ${who}, added up`);
  }
  function scorelineEq (c, x) {
    const pi = poisson(c.lh, x.i), pj = poisson(c.la, x.j);
    return eq(f1(x.pv), `${f1(pi)} × ${f1(pj)}`, `chance of ${x.i}–${x.j} ≈ chance ${esc(c.m.home)} scores exactly ${x.i} × chance ${esc(c.m.away)} scores exactly ${x.j}. "About", because the 64 scorelines up to 7–7 are rescaled to total 100%.`);
  }
  const modelLine = (c) => `<p class="note">Each side's goal chances come from its expected goals through a Poisson model, the standard way to turn expected goals into scoreline chances.</p>`;
  const chancesBlock = (c) => modelLine(c) + goalChances(c, 'H') + goalChances(c, 'A');
  const expectedBlock = (c, open) => section('expected', 'Where expected goals come from', expectedGoalsEq(c, 'H') + expectedGoalsEq(c, 'A'), open);
  const scorelineBlock = (c, x, open) => section('scoreline', 'Where a scoreline chance comes from', (x ? scorelineEq(c, x) : '') + chancesBlock(c), open);
  function gridTable (c, tint, hi) {
    if (!c.cells.length) return `<p class="note">Scoreline table still loading.</p>`;
    const byIJ = {}; c.cells.forEach((x) => { byIJ[`${x.i}-${x.j}`] = x.pv; });
    const head = `<tr><th></th>${[...Array(8).keys()].map((j) => `<th>${esc(c.m.away_short)} ${j}</th>`).join('')}</tr>`;
    const body = [...Array(8).keys()].map((i) => `<tr><th>${esc(c.m.home_short)} ${i}</th>${[...Array(8).keys()].map((j) => {
      const v = byIJ[`${i}-${j}`] ?? 0;
      return `<td class="${tint && tint(i, j) ? 'tint' : ''} ${hi && hi(i, j) ? 'hi' : ''}">${(v * 100).toFixed(1)}</td>`;
    }).join('')}</tr>`).join('');
    return `<div class="hm-grid-wrap"><table class="hm-grid"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }
  function explain (key) {
    const c = explainCtx();
    if (!c) return null;
    const { m, p, out, sorted } = c;
    const helper = `${esc(m.home)} v ${esc(m.away)} · predicted ${esc(fmtDateTime(p.generated_at))}`;
    if (key === 'confidence') {
      const ranked = Object.entries(out).sort((a, b) => b[1] - a[1]);
      const [topK, top] = ranked[0], [secK, second] = ranked[1], [thirdK, third] = ranked[2];
      const half = (top - second) / 2;
      const conf = Math.round(100 * (top + half));
      const bands = [['Low', 'under 45'], ['Moderate', '45 to 54'], ['High', '55 to 64'], ['Very high', '65 and above']];
      const cur = conf < 45 ? 0 : conf < 55 ? 1 : conf < 65 ? 2 : 3;
      const k = accKpis.result?.rows?.[0];
      const biggest = sorted.find((x) => (topK === 'H' ? x.i > x.j : topK === 'A' ? x.i < x.j : x.i === x.j));
      return { title: `How confidence ${esc(p.confidence)} was calculated`, helper, body:
        eq(conf, `${f1(top)} + ${f1(half)}`, `the strongest outcome's chance (${outcomeName(m, topK)} ${f1(top)}%) plus half its lead over the next`) +
        eq(f1(half), `(${f1(top)} − ${f1(second)}) / 2`, `half the gap between ${outcomeName(m, topK)} ${f1(top)}% and the next most likely outcome, ${outcomeName(m, secK)} ${f1(second)}%. ${outcomeName(m, thirdK)} is third at ${f1(third)}%.`) +
        section('outcomes', `Where ${f1(top)} and ${f1(second)} come from`, outcomeEq(c, topK) + outcomeEq(c, secK), true) +
        scorelineBlock(c, biggest, false) +
        expectedBlock(c, false) +
        section('meaning', `What ${conf} means`, rowList(bands.map(([n, r], i) => ({ name: n, why: r, cur: i === cur }))) +
          `<p class="note">Confidence says how clear-cut the call is, not how often it is right.${k ? ` Across ${esc(k.n)} finished matches this model has called the result correctly ${pct(k.hit)} of the time.` : ''} The Accuracy page shows the hit rate for each band.</p>`, true) };
    }
    if (key === 'score') {
      const best = sorted[0];
      const next = sorted.slice(1, 4);
      const scoreO = num(p.pred_home) > num(p.pred_away) ? 'H' : num(p.pred_home) < num(p.pred_away) ? 'A' : 'D';
      const likely = Object.entries(out).sort((a, b) => b[1] - a[1])[0][0];
      return { title: `How the headline score ${esc(p.pred_home)}–${esc(p.pred_away)} was chosen`, helper, body:
        eq(`${esc(p.pred_home)}–${esc(p.pred_away)}`, `the single most likely scoreline, ${f1(p.p_top_score)}%`, next.length ? `next: ${next.map((x) => `${x.i}–${x.j} ${f1(x.pv)}%`).join(' · ')}` : '') +
        (scoreO !== likely ? `<p class="note">${esc(p.pred_home)}–${esc(p.pred_away)} is a ${scoreO === 'D' ? 'draw' : `${esc(sideName(m, scoreO))} win`}, yet ${outcomeName(m, likely)} is the more likely outcome at ${f1(out[likely])}%: one scoreline can be the biggest on its own while the many ${likely === 'D' ? 'drawn' : `${esc(sideName(m, likely))} winning`} scorelines add up to more.</p>` : '') +
        scorelineBlock(c, best, true) +
        expectedBlock(c, true) +
        section('grid', 'All 64 scorelines', gridTable(c, null, (i, j) => best && i === best.i && j === best.j) +
          `<div class="hm-legend"><span>rows: ${esc(m.home_short)} goals · columns: ${esc(m.away_short)} goals · outlined: the headline</span></div>`, false) };
    }
    if (key === 'H' || key === 'D' || key === 'A') {
      const test = key === 'H' ? (i, j) => i > j : key === 'A' ? (i, j) => i < j : (i, j) => i === j;
      const biggest = sorted.find((x) => test(x.i, x.j));
      return { title: `How ${outcomeName(m, key)} ${f1(out[key])}% was calculated`, helper, body:
        outcomeEq(c, key) +
        eq('100', `${f1(out.H)} + ${f1(out.D)} + ${f1(out.A)}`, `${outcomeName(m, 'H')} + Draw + ${outcomeName(m, 'A')}: every scoreline belongs to exactly one of them`) +
        scorelineBlock(c, biggest, false) +
        expectedBlock(c, true) +
        section('grid', 'All 64 scorelines', gridTable(c, test, null) +
          `<div class="hm-legend"><span><i style="background:#e8f2fd;border:1px solid #8dbef2"></i>counted for ${outcomeName(m, key)}</span><span>rows: ${esc(m.home_short)} goals · columns: ${esc(m.away_short)} goals</span></div>`, false) };
    }
    if (key === 'signals') {
      const rows = c.frows;
      const side = (tid) => rows.filter((r) => String(r.team_id) === String(tid));
      const table = (tid) => rowList(side(tid).map((r) => {
        const f = { label: CHAIN_LABEL[r.factor] || r.factor, mult: num(r.multiplier), note: r.note, grp: r.grp };
        return { name: esc(factorName(f)) + (r.factor === 'form_defence' ? ` <span class="ev">(applies to the other side's attack)</span>` : ''), why: esc(factorWhy(f)), val: multText(r.multiplier) || '0%' };
      }));
      const nh = side(m.home_id).length, na = side(m.away_id).length;
      return { title: `What the ${esc(p.signals)} signals are`, helper, body:
        (rows.length ? eq(rows.length, `${nh} for ${esc(m.home)} + ${na} for ${esc(m.away)}`, 'one signal is one thing we know about a side that moves its expected goals up or down') : '<p class="note">Signals still loading.</p>') +
        section('sig-home', esc(m.home), table(m.home_id), true) + section('sig-away', esc(m.away), table(m.away_id), true) +
        `<p class="note" style="margin-top:12px">The call is refreshed 48 hours, 24 hours and 2 hours before kickoff. When team news changes who is missing, the count moves and the probability chart marks that moment as "team news".</p>` };
    }
    return null;
  }

  function leagueBadge (row) {
    const colors = { 1: '#3d195b', 2: '#024494', 3: '#ee8707' };
    return `<span class="badge" style="background:${colors[row.league_id] || '#444'}">${esc(String(row.league).split(' ').map((w) => w[0]).join('').slice(0, 2))}</span>`;
  }
  function qStatus (q, emptyText) {
    // A re-executing query keeps its previous result, which may belong to another match: always show loading.
    if (q.state === 'idle' || q.state === 'executing' || !q.result) return `<div class="spinner">Loading…</div>`;
    if (q.state === 'error') return `<div class="error">${esc(q.error?.name === 'PermissionError' ? 'No access to this data.' : `Couldn't load: ${q.error?.message}`)}</div>`;
    if (q.state === 'success' && q.result.rows.length === 0) return `<div class="empty">${esc(emptyText)}</div>`;
    return null;
  }
  const logged = new Set();
  function logFirst (q) {
    if (q.state !== 'success' || logged.has(q.name)) return;
    logged.add(q.name);
    console.log(`[${q.name}]`, 'columns', q.result.columns.map((c) => `${c.name}:${c.semantic_type}`), 'first row', q.result.rows[0], 'aql', q.result.debug?.executedAql);
  }

  // ---------- actions ----------
  function setDay (key) {
    state.day = key; state.dayChosen = true;
    dayFilter.setCondition({ operator: 'between', values: [key, key] });
    app.execute();
    render();
  }
  function openMatch (row) {
    if (VIEW !== 'matches') return;   // other pages cannot navigate here: the app list on the left is the navigation
    state.match = row; state.tab = 'prediction'; state.focus = 'conf'; state.off = new Set(); app.clearSelection();
    matchId.setCondition({ operator: 'is', values: [row.match_id] });
    homeTeamId.setCondition({ operator: 'is', values: [row.home_id] });
    awayTeamId.setCondition({ operator: 'is', values: [row.away_id] });
    teamIds.setCondition({ operator: 'is', values: [row.home_id, row.away_id] });
    cutoff.setCondition({ operator: 'before', values: [String(row.kickoff_date).slice(0, 10)] });
    absSince.setCondition({ operator: 'between', values: [addDays(String(row.kickoff_date).slice(0, 10), -7), String(row.kickoff_date).slice(0, 10)] });
    leagueId.setCondition({ operator: 'is', values: [row.league_id] });
    seasonF.setCondition({ operator: 'is', values: [row.season] });
    if (row.kickoff_date && String(row.kickoff_date).slice(0, 10) !== state.day) {
      state.day = String(row.kickoff_date).slice(0, 10); state.dayChosen = true;
      dayFilter.setCondition({ operator: 'between', values: [state.day, state.day] });
    }
    app.execute();
    render();
    window.scrollTo(0, 0);
  }
  function pickLeague (id) { state.pickLeague = String(id); state.leagueChosen = true; pickLeagueId.setCondition({ operator: 'is', values: [String(id)] }); app.execute(); render(); }
  function pickSeasonValue (v) { state.pickSeason = v; pickSeason.setCondition({ operator: 'is', values: [v] }); app.execute(); render(); }
  function setAcc (which, v) {
    if (which === 'league') { state.accLeague = v; accLeague.setCondition({ operator: 'is', values: v ? [v] : [] }); }
    else { state.accSeason = v; accSeason.setCondition({ operator: 'is', values: v ? [v] : [] }); }
    app.execute(); render();
  }
  pickSeason.loadOptions().then((opts) => { state.seasonOptions = (opts || []).map(String).sort().reverse(); render(); }).catch((e) => console.error('season options', e));
  accLeague.loadOptions().then((o) => { state.accLeagueOptions = (o || []).map(String); render(); }).catch(() => {});
  accSeason.loadOptions().then((o) => { state.accSeasonOptions = (o || []).map(String).sort().reverse(); render(); }).catch(() => {});

  // ---------- render ----------
  const main = document.getElementById('main');
  let evoChart = null;

  function render () {
    ALL.forEach(logFirst);
    if (asOfQ.state === 'success' && nextDayQ.state !== 'executing' && nextDayQ.state !== 'idle') applyAsOf();
    if (leaguesQ.state === 'success') applyDefaultLeague();

    if (VIEW === 'matches') renderMatches();
    else if (VIEW === 'leagues') renderLeagues();
    else if (VIEW === 'accuracy') renderAccuracy();
    else renderAbout();
  }

  function toggleList () { state.listCollapsed = !state.listCollapsed; applyListCollapse(); }
  function applyListCollapse () {
    const md = document.querySelector('.md'); if (!md) return;
    md.classList.toggle('list-collapsed', state.listCollapsed);
    const b = document.getElementById('list-toggle'); if (b) b.title = b.ariaLabel = state.listCollapsed ? 'Show match list' : 'Hide match list';
  }

  // Matches view: list column on the left, the selected match on the right.
  function renderMatches () {
    if (!document.getElementById('list')) {
      main.innerHTML = `
        <div class="md">
          <div class="list-col" data-anfra-container="list" data-anfra-label="Match list">
            <button type="button" class="list-rail" id="list-rail" title="Show match list" aria-label="Show match list">${hicon('chevron-right')}<span class="vlabel">${icon('calendar')}Matches</span></button>
            <div class="list-body">
              <div class="list-head">
                <div id="days" class="days" data-anfra-block="day-strip" data-anfra-label="Day strip" data-anfra-control="day"></div>
                <button type="button" class="hbtn sm" id="list-toggle" title="Hide match list" aria-label="Hide match list">${hicon('collapse')}</button>
              </div>
              <div id="list" data-anfra-block="match-list" data-anfra-label="Matches" data-anfra-query="dayList"></div>
            </div>
          </div>
          <div id="detail" class="detail" data-anfra-container="detail" data-anfra-label="Match detail"></div>
        </div>`;
      document.getElementById('list-toggle').addEventListener('click', toggleList);
      document.getElementById('list-rail').addEventListener('click', toggleList);
    }
    applyListCollapse();
    renderDays();
    renderList();
    renderDetail();
  }

  function renderDays () {
    const days = [-1, 0, 1, 2, 3, 4, 5].map((n) => addDays(todayKey, n));
    if (!days.includes(state.day)) days.unshift(state.day);
    const el = document.getElementById('days');
    el.innerHTML = days.map((k) => `<button type="button" data-day="${k}" class="${k === state.day ? 'active' : ''}">${dayLabel(k)}<small>${k.slice(5)}</small></button>`).join('');
    el.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => setDay(b.dataset.day)));
  }

  function renderList () {
    const el = document.getElementById('list');
    const st = qStatus(dayList, 'No matches on this day.');
    if (st) { el.innerHTML = st; return; }
    const rows = dayList.result.rows;
    let html = '', lastLeague = null;
    rows.forEach((r, i) => {
      if (r.league_id !== lastLeague) { html += `<div class="league">${leagueBadge(r)}${esc(r.league)}</div>`; lastLeague = r.league_id; }
      html += matchCard(r, i);
    });
    el.innerHTML = html;
    el.querySelectorAll('.match').forEach((c) => c.addEventListener('click', () => openMatch(rows[Number(c.dataset.i)])));
  }

  function matchCard (r, i) {
    const fin = r.status === 'finished';
    const hit = fin ? r.result_hit === true || r.result_hit === 'true' : null;
    const selected = state.match && String(state.match.match_id) === String(r.match_id);
    return `
      <div class="card match ${selected ? 'selected' : ''}" data-i="${i}">
        <div class="row">
          ${crest(r.home_color, r.home_short, r.home, 'sm', r.home_crest)}<span class="n">${esc(r.home)}</span>
          <span class="mid">${fin ? `${esc(r.home_goals)}–${esc(r.away_goals)}` : esc(r.time)}<small class="${fin ? 'ft' : ''}">${fin ? 'FT' : 'Upcoming'}</small></span>
          <span class="n r">${esc(r.away)}</span>${crest(r.away_color, r.away_short, r.away, 'sm', r.away_crest)}
        </div>
        <div class="ai">
          <span class="label">AI ${fin ? 'called' : 'predicts'}</span>
          <span class="score">${esc(r.pred_home ?? '?')} – ${esc(r.pred_away ?? '?')}</span>
          ${fin ? `<span class="pill sm ${hit ? 'hit' : 'miss'}">${hit ? 'Result hit' : 'Result missed'}${(r.exact_hit === true || r.exact_hit === 'true') ? ', exact score' : ''}</span>`
                : `<span class="pill sm conf ${confClass(r.confidence)}">${esc(r.confidence ?? '–')}% conf</span>`}
        </div>
      </div>`;
  }

  function renderDetail () {
    const el = document.getElementById('detail');
    const m = state.match;
    if (!m) { el.innerHTML = `<div class="placeholder"><b>Pick a match</b>The AI call, why it was made, and the full score grid appear here.</div>`; return; }
    const fin = m.status === 'finished';
    const tabs = [['prediction', 'Prediction'], ['how', "How it's made"], ['h2h', 'H2H'], ['stats', 'Stats'], ['lineup', 'Lineup'], ['events', 'Events'], ['standings', 'Standings']];
    el.innerHTML = `
      <section class="card hero" data-anfra-block="match-header" data-anfra-label="Match header" data-anfra-query="dayList">
        <div class="teams">
          <div class="team">${crest(m.home_color, m.home_short, m.home, 'lg', m.home_crest)}<span>${esc(m.home)}</span></div>
          <div class="kick">
            <div class="time">${fin ? `${esc(m.home_goals)} – ${esc(m.away_goals)}` : esc(m.time)}</div>
            <div class="status ${fin ? 'ft' : ''}">${fin ? `Full time · HT ${esc(m.ht_home)}–${esc(m.ht_away)}` : 'Upcoming'}</div>
          </div>
          <div class="team right">${crest(m.away_color, m.away_short, m.away, 'lg', m.away_crest)}<span>${esc(m.away)}</span></div>
        </div>
        <div class="meta">${esc(m.league)} · Round ${esc(m.round)} · ${esc(m.venue)} · ${esc(String(m.kickoff_date).slice(0, 10))} ${esc(m.time)}</div>
      </section>
      <div class="tabs" data-anfra-block="tabs" data-anfra-label="Tabs">
        ${tabs.map(([k, t]) => `<button type="button" data-tab="${k}" class="${state.tab === k ? 'active' : ''}">${t}</button>`).join('')}
      </div>
      <div id="tab-body"></div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; render(); }));
    const body = document.getElementById('tab-body');
    ({ prediction: renderPrediction, how: renderHow, h2h: renderH2H, stats: renderStats, lineup: renderLineup, events: renderEvents, standings: renderStandingsTab })[state.tab](body);
  }

  // ----- H2H tab -----
  function renderH2H (body) {
    const m = state.match;
    const rec = h2hRecord.result?.rows?.[0];
    const st = qStatus(h2hMeetings, 'These two have not met before this match in the data.');
    const played = rec ? num(rec.played) : 0;
    const w = rec ? num(rec.w) : 0, d = rec ? num(rec.d) : 0, l = rec ? num(rec.l) : 0;
    body.innerHTML = `<div class="h2h-grid">
      <section class="card record" data-anfra-block="h2h-record" data-anfra-label="Head-to-head record" data-anfra-query="h2hRecord">
        <div class="label">Head-to-head record</div>
        <div class="note">${played ? `${played} meetings before this kickoff` : 'No meetings before this kickoff'}</div>
        <div class="nums"><div><b style="color:var(--home)">${w}</b><span>${esc(m.home)}</span></div><div><b style="color:var(--draw)">${d}</b><span>Draws</span></div><div><b style="color:var(--away)">${l}</b><span>${esc(m.away)}</span></div></div>
        ${played ? `<div class="bar"><span style="width:${w / played * 100}%;background:var(--home)"></span><span style="width:${d / played * 100}%;background:var(--draw)"></span><span style="width:${l / played * 100}%;background:var(--away)"></span></div>
        <div class="note" style="margin-top:8px">Goals ${esc(rec.gf)}–${esc(rec.ga)} on aggregate, seen from ${esc(m.home)}</div>` : ''}
      </section>
      <section class="card" data-anfra-block="h2h-meetings" data-anfra-label="Recent meetings" data-anfra-query="h2hMeetings">
        <div class="label" style="margin-bottom:6px">Recent meetings</div>
        ${st || h2hMeetings.result.rows.map((r) => {
          const homeSide = r.is_home === '1';
          const hg = homeSide ? r.gf : r.ga, ag = homeSide ? r.ga : r.gf;
          return `<div class="meet"><span class="d">${esc(fmtDate(r.played_at))}</span><span class="d">${esc(r.season)}</span><span class="r">${esc(homeSide ? m.home : m.away)}</span><span class="s">${esc(hg)} – ${esc(ag)}</span><span>${esc(homeSide ? m.away : m.home)}</span></div>`;
        }).join('')}
      </section></div>`;
  }

  // ----- Stats tab -----
  function renderStats (body) {
    const m = state.match;
    const st = qStatus(teamStatsQ, 'No finished matches this season yet.');
    if (st) { body.innerHTML = `<section class="card" data-anfra-block="team-stats" data-anfra-label="Team stats" data-anfra-query="teamStats standings">${st}</section>`; return; }
    const rows = teamStatsQ.result.rows;
    const h = rows.find((r) => String(r.team_id) === String(m.home_id)) || {}, a = rows.find((r) => String(r.team_id) === String(m.away_id)) || {};
    const table = standingsQ.result?.rows || [];
    const pos = (tid) => { const i = table.findIndex((r) => String(r.team_id) === String(tid)); return i < 0 ? '–' : `${i + 1}${['st', 'nd', 'rd'][i] || 'th'}`; };
    const f1 = (v) => (num(v) == null ? '–' : num(v).toFixed(1)), f2 = (v) => (num(v) == null ? '–' : num(v).toFixed(2));
    const lines = [
      ['League position', pos(m.home_id), pos(m.away_id), null],
      ['Played', h.p, a.p, null], ['Won', h.w, a.w, 1], ['Drawn', h.d, a.d, null], ['Lost', h.l, a.l, -1],
      ['Points', h.pts, a.pts, 1], ['Points per game', f2(num(h.pts) / (num(h.p) || 1)), f2(num(a.pts) / (num(a.p) || 1)), 1],
      ['Goals for', h.gf, a.gf, 1], ['Goals against', h.ga, a.ga, -1],
      ['Goals per match', f2(h.gpm), f2(a.gpm), 1], ['Conceded per match', f2(h.cpm), f2(a.cpm), -1],
      ['Corners per match', f1(h.corners), f1(a.corners), 1], ['Cards per match', f2(h.cards), f2(a.cards), -1], ['Clean sheets', h.cs, a.cs, 1],
    ];
    body.innerHTML = `<section class="card" data-anfra-block="team-stats" data-anfra-label="Team stats" data-anfra-query="teamStats standings">
      <table class="stats">
        <tr class="head"><td class="v" style="color:var(--home)">${esc(m.home)}</td><td class="k">Season ${esc(m.season)}</td><td class="v" style="color:var(--away)">${esc(m.away)}</td></tr>
        ${lines.map(([k, hv, av, dir]) => {
          const hn = num(hv), an = num(av);
          const hb = dir && hn != null && an != null && (dir > 0 ? hn > an : hn < an), ab = dir && hn != null && an != null && (dir > 0 ? an > hn : an < hn);
          return `<tr><td class="v ${hb ? 'best' : ''}">${esc(hv ?? '–')}</td><td class="k">${k}</td><td class="v ${ab ? 'best' : ''}">${esc(av ?? '–')}</td></tr>`;
        }).join('')}
      </table>
      <div class="note" style="margin-top:8px">Finished matches of the current season only. Green marks the better side of each line.</div>
    </section>`;
  }

  // ----- Lineup tab -----
  function formationLines (formation) { return [1, ...String(formation || '4-4-2').split('-').map((n) => Number(n) || 0)]; }
  function pitchSvg (starters, color) {
    const W = 300, H = 400;
    const lines = formationLines(starters[0]?.formation);
    let out = `<svg class="pitch" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="${W - 16}" height="${H - 16}" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2" rx="4"/>
      <line x1="8" y1="${H / 2}" x2="${W - 8}" y2="${H / 2}" stroke="rgba(255,255,255,0.55)" stroke-width="2"/>
      <circle cx="${W / 2}" cy="${H / 2}" r="36" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2"/>
      <rect x="${W / 2 - 80}" y="8" width="160" height="56" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2"/>
      <rect x="${W / 2 - 80}" y="${H - 64}" width="160" height="56" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2"/>`;
    let idx = 0;
    lines.forEach((count, li) => {
      const y = H - 40 - li * ((H - 90) / Math.max(1, lines.length - 1));
      for (let k = 0; k < count; k++) {
        const p = starters[idx++]; if (!p) continue;
        const x = (W / (count + 1)) * (k + 1);
        const cap = p.is_captain === '1' ? `<text x="${x + 13}" y="${y - 10}" font-size="9" fill="#ffd54a" font-weight="700">C</text>` : '';
        out += `<g><circle cx="${x}" cy="${y}" r="15" fill="#fff" stroke="${esc(color)}" stroke-width="3"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#1b1b1f">${esc(p.shirt)}</text>${cap}
                <text x="${x}" y="${y + 29}" text-anchor="middle" font-size="10" font-weight="600" fill="#fff">${esc(String(p.player).split(' ').slice(-1)[0])}</text></g>`;
      }
    });
    return out + '</svg>';
  }
  function renderLineup (body) {
    const m = state.match;
    const st = qStatus(lineupQ, 'No lineup for this match.');
    if (st) { body.innerHTML = `<section class="card" data-anfra-block="lineups" data-anfra-label="Lineups" data-anfra-query="lineups">${st}</section>`; return; }
    const rows = lineupQ.result.rows;
    const outs = absences.result?.rows || [];
    const side = (tid, color, name) => {
      const rs = rows.filter((r) => String(r.team_id) === String(tid));
      const starters = rs.filter((r) => r.is_starter === '1').sort((x, y) => num(x.slot) - num(y.slot));
      const bench = rs.filter((r) => r.is_starter !== '1');
      const predicted = rs[0]?.is_predicted === '1';
      const avgAge = starters.length ? (starters.reduce((a, r) => a + num(r.age), 0) / starters.length).toFixed(1) : '–';
      const seen = new Set();
      const out = outs.filter((o) => String(o.team_id) === String(tid) && !seen.has(String(o.player)) && seen.add(String(o.player)));
      return `<div data-anfra-block="lineup-${String(tid) === String(m.home_id) ? 'home' : 'away'}" data-anfra-label="${esc(name)} lineup" data-anfra-query="lineups absences">
        <div class="pitch-head"><b style="color:${esc(color)}">${esc(name)}</b><span class="note">${esc(rs[0]?.formation || '')} · avg ${avgAge} · Coach ${esc(rs[0]?.coach || '')}</span></div>
        ${predicted ? '<div class="note" style="margin-bottom:6px">Predicted XI: last match\'s starters minus reported absences.</div>' : ''}
        ${pitchSvg(starters, color)}
        <div class="bench"><b>Bench</b> ${bench.map((r) => `${esc(r.shirt)} ${esc(r.player)} (${esc(r.position)})`).join(' · ') || '–'}</div>
        ${out.length ? `<div class="out"><b>Out</b> ${out.map((o) => `${esc(o.player)} (${esc(o.reason)})`).join(' · ')}</div>` : ''}
      </div>`;
    };
    body.innerHTML = `<section class="card"><div class="pitch-wrap">${side(m.home_id, m.home_color, m.home)}${side(m.away_id, m.away_color, m.away)}</div></section>`;
  }

  // ----- Events tab -----
  function renderEvents (body) {
    const m = state.match;
    if (m.status !== 'finished') { body.innerHTML = `<section class="card" data-anfra-block="events" data-anfra-label="Events" data-anfra-query="events"><div class="empty">Events will be available once the match starts.</div></section>`; return; }
    const st = qStatus(eventsQ, 'No events recorded.');
    if (st) { body.innerHTML = `<section class="card" data-anfra-block="events" data-anfra-label="Events" data-anfra-query="events">${st}</section>`; return; }
    const evIcon = { goal: icon('ball'), yellow: `<span class="ic" style="color:#f5c400"><svg viewBox="0 0 16 16" fill="currentColor" stroke="none"><rect x="4.5" y="2" width="7" height="12" rx="1.2"/></svg></span>`, red: `<span class="ic" style="color:var(--danger)"><svg viewBox="0 0 16 16" fill="currentColor" stroke="none"><rect x="4.5" y="2" width="7" height="12" rx="1.2"/></svg></span>`, sub: icon('swap') };
    const rows = eventsQ.result.rows.filter((r) => r.type !== 'sub' || true);
    let html = '', htDone = false;
    for (const r of rows) {
      if (!htDone && num(r.minute) > 45) { html += `<li class="ht">Half time ${esc(m.ht_home)}–${esc(m.ht_away)}</li>`; htDone = true; }
      const home = String(r.team_id) === String(m.home_id);
      const ev = `<span class="ev ${home ? '' : 'r'}">${home ? '' : `<small>${esc(r.detail)}</small>`}${evIcon[r.type] || ''} <b>${esc(r.player)}</b>${home ? `<small>${esc(r.detail)}</small>` : ''}</span>`;
      html += `<li>${home ? ev : '<span></span>'}<span class="min">${esc(r.minute)}'</span>${home ? '<span></span>' : ev}</li>`;
    }
    if (!htDone) html += `<li class="ht">Half time ${esc(m.ht_home)}–${esc(m.ht_away)}</li>`;
    html += `<li class="ht">Full time ${esc(m.home_goals)}–${esc(m.away_goals)} · corners ${esc(m.home_corners)}–${esc(m.away_corners)}</li>`;
    body.innerHTML = `<section class="card" data-anfra-block="events" data-anfra-label="Events" data-anfra-query="events"><ul class="tl">${html}</ul></section>`;
  }

  // ----- Standings (shared table) -----
  function standingsTable (q, highlight, emptyText) {
    const st = qStatus(q, emptyText || 'No finished matches yet.');
    if (st) return st;
    const rows = q.result.rows;
    return `<table class="table"><tr><th>#</th><th class="l">Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr>
      ${rows.map((r, i) => `<tr class="${highlight.includes(String(r.team_id)) ? 'me' : ''}"><td class="pos">${i + 1}</td><td class="l">${esc(r.team)}</td><td>${esc(r.p)}</td><td>${esc(r.w)}</td><td>${esc(r.d)}</td><td>${esc(r.l)}</td><td>${esc(r.gf)}</td><td>${esc(r.ga)}</td><td>${num(r.gd) > 0 ? '+' : ''}${esc(r.gd)}</td><td><b>${esc(r.pts)}</b></td></tr>`).join('')}
    </table>`;
  }
  function renderStandingsTab (body) {
    const m = state.match;
    body.innerHTML = `<section class="card" data-anfra-block="standings" data-anfra-label="Standings" data-anfra-query="standings">
      <div class="label" style="margin-bottom:8px">${esc(m.league)} · ${esc(m.season)}</div>
      ${standingsTable(standingsQ, [String(m.home_id), String(m.away_id)])}
    </section>`;
  }

  // ----- Leagues page -----
  function renderLeagues () {
    // The season is chosen lazily, the first time this page opens, so startup never re-executes anything.
    if (!state.pickSeason) {
      const fallback = (state.seasonOptions || [])[0] || dayList.result?.rows?.[0]?.season;
      if (fallback) { state.pickSeason = fallback; pickSeason.setCondition({ operator: 'is', values: [fallback] }); app.execute(); }
    }
    destroyGrids();
    if (!document.getElementById('lg-root')) {
      main.innerHTML = `<div class="page-head"><h1>Leagues</h1><span class="sub">Tables and the next fixtures with their AI calls</span></div>
        <div class="lg" id="lg-root">
          <div class="lg-list" id="lg-list" data-anfra-block="league-list" data-anfra-label="Leagues" data-anfra-query="leagues"></div>
          <div id="lg-body"></div>
        </div>`;
    }
    const list = document.getElementById('lg-list');
    const st = qStatus(leaguesQ, 'No leagues.');
    const colors = { 1: '#3d195b', 2: '#024494', 3: '#ee8707' };
    list.innerHTML = st || leaguesQ.result.rows.map((r) => `<div class="card ${String(r.id) === state.pickLeague ? 'selected' : ''}" data-league="${esc(r.id)}"><span class="badge" style="background:${colors[r.id] || '#444'}">${esc(String(r.name).split(' ').map((w) => w[0]).join('').slice(0, 2))}</span><div><b>${esc(r.name)}</b><small>${esc(r.country)}</small></div></div>`).join('');
    list.querySelectorAll('[data-league]').forEach((c) => c.addEventListener('click', () => pickLeague(c.dataset.league)));
    const lg = (leaguesQ.result?.rows || []).find((r) => String(r.id) === state.pickLeague);
    const seasons = state.seasonOptions || [];
    const fx = leagueFixturesQ.result?.rows || [];
    document.getElementById('lg-body').innerHTML = `
      <section class="card" data-anfra-block="league-table" data-anfra-label="League table" data-anfra-query="leagueTable">
        <div class="picker" style="margin-bottom:10px"><b style="font-size:16px">${esc(lg?.name || '')}</b>
          <select id="lg-season" data-anfra-control="pickSeason">${seasons.map((v) => `<option value="${esc(v)}" ${v === state.pickSeason ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        ${qStatus(leagueTableQ, 'No finished matches yet.') || '<div id="lg-table"></div>'}
      </section>
      <h3 class="section">Next fixtures</h3>
      <section data-anfra-block="league-fixtures" data-anfra-label="Next fixtures" data-anfra-query="leagueFixtures" id="lg-fixtures">
        ${qStatus(leagueFixturesQ, 'No upcoming fixtures.') || fx.map((r, i) => matchCard(r, i)).join('')}
      </section>`;
    const lgTable = document.getElementById('lg-table');
    if (lgTable) standingsGrid(lgTable, leagueTableQ.result.rows);
    document.getElementById('lg-season')?.addEventListener('change', (e) => pickSeasonValue(e.target.value));
    document.querySelectorAll('#lg-fixtures .match').forEach((c) => c.addEventListener('click', () => { openMatch(fx[Number(c.dataset.i)]); }));
  }

  // ----- Accuracy page -----
  // ----- Holistics Table: HTable from @holistics/design-system reproduced over AgGrid Community -----
  // Theme params, default grid options, pre-header, pagination and overlay follow src/components/Table/ in the package.
  let hTheme = null;
  function holisticsTheme () {
    if (hTheme || !window.agGrid) return hTheme;
    if (agGrid.ModuleRegistry && agGrid.AllCommunityModule) agGrid.ModuleRegistry.registerModules([agGrid.AllCommunityModule]);
    hTheme = agGrid.themeAlpine.withParams({
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', fontSize: 13, spacing: 4, browserColorScheme: 'inherit',
      backgroundColor: 'var(--card)', foregroundColor: 'var(--text)', chromeBackgroundColor: 'var(--card)',
      borderColor: 'var(--border)', borderRadius: 0, focusShadow: 'none',
      cellTextColor: 'var(--text)', cellHorizontalPadding: 16, dataFontSize: 13,
      headerTextColor: 'var(--text-helper)', headerBackgroundColor: 'var(--card)', headerColumnResizeHandleColor: 'var(--border)',
      headerFontSize: 13, headerFontWeight: 500, headerHeight: 40, headerVerticalPaddingScale: 1, headerColumnResizeHandleWidth: 2,
      iconButtonColor: 'var(--text-weak)', iconButtonHoverColor: 'var(--text)', iconButtonActiveColor: 'var(--primary)', iconSize: 16,
      rowHoverColor: 'var(--hover)', selectedRowBackgroundColor: 'var(--primary-soft)', rowVerticalPaddingScale: 1,
      rowHeight: 44, wrapperBorder: false, columnBorder: false, rowBorder: true, headerRowBorder: true, headerColumnBorder: false,
    });
    return hTheme;
  }
  const H_TEXTS = { filter: 'Filter:', filterPlaceholder: 'Search query', pageSize: 'Records:', noResults: 'No matching records', loading: 'Loading...' };
  const H_ICONS = { sortAscending: () => hicon('sort-asc'), sortDescending: () => hicon('sort-desc'), sortUnSort: () => hicon('exchange-arrow'), previous: () => hicon('chevron-left'), next: () => hicon('chevron-right') };
  const H_GRID_DEFAULTS = {
    defaultColDef: { cellClass: 'content-center', filter: false, unSortIcon: true, suppressKeyboardEvent: () => true },
    autoSizeStrategy: { type: 'fitGridWidth' }, domLayout: 'autoHeight', suppressCellFocus: true, suppressDragLeaveHidesColumns: true,
    enableCellTextSelection: true, ensureDomOrder: true, suppressPaginationPanel: true,
  };
  // HPagination's visible window: pages, or first / ellipsis / window / ellipsis / last, max 7 slots
  function pageWindow (cur, pages, max = 7) {
    const all = [...Array(pages).keys()].map((i) => i + 1);
    if (pages <= max) return all;
    const prevMid = Math.ceil((max - 4) / 2 - 1), nextMid = Math.floor((max - 4) / 2);
    if (cur <= max - 2 - nextMid) return [...all.slice(0, max - 2), '…', pages];
    if (pages - cur + 1 <= max - 2 - prevMid) return [1, '…', ...all.slice(pages - (max - 2))];
    return [1, '…', ...all.slice(cur - prevMid - 1, cur + nextMid), '…', pages];
  }
  let hGrids = [];
  const destroyGrids = () => { hGrids.forEach((g) => { try { g.destroy(); } catch (e) { /* already gone */ } }); hGrids = []; };
  function hTable (container, { columnDefs, rowData, quickFilter = false, pagination = false, pageSizes = null, onRowClicked = null, filterText = '', page = 1, pageSize = 25, onFilter = null, onPage = null, onPageSize = null }) {
    if (!window.agGrid) { container.innerHTML = `<div class="error">AgGrid did not load, so the Holistics table cannot render.</div>`; return null; }
    container.innerHTML = `<div class="hui-table" data-hui-comp="table">
      ${quickFilter || (pageSizes && pageSizes.length) ? `<div class="hui-pre" data-hui-section="pre-header">
        ${quickFilter ? `<label class="hui-filter"><span>${H_TEXTS.filter}</span><input type="text" class="hui-input" placeholder="${H_TEXTS.filterPlaceholder}" value="${esc(filterText)}"></label>` : ''}
        ${pageSizes && pageSizes.length ? `<label class="hui-pagesize picker"><span>${H_TEXTS.pageSize}</span><select>${pageSizes.map((n) => `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}
      </div>` : ''}
      <div class="hui-grid"></div>
      ${pagination ? `<nav class="hui-pagination" data-hui-comp="pagination"></nav>` : ''}
    </div>`;
    const gridEl = container.querySelector('.hui-grid'), nav = container.querySelector('.hui-pagination');
    let api = null;
    const drawPages = () => {
      if (!nav || !api) return;
      const cur = api.paginationGetCurrentPage() + 1, pages = api.paginationGetTotalPages();
      if (pages <= 1) { nav.innerHTML = ''; return; }
      const item = (label, { page: pg = null, active = false, disabled = false } = {}) => `<button type="button" class="hui-pagination-item ${active ? 'active' : ''}" ${pg == null ? '' : `data-page="${pg}"`} ${disabled ? 'disabled' : ''}>${label}</button>`;
      nav.innerHTML = item(hicon('chevron-left'), { page: cur - 1, disabled: cur <= 1 }) +
        pageWindow(cur, pages).map((w) => (w === '…' ? item(hicon('ellipsis-horizontal'), { disabled: true }) : item(w, { page: w, active: w === cur }))).join('') +
        item(hicon('chevron-right'), { page: cur + 1, disabled: cur >= pages });
      nav.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => api.paginationGoToPage(Number(b.dataset.page) - 1)));
    };
    api = agGrid.createGrid(gridEl, {
      ...H_GRID_DEFAULTS, theme: holisticsTheme(), icons: H_ICONS, columnDefs, rowData,
      pagination, paginationPageSize: pageSize, quickFilterText: filterText,
      overlayLoadingTemplate: `<div class="spinner">${H_TEXTS.loading}</div>`, overlayNoRowsTemplate: `<div class="hui-overlay">${H_TEXTS.noResults}</div>`,
      onRowClicked: onRowClicked ? (e) => onRowClicked(e.data) : undefined,
      onPaginationChanged: () => { drawPages(); if (onPage) onPage(api.paginationGetCurrentPage() + 1); },
      onGridReady: () => { if (pagination && page > 1) api.paginationGoToPage(page - 1); drawPages(); },
    });
    container.querySelector('.hui-filter input')?.addEventListener('input', (e) => { api.setGridOption('quickFilterText', e.target.value); if (onFilter) onFilter(e.target.value); });
    container.querySelector('.hui-pagesize select')?.addEventListener('change', (e) => { api.setGridOption('paginationPageSize', Number(e.target.value)); if (onPageSize) onPageSize(Number(e.target.value)); });
    hGrids.push(api);
    return api;
  }
  const pillCell = (hit) => (hit === true || hit === 'true' ? '<span class="pill sm hit">hit</span>' : '<span class="pill sm miss">miss</span>');
  const numCol = (extra) => ({ type: 'rightAligned', cellClass: 'content-center hui-num', ...extra });
  // standings as an HTable; the rank is fixed at load so sorting another column keeps the real position
  function standingsGrid (container, rows) {
    hTable(container, {
      rowData: rows.map((r, i) => ({ ...r, pos: i + 1 })),
      columnDefs: [
        numCol({ field: 'pos', headerName: '#', width: 56, cellClass: 'content-center hui-num hui-pos' }),
        { field: 'team', headerName: 'Team', flex: 2, minWidth: 160, cellClass: 'content-center hui-strong' },
        numCol({ field: 'p', headerName: 'P', width: 64 }), numCol({ field: 'w', headerName: 'W', width: 64 }), numCol({ field: 'd', headerName: 'D', width: 64 }), numCol({ field: 'l', headerName: 'L', width: 64 }),
        numCol({ field: 'gf', headerName: 'GF', width: 72 }), numCol({ field: 'ga', headerName: 'GA', width: 72 }),
        numCol({ field: 'gd', headerName: 'GD', width: 72, valueFormatter: (p) => `${num(p.value) > 0 ? '+' : ''}${p.value}` }),
        numCol({ field: 'pts', headerName: 'Pts', width: 72, cellClass: 'content-center hui-num hui-strong' }),
      ],
    });
  }

  function renderAccuracy () {
    destroyGrids();
    const sel = (id, label, options, value, control) => `<label class="note">${label} <select id="${id}" data-anfra-control="${control}"><option value="">All</option>${(options || []).map((v) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
    const k = accKpis.result?.rows?.[0];
    const kpi = (v, label, sub) => `<div class="kpi"><div class="k">${label}</div><div class="v">${v}</div><div class="sub">${sub}</div></div>`;
    const bands = accByBand.result?.rows || [];
    const bandName = (b) => String(b).replace(/^\d\s*/, '');
    const graded = gradedList.result?.rows || [];
    main.innerHTML = `<div class="page-head"><h1>Accuracy</h1><span class="sub">Every finished match was predicted before kickoff with only what was known then</span></div>
      <div class="picker" style="margin-bottom:14px" data-anfra-block="acc-pickers" data-anfra-label="Accuracy filters">${sel('acc-league', 'League', state.accLeagueOptions, state.accLeague, 'accLeague')} ${sel('acc-season', 'Season', state.accSeasonOptions, state.accSeason, 'accSeason')}</div>
      <div class="kpis" data-anfra-block="acc-kpis" data-anfra-label="Accuracy KPIs" data-anfra-query="accKpis">
        ${k ? kpi(esc(k.n), 'Graded', 'finished matches') + kpi(pct(k.hit), 'Result', 'home, draw or away') + kpi(pct(k.exact), 'Exact score', 'headline scoreline') + kpi(pct(k.ou), 'Over/under 2.5', 'total goals call') + kpi(pct(k.btts), 'Both teams score', 'yes or no call') : qStatus(accKpis, 'No graded matches.')}
      </div>
      ${k && num(k.api_n) > 0 ? `<div class="kpis" style="margin-top:12px" data-anfra-block="acc-api-kpis" data-anfra-label="API-Football accuracy" data-anfra-query="accKpis">
        ${kpi(esc(k.api_n), 'API-Football graded', 'finished matches it predicted') + kpi(pct(k.api_hit), 'API-Football result', 'its top percentage') + kpi(pct(k.api_ou), 'API-Football over/under', 'its goals line') + kpi(pct(k.hit), 'Our result, same basis', 'Poisson model, all graded') + kpi(k.api_n && k.n ? `${esc(k.api_n)}/${esc(k.n)}` : '–', 'Coverage', 'API predictions fetched so far')}
      </div>` : ''}
      <div class="two" style="margin-top:22px">
        <section class="card" data-anfra-block="acc-calibration" data-anfra-label="Calibration by confidence" data-anfra-query="accByBand">
          <div class="label" style="margin-bottom:10px">Result hit rate by confidence band</div>
          ${qStatus(accByBand, 'No data.') || `<div class="cal">${bands.map((b) => `<span>${esc(bandName(b.band))}</span><div class="bar" style="width:${Math.max(4, num(b.hit) * 100)}%">${pct(b.hit)}</div><span class="n">${esc(b.n)}</span>`).join('')}</div>
          <div class="note" style="margin-top:10px">If the bands rise left to right, confidence means something. The count is matches in the band.</div>`}
        </section>
        <section class="card" data-anfra-block="acc-by-league" data-anfra-label="By league" data-anfra-query="accByLeague">
          <div class="label" style="margin-bottom:10px">By league</div>
          ${qStatus(accByLeague, 'No data.') || `<div id="acc-league-table"></div>`}
        </section>
      </div>
      <h3 class="section">Recently graded</h3>
      <section class="card" data-anfra-block="acc-graded" data-anfra-label="Graded matches" data-anfra-query="gradedList">
        ${qStatus(gradedList, 'No graded matches.') || `<div id="acc-graded-table"></div>`}
      </section>`;
    const leagueEl = document.getElementById('acc-league-table');
    if (leagueEl) hTable(leagueEl, {
      rowData: accByLeague.result.rows,
      columnDefs: [
        { field: 'league', headerName: 'League', flex: 2, minWidth: 160, cellClass: 'content-center hui-strong' },
        numCol({ field: 'n', headerName: 'Graded' }),
        numCol({ field: 'hit', headerName: 'Result', valueFormatter: (p) => pct(p.value) }),
        numCol({ field: 'exact', headerName: 'Exact', valueFormatter: (p) => pct(p.value) }),
        numCol({ field: 'ou', headerName: 'O/U', valueFormatter: (p) => pct(p.value) }),
        numCol({ field: 'btts', headerName: 'BTTS', valueFormatter: (p) => pct(p.value) }),
        numCol({ field: 'api_hit', headerName: 'API result', headerTooltip: 'API-Football result hit rate (graded by it)', cellRenderer: (p) => (num(p.data.api_n) > 0 ? `${pct(p.value)} <span class="note">(${esc(p.data.api_n)})</span>` : '–') }),
      ],
    });
    const gradedEl = document.getElementById('acc-graded-table');
    if (gradedEl) hTable(gradedEl, {
      rowData: graded, quickFilter: true, pagination: true, pageSizes: [10, 25, 50],
      filterText: state.accFilter, page: state.accPage, pageSize: state.accPageSize,
      onFilter: (v) => { state.accFilter = v; }, onPage: (pg) => { state.accPage = pg; }, onPageSize: (n) => { state.accPageSize = n; },
      columnDefs: [
        { headerName: 'Match', flex: 2, minWidth: 200, cellClass: 'content-center hui-strong', valueGetter: (p) => `${p.data.home} v ${p.data.away}` },
        { headerName: 'Date', width: 120, cellClass: 'content-center hui-num', valueGetter: (p) => String(p.data.kickoff_date).slice(0, 10) },
        numCol({ headerName: 'AI', width: 90, cellClass: 'content-center hui-num', valueGetter: (p) => `${p.data.pred_home}–${p.data.pred_away}` }),
        numCol({ headerName: 'Actual', width: 90, cellClass: 'content-center hui-num', valueGetter: (p) => `${p.data.home_goals}–${p.data.away_goals}` }),
        numCol({ field: 'result_hit', headerName: 'Result', width: 100, cellClass: 'content-center', cellRenderer: (p) => pillCell(p.value) }),
        numCol({ field: 'exact_hit', headerName: 'Exact', width: 100, cellClass: 'content-center', cellRenderer: (p) => pillCell(p.value) }),
        numCol({ field: 'confidence', headerName: 'Conf', width: 90, cellClass: 'content-center hui-num' }),
        numCol({ field: 'api_outcome', headerName: 'API', headerTooltip: "API-Football's call", width: 120, cellClass: 'content-center', cellRenderer: (p) => (p.value == null ? '–' : `${esc(p.value)} ${pillCell(p.data.api_result_hit)}`) }),
      ],
    });
    document.getElementById('acc-league')?.addEventListener('change', (e) => setAcc('league', e.target.value));
    document.getElementById('acc-season')?.addEventListener('change', (e) => setAcc('season', e.target.value));
  }

  // ----- Prediction tab -----
  function renderPrediction (body) {
    const m = state.match;
    const st = qStatus(prediction, 'No prediction for this match yet.');
    if (st) { body.innerHTML = `<div data-anfra-block="ai-call" data-anfra-label="AI call" data-anfra-query="prediction">${st}</div>`; return; }
    const p = prediction.result.rows[0];
    if (!p) { body.innerHTML = '<div class="empty">No prediction for this match yet.</div>'; return; }
    const ph = num(p.p_home), pd = num(p.p_draw), pa = num(p.p_away);
    const winner = p.pick_team ? `${esc(p.pick_team)} wins` : 'Draw';
    const fin = m.status === 'finished';
    body.innerHTML = `<div class="pred-grid"><div>
      <section class="card call" data-anfra-block="ai-call" data-anfra-label="AI call" data-anfra-query="prediction">
        <div class="call-head"><span class="label">AI call</span><button type="button" class="num call-conf pill conf ${confClass(p.confidence)}" data-explain="confidence" title="How was this calculated?">${esc(p.confidence_label)} confidence<b>${esc(p.confidence)}</b></button></div>
        <div class="call-score"><button type="button" class="num big" data-explain="score" title="How was this calculated?">${esc(p.pred_home)}–${esc(p.pred_away)}</button><span class="winner">${winner}</span></div>
        ${(() => { const h = num(p.pred_home), a = num(p.pred_away); const scoreOutcome = h > a ? 'H' : h < a ? 'A' : 'D'; const pickOutcome = p.pick_team ? (String(p.pick_team_id) === String(m.home_id) ? 'H' : 'A') : 'D';
          return scoreOutcome !== pickOutcome ? `<div class="note" style="margin:-6px 0 10px">${esc(p.pred_home)}–${esc(p.pred_away)} is the single most likely scoreline (${pct(p.p_top_score, 1)} of the grid), but adding up every scoreline, ${esc(winner.toLowerCase())} is the most likely outcome at ${pct(Math.max(ph, pd, pa), 1)}.</div>` : ''; })()}
        <div class="hda"><span style="width:${ph * 100}%;background:var(--home)"></span><span style="width:${pd * 100}%;background:var(--draw)"></span><span style="width:${pa * 100}%;background:var(--away)"></span></div>
        <div class="hda-labels"><button type="button" class="num h" data-explain="H" title="How was this calculated?">Home ${pct(ph, 1)}</button><button type="button" class="num d" data-explain="D" title="How was this calculated?">Draw ${pct(pd, 1)}</button><button type="button" class="num a" data-explain="A" title="How was this calculated?">Away ${pct(pa, 1)}</button></div>
        ${fin ? `<div class="fine">Final ${esc(m.home_goals)}–${esc(m.away_goals)} · result call ${(m.result_hit === true || m.result_hit === 'true') ? '<span class="pill hit sm">hit</span>' : '<span class="pill miss sm">missed</span>'} · exact score ${(m.exact_hit === true || m.exact_hit === 'true') ? '<span class="pill hit sm">hit</span>' : '<span class="pill miss sm">missed</span>'}</div>`
              : `<div class="fine">${esc(untilKickoff(m.kickoff_at))} · updated ${esc(ago(p.generated_at))} · <button type="button" class="num" data-explain="signals" title="What are they?">${esc(p.signals)} signals</button></div>`}
      </section>

      <h3 class="section">Top reasons</h3>
      <section class="card" data-anfra-block="top-reasons" data-anfra-label="Top reasons" data-anfra-query="factors" id="reasons"></section>

      <h3 class="section">Season trend</h3>
      <section class="card" data-anfra-block="trend" data-anfra-label="Season trend" data-anfra-query="trend sides" id="trend"></section>

      </div><div>
      <h3 class="section">Match projections</h3>
      <section class="card" data-anfra-block="projections" data-anfra-label="Match projections" data-anfra-query="prediction scorers" id="proj"></section>

      <h3 class="section">Goals probability</h3>
      <section class="card" data-anfra-block="goals-probability" data-anfra-label="Goals probability" data-anfra-query="matrix" id="goals"></section>

      <h3 class="section">Score heatmap</h3>
      <section class="card" data-anfra-block="score-heatmap" data-anfra-label="Score heatmap" data-anfra-query="matrix" id="heat"></section>

      <h3 class="section">Probability evolution</h3>
      <section class="card" data-anfra-block="evolution" data-anfra-label="Probability evolution" data-anfra-query="history odds" id="evo"></section>

      <h3 class="section">AI strategic insight</h3>
      <section class="card insight" data-anfra-block="insight" data-anfra-label="AI insight" data-anfra-query="prediction">
        ${p.insight.split('. ').length ? `<p>${esc(p.insight).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</p>` : ''}
        <div class="fine">Based on ${esc(p.signals)} signals · ${esc(p.model_version)} · generated ${esc(fmtDateTime(p.generated_at))}</div>
      </section>

      <h3 class="section">API-Football says</h3>
      <section class="card" data-anfra-block="api-football" data-anfra-label="API-Football prediction" data-anfra-query="apiPred" id="api-pred"></section>
      </div></div>`;
    renderApiPred(document.getElementById('api-pred'), p);
    renderTopReasons(document.getElementById('reasons'), p);
    renderTrend(document.getElementById('trend'));
    renderProjections(document.getElementById('proj'), p);
    renderGoals(document.getElementById('goals'));
    renderHeat(document.getElementById('heat'), p);
    renderEvolution(document.getElementById('evo'), p);
  }

  // ----- API-Football's own prediction for the same match, beside ours -----
  function renderApiPred (el, p) {
    const m = state.match;
    const st = qStatus(apiPred, 'API-Football has no prediction stored for this match. scripts/fetch_api_football.py fetches them for upcoming fixtures and, with --grade, recent finished ones.');
    if (st) { el.innerHTML = st; return; }
    const a = apiPred.result.rows[0];
    const ah = num(a.p_home) || 0, ad = num(a.p_draw) || 0, aa = num(a.p_away) || 0;
    const apiOutcome = ah >= ad && ah >= aa ? 'H' : aa >= ah && aa >= ad ? 'A' : 'D';
    const ourOutcome = num(p.p_home) >= num(p.p_draw) && num(p.p_home) >= num(p.p_away) ? 'H' : num(p.p_away) >= num(p.p_home) && num(p.p_away) >= num(p.p_draw) ? 'A' : 'D';
    const name = (o) => (o === 'H' ? m.home : o === 'A' ? m.away : 'Draw');
    const fin = m.status === 'finished';
    const actual = fin ? (num(m.home_goals) > num(m.away_goals) ? 'H' : num(m.home_goals) < num(m.away_goals) ? 'A' : 'D') : null;
    const cmp = [['Form', 'form'], ['Attack', 'att'], ['Defence', 'def'], ['Head to head', 'h2h'], ['Overall', 'total']]
      .filter(([, k]) => num(a[`${k}_home`]) != null)
      .map(([label, k]) => `<div class="cmp-row"><span class="h">${pct(a[`${k}_home`])}</span><div class="cmp-bar"><span style="width:${(num(a[`${k}_home`]) || 0) * 100}%;background:var(--home)"></span><span style="width:${(num(a[`${k}_away`]) || 0) * 100}%;background:var(--away)"></span></div><span class="a">${pct(a[`${k}_away`])}</span><span class="l">${label}</span></div>`).join('');
    el.innerHTML = `
      <div class="hda"><span style="width:${ah * 100}%;background:var(--home)"></span><span style="width:${ad * 100}%;background:var(--draw)"></span><span style="width:${aa * 100}%;background:var(--away)"></span></div>
      <div class="hda-labels"><span class="h">Home ${pct(ah)}</span><span class="d">Draw ${pct(ad)}</span><span class="a">Away ${pct(aa)}</span></div>
      <p style="margin:10px 0 4px"><b>${esc(a.advice || (a.winner ? `Winner: ${a.winner}` : 'No advice'))}</b></p>
      <div class="note">${a.under_over ? `Goals ${esc(a.under_over)} · ` : ''}${a.goals_home ? `home ${esc(a.goals_home)}, away ${esc(a.goals_away)} · ` : ''}${apiOutcome === ourOutcome ? `agrees with our call (${esc(name(apiOutcome))})` : `calls ${esc(name(apiOutcome))}, we call ${esc(name(ourOutcome))}`}${actual ? ` · actual ${esc(name(actual))}: API ${actual === apiOutcome ? '<span class="pill sm hit">hit</span>' : '<span class="pill sm miss">miss</span>'}, ours ${actual === ourOutcome ? '<span class="pill sm hit">hit</span>' : '<span class="pill sm miss">miss</span>'}` : ''}</div>
      ${cmp ? `<div class="cmp" style="margin-top:12px">${cmp}</div>` : ''}
      <div class="fine" style="margin-top:8px">API-Football's own model, fetched for comparison. It is computed from the API's data at fetch time, not a pre-match snapshot.</div>`;
  }

  function goHow (key) {
    state.tab = 'how';
    if (key === 'pick') { const p = prediction.result?.rows?.[0]; key = !p ? 'conf' : !p.pick_team ? 'D' : String(p.pick_team_id) === String(state.match?.home_id) ? 'H' : 'A'; }
    state.focus = key === 'confidence' || key === 'signals' ? 'conf' : key;
    render();
    document.querySelector('.tabs')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('button.num[data-explain]'); if (b) goHow(b.dataset.explain); });

  // ----- How it's made: a horizontal lineage from what we know to the call -----
  function buildLineage (c) {
    const m = c.m, base = computeCall(c, new Set()), cur = state.off.size ? computeCall(c, state.off) : base;
    const nodes = [], edges = [];
    const add = (n) => { nodes.push(n); return n; };
    add({ id: 'avg', col: 0, label: 'League average', value: num(c.p.league_avg).toFixed(2), sub: 'goals per team per match' });
    for (const side of ['H', 'A']) {
      const sd = sideOf(c, side);
      lambdaChain(sd.tid, sd.opp).forEach((f) => {
        add({ id: `f:${f.id}`, col: 0, side, label: esc(factorName(f)), value: `× ${f.mult.toFixed(2)}`, toggle: true, off: state.off.has(f.id), fid: f.id, f });
        edges.push([`f:${f.id}`, side === 'H' ? 'lamH' : 'lamA']);
      });
      edges.push(['avg', side === 'H' ? 'lamH' : 'lamA']);
    }
    const d2 = (v, b) => (state.off.size ? { d: v - b, fmt: (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}` } : null);
    const dp = (v, b) => (state.off.size ? { d: v - b, fmt: (x) => `${x >= 0 ? '+' : '−'}${(Math.abs(x) * 100).toFixed(1)} pts` } : null);
    add({ id: 'lamH', col: 1, side: 'H', label: `${esc(m.home)} expected goals`, value: cur.lh.toFixed(2), delta: d2(cur.lh, base.lh) });
    add({ id: 'lamA', col: 1, side: 'A', label: `${esc(m.away)} expected goals`, value: cur.la.toFixed(2), delta: d2(cur.la, base.la) });
    edges.push(['lamH', 'grid'], ['lamA', 'grid']);
    add({ id: 'grid', col: 2, label: '64 scorelines', value: `${cur.top.i}–${cur.top.j} most likely`, mini: cur.cells, top: cur.top });
    for (const o of ['H', 'D', 'A']) {
      add({ id: o, col: 3, side: o === 'D' ? null : o, label: outcomeName(m, o), value: `${f1(cur.out[o])}%`, delta: dp(cur.out[o], base.out[o]) });
      edges.push(['grid', o], [o, 'conf']);
    }
    add({ id: 'score', col: 3, label: 'Most likely score', value: `${cur.top.i}–${cur.top.j} · ${f1(cur.top.pv)}%`, delta: state.off.size && (cur.top.i !== base.top.i || cur.top.j !== base.top.j) ? { d: 0, text: `was ${base.top.i}–${base.top.j}` } : null });
    edges.push(['grid', 'score']);
    // projections: derived from the same expected goals and grid, but not inputs to the call
    const ch = num(c.p.exp_corners_home), ca = num(c.p.exp_corners_away);
    add({ id: 'cornLam', col: 1, label: 'Expected corners', value: `${ch.toFixed(1)} – ${ca.toFixed(1)}`, sub: 'league corner average × each side\'s corner rates' });
    add({ id: 'ht', col: 3, proj: true, label: 'Half-time score', value: `${cur.ht.i}–${cur.ht.j} · ${f1(cur.ht.pv)}%`, delta: state.off.size && (cur.ht.i !== base.ht.i || cur.ht.j !== base.ht.j) ? { d: 0, text: `was ${base.ht.i}–${base.ht.j}` } : null });
    add({ id: 'over25', col: 3, proj: true, label: 'Over 2.5 goals', value: `${f1(cur.over25)}%`, delta: dp(cur.over25, base.over25) });
    add({ id: 'btts', col: 3, proj: true, label: 'Both teams score', value: `${f1(cur.btts)}%`, delta: dp(cur.btts, base.btts) });
    const top = (scorers.result?.rows || [])[0];
    if (top) {
      const tside = String(top.team_id) === String(m.home_id) ? 'H' : 'A';
      const pNow = scorerP(tside === 'H' ? cur.lh : cur.la, top.share), pBase = scorerP(tside === 'H' ? base.lh : base.la, top.share);
      add({ id: 'scorer', col: 3, proj: true, side: tside, label: 'Key scorer', value: `${esc(top.player)} · ${f1(pNow)}%`, delta: dp(pNow, pBase) });
      edges.push([tside === 'H' ? 'lamH' : 'lamA', 'scorer']);
    }
    add({ id: 'corners', col: 3, proj: true, label: 'Over 9.5 corners', value: `${f1(c.p.p_corners_over95)}%` });
    edges.push(['lamH', 'ht'], ['lamA', 'ht'], ['grid', 'over25'], ['grid', 'btts'], ['cornLam', 'corners']);
    add({ id: 'conf', col: 4, label: 'Confidence', value: String(cur.conf), delta: state.off.size ? { d: cur.conf - base.conf, fmt: (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x)}` } : null });
    return { nodes, edges, base, cur };
  }
  function upstreamOf (edges, id) {
    const seen = new Set([id]), queue = [id];
    while (queue.length) { const n = queue.shift(); edges.forEach(([a, b]) => { if (b === n && !seen.has(a)) { seen.add(a); queue.push(a); } }); }
    return seen;
  }
  const COLS = [['What we know', '×'], ['Expected goals', 'Poisson'], ['Scorelines', 'Σ'], ['Outcome', 'top + ½ lead'], ['Call', '']];
  function renderHow (body) {
    const c = explainCtx();
    if (!c || !c.frows.length || !c.cells.length) { body.innerHTML = `<section class="card">${qStatus(factors, 'No factors for this match.') || qStatus(matrix, 'No scoreline table.') || '<div class="spinner">Loading…</div>'}</section>`; return; }
    const m = c.m;
    const { nodes, edges } = buildLineage(c);
    const focus = nodes.some((n) => n.id === state.focus) ? state.focus : 'conf';
    const lit = upstreamOf(edges, focus);
    const focusTest = focus === 'H' ? (x) => x.i > x.j : focus === 'A' ? (x) => x.i < x.j : focus === 'D' ? (x) => x.i === x.j : null;
    const node = (n) => {
      const dim = !lit.has(n.id), sel = n.id === focus;
      const delta = n.delta && (n.delta.text || Math.abs(n.delta.d) >= 0.005 || (n.id === 'conf' && n.delta.d !== 0)) ? `<span class="ln-delta ${n.delta.d > 0 ? 'up' : n.delta.d < 0 ? 'down' : ''}">${n.delta.text || n.delta.fmt(n.delta.d)}</span>` : '';
      const mini = n.mini ? (() => { const max = Math.max(...n.mini.map((x) => x.pv)); return `<span class="ln-mini">${[...Array(8).keys()].map((i) => [...Array(8).keys()].map((j) => { const x = n.mini.find((y) => y.i === i && y.j === j); const t = focusTest && focusTest(x); const top = x.i === n.top.i && x.j === n.top.j; return `<i class="${t ? 'tint' : ''} ${top ? 'top' : ''}" style="opacity:${(0.15 + 0.85 * (x.pv / max)).toFixed(2)}"></i>`; }).join('')).join('')}</span>`; })() : '';
      return `<div class="ln-node ${n.side === 'H' ? 'home' : n.side === 'A' ? 'away' : ''} ${sel ? 'sel' : ''} ${dim ? 'dim' : ''} ${n.off ? 'off' : ''}" data-node="${n.id}">
        <button type="button" class="ln-main" data-focus="${n.id}"><span class="ln-label">${n.label}</span><span class="ln-val">${n.value}${delta}</span>${n.sub ? `<span class="ln-sub">${n.sub}</span>` : ''}${mini}</button>
        ${n.toggle ? `<label class="ln-switch" title="${n.off ? 'Put it back' : 'Try without'}"><input type="checkbox" data-off="${n.fid}" ${n.off ? '' : 'checked'}><span></span></label>` : ''}
      </div>`;
    };
    const col = (i) => {
      const ns = nodes.filter((n) => n.col === i);
      const groups = i === 0 ? [['', ns.filter((n) => !n.side)], [esc(m.home), ns.filter((n) => n.side === 'H')], [esc(m.away), ns.filter((n) => n.side === 'A')]]
        : i === 3 ? [['', ns.filter((n) => !n.proj)], ['Projections', ns.filter((n) => n.proj)]] : [['', ns]];
      return `<div class="ln-col" data-col="${i}"><div class="ln-head">${COLS[i][0]}${COLS[i][1] ? `<span class="ln-badge" title="how this column becomes the next">${COLS[i][1]}</span>` : ''}${i === 0 && state.off.size ? '<button type="button" class="hui-btn hui-btn-secondary-default hui-btn-sm" id="ln-reset">Reset</button>' : ''}</div>
        <div class="ln-stack">${groups.map(([t, g]) => `${t ? `<div class="ln-side ${t === 'Projections' ? 'neutral' : g[0]?.side === 'H' ? 'home' : 'away'}">${t}</div>` : ''}${g.map(node).join('')}`).join('')}</div></div>`;
    };
    const PROJ_TITLE = { ht: 'the half-time score', over25: 'over 2.5 goals', btts: 'both teams to score', scorer: 'the key scorer', corners: 'the corners call', cornLam: 'expected corners' };
    const focusTitle = PROJ_TITLE[focus] || (focus === 'conf' ? 'confidence' : focus === 'score' ? 'the headline score' : focus === 'grid' ? 'the scorelines' : focus.startsWith('lam') ? 'expected goals' : (focus.startsWith('f:') || focus === 'avg') ? 'this input' : outcomeName(m, focus));
    body.innerHTML = `<div class="how-grid">
      <section class="card lineage-card" data-anfra-block="lineage" data-anfra-label="How it's made" data-anfra-query="prediction factors matrix">
        <div class="label" style="margin-bottom:4px">How ${focusTitle} is made</div>
        <div class="note" style="margin-bottom:10px">Left to right: what we know, each side's expected goals, every scoreline, the outcomes, the call. Click a box to see its arithmetic. Switch an input off to see what the call would be without it.</div>
        <div class="lineage" id="lineage"><svg class="ln-svg" aria-hidden="true"></svg><div class="ln-cols">${[0, 1, 2, 3, 4].map(col).join('')}</div></div>
      </section>
      <aside class="card how-panel" data-anfra-block="lineage-detail" data-anfra-label="Arithmetic" data-anfra-query="prediction factors matrix whyRows">${detailFor(c, focus, nodes)}</aside>
    </div>`;
    body.querySelectorAll('[data-focus]').forEach((b) => b.addEventListener('click', () => { state.focus = b.dataset.focus; render(); }));
    body.querySelectorAll('[data-off]').forEach((i) => i.addEventListener('change', () => { if (i.checked) state.off.delete(i.dataset.off); else state.off.add(i.dataset.off); render(); }));
    document.getElementById('ln-reset')?.addEventListener('click', () => { state.off.clear(); render(); });
    drawEdges(document.getElementById('lineage'), edges, lit);
  }
  function drawEdges (root, edges, lit) {
    if (!root) return;
    const svg = root.querySelector('.ln-svg');
    const rr = root.getBoundingClientRect();
    const w = root.scrollWidth, hgt = root.scrollHeight;
    svg.setAttribute('width', w); svg.setAttribute('height', hgt); svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
    const box = (id) => { const el = root.querySelector(`[data-node="${id}"]`); if (!el) return null; const r = el.getBoundingClientRect(); return { x1: r.left - rr.left + root.scrollLeft, x2: r.right - rr.left + root.scrollLeft, y: r.top - rr.top + root.scrollTop + r.height / 2 }; };
    svg.innerHTML = edges.map(([a, b]) => {
      const A = box(a), B = box(b); if (!A || !B) return '';
      const on = lit.has(a) && lit.has(b);
      const dx = Math.max(24, (B.x1 - A.x2) / 2);
      return `<path d="M${A.x2},${A.y} C${A.x2 + dx},${A.y} ${B.x1 - dx},${B.y} ${B.x1},${B.y}" class="${on ? 'on' : 'off'}"/>`;
    }).join('');
  }
  window.addEventListener('resize', () => { if (VIEW === 'matches' && state.tab === 'how') render(); });
  function detailFor (c, focus, nodes) {
    const m = c.m, p = c.p;
    const title = (t, sub) => `<div class="label">${t}</div>${sub ? `<div class="note" style="margin-bottom:10px">${sub}</div>` : '<div style="height:8px"></div>'}`;
    const whatIf = state.off.size ? `<p class="note">Showing the call without ${state.off.size} input${state.off.size > 1 ? 's' : ''}. Reset to see the real call.</p>` : '';
    if (focus === 'conf' || focus === 'H' || focus === 'D' || focus === 'A' || focus === 'score') {
      const x = explain(focus === 'conf' ? 'confidence' : focus);
      return title(x.title, x.helper) + whatIf + x.body;
    }
    if (focus === 'lamH' || focus === 'lamA') {
      const side = focus === 'lamH' ? 'H' : 'A', sd = sideOf(c, side);
      return title(`${esc(sd.name)} expected goals ${sd.lam.toFixed(2)}`, 'league average × every factor switched on for this side') + whatIf + expectedGoalsEq(c, side) + h('What that means for goals') + modelLine(c) + goalChances(c, side);
    }
    if (focus === 'grid') {
      return title('All 64 scorelines', `rows: ${esc(m.home_short)} goals · columns: ${esc(m.away_short)} goals · outlined: most likely`) + whatIf + (c.sorted[0] ? scorelineEq(c, c.sorted[0]) : '') + modelLine(c) + gridTable(c, null, (i, j) => c.sorted[0] && i === c.sorted[0].i && j === c.sorted[0].j);
    }
    if (focus === 'ht' || focus === 'over25' || focus === 'btts' || focus === 'scorer' || focus === 'corners' || focus === 'cornLam') {
      return projectionCard(c, focus) + whatIf;
    }
    if (focus === 'avg') {
      return title(`League average ${num(p.league_avg).toFixed(2)}`, 'goals per team per match') + `<p>The mean goals scored per team per match over every finished match in ${esc(m.league)} before this prediction. Every expected-goals number starts from it; the factors scale it up or down.</p>` + eq(num(p.league_avg).toFixed(2), 'total goals ÷ team-matches', `${esc(m.league)}, finished matches before ${esc(fmtDateTime(p.generated_at))}`);
    }
    if (focus.startsWith('f:')) {
      const n = nodes.find((x) => x.id === focus); const f = n.f;
      const sd = sideOf(c, n.side);
      const ev = (whyRows.result?.rows || []).filter((r) => String(r.team_id) === String(f.team_id) && r.grp === f.grp && r.kind !== 'factor');
      const without = computeCall(c, new Set([...state.off, f.id])), withIt = computeCall(c, new Set([...state.off].filter((x) => x !== f.id)));
      const lamKey = n.side === 'H' ? 'lh' : 'la';
      return title(`${esc(factorName(f))}`, `${esc(sd.name)} · multiplies expected goals by ${f.mult.toFixed(2)} (${multText(f.mult) || '0%'})`) + whatIf +
        eq(`× ${f.mult.toFixed(2)}`, esc(factorWhy(f)), f.grp === 'form' && f.label === 'opp defence' ? `how many the other side has been conceding: a leaky opponent raises ${esc(sd.name)}'s expected goals` : '') +
        (ev.length ? h('Evidence') + rowList(ev.map((r) => ({ name: esc(r.label), why: esc(r.detail || ''), val: r.value != null && r.kind !== 'absence' ? esc(r.value) : null }))) : '') +
        h('Without this input') + rowList([
          { name: `${esc(sd.name)} expected goals`, val: `${withIt[lamKey].toFixed(2)} → ${without[lamKey].toFixed(2)}` },
          { name: outcomeName(m, 'H'), val: `${f1(withIt.out.H)} → ${f1(without.out.H)}%` },
          { name: 'Draw', val: `${f1(withIt.out.D)} → ${f1(without.out.D)}%` },
          { name: outcomeName(m, 'A'), val: `${f1(withIt.out.A)} → ${f1(without.out.A)}%` },
          { name: 'Confidence', val: `${withIt.conf} → ${without.conf}` }]) +
        `<p class="note">Use the switch on the box to see this across the whole tree.</p>`;
    }
    return '';
  }

  // ----- arithmetic cards for the projections, written the way predict.py computes them -----
  function projectionCard (c, key) {
    const m = c.m, p = c.p;
    const title = (t, sub) => `<div class="label">${t}</div>${sub ? `<div class="note" style="margin-bottom:10px">${sub}</div>` : '<div style="height:8px"></div>'}`;
    const pr = projectionsOf(c.lh, c.la, c.cells);
    const sumEq = (val, mine, what) => {
      const top = mine.slice(0, 4), rest = mine.slice(4).reduce((a, x) => a + x.pv, 0);
      return eq(f1(val), `${top.map((x) => `${f1(x.pv)} (${x.i}–${x.j})`).join(' + ')}${mine.length > 4 ? ` + ${f1(rest)} (${mine.length - 4} smaller scorelines)` : ''}`, `the chances of all ${mine.length} scorelines where ${what}, added up`);
    };
    if (key === 'over25') {
      const mine = c.sorted.filter((x) => x.i + x.j >= 3);
      return title(`Over 2.5 goals ${f1(pr.over25)}%`, `the chance the match has three goals or more · under is the remaining ${f1(1 - pr.over25)}%`) +
        sumEq(pr.over25, mine, 'the two sides score three or more between them') +
        section('grid', 'All 64 scorelines', gridTable(c, (i, j) => i + j >= 3, null) + `<div class="hm-legend"><span><i style="background:#e8f2fd;border:1px solid #8dbef2"></i>counted for over 2.5</span><span>rows: ${esc(m.home_short)} goals · columns: ${esc(m.away_short)} goals</span></div>`, true) +
        expectedBlock(c, false);
    }
    if (key === 'btts') {
      const mine = c.sorted.filter((x) => x.i > 0 && x.j > 0);
      const homeBlank = c.cells.filter((x) => x.i === 0).reduce((a, x) => a + x.pv, 0), awayBlank = c.cells.filter((x) => x.j === 0).reduce((a, x) => a + x.pv, 0), nil = c.cells.find((x) => x.i === 0 && x.j === 0)?.pv || 0;
      return title(`Both teams to score ${f1(pr.btts)}%`, `the chance neither side is kept out · no is the remaining ${f1(1 - pr.btts)}%`) +
        sumEq(pr.btts, mine, 'both sides score at least once') +
        eq(f1(pr.btts), `100 − ${f1(homeBlank)} − ${f1(awayBlank)} + ${f1(nil)}`, `the same number the other way round: everything, minus ${esc(m.home)} blank, minus ${esc(m.away)} blank, plus 0–0 which was subtracted twice`) +
        section('grid', 'All 64 scorelines', gridTable(c, (i, j) => i > 0 && j > 0, null) + `<div class="hm-legend"><span><i style="background:#e8f2fd;border:1px solid #8dbef2"></i>counted for both teams to score</span><span>rows: ${esc(m.home_short)} goals · columns: ${esc(m.away_short)} goals</span></div>`, true) +
        expectedBlock(c, false);
    }
    if (key === 'ht') {
      const hc = { ...c, cells: pr.htCells, sorted: [...pr.htCells].sort((a, b) => b.pv - a.pv), lh: c.lh * HT_SHARE, la: c.la * HT_SHARE };
      return title(`Half-time score ${pr.ht.i}–${pr.ht.j}`, `the most likely scoreline at the break, ${f1(pr.ht.pv)}% · first halves carry ${Math.round(HT_SHARE * 100)}% of goals`) +
        eq((c.lh * HT_SHARE).toFixed(2), `${c.lh.toFixed(2)} × ${HT_SHARE}`, `${esc(m.home)} expected first-half goals = expected goals × the share of goals scored before half-time`) +
        eq((c.la * HT_SHARE).toFixed(2), `${c.la.toFixed(2)} × ${HT_SHARE}`, `${esc(m.away)} expected first-half goals`) +
        `<p class="note">${HT_SHARE} is a fixed constant in scripts/predict.py (HT_SHARE), not measured per league. The first-half grid is then built exactly like the full-time one.</p>` +
        scorelineEq(hc, pr.ht) +
        section('grid', 'All 64 half-time scorelines', gridTable(hc, null, (i, j) => i === pr.ht.i && j === pr.ht.j) + `<div class="hm-legend"><span>rows: ${esc(m.home_short)} goals · columns: ${esc(m.away_short)} goals · outlined: the half-time call</span></div>`, true) +
        expectedBlock(c, false);
    }
    if (key === 'scorer') {
      const rows = scorers.result?.rows || [];
      if (!rows.length) return title('Key player to score', '') + `<p class="note">No scorer projections stored for this match.</p>`;
      const top = rows[0], tside = String(top.team_id) === String(m.home_id) ? 'H' : 'A', sd = sideOf(c, tside);
      const pNow = scorerP(sd.lam, top.share);
      return title(`${esc(top.player)} to score ${f1(pNow)}%`, `${esc(sd.name)} · the starter with the highest anytime-scorer chance`) +
        eq(f1(pNow), `1 − e^(−${sd.lam.toFixed(2)} × ${num(top.share).toFixed(3)})`, `${esc(sd.name)} expected goals × ${esc(top.player)}'s share of them, through a Poisson model: the chance that share produces at least one goal`) +
        eq(num(top.share).toFixed(3), 'position prior × (1 + goals scored before this match), ÷ the same for every starter', `goal share: forwards start with a higher prior than midfielders and defenders, and every goal already scored this season raises it`) +
        h('Starters ranked') + rowList(rows.slice(0, 6).map((r) => { const side = String(r.team_id) === String(m.home_id) ? 'H' : 'A'; const lam = sideOf(c, side).lam;
          return { name: `${esc(r.player)} <span class="ev">${esc(r.position || '')} · ${esc(side === 'H' ? m.home_short : m.away_short)}</span>`, why: `share ${num(r.share).toFixed(3)} of ${lam.toFixed(2)} expected goals`, val: `${f1(scorerP(lam, r.share))}%`, cur: r === top }; })) +
        `<p class="note">Only starters named in the lineup are ranked. Switching a factor off moves that side's expected goals and every one of its starters with it.</p>`;
    }
    if (key === 'cornLam' || key === 'corners') {
      const ch = num(p.exp_corners_home), ca = num(p.exp_corners_away), tot = ch + ca;
      const under = [...Array(10).keys()].reduce((a, k) => a + poisson(tot, k), 0);
      const missing = tot < 2 ? `<p class="note" style="color:var(--warning-text)">${tot.toFixed(1)} expected corners in total is far below a real match. Corner counts were never loaded for these fixtures, so the model saw zero corners in every recent match and the projection is not meaningful.</p>` : '';
      const inputs = h('Where expected corners come from') + rowList([
        { name: 'League corner average', why: 'corners per team per match over the league\'s finished matches', val: 'not stored' },
        { name: `${esc(m.home)} corners for · ${esc(m.away)} corners against`, why: 'last 5 matches, weighted like form, each as a ratio to the league average', val: 'not stored' },
        { name: `${esc(m.away)} corners for · ${esc(m.home)} corners against`, why: 'same for the other side', val: 'not stored' },
        { name: 'Venue', why: 'home side × 1.08, away side × 0.92', val: '× 1.08 / × 0.92' }]) +
        `<p class="note">predict.py multiplies these together but stores only the result, so this card cannot show the rates themselves. Expected corners do not respond to the factor switches.</p>`;
      if (key === 'cornLam') return title(`Expected corners ${ch.toFixed(1)} – ${ca.toFixed(1)}`, 'how many corners each side is expected to win') + missing + inputs;
      return title(`Over 9.5 corners ${f1(p.p_corners_over95)}%`, `the chance the match has ten corners or more`) + missing +
        eq(f1(num(p.p_corners_over95)), `100 − ${f1(under)}`, `everything minus the chance of 0 to 9 corners, from a Poisson model on ${tot.toFixed(1)} expected corners in total`) +
        eq(tot.toFixed(1), `${ch.toFixed(1)} + ${ca.toFixed(1)}`, `${esc(m.home)} expected corners + ${esc(m.away)} expected corners`) +
        inputs;
    }
    return '';
  }

  // ----- Top reasons: the three biggest factors per side, each a door into the lineage -----
  function renderTopReasons (el, p) {
    const m = state.match;
    const st = qStatus(factors, 'No factors stored for this match.');
    if (st) { el.innerHTML = st; return; }
    const side = (tid, opp, name, cls) => {
      const top = [...lambdaChain(tid, opp)].sort((a, b) => Math.abs(b.mult - 1) - Math.abs(a.mult - 1)).slice(0, 3);
      return `<div><div class="rs-h ${cls}">${esc(name)}</div>${top.map((f) => `<button type="button" class="rs-row" data-reason="f:${f.id}" title="See this input in the lineage">
          <span class="rs-name">${icon(FORM_GROUP_ICON[f.grp] || 'info')}${esc(factorName(f))}<span class="rs-why">${esc(factorWhy(f))}</span></span>
          <span class="mult ${multClass(f.mult)}">${multText(f.mult) || '0%'}</span></button>`).join('') || '<div class="note">No factors moved this side.</div>'}</div>`;
    };
    el.innerHTML = `<div class="reasons">${side(m.home_id, m.away_id, m.home, 'home')}${side(m.away_id, m.home_id, m.away, 'away')}</div>
      <div class="note" style="margin-top:10px;display:flex;justify-content:space-between;align-items:center"><span>Effect on that side's expected goals. Three of ${(factors.result?.rows || []).length} inputs.</span><button type="button" class="back" id="reasons-all">See how the call is made</button></div>`;
    el.querySelectorAll('[data-reason]').forEach((b) => b.addEventListener('click', () => goHow(b.dataset.reason)));
    el.querySelector('#reasons-all')?.addEventListener('click', () => goHow('conf'));
  }

  // ----- evidence helpers shared by the trend chips -----

  const isSel = (q, row, keys) => q.selectedRows.some((r) => keys.every((k) => String(r[k]) === String(row[k])));

  let trendChart = null;
  function renderTrend (el) {
    const m = state.match;
    const srows = sides.result?.rows || [];
    const sideChip = (r) => { const on = isSel(sides, r, ['team_id']); const dim = sides.selectedRows.length > 0 && !on; const home = String(r.team_id) === String(m.home_id);
      return `<button type="button" class="side-chip ${on ? 'on' : ''} ${dim ? 'dim' : ''}" data-i="${srows.indexOf(r)}" style="color:${home ? 'var(--home)' : 'var(--away)'}">${esc(r.team)}</button>`; };
    el.innerHTML = `<div class="trend-head">
        <span data-anfra-query="sides">${srows.map(sideChip).join(' ')}</span>
        <span class="seg" data-anfra-control="grain">${['month', 'week', 'day'].map((g) => `<button type="button" data-grain="${g}" class="${state.grain === g ? 'active' : ''}">${g[0].toUpperCase() + g.slice(1)}</button>`).join('')}</span>
      </div>
      <div class="chart" id="trend-chart"></div>
      <div class="note">Goals for (solid) and against (dotted) per ${esc(state.grain)}, season ${esc(m.season)}, finished matches only. Click a team to isolate it; the grain switch is an SDK date drill on <code>team_matches.kickoff_at</code>.</div>`;
    el.querySelectorAll('.side-chip').forEach((b) => b.addEventListener('click', () => {
      const row = srows[Number(b.dataset.i)];
      sides.select(isSel(sides, row, ['team_id']) ? [] : [row], { fields: ['team_id'] });
      app.execute();
    }));
    el.querySelectorAll('[data-grain]').forEach((b) => b.addEventListener('click', () => { state.grain = b.dataset.grain; grain.setGrain(state.grain); app.execute(); render(); }));
    const st = qStatus(trend, 'No finished matches this season yet.');
    const node = document.getElementById('trend-chart');
    if (st) { node.innerHTML = st; return; }
    if (trendChart) { trendChart.dispose(); trendChart = null; }
    trendChart = echarts.init(node);
    const rows = trend.result.rows;
    const periods = [...new Set(rows.map((r) => String(r.period)))].sort();
    const fmtP = (v) => { const d = parseTs(v); if (!d) return v; return state.grain === 'month' ? d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: TZ }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: TZ }); };
    const teams = [...new Set(rows.map((r) => r.team))];
    const series = [];
    for (const t of teams) {
      const color = t === m.home ? '#1b7ce4' : '#e36a01';
      const byP = Object.fromEntries(rows.filter((r) => r.team === t).map((r) => [String(r.period), r]));
      series.push({ name: `${t} for`, type: 'line', data: periods.map((p) => (byP[p] ? num(byP[p].gf) : null)), lineStyle: { color, width: 2.5 }, itemStyle: { color }, symbolSize: 6, connectNulls: true });
      series.push({ name: `${t} against`, type: 'line', data: periods.map((p) => (byP[p] ? num(byP[p].ga) : null)), lineStyle: { color, width: 1.5, type: 'dotted' }, itemStyle: { color }, symbolSize: 4, connectNulls: true });
    }
    trendChart.setOption({ animation: false, grid: { left: 32, right: 12, top: 10, bottom: 24 }, tooltip: { trigger: 'axis', backgroundColor: '#13151a', borderWidth: 0, textStyle: { color: '#f9fbfc', fontSize: 12 } },
      xAxis: { type: 'category', data: periods.map(fmtP), axisLine: { lineStyle: { color: '#e3e7ed' } }, axisLabel: { fontSize: 11, color: '#727685' } }, yAxis: { type: 'value', axisLabel: { fontSize: 11, color: '#727685' }, splitLine: { lineStyle: { color: '#edf1f5' } } }, textStyle: { fontFamily: 'Inter, sans-serif' }, series }, { notMerge: true });
  }

  function marketAgrees (p, o) {
    const pick = (x) => { const h = num(x.p_home), d = num(x.p_draw), a = num(x.p_away); return h >= d && h >= a ? 'H' : a >= h && a >= d ? 'A' : 'D'; };
    return pick(p) === pick(o);
  }

  function renderProjections (el, p) {
    const m = state.match;
    const fin = m.status === 'finished';
    const over = num(p.p_over25) >= 0.5, btts = num(p.p_btts) >= 0.5;
    const sc = scorers.result?.rows || [];
    const also = sc.slice(1, 3).map((s) => esc(s.player)).join(', ');
    const hg = num(m.home_goals), ag = num(m.away_goals);
    const pickOutcome = p.pick_team ? (String(p.pick_team_id) === String(m.home_id) ? 'H' : 'A') : 'D';
    const goalScorers = (eventsQ.result?.rows || []).filter((e) => e.type === 'goal').map((e) => e.player);
    const grade = (hit, text) => (fin ? `<small class="outcome"><span class="pill sm ${hit ? 'hit' : 'miss'}">${hit ? 'Hit' : 'Missed'}</span> ${esc(text)}</small>` : '');
    const totalGoals = hg + ag;
    el.innerHTML = `<div class="proj">
      <div class="k"><button type="button" class="num" data-explain="pick" title="How this was made">AI pick</button></div><div class="v ${p.pick_team ? (String(p.pick_team_id) === String(m.home_id) ? 'home' : 'away') : ''}">${p.pick_team ? (String(p.pick_team_id) === String(m.home_id) ? 'Home' : 'Away') : 'Draw'}<small>${esc(p.pick_team || 'no favourite')}</small>${grade(m.actual_outcome === pickOutcome, `final ${hg}–${ag}`)}</div>
      <div class="k"><button type="button" class="num" data-explain="ht" title="How this was made">Half-time score</button></div><div class="v">${esc(p.pred_ht_home)}–${esc(p.pred_ht_away)}<small>first halves carry 44% of goals</small>${grade(String(m.ht_home) === String(p.pred_ht_home) && String(m.ht_away) === String(p.pred_ht_away), `actual ${m.ht_home}–${m.ht_away}`)}</div>
      <div class="k"><button type="button" class="num" data-explain="over25" title="How this was made">Total goals</button></div><div class="v">${over ? 'Over' : 'Under'} 2.5<small>over ${pct(p.p_over25, 1)} · under ${pct(1 - num(p.p_over25), 1)}</small>${grade((totalGoals >= 3) === over, `${totalGoals} goals`)}</div>
      <div class="k"><button type="button" class="num" data-explain="btts" title="How this was made">Both teams to score</button></div><div class="v">${btts ? 'Yes' : 'No'}<small>yes ${pct(p.p_btts, 1)} · no ${pct(1 - num(p.p_btts), 1)}</small>${grade((hg > 0 && ag > 0) === btts, hg > 0 && ag > 0 ? 'both scored' : 'one side blank')}</div>
      <div class="k"><button type="button" class="num" data-explain="corners" title="How this was made">Corners</button></div><div class="v">${esc(p.exp_corners_home)} – ${esc(p.exp_corners_away)}<small>over 9.5 total ${pct(p.p_corners_over95, 1)}</small>${grade((num(m.home_corners) + num(m.away_corners) >= 10) === (num(p.p_corners_over95) >= 0.5), `actual ${m.home_corners}–${m.away_corners}`)}</div>
      <div class="k"><button type="button" class="num" data-explain="scorer" title="How this was made">Key player to score</button></div><div class="v ${sc[0] && String(sc[0].team_id) === String(m.home_id) ? 'home' : 'away'}">${esc(sc[0]?.player || p.key_scorer || '–')}<small>${sc[0] ? pct(sc[0].p, 0) + ' anytime' : ''}${also ? ` · also ${also}` : ''}</small>${sc[0] ? grade(goalScorers.includes(sc[0].player), goalScorers.includes(sc[0].player) ? 'scored' : 'did not score') : ''}</div>
    </div>`;
  }

  function margins () {
    const rows = matrix.result?.rows || [];
    const h = [0, 0, 0, 0], a = [0, 0, 0, 0];
    for (const r of rows) {
      const i = Math.min(3, num(r.home_goals)), j = Math.min(3, num(r.away_goals)), p = num(r.p);
      h[i] += p; a[j] += p;
    }
    return { h, a, rows };
  }

  function renderGoals (el) {
    const st = qStatus(matrix, 'No score grid.');
    if (st) { el.innerHTML = st; return; }
    const { h, a } = margins();
    const labels = ['0 goals', '1 goal', '2 goals', '3+'];
    el.innerHTML = `<div class="goals"><span></span><span class="hdr h">Home</span><span class="hdr a">Away</span>
      ${labels.map((l, i) => `<span>${l}</span><div class="bar h" style="width:${Math.max(4, h[i] * 100)}%">${pct(h[i], 1)}</div><div class="bar a" style="width:${Math.max(4, a[i] * 100)}%">${pct(a[i], 1)}</div>`).join('')}
    </div>`;
  }

  function renderHeat (el, p) {
    const st = qStatus(matrix, 'No score grid.');
    if (st) { el.innerHTML = st; return; }
    const m = state.match;
    const grid = {};
    let max = 0;
    for (const r of matrix.result.rows) { const v = num(r.p); grid[`${r.home_goals}-${r.away_goals}`] = v; if (num(r.home_goals) < 5 && num(r.away_goals) < 5) max = Math.max(max, v); }
    let html = `<div class="heat"><span class="hd"></span>${[0, 1, 2, 3, 4].map((j) => `<span class="hd" style="color:var(--away)">${j}</span>`).join('')}`;
    for (let i = 0; i < 5; i++) {
      html += `<span class="hd" style="color:var(--home)">${i}</span>`;
      for (let j = 0; j < 5; j++) {
        const v = grid[`${i}-${j}`] || 0;
        const top = String(i) === String(p.pred_home) && String(j) === String(p.pred_away);
        html += `<span class="c ${top ? 'top' : ''}" style="background:rgba(27,124,228,${(0.06 + 0.9 * v / max).toFixed(2)});color:${v / max > 0.5 ? '#fff' : 'var(--text)'}" title="${i}-${j}">${(v * 100).toFixed(0)}</span>`;
      }
    }
    el.innerHTML = html + `</div><div class="note" style="margin-top:8px">Rows ${esc(m.home_short)} goals, columns ${esc(m.away_short)} goals, cells in %. The outlined cell is the headline score.</div>`;
  }

  function renderEvolution (el, p) {
    const hs = histQ.result?.rows || [];
    const os = odds.result?.rows || [];
    if (histQ.state === 'error') { el.innerHTML = qStatus(histQ); return; }
    if (!hs.length) { el.innerHTML = '<div class="spinner">Loading…</div>'; return; }
    const latest = hs[hs.length - 1], first = hs[0];
    const move = (k) => { const d = (num(latest[k]) - num(first[k])) * 100; return `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} pt`; };
    const news = hs.filter((r) => r.reason === 'team news');
    el.innerHTML = `<div class="label">${marketAgrees(p, os[os.length - 1] || p) ? 'AI and market aligned' : 'AI and market disagree'} · ${news.length ? `${news.length} team-news update${news.length > 1 ? 's' : ''}` : 'no major disagreement'}</div>
      <div class="chart" id="evo-chart"></div>
      <div class="evo-legend"><span style="color:var(--home)">Home<b>${pct(latest.p_home, 1)}</b><small>${move('p_home')}</small></span><span style="color:var(--draw)">Draw<b>${pct(latest.p_draw, 1)}</b><small>${move('p_draw')}</small></span><span style="color:var(--away)">Away<b>${pct(latest.p_away, 1)}</b><small>${move('p_away')}</small></span></div>
      <div class="note">Solid lines: the model at each check-in. Dotted: ${esc(os[0]?.bookmaker || 'market')} captures. Last check-in: ${esc(latest.reason)}, ${esc(ago(latest.at))}.</div>`;
    const node = document.getElementById('evo-chart');
    if (evoChart) { evoChart.dispose(); evoChart = null; }
    evoChart = echarts.init(node);
    const series = [];
    const line = (name, rows, key, color, dotted) => ({ name, type: 'line', showSymbol: true, symbolSize: 6, data: rows.map((r) => [parseTs(r.at).getTime(), +(num(r[key]) * 100).toFixed(1)]), lineStyle: { color, width: 2, type: dotted ? 'dotted' : 'solid' }, itemStyle: { color } });
    series.push(line('Home', hs, 'p_home', '#1b7ce4'), line('Draw', hs, 'p_draw', '#989ca6'), line('Away', hs, 'p_away', '#e36a01'));
    if (os.length) series.push(line('Mkt home', os, 'p_home', '#1b7ce4', true), line('Mkt draw', os, 'p_draw', '#989ca6', true), line('Mkt away', os, 'p_away', '#e36a01', true));
    evoChart.setOption({
      animation: false,
      grid: { left: 36, right: 12, top: 10, bottom: 24 },
      tooltip: { trigger: 'axis', valueFormatter: (v) => `${v}%`, backgroundColor: '#13151a', borderWidth: 0, textStyle: { color: '#f9fbfc', fontSize: 12 } },
      xAxis: { type: 'time', axisLine: { lineStyle: { color: '#e3e7ed' } }, axisLabel: { formatter: (v) => new Date(v).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }), fontSize: 11, color: '#727685' } },
      yAxis: { type: 'value', axisLabel: { formatter: '{value}%', fontSize: 11, color: '#727685' }, splitLine: { lineStyle: { color: '#edf1f5' } } },
      series,
    }, { notMerge: true });
  }

  function renderAbout () {
    const k = accKpis.result?.rows?.[0];
    const asOf = parseTs(asOfQ.result?.rows?.[0]?.at);
    const nextDay = String(nextDayQ.result?.rows?.[0]?.d || '').slice(0, 10);
    const fixtures = dayList.state === 'success' ? dayList.result.rows.length : null;
    const live = (v) => (v == null || v === '' ? '…' : v);
    const nextLabel = nextDay ? new Date(`${nextDay}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : null;
    const tile = (v, label, sub) => `<div class="kpi"><div class="k">${label}</div><div class="v">${v}</div><div class="sub">${sub}</div></div>`;
    const page = (title, body, liveLine) => `<section class="card about-page"><div class="about-page-t">${title}</div>${liveLine ? `<div class="about-live">${liveLine}</div>` : ''}<p>${body}</p></section>`;
    // the pitch behind the hero: the same shapes pitchSvg draws for lineups, in white at low opacity
    const W = 300, H = 400, L = 'fill="none" stroke="#fff" stroke-width="2"';
    const pitch = `<svg class="about-pitch" viewBox="0 0 ${W} ${H}" aria-hidden="true">
      <rect x="8" y="8" width="${W - 16}" height="${H - 16}" ${L} rx="4"/>
      <line x1="8" y1="${H / 2}" x2="${W - 8}" y2="${H / 2}" ${L}/>
      <circle cx="${W / 2}" cy="${H / 2}" r="36" ${L}/><circle cx="${W / 2}" cy="${H / 2}" r="3" fill="#fff"/>
      <rect x="${W / 2 - 80}" y="8" width="160" height="56" ${L}/><rect x="${W / 2 - 36}" y="8" width="72" height="22" ${L}/>
      <rect x="${W / 2 - 80}" y="${H - 64}" width="160" height="56" ${L}/><rect x="${W / 2 - 36}" y="${H - 30}" width="72" height="22" ${L}/>
    </svg>`;
    main.innerHTML = `
      <section class="card about-hero" data-anfra-block="about-hero" data-anfra-label="Hero" data-anfra-query="accKpis nextDay dayList">
        ${pitch}
        <div class="about-hero-body">
          <div class="about-eyebrow">Football predictions</div>
          <h1>Every prediction, and every reason behind it.</h1>
          <p class="about-sub">AI score calls for three leagues, with the full chain of factors behind each one, graded honestly after kickoff.</p>
          <div class="kpis about-strip">
            ${tile(live(k?.n), 'Matches graded', 'predicted before kickoff')}
            ${tile(live(k ? pct(k.hit) : null), 'Result hit rate', 'home, draw or away called right')}
            ${tile(live(nextLabel), 'Next matchday', fixtures != null ? `${fixtures} fixture${fixtures === 1 ? '' : 's'} with a call` : '…')}
          </div>
          <div class="about-pointer">${icon('calendar')} Open <b>Matches</b> in the list on the left to start.</div>
        </div>
      </section>

      <div class="about-grid four" data-anfra-block="about-pages" data-anfra-label="Pages" data-anfra-query="dayList">
        ${page('Matches', 'Pick a day, pick a match, see the call and why.', fixtures != null ? `<b>${fixtures}</b> fixture${fixtures === 1 ? '' : 's'} on the next matchday` : '')}
        ${page('Leagues', 'Standings per season and the next fixtures with their calls.')}
        ${page('Accuracy', 'Hit rates by confidence band and by league, every graded match listed.')}
        ${page('Explore', 'Any governed metric, by any dimension, at any grain.')}
      </div>

      <section class="card about-foot" data-anfra-block="about-foot" data-anfra-label="How it works">
        <p><b>How it works.</b> Expected goals as a chain of multipliers, every factor stored as a row, a Poisson grid for every scoreline, predicted up to three times before kickoff.</p>
        <p><b>Trust.</b> Nothing is recomputed after the fact. Finished matches are a real backtest.</p>
        <p><b>Built with Anfra.</b> One HTML file per page plus the SDK, live against the governed model. Synthetic or replayed data${asOf ? `, as of ${esc(fmtDate(asOf))}` : ''}. Not for betting.</p>
      </section>`;
  }

  // ---------- go ----------
  app.subscribe(render);
  window.addEventListener('resize', () => { evoChart && evoChart.resize(); trendChart && trendChart.resize(); });
  dayFilter.setCondition({ operator: 'between', values: [state.day, state.day] });
  render();
  app.execute();
};
