import {
  Team,
  Player,
  PitchProfile,
  getDynamicRoleRequirements,
  calculateMaxBid,
} from '../game/auctionRules';

export interface TeamScoutRanking {
  teamId: string;
  teamName: string;
  scoreOutOf10: number;
  verdict: string;
  benchPenaltyNote?: string;
  benchStrength: string;
  playingBalance: {
    battingDepth: string;
    deathBowling: string;
    spinQuality: string;
    powerplayImpact: string;
    fieldingAndVersatility: string;
  };
  metrics: {
    sixthBowlingOption: boolean;
    powerHittingIndex: number;
    anchorStabilityIndex: number;
    deathOverRating: number;
    variationsRating: number;
    fieldingRating: number;
  };
  archetypeBreakdown: string[];
  pros: string[];
  cons: string[];
}

export interface MasterScoutReport {
  executiveSummary: string;
  rankings: TeamScoutRanking[];
  generatedAt: number;
}

export interface TournamentSimulationResult {
  championTeamId: string;
  championTeamName: string;
  runnerUpTeamName: string;
  finalMatchSummary: string;
  orangeCap: { playerName: string; teamName: string; runs: number; strikeRate: number };
  purpleCap: { playerName: string; teamName: string; wickets: number; economy: number };
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
  const isLeftArm = (player.battingStyle || '').toLowerCase().includes('left');
  const nameSeed = player.name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 5;
  const leadership = isMarquee ? 90 + nameSeed : isPremium ? 82 + nameSeed : 70 + nameSeed;

  switch (player.role) {
    case 'WK': {
      const power = Math.min(98, 74 + tierBonus + nameSeed);
      const stability = Math.min(95, 72 + Math.round(tierBonus * 0.9) + (isLeftArm ? 3 : 0));
      return {
        power,
        stability,
        ppBowl: 0,
        deathBowl: 0,
        variations: 0,
        spinControl: 0,
        fielding: Math.min(96, 80 + Math.round(tierBonus * 0.6)),
        versatility: Math.min(94, 72 + tierBonus),
        leadership,
        tag: isMarquee
          ? 'Elite Power-Hitting Keeper-Batter'
          : isMidTier
          ? 'Frontline Top/Middle WK-Batter'
          : 'Domestic / Emerging WK-Batter',
      };
    }

    case 'BAT': {
      const power = Math.min(98, 75 + tierBonus + (isLeftArm ? 3 : 0) + nameSeed);
      const stability = Math.min(98, 76 + tierBonus + (4 - nameSeed));
      const canBowlPartTime = bowlStyle.length > 0;
      return {
        power,
        stability,
        ppBowl: canBowlPartTime ? 15 : 0,
        deathBowl: 0,
        variations: canBowlPartTime ? 20 : 0,
        spinControl: bowlStyle.includes('offbreak') || bowlStyle.includes('orthodox') ? 25 : 0,
        fielding: Math.min(97, 78 + Math.round(tierBonus * 0.7) + nameSeed),
        versatility: Math.min(95, 70 + tierBonus + (isLeftArm ? 4 : 0)),
        leadership,
        tag:
          power > stability + 3
            ? 'Explosive Boundary Accelerator'
            : stability > power + 3
            ? 'High-Floor Innings Anchor'
            : 'All-Phase Radical Batter',
      };
    }

    case 'AR': {
      const isSpinnerAR =
        bowlStyle.includes('spin') ||
        bowlStyle.includes('orthodox') ||
        bowlStyle.includes('offbreak') ||
        bowlStyle.includes('legbreak');
      const isFastAR = bowlStyle.includes('fast') || bowlStyle.includes('medium');

      const power = Math.min(98, 76 + tierBonus + nameSeed);
      const stability = Math.min(92, 70 + Math.round(tierBonus * 0.8));
      const ppBowl = isFastAR ? 55 + tierBonus : isSpinnerAR ? 45 + Math.round(tierBonus * 0.7) : 45 + tierBonus;
      const deathBowl = isFastAR ? 58 + tierBonus : isSpinnerAR ? 35 + Math.round(tierBonus * 0.6) : 40 + tierBonus;
      const spinControl = isSpinnerAR ? 68 + tierBonus : 15;
      const variations = Math.min(95, 58 + tierBonus + (isSpinnerAR ? 10 : 5));

      return {
        power,
        stability,
        ppBowl: Math.min(94, ppBowl),
        deathBowl: Math.min(94, deathBowl),
        variations,
        spinControl: Math.min(96, spinControl),
        fielding: Math.min(97, 80 + Math.round(tierBonus * 0.7)),
        versatility: Math.min(99, 84 + Math.round(tierBonus * 0.8)),
        leadership,
        tag: isSpinnerAR
          ? 'Spin-Bowling All-Rounder & Middle Enforcer'
          : isFastAR
          ? 'Seam-Bowling All-Rounder & Finisher'
          : 'Multi-Phase Utility All-Rounder',
      };
    }

    case 'BOWL': {
      const isSpinner =
        bowlStyle.includes('spin') ||
        bowlStyle.includes('orthodox') ||
        bowlStyle.includes('offbreak') ||
        bowlStyle.includes('legbreak');
      const isLeftArmPace = bowlStyle.includes('left-arm fast') || bowlStyle.includes('left-arm medium');

      const ppBowl = isSpinner ? 42 + Math.round(tierBonus * 0.8) : 76 + tierBonus + (isLeftArmPace ? 4 : 0);
      const deathBowl = isSpinner ? 52 + Math.round(tierBonus * 0.8) : 72 + tierBonus + nameSeed;
      const spinControl = isSpinner ? 78 + tierBonus + nameSeed : 0;
      const variations = Math.min(98, 72 + tierBonus + (isSpinner ? 8 : 5));

      return {
        power: 22 + Math.round(tierBonus * 0.5),
        stability: 20 + Math.round(tierBonus * 0.4),
        ppBowl: Math.min(98, ppBowl),
        deathBowl: Math.min(98, deathBowl),
        variations,
        spinControl: Math.min(98, spinControl),
        fielding: Math.min(92, 70 + Math.round(tierBonus * 0.6)),
        versatility: Math.min(94, 65 + tierBonus),
        leadership,
        tag: isSpinner
          ? 'Frontline Wrist/Finger Spin Specialist'
          : isLeftArmPace
          ? 'Left-Arm Angle & Swing Strike Bowler'
          : 'All-Phase Pace & Death Specialist',
      };
    }
  }
}

/**
 * Smart AI Bot Franchise Evaluator: Decides whether an AI-controlled team should bid on the current player
 * based on role deficits, pitch synergy, max bid ceiling, and player value.
 */
export function evaluateAiBotBid(
  botTeam: Team,
  player: Player,
  nextBidAmount: number,
  minSquad: number,
  maxSquad: number,
  pitch: PitchProfile = 'balanced'
): boolean {
  const roster = botTeam.players || [];
  if (roster.length >= maxSquad) return false;

  const maxAllowed = calculateMaxBid(botTeam, maxSquad, 0.2);
  if (nextBidAmount > maxAllowed || nextBidAmount > botTeam.purse) return false;

  const dna = derivePlayerDNA(player);
  const roleCount = roster.filter((p) => p.role === player.role).length;
  const wkCount = roster.filter((p) => p.role === 'WK').length;

  // Calculate AI Valuation Ceiling for this player
  let valuation = (player.basePrice || 0.5) * 2.2;
  if (dna.power >= 88 || dna.deathBowl >= 85 || dna.spinControl >= 85) valuation += 2.5;
  if (player.role === 'WK' && wkCount === 0) valuation += 3.0; // Urgent WK need
  if (roleCount === 0) valuation += 2.0; // Needs at least 1 of each role
  if (roster.length < minSquad) valuation += 1.2;

  // Pitch Synergy Boost
  if (pitch === 'spin' && dna.spinControl >= 75) valuation += 1.8;
  if (pitch === 'seam' && dna.ppBowl >= 80) valuation += 1.8;
  if (pitch === 'flat' && dna.power >= 88) valuation += 1.8;

  // Cap valuation relative to remaining purse per needed slot
  const slotsNeeded = Math.max(1, minSquad - roster.length);
  const budgetPerSlot = botTeam.purse / slotsNeeded;
  const ceiling = Math.min(maxAllowed, Math.max(player.basePrice || 0.5, Math.min(valuation, budgetPerSlot * 1.45)));

  return nextBidAmount <= ceiling;
}

export async function generateMasterScoutReport(
  teams: Team[],
  lineups: Record<string, TeamLineupConfig>,
  minSquad: number = 11,
  pitch: PitchProfile = 'balanced'
): Promise<MasterScoutReport> {
  const { playingCount, minBowlers, sixthBowlerTarget } = getDynamicRoleRequirements(minSquad);

  const rawRankings: TeamScoutRanking[] = teams.map((team) => {
    const players = Array.isArray(team.players) ? team.players : [];
    const savedLineup = lineups[team.id];

    const playingIds =
      savedLineup?.playingIds?.length > 0
        ? savedLineup.playingIds.slice(0, playingCount)
        : players.slice(0, playingCount).map((p) => p.id);

    const playingXI = players.filter((p) => playingIds.includes(p.id));
    const impactPlayer = savedLineup?.impactPlayerId
      ? players.find((p) => p.id === savedLineup.impactPlayerId && !playingIds.includes(p.id))
      : undefined;

    const bench = players.filter((p) => !playingIds.includes(p.id) && p.id !== impactPlayer?.id);

    // Combine Starting N + Impact Player Tactical Contribution
    const effectiveSquad = impactPlayer ? [...playingXI, impactPlayer] : playingXI;
    const dnas = effectiveSquad.map((p) => ({
      player: p,
      dna: derivePlayerDNA(p),
      isCaptain: savedLineup?.captainId === p.id,
      isViceCaptain: savedLineup?.viceCaptainId === p.id,
      isImpact: impactPlayer?.id === p.id,
      isLongTerm: savedLineup?.contractTypes?.[p.id] === '3yr',
    }));

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

    // Pitch Condition Archetype Synergy
    let pitchSynergyBonus = 0;
    if (pitch === 'spin') pitchSynergyBonus = ((spinRating - 65) / 100) * 0.65;
    else if (pitch === 'seam') pitchSynergyBonus = ((ppOverRating - 65) / 100) * 0.65;
    else if (pitch === 'flat') pitchSynergyBonus = ((avgPower - 70) / 100) * 0.65;

    // Captaincy & Vice-Captaincy Composure Multiplier (1.5x C / 1.25x VC)
    const captainEntry = dnas.find((d) => d.isCaptain);
    const vcEntry = dnas.find((d) => d.isViceCaptain);
    const leadershipBonus =
      (captainEntry ? (captainEntry.dna.leadership / 100) * 0.25 : 0) +
      (vcEntry ? (vcEntry.dna.leadership / 100) * 0.14 : 0);

    // Impact Sub & Multi-Year Dynasty Bonus
    const impactBonus = impactPlayer ? 0.28 : 0;
    const longTermCount = dnas.filter((d) => d.isLongTerm).length;
    const dynastyBonus = Math.min(0.24, longTermCount * 0.04);

    // Purse Efficiency Bonus (rewarding smart unspent cap management)
    const purseEfficiencyBonus = Math.min(0.22, (team.purse || 0) * 0.015);

    const genuineBowlers = dnas.filter(
      (d) =>
        d.player.role === 'BOWL' ||
        (d.player.role === 'AR' && (d.dna.ppBowl >= 50 || d.dna.deathBowl >= 50 || d.dna.spinControl >= 55))
    );
    const hasExtraBowler = genuineBowlers.length >= sixthBowlerTarget;
    const hasWK = playingXI.some((p) => p.role === 'WK');

    let rawScore =
      (avgPower * 0.24 +
        avgStability * 0.18 +
        deathOverRating * 0.2 +
        ppOverRating * 0.12 +
        spinRating * 0.12 +
        avgVariations * 0.06 +
        avgFielding * 0.04 +
        avgVersatility * 0.04) /
        10 +
      pitchSynergyBonus +
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
      const badges = [
        d.isCaptain ? '(C)' : '',
        d.isViceCaptain ? '(VC)' : '',
        d.isImpact ? '[IMPACT SUB]' : '',
        d.isLongTerm ? '[3-YR LOCK]' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `${d.player.name} ${badges} — ${d.dna.tag}`.trim();
    });

    const topPowerHitter = [...batters].sort((a, b) => b.dna.power - a.dna.power)[0];
    if (topPowerHitter && topPowerHitter.dna.power >= 88) {
      pros.push(
        `Boundary Ceiling: ${topPowerHitter.player.name} (Power ${topPowerHitter.dna.power}/100) anchors rapid scoring.`
      );
    }

    if (impactPlayer) {
      pros.push(`Tactical Impact Sub Armed: ${impactPlayer.name} (${impactPlayer.role}) provides live phase flexibility.`);
    }

    if (captainEntry) {
      pros.push(`On-Field Leadership: Captain ${captainEntry.player.name} boosts crunch-over composure.`);
    }

    if (pitch !== 'balanced') {
      pros.push(
        `Venue Synergy (${pitch.toUpperCase()}): ${
          pitchSynergyBonus >= 0 ? `+${pitchSynergyBonus.toFixed(2)} pts pitch advantage` : 'Slightly mismatched to surface'
        }.`
      );
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
      playingBalance: {
        battingDepth: `Power ${Math.round(avgPower)}/100 · Stability ${Math.round(avgStability)}/100`,
        deathBowling: `${Math.round(deathOverRating)}/100 (${sortedDeath[0]?.player.name || 'N/A'})`,
        spinQuality: `${Math.round(spinRating)}/100 (${sortedSpin[0]?.player.name || 'N/A'})`,
        powerplayImpact: `${Math.round(ppOverRating)}/100 (${sortedPP[0]?.player.name || 'N/A'})`,
        fieldingAndVersatility: `Fielding ${Math.round(avgFielding)}/100 · Versatility ${Math.round(avgVersatility)}/100`,
      },
      metrics: {
        sixthBowlingOption: hasExtraBowler,
        powerHittingIndex: Math.round(avgPower),
        anchorStabilityIndex: Math.round(avgStability),
        deathOverRating: Math.round(deathOverRating),
        variationsRating: Math.round(avgVariations),
        fieldingRating: Math.round(avgFielding),
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

  return {
    executiveSummary:
      leader && runnerUp
        ? `[${playingCount}-Player Format · ${pitch.toUpperCase()} Pitch] ${leader.teamName} (${leader.scoreOutOf10.toFixed(
            2
          )}/10) leads ${runnerUp.teamName} (${runnerUp.scoreOutOf10.toFixed(
            2
          )}/10) with superior phase balance, leadership multipliers, and bench depth.`
        : 'Dynamic Squad Tactical Analysis complete.',
    rankings: rawRankings,
    generatedAt: Date.now(),
  };
}

export function simulateMiniTournament(
  teams: Team[],
  lineups: Record<string, TeamLineupConfig>,
  minSquad: number = 11,
  pitch: PitchProfile = 'balanced'
): TournamentSimulationResult {
  const { playingCount } = getDynamicRoleRequirements(minSquad);
  const standings: Record<
    string,
    { teamId: string; teamName: string; played: number; won: number; lost: number; runsFor: number; runsAgainst: number; points: number }
  > = {};

  const batterStats: Record<string, { playerName: string; teamName: string; runs: number; balls: number }> = {};
  const bowlerStats: Record<string, { playerName: string; teamName: string; wickets: number; runsConceded: number; overs: number }> = {};

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

  const simulateMatch = (teamA: Team, teamB: Team) => {
    const getEffectiveSquad = (t: Team) => {
      const cfg = lineups[t.id];
      const baseList =
        cfg?.playingIds?.length > 0
          ? t.players.filter((p) => cfg.playingIds.includes(p.id)).slice(0, playingCount)
          : t.players.slice(0, playingCount);
      const impact = cfg?.impactPlayerId ? t.players.find((p) => p.id === cfg.impactPlayerId) : undefined;
      const combined = impact && !baseList.some((p) => p.id === impact.id) ? [...baseList, impact] : baseList;
      return {
        squad: combined.length > 0 ? combined : t.players,
        captainId: cfg?.captainId,
        vcId: cfg?.viceCaptainId,
      };
    };

    const sideA = getEffectiveSquad(teamA);
    const sideB = getEffectiveSquad(teamB);

    const calcInnings = (
      side: { squad: Player[]; captainId?: string; vcId?: string },
      battingTeamName: string,
      bowlingSide: { squad: Player[] },
      bowlingTeamName: string
    ) => {
      let totalRuns = 0;
      let totalWickets = 0;

      const bowlers = bowlingSide.squad.filter((p) => p.role === 'BOWL' || p.role === 'AR');
      const activeBowlers = bowlers.length >= 4 ? bowlers.slice(0, 5) : bowlingSide.squad.slice(0, 5);

      const batterLimit = Math.min(side.squad.length, Math.max(5, playingCount - 2));
      side.squad.slice(0, batterLimit).forEach((batter, idx) => {
        if (totalWickets >= playingCount - 1) return;
        const dna = derivePlayerDNA(batter);
        const capMult = batter.id === side.captainId ? 1.15 : batter.id === side.vcId ? 1.08 : 1.0;
        const pitchMult = pitch === 'flat' ? 1.12 : pitch === 'spin' && dna.spinControl > 0 ? 1.05 : 1.0;
        const variance = 0.72 + Math.random() * 0.62;

        const baseRuns =
          ((dna.power * 0.45 + dna.stability * 0.55) / 100) *
          (idx < 4 ? 38 : 22) *
          variance *
          capMult *
          pitchMult;
        const runs = Math.round(baseRuns);
        const sr = (dna.power * 1.45 + 35) * (0.88 + Math.random() * 0.25);
        const balls = Math.max(4, Math.round((runs / sr) * 100));

        totalRuns += runs;
        if (Math.random() > 0.28) totalWickets++;

        if (!batterStats[batter.id]) {
          batterStats[batter.id] = { playerName: batter.name, teamName: battingTeamName, runs: 0, balls: 0 };
        }
        batterStats[batter.id].runs += runs;
        batterStats[batter.id].balls += balls;
      });

      let wicketsToDistribute = Math.min(playingCount - 2, totalWickets);
      activeBowlers.forEach((bowler) => {
        const dna = derivePlayerDNA(bowler);
        const skill = Math.max(dna.ppBowl, dna.deathBowl, dna.spinControl, 55);
        const wkts = wicketsToDistribute > 0 && Math.random() < skill / 135 ? 1 + (Math.random() < 0.35 ? 1 : 0) : 0;
        const actualWkts = Math.min(wicketsToDistribute, wkts);
        wicketsToDistribute -= actualWkts;

        const conceded = Math.round((totalRuns / Math.max(1, activeBowlers.length)) * (1.15 - skill / 250));

        if (!bowlerStats[bowler.id]) {
          bowlerStats[bowler.id] = { playerName: bowler.name, teamName: bowlingTeamName, wickets: 0, runsConceded: 0, overs: 0 };
        }
        bowlerStats[bowler.id].wickets += actualWkts;
        bowlerStats[bowler.id].runsConceded += Math.max(14, conceded);
        bowlerStats[bowler.id].overs += 4;
      });

      return Math.max(110, totalRuns);
    };

    const scoreA = calcInnings(sideA, teamA.name, sideB, teamB.name);
    let scoreB = calcInnings(sideB, teamB.name, sideA, teamA.name);
    if (scoreA === scoreB) scoreB += 1;

    return { scoreA, scoreB, winner: scoreA > scoreB ? teamA : teamB, loser: scoreA > scoreB ? teamB : teamA };
  };

  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const m1 = simulateMatch(teams[i], teams[j]);
      standings[teams[i].id].played++;
      standings[teams[j].id].played++;
      standings[teams[i].id].runsFor += m1.scoreA;
      standings[teams[i].id].runsAgainst += m1.scoreB;
      standings[teams[j].id].runsFor += m1.scoreB;
      standings[teams[j].id].runsAgainst += m1.scoreA;
      standings[m1.winner.id].won++;
      standings[m1.winner.id].points += 2;
      standings[m1.loser.id].lost++;
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
  const grandFinal = simulateMatch(finalist1, finalist2);

  const orangeLeader = Object.values(batterStats).sort((a, b) => b.runs - a.runs)[0] || {
    playerName: 'N/A',
    teamName: finalist1.name,
    runs: 0,
    balls: 1,
  };

  const purpleLeader = Object.values(bowlerStats).sort((a, b) => b.wickets - a.wickets || a.runsConceded - b.runsConceded)[0] || {
    playerName: 'N/A',
    teamName: finalist1.name,
    wickets: 0,
    runsConceded: 0,
    overs: 1,
  };

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
    },
    purpleCap: {
      playerName: purpleLeader.playerName,
      teamName: purpleLeader.teamName,
      wickets: purpleLeader.wickets,
      economy: Number((purpleLeader.runsConceded / Math.max(1, purpleLeader.overs)).toFixed(2)),
    },
    pointsTable: pointsTable.map(({ rawNrr, ...rest }) => rest),
  };
}

export async function fetchAiScoutReport(
  teams: Team[],
  minSquad: number = 11
): Promise<MasterScoutReport> {
  return generateMasterScoutReport(teams, {}, minSquad, 'balanced');
}