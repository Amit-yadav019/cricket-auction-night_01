import { Team, Player } from '../game/auctionRules';

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
  tag: string;
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
        tag: isSpinner
          ? 'Frontline Wrist/Finger Spin Specialist'
          : isLeftArmPace
          ? 'Left-Arm Angle & Swing Strike Bowler'
          : 'All-Phase Pace & Death Specialist',
      };
    }
  }
}

async function fetchGeminiLiveScoutReport(
  teams: Team[],
  lineups: Record<string, { playingIds: string[]; benchIds: string[] }>,
  minSquad: number
): Promise<MasterScoutReport | null> {
  const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
  if (!apiKey) return null;

  const squadPayload = teams.map((t) => {
    const players = Array.isArray(t.players) ? t.players : [];
    const saved = lineups[t.id];
    const playingIds =
      saved?.playingIds?.length > 0 ? saved.playingIds : players.slice(0, minSquad).map((p) => p.id);

    const playingXI = players.filter((p) => playingIds.includes(p.id)).map((p) => `${p.name} (${p.role})`);
    const bench = players.filter((p) => !playingIds.includes(p.id)).map((p) => `${p.name} (${p.role})`);

    return {
      teamId: t.id,
      teamName: t.name,
      playingXI,
      bench,
    };
  });

  const prompt = `You are an elite IPL & T20 Head Analyst. Evaluate these finalized franchise squads based on REAL-WORLD T20 player profiles (strike rates, boundary power-hitting vs anchor stability, Powerplay swing vs Death-over yorker experience, bowling variations, spin control, fielding athleticism, left-right batting balance, and bench replacement depth).

CRITICAL RULES:
1. NEVER give two teams the exact same scoreOutOf10. Use 2 decimal places (e.g., 9.34 vs 9.12) and explain the exact tactical edge (e.g., Buttler/Pooran/Head/Maxwell power-hitting vs Dhawan/Anuj Rawat/Rachin Ravindra stability, or Deepak Chahar PP-only vs Bumrah/Pathirana death overs).
2. Penalize squads with zero or weak bench replacements (-1.5 to -2.0 pts) or missing 6th bowling options.
3. Return ONLY valid raw JSON matching this exact schema (no markdown fences):
{
  "executiveSummary": "string",
  "rankings": [
    {
      "teamId": "string",
      "teamName": "string",
      "scoreOutOf10": number,
      "verdict": "string",
      "benchPenaltyNote": "string or empty",
      "benchStrength": "string",
      "playingBalance": {
        "battingDepth": "string",
        "deathBowling": "string",
        "spinQuality": "string",
        "powerplayImpact": "string",
        "fieldingAndVersatility": "string"
      },
      "metrics": {
        "sixthBowlingOption": boolean,
        "powerHittingIndex": number,
        "anchorStabilityIndex": number,
        "deathOverRating": number,
        "variationsRating": number,
        "fieldingRating": number
      },
      "archetypeBreakdown": ["Player Name — Exact T20 Role & Tactical Trait"],
      "pros": ["string"],
      "cons": ["string"]
    }
  ]
}

SQUADS TO ANALYZE:
${JSON.stringify(squadPayload, null, 2)}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.35,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!response.ok) return null;
    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    const parsed = JSON.parse(rawText);
    if (!parsed?.rankings || !Array.isArray(parsed.rankings)) return null;

    parsed.rankings.sort((a: TeamScoutRanking, b: TeamScoutRanking) => b.scoreOutOf10 - a.scoreOutOf10);
    for (let i = 1; i < parsed.rankings.length; i++) {
      if (parsed.rankings[i].scoreOutOf10 >= parsed.rankings[i - 1].scoreOutOf10) {
        parsed.rankings[i].scoreOutOf10 = Number((parsed.rankings[i - 1].scoreOutOf10 - 0.13).toFixed(2));
      }
    }

    return {
      executiveSummary: parsed.executiveSummary,
      rankings: parsed.rankings,
      generatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

export async function generateMasterScoutReport(
  teams: Team[],
  lineups: Record<string, { playingIds: string[]; benchIds: string[] }>,
  minSquad: number = 11
): Promise<MasterScoutReport> {
  const liveAiReport = await fetchGeminiLiveScoutReport(teams, lineups, minSquad);
  if (liveAiReport && liveAiReport.rankings.length > 0) {
    return liveAiReport;
  }

  const rawRankings: TeamScoutRanking[] = teams.map((team) => {
    const players = Array.isArray(team.players) ? team.players : [];
    const savedLineup = lineups[team.id];
    const playingIds =
      savedLineup?.playingIds?.length > 0
        ? savedLineup.playingIds
        : players.slice(0, minSquad).map((p) => p.id);

    const playingXI = players.filter((p) => playingIds.includes(p.id));
    const bench = players.filter((p) => !playingIds.includes(p.id));

    const dnas = playingXI.map((p) => ({ player: p, dna: derivePlayerDNA(p) }));

    const batters = dnas.filter((d) => ['BAT', 'WK', 'AR'].includes(d.player.role));
    const avgPower =
      batters.length > 0 ? batters.reduce((sum, d) => sum + d.dna.power, 0) / batters.length : 55;
    const avgStability =
      batters.length > 0 ? batters.reduce((sum, d) => sum + d.dna.stability, 0) / batters.length : 55;

    const sortedDeath = [...dnas].sort((a, b) => b.dna.deathBowl - a.dna.deathBowl);
    const deathOverRating = sortedDeath.slice(0, 3).reduce((sum, d) => sum + d.dna.deathBowl, 0) / 3;

    const sortedPP = [...dnas].sort((a, b) => b.dna.ppBowl - a.dna.ppBowl);
    const ppOverRating = sortedPP.slice(0, 3).reduce((sum, d) => sum + d.dna.ppBowl, 0) / 3;

    const sortedSpin = [...dnas].sort((a, b) => b.dna.spinControl - a.dna.spinControl);
    const spinRating = sortedSpin.slice(0, 2).reduce((sum, d) => sum + d.dna.spinControl, 0) / 2;

    const avgVariations =
      dnas.length > 0 ? dnas.reduce((sum, d) => sum + d.dna.variations, 0) / dnas.length : 50;
    const avgFielding =
      dnas.length > 0 ? dnas.reduce((sum, d) => sum + d.dna.fielding, 0) / dnas.length : 70;
    const avgVersatility =
      dnas.length > 0 ? dnas.reduce((sum, d) => sum + d.dna.versatility, 0) / dnas.length : 70;

    const leftHanders = batters.filter((b) =>
      (b.player.battingStyle || '').toLowerCase().includes('left')
    ).length;
    const balanceBonus = leftHanders >= 2 && leftHanders <= 5 ? 0.25 : 0;

    const genuineBowlers = dnas.filter(
      (d) =>
        d.player.role === 'BOWL' ||
        (d.player.role === 'AR' && (d.dna.ppBowl >= 50 || d.dna.deathBowl >= 50 || d.dna.spinControl >= 55))
    );
    const hasSixthBowler = genuineBowlers.length >= 6;
    const hasWK = playingXI.some((p) => p.role === 'WK');

    const benchQualityScore = bench.reduce((acc, p) => {
      const dna = derivePlayerDNA(p);
      return acc + (dna.power + dna.stability + dna.versatility + Math.max(dna.ppBowl, dna.deathBowl)) / 320;
    }, 0);

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
      balanceBonus;

    if (!hasWK) rawScore -= 1.25;
    if (genuineBowlers.length < 5) rawScore -= 1.4;
    if (hasSixthBowler) rawScore += 0.35;

    let benchPenaltyNote: string | undefined;
    if (bench.length === 0) {
      rawScore -= 1.85;
      benchPenaltyNote = 'Zero bench depth (-1.85 pts): No injury or pitch-condition backup available.';
    } else if (bench.length < 2) {
      rawScore -= 0.65;
      benchPenaltyNote = 'Thin reserves (-0.65 pts): Only 1 backup player on the bench.';
    } else {
      rawScore += Math.min(0.45, benchQualityScore * 0.15);
    }

    const dnaFingerprint = dnas.reduce(
      (acc, d, idx) => acc + (d.dna.power * 0.0013 + d.dna.deathBowl * 0.0017 + idx * 0.0007),
      0
    );
    const finalScore = Math.min(9.94, Math.max(3.5, Number((rawScore + (dnaFingerprint % 0.19)).toFixed(2))));

    const pros: string[] = [];
    const cons: string[] = [];
    const archetypeBreakdown = dnas.map((d) => `${d.player.name} — ${d.dna.tag}`);

    const topPowerHitter = [...batters].sort((a, b) => b.dna.power - a.dna.power)[0];
    const topAnchor = [...batters].sort((a, b) => b.dna.stability - a.dna.stability)[0];

    if (topPowerHitter && topPowerHitter.dna.power >= 88) {
      pros.push(
        `Boundary Power Ceiling: ${topPowerHitter.player.name} (${topPowerHitter.dna.tag}, Power ${topPowerHitter.dna.power}/100) drives high-tempo scoring.`
      );
    } else if (topPowerHitter) {
      cons.push(
        `Moderate Six-Hitting Ceiling: Relies on ${topPowerHitter.player.name} (Power ${topPowerHitter.dna.power}/100); lacks an elite 90+ finisher.`
      );
    }

    if (topAnchor && topAnchor.dna.stability >= 86) {
      pros.push(
        `Collapse Insurance: ${topAnchor.player.name} (Stability ${topAnchor.dna.stability}/100) anchors the innings under pressure.`
      );
    }

    const bestDeath = sortedDeath[0];
    if (bestDeath && bestDeath.dna.deathBowl >= 84) {
      pros.push(
        `Death-Over Control: ${bestDeath.player.name} (Death ${bestDeath.dna.deathBowl}/100, Variations ${bestDeath.dna.variations}/100) locks down overs 16–20.`
      );
    } else {
      cons.push(`Death-Over Vulnerability: Lacks a proven 85+ yorker/slower-ball specialist for the final 4 overs.`);
    }

    if (hasSixthBowler) {
      pros.push(`6th Bowling Option Armed: ${genuineBowlers.length} genuine bowlers provide tactical flexibility.`);
    } else {
      cons.push(`5-Bowler Tightrope: Only ${genuineBowlers.length} frontline bowling options in the XI.`);
    }

    return {
      teamId: team.id,
      teamName: team.name,
      scoreOutOf10: finalScore,
      verdict:
        finalScore >= 8.5
          ? 'Championship Favorite — Complete Phase, Power & Bench Balance'
          : finalScore >= 7.5
          ? 'Playoff Contender — Strong Core with Minor Phase Gaps'
          : 'Dark Horse — Dependent on Star Individual Performances',
      benchPenaltyNote,
      benchStrength:
        bench.length >= 4
          ? `Deep (${bench.length} Reserves)`
          : bench.length >= 2
          ? `Adequate (${bench.length} Reserves)`
          : `Critical (${bench.length} Reserves)`,
      playingBalance: {
        battingDepth: `Power ${Math.round(avgPower)}/100 · Stability ${Math.round(avgStability)}/100`,
        deathBowling: `${Math.round(deathOverRating)}/100 (${bestDeath?.player.name || 'N/A'})`,
        spinQuality: `${Math.round(spinRating)}/100 (${sortedSpin[0]?.player.name || 'N/A'})`,
        powerplayImpact: `${Math.round(ppOverRating)}/100 (${sortedPP[0]?.player.name || 'N/A'})`,
        fieldingAndVersatility: `Fielding ${Math.round(avgFielding)}/100 · Versatility ${Math.round(avgVersatility)}/100`,
      },
      metrics: {
        sixthBowlingOption: hasSixthBowler,
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
        ? `${leader.teamName} (${leader.scoreOutOf10.toFixed(2)}/10) takes the #1 tactical ranking over ${runnerUp.teamName} (${runnerUp.scoreOutOf10.toFixed(
            2
          )}/10) through superior ${
            leader.metrics.powerHittingIndex > runnerUp.metrics.powerHittingIndex
              ? 'boundary power-hitting ceiling'
              : 'death-over execution and bowling variations'
          }.`
        : '9-Dimension T20 Squad Tactical Analysis complete.',
    rankings: rawRankings,
    generatedAt: Date.now(),
  };
}

export function simulateMiniTournament(
  teams: Team[],
  lineups: Record<string, { playingIds: string[]; benchIds: string[] }>,
  minSquad: number = 11
): TournamentSimulationResult {
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
    const getXI = (t: Team) => {
      const ids = lineups[t.id]?.playingIds;
      const list = ids?.length > 0 ? t.players.filter((p) => ids.includes(p.id)) : t.players.slice(0, minSquad);
      return list.length > 0 ? list : t.players;
    };

    const xiA = getXI(teamA);
    const xiB = getXI(teamB);

    const calcInnings = (battingXI: Player[], battingTeamName: string, bowlingXI: Player[], bowlingTeamName: string) => {
      let totalRuns = 0;
      let totalWickets = 0;

      const bowlers = bowlingXI.filter((p) => p.role === 'BOWL' || p.role === 'AR');
      const activeBowlers = bowlers.length >= 5 ? bowlers.slice(0, 5) : bowlingXI.slice(0, 5);

      battingXI.slice(0, 8).forEach((batter, idx) => {
        if (totalWickets >= 10) return;
        const dna = derivePlayerDNA(batter);
        const variance = 0.72 + Math.random() * 0.62;
        const baseRuns = ((dna.power * 0.45 + dna.stability * 0.55) / 100) * (idx < 4 ? 38 : 22) * variance;
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

      let wicketsToDistribute = Math.min(9, totalWickets);
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

      return Math.max(115, totalRuns);
    };

    const scoreA = calcInnings(xiA, teamA.name, xiB, teamB.name);
    let scoreB = calcInnings(xiB, teamB.name, xiA, teamA.name);
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
/**
 * Compatibility wrapper for AuctionSummaryModal.tsx
 */
export async function fetchAiScoutReport(
  teams: Team[],
  minSquad: number = 11
): Promise<MasterScoutReport> {
  return generateMasterScoutReport(teams, {}, minSquad);
}