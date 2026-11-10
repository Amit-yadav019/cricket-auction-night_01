/**
 * Pure auction logic and validation rules for Cricket Auction Night.
 * Decoupled from React and Firebase for unit testing and deterministic simulation.
 */

export type PlayerRole = 'BAT' | 'WK' | 'AR' | 'BOWL';

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
  teamName: string;
  amount: number;
  timestamp: number;
  raiseMultiplier: number; // 0 for base, 1, 2, or 4
}

export interface CurrentLot {
  playerIndex: number;
  player: Player;
  currentBid: number | null; // null if no bids yet
  leadingTeamId: string | null;
  leadingTeamName: string | null;
  bidHistory: BidHistoryItem[];
  startedAt: number;
}

export interface AuctionSettings {
  pursePerTeam: number; // default 20
  purseUnit: 'Cr' | 'L'; // default 'Cr'
  minSquadSize: number; // e.g. 3 (range from min to max)
  maxSquadSize: number; // e.g. 5 or 6 (allowed 3 to 15)
  squadSize: number; // max squad size alias
  bidStep: number; // default 0.5
  shuffleOrder: boolean;
  selectedPlayerIds: string[];
  poolVisibility: 'public' | 'hidden'; // whether upcoming player pool list is visible to owners or hidden (secret)
}

export interface BidValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Rounds any number to the nearest allowed base price: 0.5, 1, 1.5, or 2.
 */
export function roundToBasePrice(value: number): BasePrice {
  let closest: BasePrice = ALLOWED_BASE_PRICES[0];
  let minDiff = Math.abs(value - closest);

  for (const bp of ALLOWED_BASE_PRICES) {
    const diff = Math.abs(value - bp);
    if (diff < minDiff) {
      minDiff = diff;
      closest = bp;
    }
  }
  return closest;
}

/**
 * Calculates max allowed bid for a team:
 * If squad has range [minSquadSize, maxSquadSize]:
 * - If team has not reached minSquadSize yet, they must reserve budget for required remaining slots:
 *   maxBid = purse - (mandatorySlotsLeft - 1) * lowestBasePrice
 * - Once a team reaches minSquadSize, they have satisfied the roster minimum and can spend up to
 *   their full remaining purse on optional slots up to maxSquadSize.
 * - If teamPlayerCount >= maxSquadSize, squad is full (maxBid = 0).
 */
export function calculateMaxBid(
  teamPurse: number,
  teamPlayerCount: number,
  maxSquadSize: number,
  lowestBasePrice: number,
  minSquadSize?: number
): number {
  const minSlots = minSquadSize ?? maxSquadSize;

  if (teamPlayerCount >= maxSquadSize) return 0;

  if (teamPlayerCount < minSlots) {
    const mandatorySlotsLeft = minSlots - teamPlayerCount;
    if (mandatorySlotsLeft <= 1) {
      return Math.max(0, teamPurse);
    }
    const reserve = (mandatorySlotsLeft - 1) * lowestBasePrice;
    const maxBid = teamPurse - reserve;
    return Math.max(0, Number(maxBid.toFixed(2)));
  }

  // Minimum squad size satisfied, full purse available for extra slots up to maxSquadSize
  return Math.max(0, Number(teamPurse.toFixed(2)));
}

/**
 * Gets valid next bid amounts for a player.
 * First bid must equal basePrice.
 * Subsequent bids must raise by 1x, 2x, or 4x the bidStep.
 */
export function getValidNextBids(
  currentBid: number | null,
  basePrice: number,
  bidStep: number
): { multiplier: number; amount: number }[] {
  if (currentBid === null) {
    return [{ multiplier: 0, amount: Number(basePrice.toFixed(2)) }];
  }

  return [1, 2, 4].map((mult) => ({
    multiplier: mult,
    amount: Number((currentBid + mult * bidStep).toFixed(2)),
  }));
}

/**
 * Validates a proposed bid against all auction rules.
 */
export function validateBid(params: {
  teamId: string;
  teamPurse: number;
  teamPlayerCount: number;
  maxSquadSize: number;
  minSquadSize?: number;
  lowestBasePrice: number;
  currentBid: number | null;
  leadingTeamId: string | null;
  basePrice: number;
  bidStep: number;
  proposedAmount: number;
  currentPlayerId: string;
  targetPlayerId: string;
}): BidValidationResult {
  const {
    teamId,
    teamPurse,
    teamPlayerCount,
    maxSquadSize,
    minSquadSize,
    lowestBasePrice,
    currentBid,
    leadingTeamId,
    basePrice,
    bidStep,
    proposedAmount,
    currentPlayerId,
    targetPlayerId,
  } = params;

  // 1. Stale player check
  if (currentPlayerId !== targetPlayerId) {
    return { valid: false, reason: 'This player is no longer active.' };
  }

  // 2. Squad full check (against max squad size)
  if (teamPlayerCount >= maxSquadSize) {
    return { valid: false, reason: 'Your squad is already full.' };
  }

  // 3. Leading team check
  if (leadingTeamId === teamId) {
    return { valid: false, reason: 'Your team is already leading the bid.' };
  }

  // 4. Validate bid increment
  const validNextBids = getValidNextBids(currentBid, basePrice, bidStep);
  const isValidAmount = validNextBids.some(
    (b) => Math.abs(b.amount - proposedAmount) < 0.001
  );

  if (!isValidAmount) {
    return {
      valid: false,
      reason:
        currentBid === null
          ? `First bid must be exactly base price (${basePrice}).`
          : `Bid must raise by 1x, 2x, or 4x the bid step (+${bidStep}, +${2 * bidStep}, or +${4 * bidStep}).`,
    };
  }

  // 5. Affordability and MaxBid rule
  const maxBid = calculateMaxBid(
    teamPurse,
    teamPlayerCount,
    maxSquadSize,
    lowestBasePrice,
    minSquadSize
  );

  if (proposedAmount > maxBid) {
    return {
      valid: false,
      reason: `Cannot afford. Max allowed bid is ₹${maxBid} to save minimum purse for remaining slots.`,
    };
  }

  if (proposedAmount > teamPurse) {
    return { valid: false, reason: 'Insufficient purse balance.' };
  }

  return { valid: true };
}

/**
 * Parses user-provided custom players text.
 * Format: "Name, ROLE, base" (one per line)
 * Invalid roles are skipped. Base prices rounded to nearest 0.5, 1, 1.5, or 2.
 */
export function parseCustomPlayers(text: string): Player[] {
  const lines = text.split('\n');
  const result: Player[] = [];
  const validRoles: PlayerRole[] = ['BAT', 'WK', 'AR', 'BOWL'];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 2) continue;

    const name = parts[0];
    const roleUpper = parts[1].toUpperCase() as PlayerRole;
    if (!validRoles.includes(roleUpper)) {
      continue;
    }

    let rawBase = 1;
    if (parts.length >= 3) {
      const parsed = parseFloat(parts[2]);
      if (!isNaN(parsed)) {
        rawBase = parsed;
      }
    }

    const basePrice = roundToBasePrice(rawBase);
    result.push({
      id: `custom_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`,
      name,
      role: roleUpper,
      basePrice,
      status: 'pending',
    });
  }

  return result;
}

/**
 * Picks random N players according to each pool, guaranteeing at least
 * minPerPool (e.g. at least 2 BAT, 2 WK, 2 AR, 2 BOWL) in the picked pool,
 * and evenly distributing the remaining slots.
 */
export function pickRandomBalanced(
  allPlayers: Player[],
  count: number,
  minPerPool: number = 2
): string[] {
  const roles: PlayerRole[] = ['BAT', 'WK', 'AR', 'BOWL'];
  const playersByRole: Record<PlayerRole, Player[]> = {
    BAT: [],
    WK: [],
    AR: [],
    BOWL: [],
  };

  for (const p of allPlayers) {
    playersByRole[p.role].push(p);
  }

  // Shuffle each role pool
  for (const r of roles) {
    playersByRole[r] = [...playersByRole[r]].sort(() => Math.random() - 0.5);
  }

  const selectedIds = new Set<string>();
  const roleCounters: Record<PlayerRole, number> = {
    BAT: 0,
    WK: 0,
    AR: 0,
    BOWL: 0,
  };

  // Phase 1: Guarantee minimum minPerPool players from each pool (e.g. 2 of each)
  for (const r of roles) {
    const needed = Math.min(minPerPool, playersByRole[r].length);
    for (let i = 0; i < needed && selectedIds.size < count; i++) {
      const p = playersByRole[r][i];
      selectedIds.add(p.id);
      roleCounters[r]++;
    }
  }

  // Phase 2: Round-robin fill remaining count evenly across the 4 pools
  let roleIdx = 0;
  while (selectedIds.size < count) {
    let addedAny = false;
    for (let i = 0; i < 4 && selectedIds.size < count; i++) {
      const role = roles[(roleIdx + i) % 4];
      const list = playersByRole[role];
      const ptr = roleCounters[role];
      if (ptr < list.length) {
        selectedIds.add(list[ptr].id);
        roleCounters[role]++;
        addedAny = true;
      }
    }
    roleIdx = (roleIdx + 1) % 4;
    if (!addedAny) break;
  }

  return Array.from(selectedIds);
}

/**
 * Checks if the auction has ended naturally:
 * - All teams have filled up to maxSquadSize, OR
 * - All teams reached at least minSquadSize and no players remain in the pool.
 */
export function isAuctionComplete(
  teams: Team[],
  maxSquadSize: number,
  remainingPlayersCount: number,
  minSquadSize?: number
): boolean {
  if (teams.length === 0) return false;
  const allSquadsMaxed = teams.every((t) => t.players.length >= maxSquadSize);
  if (allSquadsMaxed) return true;

  if (remainingPlayersCount <= 0) {
    return true;
  }

  return false;
}
