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

  const ratios = {
    BAT: Math.round(totalCount * 0.32),
    BOWL: Math.round(totalCount * 0.34),
    AR: Math.round(totalCount * 0.22),
    WK: Math.max(1, totalCount - Math.round(totalCount * 0.32) - Math.round(totalCount * 0.34) - Math.round(totalCount * 0.22)),
  };

  const selected: Player[] = [];
  (Object.keys(byRole) as PlayerRole[]).forEach((role) => {
    const shuffled = shuffle(byRole[role]);
    selected.push(...shuffled.slice(0, ratios[role]));
  });

  if (selected.length < totalCount) {
    const remaining = pool.filter((p) => !selected.some((s) => s.id === p.id));
    selected.push(...shuffle(remaining).slice(0, totalCount - selected.length));
  }

  return selected.slice(0, totalCount);
}