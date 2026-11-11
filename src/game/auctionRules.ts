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
  ownerId?: string; // Anonymous UID or device ID
  ownerToken?: string; // Device token stored in localStorage
  purse: number; // in Cr or L
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

export function canTeamAffordBid(team: Team, bidAmount: number, maxSquadSize = 25): boolean {
  if (team.purse < bidAmount) return false;
  const remainingSlots = Math.max(0, maxSquadSize - (team.players.length + 1));
  const minReserveNeeded = remainingSlots * 0.2; // 20L minimum reserve per remaining slot
  return (team.purse - bidAmount) >= minReserveNeeded;
}