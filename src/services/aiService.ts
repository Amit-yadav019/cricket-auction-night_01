/**
 * AI Service for Cricket Auction Night
 * Handles live commentary, prime-form T20 squad analytics, and tactical bench grading.
 */

import { GoogleGenAI } from '@google/genai';
import { Team, Player } from '../game/auctionRules';

/* ==========================================================================
   1. LIVE AUCTION COMMENTARY (Preserved from your original aiService.ts)
   ========================================================================== */

export interface AiCommentaryRequest {
  player: {
    name: string;
    role: string;
    basePrice: number;
  };
  teamName?: string;
  event: 'lot_start' | 'bid' | 'sold' | 'unsold';
  bidAmount?: number;
  purseUnit?: string;
  bidStep?: number;
}

export async function fetchAiCommentary(req: AiCommentaryRequest): Promise<string> {
  try {
    const res = await fetch('/api/ai/commentary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error('Failed to fetch commentary');
    const data = await res.json();
    return data.commentary || '';
  } catch {
    if (req.event === 'sold') {
      return `SOLD! ${req.player.name} hammered to ${req.teamName || 'the leader'} for ₹${req.bidAmount} ${req.purseUnit || 'Cr'}!`;
    }
    if (req.event === 'unsold') {
      return `${req.player.name} goes unsold in this round.`;
    }
    if (req.event === 'bid') {
      return `${req.teamName} bids ₹${req.bidAmount} ${req.purseUnit || 'Cr'} for ${req.player.name}!`;
    }
    return `${req.player.name} (${req.player.role}) is on the auction podium at ₹${req.player.basePrice} ${req.purseUnit || 'Cr'}!`;
  }
}

/* ==========================================================================
   2. PRIME-FORM T20 MASTER SCOUT & LINEUP EVALUATOR
   ========================================================================== */

export interface TacticalMetrics {
  powerplayRating: string;
  middleOversControl: string;
  deathOversFinishing: string;
  bowlingVariety: string;
  sixthBowlingOption: boolean;
  benchDepthScore: string;
}

export interface TeamTacticalReport {
  teamId: string;
  teamName: string;
  rank: number;
  scoreOutOf10: number;
  verdict: string;
  metrics: TacticalMetrics;
  playingBalance: {
    battingDepth: string;
    deathBowling: string;
    spinQuality: string;
    wicketkeeping: string;
  };
  benchStrength: string;
  benchPenaltyNote?: string;
  pros: string[];
  cons: string[];
}

export interface MasterScoutReport {
  generatedAt: number;
  tournamentTitle: string;
  executiveSummary: string;
  rankings: TeamTacticalReport[];
}

// Backward-compatible type for legacy references
export interface AiScoutReport {
  teamName: string;
  grade: string;
  verdict: string;
  analysis: string;
  predictedFinish: string;
}

export function evaluatePrimeFormHeuristic(
  teams: Team[],
  lineups: Record<string, { playingIds: string[]; benchIds: string[] }>,
  minSquad: number
): MasterScoutReport {
  const reports: TeamTacticalReport[] = teams.map((team) => {
    const players = team.players || [];
    const lineup = lineups[team.id] || {
      playingIds: players.slice(0, minSquad).map((p) => p.id),
      benchIds: players.slice(minSquad).map((p) => p.id),
    };

    const playingPlayers = players.filter((p) => lineup.playingIds.includes(p.id));
    const benchPlayers = players.filter((p) => lineup.benchIds.includes(p.id));

    const bats = playingPlayers.filter((p) => p.role === 'BAT');
    const wks = playingPlayers.filter((p) => p.role === 'WK');
    const ars = playingPlayers.filter((p) => p.role === 'AR');
    const bowls = playingPlayers.filter((p) => p.role === 'BOWL');

    const totalBowlers = bowls.length + ars.length;
    const totalHitters = bats.length + ars.length + wks.length;

    let score = 7.0;
    const pros: string[] = [];
    const cons: string[] = [];
    let benchPenaltyNote = '';

    // 1. Wicketkeeper validation
    if (wks.length >= 1) {
      score += 0.4;
      pros.push(`Prime wicketkeeper anchor locked in starting unit (${wks[0].name}).`);
    } else {
      score -= 1.6;
      cons.push('CRITICAL: No specialist wicketkeeper selected in the primary playing XI!');
    }

    // 2. Bowling Attack & 6th Bowling Option Check
    const hasSixthOption = totalBowlers >= 6;
    if (totalBowlers >= 6) {
      score += 0.8;
      pros.push('6+ recognized bowling options allow complete tactical flexibility on off-days.');
    } else if (totalBowlers === 5) {
      score += 0.3;
      pros.push('Standard 5-bowler attack with all 20 overs accounted for.');
    } else {
      score -= 1.8;
      cons.push(`Severe bowling shortage: Only ${totalBowlers} bowling options; cannot complete 20 overs cleanly.`);
    }

    // 3. Bowling Variety (Pace vs Spin)
    const spinCount = playingPlayers.filter((p) => p.bowlingStyle?.toLowerCase().includes('spin')).length;
    const paceCount = playingPlayers.filter((p) =>
      p.bowlingStyle?.toLowerCase().includes('fast') ||
      p.bowlingStyle?.toLowerCase().includes('medium') ||
      p.bowlingStyle?.toLowerCase().includes('pace')
    ).length;

    let bowlingVarietyText = 'Balanced Pace & Spin';
    if (spinCount >= 2 && paceCount >= 3) {
      score += 0.6;
      pros.push(`Ideal pace-spin balance (${paceCount} pace, ${spinCount} spin options) for all conditions.`);
    } else if (spinCount === 0) {
      score -= 0.6;
      bowlingVarietyText = 'Pace-Heavy / Zero Spin';
      cons.push('No recognized spinners in the playing unit to squeeze the middle overs (7-15).');
    } else if (paceCount < 2) {
      score -= 0.7;
      bowlingVarietyText = 'Spin-Heavy / Thin Pace';
      cons.push('Thin pace reserves for powerplay swing and death overs.');
    }

    // 4. Batting Depth
    let battingDepthText = `${totalHitters} Batters/All-rounders`;
    if (totalHitters >= 7) {
      score += 0.6;
      pros.push('Deep batting lineup allowing aggressive strike rates throughout.');
    } else {
      score -= 0.7;
      cons.push('Tail begins too early (less than 7 reliable batters).');
    }

    // 5. Bench Penalties & Tactical Replacement Deductions
    let benchStrength = 'Adequate';
    if (benchPlayers.length === 0) {
      score -= 2.0;
      benchStrength = 'Severe Hazard: Zero Bench';
      benchPenaltyNote = 'Deducted -2.0 points: No bench players. Zero contingency for simulated form slumps or injuries.';
      cons.push('Fatal roster risk: Zero bench reserves. Cannot adjust for injuries or tactical matchups.');
    } else {
      const benchBowlers = benchPlayers.filter((p) => p.role === 'BOWL' || p.role === 'AR');
      const benchBats = benchPlayers.filter((p) => p.role === 'BAT' || p.role === 'WK');

      if (benchBowlers.length >= 1 && benchBats.length >= 1) {
        score += 0.9;
        benchStrength = 'Elite Multi-Role Bench (+0.9 bonus)';
        pros.push(`Bench depth covers all bases: ${benchBats.length} batter(s) and ${benchBowlers.length} bowler(s) available.`);
      } else if (benchBowlers.length === 0) {
        score -= 1.0;
        benchStrength = 'One-Sided (No Bowling Replacements)';
        benchPenaltyNote = 'Deducted -1.0 points: Bench contains zero bowling covers.';
        cons.push('Bench lacks bowling coverage: No reserve bowlers available.');
      } else if (benchBats.length === 0) {
        score -= 0.8;
        benchStrength = 'One-Sided (No Batting Replacements)';
        benchPenaltyNote = 'Deducted -0.8 points: Bench contains zero batting covers.';
        cons.push('Bench lacks batting coverage: No reserve batters available.');
      }
    }

    const finalScore = Math.min(9.9, Math.max(3.0, Number(score.toFixed(1))));

    return {
      teamId: team.id,
      teamName: team.name,
      rank: 1,
      scoreOutOf10: finalScore,
      verdict:
        finalScore >= 8.8
          ? 'Championship Favorites (Complete T20 Unit)'
          : finalScore >= 7.6
          ? 'Deep Playoff Contenders'
          : finalScore >= 6.0
          ? 'Mid-Table / High Variance'
          : 'Under-Equipped for Championship',
      metrics: {
        powerplayRating: totalHitters >= 6 && paceCount >= 2 ? 'Formidable (A)' : 'Vulnerable (C)',
        middleOversControl: spinCount >= 1 && ars.length >= 1 ? 'High Control (A)' : 'Average (B-)',
        deathOversFinishing: ars.length >= 1 && paceCount >= 2 ? 'Explosive Finishers' : 'Suspect Death Overs',
        bowlingVariety: bowlingVarietyText,
        sixthBowlingOption: hasSixthOption,
        benchDepthScore: benchStrength,
      },
      playingBalance: {
        battingDepth: battingDepthText,
        deathBowling: paceCount >= 2 ? 'Reliable Pace Units' : 'Questionable Death Overs',
        spinQuality: spinCount > 0 ? `${spinCount} Specialist Spin Option(s)` : 'No Spinners',
        wicketkeeping: wks.length > 0 ? `${wks[0].name} (Specialist WK)` : 'Part-time Keeper Only',
      },
      benchStrength,
      benchPenaltyNote,
      pros,
      cons,
    };
  });

  reports.sort((a, b) => b.scoreOutOf10 - a.scoreOutOf10);
  reports.forEach((rep, idx) => {
    rep.rank = idx + 1;
  });

  return {
    generatedAt: Date.now(),
    tournamentTitle: 'Peak Prime-Form T20 Tournament Tactical Scout',
    executiveSummary: `Evaluated ${teams.length} franchises assuming all players operate at their historical career peak in T20 cricket. Point deductions have been applied for weak bench depth and missing bowling versatility.`,
    rankings: reports,
  };
}

export async function generateMasterScoutReport(
  teams: Team[],
  lineups: Record<string, { playingIds: string[]; benchIds: string[] }>,
  minSquad: number
): Promise<MasterScoutReport> {
  const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';

  if (!apiKey) {
    return evaluatePrimeFormHeuristic(teams, lineups, minSquad);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const promptPayload = teams.map((team) => {
      const all = team.players || [];
      const userLineup = lineups[team.id];
      const playing = userLineup
        ? all.filter((p) => userLineup.playingIds.includes(p.id))
        : all.slice(0, minSquad);
      const bench = userLineup
        ? all.filter((p) => userLineup.benchIds.includes(p.id))
        : all.slice(minSquad);

      return {
        teamName: team.name,
        teamId: team.id,
        startingUnit: playing.map((p) => ({
          name: p.name,
          role: p.role,
          battingStyle: p.battingStyle || 'Right hand',
          bowlingStyle: p.bowlingStyle || 'None',
        })),
        benchReserves: bench.map((p) => ({
          name: p.name,
          role: p.role,
          battingStyle: p.battingStyle || 'Right hand',
          bowlingStyle: p.bowlingStyle || 'None',
        })),
      };
    });

    const prompt = `You are a world-class T20 cricket performance analyst.
Conduct a rigorous head-to-head tactical evaluation of the following teams.

CRITICAL EVALUATION CRITERIA:
1. ALL-TIME CAREER PEAK: Treat every player as performing at their historical career prime in T20 cricket.
2. 5 PILLARS OF A COMPLETE T20 TEAM:
   - Powerplay Engine: High strike-rate top order + genuine new ball wickets.
   - Middle Overs Spin & Acceleration: Can they tackle spin and bowl dry overs 7-15?
   - Death Phase (Overs 16-20): Proven 360-degree power finishers and ice-cool death yorker specialists.
   - 6th Bowling Option: At least 6 genuine bowling options to mitigate bad match-ups.
   - Wicketkeeping: Mandatory specialist wicketkeeper.
3. BENCH REPLACEMENT PENALTY:
   - Penalize heavily (-1.5 to -2.0) if bench is empty.
   - Penalize (-0.8 to -1.0) if bench is one-dimensional (only bats or only bowlers).
   - Award bonus (+0.8) for balanced multi-role covers.
4. Ignore financial purse and costs entirely.
5. Score each team out of 10.0 and rank them 1 to ${teams.length}.

Teams:
${JSON.stringify(promptPayload, null, 2)}

Respond with STRICT JSON only matching this schema:
{
  "executiveSummary": "string",
  "rankings": [
    {
      "teamId": "string",
      "teamName": "string",
      "rank": number,
      "scoreOutOf10": number,
      "verdict": "string",
      "metrics": {
        "powerplayRating": "string",
        "middleOversControl": "string",
        "deathOversFinishing": "string",
        "bowlingVariety": "string",
        "sixthBowlingOption": boolean,
        "benchDepthScore": "string"
      },
      "playingBalance": {
        "battingDepth": "string",
        "deathBowling": "string",
        "spinQuality": "string",
        "wicketkeeping": "string"
      },
      "benchStrength": "string",
      "benchPenaltyNote": "string",
      "pros": ["string", "string"],
      "cons": ["string", "string"]
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    if (parsed && Array.isArray(parsed.rankings) && parsed.rankings.length > 0) {
      return {
        generatedAt: Date.now(),
        tournamentTitle: 'Peak Prime-Form T20 Tournament Tactical Scout',
        executiveSummary: parsed.executiveSummary || 'Prime form tactical scouting completed.',
        rankings: parsed.rankings,
      };
    }
    return evaluatePrimeFormHeuristic(teams, lineups, minSquad);
  } catch {
    return evaluatePrimeFormHeuristic(teams, lineups, minSquad);
  }
}

// Legacy fallback endpoint caller preserved for compatibility
export async function fetchAiScoutReport(
  teams: any[],
  purseUnit: string = 'Cr',
  minSquadSize: number = 3,
  maxSquadSize: number = 5
): Promise<AiScoutReport[]> {
  try {
    const res = await fetch('/api/ai/scout-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teams, purseUnit, minSquadSize, maxSquadSize }),
    });
    if (!res.ok) throw new Error('Failed to fetch scout report');
    const data = await res.json();
    return data.reports || [];
  } catch {
    return [];
  }
}