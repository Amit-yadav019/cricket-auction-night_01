/**
 * Pure auction logic and validation rules for Cricket Auction Night.
 * Decoupled from React and Firebase for unit testing and deterministic simulation.
 */

export type PlayerRole = 'BAT' | 'WK' | 'AR' | 'BOWL';
export type CappedStatus = 'Capped' | 'Uncapped';
export type BattingStyle = 'Right-hand bat' | 'Left-hand bat';
export type BowlingStyle =
  | 'Right-arm fast'
  | 'Right-arm medium'
  | 'Right-arm offbreak'
  | 'Right-arm legbreak'
  | 'Left-arm fast'
  | 'Left-arm medium'
  | 'Slow left-arm orthodox'
  | 'Left-arm wrist spin';

export const ALLOWED_BASE_PRICES = [0.5, 1, 1.5, 2] as const;
export type BasePrice = (typeof ALLOWED_BASE_PRICES)[number];

export interface Player {
  id: string;
  name: string;
  role: PlayerRole;
  basePrice: BasePrice;
  status: 'pending' | 'active' | 'sold' | 'unsold';
  soldPrice?: number;
  soldToTeamId?: string;
  cappedStatus?: CappedStatus;
  battingStyle?: BattingStyle;
  bowlingStyle?: BowlingStyle;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  claimedByOwnerName?: string;
  ownerId?: string;
  ownerToken?: string;
  purse: number;
  spent: number;
  players: Player[];
}

export interface AuctionSettings {
  pursePerTeam: number;
  purseUnit: 'Cr' | 'L';
  minSquadSize: number;
  maxSquadSize: number;
  squadSize?: number;
  bidStep: number;
  shuffleOrder: boolean;
  selectedPlayerIds: string[];
  poolVisibility: 'public' | 'hidden';
}

export interface BidHistoryItem {
  teamId: string;
  teamShortName: string;
  amount: number;
  timestamp: number;
}

export interface AuctionRoomState {
  roomCode: string;
  roomName: string;
  hostUid: string;
  createdAt: number;
  status: 'lobby' | 'active' | 'paused' | 'completed';
  initialPurse: number;
  minSquadSize: number;
  maxSquadSize: number;
  teams: Record<string, Team>;
  playerPool: Player[];
  currentPlayerIndex: number;
  currentPlayerId?: string;
  currentBid: number;
  currentBidderTeamId?: string;
  bidHistory: BidHistoryItem[];
  timerDurationSeconds: number;
  timerExpiresAt?: number;
  isTimerRunning: boolean;
  biddingIncrementRules: Array<{ upTo: number; increment: number }>;
}

export const DEFAULT_INCREMENT_RULES = [
  { upTo: 1, increment: 0.1 },
  { upTo: 2, increment: 0.2 },
  { upTo: 5, increment: 0.25 },
  { upTo: 10, increment: 0.5 },
  { upTo: Infinity, increment: 1.0 },
];

export function getNextBidIncrement(currentBid: number, rules = DEFAULT_INCREMENT_RULES): number {
  for (const rule of rules) {
    if (currentBid < rule.upTo) {
      return rule.increment;
    }
  }
  return 1.0;
}

export function calculateNextValidBid(
  currentBid: number,
  basePrice: number,
  rules = DEFAULT_INCREMENT_RULES
): number {
  if (currentBid <= 0) {
    return basePrice;
  }
  const inc = getNextBidIncrement(currentBid, rules);
  return Number((currentBid + inc).toFixed(2));
}

export function getValidNextBids(
  currentBid: number,
  basePrice: number,
  count = 3,
  rules = DEFAULT_INCREMENT_RULES
): number[] {
  const bids: number[] = [];
  let next = calculateNextValidBid(currentBid, basePrice, rules);
  for (let i = 0; i < count; i++) {
    bids.push(next);
    next = Number((next + getNextBidIncrement(next, rules)).toFixed(2));
  }
  return bids;
}

export function calculateMaxBid(
  team: Team,
  maxSquadSize = 25,
  reservePerSlot = 0.2
): number {
  if (!team) return 0;
  const currentCount = Array.isArray(team.players) ? team.players.length : 0;
  const remainingSlots = Math.max(0, maxSquadSize - (currentCount + 1));
  const reserveNeeded = remainingSlots * reservePerSlot;
  return Math.max(0, Number(((team.purse || 0) - reserveNeeded).toFixed(2)));
}

export function canTeamAffordBid(
  team: Team,
  bidAmount: number,
  maxSquadSize = 25
): boolean {
  if (!team) return false;
  return calculateMaxBid(team, maxSquadSize) >= bidAmount;
}

export function validateBid(
  room: AuctionRoomState,
  teamId: string,
  amount: number
): { valid: boolean; reason?: string } {
  if (!room || !room.teams) {
    return { valid: false, reason: 'Room or teams not ready' };
  }

  const team = room.teams[teamId];
  if (!team) {
    return { valid: false, reason: 'Team not found' };
  }

  if (room.status !== 'active') {
    return { valid: false, reason: 'Auction is not active' };
  }

  const squadCount = Array.isArray(team.players) ? team.players.length : 0;
  if (squadCount >= (room.maxSquadSize || 25)) {
    return { valid: false, reason: 'Squad limit reached' };
  }

  const pool = room.playerPool || [];
  const idx = Number(room.currentPlayerIndex);
  const currentPlayer = pool[idx];
  if (!currentPlayer) {
    return { valid: false, reason: 'No player currently on auction' };
  }

  const minBid =
    room.currentBid <= 0
      ? currentPlayer.basePrice
      : calculateNextValidBid(room.currentBid, currentPlayer.basePrice);

  if (amount < minBid) {
    return { valid: false, reason: `Bid must be at least ₹${minBid} Cr` };
  }

  if (!canTeamAffordBid(team, amount, room.maxSquadSize || 25)) {
    return { valid: false, reason: 'Insufficient purse balance after reserve requirements' };
  }

  return { valid: true };
}

export function isAuctionComplete(room: AuctionRoomState): boolean {
  if (!room) return false;
  if (room.status === 'completed') return true;
  const pool = room.playerPool || [];
  if (pool.length === 0) return true;
  return (room.currentPlayerIndex || 0) >= pool.length;
}

export function parseCustomPlayers(csvOrText: string): Player[] {
  if (!csvOrText) return [];
  const lines = csvOrText.split('\n').map((l) => l.trim()).filter(Boolean);
  const players: Player[] = [];

  lines.forEach((line, idx) => {
    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 3) return;
    const name = parts[0];
    const rawRole = parts[1].toUpperCase();
    const role: PlayerRole = ['BAT', 'WK', 'AR', 'BOWL'].includes(rawRole)
      ? (rawRole as PlayerRole)
      : 'BAT';
    const parsedPrice = parseFloat(parts[2]);
    const basePrice: BasePrice = (ALLOWED_BASE_PRICES as readonly number[]).includes(parsedPrice)
      ? (parsedPrice as BasePrice)
      : 0.5;

    players.push({
      id: `custom_${Date.now()}_${idx}`,
      name,
      role,
      basePrice,
      status: 'pending',
    });
  });

  return players;
}

export function pickRandomBalanced(pool: Player[], totalCount: number): Player[] {
  if (!pool || pool.length === 0) return [];
  if (pool.length <= totalCount) return [...pool];

  const byRole: Record<PlayerRole, Player[]> = {
    BAT: pool.filter((p) => p.role === 'BAT'),
    WK: pool.filter((p) => p.role === 'WK'),
    AR: pool.filter((p) => p.role === 'AR'),
    BOWL: pool.filter((p) => p.role === 'BOWL'),
  };

  const shuffle = <T>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);
  const roles: PlayerRole[] = ['BAT', 'WK', 'AR', 'BOWL'];
  const totalPoolSize = pool.length;

  // 1. Calculate ideal fractional quota according to exact percentage representation in the pool
  const targets = roles.map((role) => ({
    role,
    fractional: (byRole[role].length / totalPoolSize) * totalCount,
    allocated: Math.floor((byRole[role].length / totalPoolSize) * totalCount),
  }));

  // 2. Guarantee >= 2 per role when pool size and totalCount permit
  if (totalCount >= 8) {
    targets.forEach((t) => {
      if (t.allocated < 2 && byRole[t.role].length >= 2) {
        t.allocated = 2;
      }
    });
  }

  // 3. Reconcile remainder to guarantee exact totalCount sum
  let currentAllocated = targets.reduce((sum, t) => sum + t.allocated, 0);

  // If minimum guarantees caused over-allocation, decrement from the ones with least remainder
  while (currentAllocated > totalCount) {
    targets.sort((a, b) => (a.fractional - a.allocated) - (b.fractional - b.allocated));
    for (const t of targets) {
      if (t.allocated > 2 && currentAllocated > totalCount) {
        t.allocated--;
        currentAllocated--;
      }
    }
  }

  // If under-allocated, distribute to highest fractional remainders (Hamilton-Hare)
  while (currentAllocated < totalCount) {
    targets.sort((a, b) => {
      const remA = a.fractional - a.allocated;
      const remB = b.fractional - b.allocated;
      return remB - remA;
    });

    const candidate = targets.find((t) => t.allocated < byRole[t.role].length);
    if (!candidate) break;
    candidate.allocated++;
    currentAllocated++;
  }

  // 4. Sample randomly without replacement from each role partition
  const selected: Player[] = [];
  targets.forEach(({ role, allocated }) => {
    const shuffledRole = shuffle(byRole[role]);
    selected.push(...shuffledRole.slice(0, allocated));
  });

  return shuffle(selected);
}
export type PitchProfile = 'balanced' | 'spin' | 'flat' | 'seam';

export interface StructuredAuctionSet {
  setNumber: number;
  title: string;
  players: Player[];
}

/**
 * Dynamically scales required bowlers & keepers to whatever minSquad size the room uses (e.g., 7, 9, or 11).
 */
export function getDynamicRoleRequirements(minSquad: number) {
  const playingCount = Math.max(5, minSquad || 11);
  const minBowlers = Math.max(3, Math.floor(playingCount * 0.45)); // e.g., 3 bowlers for 7-player game, 5 for 11-player
  const sixthBowlerTarget = minBowlers + 1;
  return {
    playingCount,
    minBowlers,
    sixthBowlerTarget,
  };
}

/**
 * Groups any 350-player pool into Official IPL-Style Sets:
 * Set 1 & 2: Marquee Superstars (6 per set)
 * Sets 3-7: Capped Batters, All-Rounders, Wicketkeepers, Fast Bowlers, Spinners
 * Sets 8-12: Uncapped Indian & Overseas Specialists
 */
export function buildStructuredAuctionSets(players: Player[]): StructuredAuctionSet[] {
  const remaining = [...players];
  const takeMatching = (predicate: (p: Player) => boolean, limit?: number): Player[] => {
    const matched: Player[] = [];
    for (let i = 0; i < remaining.length; i++) {
      if (predicate(remaining[i])) {
        matched.push(remaining[i]);
        remaining.splice(i, 1);
        i--;
        if (limit && matched.length >= limit) break;
      }
    }
    return matched;
  };

  // Sort high-base-price stars to the front for Marquee sets
  remaining.sort((a, b) => (b.basePrice || 0.5) - (a.basePrice || 0.5));

  const set1 = takeMatching((p) => (p.basePrice || 0) >= 2.0 && p.cappedStatus !== 'Uncapped', 6);
  const set2 = takeMatching((p) => (p.basePrice || 0) >= 1.5 && p.cappedStatus !== 'Uncapped', 6);

  const isCapped = (p: Player) => p.cappedStatus !== 'Uncapped';
  const isSpinner = (p: Player) => {
    const s = (p.bowlingStyle || '').toLowerCase();
    return s.includes('spin') || s.includes('orthodox') || s.includes('offbreak') || s.includes('legbreak');
  };

  const set3 = takeMatching((p) => isCapped(p) && p.role === 'BAT');
  const set4 = takeMatching((p) => isCapped(p) && p.role === 'AR');
  const set5 = takeMatching((p) => isCapped(p) && p.role === 'WK');
  const set6 = takeMatching((p) => isCapped(p) && p.role === 'BOWL' && !isSpinner(p));
  const set7 = takeMatching((p) => isCapped(p) && p.role === 'BOWL' && isSpinner(p));

  const set8 = takeMatching((p) => p.role === 'BAT');
  const set9 = takeMatching((p) => p.role === 'AR');
  const set10 = takeMatching((p) => p.role === 'WK');
  const set11 = takeMatching((p) => p.role === 'BOWL' && !isSpinner(p));
  const set12 = takeMatching((p) => true); // Remaining spinners & prospects

  const rawSets: StructuredAuctionSet[] = [
    { setNumber: 1, title: 'Set 1 · Marquee Superstars I', players: set1 },
    { setNumber: 2, title: 'Set 2 · Marquee Superstars II', players: set2 },
    { setNumber: 3, title: 'Set 3 · Capped Specialist Batters', players: set3 },
    { setNumber: 4, title: 'Set 4 · Capped All-Rounders', players: set4 },
    { setNumber: 5, title: 'Set 5 · Capped Wicketkeepers', players: set5 },
    { setNumber: 6, title: 'Set 6 · Capped Fast Bowlers', players: set6 },
    { setNumber: 7, title: 'Set 7 · Capped Spinners', players: set7 },
    { setNumber: 8, title: 'Set 8 · Uncapped Batters', players: set8 },
    { setNumber: 9, title: 'Set 9 · Uncapped All-Rounders', players: set9 },
    { setNumber: 10, title: 'Set 10 · Uncapped Wicketkeepers', players: set10 },
    { setNumber: 11, title: 'Set 11 · Uncapped Fast Bowlers', players: set11 },
    { setNumber: 12, title: 'Set 12 · Uncapped Spinners & Prospects', players: set12 },
  ];

  return rawSets.filter((s) => s.players.length > 0);
}