/**
 * Client service for calling server-side Gemini AI endpoints.
 */

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

export interface AiScoutReport {
  teamName: string;
  grade: string;
  verdict: string;
  analysis: string;
  predictedFinish: string;
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
  } catch (err) {
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
  } catch (err) {
    return [];
  }
}
