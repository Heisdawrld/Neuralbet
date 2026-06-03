import { clamp, safeNum } from '../utils';
import type { CipherPrediction, FixtureInput } from './types';

const MODEL_VERSION = 'cipher-alpha-0.1';

function implied(odds?: number | null) {
  return odds && odds > 1 ? 1 / odds : null;
}

function kelly(prob: number, odds: number | null) {
  if (!odds || odds <= 1) return 0;
  const b = odds - 1;
  const q = 1 - prob;
  return clamp(((b * prob) - q) / b, 0, 0.08);
}

export function predictFixture(input: FixtureInput): CipherPrediction {
  const memory = input.memory || {
    homeMomentum: 0.55, awayMomentum: 0.50,
    homeAttack: 0.55, awayAttack: 0.50,
    homeDefense: 0.52, awayDefense: 0.50,
    homeFatigue: 0.35, awayFatigue: 0.35,
  };

  const homeOdds = safeNum(input.odds?.home_win, 0) || null;
  const drawOdds = safeNum(input.odds?.draw, 0) || null;
  const awayOdds = safeNum(input.odds?.away_win, 0) || null;

  const marketHome = implied(homeOdds) ?? 0.43;
  const marketDraw = implied(drawOdds) ?? 0.27;
  const marketAway = implied(awayOdds) ?? 0.30;
  const marketTotal = marketHome + marketDraw + marketAway;

  const noVigHome = marketHome / marketTotal;
  const noVigDraw = marketDraw / marketTotal;
  const noVigAway = marketAway / marketTotal;

  const momentumEdge = (memory.homeMomentum - memory.awayMomentum) * 0.16;
  const attackEdge = (memory.homeAttack - memory.awayDefense) * 0.12;
  const fatigueEdge = (memory.awayFatigue - memory.homeFatigue) * 0.08;
  const homeBias = 0.035;

  let homeProb = clamp(noVigHome + momentumEdge + attackEdge + fatigueEdge + homeBias, 0.05, 0.82);
  let awayProb = clamp(noVigAway - momentumEdge - attackEdge - fatigueEdge, 0.05, 0.75);
  let drawProb = clamp(1 - homeProb - awayProb, 0.08, 0.35);
  const norm = homeProb + drawProb + awayProb;
  homeProb /= norm; drawProb /= norm; awayProb /= norm;

  const candidates = [
    { market: '1X2', selection: input.homeTeam, prob: homeProb, odds: homeOdds },
    { market: '1X2', selection: 'Draw', prob: drawProb, odds: drawOdds },
    { market: '1X2', selection: input.awayTeam, prob: awayProb, odds: awayOdds },
  ].map((c) => {
    const imp = implied(c.odds);
    return { ...c, edge: imp == null ? null : c.prob - imp };
  }).sort((a, b) => (b.edge ?? b.prob - 0.5) - (a.edge ?? a.prob - 0.5));

  const top = candidates[0];
  const edge = top.edge;
  const hasOdds = top.odds && top.odds > 1;
  const riskFlags = [
    memory.homeFatigue > 0.72 || memory.awayFatigue > 0.72 ? 'fatigue' : null,
    Math.abs(memory.homeMomentum - memory.awayMomentum) < 0.06 ? 'thin_momentum_gap' : null,
    !hasOdds ? 'missing_odds' : null,
  ].filter(Boolean);

  const confidence = !hasOdds || edge == null || edge < 0.015 ? 'SKIP'
    : edge > 0.075 && top.prob > 0.58 ? 'STRONG'
    : edge > 0.035 ? 'LEAN'
    : 'WATCH';

  const risk = confidence === 'SKIP' ? 'NO_BET'
    : riskFlags.length >= 2 ? 'AGGRESSIVE'
    : top.prob > 0.62 ? 'SAFE'
    : 'BALANCED';

  const stakeFraction = confidence === 'SKIP' ? 0 : kelly(top.prob, top.odds) * (risk === 'AGGRESSIVE' ? 0.35 : risk === 'BALANCED' ? 0.55 : 0.75);

  const report = [
    `Cipher leans ${top.selection} in ${input.homeTeam} vs ${input.awayTeam}.`,
    `The model combines market baseline with team memory: momentum, attack/defence trend and fatigue pressure.`,
    edge != null ? `Detected edge is ${(edge * 100).toFixed(1)}% versus available price ${top.odds?.toFixed(2)}.` : 'No reliable bookmaker price is available, so this is treated as model-only intelligence.',
    confidence === 'SKIP' ? 'Recommendation: skip until price/context improves.' : `Recommendation: ${confidence.toLowerCase()} play with ${risk.toLowerCase()} risk.`
  ].join(' ');

  return {
    fixtureId: input.id,
    market: top.market,
    selection: top.selection,
    probability: Number(top.prob.toFixed(4)),
    fairOdds: Number((1 / top.prob).toFixed(2)),
    bookmakerOdds: top.odds,
    edge: edge == null ? null : Number(edge.toFixed(4)),
    confidence,
    risk,
    stakeFraction: Number(stakeFraction.toFixed(4)),
    report,
    features: { modelVersion: MODEL_VERSION, noVigHome, noVigDraw, noVigAway, memory, riskFlags, candidates },
  };
}
