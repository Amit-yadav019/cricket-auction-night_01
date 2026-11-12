import { Team, Player, getDynamicRoleRequirements, calculateMaxBid } from '../game/auctionRules';

export type PitchConditionTag =
  | 'balanced'
  | 'spin'
  | 'flat'
  | 'bounce'
  | 'large_ground'
  | 'small_ground';

export interface TeamScoutRanking {
  teamId: string;
  teamName: string;
  scoreOutOf10: number;
  verdict: string;
  benchPenaltyNote?: string;
  benchStrength: string;
  projectedStats: {
    avgBattingScore: number;
    avgBattingWickets: number;
    avgBowlingConceded: number;
    avgBowlingWickets: number;
    netRunDifferential: number;
  };
  playingBalance: {
    battingDepth: string;
    deathBowling: string;
    spinQuality: string;
    powerplayImpact: string;
    battingOrderSynergy: string;
  };
  metrics: {
    sixthBowlingOption: boolean;
    powerHittingIndex: number;
    anchorStabilityIndex: number;
    deathOverRating: number;
    variationsRating: number;
    battingOrderScore: number;
  };
  archetypeBreakdown: string[];
  pros: string[];
  cons: string[];
}

export interface MasterScoutReport {
  executiveSummary: string;
  activeConditions: PitchConditionTag[];
  rankings: TeamScoutRanking[];
  generatedAt: number;
}

export interface TournamentSimulationResult {
  championTeamId: string;
  championTeamName: string;
  runnerUpTeamName: string;
  finalMatchSummary: string;
  orangeCap: { playerName: string; teamName: string; runs: number; strikeRate: number; reason: string };
  purpleCap: { playerName: string; teamName: string; wickets: number; economy: number; reason: string };
  superStriker: { playerName: string; teamName: string; strikeRate: number; runs: number };
  manOfTournament: { playerName: string; teamName: string; mvpPoints: number; summary: string };
  pointsTable: Array<{
    teamId: string;
    teamName: string;
    played: number;
    won: number;
    lost: number;
    nrr: string;
    points: number;
  }>;
}

export type BattingSlotRole = 'opener' | 'top_middle' | 'finisher' | 'tailender';

export interface PlayerTacticalDNA {
  power: number;
  stability: number;
  ppBowl: number;
  deathBowl: number;
  variations: number;
  spinControl: number;
  fielding: number;
  versatility: number;
  leadership: number;
  isGenuineBowler: boolean;
  preferredSlot: BattingSlotRole;
  tag: string;
}

export interface TeamLineupConfig {
  playingIds: string[];
  benchIds: string[];
  impactPlayerId?: string;
  captainId?: string;
  viceCaptainId?: string;
  contractTypes?: Record<string, '1yr' | '3yr'>;
}

export function derivePlayerDNA(player: Player): PlayerTacticalDNA {
  const isMarquee = (player.basePrice || 0.5) >= 2.0;
  const isPremium = (player.basePrice || 0.5) >= 1.5;
  const isMidTier = (player.basePrice || 0.5) >= 1.0;
  const isCapped = player.cappedStatus !== 'Uncapped';

  const tierBonus = isMarquee ? 18 : isPremium ? 13 : isMidTier ? 7 : isCapped ? 3 : 0;
  const bowlStyle = (player.bowlingStyle || '').toLowerCase();
  const batStyle = (player.battingStyle || '').toLowerCase();
  const isLeftHandBat = batStyle.includes('left');
  const nameSeed = player.name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 6;
  const leadership = isMarquee ? 90 + (nameSeed % 5) : isPremium ? 82 + (nameSeed % 5) : 70 + (nameSeed % 5);

  switch (player.role) {
    case 'WK': {
      const power = Math.min(99, 75 + tierBonus + nameSeed);
      const stability = Math.min(96, 71 + Math.round(tierBonus * 0.9) + (isLeftHandBat ? 2 : 0));
      const preferredSlot: BattingSlotRole =
        power >= 91 && stability < 84 ? 'finisher' : stability >= 82 ? 'opener' : 'top_middle';
      return {
        power,
        stability,
        ppBowl: 0,
        deathBowl: 0,
        variations: 0,
        spinControl: 0,
        fielding: Math.min(97, 83 + Math.round(tierBonus * 0.6)),
        versatility: Math.min(95, 73 + tierBonus),
        leadership,
        isGenuineBowler: false,
        preferredSlot,
        tag:
          preferredSlot === 'opener'
            ? 'Top-Order WK-Opener (Ideal #1–#3)'
            : preferredSlot === 'finisher'
            ? 'Explosive WK-Finisher (Ideal #5–#7)'
            : 'Middle-Order WK-Batter (Ideal #3–#5)',
      };
    }

    case 'BAT': {
      const isPowerArchetype = nameSeed % 2 === 0;
      const power = Math.min(99, 74 + tierBonus + (isPowerArchetype ? 5 : 0) + (isLeftHandBat ? 2 : 0));
      const stability = Math.min(99, 75 + tierBonus + (!isPowerArchetype ? 6 : 0));
      const preferredSlot: BattingSlotRole =
        stability >= 85 ? 'opener' : power >= 90 && stability < 80 ? 'finisher' : 'top_middle';
      return {
        power,
        stability,
        ppBowl: 0,
        deathBowl: 0,
        variations: 0,
        spinControl: 0,
        fielding: Math.min(97, 79 + Math.round(tierBonus * 0.7) + (nameSeed % 4)),
        versatility: Math.min(95, 72 + tierBonus),
        leadership,
        isGenuineBowler: false,
        preferredSlot,
        tag:
          preferredSlot === 'opener'
            ? 'Top-Order Anchor / Opener (Ideal #1–#3)'
            : preferredSlot === 'finisher'
            ? 'Death-Over Power Finisher (Ideal #5–#7)'
            : 'Middle-Over Spin & Pace Enforcer (Ideal #3–#5)',
      };
    }

    case 'AR': {
      const isSpinnerAR =
        bowlStyle.includes('spin') ||
        bowlStyle.includes('orthodox') ||
        bowlStyle.includes('offbreak') ||
        bowlStyle.includes('legbreak');
      const isFastAR = bowlStyle.includes('fast') || bowlStyle.includes('medium');

      const power = Math.min(98, 76 + tierBonus + (nameSeed % 5));
      const stability = Math.min(93, 71 + Math.round(tierBonus * 0.85));
      const ppBowl = isFastAR ? 58 + tierBonus : isSpinnerAR ? 46 + Math.round(tierBonus * 0.7) : 48 + tierBonus;
      const deathBowl = isFastAR ? 62 + tierBonus : isSpinnerAR ? 36 + Math.round(tierBonus * 0.6) : 45 + tierBonus;
      const spinControl = isSpinnerAR ? 70 + tierBonus : 15;
      const variations = Math.min(96, 62 + tierBonus + (isSpinnerAR ? 8 : 6));

      return {
        power,
        stability,
        ppBowl: Math.min(95, ppBowl),
        deathBowl: Math.min(95, deathBowl),
        variations,
        spinControl: Math.min(96, spinControl),
        fielding: Math.min(97, 81 + Math.round(tierBonus * 0.7)),
        versatility: Math.min(99, 86 + Math.round(tierBonus * 0.7)),
        leadership,
        isGenuineBowler: true,
        preferredSlot: 'finisher',
        tag: isSpinnerAR
          ? 'Spin All-Rounder & Floater (Ideal #5–#8)'
          : 'Seam All-Rounder & Finisher (Ideal #5–#8)',
      };
    }

    case 'BOWL': {
      const isSpinner =
        bowlStyle.includes('spin') ||
        bowlStyle.includes('orthodox') ||
        bowlStyle.includes('offbreak') ||
        bowlStyle.includes('legbreak');
      const isLeftArmPace = bowlStyle.includes('left-arm fast') || bowlStyle.includes('left-arm medium');

      const isDeathSpecialist = !isSpinner && nameSeed % 2 === 1;
      const ppBowl = isSpinner
        ? 44 + Math.round(tierBonus * 0.8)
        : Math.min(99, 76 + tierBonus + (!isDeathSpecialist ? 5 : 0) + (isLeftArmPace ? 3 : 0));
      const deathBowl = isSpinner
        ? 54 + Math.round(tierBonus * 0.8)
        : Math.min(99, 73 + tierBonus + (isDeathSpecialist ? 7 : 0));
      const spinControl = isSpinner ? Math.min(99, 79 + tierBonus + (nameSeed % 4)) : 0;
      const variations = Math.min(99, 74 + tierBonus + (isDeathSpecialist || isSpinner ? 6 : 2));

      return {
        power: 22 + Math.round(tierBonus * 0.5),
        stability: 20 + Math.round(tierBonus * 0.4),
        ppBowl,
        deathBowl,
        variations,
        spinControl,
        fielding: Math.min(92, 71 + Math.round(tierBonus * 0.6)),
        versatility: Math.min(94, 67 + tierBonus),
        leadership,
        isGenuineBowler: true,
        preferredSlot: 'tailender',
        tag: isSpinner
          ? 'Middle-Over Spin Controller (7-15 Overs · Tail #8–#11)'
          : isDeathSpecialist
          ? 'Death Specialist & Variations (16-20 Overs · Tail #8–#11)'
          : 'Powerplay Swing Striker (1-4 Overs · Tail #8–#11)',
      };
    }
  }
}

export function evaluateBattingSlotFit(
  player: Player,
  dna: PlayerTacticalDNA,
  slotIndex1Based: number,
  playingCount: number
): { fitScore: number; efficiencyMultiplier: number; note?: string } {
  const ratio = slotIndex1Based / Math.max(1, playingCount);

  if (dna.preferredSlot === 'tailender') {
    if (ratio <= 0.55) {
      return {
        fitScore: -0.45,
        efficiencyMultiplier: 0.45,
        note: `Batting Order Misalignment: Specialist bowler ${player.name} placed too high at #${slotIndex1Based}.`,
      };
    }
    return { fitScore: 0.05, efficiencyMultiplier: 1.0 };
  }

  if (dna.preferredSlot === 'opener') {
    if (ratio <= 0.32) {
      return {
        fitScore: 0.16,
        efficiencyMultiplier: 1.18,
        note: `Optimal Top-Order Slot: ${player.name} at #${slotIndex1Based} maximizes Powerplay & Orange Cap volume.`,
      };
    }
    if (ratio > 0.65) {
      return {
        fitScore: -0.25,
        efficiencyMultiplier: 0.68,
        note: `Underutilized Top-Order Batter: ${player.name} buried too low at #${slotIndex1Based}.`,
      };
    }
    return { fitScore: 0.06, efficiencyMultiplier: 0.96 };
  }

  if (dna.preferredSlot === 'top_middle') {
    if (ratio >= 0.22 && ratio <= 0.58) {
      return {
        fitScore: 0.16,
        efficiencyMultiplier: 1.12,
        note: `Ideal Middle-Overs Anchor: ${player.name} at #${slotIndex1Based} controls spin & pace transitions.`,
      };
    }
    if (ratio > 0.72) {
      return {
        fitScore: -0.2,
        efficiencyMultiplier: 0.72,
        note: `Late Entry Penalty: ${player.name} batting too late at #${slotIndex1Based}.`,
      };
    }
    return { fitScore: 0.05, efficiencyMultiplier: 0.95 };
  }

  if (ratio >= 0.42 && ratio <= 0.82) {
    return {
      fitScore: 0.16,
      efficiencyMultiplier: 1.15,
      note: `Prime Finishing Slot: ${player.name} at #${slotIndex1Based} maximizes death-over acceleration.`,
    };
  }
  if (ratio <= 0.2) {
    return {
      fitScore: -0.08,
      efficiencyMultiplier: 0.88,
      note: `Pinch-Hitter Promotion: Finisher ${player.name} opening at #${slotIndex1Based} increases early wicket risk.`,
    };
  }
  return { fitScore: 0.05, efficiencyMultiplier: 0.95 };
}

export function computeEnvironmentModifiers(conditions: PitchConditionTag[]) {
  const active = conditions.length > 0 ? conditions : (['balanced'] as PitchConditionTag[]);
  let runEnvShift = 0;
  let spinWeight = 1.0;
  let paceBounceWeight = 1.0;
  let powerWeight = 1.0;
  let stabilityFieldingWeight = 1.0;

  if (active.includes('spin')) {
    runEnvShift -= 11;
    spinWeight += 0.35;
  }
  if (active.includes('flat')) {
    runEnvShift += 16;
    powerWeight += 0.3;
  }
  if (active.includes('bounce')) {
    runEnvShift -= 6;
    paceBounceWeight += 0.35;
  }
  if (active.includes('large_ground')) {
    runEnvShift -= 10;
    spinWeight += 0.2;
    stabilityFieldingWeight += 0.28;
  }
  if (active.includes('small_ground')) {
    runEnvShift += 14;
    powerWeight += 0.28;
  }

  return {
    active,
    runEnvShift,
    spinWeight,
    paceBounceWeight,
    powerWeight,
    stabilityFieldingWeight,
  };
}

export function evaluateAiBotBid(
  botTeam: Team,
  player: Player,
  nextBidAmount: number,
  minSquad: number,
  maxSquad: number,
  conditions: PitchConditionTag[] = ['balanced']
): boolean {
  const roster = botTeam.players || [];
  if (roster.length >= maxSquad) return false;

  const maxAllowed = calculateMaxBid(botTeam, maxSquad, 0.2);
  if (nextBidAmount > maxAllowed || nextBidAmount > botTeam.purse) return false;

  const dna = derivePlayerDNA(player);
  const roleCount = roster.filter((p) => p.role === player.role).length;
  const wkCount = roster.filter((p) => p.role === 'WK').length;

  let valuation = (player.basePrice || 0.5) * 2.2;
  if (dna.power >= 88 || dna.deathBowl >= 85 || dna.spinControl >= 85) valuation += 2.5;
  if (player.role === 'WK' && wkCount === 0) valuation += 3.0;
  if (roleCount === 0) valuation += 2.0;
  if (roster.length < minSquad) valuation += 1.2;

  if (conditions.includes('spin') && dna.spinControl >= 75) valuation += 1.8;
  if (conditions.includes('bounce') && dna.ppBowl >= 80) valuation += 1.8;
  if ((conditions.includes('flat') || conditions.includes('small_ground')) && dna.power >= 88) valuation += 1.8;
  if (conditions.includes('large_ground') && dna.stability >= 84) valuation += 1.5;

  const slotsNeeded = Math.max(1, minSquad - roster.length);
  const budgetPerSlot = botTeam.purse / slotsNeeded;
  const ceiling = Math.min(maxAllowed, Math.max(player.basePrice || 0.5, Math.min(valuation, budgetPerSlot * 1.45)));

  return nextBidAmount <= ceiling;
}

export async function generateMasterScoutReport(
  teams: Team[],
  lineups: Record<string, TeamLineupConfig>,
  minSquad: number = 11,
  conditions: PitchConditionTag[] = ['balanced']
): Promise<MasterScoutReport> {
  const { playingCount, minBowlers, sixthBowlerTarget } = getDynamicRoleRequirements(minSquad);
  const env = computeEnvironmentModifiers(conditions);

  const rawRankings: TeamScoutRanking[] = teams.map((team) => {
    const players = Array.isArray(team.players) ? team.players : [];
    const savedLineup = lineups[team.id];

    const orderedPlayingXI: Player[] = [];
    if (savedLineup?.playingIds?.length > 0) {
      savedLineup.playingIds.slice(0, playingCount).forEach((pid) => {
        const found = players.find((p) => p.id === pid);
        if (found) orderedPlayingXI.push(found);
      });
    }
    if (orderedPlayingXI.length === 0) {
      orderedPlayingXI.push(...players.slice(0, playingCount));
    }

    const playingIdSet = new Set(orderedPlayingXI.map((p) => p.id));
    const impactPlayer = savedLineup?.impactPlayerId
      ? players.find((p) => p.id === savedLineup.impactPlayerId && !playingIdSet.has(p.id))
      : undefined;

    const bench = players.filter((p) => !playingIdSet.has(p.id) && p.id !== impactPlayer?.id);
    const effectiveSquad = impactPlayer ? [...orderedPlayingXI, impactPlayer] : orderedPlayingXI;

    const dnas = effectiveSquad.map((p, idx) => {
      const dna = derivePlayerDNA(p);
      const slotNum = idx + 1;
      const slotEval =
        idx < orderedPlayingXI.length
          ? evaluateBattingSlotFit(p, dna, slotNum, playingCount)
          : { fitScore: 0.15, efficiencyMultiplier: 1.05 };

      return {
        player: p,
        dna,
        slotNum,
        slotEval,
        isCaptain: savedLineup?.captainId === p.id,
        isViceCaptain: savedLineup?.viceCaptainId === p.id,
        isImpact: impactPlayer?.id === p.id,
        isLongTerm: savedLineup?.contractTypes?.[p.id] === '3yr',
      };
    });

    const batters = dnas.filter((d) => ['BAT', 'WK', 'AR'].includes(d.player.role));
    const avgPower =
      batters.length > 0 ? batters.reduce((sum, d) => sum + d.dna.power, 0) / batters.length : 55;
    const avgStability =
      batters.length > 0 ? batters.reduce((sum, d) => sum + d.dna.stability, 0) / batters.length : 55;

    const topN = Math.min(3, Math.max(2, Math.floor(playingCount / 3)));
    const sortedDeath = [...dnas].sort((a, b) => b.dna.deathBowl - a.dna.deathBowl);
    const deathOverRating = sortedDeath.slice(0, topN).reduce((sum, d) => sum + d.dna.deathBowl, 0) / topN;

    const sortedPP = [...dnas].sort((a, b) => b.dna.ppBowl - a.dna.ppBowl);
    const ppOverRating = sortedPP.slice(0, topN).reduce((sum, d) => sum + d.dna.ppBowl, 0) / topN;

    const sortedSpin = [...dnas].sort((a, b) => b.dna.spinControl - a.dna.spinControl);
    const spinRating = sortedSpin.slice(0, 2).reduce((sum, d) => sum + d.dna.spinControl, 0) / 2;

    const avgVariations =
      dnas.length > 0 ? dnas.reduce((sum, d) => sum + d.dna.variations, 0) / dnas.length : 50;
    const avgFielding =
      dnas.length > 0 ? dnas.reduce((sum, d) => sum + d.dna.fielding, 0) / dnas.length : 70;
    const avgVersatility =
      dnas.length > 0 ? dnas.reduce((sum, d) => sum + d.dna.versatility, 0) / dnas.length : 70;

    const rawOrderDelta = dnas.reduce((sum, d) => sum + d.slotEval.fitScore, 0);
    const clampedOrderDelta = Math.max(-1.4, Math.min(0.85, rawOrderDelta));
    const battingOrderScore = Math.min(99, Math.max(40, Math.round(74 + clampedOrderDelta * 24)));

    let multiConditionBonus = 0;
    if (env.active.includes('spin')) multiConditionBonus += ((spinRating - 65) / 100) * 0.45;
    if (env.active.includes('bounce')) multiConditionBonus += ((ppOverRating - 65) / 100) * 0.45;
    if (env.active.includes('flat')) multiConditionBonus += ((avgPower - 70) / 100) * 0.45;
    if (env.active.includes('small_ground')) multiConditionBonus += ((avgPower - 72) / 100) * 0.35;
    if (env.active.includes('large_ground')) {
      multiConditionBonus += (((avgStability + avgFielding + spinRating) / 3 - 68) / 100) * 0.45;
    }

    const captainEntry = dnas.find((d) => d.isCaptain);
    const vcEntry = dnas.find((d) => d.isViceCaptain);
    const leadershipBonus =
      (captainEntry ? (captainEntry.dna.leadership / 100) * 0.25 : 0) +
      (vcEntry ? (vcEntry.dna.leadership / 100) * 0.14 : 0);

    const impactBonus = impactPlayer ? 0.28 : 0;
    const longTermCount = dnas.filter((d) => d.isLongTerm).length;
    const dynastyBonus = Math.min(0.24, longTermCount * 0.04);
    const purseEfficiencyBonus = Math.min(0.22, (team.purse || 0) * 0.015);

    const genuineBowlers = dnas.filter(
      (d) =>
        d.player.role === 'BOWL' ||
        (d.player.role === 'AR' && (d.dna.ppBowl >= 50 || d.dna.deathBowl >= 50 || d.dna.spinControl >= 55))
    );
    const hasExtraBowler = genuineBowlers.length >= sixthBowlerTarget;
    const hasWK = orderedPlayingXI.some((p) => p.role === 'WK');

    const battingStrengthFactor =
      (avgPower * env.powerWeight * 0.55 + avgStability * env.stabilityFieldingWeight * 0.45) / 100;
    const orderRunsShift = clampedOrderDelta * 11;
    const avgBattingScore = Math.max(
      125,
      Math.min(238, Math.round(138 + battingStrengthFactor * 48 + env.runEnvShift + orderRunsShift))
    );
    const avgBattingWickets = Math.max(
      3,
      Math.min(playingCount - 1, Math.round(playingCount - 2 - (avgStability / 100) * 3.2))
    );

    const bowlingControlFactor =
      (deathOverRating * 0.36 +
        ppOverRating * env.paceBounceWeight * 0.26 +
        spinRating * env.spinWeight * 0.24 +
        avgVariations * 0.14) /
      100;
    const bowlerShortagePenalty = genuineBowlers.length < minBowlers ? (minBowlers - genuineBowlers.length) * 14 : 0;
    const avgBowlingConceded = Math.max(
      122,
      Math.min(235, Math.round(206 - bowlingControlFactor * 46 + env.runEnvShift + bowlerShortagePenalty))
    );
    const avgBowlingWickets = Math.max(
      3,
      Math.min(playingCount - 1, Math.round(4 + bowlingControlFactor * 4.5))
    );
    const netRunDifferential = avgBattingScore - avgBowlingConceded;

    let rawScore =
      (avgPower * 0.23 +
        avgStability * 0.18 +
        deathOverRating * 0.2 +
        ppOverRating * 0.12 +
        spinRating * 0.12 +
        avgVariations * 0.06 +
        avgFielding * 0.04 +
        avgVersatility * 0.05) /
        10 +
      clampedOrderDelta +
      multiConditionBonus +
      leadershipBonus +
      impactBonus +
      dynastyBonus +
      purseEfficiencyBonus;

    if (!hasWK) rawScore -= 1.2;
    if (genuineBowlers.length < minBowlers) rawScore -= 1.35;
    if (hasExtraBowler) rawScore += 0.35;

    let benchPenaltyNote: string | undefined;
    if (bench.length === 0) {
      rawScore -= 1.5;
      benchPenaltyNote = 'Zero bench reserves (-1.50 pts): No injury backup beyond Starting Lineup.';
    } else {
      rawScore += Math.min(0.4, bench.length * 0.14);
    }

    const dnaFingerprint = dnas.reduce(
      (acc, d, idx) => acc + (d.dna.power * 0.0013 + d.dna.deathBowl * 0.0017 + idx * 0.0007),
      0
    );
    const finalScore = Math.min(9.95, Math.max(3.5, Number((rawScore + (dnaFingerprint % 0.19)).toFixed(2))));

    const pros: string[] = [];
    const cons: string[] = [];
    const archetypeBreakdown = dnas.map((d) => {
      const prefix = d.isImpact ? '[IMPACT SUB]' : `#${d.slotNum}`;
      const badges = [
        d.isCaptain ? '(C)' : '',
        d.isViceCaptain ? '(VC)' : '',
        d.isLongTerm ? '[3-YR]' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `${prefix} ${d.player.name} ${badges} — ${d.dna.tag}`.trim();
    });

    dnas.forEach((d) => {
      if (d.slotEval.fitScore >= 0.15 && d.slotEval.note && pros.length < 4) {
        pros.push(d.slotEval.note);
      } else if (d.slotEval.fitScore < 0 && d.slotEval.note && cons.length < 4) {
        cons.push(d.slotEval.note);
      }
    });

    if (impactPlayer) {
      pros.push(`Tactical Impact Sub Armed: ${impactPlayer.name} (${impactPlayer.role}) provides live phase flexibility.`);
    }

    if (hasExtraBowler) {
      pros.push(`Extra Bowling Option: ${genuineBowlers.length} credible bowlers for a ${playingCount}-player XI.`);
    } else {
      cons.push(`Tight Bowling Attack: Only ${genuineBowlers.length} genuine bowling options (target ${sixthBowlerTarget}+).`);
    }

    return {
      teamId: team.id,
      teamName: team.name,
      scoreOutOf10: finalScore,
      verdict:
        finalScore >= 8.5
          ? `Championship Favorite (${playingCount}-Player Format)`
          : finalScore >= 7.5
          ? 'Playoff Contender — Strong Phase & Role Core'
          : 'Dark Horse — Relies on Individual Match-Winners',
      benchPenaltyNote,
      benchStrength:
        bench.length >= 3
          ? `Deep (${bench.length} Reserves)`
          : bench.length >= 1
          ? `Active (${bench.length} Reserve${bench.length > 1 ? 's' : ''})`
          : 'Empty (0 Reserves)',
      projectedStats: {
        avgBattingScore,
        avgBattingWickets,
        avgBowlingConceded,
        avgBowlingWickets,
        netRunDifferential,
      },
      playingBalance: {
        battingDepth: `Power ${Math.round(avgPower)}/100 · Stability ${Math.round(avgStability)}/100`,
        deathBowling: `${Math.round(deathOverRating)}/100 (${sortedDeath[0]?.player.name || 'N/A'})`,
        spinQuality: `${Math.round(spinRating)}/100 (${sortedSpin[0]?.player.name || 'N/A'})`,
        powerplayImpact: `${Math.round(ppOverRating)}/100 (${sortedPP[0]?.player.name || 'N/A'})`,
        battingOrderSynergy: `${battingOrderScore}/100 (${
          battingOrderScore >= 82 ? 'Optimal Sequence' : battingOrderScore >= 68 ? 'Balanced Sequence' : 'Suboptimal Order'
        })`,
      },
      metrics: {
        sixthBowlingOption: hasExtraBowler,
        powerHittingIndex: Math.round(avgPower),
        anchorStabilityIndex: Math.round(avgStability),
        deathOverRating: Math.round(deathOverRating),
        variationsRating: Math.round(avgVariations),
        battingOrderScore,
      },
      archetypeBreakdown,
      pros,
      cons,
    };
  });

  rawRankings.sort((a, b) => b.scoreOutOf10 - a.scoreOutOf10);
  for (let i = 1; i < rawRankings.length; i++) {
    if (rawRankings[i].scoreOutOf10 >= rawRankings[i - 1].scoreOutOf10) {
      rawRankings[i].scoreOutOf10 = Number((rawRankings[i - 1].scoreOutOf10 - 0.14).toFixed(2));
    }
  }

  const leader = rawRankings[0];
  const runnerUp = rawRankings[1];
  const conditionLabels = env.active.map((c) => c.replace('_', ' ').toUpperCase()).join(' + ');

  return {
    executiveSummary:
      leader && runnerUp
        ? `[${playingCount}-Player Format · ${conditionLabels}] ${leader.teamName} (${leader.scoreOutOf10.toFixed(
            2
          )}/10 · Proj. ${leader.projectedStats.avgBattingScore} Scored / ${leader.projectedStats.avgBowlingConceded} Conceded) leads ${runnerUp.teamName} (${runnerUp.scoreOutOf10.toFixed(
            2
          )}/10) with superior batting sequence and venue synergy.`
        : 'Dynamic Squad & Venue Analysis complete.',
    activeConditions: env.active,
    rankings: rawRankings,
    generatedAt: Date.now(),
  };
}

export function simulateMiniTournament(
  teams: Team[],
  lineups: Record<string, TeamLineupConfig>,
  minSquad: number = 11,
  conditions: PitchConditionTag[] = ['balanced']
): TournamentSimulationResult {
  const { playingCount } = getDynamicRoleRequirements(minSquad);
  const env = computeEnvironmentModifiers(conditions);

  const standings: Record<
    string,
    { teamId: string; teamName: string; played: number; won: number; lost: number; runsFor: number; runsAgainst: number; points: number }
  > = {};

  const playerTracker: Record<
    string,
    {
      playerName: string;
      teamName: string;
      role: string;
      runs: number;
      balls: number;
      wickets: number;
      runsConceded: number;
      overs: number;
      mvpPoints: number;
      reason: string;
    }
  > = {};

  teams.forEach((t) => {
    standings[t.id] = {
      teamId: t.id,
      teamName: t.name,
      played: 0,
      won: 0,
      lost: 0,
      runsFor: 0,
      runsAgainst: 0,
      points: 0,
    };
  });

  const getEffectiveSquad = (t: Team) => {
    const cfg = lineups[t.id];
    const orderedBase: Player[] = [];
    if (cfg?.playingIds?.length > 0) {
      cfg.playingIds.slice(0, playingCount).forEach((pid) => {
        const found = t.players.find((p) => p.id === pid);
        if (found) orderedBase.push(found);
      });
    }
    if (orderedBase.length === 0) {
      orderedBase.push(...t.players.slice(0, playingCount));
    }

    const impact = cfg?.impactPlayerId ? t.players.find((p) => p.id === cfg.impactPlayerId) : undefined;
    const combined = impact && !orderedBase.some((p) => p.id === impact.id) ? [...orderedBase, impact] : orderedBase;
    return {
      squad: combined.length > 0 ? combined : t.players,
      captainId: cfg?.captainId,
      vcId: cfg?.viceCaptainId,
    };
  };

  // 100% Deterministic Tactical Match Engine (Zero Math.random() — identical on every screen)
  const simulateMatch = (teamA: Team, teamB: Team, matchIndex: number) => {
    const sideA = getEffectiveSquad(teamA);
    const sideB = getEffectiveSquad(teamB);

    const playInnings = (
      battingSide: { squad: Player[]; captainId?: string; vcId?: string },
      battingTeamName: string,
      bowlingSide: { squad: Player[] },
      bowlingTeamName: string,
      inningsSeed: number
    ) => {
      let totalRuns = 0;
      let totalWickets = 0;

      const realBowlers = bowlingSide.squad.filter((p) => p.role === 'BOWL' || p.role === 'AR');
      const bowlingAttack = realBowlers.slice(0, 5);

      const oppBowlStrength =
        bowlingAttack.length > 0
          ? bowlingAttack.reduce((s, b) => {
              const d = derivePlayerDNA(b);
              return s + (d.deathBowl * 0.4 + d.ppBowl * 0.3 + d.spinControl * 0.3);
            }, 0) / bowlingAttack.length
          : 60;

      const oppPressureFactor = Math.max(0.84, Math.min(1.14, 1.42 - oppBowlStrength / 190));
      const batterLimit = Math.min(battingSide.squad.length, Math.max(5, playingCount));
      const envRunMult = 1 + env.runEnvShift / 185;

      battingSide.squad.slice(0, batterLimit).forEach((batter, idx) => {
        if (totalWickets >= playingCount - 1) return;
        const dna = derivePlayerDNA(batter);
        const slotNum = idx + 1;
        const slotFit = evaluateBattingSlotFit(batter, dna, slotNum, playingCount);

        const stabilityFactor = dna.stability / 100;
        const powerFactor = dna.power / 100;
        const capMult = batter.id === battingSide.captainId ? 1.12 : batter.id === battingSide.vcId ? 1.06 : 1.0;

        const positionVolume =
          slotNum <= 2 ? 1.24 : slotNum <= 4 ? 1.04 : slotNum <= 6 ? 0.78 : 0.4;

        const deterministicWave =
          0.88 + (((batter.name.charCodeAt(0) + matchIndex * 7 + inningsSeed * 3) % 11) / 40);

        const rawRuns =
          (stabilityFactor * 23 + powerFactor * 16) *
          positionVolume *
          slotFit.efficiencyMultiplier *
          deterministicWave *
          capMult *
          envRunMult *
          oppPressureFactor;

        const runs = Math.max(2, Math.round(rawRuns));

        const slotSrBoost = slotNum >= Math.ceil(playingCount * 0.45) && dna.preferredSlot === 'finisher' ? 1.08 : 1.0;
        const effectiveSr =
          (108 + powerFactor * 72) *
          slotSrBoost *
          slotFit.efficiencyMultiplier *
          envRunMult;
        const balls = Math.max(3, Math.round((runs / Math.max(90, effectiveSr)) * 100));

        totalRuns += runs;
        if (stabilityFactor < 0.84 || slotNum > 3) {
          totalWickets++;
        }

        if (!playerTracker[batter.id]) {
          playerTracker[batter.id] = {
            playerName: batter.name,
            teamName: battingTeamName,
            role: batter.role,
            runs: 0,
            balls: 0,
            wickets: 0,
            runsConceded: 0,
            overs: 0,
            mvpPoints: 0,
            reason: `Batting #${slotNum} · Stability ${dna.stability}/100 · Power ${dna.power}/100`,
          };
        }
        playerTracker[batter.id].runs += runs;
        playerTracker[batter.id].balls += balls;
        playerTracker[batter.id].mvpPoints += runs + (effectiveSr >= 155 ? 6 : 0);
      });

      const cappedWickets = Math.min(playingCount - 1, Math.max(4, totalWickets));
      const totalThreat = bowlingAttack.reduce((sum, b) => {
        const d = derivePlayerDNA(b);
        return sum + (d.deathBowl * 0.38 + d.ppBowl * 0.32 * env.paceBounceWeight + d.variations * 0.2 + d.spinControl * 0.1 * env.spinWeight);
      }, 0);

      bowlingAttack.forEach((bowler) => {
        const dna = derivePlayerDNA(bowler);
        if (!dna.isGenuineBowler) return;

        const threat =
          dna.deathBowl * 0.38 +
          dna.ppBowl * 0.32 * env.paceBounceWeight +
          dna.variations * 0.2 +
          dna.spinControl * 0.1 * env.spinWeight;

        const wktShare = totalThreat > 0 ? (threat / totalThreat) * cappedWickets : 1;
        const wkts = Math.max(0, Number(wktShare.toFixed(2)));

        const isHighRiskPhaseBowler = dna.deathBowl >= 80 || dna.ppBowl >= 82;
        const baseEcon = isHighRiskPhaseBowler
          ? 8.75 - (dna.variations / 100) * 0.75 + env.runEnvShift / 22
          : 7.75 - (dna.spinControl / 100) * 0.85 + env.runEnvShift / 22;

        const oversBowled = 4;
        const runsConceded = Math.max(16, Math.round(baseEcon * oversBowled));

        if (!playerTracker[bowler.id]) {
          playerTracker[bowler.id] = {
            playerName: bowler.name,
            teamName: bowlingTeamName,
            role: bowler.role,
            runs: 0,
            balls: 0,
            wickets: 0,
            runsConceded: 0,
            overs: 0,
            mvpPoints: 0,
            reason:
              dna.deathBowl >= dna.ppBowl && dna.deathBowl >= dna.spinControl
                ? `Death Specialist (16-20 Overs · Variations ${dna.variations}/100)`
                : dna.ppBowl >= dna.spinControl
                ? `Powerplay Swing Striker (1-4 Overs · PP ${dna.ppBowl}/100)`
                : `Middle-Over Spin Controller (7-15 Overs · Spin ${dna.spinControl}/100)`,
          };
        }
        playerTracker[bowler.id].wickets = Number((playerTracker[bowler.id].wickets + wkts).toFixed(2));
        playerTracker[bowler.id].runsConceded += runsConceded;
        playerTracker[bowler.id].overs += oversBowled;

        const econBonus = runsConceded / oversBowled <= 7.5 ? 6 : 0;
        const dualSkillBonus = bowler.role === 'AR' && wkts > 0 ? 14 : 0;
        playerTracker[bowler.id].mvpPoints += wkts * 25 + econBonus + dualSkillBonus;
      });

      return Math.max(120, totalRuns);
    };

    const scoreA = playInnings(sideA, teamA.name, sideB, teamB.name, 1);
    let scoreB = playInnings(sideB, teamB.name, sideA, teamA.name, 2);
    if (scoreA === scoreB) scoreB -= 1;

    return {
      scoreA,
      scoreB,
      winner: scoreA > scoreB ? teamA : teamB,
      loser: scoreA > scoreB ? teamB : teamA,
    };
  };

  let matchCounter = 1;
  const rounds = teams.length <= 4 ? 3 : 2;
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const m = simulateMatch(teams[i], teams[j], matchCounter++);
        standings[teams[i].id].played++;
        standings[teams[j].id].played++;
        standings[teams[i].id].runsFor += m.scoreA;
        standings[teams[i].id].runsAgainst += m.scoreB;
        standings[teams[j].id].runsFor += m.scoreB;
        standings[teams[j].id].runsAgainst += m.scoreA;
        standings[m.winner.id].won++;
        standings[m.winner.id].points += 2;
        standings[m.loser.id].lost++;
      }
    }
  }

  const pointsTable = Object.values(standings)
    .map((s) => {
      const nrrVal = (s.runsFor - s.runsAgainst) / Math.max(1, s.played * 20);
      return {
        ...s,
        nrr: (nrrVal >= 0 ? '+' : '') + nrrVal.toFixed(3),
        rawNrr: nrrVal,
      };
    })
    .sort((a, b) => b.points - a.points || b.rawNrr - a.rawNrr);

  const finalist1 = teams.find((t) => t.id === pointsTable[0]?.teamId) || teams[0];
  const finalist2 = teams.find((t) => t.id === pointsTable[1]?.teamId) || teams[1] || teams[0];
  const grandFinal = simulateMatch(finalist1, finalist2, 99);

  const allPlayersStats = Object.values(playerTracker);

  const orangeLeader = [...allPlayersStats].sort((a, b) => b.runs - a.runs)[0] || {
    playerName: 'N/A',
    teamName: finalist1.name,
    runs: 0,
    balls: 1,
    reason: 'Top Run Scorer',
  };

  const purpleLeader = [...allPlayersStats]
    .filter((p) => p.role === 'BOWL' || p.role === 'AR')
    .sort((a, b) => b.wickets - a.wickets || a.runsConceded - b.runsConceded)[0] || {
    playerName: 'No Bowler Drafted',
    teamName: finalist1.name,
    wickets: 0,
    runsConceded: 0,
    overs: 1,
    reason: 'Lead Wicket-Taker',
  };

  const superStrikerLeader =
    [...allPlayersStats]
      .filter((p) => p.runs >= 25)
      .sort((a, b) => b.runs / Math.max(1, b.balls) - a.runs / Math.max(1, a.balls))[0] || orangeLeader;

  const mvpLeader = [...allPlayersStats].sort((a, b) => b.mvpPoints - a.mvpPoints)[0] || orangeLeader;

  return {
    championTeamId: grandFinal.winner.id,
    championTeamName: grandFinal.winner.name,
    runnerUpTeamName: grandFinal.loser.name,
    finalMatchSummary: `${finalist1.name} (${grandFinal.scoreA}) vs ${finalist2.name} (${grandFinal.scoreB}) — ${grandFinal.winner.name} clinched the Trophy!`,
    orangeCap: {
      playerName: orangeLeader.playerName,
      teamName: orangeLeader.teamName,
      runs: orangeLeader.runs,
      strikeRate: Number(((orangeLeader.runs / Math.max(1, orangeLeader.balls)) * 100).toFixed(1)),
      reason: orangeLeader.reason,
    },
    purpleCap: {
      playerName: purpleLeader.playerName,
      teamName: purpleLeader.teamName,
      wickets: Math.max(1, Math.round(purpleLeader.wickets)),
      economy: Number((purpleLeader.runsConceded / Math.max(1, purpleLeader.overs)).toFixed(2)),
      reason: purpleLeader.reason,
    },
    superStriker: {
      playerName: superStrikerLeader.playerName,
      teamName: superStrikerLeader.teamName,
      strikeRate: Number(((superStrikerLeader.runs / Math.max(1, superStrikerLeader.balls)) * 100).toFixed(1)),
      runs: superStrikerLeader.runs,
    },
    manOfTournament: {
      playerName: mvpLeader.playerName,
      teamName: mvpLeader.teamName,
      mvpPoints: Math.round(mvpLeader.mvpPoints),
      summary:
        mvpLeader.role === 'AR'
          ? `All-Round MVP (${mvpLeader.runs} Runs & ${Math.round(mvpLeader.wickets)} Wkts)`
          : `${mvpLeader.runs} Runs · ${Math.round(mvpLeader.wickets)} Wkts`,
    },
    pointsTable: pointsTable.map(({ rawNrr, ...rest }) => rest),
  };
}

export async function fetchAiScoutReport(
  teams: Team[],
  minSquad: number = 11
): Promise<MasterScoutReport> {
  return generateMasterScoutReport(teams, {}, minSquad, ['balanced']);
}