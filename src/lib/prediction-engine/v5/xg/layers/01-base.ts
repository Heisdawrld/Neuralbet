// ═══════════════════════════════════════════════════════════════════════
// Layer 1: Base xG from team attack/defence vs league average
//
// The starting point for every xG estimate. Each team's "attack strength"
// is their average-scored relative to the league average; similarly for
// defence. We multiply each side's attack by the opposing defence and
// scale by league average, then apply home advantage to the home side.
//
// This is the canonical Dixon-Coles inspired team-strength model:
//   λ_home = HomeAttack × AwayDefence × LeagueAvg × HomeAdvantage
//   λ_away = AwayAttack × HomeDefence × LeagueAvg
//
// Attack/defence ratios are clamped to defensible ranges so a single
// blowout in a team's recent form can't produce λ=5.0.
// ═══════════════════════════════════════════════════════════════════════

import type { FeatureVector } from '../../types';
import { GLOBAL_LEAGUE_AVG, HOME_ADV, clamp, safeNum, type XgPair } from '../shared';

/** Clamp ranges for the attack/defence ratios. Wide enough for genuine
 *  outliers (Bayern, Man City) but narrow enough to avoid catastrophic
 *  garbage-in scenarios (e.g. a team with 2 fixtures averaging 5 goals
 *  shouldn't drive an attack ratio above 2.2). */
export const ATTACK_CLAMP_MIN = 0.30;
export const ATTACK_CLAMP_MAX = 2.20;
export const DEFENCE_CLAMP_MIN = 0.30;
export const DEFENCE_CLAMP_MAX = 1.80;

/** Per-side default goal averages when feature vector lacks the field.
 *  Away teams score ~10% less than home teams in the long run — that's
 *  why awayAvgScored falls back to 0.9 × leagueAvg. */
export const AWAY_SCORED_DEFAULT_RATIO = 0.9;

export function computeBaseXg(fv: any): XgPair {
  const LEAGUE_AVG = safeNum((fv as any).leagueAvgGoalsPerTeam, GLOBAL_LEAGUE_AVG);
  const homeAdv = (fv as any).isNeutralGround ? 1.0 : HOME_ADV;

  const hAS = safeNum((fv as any).homeAvgScored, LEAGUE_AVG);
  const aAS = safeNum((fv as any).awayAvgScored, LEAGUE_AVG * AWAY_SCORED_DEFAULT_RATIO);
  const hAC = safeNum((fv as any).homeAvgConceded, LEAGUE_AVG);
  const aAC = safeNum((fv as any).awayAvgConceded, LEAGUE_AVG);

  const hAtk = clamp(hAS / LEAGUE_AVG, ATTACK_CLAMP_MIN, ATTACK_CLAMP_MAX);
  const aAtk = clamp(aAS / LEAGUE_AVG, ATTACK_CLAMP_MIN, ATTACK_CLAMP_MAX);
  const hDef = clamp(hAC / LEAGUE_AVG, DEFENCE_CLAMP_MIN, DEFENCE_CLAMP_MAX);
  const aDef = clamp(aAC / LEAGUE_AVG, DEFENCE_CLAMP_MIN, DEFENCE_CLAMP_MAX);

  return {
    homeXg: hAtk * aDef * LEAGUE_AVG * homeAdv,
    awayXg: aAtk * hDef * LEAGUE_AVG,
  };
}
