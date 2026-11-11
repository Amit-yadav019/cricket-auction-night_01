import {
  doc,
  runTransaction,
  getDoc,
  updateDoc,
  setDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  Player,
  Team,
  AuctionSettings,
  calculateMaxBid,
  calculateNextValidBid,
} from '../game/auctionRules';

export interface RoomData {
  code: string;
  roomCode?: string;
  status: 'lobby' | 'active' | 'paused' | 'round_ended' | 'completed';
  hostUid?: string;
  hostToken?: string;
  hostHeartbeat?: number;
  round: number;
  settings: AuctionSettings;
  teams: Team[] | Record<string, Team>;
  playerPool?: Player[];
  allPlayers?: Player[];
  currentPlayerIndex: number;
  currentLot: {
    player: Player;
    currentBid: number | null;
    leadingTeamId?: string;
    leadingTeamName?: string;
    bidHistory: Array<{
      teamId: string;
      teamName: string;
      amount: number;
      timestamp: number;
    }>;
  } | null;
  lastResult?: {
    type: 'SOLD' | 'UNSOLD';
    playerName: string;
    teamName: string;
    amount: number;
    timestamp: number;
  };
}

// ----------------------------------------------------------------------------
// Token & Code Generators
// ----------------------------------------------------------------------------
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateHostToken(): string {
  return `host_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

export function generateOwnerToken(): string {
  return `owner_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

// ----------------------------------------------------------------------------
// Safe Team Helpers
// ----------------------------------------------------------------------------
function findTeamSafely(rawTeams: any, teamId: string): { team: Team | undefined; index: number | string } {
  if (!rawTeams || !teamId) return { team: undefined, index: -1 };

  if (Array.isArray(rawTeams)) {
    const idx = rawTeams.findIndex((t: Team) => t && (t.id === teamId || t.name === teamId));
    return { team: rawTeams[idx], index: idx };
  }

  if (rawTeams[teamId]) {
    return { team: rawTeams[teamId], index: teamId };
  }

  const entries = Object.entries(rawTeams);
  const found = entries.find(([_, t]: [string, any]) => t && (t.id === teamId || t.name === teamId));
  if (found) {
    return { team: found[1] as Team, index: found[0] };
  }

  return { team: undefined, index: -1 };
}

function resolveRoomCode(passedCode?: string): string {
  if (passedCode && passedCode.trim()) return passedCode.trim();
  const urlParams = new URLSearchParams(window.location.search);
  const fromUrl = urlParams.get('room');
  return fromUrl ? fromUrl.trim() : '';
}

// ----------------------------------------------------------------------------
// Room Lifecycle: Create, Subscribe, Heartbeat
// ----------------------------------------------------------------------------
export async function createAuctionRoom(
  roomCode: string,
  settings: AuctionSettings,
  initialTeams: Team[],
  players: Player[],
  hostToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const roomRef = doc(db, 'rooms', roomCode);
    const roomData: RoomData = {
      code: roomCode,
      roomCode,
      status: 'lobby',
      hostToken,
      hostHeartbeat: Date.now(),
      round: 1,
      settings,
      teams: initialTeams,
      playerPool: players,
      allPlayers: players,
      currentPlayerIndex: 0,
      currentLot: null,
    };
    await setDoc(roomRef, roomData);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to create room.' };
  }
}

export function subscribeToRoom(roomCode: string, onUpdate: (data: RoomData | null) => void) {
  const roomRef = doc(db, 'rooms', roomCode);
  return onSnapshot(
    roomRef,
    (snap) => {
      if (snap.exists()) {
        onUpdate(snap.data() as RoomData);
      } else {
        onUpdate(null);
      }
    },
    (error) => {
      console.error('Room subscription error:', error);
      onUpdate(null);
    }
  );
}

export async function sendHostHeartbeat(roomCode: string, hostToken?: string): Promise<void> {
  const code = resolveRoomCode(roomCode);
  if (!code) return;
  try {
    const roomRef = doc(db, 'rooms', code);
    await updateDoc(roomRef, {
      hostHeartbeat: Date.now(),
    });
  } catch {
    // Silent ignore for heartbeats
  }
}

// ----------------------------------------------------------------------------
// Lobby Actions: Claim, Release, Start
// ----------------------------------------------------------------------------
export async function claimTeamTransaction(
  roomCode: string,
  teamId: string,
  ownerName: string,
  ownerToken: string
): Promise<{ success: boolean; error?: string }> {
  const code = resolveRoomCode(roomCode);
  const roomRef = doc(db, 'rooms', code);
  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');

      const room = snap.data() as RoomData;
      const { team, index } = findTeamSafely(room.teams, teamId);
      if (!team) throw new Error('Team not found');

      let updatedTeams: any;
      if (Array.isArray(room.teams)) {
        updatedTeams = room.teams.map((t) => {
          if (t.id === teamId) {
            return {
              ...t,
              claimedByOwnerName: ownerName,
              ownerToken,
            };
          }
          return t;
        });
      } else {
        updatedTeams = { ...room.teams };
        if (index !== -1) {
          updatedTeams[index] = {
            ...team,
            claimedByOwnerName: ownerName,
            ownerToken,
          };
        }
      }

      transaction.update(roomRef, { teams: updatedTeams });
      return { success: true };
    });
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to claim team.' };
  }
}

// Alias for LobbyView and SquadsView
export const claimTeam = claimTeamTransaction;

export async function releaseTeamTransaction(
  roomCode: string,
  teamId: string,
  ownerToken: string
): Promise<{ success: boolean; error?: string }> {
  const code = resolveRoomCode(roomCode);
  const roomRef = doc(db, 'rooms', code);
  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');

      const room = snap.data() as RoomData;
      let updatedTeams: any;
      if (Array.isArray(room.teams)) {
        updatedTeams = room.teams.map((t) => {
          if (t.id === teamId && (t.ownerToken === ownerToken || !ownerToken)) {
            const { claimedByOwnerName, ownerToken: tok, ...rest } = t;
            return rest as Team;
          }
          return t;
        });
      } else {
        updatedTeams = { ...room.teams };
        const { team, index } = findTeamSafely(room.teams, teamId);
        if (team && index !== -1) {
          const { claimedByOwnerName, ownerToken: tok, ...rest } = team;
          updatedTeams[index] = rest;
        }
      }

      transaction.update(roomRef, { teams: updatedTeams });
      return { success: true };
    });
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to release team.' };
  }
}

// Alias for LobbyView
export const releaseTeam = releaseTeamTransaction;

export async function startBiddingTransaction(
  roomCode: string,
  hostToken?: string
): Promise<{ success: boolean; error?: string }> {
  const code = resolveRoomCode(roomCode);
  const roomRef = doc(db, 'rooms', code);
  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');

      const room = snap.data() as RoomData;
      const pool = room.playerPool || room.allPlayers || [];
      if (pool.length === 0) throw new Error('No players found in room pool.');

      const firstPlayer = pool[0];
      const initialLot = {
        player: firstPlayer,
        currentBid: null,
        bidHistory: [],
      };

      transaction.update(roomRef, {
        status: 'active',
        currentPlayerIndex: 0,
        currentLot: initialLot,
      });

      return { success: true };
    });
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to start bidding.' };
  }
}

// Alias for LobbyView
export const startAuction = startBiddingTransaction;

// ----------------------------------------------------------------------------
// Auction Ring Transactions
// ----------------------------------------------------------------------------
export async function placeBidTransaction(
  roomCodeInput: string,
  teamId: string,
  bidAmount: number,
  multiplier: number,
  expectedCurrentBid: number | null,
  expectedPlayerId: string,
  hostToken?: string
): Promise<{ success: boolean; error?: string }> {
  const roomCode = resolveRoomCode(roomCodeInput);

  if (!roomCode) {
    return { success: false, error: 'Room code could not be determined.' };
  }
  if (!teamId) {
    return { success: false, error: 'Please choose or claim a team to bid.' };
  }

  const roomRef = doc(db, 'rooms', roomCode);

  try {
    const result = await runTransaction(db, async (transaction) => {
      const roomSnap = await transaction.get(roomRef);
      if (!roomSnap.exists()) {
        throw new Error(`Room "${roomCode}" not found in database.`);
      }

      const room = roomSnap.data() as RoomData;

      if (room.status !== 'active') {
        throw new Error('Auction is not currently accepting bids.');
      }

      const lot = room.currentLot;
      if (!lot || !lot.player) {
        throw new Error('No active player on the podium.');
      }

      const { team: biddingTeam } = findTeamSafely(room.teams, teamId);
      if (!biddingTeam) {
        throw new Error(`Team could not be found.`);
      }

      const maxSquad = room.settings?.maxSquadSize || room.settings?.squadSize || 25;
      const currentSquadCount = biddingTeam.players?.length || 0;
      if (currentSquadCount >= maxSquad) {
        throw new Error(`${biddingTeam.name} squad is already full.`);
      }

      const minRequired =
        lot.currentBid === null
          ? lot.player.basePrice
          : calculateNextValidBid(lot.currentBid, lot.player.basePrice);

      if (bidAmount < minRequired) {
        throw new Error(`Bid must be at least ₹${minRequired} Cr.`);
      }

      if (bidAmount > biddingTeam.purse) {
        throw new Error(`Insufficient purse balance (₹${biddingTeam.purse} Cr available).`);
      }

      const bidRecord = {
        teamId: biddingTeam.id,
        teamName: biddingTeam.name,
        amount: Number(bidAmount.toFixed(2)),
        timestamp: Date.now(),
      };

      const existingHistory = Array.isArray(lot.bidHistory) ? lot.bidHistory : [];
      const updatedBidHistory = [bidRecord, ...existingHistory].slice(0, 20);

      transaction.update(roomRef, {
        'currentLot.currentBid': Number(bidAmount.toFixed(2)),
        'currentLot.leadingTeamId': biddingTeam.id,
        'currentLot.leadingTeamName': biddingTeam.name,
        'currentLot.bidHistory': updatedBidHistory,
      });

      return { success: true };
    });

    return result;
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Bid could not be placed.',
    };
  }
}

export async function markSoldTransaction(
  roomCodeInput: string,
  hostToken: string
): Promise<{ success: boolean; error?: string }> {
  const roomCode = resolveRoomCode(roomCodeInput);
  const roomRef = doc(db, 'rooms', roomCode);

  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');

      const room = snap.data() as RoomData;
      const lot = room.currentLot;

      if (!lot || lot.currentBid === null || !lot.leadingTeamId) {
        throw new Error('Cannot mark sold without an active leading bid.');
      }

      const winningTeamId = lot.leadingTeamId;
      const winningAmount = lot.currentBid;
      const soldPlayer: Player = {
        ...lot.player,
        status: 'sold',
        soldPrice: winningAmount,
        soldToTeamId: winningTeamId,
      };

      let updatedTeams: any;
      if (Array.isArray(room.teams)) {
        updatedTeams = room.teams.map((t) => {
          if (t && t.id === winningTeamId) {
            return {
              ...t,
              purse: Number((t.purse - winningAmount).toFixed(2)),
              spent: Number(((t.spent || 0) + winningAmount).toFixed(2)),
              players: [...(t.players || []), soldPlayer],
            };
          }
          return t;
        });
      } else {
        updatedTeams = { ...room.teams };
        const { team: t, index: key } = findTeamSafely(room.teams, winningTeamId);
        if (t && key !== -1) {
          updatedTeams[key] = {
            ...t,
            purse: Number((t.purse - winningAmount).toFixed(2)),
            spent: Number(((t.spent || 0) + winningAmount).toFixed(2)),
            players: [...(t.players || []), soldPlayer],
          };
        }
      }

      const nextIndex = (room.currentPlayerIndex || 0) + 1;
      const pool = room.playerPool || room.allPlayers || [];
      const hasNext = nextIndex < pool.length;

      const nextLot = hasNext
        ? {
            player: pool[nextIndex],
            currentBid: null,
            bidHistory: [],
          }
        : null;

      transaction.update(roomRef, {
        teams: updatedTeams,
        currentPlayerIndex: nextIndex,
        currentLot: nextLot,
        status: hasNext ? 'active' : 'round_ended',
        lastResult: {
          type: 'SOLD',
          playerName: soldPlayer.name,
          teamName: lot.leadingTeamName || 'Unknown Team',
          amount: winningAmount,
          timestamp: Date.now(),
        },
      });

      return { success: true };
    });
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to mark player as sold.' };
  }
}

export async function markUnsoldTransaction(
  roomCodeInput: string,
  hostToken: string
): Promise<{ success: boolean; error?: string }> {
  const roomCode = resolveRoomCode(roomCodeInput);
  const roomRef = doc(db, 'rooms', roomCode);

  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');

      const room = snap.data() as RoomData;
      const lot = room.currentLot;
      if (!lot) throw new Error('No lot currently active');

      const unsoldPlayer: Player = {
        ...lot.player,
        status: 'unsold',
      };

      const nextIndex = (room.currentPlayerIndex || 0) + 1;
      const pool = room.playerPool || room.allPlayers || [];
      const hasNext = nextIndex < pool.length;

      const nextLot = hasNext
        ? {
            player: pool[nextIndex],
            currentBid: null,
            bidHistory: [],
          }
        : null;

      transaction.update(roomRef, {
        currentPlayerIndex: nextIndex,
        currentLot: nextLot,
        status: hasNext ? 'active' : 'round_ended',
        lastResult: {
          type: 'UNSOLD',
          playerName: unsoldPlayer.name,
          teamName: '',
          amount: 0,
          timestamp: Date.now(),
        },
      });

      return { success: true };
    });
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to mark player as unsold.' };
  }
}

export async function undoLastBidTransaction(
  roomCodeInput: string,
  hostToken: string
): Promise<{ success: boolean; error?: string }> {
  const roomCode = resolveRoomCode(roomCodeInput);
  const roomRef = doc(db, 'rooms', roomCode);

  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');

      const room = snap.data() as RoomData;
      const lot = room.currentLot;
      if (!lot || !lot.bidHistory || lot.bidHistory.length === 0) {
        throw new Error('No bids placed to undo on this lot.');
      }

      const newHistory = lot.bidHistory.slice(1);
      const previousBid = newHistory.length > 0 ? newHistory[0] : null;

      transaction.update(roomRef, {
        'currentLot.currentBid': previousBid ? previousBid.amount : null,
        'currentLot.leadingTeamId': previousBid ? previousBid.teamId : null,
        'currentLot.leadingTeamName': previousBid ? previousBid.teamName : null,
        'currentLot.bidHistory': newHistory,
      });

      return { success: true };
    });
  } catch (err: any) {
    return { success: false, error: err?.message || 'Undo bid failed.' };
  }
}

export async function reAuctionUnsoldTransaction(
  roomCodeInput: string,
  hostToken: string
): Promise<{ success: boolean; error?: string }> {
  const roomCode = resolveRoomCode(roomCodeInput);
  const roomRef = doc(db, 'rooms', roomCode);

  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return { success: false, error: 'Room not found' };

    const room = snap.data() as RoomData;
    const pool = room.playerPool || room.allPlayers || [];
    const unsold = pool.filter((p) => p.status === 'unsold');

    if (unsold.length === 0) {
      return { success: false, error: 'No unsold players left to re-auction.' };
    }

    const resetUnsold = unsold.map((p) => ({ ...p, status: 'pending' as const }));

    await updateDoc(roomRef, {
      playerPool: resetUnsold,
      currentPlayerIndex: 0,
      round: (room.round || 1) + 1,
      status: 'active',
      currentLot: {
        player: resetUnsold[0],
        currentBid: null,
        bidHistory: [],
      },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to re-auction unsold players.' };
  }
}

export async function endAuctionTransaction(
  roomCodeInput: string,
  hostToken: string
): Promise<{ success: boolean; error?: string }> {
  const roomCode = resolveRoomCode(roomCodeInput);
  const roomRef = doc(db, 'rooms', roomCode);
  try {
    await updateDoc(roomRef, {
      status: 'completed',
      currentLot: null,
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to conclude auction.' };
  }
}

export async function resetAuctionTransaction(
  roomCodeInput: string,
  hostToken?: string
): Promise<{ success: boolean; error?: string }> {
  const roomCode = resolveRoomCode(roomCodeInput);
  const roomRef = doc(db, 'rooms', roomCode);
  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) throw new Error('Room not found');

    const room = snap.data() as RoomData;
    const all = (room.allPlayers || []).map((p) => ({ ...p, status: 'pending' as const, soldPrice: undefined, soldToTeamId: undefined }));

    let resetTeams: any;
    if (Array.isArray(room.teams)) {
      resetTeams = room.teams.map((t) => ({
        ...t,
        purse: room.settings?.pursePerTeam || 20,
        spent: 0,
        players: [],
      }));
    } else {
      resetTeams = {};
      Object.entries(room.teams || {}).forEach(([k, t]) => {
        resetTeams[k] = {
          ...t,
          purse: room.settings?.pursePerTeam || 20,
          spent: 0,
          players: [],
        };
      });
    }

    await updateDoc(roomRef, {
      status: 'lobby',
      round: 1,
      currentPlayerIndex: 0,
      currentLot: null,
      lastResult: null,
      playerPool: all,
      teams: resetTeams,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to reset auction.' };
  }
}