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

export function calculateNextValidBid(currentBid: number, basePrice: number, rules = DEFAULT_INCREMENT_RULES): number {
  if (currentBid <= 0) {
    return basePrice;
  }
  const inc = getNextBidIncrement(currentBid, rules);
  return Number((currentBid + inc).toFixed(2));
}

export function getValidNextBids(currentBid: number, basePrice: number, count = 3, rules = DEFAULT_INCREMENT_RULES): number[] {
  const bids: number[] = [];
  let next = calculateNextValidBid(currentBid, basePrice, rules);
  for (let i = 0; i < count; i++) {
    bids.push(next);
    next = Number((next + getNextBidIncrement(next, rules)).toFixed(2));
  }
  return bids;
}

export function calculateMaxBid(team: Team, maxSquadSize = 25, reservePerSlot = 0.2): number {
  const remainingSlots = Math.max(0, maxSquadSize - (team.players.length + 1));
  const reserveNeeded = remainingSlots * reservePerSlot;
  return Math.max(0, Number((team.purse - reserveNeeded).toFixed(2)));
}

export function canTeamAffordBid(team: Team, bidAmount: number, maxSquadSize = 25): boolean {
  return calculateMaxBid(team, maxSquadSize) >= bidAmount;
}

export function validateBid(
  room: AuctionRoomState,
  teamId: string,
  amount: number
): { valid: boolean; reason?: string } {
  const team = room.teams[teamId];
  if (!team) {
    return { valid: false, reason: 'Team not found' };
  }

  if (room.status !== 'active') {
    return { valid: false, reason: 'Auction is not active' };
  }

  if (team.players.length >= room.maxSquadSize) {
    return { valid: false, reason: 'Squad limit reached' };
  }

  const currentPlayer = room.playerPool[room.currentPlayerIndex];
  if (!currentPlayer) {
    return { valid: false, reason: 'No player currently on auction' };
  }

  const minBid = room.currentBid <= 0 ? currentPlayer.basePrice : calculateNextValidBid(room.currentBid, currentPlayer.basePrice);
  if (amount < minBid) {
    return { valid: false, reason: `Bid must be at least ₹${minBid} Cr` };
  }

  if (!canTeamAffordBid(team, amount, room.maxSquadSize)) {
    return { valid: false, reason: 'Insufficient purse balance after reserve requirements' };
  }

  return { valid: true };
}

export function isAuctionComplete(room: AuctionRoomState): boolean {
  if (room.status === 'completed') return true;
  if (!room.playerPool || room.playerPool.length === 0) return true;
  return room.currentPlayerIndex >= room.playerPool.length;
}

export function parseCustomPlayers(csvOrText: string): Player[] {
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

  // If minimum guarantees caused over-allocation, decrement largest surplus
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