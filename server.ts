import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Initialize Gemini SDK with telemetry header only if valid API key is present
const rawKey = process.env.GEMINI_API_KEY?.trim();
const hasValidKey =
  Boolean(rawKey) &&
  rawKey !== 'MY_GEMINI_API_KEY' &&
  rawKey !== 'undefined' &&
  (rawKey?.length || 0) > 10;

const ai = hasValidKey
  ? new GoogleGenAI({
      apiKey: rawKey!,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

function withTimeout<T>(promise: Promise<T>, ms = 4500): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AI generation timeout')), ms)
    ),
  ]);
}

/**
 * 1. AI Auctioneer Live Commentary Endpoint
 */
app.post('/api/ai/commentary', async (req, res) => {
  const { player, teamName, event, bidAmount, purseUnit = 'Cr' } = req.body || {};

  if (!player) {
    return res.status(400).json({ error: 'Player data is required' });
  }

  // Pre-crafted authentic auctioneer responses for high performance and offline resilience
  const fallbacks: Record<string, string[]> = {
    lot_start: [
      `Ladies and gentlemen, ${player.name} (${player.role}) enters the ring! Base price ₹${player.basePrice} ${purseUnit}. Who opens?`,
      `High stakes on the pitch! ${player.name} is up for grabs at ₹${player.basePrice} ${purseUnit}!`,
      `All eyes on ${player.name}! A genuine match-winner. Let's see those paddles up!`,
    ],
    bid: [
      `Paddle raised! ${teamName} takes the lead at ₹${bidAmount} ${purseUnit}! Any counter?`,
      `${teamName} making their move at ₹${bidAmount} ${purseUnit}! The battle heats up!`,
      `Big statement from ${teamName} at ₹${bidAmount} ${purseUnit}! Going once!`,
    ],
    sold: [
      `HAMMER DOWN! ${player.name} is SOLD to ${teamName} for ₹${bidAmount} ${purseUnit}! Fantastic buy!`,
      `SOLD! ${teamName} secures ${player.name} for ₹${bidAmount} ${purseUnit}! A roaring round of applause!`,
    ],
    unsold: [
      `No takers for ${player.name} at ₹${player.basePrice} ${purseUnit}. The hammer falls — UNSOLD!`,
      `Surprise in the room! ${player.name} passes through unsold for now.`,
    ],
  };

  const getFallbackCommentary = () => {
    const options = fallbacks[event] || fallbacks.lot_start;
    return options[Math.floor(Math.random() * options.length)];
  };

  if (!ai) {
    return res.json({ commentary: getFallbackCommentary() });
  }

  try {
    const prompt = `You are a legendary, electrifying IPL Cricket Auctioneer (like Charu Sharma or Ravi Shastri).
Generate exactly 1 to 2 short, punchy, dramatic sentences of live commentary for this auction event:
Event: ${event}
Player: ${player.name} (${player.role}, base price ₹${player.basePrice} ${purseUnit})
${teamName ? `Team involved: ${teamName}` : ''}
${bidAmount ? `Current Bid: ₹${bidAmount} ${purseUnit}` : ''}

Rules:
- Keep it under 30 words.
- Use exciting cricket auction terminology (e.g. "hammer down", "paddles up", "bidding war", "steal", "masterstroke").
- Do NOT include quotation marks, markdown headers, or emojis. Output plain text only.`;

    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      })
    );

    const commentary = response.text?.trim() || getFallbackCommentary();
    return res.json({ commentary });
  } catch (err: any) {
    console.warn('Gemini commentary fallback:', err?.message || err);
    return res.json({ commentary: getFallbackCommentary() });
  }
});

/**
 * 2. AI Squad Scout & Team Grader Endpoint
 */
app.post('/api/ai/scout-report', async (req, res) => {
  const { teams, purseUnit = 'Cr', minSquadSize = 3, maxSquadSize = 5 } = req.body || {};

  if (!teams || !Array.isArray(teams)) {
    return res.status(400).json({ error: 'Teams array is required' });
  }

  const getFallbackReports = () => {
    return teams.map((team: any) => {
      const count = team.players?.length || 0;
      const spent = team.spent || 0;
      const roles = {
        BAT: team.players?.filter((p: any) => p.role === 'BAT').length || 0,
        WK: team.players?.filter((p: any) => p.role === 'WK').length || 0,
        AR: team.players?.filter((p: any) => p.role === 'AR').length || 0,
        BOWL: team.players?.filter((p: any) => p.role === 'BOWL').length || 0,
      };

      let grade = 'B';
      let verdict = 'Balanced Franchise Strategy';
      let placement = 'Mid Table Contender';

      if (count >= minSquadSize && roles.BAT >= 1 && roles.BOWL >= 1 && (roles.AR >= 1 || roles.WK >= 1)) {
        grade = 'A+';
        verdict = 'Formidable Championship Contenders';
        placement = 'Title Favorites';
      } else if (count >= minSquadSize) {
        grade = 'A-';
        verdict = 'Solid Core with Playoff Potential';
        placement = 'Top 4 Contender';
      } else if (count > 0) {
        grade = 'C+';
        verdict = 'Top-Heavy Squad Needing Depth';
        placement = 'Dark Horse';
      } else {
        grade = 'D';
        verdict = 'Unused Budget & Empty Squad';
        placement = 'Rebuilding';
      }

      return {
        teamName: team.name,
        grade,
        verdict,
        analysis: `${team.name} acquired ${count} players spending ₹${spent} ${purseUnit}. Role distribution: ${roles.BAT} BAT, ${roles.WK} WK, ${roles.AR} AR, ${roles.BOWL} BOWL.`,
        predictedFinish: placement,
      };
    });
  };

  if (!ai) {
    return res.json({ reports: getFallbackReports() });
  }

  try {
    const teamSummaries = teams.map((t: any) => ({
      name: t.name,
      spent: `₹${t.spent} ${purseUnit}`,
      purseRemaining: `₹${t.purse} ${purseUnit}`,
      playersCount: t.players?.length || 0,
      players: t.players?.map((p: any) => `${p.name} (${p.role}, ₹${p.soldPrice || p.basePrice} ${purseUnit})`),
    }));

    const prompt = `You are a world-class IPL Franchise Talent Scout and Cricket Analyst.
Analyze these cricket teams after their auction. Squad target was ${minSquadSize} to ${maxSquadSize} players.

Teams:
${JSON.stringify(teamSummaries, null, 2)}

Provide a structured analysis for each team:
- teamName: Name
- grade: (e.g. "A+", "A", "A-", "B+", "B", "C")
- verdict: short 4-8 word headline
- analysis: 1-2 insightful sentences on their strengths, balance (BAT, WK, AR, BOWL), and value for money
- predictedFinish: short string like "Title Favorites", "Top 4 Contender", "Dark Horse", "Rebuilding"

Return strictly a JSON object: { "reports": [ ... ] }`;

    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      })
    );

    const parsed = JSON.parse(response.text || '{"reports": []}');
    return res.json({ reports: parsed.reports?.length ? parsed.reports : getFallbackReports() });
  } catch (err: any) {
    console.warn('Gemini scout report fallback:', err?.message || err);
    return res.json({ reports: getFallbackReports() });
  }
});

// Vite middleware in development, static serve in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cricket Auction Night server listening on port ${PORT}`);
  });
}

startServer();
