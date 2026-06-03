import { clamp, safeNum } from '../utils';
import type { CipherPick, CipherPrediction, Confidence, FixtureInput, Risk } from './types';

const MODEL_VERSION = 'cipher-alpha-0.2';

function implied(odds?: number | null) {
  return odds && odds > 1 ? 1 / odds : null;
}

function kelly(prob: number, odds: number | null) {
  if (!odds || odds <= 1) return 0;
  const b = odds - 1;
  const q = 1 - prob;
  return clamp(((b * prob) - q) / b, 0, 0.08);
}

function pickOdds(odds: Record<string, number | null> | undefined, keys: string[]) {
  for (const key of keys) {
    const v = safeNum(odds?.[key], 0);
    if (v > 1) return v;
  }
  return null;
}

function scorePick(input: Omit<CipherPick, 'fairOdds' | 'edge' | 'confidence' | 'risk' | 'stakeFraction'>, riskFlags: string[]): CipherPick {
  const bookmakerOdds = input.bookmakerOdds;
  const imp = implied(bookmakerOdds);
  const edge = imp == null ? null : input.probability - imp;
  const hasOdds = bookmakerOdds != null && bookmakerOdds > 1;
  const confidence: Confidence = !hasOdds || edge == null || edge < 0.015 ? 'SKIP'
    : edge > 0.075 && input.probability > 0.58 ? 'STRONG'
    : edge > 0.035 ? 'LEAN'
    : 'WATCH';
  const risk: Risk = confidence === 'SKIP' ? 'NO_BET'
    : riskFlags.length >= 2 ? 'AGGRESSIVE'
    : input.probability > 0.66 ? 'SAFE'
    : 'BALANCED';
  const mult = risk === 'AGGRESSIVE' ? 0.35 : risk === 'BALANCED' ? 0.55 : 0.75;
  return {
    ...input,
    probability: Number(input.probability.toFixed(4)),
    fairOdds: Number((1 / input.probability).toFixed(2)),
    edge: edge == null ? null : Number(edge.toFixed(4)),
    confidence,
    risk,
    stakeFraction: confidence === 'SKIP' ? 0 : Number((kelly(input.probability, bookmakerOdds) * mult).toFixed(4)),
  };
}

export function predictFixture(input: FixtureInput, options: { tier?: 'free' | 'premium' } = {}): CipherPrediction {
  const tier = options.tier ?? 'free';
  const memory = input.memory || {
    homeMomentum: 0.55, awayMomentum: 0.50,
    homeAttack: 0.55, awayAttack: 0.50,
    homeDefense: 0.52, awayDefense: 0.50,
    homeFatigue: 0.35, awayFatigue: 0.35,
  };

  const homeOdds = pickOdds(input.odds, ['home_win', 'home', '1']);
  const drawOdds = pickOdds(input.odds, ['draw', 'x']);
  const awayOdds = pickOdds(input.odds, ['away_win', 'away', '2']);

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

  const expectedHomeGoals = clamp(1.15 + memory.homeAttack * 1.1 - (1 - memory.awayDefense) * 0.55 + homeBias, 0.35, 3.2);
  const expectedAwayGoals = clamp(0.95 + memory.awayAttack * 1.0 - (1 - memory.homeDefense) * 0.55 - homeBias, 0.25, 2.9);
  const totalGoals = expectedHomeGoals + expectedAwayGoals;
  const bothScorePressure = clamp((memory.homeAttack + memory.awayAttack + (1 - memory.homeDefense) + (1 - memory.awayDefense)) / 4, 0, 1);

  const over15 = clamp(1 - Math.exp(-totalGoals) * (1 + totalGoals), 0.25, 0.92);
  const over25 = clamp(1 - Math.exp(-totalGoals) * (1 + totalGoals + (totalGoals ** 2) / 2), 0.12, 0.78);
  const btts = clamp(0.22 + bothScorePressure * 0.58, 0.18, 0.78);

  const riskFlags = [
    memory.homeFatigue > 0.72 || memory.awayFatigue > 0.72 ? 'fatigue' : null,
    Math.abs(memory.homeMomentum - memory.awayMomentum) < 0.06 ? 'thin_momentum_gap' : null,
    !homeOdds && !drawOdds && !awayOdds ? 'missing_1x2_odds' : null,
  ].filter(Boolean) as string[];

  const picks = [
    { market: '1X2', selection: input.homeTeam, probability: homeProb, bookmakerOdds: homeOdds, premiumOnly: false },
    { market: '1X2', selection: 'Draw', probability: drawProb, bookmakerOdds: drawOdds, premiumOnly: true },
    { market: '1X2', selection: input.awayTeam, probability: awayProb, bookmakerOdds: awayOdds, premiumOnly: true },
    { market: 'Double Chance', selection: `${input.homeTeam} or Draw`, probability: clamp(homeProb + drawProb, 0.05, 0.95), bookmakerOdds: pickOdds(input.odds, ['home_or_draw', '1x']), premiumOnly: true },
    { market: 'Double Chance', selection: `${input.awayTeam} or Draw`, probability: clamp(awayProb + drawProb, 0.05, 0.95), bookmakerOdds: pickOdds(input.odds, ['away_or_draw', 'x2']), premiumOnly: true },
    { market: 'Draw No Bet', selection: input.homeTeam, probability: clamp(homeProb / (homeProb + awayProb), 0.05, 0.95), bookmakerOdds: pickOdds(input.odds, ['home_dnb']), premiumOnly: true },
    { market: 'Goals', selection: 'Over 1.5 Goals', probability: over15, bookmakerOdds: pickOdds(input.odds, ['over_15_goals', 'over_1_5']), premiumOnly: false },
    { market: 'Goals', selection: 'Over 2.5 Goals', probability: over25, bookmakerOdds: pickOdds(input.odds, ['over_25_goals', 'over_2_5']), premiumOnly: true },
    { market: 'Goals', selection: 'Under 2.5 Goals', probability: clamp(1 - over25, 0.12, 0.88), bookmakerOdds: pickOdds(input.odds, ['under_25_goals', 'under_2_5']), premiumOnly: true },
    { market: 'BTTS', selection: 'Both Teams To Score — Yes', probability: btts, bookmakerOdds: pickOdds(input.odds, ['btts_yes']), premiumOnly: true },
    { market: 'BTTS', selection: 'Both Teams To Score — No', probability: clamp(1 - btts, 0.18, 0.82), bookmakerOdds: pickOdds(input.odds, ['btts_no']), premiumOnly: true },
  ].map((p) => scorePick(p, riskFlags))
   .sort((a, b) => (b.edge ?? b.probability - 0.5) - (a.edge ?? a.probability - 0.5));

  const visiblePicks = tier === 'premium' ? picks : picks.filter((p) => !p.premiumOnly).slice(0, 2);
  const top = visiblePicks.find((p) => p.confidence !== 'SKIP') ?? visiblePicks[0] ?? picks[0];
  const lockedPicks = tier === 'premium' ? 0 : Math.max(0, picks.length - visiblePicks.length);

  const report = [
    `Cipher leans ${top.selection} in ${input.homeTeam} vs ${input.awayTeam}.`,
    `The model weighs market baseline against team memory: momentum, attack/defence trend, goal pressure and fatigue.`,
    top.edge != null ? `Detected edge is ${(top.edge * 100).toFixed(1)}% versus available price ${top.bookmakerOdds?.toFixed(2)}.` : 'No reliable bookmaker price is available on this market, so this is treated as model-only intelligence.',
    tier === 'free' && lockedPicks > 0 ? `${lockedPicks} premium market reads are locked.` : `Premium market matrix includes ${picks.length} candidate reads.`,
    top.confidence === 'SKIP' ? 'Recommendation: skip until price/context improves.' : `Recommendation: ${top.confidence.toLowerCase()} play with ${top.risk.toLowerCase()} risk.`
  ].join(' ');

  return {
    fixtureId: input.id,
    ...top,
    report,
    features: { modelVersion: MODEL_VERSION, noVigHome, noVigDraw, noVigAway, memory, riskFlags, expectedHomeGoals, expectedAwayGoals, totalGoals },
    picks: visiblePicks,
    tier,
    lockedPicks,
  };
}
