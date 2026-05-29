// ═══════════════════════════════════════════════════════════════════════
// NeuralBet — V5 Phantom Engine
//
// Port of the Score Phantom prediction pipeline into TypeScript/Turso.
//
// Pipeline:
// 1. preparePredictionContext() — load features from DB
// 2. runProbabilityPipeline()   — xG → Poisson → calibration
// 3. runMarketSelection()       — 32 markets → score → prune → rank → pick
// 4. finalizePredictionResult() — confidence, reasons, save to DB
//
// Key architecture from Score Phantom:
// - 12-layer xG estimation (league-aware base, not hardcoded)
// - Bookmaker odds blending in calibration (fix for Under 2.5 bias)
// - H2H blend into xG
// - Full 32-market registry with abstain logic
// ═══════════════════════════════════════════════════════════════════════

import { getTursoClient, safeExecute } from '@/lib/db/turso-client';
import { initializeDatabase } from '@/lib/db/schema';
import { buildScoreMatrix, deriveMarketProbabilities, type ScoreMatrix } from './math/poisson';
import { calibrateProbabilities } from './math/calibration';
import { applyDerbyToVolatility, applyDerbyToProbs } from './intelligence/derby';
import { applyManagerDebutToProbs } from './intelligence/manager-debut';
import { applyRestDayToXg } from './intelligence/rest-day';
import { applyWeatherStyleToXg } from './intelligence/weather-style';
import { applyMotivationToXg } from './intelligence/late-season-motivation';
import { applySetPieceToXg } from './intelligence/set-piece-specialist';
import { adjustLineupCertainty } from './intelligence/lineup-decay';
import { estimateExpectedGoals } from './xg';
import { classifyMatchScript } from './script';
import {
  buildMarketCandidates,
  computeImpliedProbabilities,
  scoreMarketCandidates,
  pruneWeakCandidates,
  rankMarkets,
  selectBestPickOrAbstain,
} from './markets';

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export type { ManagerProfile } from './types';

export interface FeatureVector {
  // Team stats
  homeAvgScored: number;
  homeAvgConceded: number;
  awayAvgScored: number;
  awayAvgConceded: number;
  homeMatchesAvailable: number;
  awayMatchesAvailable: number;

  // Venue splits
  homeHomeGoalsFor?: number;
  homeHomeGoalsAgainst?: number;
  awayAwayGoalsFor?: number;
  awayAwayGoalsAgainst?: number;

  // League context
  leagueId: number;
  leagueAvgGoalsPerTeam: number;
  leagueOver25Rate: number;
  leagueOver35Rate: number;
  leagueBttsRate?: number;
  leagueCleanSheetRate?: number;
  leagueScoreSuccessRate?: number;
  tournamentName: string;

  // H2H
  h2hAvgGoals?: number;
  h2hMatchesAvailable: number;
  h2hBttsRate?: number;
  h2hOver35Rate?: number;

  // Odds
  impliedHomeProb?: number;
  impliedAwayProb?: number;
  impliedOver25?: number;
  impliedOver15?: number;
  impliedBttsYes?: number;

  // Intelligence
  homePredictedStrength?: number;
  awayPredictedStrength?: number;
  homeManager?: ManagerProfile;
  awayManager?: ManagerProfile;
  polymarketOdds?: any;
  lineupCertaintyScore: number;
  dataCompletenessScore: number;
  matchChaosScore: number;
  upsetRiskScore: number;

  // Squad management
  rotationRiskHome?: number;
  rotationRiskAway?: number;
  homeAlreadySecure?: boolean;
  awayAlreadySecure?: boolean;
  homeFatigue?: number;
  awayFatigue?: number;
  restDiffDays?: number;
  cupDistractionHome?: number;
  cupDistractionAway?: number;
  seasonStage?: string;

  // Context
  isNeutralGround: boolean;
  isLocalDerby: boolean;
  travelDistanceKm?: number;
  hasBadWeather?: boolean;
  hasBadPitch?: boolean;
  refereeStrictness?: number;
  refereeVolatilityChaos?: number;
  refereeRedCardWarning?: boolean;
  metadataReasonCodes?: string[];

  // xG table
  hasXgTable?: boolean;
  homeXgForPerGame?: number;
  homeXgAgainstPerGame?: number;
  awayXgForPerGame?: number;
  awayXgAgainstPerGame?: number;
  xgTableGap?: number;

  // Manager intel
  hasManagerIntel?: boolean;
  combinedManagerOverBias?: number;
  combinedManagerUnderBias?: number;
  managerAttackGap?: number;

  // Player stats
  hasPlayerStats?: boolean;
  playerStatsCount?: number;
  playerImpactGap?: number;
  homeAvgPlayerRating?: number;
  awayAvgPlayerRating?: number;

  // Deep player
  hasDeepPlayerIntel?: boolean;
  corePlayerGap?: number;
  homeCoreAvgRating?: number;
  awayCoreAvgRating?: number;

  // Form details
  homeFailedToScoreRate?: number;
  awayFailedToScoreRate?: number;
  homeBttsRate?: number;
  awayBttsRate?: number;
  homeProfileBttsRate?: number;
  awayProfileBttsRate?: number;
  homeProfileCleanSheetRate?: number;
  awayProfileCleanSheetRate?: number;
  homeAvgXgFor?: number;
  awayAvgXgFor?: number;
  homeAttackers?: number;
  awayAttackers?: number;
  homeLastMatchAttackSignal?: number;
  awayLastMatchAttackSignal?: number;
  homeLastMatchDefenseSignal?: number;
  awayLastMatchDefenseSignal?: number;
  homeLastMatchVolatilitySignal?: number;
  awayLastMatchVolatilitySignal?: number;
  homeLastMatchReliability?: number;
  awayLastMatchReliability?: number;
  homePointsLast5?: number;
  awayPointsLast5?: number;
  homeStrengthGap?: number;
  awayStrengthGap?: number;
  homeDefensiveWeakness?: number;
  awayDefensiveWeakness?: number;
  homeAttackRating01?: number;
  awayAttackRating01?: number;
  combinedBttsRate?: number;
  homeLeaguePosition?: number;
  awayLeaguePosition?: number;
  homeMotivationScore?: number;
  awayMotivationScore?: number;

  // Lineup
  homeLineupConfidence?: number;
  awayLineupConfidence?: number;
  homeLineupStatus?: string;
  awayLineupStatus?: string;
  homeAttackAbsenceScore?: number;
  awayAttackAbsenceScore?: number;
  homeDefenseAbsenceScore?: number;
  awayDefenseAbsenceScore?: number;
  homeGoalkeeperAbsenceScore?: number;
  awayGoalkeeperAbsenceScore?: number;
  homeKeyAbsenceReasons?: string[];
  awayKeyAbsenceReasons?: string[];
  lineupIntelligence?: any;
  tacticalMatchup?: any;
  advancedOdds?: any;
  marketOdds?: any;
  bestOdds?: any;
  priceIntelligence?: any;
  priceQualityScore?: number;
  priceDisagreementScore?: number;
  priceConfidenceAdjustment?: number;
  priceQuoteCount?: number;
  priceBookmakerCount?: number;
}

export type { MarketCandidate } from './types';

export interface PredictionResult {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  expectedGoals: { home: number; away: number; total: number };
  bestPick: MarketCandidate | null;
  backupPicks: MarketCandidate[];
  noSafePick: boolean;
  noSafePickReason: string | null;
  abstainCode: string | null;
  confidence: { model: string; value: string; volatility: string };
  reasonCodes: string[];
  script: { primary: string; confidence: number };
  calibratedProbs: Record<string, number>;
  dataCompleteness: number;
  engineVersion: string;
  updatedAt: string;
}

export type { ScriptOutput } from './types';

// ═══════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

function safeNum(v: any, fallback: number = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(num, max));
}

// ═══════════════════════════════════════════════════════════════════════
// POISSON ENGINE — extracted to ./math/poisson.ts (covered by unit tests)
// ═══════════════════════════════════════════════════════════════════════
// (math is now imported at the top of this file from './math/poisson')

// ═══════════════════════════════════════════════════════════════════════
// MATCH SCRIPT CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════
// XG ESTIMATION — 12 LAYERS
// ═══════════════════════════════════════════════════════════════════════
















// xG capping — league-dependent

// Main xG estimator — runs all 12 layers

// ═══════════════════════════════════════════════════════════════════════
// CALIBRATION — extracted to ./math/calibration.ts (covered by unit tests)
// ═══════════════════════════════════════════════════════════════════════
// (calibrateProbabilities is imported at the top of this file)


// ═══════════════════════════════════════════════════════════════════════
// MARKET REGISTRY (32 markets)
// ═══════════════════════════════════════════════════════════════════════



// ═══════════════════════════════════════════════════════════════════════
// BUILD MARKET CANDIDATES
// ═══════════════════════════════════════════════════════════════════════




// ═══════════════════════════════════════════════════════════════════════
// SCORING & RANKING
// ═══════════════════════════════════════════════════════════════════════





// ═══════════════════════════════════════════════════════════════════════
// PRUNE WEAK CANDIDATES
// ═══════════════════════════════════════════════════════════════════════



// ═══════════════════════════════════════════════════════════════════════
// RANK MARKETS
// ═══════════════════════════════════════════════════════════════════════




// ═══════════════════════════════════════════════════════════════════════
// SELECT BEST PICK OR ABSTAIN
// ═══════════════════════════════════════════════════════════════════════







// ═══════════════════════════════════════════════════════════════════════
// ASSESS MATCH PREDICTABILITY (upfront gate)
// ═══════════════════════════════════════════════════════════════════════

function assessMatchPredictability(fv: FeatureVector, script: ScriptOutput, calibratedProbs: Record<string, number>): {
  predictable: boolean;
  reason?: string;
  code?: string;
  restrictions?: { blockMarketKeys: string[] };
} {
  const dataCompleteness = safeNum(fv.dataCompletenessScore, 1.0);
  const matchChaosScore = safeNum(fv.matchChaosScore, 0.5);
  const upsetRiskScore = safeNum(fv.upsetRiskScore, 0.5);

  if (dataCompleteness < 0.35) return { predictable: false, reason: `Insufficient data (${(dataCompleteness * 100).toFixed(0)}%)`, code: 'LOW_DATA' };
  if (script.primary === 'chaotic_unreliable' && script.confidence > 0.65) return { predictable: false, reason: 'Match classified chaotic', code: 'CHAOTIC_SCRIPT' };
  if (matchChaosScore > 0.88) return { predictable: false, reason: `Chaos too high (${(matchChaosScore * 100).toFixed(0)}%)`, code: 'HIGH_CHAOS' };
  if (upsetRiskScore > 0.75 && dataCompleteness < 0.55) return { predictable: false, reason: 'High upset risk with weak data', code: 'UPSET_RISK_WEAK_DATA' };
  return { predictable: true, restrictions: { blockMarketKeys: [] } };
}

// ═══════════════════════════════════════════════════════════════════════
// CONFIDENCE & REASON CODES
// ═══════════════════════════════════════════════════════════════════════

function buildConfidenceProfile(bestPick: MarketCandidate | null, fv: FeatureVector): { model: string; value: string; volatility: string } {
  const dataCompleteness = safeNum(fv.dataCompletenessScore, 0.5);
  const chaos = safeNum(fv.matchChaosScore, 0.5);
  if (!bestPick) return { model: 'low', value: 'skip', volatility: 'high' };

  const prob = safeNum(bestPick.modelProbability, 0);
  const model = prob >= 0.70 ? 'high' : prob >= 0.55 ? 'medium' : 'low';
  const edge = safeNum(bestPick.edge, 0);
  const value = edge >= 0.08 ? 'strong' : edge >= 0.03 ? 'moderate' : edge > 0 ? 'marginal' : 'skip';
  const volatility = chaos >= 0.70 ? 'high' : chaos >= 0.50 ? 'medium' : 'low';
  return { model, value, volatility };
}

function buildReasonCodes(fv: FeatureVector, script: ScriptOutput, bestPickMarket: string | null): string[] {
  const codes: string[] = [];
  if (fv.dataCompletenessScore < 0.40) codes.push('LOW_DATA_QUALITY');
  if (fv.matchChaosScore > 0.65) codes.push('HIGH_VOLATILITY');
  if (fv.isLocalDerby) codes.push('LOCAL_DERBY');
  if (fv.isNeutralGround) codes.push('NEUTRAL_GROUND');
  if (fv.hasBadWeather) codes.push('BAD_WEATHER');
  if (script.primary === 'open_end_to_end') codes.push('OPEN_MATCH');
  if (script.primary === 'tight_low_event') codes.push('TIGHT_MATCH');
  if (fv.h2hMatchesAvailable >= 5) codes.push('H2H_DATA');
  if (bestPickMarket) codes.push(`PICK_${bestPickMarket.toUpperCase()}`);
  return codes;
}

// ═══════════════════════════════════════════════════════════════════════
// DB: Prepare prediction context from Turso
// ═══════════════════════════════════════════════════════════════════════

let dbReady = false;

async function ensureDb(): Promise<void> {
  if (!dbReady) {
    await initializeDatabase();
    dbReady = true;
  }
}

async function preparePredictionContext(fixtureId: number): Promise<{
  fixtureId: number;
  homeTeamName: string;
  awayTeamName: string;
  features: FeatureVector;
  odds: Record<string, any> | null;
} | null> {
  await ensureDb();
  const db = getTursoClient();

  // Load event
  const eventResult = await db.execute({ sql: `SELECT * FROM events WHERE id = ?`, args: [fixtureId] });
  if (eventResult.rows.length === 0) return null;
  const event = eventResult.rows[0];

  const homeTeamId = Number(event.home_team_id);
  const awayTeamId = Number(event.away_team_id);
  const leagueId = Number(event.league_id);
  const homeTeamName = String(event.home_team);
  const awayTeamName = String(event.away_team);

  // Parallel load all data
  const homeCoachId = event.home_coach_id ? Number(event.home_coach_id) : null;
  const awayCoachId = event.away_coach_id ? Number(event.away_coach_id) : null;

  const [
    oddsRow, leagueRow, homeTeamRow, awayTeamRow,
    homeStandings, awayStandings, h2hMatches,
    homeManagerRow, awayManagerRow, lineupRow,
  ] = await Promise.all([
    db.execute({ sql: `SELECT * FROM event_odds WHERE event_id = ?`, args: [fixtureId] }),
    db.execute({ sql: `SELECT * FROM leagues WHERE id = ?`, args: [leagueId] }),
    db.execute({ sql: `SELECT * FROM teams WHERE id = ?`, args: [homeTeamId] }),
    db.execute({ sql: `SELECT * FROM teams WHERE id = ?`, args: [awayTeamId] }),
    db.execute({ sql: `SELECT * FROM standings WHERE team_id = ? AND league_id = ?`, args: [homeTeamId, leagueId] }),
    db.execute({ sql: `SELECT * FROM standings WHERE team_id = ? AND league_id = ?`, args: [awayTeamId, leagueId] }),
    db.execute({
      sql: `SELECT * FROM historical_matches WHERE fixture_id = ? AND type = 'h2h' ORDER BY date DESC LIMIT 10`,
      args: [fixtureId],
    }),
    homeCoachId
      ? db.execute({ sql: `SELECT * FROM managers WHERE id = ?`, args: [homeCoachId] })
      : Promise.resolve({ rows: [] as any[] }),
    awayCoachId
      ? db.execute({ sql: `SELECT * FROM managers WHERE id = ?`, args: [awayCoachId] })
      : Promise.resolve({ rows: [] as any[] }),
    db.execute({ sql: `SELECT lineup_status FROM event_lineups WHERE event_id = ?`, args: [fixtureId] }),
  ]);

  // Build odds object
  const oddsData = oddsRow.rows[0] as any || null;
  const odds: Record<string, any> = {};
  if (oddsData) {
    if (oddsData.home_win) odds.home_win = Number(oddsData.home_win);
    if (oddsData.draw) odds.draw = Number(oddsData.draw);
    if (oddsData.away_win) odds.away_win = Number(oddsData.away_win);
    if (oddsData.over_25_goals) odds.over_25 = Number(oddsData.over_25_goals);
    if (oddsData.over_15_goals) odds.over_15 = Number(oddsData.over_15_goals);
    if (oddsData.under_25_goals) odds.under_25 = Number(oddsData.under_25_goals);
    if (oddsData.btts_yes) odds.btts_yes = Number(oddsData.btts_yes);
    if (oddsData.btts_no) odds.btts_no = Number(oddsData.btts_no);
    if (oddsData.double_chance_1x) odds.double_chance_1x = Number(oddsData.double_chance_1x);
    if (oddsData.double_chance_x2) odds.double_chance_x2 = Number(oddsData.double_chance_x2);
    if (oddsData.draw_no_bet_home) odds.dnb_home = Number(oddsData.draw_no_bet_home);
    if (oddsData.draw_no_bet_away) odds.dnb_away = Number(oddsData.draw_no_bet_away);
  }

  // Build league data
  const league = leagueRow.rows[0] as any;
  const leagueAvgGoals = Number(league?.avg_goals_per_team || 1.35);
  const leagueOver25Rate = Number(league?.over_25_rate || 0.50);
  const leagueOver35Rate = Number(league?.over_35_rate || 0.30);
  const leagueName = String(league?.name || `League ${leagueId}`);

  // Build team data from standings
  const hs = homeStandings.rows[0] as any;
  const as = awayStandings.rows[0] as any;
  const homePlayed = Number(hs?.played || 0);
  const awayPlayed = Number(as?.played || 0);
  const homeTeam = homeTeamRow.rows[0] as any;
  const awayTeam = awayTeamRow.rows[0] as any;

  // H2H stats
  let h2hAvgGoals = 0;
  let h2hMatchesAvailable = h2hMatches.rows.length;
  if (h2hMatchesAvailable > 0) {
    let totalGoals = 0;
    for (const m of h2hMatches.rows) {
      totalGoals += Number(m.home_goals || 0) + Number(m.away_goals || 0);
    }
    h2hAvgGoals = totalGoals / h2hMatchesAvailable;
  }

  // Implied probabilities from odds
  const impliedHomeProb = odds.home_win > 1.0 ? 1 / odds.home_win : undefined;
  const impliedAwayProb = odds.away_win > 1.0 ? 1 / odds.away_win : undefined;
  const impliedOver25 = odds.over_25 > 1.0 ? 1 / odds.over_25 : undefined;
  const impliedOver15 = odds.over_15 > 1.0 ? 1 / odds.over_15 : undefined;
  const impliedBttsYes = odds.btts_yes > 1.0 ? 1 / odds.btts_yes : undefined;

  // Data completeness
  const hasStandings = homePlayed > 0 && awayPlayed > 0;
  const hasOdds = odds.home_win > 0 || odds.over_25 > 0;
  const hasH2H = h2hMatchesAvailable >= 3;
  let dataCompletenessScore = 0.3;
  if (hasStandings) dataCompletenessScore += 0.25;
  if (hasOdds) dataCompletenessScore += 0.20;
  if (hasH2H) dataCompletenessScore += 0.15;
  dataCompletenessScore = clamp(dataCompletenessScore, 0, 1);

  // Match chaos
  let matchChaosScore = 0.5;
  if (!hasStandings) matchChaosScore += 0.15;
  if (!hasOdds) matchChaosScore += 0.10;
  if (homePlayed > 0 && awayPlayed > 0) {
    const homeForm = String(hs?.form || '');
    const awayForm = String(as?.form || '');
    if (homeForm.length >= 3 && awayForm.length >= 3) {
      const homeWins = (homeForm.match(/W/g) || []).length;
      const awayWins = (awayForm.match(/W/g) || []).length;
      const homeLosses = (homeForm.match(/L/g) || []).length;
      const awayLosses = (awayForm.match(/L/g) || []).length;
      if (homeWins >= 3 && awayWins >= 3) matchChaosScore -= 0.05;
      if (homeLosses >= 3 && awayLosses >= 3) matchChaosScore += 0.10;
    }
  }
  matchChaosScore = clamp(matchChaosScore, 0, 1);

  // Venue splits (approximate from standings)
  const homeGF = Number(hs?.gf || 0);
  const homeGA = Number(hs?.ga || 0);
  const awayGF = Number(as?.gf || 0);
  const awayGA = Number(as?.ga || 0);

  const features: FeatureVector = {
    homeAvgScored: homePlayed > 0 ? homeGF / homePlayed : leagueAvgGoals,
    homeAvgConceded: homePlayed > 0 ? homeGA / homePlayed : leagueAvgGoals,
    awayAvgScored: awayPlayed > 0 ? awayGF / awayPlayed : leagueAvgGoals * 0.9,
    awayAvgConceded: awayPlayed > 0 ? awayGA / awayPlayed : leagueAvgGoals,
    homeMatchesAvailable: homePlayed,
    awayMatchesAvailable: awayPlayed,
    homeHomeGoalsFor: homePlayed > 0 ? (homeGF * 0.58) / Math.ceil(homePlayed / 2) : undefined,
    homeHomeGoalsAgainst: homePlayed > 0 ? (homeGA * 0.42) / Math.ceil(homePlayed / 2) : undefined,
    awayAwayGoalsFor: awayPlayed > 0 ? (awayGF * 0.42) / Math.ceil(awayPlayed / 2) : undefined,
    awayAwayGoalsAgainst: awayPlayed > 0 ? (awayGA * 0.58) / Math.ceil(awayPlayed / 2) : undefined,
    leagueId,
    leagueAvgGoalsPerTeam: leagueAvgGoals,
    leagueOver25Rate,
    leagueOver35Rate,
    tournamentName: leagueName,
    h2hAvgGoals: h2hAvgGoals > 0 ? h2hAvgGoals : undefined,
    h2hMatchesAvailable,
    impliedHomeProb,
    impliedAwayProb,
    impliedOver25,
    impliedOver15,
    impliedBttsYes,
    lineupCertaintyScore: 0.5,
    dataCompletenessScore,
    matchChaosScore,
    upsetRiskScore: 0.5,
    isNeutralGround: Boolean(event.is_neutral_ground),
    isLocalDerby: Boolean(event.is_local_derby),
    travelDistanceKm: Number(event.travel_distance_km || 0),
    hasBadWeather: Number(event.weather_code || 0) >= 3,
    // Weather signals (intelligence/weather-style.ts)
    weatherCode: Number(event.weather_code || 0),
    weatherDescription: (event.weather_description as string) || null,
    weatherWindSpeedKmh: event.weather_wind_speed != null ? Number(event.weather_wind_speed) : null,
    weatherTemperatureC: event.weather_temperature_c != null ? Number(event.weather_temperature_c) : null,

    // Late-season motivation signals (intelligence/late-season-motivation.ts)
    eventMatchday: event.round_number != null ? Number(event.round_number) : null,
    // leagueTotalMatchdays / leagueTeamCount / topPoints / relegationBoundary
    // are computed in feature-builder.ts when the league has full standings data.
    // For now we surface what the events row gives us — feature-builder will
    // populate the others when this is moved to that file later.

    // Set-piece signals (intelligence/set-piece-specialist.ts)
    // refereeAvgYellowPerMatch loaded from referee row (populated above as refereeAvgCards)
    refereeAvgYellowPerMatch: refereeAvgCards,

    // Lineup decay (intelligence/lineup-decay.ts)
    hoursToKickoff: (() => {
      try {
        const kickoffMs = new Date(event.event_date as string).getTime();
        if (!Number.isFinite(kickoffMs)) return null;
        const diffMs = kickoffMs - Date.now();
        return diffMs > 0 ? diffMs / (1000 * 60 * 60) : 0;
      } catch { return null; }
    })(),
    lineupStatus: lineupRow.rows[0]?.lineup_status as string ?? null,
    // Managers — built from joined rows above
    homeManager: homeManagerRow.rows[0] ? {
      name: homeManagerRow.rows[0].name as string,
      team_style: (homeManagerRow.rows[0].team_style as string) || undefined,
      tactical_styles: undefined,  // BSD tactical_styles requires a separate sync; not wired yet
      win_pct: Number(homeManagerRow.rows[0].win_pct || 0),
      over_25_pct: Number(homeManagerRow.rows[0].over_25_pct || 0),
      btts_pct: Number(homeManagerRow.rows[0].btts_pct || 0),
      clean_sheet_pct: Number(homeManagerRow.rows[0].clean_sheet_pct || 0),
    } : undefined,
    awayManager: awayManagerRow.rows[0] ? {
      name: awayManagerRow.rows[0].name as string,
      team_style: (awayManagerRow.rows[0].team_style as string) || undefined,
      tactical_styles: undefined,
      win_pct: Number(awayManagerRow.rows[0].win_pct || 0),
      over_25_pct: Number(awayManagerRow.rows[0].over_25_pct || 0),
      btts_pct: Number(awayManagerRow.rows[0].btts_pct || 0),
      clean_sheet_pct: Number(awayManagerRow.rows[0].clean_sheet_pct || 0),
    } : undefined,
  };

  return { fixtureId, homeTeamName, awayTeamName, features, odds };
}

// ═══════════════════════════════════════════════════════════════════════
// PIPELINE: Run probability pipeline
// ═══════════════════════════════════════════════════════════════════════

function runProbabilityPipeline(features: FeatureVector, script: ScriptOutput): {
  xg: ReturnType<typeof estimateExpectedGoals>;
  calibratedProbs: Record<string, number>;
  rawProbs: Record<string, number>;
} {
  const xg = estimateExpectedGoals(features, script);
  // Rest-day asymmetry — penalises the fatigued side's xG (post-Poisson).
  const rested = applyRestDayToXg(xg.homeExpectedGoals, xg.awayExpectedGoals, features);
  xg.homeExpectedGoals = rested.homeXg;
  xg.awayExpectedGoals = rested.awayXg;
  // Weather × style interaction — possession teams suffer in rain etc.
  const weathered = applyWeatherStyleToXg(xg.homeExpectedGoals, xg.awayExpectedGoals, features);
  xg.homeExpectedGoals = weathered.homeXg;
  xg.awayExpectedGoals = weathered.awayXg;
  // Late-season motivation: title/Europe/relegation tightens; dead rubbers loosen
  const motivated = applyMotivationToXg(xg.homeExpectedGoals, xg.awayExpectedGoals, features);
  xg.homeExpectedGoals = motivated.homeXg;
  xg.awayExpectedGoals = motivated.awayXg;
  // Set-piece specialist boost: strict ref + high-scoring side
  const setPieced = applySetPieceToXg(xg.homeExpectedGoals, xg.awayExpectedGoals, features);
  xg.homeExpectedGoals = setPieced.homeXg;
  xg.awayExpectedGoals = setPieced.awayXg;
  xg.totalExpectedGoals = parseFloat((setPieced.homeXg + setPieced.awayXg).toFixed(3));
  const sm = buildScoreMatrix(xg.homeExpectedGoals, xg.awayExpectedGoals);
  const rawProbs = deriveMarketProbabilities(sm);

  const impliedOdds = {
    impliedHomeProb: features.impliedHomeProb,
    impliedAwayProb: features.impliedAwayProb,
    impliedOver25: features.impliedOver25,
    impliedOver15: features.impliedOver15,
    impliedBttsYes: features.impliedBttsYes,
  };

  let calibratedProbs = calibrateProbabilities(rawProbs, script, impliedOdds);
  // Derby post-step: tilt bttsYes upward (research-backed).
  calibratedProbs = applyDerbyToProbs(calibratedProbs, features);
  // Manager debut post-step: nudge homeWin up + draw down for first 3 games.
  calibratedProbs = applyManagerDebutToProbs(calibratedProbs, features);
  return { xg, calibratedProbs, rawProbs };
}

// ═══════════════════════════════════════════════════════════════════════
// PIPELINE: Run market selection
// ═══════════════════════════════════════════════════════════════════════

function runMarketSelection(
  calibratedProbs: Record<string, number>,
  odds: Record<string, any> | null,
  script: ScriptOutput,
  features: FeatureVector
): {
  bestPick: MarketCandidate | null;
  backupPicks: MarketCandidate[];
  noSafePick: boolean;
  noSafePickReason: string | null;
  abstainCode: string | null;
  rankedCandidates: MarketCandidate[];
} {
  // Upfront predictability gate
  const assessment = assessMatchPredictability(features, script, calibratedProbs);
  if (!assessment.predictable) {
    return {
      bestPick: null, backupPicks: [], noSafePick: true,
      noSafePickReason: assessment.reason || 'Unpredictable match',
      abstainCode: assessment.code || 'UNPREDICTABLE', rankedCandidates: [],
    };
  }

  // Build candidates
  const allCandidates = buildMarketCandidates(calibratedProbs);

  // Remove blocked markets
  const blockedKeys = new Set(assessment.restrictions?.blockMarketKeys || []);
  const filteredCandidates = blockedKeys.size > 0
    ? allCandidates.filter(c => !blockedKeys.has(c.marketKey))
    : allCandidates;

  // Implied probabilities
  const candidatesWithEdge = computeImpliedProbabilities(filteredCandidates, odds);

  // Score
  const scored = scoreMarketCandidates(candidatesWithEdge, script, features);

  // Prune
  const pruned = pruneWeakCandidates(scored, features, script);

  // Rank
  const ranked = rankMarkets(pruned);

  // Select
  const selection = selectBestPickOrAbstain(ranked, script, features);

  return {
    ...selection,
    rankedCandidates: ranked,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// PIPELINE: Finalize & save
// ═══════════════════════════════════════════════════════════════════════

async function finalizePredictionResult(
  fixtureId: number,
  homeTeamName: string,
  awayTeamName: string,
  script: ScriptOutput,
  xg: ReturnType<typeof estimateExpectedGoals>,
  calibratedProbs: Record<string, number>,
  features: FeatureVector,
  selection: {
    bestPick: MarketCandidate | null;
    backupPicks: MarketCandidate[];
    noSafePick: boolean;
    noSafePickReason: string | null;
    abstainCode: string | null;
  }
): Promise<PredictionResult> {
  const confidence = buildConfidenceProfile(selection.bestPick, features);
  const reasonCodes = buildReasonCodes(features, script, selection.bestPick?.marketKey || null);

  const result: PredictionResult = {
    fixtureId,
    homeTeam: homeTeamName,
    awayTeam: awayTeamName,
    expectedGoals: { home: xg.homeExpectedGoals, away: xg.awayExpectedGoals, total: xg.totalExpectedGoals },
    bestPick: selection.bestPick,
    backupPicks: selection.backupPicks,
    noSafePick: selection.noSafePick,
    noSafePickReason: selection.noSafePickReason,
    abstainCode: selection.abstainCode,
    confidence,
    reasonCodes,
    script: { primary: script.primary, confidence: script.confidence },
    calibratedProbs,
    dataCompleteness: safeNum(features.dataCompletenessScore, 0.5),
    engineVersion: '5.0.0',
    updatedAt: new Date().toISOString(),
  };

  // Save to DB
  try {
    await ensureDb();
    const db = getTursoClient();
    const predictionJson = JSON.stringify(result);

    await db.execute({
      sql: `INSERT OR REPLACE INTO predictions_v2
        (event_id, prediction_json, model_version, best_pick_market, best_pick_selection,
         best_pick_probability, best_pick_edge, best_pick_score, advisor_status,
         no_safe_pick, no_safe_pick_reason, generated_at)
        VALUES (?, ?, '5.0.0', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        fixtureId, predictionJson,
        selection.bestPick?.marketKey || null,
        selection.bestPick?.selection || null,
        selection.bestPick?.modelProbability || null,
        selection.bestPick?.edge ?? null,
        selection.bestPick?.finalScore ?? null,
        selection.bestPick?.advisor_status || (selection.noSafePick ? 'SKIP' : null),
        selection.noSafePick ? 1 : 0,
        selection.noSafePickReason || null,
      ],
    });

    // Save picks
    if (selection.bestPick) {
      await db.execute({
        sql: `INSERT INTO prediction_picks (event_id, market, selection, odds, probability, edge, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        args: [
          fixtureId,
          selection.bestPick.marketKey,
          selection.bestPick.selection,
          selection.bestPick.bookmakerOdds ?? null,
          selection.bestPick.modelProbability,
          selection.bestPick.edge ?? null,
        ],
      });
    }
  } catch (err) {
    console.error('[V5] Save prediction failed:', err);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN EXPORT: Run V5 Prediction
// ═══════════════════════════════════════════════════════════════════════

export async function runV5Prediction(fixtureId: number): Promise<PredictionResult> {
  console.log(`[V5] Running prediction for fixture ${fixtureId}`);

  // Stage 1: Prepare context
  const ctx = await preparePredictionContext(fixtureId);
  if (!ctx) {
    return {
      fixtureId,
      homeTeam: 'Unknown',
      awayTeam: 'Unknown',
      expectedGoals: { home: 0, away: 0, total: 0 },
      bestPick: null,
      backupPicks: [],
      noSafePick: true,
      noSafePickReason: 'Fixture not found in database',
      abstainCode: 'FIXTURE_NOT_FOUND',
      confidence: { model: 'low', value: 'skip', volatility: 'high' },
      reasonCodes: ['NO_DATA'],
      script: { primary: 'chaotic_unreliable', confidence: 0 },
      calibratedProbs: {},
      dataCompleteness: 0,
      engineVersion: '5.0.0',
      updatedAt: new Date().toISOString(),
    };
  }

  // Lineup-decay pre-step: dampen lineupCertaintyScore based on hours-to-kickoff.
  // Predicted lineups get less reliable the further from kickoff.
  if (ctx.features?.lineupCertaintyScore != null) {
    ctx.features.lineupCertaintyScore = adjustLineupCertainty(ctx.features);
  }

  // Derby pre-step: bump matchChaosScore so the classifier knows
  // derbies are more upset-prone than form alone suggests.
  if (ctx.features?.isLocalDerby) {
    const boostedChaos = applyDerbyToVolatility(ctx.features);
    ctx.features.matchChaosScore = boostedChaos;
  }

  // Classify match script
  const script = classifyMatchScript(ctx.features);
  console.log(`[V5] Script: ${script.primary} (confidence: ${script.confidence.toFixed(2)})`);

  // Stage 2: Probability pipeline
  const { xg, calibratedProbs } = runProbabilityPipeline(ctx.features, script);
  console.log(`[V5] xG: Home=${xg.homeExpectedGoals.toFixed(2)} Away=${xg.awayExpectedGoals.toFixed(2)} Total=${xg.totalExpectedGoals.toFixed(2)}`);

  // Stage 3: Market selection
  const selection = runMarketSelection(calibratedProbs, ctx.odds, script, ctx.features);

  // Stage 4: Finalize
  const result = await finalizePredictionResult(
    ctx.fixtureId, ctx.homeTeamName, ctx.awayTeamName,
    script, xg, calibratedProbs, ctx.features, selection
  );

  console.log(`[V5] Result: ${result.noSafePick ? 'SKIP' : result.bestPick?.selection} (${(safeNum(result.bestPick?.modelProbability, 0) * 100).toFixed(1)}%)`);
  return result;
}

/**
 * Run V5 predictions for all upcoming fixtures
 */
export async function runV5PredictionsForDate(dateFrom?: string, dateTo?: string, leagueId?: number): Promise<PredictionResult[]> {
  await ensureDb();
  const db = getTursoClient();

  const today = dateFrom || new Date().toISOString().split('T')[0];
  const nextWeek = dateTo || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let query = `SELECT id FROM events WHERE status = 'notstarted' AND event_date >= ? AND event_date <= ?`;
  const args: any[] = [today, nextWeek];
  if (leagueId) { query += ` AND league_id = ?`; args.push(leagueId); }
  query += ` ORDER BY event_date ASC LIMIT 50`;

  const result = await db.execute({ sql: query, args });
  const fixtureIds = result.rows.map(r => Number(r.id));

  const predictions: PredictionResult[] = [];
  for (const fixtureId of fixtureIds) {
    try {
      const prediction = await runV5Prediction(fixtureId);
      predictions.push(prediction);
    } catch (err) {
      console.error(`[V5] Failed for fixture ${fixtureId}:`, err);
    }
  }

  return predictions;
}
