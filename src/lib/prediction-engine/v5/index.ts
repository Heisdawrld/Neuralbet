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

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface ManagerProfile {
  name?: string;
  tactical_styles?: Array<{ code: string; name: string }>;
  defensive_line?: string;
  team_style?: string;
  over_25_pct?: number;
  btts_pct?: number;
  avg_goals_scored?: number;
  avg_goals_conceded?: number;
  clean_sheet_pct?: number;
  win_pct?: number;
}

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

export interface MarketCandidate {
  marketKey: string;
  selection: string;
  modelProbability: number;
  impliedProbability: number | null;
  edge: number | null;
  finalScore: number;
  bookmakerOdds: number | null;
  riskLevel?: string;
  edgeLabel?: string;
  tacticalFitScore?: number;
  reasons?: string[];
  advisor_status?: string;
  valueTier?: string;
  ev?: number | null;
  isModelOnly?: boolean;
  isValueBet?: boolean;
  isSharpValue?: boolean;
  [key: string]: any;
}

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

function classifyMatchScript(fv: FeatureVector): ScriptOutput {
  const homeStrengthGap = safeNum(fv.homeStrengthGap, 0);
  const awayStrengthGap = safeNum(fv.awayStrengthGap, 0);
  const homeDefWeakness = safeNum(fv.homeDefensiveWeakness, 0.44);
  const awayDefWeakness = safeNum(fv.awayDefensiveWeakness, 0.44);
  const homeAttack01 = safeNum(fv.homeAttackRating01, 0.4);
  const awayAttack01 = safeNum(fv.awayAttackRating01, 0.4);
  const homeHomeGoalsFor = safeNum(fv.homeHomeGoalsFor, fv.homeAvgScored ?? 1.2);
  const awayAwayGoalsFor = safeNum(fv.awayAwayGoalsFor, fv.awayAvgScored ?? 1.0);
  const homeAvgConceded = safeNum(fv.homeAvgConceded, 1.1);
  const awayAvgConceded = safeNum(fv.awayAvgConceded, 1.1);
  const awayAwayGoalsAgainst = safeNum(fv.awayAwayGoalsAgainst, awayAvgConceded);
  const volatility = safeNum(fv.matchChaosScore, 0.5);
  const dataCompleteness = safeNum(fv.dataCompletenessScore, 0.5);
  const upsetRisk = safeNum(fv.upsetRiskScore, 0.5);
  const combinedBttsRate = safeNum(fv.combinedBttsRate, fv.h2hBttsRate ?? 0.45);
  const avgTotalGoalsProxy = homeHomeGoalsFor + awayAwayGoalsFor;

  const scores: Record<string, number> = {};

  // dominant_home_pressure
  {
    let s = 0;
    if (homeStrengthGap > 0.25) s += 0.3;
    if (awayDefWeakness > 0.6) s += 0.25;
    if (homeHomeGoalsFor > 1.4) s += 0.2;
    if (awayAwayGoalsAgainst > 1.3) s += 0.15;
    if (volatility < 0.65) s += 0.1;
    s += clamp(homeStrengthGap * 0.5, 0, 0.2);
    s += clamp((awayDefWeakness - 0.4) * 0.5, 0, 0.15);
    scores.dominant_home_pressure = clamp(s, 0, 1);
  }

  // dominant_away_pressure
  {
    let s = 0;
    if (awayStrengthGap > 0.2) s += 0.35;
    if (homeDefWeakness > 0.55) s += 0.3;
    if (awayAwayGoalsFor > 1.3) s += 0.25;
    s += clamp(awayStrengthGap * 0.5, 0, 0.2);
    s += clamp((homeDefWeakness - 0.35) * 0.5, 0, 0.15);
    scores.dominant_away_pressure = clamp(s, 0, 1);
  }

  // open_end_to_end
  {
    let s = 0;
    if (homeAttack01 > 0.55) s += 0.2;
    if (awayAttack01 > 0.55) s += 0.2;
    if (homeAvgConceded > 1.2) s += 0.15;
    if (awayAvgConceded > 1.2) s += 0.15;
    if (combinedBttsRate > 0.5) s += 0.2;
    s += clamp((combinedBttsRate - 0.3) * 0.5, 0, 0.1);
    s += clamp(avgTotalGoalsProxy * 0.05, 0, 0.1);
    scores.open_end_to_end = clamp(s, 0, 1);
  }

  // tight_low_event
  {
    let s = 0;
    if (homeHomeGoalsFor < 1.1) s += 0.25;
    if (awayAwayGoalsFor < 1.1) s += 0.25;
    if (homeAvgConceded < 1.0) s += 0.2;
    if (awayAvgConceded < 1.0) s += 0.2;
    if (homeAttack01 < 0.45) s += 0.1;
    if (awayAttack01 < 0.45) s += 0.1;
    s += clamp((1.3 - homeHomeGoalsFor) * 0.1, 0, 0.1);
    s += clamp((1.3 - awayAwayGoalsFor) * 0.1, 0, 0.1);
    scores.tight_low_event = clamp(s, 0, 1);
  }

  // chaotic_unreliable
  {
    let s = 0;
    if (volatility > 0.72) s += 0.5;
    if (dataCompleteness < 0.4) s += 0.4;
    if (upsetRisk > 0.7) s += 0.3;
    s += clamp(volatility * 0.3, 0, 0.25);
    s += clamp((0.5 - dataCompleteness) * 0.3, 0, 0.2);
    scores.chaotic_unreliable = clamp(s, 0, 1);
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const primary = sorted[0][0];
  const primaryScore = sorted[0][1];
  const secondaryEntry = sorted[1];
  const secondary = (secondaryEntry && secondaryEntry[1] >= primaryScore - 0.15) ? secondaryEntry[0] : null;

  const confidence = clamp(primaryScore, 0.3, 0.95);
  const eventLevelScore = clamp(avgTotalGoalsProxy / 3.5, 0, 1);

  const homeControlScore = clamp(safeNum(fv.homeStrengthGap, 0) * 0.5 + (safeNum(fv.homeAttackRating01, 0.4) > 0.5 ? 0.3 : 0), 0, 1);
  const awayControlScore = clamp(safeNum(fv.awayStrengthGap, 0) * 0.5 + (safeNum(fv.awayAttackRating01, 0.4) > 0.5 ? 0.3 : 0), 0, 1);

  return {
    primary,
    secondary,
    confidence: parseFloat(confidence.toFixed(3)),
    homeControlScore,
    awayControlScore,
    eventLevelScore: parseFloat(eventLevelScore.toFixed(3)),
    volatilityScore: parseFloat(volatility.toFixed(3)),
    _scores: scores,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// XG ESTIMATION — 12 LAYERS
// ═══════════════════════════════════════════════════════════════════════

const GLOBAL_LEAGUE_AVG = 1.35;
const HOME_ADV = 1.10;

// L1: League-aware base xG
function computeBaseXg(fv: FeatureVector): { homeXg: number; awayXg: number } {
  const LEAGUE_AVG = safeNum(fv.leagueAvgGoalsPerTeam, GLOBAL_LEAGUE_AVG);
  const homeAdv = fv.isNeutralGround ? 1.0 : HOME_ADV;
  const hAS = safeNum(fv.homeAvgScored, LEAGUE_AVG);
  const aAS = safeNum(fv.awayAvgScored, LEAGUE_AVG * 0.9);
  const hAC = safeNum(fv.homeAvgConceded, LEAGUE_AVG);
  const aAC = safeNum(fv.awayAvgConceded, LEAGUE_AVG);
  const hAtk = clamp(hAS / LEAGUE_AVG, 0.3, 2.2);
  const aAtk = clamp(aAS / LEAGUE_AVG, 0.3, 2.2);
  const hDef = clamp(hAC / LEAGUE_AVG, 0.3, 1.8);
  const aDef = clamp(aAC / LEAGUE_AVG, 0.3, 1.8);
  return { homeXg: hAtk * aDef * LEAGUE_AVG * homeAdv, awayXg: aAtk * hDef * LEAGUE_AVG };
}

// L2: Thin data regression
function applyThinDataRegression(homeXg: number, awayXg: number, fv: FeatureVector): { homeXg: number; awayXg: number } {
  const LEAGUE_AVG = safeNum(fv.leagueAvgGoalsPerTeam, GLOBAL_LEAGUE_AVG);
  const min = Math.min(safeNum(fv.homeMatchesAvailable, 5), safeNum(fv.awayMatchesAvailable, 5));
  if (min < 3) return { homeXg: homeXg * 0.5 + LEAGUE_AVG * HOME_ADV * 0.5, awayXg: awayXg * 0.5 + LEAGUE_AVG * 0.5 };
  if (min < 5) return { homeXg: homeXg * 0.75 + LEAGUE_AVG * HOME_ADV * 0.25, awayXg: awayXg * 0.75 + LEAGUE_AVG * 0.25 };
  return { homeXg, awayXg };
}

// L3: Venue anchoring (35% weight)
function applyVenueAnchoring(homeXg: number, awayXg: number, fv: FeatureVector): { homeXg: number; awayXg: number } {
  const { homeHomeGoalsFor: hhGF, awayAwayGoalsFor: aaGF, homeHomeGoalsAgainst: hhGA, awayAwayGoalsAgainst: aaGA } = fv;
  if (hhGF != null && aaGA != null) homeXg = homeXg * 0.65 + (hhGF * 0.6 + aaGA * 0.4) * 0.35;
  else if (hhGF != null) homeXg = homeXg * 0.75 + hhGF * 0.25;
  if (aaGF != null && hhGA != null) awayXg = awayXg * 0.65 + (aaGF * 0.6 + hhGA * 0.4) * 0.35;
  else if (aaGF != null) awayXg = awayXg * 0.75 + aaGF * 0.25;
  return { homeXg, awayXg };
}

// L4: Script adjustments (proportional)
function applyScriptAdjustments(homeXg: number, awayXg: number, script: ScriptOutput, fv: FeatureVector): { homeXg: number; awayXg: number } {
  const LEAGUE_AVG = safeNum(fv.leagueAvgGoalsPerTeam, GLOBAL_LEAGUE_AVG);
  const p = script.primary || '';
  if (p === 'open_end_to_end') { homeXg *= 1.12; awayXg *= 1.12; }
  else if (p === 'tight_low_event') { homeXg *= 0.90; awayXg *= 0.90; }
  else if (p === 'dominant_home_pressure') { homeXg *= 1.04; awayXg *= 0.96; }
  else if (p === 'dominant_away_pressure') { awayXg *= 1.04; homeXg *= 0.96; }
  else if (p === 'chaotic_unreliable') { homeXg = homeXg * 0.9 + LEAGUE_AVG * HOME_ADV * 0.1; awayXg = awayXg * 0.9 + LEAGUE_AVG * 0.1; }

  if (fv.homePredictedStrength && fv.homePredictedStrength < 1.0) homeXg *= fv.homePredictedStrength;
  if (fv.awayPredictedStrength && fv.awayPredictedStrength < 1.0) awayXg *= fv.awayPredictedStrength;
  return { homeXg, awayXg };
}

// L5: Form-derived xG boosts
function applyFormBoosts(homeXg: number, awayXg: number, fv: FeatureVector): { homeXg: number; awayXg: number } {
  const { homeXgBoost, awayXgBoost } = computeFormDerivedBoosts(fv);
  return { homeXg: homeXg * (1 + homeXgBoost), awayXg: awayXg * (1 + awayXgBoost) };
}

function computeFormDerivedBoosts(fv: FeatureVector): { homeXgBoost: number; awayXgBoost: number } {
  const GLOBAL_AVG_SCORED = 1.25;
  const GLOBAL_BTTS = 0.46;
  const GLOBAL_CS = 0.28;
  const GLOBAL_SCORE_OK = 0.70;

  const LAG = safeNum(fv.leagueAvgGoalsPerTeam, GLOBAL_AVG_SCORED);
  const L_BTTS = safeNum(fv.leagueBttsRate, GLOBAL_BTTS);
  const L_CS = safeNum(fv.leagueCleanSheetRate, GLOBAL_CS);
  const L_SCORE_OK = safeNum(fv.leagueScoreSuccessRate, GLOBAL_SCORE_OK);

  const homeQScale = fv.homeMatchesAvailable >= 3 ? (fv.dataCompletenessScore >= 0.55 ? 1.0 : fv.dataCompletenessScore >= 0.35 ? 0.7 : 0.4) * (fv.homeMatchesAvailable < 5 ? 0.65 : 1) : 0;
  const awayQScale = fv.awayMatchesAvailable >= 3 ? (fv.dataCompletenessScore >= 0.55 ? 1.0 : fv.dataCompletenessScore >= 0.35 ? 0.7 : 0.4) * (fv.awayMatchesAvailable < 5 ? 0.65 : 1) : 0;

  const boostContrib = (value: number | undefined, baseline: number, scale: number, maxEffect: number) => {
    if (value == null || baseline === 0) return 0;
    return clamp((value - baseline) / baseline * scale, -maxEffect, maxEffect);
  };

  const homeGoalsScoredBoost = boostContrib(fv.homeAvgScored, LAG, 0.35, 0.12);
  const homeScoreSuccessRate = fv.homeFailedToScoreRate != null ? 1 - fv.homeFailedToScoreRate : undefined;
  const homeConsistencyBoost = boostContrib(homeScoreSuccessRate, L_SCORE_OK, 0.28, 0.08);
  const homeBttsSignal = boostContrib(fv.homeProfileBttsRate ?? fv.homeBttsRate, L_BTTS, 0.22, 0.07);
  const homeLuckDiff = fv.homeAvgXgFor != null && fv.homeAvgScored != null ? fv.homeAvgScored - fv.homeAvgXgFor : 0;
  const homeLuckRegression = boostContrib(homeLuckDiff, 1.0, -0.40, 0.10);
  const homeLineupPenalty = fv.homeAttackers != null && fv.homeAttackers < 2 ? -0.05 : 0;

  let homeAttackBoost = homeQScale > 0 ? clamp(homeGoalsScoredBoost + homeConsistencyBoost + homeBttsSignal + homeLuckRegression, -0.20, 0.20) * homeQScale : 0;

  const awayGoalsScoredBoost = boostContrib(fv.awayAvgScored, LAG, 0.35, 0.12);
  const awayScoreSuccessRate = fv.awayFailedToScoreRate != null ? 1 - fv.awayFailedToScoreRate : undefined;
  const awayConsistencyBoost = boostContrib(awayScoreSuccessRate, L_SCORE_OK, 0.28, 0.08);
  const awayBttsSignal = boostContrib(fv.awayProfileBttsRate ?? fv.awayBttsRate, L_BTTS, 0.22, 0.07);
  const awayLuckDiff = fv.awayAvgXgFor != null && fv.awayAvgScored != null ? fv.awayAvgScored - fv.awayAvgXgFor : 0;
  const awayLuckRegression = boostContrib(awayLuckDiff, 1.0, -0.40, 0.10);
  const awayLineupPenalty = fv.awayAttackers != null && fv.awayAttackers < 2 ? -0.05 : 0;

  let awayAttackBoost = awayQScale > 0 ? clamp(awayGoalsScoredBoost + awayConsistencyBoost + awayBttsSignal + awayLuckRegression, -0.20, 0.20) * awayQScale : 0;

  const homeDefLeaky = homeQScale > 0 ? clamp(boostContrib(fv.homeAvgConceded, LAG, 0.30, 0.10) + boostContrib(fv.homeProfileCleanSheetRate, L_CS, -0.25, 0.07), -0.15, 0.15) * homeQScale : 0;
  const awayDefLeaky = awayQScale > 0 ? clamp(boostContrib(fv.awayAvgConceded, LAG, 0.30, 0.10) + boostContrib(fv.awayProfileCleanSheetRate, L_CS, -0.25, 0.07), -0.15, 0.15) * awayQScale : 0;

  const homeXgBoost = clamp(homeAttackBoost + awayDefLeaky + homeLineupPenalty, -0.20, 0.20);
  const awayXgBoost = clamp(awayAttackBoost + homeDefLeaky + awayLineupPenalty, -0.20, 0.20);
  return { homeXgBoost, awayXgBoost };
}

// L6: Odds anchor (65% model / 35% bookmaker)
function applyOddsAnchor(homeXg: number, awayXg: number, fv: FeatureVector): { homeXg: number; awayXg: number } {
  const impl = fv.impliedOver25 != null ? safeNum(fv.impliedOver25) : null;
  if (impl == null) return { homeXg, awayXg };
  if (impl <= 0.05 || impl >= 0.95) return { homeXg, awayXg };
  const implTotal = Math.max(1.2, -2.1 * Math.log(Math.max(0.01, 1 - impl)));
  const engTotal = homeXg + awayXg;
  const blended = engTotal * 0.65 + implTotal * 0.35;
  const scale = clamp(blended / Math.max(0.5, engTotal), 0.78, 1.25);
  return { homeXg: homeXg * scale, awayXg: awayXg * scale };
}

// L7: H2H blend (15-28% weight based on sample)
function applyH2HBlend(homeXg: number, awayXg: number, fv: FeatureVector): { homeXg: number; awayXg: number } {
  const h2hAvg = safeNum(fv.h2hAvgGoals, 0);
  const h2hCount = safeNum(fv.h2hMatchesAvailable, 0);
  if (h2hAvg <= 0 || h2hCount < 3) return { homeXg, awayXg };

  let h2hWeight: number;
  if (h2hCount >= 7) h2hWeight = 0.28;
  else if (h2hCount >= 5) h2hWeight = 0.22;
  else h2hWeight = 0.15;

  const currentTotal = homeXg + awayXg;
  const blendedTotal = currentTotal * (1 - h2hWeight) + h2hAvg * h2hWeight;
  const homeShare = currentTotal > 0 ? homeXg / currentTotal : 0.55;
  return { homeXg: blendedTotal * homeShare, awayXg: blendedTotal * (1 - homeShare) };
}

// L8: League goal rate adjustment
function applyLeagueGoalRateAdjustment(homeXg: number, awayXg: number, fv: FeatureVector): { homeXg: number; awayXg: number } {
  const leagueOver35Rate = safeNum(fv.leagueOver35Rate, 0.30);
  const leagueOver25Rate = safeNum(fv.leagueOver25Rate, 0.50);
  const over35Deviation = leagueOver35Rate - 0.30;
  const over25Deviation = leagueOver25Rate - 0.50;
  const totalDeviation = (over35Deviation * 0.65) + (over25Deviation * 0.35);
  const multiplier = 1 + clamp(totalDeviation * 0.30, -0.06, 0.06);
  return { homeXg: homeXg * multiplier, awayXg: awayXg * multiplier };
}

// L9: Advanced tactical AI (Polymarket, manager styles)
function applyAdvancedTacticalAI(homeXg: number, awayXg: number, fv: FeatureVector): { homeXg: number; awayXg: number } {
  let hXg = homeXg, aXg = awayXg;

  // Polymarket anchor
  if (fv.polymarketOdds?.odds?.over_under) {
    const polyOver25 = safeNum(fv.polymarketOdds.odds.over_under.over_25, 0);
    if (polyOver25 > 0.05 && polyOver25 < 0.95) {
      const sharpTotalXg = Math.max(1.2, -2.1 * Math.log(Math.max(0.01, 1 - polyOver25)));
      const currentTotal = hXg + aXg;
      const blendedTotal = currentTotal * 0.72 + sharpTotalXg * 0.28;
      const scale = clamp(Math.max(0.5, blendedTotal) / Math.max(0.5, currentTotal), 0.82, 1.18);
      hXg *= scale;
      aXg *= scale;
    }
  }

  // Manager tactical styles
  const applyTactics = (manager: ManagerProfile | undefined): number => {
    if (!manager) return 1.0;
    let mult = 1.0;
    const styles = Array.isArray(manager.tactical_styles)
      ? manager.tactical_styles.map(s => s.code || s.name).join(' ').toLowerCase()
      : String(manager.tactical_styles || '').toLowerCase();
    const isConservative = styles.includes('terrorist') || styles.includes('anti-football') || styles.includes('park the bus') || styles.includes('low block') || styles.includes('conservative');
    const isAttacking = styles.includes('positional') || styles.includes('gegenpressing') || styles.includes('attacking');
    if (isConservative) mult *= 0.85;
    else if (isAttacking) mult *= 1.05;
    return mult;
  };

  hXg *= applyTactics(fv.homeManager);
  aXg *= applyTactics(fv.awayManager);

  // Counter vs high line
  if (fv.homeManager?.defensive_line === 'high' && (fv.awayManager?.team_style === 'direct' || fv.awayManager?.team_style === 'counter')) aXg *= 1.10;
  if (fv.awayManager?.defensive_line === 'high' && (fv.homeManager?.team_style === 'direct' || fv.homeManager?.team_style === 'counter')) hXg *= 1.10;

  return { homeXg: hXg, awayXg: aXg };
}

// L10: BSD intelligence adjustments (xG table, manager bias, player impact)
function applyBsdIntelligenceAdjustments(homeXg: number, awayXg: number, fv: FeatureVector): { homeXg: number; awayXg: number } {
  let h = homeXg, a = awayXg;
  const weight = clamp(safeNum(fv.dataCompletenessScore, 0.5), 0.35, 0.85);

  if (fv.hasXgTable) {
    const hFor = safeNum(fv.homeXgForPerGame, 0);
    const hAgainst = safeNum(fv.homeXgAgainstPerGame, 0);
    const aFor = safeNum(fv.awayXgForPerGame, 0);
    const aAgainst = safeNum(fv.awayXgAgainstPerGame, 0);
    if (hFor > 0 && aAgainst > 0) {
      const tableHome = clamp(hFor * 0.62 + aAgainst * 0.38, 0.45, 2.7);
      h = h * (1 - 0.18 * weight) + tableHome * (0.18 * weight);
    }
    if (aFor > 0 && hAgainst > 0) {
      const tableAway = clamp(aFor * 0.62 + hAgainst * 0.38, 0.35, 2.5);
      a = a * (1 - 0.18 * weight) + tableAway * (0.18 * weight);
    }
    const gap = clamp(safeNum(fv.xgTableGap, 0) / 20, -0.06, 0.06);
    if (Math.abs(gap) >= 0.015) { h *= (1 + gap); a *= (1 - gap); }
  }

  if (fv.hasManagerIntel) {
    const overBias = clamp(safeNum(fv.combinedManagerOverBias, 0), 0, 1);
    const underBias = clamp(safeNum(fv.combinedManagerUnderBias, 0), 0, 1);
    const totalBias = clamp((overBias - underBias) * 0.08, -0.05, 0.06);
    if (Math.abs(totalBias) >= 0.012) { h *= (1 + totalBias); a *= (1 + totalBias); }
    const attackGap = clamp(safeNum(fv.managerAttackGap, 0) * 0.05, -0.04, 0.04);
    if (Math.abs(attackGap) >= 0.012) { h *= (1 + attackGap); a *= (1 - attackGap); }
  }

  if (fv.hasPlayerStats && safeNum(fv.playerStatsCount, 0) >= 8) {
    const impactGap = clamp(safeNum(fv.playerImpactGap, 0) / 8, -0.05, 0.05);
    if (Math.abs(impactGap) >= 0.01) { h *= (1 + impactGap); a *= (1 - impactGap); }
    const hRating = safeNum(fv.homeAvgPlayerRating, 0);
    const aRating = safeNum(fv.awayAvgPlayerRating, 0);
    if (hRating > 0 && aRating > 0) {
      const ratingGap = clamp((hRating - aRating) / 20, -0.035, 0.035);
      if (Math.abs(ratingGap) >= 0.01) { h *= (1 + ratingGap); a *= (1 - ratingGap); }
    }
  }

  return { homeXg: h, awayXg: a };
}

// L11: Deep BSD signals (core player gap, referee chaos, metadata)
function applyDeepBsdSignals(homeXg: number, awayXg: number, fv: FeatureVector): { homeXg: number; awayXg: number } {
  let h = homeXg, a = awayXg;

  if (fv.hasDeepPlayerIntel) {
    const gap = clamp(safeNum(fv.corePlayerGap, 0) / 18, -0.035, 0.035);
    if (Math.abs(gap) >= 0.008) { h *= (1 + gap); a *= (1 - gap); }
    const hRating = safeNum(fv.homeCoreAvgRating, 0);
    const aRating = safeNum(fv.awayCoreAvgRating, 0);
    if (hRating > 0 && aRating > 0) {
      const ratingGap = clamp((hRating - aRating) / 35, -0.025, 0.025);
      if (Math.abs(ratingGap) >= 0.008) { h *= (1 + ratingGap); a *= (1 - ratingGap); }
    }
  }

  const chaos = safeNum(fv.refereeVolatilityChaos, 0);
  if (chaos >= 0.72) { h *= 0.985; a *= 0.985; }
  if (fv.refereeRedCardWarning) { h *= 0.99; a *= 0.99; }

  const metadataCodes = Array.isArray(fv.metadataReasonCodes) ? fv.metadataReasonCodes : [];
  if (metadataCodes.includes('metadata_goals_trend')) { h *= 1.015; a *= 1.015; }
  if (metadataCodes.includes('metadata_scoring_warning')) { h *= 0.99; a *= 0.99; }
  if (metadataCodes.includes('metadata_derby_context')) { h *= 0.99; a *= 0.99; }

  return { homeXg: h, awayXg: a };
}

// L11.5: Context adjustments (derby, travel, weather, referee)
function applyBsdContextAdjustments(homeXg: number, awayXg: number, fv: FeatureVector): { homeXg: number; awayXg: number } {
  let h = homeXg, a = awayXg;
  if (fv.isLocalDerby) { h *= 0.97; a *= 0.97; }
  if (fv.travelDistanceKm && fv.travelDistanceKm >= 800) {
    const awayTravelDampener = fv.travelDistanceKm >= 2000 ? 0.94 : 0.97;
    a *= awayTravelDampener;
  }
  if (fv.hasBadWeather || fv.hasBadPitch) { h *= 0.95; a *= 0.95; }
  if (safeNum(fv.refereeStrictness, 0) >= 0.75) { h *= 0.98; a *= 0.98; }
  return { homeXg: h, awayXg: a };
}

// L12: Squad management (rotation, fatigue, rest, cup distraction)
function applySquadManagementAdjustments(homeXg: number, awayXg: number, fv: FeatureVector): { homeXg: number; awayXg: number } {
  let h = homeXg, a = awayXg;

  const homeRotationDampener = 1 - clamp(safeNum(fv.rotationRiskHome, 0) * 0.20, 0, 0.18);
  const awayRotationDampener = 1 - clamp(safeNum(fv.rotationRiskAway, 0) * 0.20, 0, 0.18);
  if (safeNum(fv.rotationRiskHome, 0) > 0.1) h *= homeRotationDampener;
  if (safeNum(fv.rotationRiskAway, 0) > 0.1) a *= awayRotationDampener;

  if (fv.homeAlreadySecure) h *= 0.82;
  if (fv.awayAlreadySecure) a *= 0.82;

  if (safeNum(fv.homeFatigue, 0) > 0.05) h *= (1 - fv.homeFatigue!);
  if (safeNum(fv.awayFatigue, 0) > 0.05) a *= (1 - fv.awayFatigue!);

  const restDiff = safeNum(fv.restDiffDays, 0);
  if (restDiff >= 3) a *= 0.95;
  else if (restDiff >= 2) a *= 0.97;
  if (restDiff <= -3) h *= 0.95;
  else if (restDiff <= -2) h *= 0.97;

  if (safeNum(fv.cupDistractionHome, 0) > 0.1) h *= (1 - fv.cupDistractionHome! * 0.15);
  if (safeNum(fv.cupDistractionAway, 0) > 0.1) a *= (1 - fv.cupDistractionAway! * 0.15);

  if (fv.seasonStage === 'early') { h *= 0.98; a *= 0.98; }
  return { homeXg: h, awayXg: a };
}

// xG capping — league-dependent
function capXg(homeXg: number, awayXg: number, baseHome: number, baseAway: number, fv: FeatureVector) {
  const leagueOver35 = safeNum(fv.leagueOver35Rate, 0.30);
  let perTeamCap: number, totalCap: number;
  if (leagueOver35 > 0.35) { perTeamCap = 3.5; totalCap = 7.0; }
  else if (leagueOver35 >= 0.25) { perTeamCap = 3.0; totalCap = 6.0; }
  else { perTeamCap = 2.5; totalCap = 5.0; }

  const capPair = (h: number, a: number) => {
    h = clamp(h, 0.2, perTeamCap);
    a = clamp(a, 0.2, perTeamCap);
    const t = h + a;
    if (t > totalCap) { const s = totalCap / t; h *= s; a *= s; }
    if (t < 0.8) { const s = 0.8 / t; h *= s; a *= s; }
    return { h, a };
  };

  const fh = capPair(homeXg, awayXg);
  const bh = capPair(baseHome, baseAway);
  return {
    homeExpectedGoals: parseFloat(fh.h.toFixed(3)),
    awayExpectedGoals: parseFloat(fh.a.toFixed(3)),
    totalExpectedGoals: parseFloat((fh.h + fh.a).toFixed(3)),
    baseHomeXg: parseFloat(bh.h.toFixed(3)),
    baseAwayXg: parseFloat(bh.a.toFixed(3)),
  };
}

// Main xG estimator — runs all 12 layers
function estimateExpectedGoals(fv: FeatureVector, script: ScriptOutput) {
  let { homeXg, awayXg } = computeBaseXg(fv);
  ({ homeXg, awayXg } = applyThinDataRegression(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyVenueAnchoring(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyScriptAdjustments(homeXg, awayXg, script, fv));
  const baseHomeXg = homeXg, baseAwayXg = awayXg;
  ({ homeXg, awayXg } = applyFormBoosts(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyOddsAnchor(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyH2HBlend(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyLeagueGoalRateAdjustment(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyAdvancedTacticalAI(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyBsdIntelligenceAdjustments(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyDeepBsdSignals(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyBsdContextAdjustments(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applySquadManagementAdjustments(homeXg, awayXg, fv));
  return capXg(homeXg, awayXg, baseHomeXg, baseAwayXg, fv);
}

// ═══════════════════════════════════════════════════════════════════════
// CALIBRATION — extracted to ./math/calibration.ts (covered by unit tests)
// ═══════════════════════════════════════════════════════════════════════
// (calibrateProbabilities is imported at the top of this file)


// ═══════════════════════════════════════════════════════════════════════
// MARKET REGISTRY (32 markets)
// ═══════════════════════════════════════════════════════════════════════

const MARKET_REGISTRY: Record<string, { selectable: boolean; requiresOdds: boolean; headlineEligible: boolean }> = {
  home_win: { selectable: true, requiresOdds: true, headlineEligible: true },
  away_win: { selectable: true, requiresOdds: true, headlineEligible: true },
  draw: { selectable: true, requiresOdds: true, headlineEligible: false },
  over_15: { selectable: true, requiresOdds: true, headlineEligible: true },
  over_25: { selectable: true, requiresOdds: true, headlineEligible: true },
  over_35: { selectable: true, requiresOdds: true, headlineEligible: false },
  under_15: { selectable: true, requiresOdds: true, headlineEligible: false },
  under_25: { selectable: true, requiresOdds: true, headlineEligible: true },
  under_35: { selectable: true, requiresOdds: true, headlineEligible: true },
  btts_yes: { selectable: true, requiresOdds: true, headlineEligible: true },
  btts_no: { selectable: true, requiresOdds: true, headlineEligible: true },
  double_chance_home: { selectable: true, requiresOdds: true, headlineEligible: false },
  double_chance_away: { selectable: true, requiresOdds: true, headlineEligible: false },
  home_over_05: { selectable: true, requiresOdds: true, headlineEligible: false },
  home_over_15: { selectable: true, requiresOdds: true, headlineEligible: false },
  home_over_25: { selectable: true, requiresOdds: true, headlineEligible: false },
  home_under_15: { selectable: true, requiresOdds: true, headlineEligible: false },
  away_over_05: { selectable: true, requiresOdds: true, headlineEligible: false },
  away_over_15: { selectable: true, requiresOdds: true, headlineEligible: false },
  away_over_25: { selectable: true, requiresOdds: true, headlineEligible: false },
  away_under_15: { selectable: true, requiresOdds: true, headlineEligible: false },
  win_either_half_home: { selectable: true, requiresOdds: true, headlineEligible: false },
  win_either_half_away: { selectable: true, requiresOdds: true, headlineEligible: false },
  dnb_home: { selectable: true, requiresOdds: true, headlineEligible: false },
  dnb_away: { selectable: true, requiresOdds: true, headlineEligible: false },
  handicap_home_minus1: { selectable: true, requiresOdds: true, headlineEligible: true },
  handicap_away_minus1: { selectable: true, requiresOdds: true, headlineEligible: true },
  handicap_home_plus1: { selectable: true, requiresOdds: true, headlineEligible: false },
  handicap_away_plus1: { selectable: true, requiresOdds: true, headlineEligible: false },
};

function isHeadlineEligibleMarket(marketKey: string): boolean {
  return MARKET_REGISTRY[marketKey]?.headlineEligible === true;
}

// ═══════════════════════════════════════════════════════════════════════
// BUILD MARKET CANDIDATES
// ═══════════════════════════════════════════════════════════════════════

const MARKET_DEFINITIONS = [
  { marketKey: 'home_win', selection: 'Home Win', probKey: 'homeWin' },
  { marketKey: 'away_win', selection: 'Away Win', probKey: 'awayWin' },
  { marketKey: 'draw', selection: 'Draw', probKey: 'draw' },
  { marketKey: 'double_chance_home', selection: 'Double Chance 1X', probKey: null, compute: (p: Record<string, number>) => safeNum(p.homeWin, 0) + safeNum(p.draw, 0) },
  { marketKey: 'double_chance_away', selection: 'Double Chance X2', probKey: null, compute: (p: Record<string, number>) => safeNum(p.awayWin, 0) + safeNum(p.draw, 0) },
  { marketKey: 'dnb_home', selection: 'Home Win (DNB)', probKey: null, compute: (p: Record<string, number>) => { const h = safeNum(p.homeWin, 0); const a = safeNum(p.awayWin, 0); const d = h + a; return d > 0.01 ? h / d : 0; } },
  { marketKey: 'dnb_away', selection: 'Away Win (DNB)', probKey: null, compute: (p: Record<string, number>) => { const h = safeNum(p.homeWin, 0); const a = safeNum(p.awayWin, 0); const d = h + a; return d > 0.01 ? a / d : 0; } },
  { marketKey: 'over_15', selection: 'Over 1.5 Goals', probKey: 'over15' },
  { marketKey: 'over_25', selection: 'Over 2.5 Goals', probKey: 'over25' },
  { marketKey: 'over_35', selection: 'Over 3.5 Goals', probKey: 'over35' },
  { marketKey: 'under_15', selection: 'Under 1.5 Goals', probKey: 'under15' },
  { marketKey: 'under_25', selection: 'Under 2.5 Goals', probKey: 'under25' },
  { marketKey: 'under_35', selection: 'Under 3.5 Goals', probKey: 'under35' },
  { marketKey: 'btts_yes', selection: 'BTTS Yes', probKey: 'bttsYes' },
  { marketKey: 'btts_no', selection: 'BTTS No', probKey: 'bttsNo' },
  { marketKey: 'home_over_05', selection: 'Home Over 0.5 Goals', probKey: 'homeOver05' },
  { marketKey: 'home_over_15', selection: 'Home Over 1.5 Goals', probKey: 'homeOver15' },
  { marketKey: 'home_over_25', selection: 'Home Over 2.5 Goals', probKey: 'homeOver25' },
  { marketKey: 'home_under_15', selection: 'Home Under 1.5 Goals', probKey: 'homeUnder15' },
  { marketKey: 'away_over_05', selection: 'Away Over 0.5 Goals', probKey: 'awayOver05' },
  { marketKey: 'away_over_15', selection: 'Away Over 1.5 Goals', probKey: 'awayOver15' },
  { marketKey: 'away_over_25', selection: 'Away Over 2.5 Goals', probKey: 'awayOver25' },
  { marketKey: 'away_under_15', selection: 'Away Under 1.5 Goals', probKey: 'awayUnder15' },
  { marketKey: 'win_either_half_home', selection: 'Home Win Either Half', probKey: null, compute: (p: Record<string, number>) => safeNum(p.homeOver05, 0) * 0.75 },
  { marketKey: 'win_either_half_away', selection: 'Away Win Either Half', probKey: null, compute: (p: Record<string, number>) => safeNum(p.awayOver05, 0) * 0.7 },
  { marketKey: 'handicap_home_minus1', selection: 'Home -1 (Handicap)', probKey: 'handicapHome1' },
  { marketKey: 'handicap_away_minus1', selection: 'Away -1 (Handicap)', probKey: 'handicapAwayMinus1' },
  { marketKey: 'handicap_home_plus1', selection: 'Home +1 (Handicap)', probKey: 'handicapHomePlus1' },
  { marketKey: 'handicap_away_plus1', selection: 'Away +1 (Handicap)', probKey: 'handicapAway1' },
];

function buildMarketCandidates(calibratedProbs: Record<string, number>): MarketCandidate[] {
  const probs = calibratedProbs || {};
  const candidates: MarketCandidate[] = [];
  for (const def of MARKET_DEFINITIONS) {
    let modelProbability: number;
    if (def.probKey && probs[def.probKey] != null) {
      modelProbability = safeNum(probs[def.probKey], 0);
    } else if (def.compute) {
      modelProbability = safeNum(def.compute(probs), 0);
    } else {
      continue;
    }
    candidates.push({
      marketKey: def.marketKey,
      selection: def.selection,
      modelProbability: parseFloat(clamp(modelProbability, 0, 1).toFixed(4)),
      impliedProbability: null,
      edge: null,
      finalScore: 0,
      bookmakerOdds: null,
    });
  }
  return candidates;
}

// ═══════════════════════════════════════════════════════════════════════
// IMPLIED PROBABILITIES / ODDS LOOKUP
// ═══════════════════════════════════════════════════════════════════════

const ODDS_MAP: Record<string, string[]> = {
  home_win: ['home_win', 'homeWin', 'home'],
  draw: ['draw', 'x', 'X'],
  away_win: ['away_win', 'awayWin', 'away'],
  over_15: ['over_15', 'over_1_5', 'over15', 'over_15_goals'],
  over_25: ['over_25', 'over_2_5', 'over25', 'over_25_goals'],
  over_35: ['over_35', 'over_3_5', 'over35', 'over_35_goals'],
  under_15: ['under_15', 'under_1_5', 'under15', 'under_15_goals'],
  under_25: ['under_25', 'under_2_5', 'under25', 'under_25_goals'],
  under_35: ['under_35', 'under_3_5', 'under35', 'under_35_goals'],
  btts_yes: ['btts_yes', 'bttsYes'],
  btts_no: ['btts_no', 'bttsNo'],
  double_chance_home: ['double_chance_1x', 'double_chance_1X'],
  double_chance_away: ['double_chance_x2', 'double_chance_X2'],
  dnb_home: ['draw_no_bet_home', 'dnb_home'],
  dnb_away: ['draw_no_bet_away', 'dnb_away'],
};

function lookupOdds(marketKey: string, oddsSnapshot: Record<string, any> | null): number | null {
  if (!oddsSnapshot) return null;
  const keys = ODDS_MAP[marketKey] || [marketKey];
  for (const k of keys) {
    if (oddsSnapshot[k] != null) {
      const val = safeNum(oddsSnapshot[k], 0);
      if (val > 1.0) return val;
    }
  }
  return null;
}

function computeImpliedProbabilities(candidates: MarketCandidate[], oddsSnapshot: Record<string, any> | null): MarketCandidate[] {
  return candidates.map(candidate => {
    const decimalOdds = lookupOdds(candidate.marketKey, oddsSnapshot);
    if (decimalOdds && decimalOdds > 1.0) {
      const impliedProbability = parseFloat((1 / decimalOdds).toFixed(4));
      const edge = parseFloat((candidate.modelProbability - impliedProbability).toFixed(4));
      return { ...candidate, impliedProbability, edge, bookmakerOdds: decimalOdds };
    }
    return { ...candidate, impliedProbability: null, edge: null, bookmakerOdds: null };
  });
}

// ═══════════════════════════════════════════════════════════════════════
// SCORING & RANKING
// ═══════════════════════════════════════════════════════════════════════

const SCRIPT_MARKET_FIT: Record<string, Record<string, number>> = {
  dominant_home_pressure: { home_win: 0.92, dnb_home: 0.85, home_over_15: 0.85, win_either_half_home: 0.80, handicap_home_minus1: 0.78, away_under_15: 0.78, double_chance_home: 0.72, under_25: 0.68, btts_no: 0.65, home_over_25: 0.60 },
  dominant_away_pressure: { away_win: 0.92, dnb_away: 0.85, away_over_15: 0.85, win_either_half_away: 0.80, handicap_away_minus1: 0.78, home_under_15: 0.78, double_chance_away: 0.72, under_25: 0.68, btts_no: 0.65, away_over_25: 0.60 },
  open_end_to_end: { btts_yes: 0.92, over_25: 0.88, over_35: 0.72, home_over_05: 0.70, away_over_05: 0.70, over_15: 0.65, home_over_15: 0.62, away_over_15: 0.62, under_25: 0.15, btts_no: 0.15 },
  tight_low_event: { under_25: 0.92, btts_no: 0.88, under_35: 0.75, away_under_15: 0.72, home_under_15: 0.72, dnb_home: 0.65, dnb_away: 0.65, double_chance_home: 0.60, double_chance_away: 0.60 },
  chaotic_unreliable: {},
};

function getTacticalFit(marketKey: string, script: ScriptOutput): number {
  if (script.primary === 'chaotic_unreliable') return 0.15;
  const primaryMap = SCRIPT_MARKET_FIT[script.primary] || {};
  const fit = primaryMap[marketKey];
  if (fit != null) return fit;
  if (script.secondary && script.secondary !== 'chaotic_unreliable') {
    const secondaryFit = (SCRIPT_MARKET_FIT[script.secondary] || {})[marketKey];
    if (secondaryFit != null) return secondaryFit * 0.7;
  }
  return 0.4;
}

const BAD_MARKET_PENALTY: Record<string, (c: MarketCandidate) => number> = {
  home_over_05: () => 0.9,
  away_over_05: () => 0.9,
  home_under_15: () => 0.45,
  away_under_15: () => 0.45,
  win_either_half_home: () => 0.3,
  win_either_half_away: () => 0.3,
  under_35: (c) => clamp(Math.max(0, safeNum(c.modelProbability, 0) - 0.72) * 2.5, 0, 0.65),
  over_15: (c) => { const odds = safeNum(c.bookmakerOdds, 0); const prob = safeNum(c.modelProbability, 0); if (odds > 1.0 && odds < 1.30) return 0.80; if (odds >= 1.30 && odds < 1.40) return clamp(0.25 + (0.40 - prob) * 1.5, 0.10, 0.45); return 0; },
  dnb_home: (c) => clamp(Math.max(0, safeNum(c.modelProbability, 0) - 0.60) * 1.0, 0, 0.4),
  dnb_away: (c) => clamp(Math.max(0, safeNum(c.modelProbability, 0) - 0.60) * 1.0, 0, 0.4),
  double_chance_home: (c) => clamp(Math.max(0, safeNum(c.modelProbability, 0) - 0.60) * 1.8, 0, 0.8),
  double_chance_away: (c) => clamp(Math.max(0, safeNum(c.modelProbability, 0) - 0.60) * 1.8, 0, 0.8),
};

function scoreMarketCandidates(candidates: MarketCandidate[], script: ScriptOutput, fv: FeatureVector): MarketCandidate[] {
  const dataSupportScore = clamp(safeNum(fv.dataCompletenessScore, 0.5), 0, 1);
  const volatilityPenalty = clamp(safeNum(fv.matchChaosScore, 0.5), 0, 1);
  const homeMatches = safeNum(fv.homeMatchesAvailable, 10);
  const awayMatches = safeNum(fv.awayMatchesAvailable, 10);
  const isDataStarved = homeMatches < 5 || awayMatches < 5;
  const starvationPenalty = isDataStarved ? 0.35 : 0;
  const dataCompleteness = safeNum(fv.dataCompletenessScore, 0.5);
  const matchChaos = safeNum(fv.matchChaosScore, 0.5);
  const upsetRisk = safeNum(fv.upsetRiskScore, 0.5);
  const predScore = (dataCompleteness * 0.5) + ((1 - matchChaos) * 0.3) + ((1 - upsetRisk) * 0.2);

  return candidates.map(candidate => {
    const modelConfidenceScore = clamp(safeNum(candidate.modelProbability, 0), 0, 1);
    const rawEdge = safeNum(candidate.edge, 0);
    const edgeScore = candidate.edge != null ? clamp(rawEdge * 5, -1, 1) : 0;
    const evScore = candidate.bookmakerOdds && candidate.bookmakerOdds > 1.0
      ? clamp((candidate.modelProbability * candidate.bookmakerOdds - 1) * 3, -1, 1) : 0;
    const combinedEdgeScore = (edgeScore * 0.4) + (evScore * 0.6);

    let tacticalFitScore = getTacticalFit(candidate.marketKey, script);
    if (fv.tacticalMatchup) {
      const tm = fv.tacticalMatchup;
      if (candidate.marketKey.includes('home') && tm.homeStyleEdge > 0) tacticalFitScore += 0.2;
      if (candidate.marketKey.includes('away') && tm.awayStyleEdge > 0) tacticalFitScore += 0.2;
      tacticalFitScore = clamp(tacticalFitScore, 0, 1);
    }

    // Volatility as market signal
    let volatilityAdjustment = 0;
    const marketKey = candidate.marketKey;
    if (volatilityPenalty > 0.55) {
      if (marketKey.includes('over') || marketKey === 'btts_yes') volatilityAdjustment = clamp(volatilityPenalty * 0.15, 0, 0.08);
      else if (marketKey.includes('under') || marketKey === 'btts_no') volatilityAdjustment = -clamp(volatilityPenalty * 0.10, 0, 0.06);
      else if (marketKey.includes('win') && !marketKey.includes('either')) volatilityAdjustment = -clamp(volatilityPenalty * 0.12, 0, 0.08);
    }

    const badMarketPenaltyFn = BAD_MARKET_PENALTY[candidate.marketKey];
    const badMarketPenalty = badMarketPenaltyFn ? badMarketPenaltyFn(candidate) : 0;

    // Script mismatch penalty
    let scriptMismatchPenalty = 0;
    if (script.primary === 'tight_low_event' && marketKey.includes('over')) scriptMismatchPenalty = 0.5;
    else if (script.primary === 'open_end_to_end' && marketKey.includes('under')) scriptMismatchPenalty = 0.5;

    // Form momentum
    const homePointsLast5 = safeNum(fv.homePointsLast5, 5);
    const awayPointsLast5 = safeNum(fv.awayPointsLast5, 5);
    const formGap = (homePointsLast5 - awayPointsLast5) / 15;
    let formMomentumScore = 0.3;
    if (marketKey.includes('home') && formGap > 0.2) formMomentumScore = 0.6;
    else if (marketKey.includes('away') && formGap < -0.2) formMomentumScore = 0.6;

    const riskPenaltyScore = (marketKey.includes('over') || marketKey === 'btts_yes' ? 0.08 : 0.14) * volatilityPenalty
      + 0.12 * scriptMismatchPenalty + starvationPenalty;
    const productPenaltyScore = 0.14 * badMarketPenalty;

    const modelScore = 0.12 * modelConfidenceScore;
    const marketEdgeComponent = 0.19 * combinedEdgeScore;
    const tacticalFitComponent = 0.12 * tacticalFitScore;
    const predictabilityComponent = 0.08 * predScore;
    const dataSupportComponent = 0.07 * dataSupportScore;
    const formMomentumComponent = 0.03 * formMomentumScore;

    let finalScore = modelScore + marketEdgeComponent + tacticalFitComponent
      + predictabilityComponent + dataSupportComponent + formMomentumComponent
      + volatilityAdjustment - riskPenaltyScore - productPenaltyScore;

    // EV bonus
    if (candidate.impliedProbability && candidate.impliedProbability > 0 && (candidate.edge ?? 0) >= 0.05) finalScore += 0.08;

    // Advisor status
    const odds = safeNum(candidate.bookmakerOdds, 0);
    const prob = safeNum(candidate.modelProbability, 0);
    const ev = odds > 1.0 ? (prob * odds) - 1 : null;
    const isPositiveEV = ev != null && ev >= 0;
    let advisorStatus: string;
    if (prob >= 0.72 && odds >= 1.30) advisorStatus = predScore < 0.20 ? 'ACCA' : 'BET';
    else if (prob >= 0.58 && odds >= 1.30 && odds <= 1.65) advisorStatus = isPositiveEV ? 'ACCA' : 'SKIP';
    else if (prob >= 0.60 && odds >= 1.25) advisorStatus = isPositiveEV ? 'ACCA' : 'SKIP';
    else if (prob >= 0.50 && isPositiveEV) advisorStatus = 'ACCA';
    else advisorStatus = 'SKIP';

    return {
      ...candidate,
      tacticalFitScore: parseFloat(tacticalFitScore.toFixed(3)),
      badMarketPenalty: parseFloat(badMarketPenalty.toFixed(3)),
      finalScore: parseFloat(clamp(finalScore, -0.5, 1.0).toFixed(4)),
      advisor_status: advisorStatus,
      ev: ev ?? null,
      volatilityAdjustment: parseFloat(volatilityAdjustment.toFixed(4)),
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════
// PRUNE WEAK CANDIDATES
// ═══════════════════════════════════════════════════════════════════════

const MARKET_MIN_PROB: Record<string, number> = {
  btts_yes: 0.64, btts_no: 0.68,
  double_chance_home: 0.68, double_chance_away: 0.68,
  draw: 0.60, home_win: 0.56, away_win: 0.56,
  dnb_home: 0.60, dnb_away: 0.60,
  over_25: 0.55, under_25: 0.55,
  over_15: 0.60, under_35: 0.72, over_35: 0.60,
};

function pruneWeakCandidates(scored: MarketCandidate[], fv: FeatureVector, script: ScriptOutput): MarketCandidate[] {
  const pruned: MarketCandidate[] = [];
  const minProb = 0.60;
  const minTactical = 0.12;

  for (const c of scored) {
    const prob = safeNum(c.modelProbability, 0);
    const tactical = safeNum(c.tacticalFitScore, 0);
    const score = safeNum(c.finalScore, 0);
    const edge = safeNum(c.edge, 0);
    const odds = safeNum(c.bookmakerOdds, 0);
    const ev = odds > 1.0 ? (prob * odds) - 1 : 0;

    const marketFloor = MARKET_MIN_PROB[c.marketKey] ?? minProb;

    // Probability floor with smart risk exception
    if (prob < marketFloor) {
      const dataCompleteness = safeNum(fv.dataCompletenessScore, 0.5);
      const isComfortMarket = ['under_35', 'over_15', 'double_chance_home', 'double_chance_away', 'home_over_05', 'away_over_05'].includes(c.marketKey);
      const smartRiskException = ev >= 0.02 && tactical >= 0.65 && !isComfortMarket && prob >= marketFloor - 0.08 && dataCompleteness >= 0.40;
      if (!smartRiskException) continue;
    }

    // Value trap filter
    if (edge > 0.35) continue;

    // Under 3.5 comfort guard
    if (c.marketKey === 'under_35' && prob < 0.74) continue;

    // Over 1.5 comfort guard
    if (c.marketKey === 'over_15') {
      if (odds > 1.0 && odds < 1.25) continue;
      if (odds >= 1.25 && odds < 1.40 && score < 0.35) continue;
    }

    if (tactical < minTactical) continue;
    if (score <= 0) continue;
    pruned.push(c);
  }
  return pruned;
}

// ═══════════════════════════════════════════════════════════════════════
// RANK MARKETS
// ═══════════════════════════════════════════════════════════════════════

const COMFORT_PENALTY: Record<string, number> = {
  under_35: 0.150, over_15: 0.100,
  double_chance_home: 0.080, double_chance_away: 0.080,
  home_over_05: 0.120, away_over_05: 0.120,
  dnb_home: 0.040, dnb_away: 0.040,
};

const SPECIFICITY_BONUS: Record<string, number> = {
  home_win: 0.060, away_win: 0.060, over_25: 0.050, under_25: 0.035,
  btts_yes: 0.045, btts_no: 0.025, home_over_15: 0.030, away_over_15: 0.030,
};

function rankMarkets(candidates: MarketCandidate[]): MarketCandidate[] {
  return [...candidates]
    .map(c => {
      const finalScore = safeNum(c.finalScore, 0);
      const probability = safeNum(c.modelProbability, 0);
      const tacticalFit = safeNum(c.tacticalFitScore, 0.4);
      const edge = safeNum(c.edge, 0);
      const comfortPenalty = COMFORT_PENALTY[c.marketKey] || 0;
      const specificityBonus = SPECIFICITY_BONUS[c.marketKey] || 0;
      const edgeComponent = edge > 0 ? Math.min(edge, 0.18) * 0.25 : Math.max(edge, -0.12) * 0.12;

      const headlineQualityScore = finalScore * 0.45
        + probability * 0.18
        + tacticalFit * 0.12
        + edgeComponent
        + specificityBonus
        - comfortPenalty;

      return { ...c, headlineQualityScore: parseFloat(headlineQualityScore.toFixed(4)) };
    })
    .sort((a, b) => {
      const qualityGap = safeNum(b.headlineQualityScore, 0) - safeNum(a.headlineQualityScore, 0);
      if (Math.abs(qualityGap) > 0.003) return qualityGap;
      return safeNum(b.modelProbability, 0) - safeNum(a.modelProbability, 0);
    });
}

// ═══════════════════════════════════════════════════════════════════════
// SELECT BEST PICK OR ABSTAIN
// ═══════════════════════════════════════════════════════════════════════

function computeRiskLevel(pick: MarketCandidate, fv: FeatureVector, script: ScriptOutput): string {
  const prob = safeNum(pick.modelProbability, 0);
  const chaos = safeNum(fv.matchChaosScore, 0.5);
  const marketKey = pick.marketKey || '';
  const isChaotic = script.primary === 'chaotic_unreliable' || script.primary === 'open_end_to_end';
  const isStable = ['under_35', 'under_25', 'double_chance_home', 'double_chance_away', 'dnb_home', 'dnb_away'].includes(marketKey);
  const isVolatile = ['btts_yes', 'over_35', 'over_25', 'home_over_25', 'away_over_25'].includes(marketKey);

  if (prob >= 0.74) {
    if (isChaotic && chaos >= 0.80) return 'MODERATE';
    return 'SAFE';
  }
  if (prob >= 0.65) {
    if (isChaotic && chaos >= 0.72) return 'AGGRESSIVE';
    if (isStable && chaos < 0.55) return 'SAFE';
    return 'MODERATE';
  }
  if (prob >= 0.58) {
    if (isChaotic || chaos >= 0.68 || isVolatile) return 'AGGRESSIVE';
    return 'MODERATE';
  }
  return 'AGGRESSIVE';
}

function computeEdgeLabel(pick: MarketCandidate, riskLevel: string): string {
  const prob = safeNum(pick.modelProbability, 0);
  if (prob >= 0.74) return riskLevel === 'SAFE' ? 'STRONG EDGE' : 'GAMBLE EDGE';
  if (prob >= 0.65) return 'MODERATE EDGE';
  if (prob >= 0.55) return 'LEAN';
  return 'NO EDGE';
}

function phantomScoreOf(candidate: MarketCandidate): number {
  const prob = safeNum(candidate.modelProbability, 0);
  const finalScore = safeNum(candidate.finalScore, prob);
  return (prob * 0.55) + (finalScore * 0.45);
}

function isPricedCandidate(candidate: MarketCandidate): boolean {
  if (!candidate) return false;
  if (safeNum(candidate.bookmakerOdds, 0) > 1.0) return true;
  const impliedProbability = safeNum(candidate.impliedProbability, 0);
  return impliedProbability > 0 && impliedProbability < 1;
}

function isHeadlineQualityCandidate(candidate: MarketCandidate, fv: FeatureVector, script: ScriptOutput): boolean {
  const prob = safeNum(candidate.modelProbability, 0);
  const finalScore = safeNum(candidate.finalScore, 0);
  const phantomScore = phantomScoreOf(candidate);
  const dataScore = safeNum(fv.dataCompletenessScore, 0.5);
  const risk = computeRiskLevel(candidate, fv, script);
  const volatilityScore = safeNum(script.volatilityScore, 0.5);
  const isHighVolatility = volatilityScore > 0.70;
  const chaos = safeNum(fv.matchChaosScore, 0.5);
  const edge = safeNum(candidate.edge, 0);

  if (prob < 0.50) return false;
  if (finalScore < 0.36) return false;
  if (phantomScore < 0.50) return false;
  if (dataScore < 0.30) return false;

  if (risk === 'AGGRESSIVE' || isHighVolatility || chaos >= 0.68) {
    if (phantomScore < 0.55) return false;
    if (finalScore < 0.42) return false;
    if (prob < 0.65) return false;
  }

  if ((candidate.impliedProbability ?? 0) > 0 && edge < 0.01 && prob < 0.72) return false;
  return true;
}

function selectBestPickOrAbstain(
  ranked: MarketCandidate[],
  script: ScriptOutput,
  fv: FeatureVector
): {
  bestPick: MarketCandidate | null;
  backupPicks: MarketCandidate[];
  noSafePick: boolean;
  noSafePickReason: string | null;
  abstainCode: string | null;
} {
  const pricedRanked = ranked.filter(isPricedCandidate);
  const qualityPricedRanked = pricedRanked.filter(c => isHeadlineQualityCandidate(c, fv, script));

  const abstain = (reason: string, code: string) => ({
    bestPick: null,
    backupPicks: ranked.slice(0, 2),
    noSafePick: true,
    noSafePickReason: reason,
    abstainCode: code,
  });

  if (ranked.length === 0) return abstain('No candidates survived pruning', 'NO_CANDIDATES');

  // Model-only eligibility
  if (pricedRanked.length === 0) {
    const modelOnly = ranked.find(c => {
      if (!isHeadlineEligibleMarket(c.marketKey)) return false;
      const prob = safeNum(c.modelProbability, 0);
      const fs = safeNum(c.finalScore, 0);
      const ps = phantomScoreOf(c);
      const ds = safeNum(fv.dataCompletenessScore, 0.5);
      return prob >= 0.62 && fs >= 0.42 && ps >= 0.55 && ds >= 0.40;
    });
    if (modelOnly) {
      const riskLevel = computeRiskLevel(modelOnly, fv, script);
      const edgeLabel = computeEdgeLabel(modelOnly, riskLevel);
      return {
        bestPick: { ...modelOnly, riskLevel, edgeLabel, isModelOnly: true, advisor_status: safeNum(modelOnly.modelProbability, 0) >= 0.72 ? 'BET' : safeNum(modelOnly.modelProbability, 0) >= 0.60 ? 'ACCA' : 'SKIP' },
        backupPicks: ranked.slice(0, 2),
        noSafePick: false,
        noSafePickReason: null,
        abstainCode: null,
      };
    }
    return abstain('No priced markets available', 'NO_PRICED_MARKETS');
  }

  if (qualityPricedRanked.length === 0) {
    const top = pricedRanked[0];
    return abstain(`No headline-quality priced market — top prob=${(safeNum(top.modelProbability, 0) * 100).toFixed(1)}%`, 'LOW_HEADLINE_QUALITY');
  }

  const top = qualityPricedRanked[0];
  const topProb = safeNum(top.modelProbability, 0);

  if (topProb < 0.50) return abstain(`Best pick probability too low (${(topProb * 100).toFixed(1)}%)`, 'LOW_PROBABILITY');

  // Separation check
  if (qualityPricedRanked.length >= 2) {
    const hasOdds = qualityPricedRanked.some(c => c.edge != null && c.edge !== 0);
    const minGap = hasOdds ? 0.010 : 0.008;
    const gap = safeNum(top.finalScore, 0) - safeNum(qualityPricedRanked[1].finalScore, 0);
    if (gap < minGap) {
      const secondProb = safeNum(qualityPricedRanked[1].modelProbability, 0);
      if (topProb >= 0.60 && secondProb >= 0.60) {
        // Both strong — trust top
      } else {
        return abstain('Top two headline-quality markets too close', 'WEAK_SEPARATION');
      }
    }
  }

  // Edge label gate
  const annotatedTop = { ...top, riskLevel: computeRiskLevel(top, fv, script), edgeLabel: computeEdgeLabel(top, computeRiskLevel(top, fv, script)) };
  const hasAnyOdds = qualityPricedRanked.some(c => c.edge != null && c.edge !== 0);
  if (hasAnyOdds && annotatedTop.edgeLabel === 'NO EDGE') return abstain('Best pick has NO EDGE', 'NO_EDGE');

  // Thin thesis check
  const topFinalScore = safeNum(top.finalScore, 0);
  const topEdge = safeNum(top.edge, 0);
  if (topFinalScore < 0.48 && topEdge < 0.02 && safeNum(fv.dataCompletenessScore, 0.5) < 0.45 && safeNum(script.volatilityScore, 0.5) > 0.62) {
    return abstain('Thesis too thin — weak edge with shaky evidence quality', 'THIN_THESIS');
  }

  // Conflicting evidence check
  if (qualityPricedRanked.length >= 3) {
    const topGap = topFinalScore - safeNum(qualityPricedRanked[1]?.finalScore, 0);
    const thirdGap = topFinalScore - safeNum(qualityPricedRanked[2]?.finalScore, 0);
    if (topGap < 0.018 && thirdGap < 0.032 && topEdge < 0.03) {
      return abstain('Evidence split across multiple market angles', 'CONFLICTING_EVIDENCE');
    }
  }

  // All gates passed
  return {
    bestPick: annotatedTop,
    backupPicks: ranked.slice(0, 3).filter(p => p !== top).slice(0, 2),
    noSafePick: false,
    noSafePickReason: null,
    abstainCode: null,
  };
}

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
  const [
    oddsRow, leagueRow, homeTeamRow, awayTeamRow,
    homeStandings, awayStandings, h2hMatches,
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
  const sm = buildScoreMatrix(xg.homeExpectedGoals, xg.awayExpectedGoals);
  const rawProbs = deriveMarketProbabilities(sm);

  const impliedOdds = {
    impliedHomeProb: features.impliedHomeProb,
    impliedAwayProb: features.impliedAwayProb,
    impliedOver25: features.impliedOver25,
    impliedOver15: features.impliedOver15,
    impliedBttsYes: features.impliedBttsYes,
  };

  const calibratedProbs = calibrateProbabilities(rawProbs, script, impliedOdds);
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
