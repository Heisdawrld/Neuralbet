// Standalone sync script — populates Turso DB from BSD API
const { createClient } = require('@libsql/client');

const TURSO_URL = process.env.TURSO_DB_URL || 'file:db/neuralbet.db';
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || '';
const BSD_KEY = process.env.BSD_API_KEY || '';
const BSD_URL = process.env.BSD_API_BASE_URL || 'https://sports.bzzoiro.com/api/v2/';

const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
const NOW = new Date().toISOString().replace('T', ' ').split('.')[0];

async function fetchBSD(path) {
  const res = await fetch(BSD_URL + path, { headers: { Authorization: 'Token ' + BSD_KEY } });
  if (!res.ok) throw new Error('BSD ' + res.status);
  return res.json();
}

async function syncFinished() {
  console.log('[1/3] Syncing finished events (14 days)...');
  const from = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
  const to = new Date().toISOString().split('T')[0];
  const data = await fetchBSD('events/?status=finished&date_from=' + from + '&date_to=' + to + '&limit=300');
  let count = 0;
  for (const e of data.results || []) {
    try {
      await db.execute({
        sql: 'INSERT INTO events (id,league_id,home_team_id,home_team,away_team_id,away_team,home_coach_id,away_coach_id,referee_id,venue_id,event_date,status,round_number,home_score,away_score,home_score_ht,away_score_ht,is_local_derby,is_neutral_ground,travel_distance_km,weather_code,weather_description,weather_wind_speed,weather_temperature_c,attendance,synced_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,home_score=excluded.home_score,away_score=excluded.away_score,synced_at=excluded.synced_at',
        args: [e.id,e.league_id,e.home_team_id,e.home_team,e.away_team_id,e.away_team,e.home_coach_id||null,e.away_coach_id||null,e.referee_id||null,e.venue_id||null,e.event_date,e.status,e.round_number||null,e.home_score||0,e.away_score||0,e.home_score_ht||null,e.away_score_ht||null,e.is_local_derby?1:0,e.is_neutral_ground?1:0,e.travel_distance_km||0,e.weather?.code||null,e.weather?.description||null,e.weather?.wind_speed||null,e.weather?.temperature_c||null,e.attendance||null,NOW]
      });
      count++;
    } catch (err) { /* skip */ }
  }
  console.log('  Finished events:', count);
}

async function syncStandings() {
  console.log('[2/3] Syncing standings...');
  const leagueResult = await db.execute("SELECT DISTINCT league_id FROM events WHERE status='notstarted'");
  const leagueIds = leagueResult.rows.map(r => Number(r.league_id));
  console.log('  Leagues:', leagueIds.length);
  let count = 0;
  for (const lid of leagueIds) {
    try {
      const data = await fetchBSD('leagues/' + lid + '/standings/');
      for (const s of data.standings || []) {
        try {
          await db.execute({
            sql: 'INSERT INTO standings (league_id,season_id,team_id,team_name,position,played,won,drawn,lost,gf,ga,gd,pts,xgf,xga,xgd,xg_games,form,is_live,synced_at) VALUES (?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(league_id,season_id,team_id) DO UPDATE SET position=excluded.position,played=excluded.played,gf=excluded.gf,ga=excluded.ga,pts=excluded.pts,xgf=excluded.xgf,xga=excluded.xga,form=excluded.form,synced_at=excluded.synced_at',
            args: [lid,s.team_id,s.team_name,s.position,s.played,s.won,s.drawn,s.lost,s.gf,s.ga,s.gd,s.pts,s.xgf||0,s.xga||0,s.xgd||0,s.xg_games||0,s.form||'',s.live?1:0,NOW]
          });
          count++;
        } catch (err) { /* skip */ }
      }
      process.stdout.write('.');
    } catch (e) { process.stdout.write('x'); }
  }
  console.log('\n  Standings rows:', count);
}

async function syncOdds() {
  console.log('[3/3] Syncing odds...');
  const eventsResult = await db.execute("SELECT id FROM events WHERE status='notstarted' ORDER BY event_date ASC LIMIT 80");
  const eventIds = eventsResult.rows.map(r => Number(r.id));
  console.log('  Events:', eventIds.length);
  let count = 0;
  for (let i = 0; i < eventIds.length; i += 5) {
    const batch = eventIds.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map(async (eid) => {
      const data = await fetchBSD('events/' + eid + '/odds/');
      const o = data.odds;
      if (!o || (!o.home_win && !o.away_win)) return 0;
      await db.execute({
        sql: 'INSERT INTO event_odds (event_id,home_win,draw,away_win,over_15_goals,over_25_goals,over_35_goals,under_15_goals,under_25_goals,under_35_goals,btts_yes,btts_no,synced_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET home_win=excluded.home_win,draw=excluded.draw,away_win=excluded.away_win,over_25_goals=excluded.over_25_goals,btts_yes=excluded.btts_yes,synced_at=excluded.synced_at',
        args: [eid,o.home_win,o.draw,o.away_win,o.over_15_goals,o.over_25_goals,o.over_35_goals,o.under_15_goals,o.under_25_goals,o.under_35_goals,o.btts_yes,o.btts_no,NOW]
      });
      return 1;
    }));
    count += results.filter(r => r.status === 'fulfilled' && r.value === 1).length;
    process.stdout.write('.');
  }
  console.log('\n  Odds synced:', count);
}

async function verify() {
  const e = await db.execute("SELECT COUNT(*) as c FROM events WHERE status='notstarted'");
  const fin = await db.execute("SELECT COUNT(*) as c FROM events WHERE status='finished'");
  const s = await db.execute('SELECT COUNT(*) as c FROM standings');
  const l = await db.execute('SELECT COUNT(*) as c FROM leagues');
  const o = await db.execute('SELECT COUNT(*) as c FROM event_odds');
  console.log('\n=== TURSO DB COUNTS ===');
  console.log('Leagues:', l.rows[0].c);
  console.log('Events:', Number(e.rows[0].c)+Number(fin.rows[0].c), '(upcoming:', e.rows[0].c, '| finished:', fin.rows[0].c, ')');
  console.log('Standings:', s.rows[0].c, 'rows');
  console.log('Odds:', o.rows[0].c, 'events');

  const sample = await db.execute("SELECT home_team, away_team, event_date FROM events WHERE status='notstarted' LIMIT 5");
  if (sample.rows.length) {
    console.log('\nSample upcoming:');
    for (const r of sample.rows) console.log(' ', r.home_team, 'vs', r.away_team, '|', r.event_date);
  }
}

async function main() {
  console.log('NeuralBet — Turso Sync\n');
  try {
    await syncFinished();
    await syncStandings();
    await syncOdds();
    await verify();
    console.log('\nDone!');
  } catch (e) { console.error('FATAL:', e.message); }
  db.close();
}
main();
