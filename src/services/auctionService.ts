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
  teams: Team[];
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

// Strictly removes all undefined keys so Firestore never crashes
function cleanData<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function normalizeTeamsArray(rawTeams: any): Team[] {
  if (!rawTeams) return [];

  const list = Array.isArray(rawTeams) ? rawTeams : Object.values(rawTeams);

  return list
    .filter(Boolean)
    .map((t: any, idx: number) => {
      const cleanTeam: any = {
        id: String(t.id || t.shortName || `team_${idx}`),
        name: String(t.name || t.teamName || 'Team'),
        shortName: String(t.shortName || (t.name ? t.name.slice(0, 3).toUpperCase() : 'TM')),
        purse: Number(t.purse ?? 20),
        spent: Number(t.spent ?? 0),
        players: Array.isArray(t.players) ? t.players : [],
      };
      if (t.claimedByOwnerName) cleanTeam.claimedByOwnerName = String(t.claimedByOwnerName);
      if (t.ownerToken) cleanTeam.ownerToken = String(t.ownerToken);
      return cleanTeam as Team;
    });
}

function resolveRoomCode(passedCode?: string): string {
  if (passedCode && passedCode.trim()) return passedCode.trim();
  const urlParams = new URLSearchParams(window.location.search);
  const fromUrl = urlParams.get('room');
  return fromUrl ? fromUrl.trim() : '';
}

export async function createAuctionRoom(
  roomCode: string,
  settings: AuctionSettings,
  initialTeams: Team[],
  players: Player[],
  hostToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const roomRef = doc(db, 'rooms', roomCode);
    const roomData = cleanData({
      code: roomCode,
      roomCode,
      status: 'lobby',
      hostToken,
      hostHeartbeat: Date.now(),
      round: 1,
      settings: settings || { pursePerTeam: 20, purseUnit: 'Cr', minSquadSize: 15, maxSquadSize: 25, bidStep: 0.5 },
      teams: normalizeTeamsArray(initialTeams),
      playerPool: players || [],
      allPlayers: players || [],
      currentPlayerIndex: 0,
      currentLot: null,
    });

    await setDoc(roomRef, roomData);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to create room.' };
  }
}

export function subscribeToRoom(roomCode: string, onUpdate: (data: RoomData | null) => void) {
  const code = resolveRoomCode(roomCode);
  if (!code) return () => {};

  const roomRef = doc(db, 'rooms', code);
  return onSnapshot(
    roomRef,
    (snap) => {
      if (snap.exists()) {
        const raw = snap.data();
        const data: RoomData = {
          ...(raw as any),
          teams: normalizeTeamsArray(raw?.teams),
        };
        onUpdate(data);
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
    // Ignore
  }
}

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

      const room = snap.data() as any;
      const normalized = normalizeTeamsArray(room.teams);
      const teamIdx = normalized.findIndex(
        (t) => t.id === teamId || t.name === teamId || t.shortName === teamId
      );

      if (teamIdx === -1) {
        throw new Error('Team not found');
      }

      normalized[teamIdx].claimedByOwnerName = ownerName;
      normalized[teamIdx].ownerToken = ownerToken;

      transaction.update(roomRef, {
        teams: cleanData(normalized),
      });
      return { success: true };
    });
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to claim team.' };
  }
}

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

      const room = snap.data() as any;
      const normalized = normalizeTeamsArray(room.teams);
      const teamIdx = normalized.findIndex(
        (t) => t.id === teamId || t.name === teamId || t.shortName === teamId
      );

      if (teamIdx === -1) throw new Error('Team not found');

      delete (normalized[teamIdx] as any).claimedByOwnerName;
      delete (normalized[teamIdx] as any).ownerToken;

      transaction.update(roomRef, {
        teams: cleanData(normalized),
      });
      return { success: true };
    });
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to release team.' };
  }
}

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

      const room = snap.data() as any;
      const pool = room.playerPool || room.allPlayers || [];
      if (pool.length === 0) throw new Error('No players found in room pool.');

      const firstPlayer = pool[0];
      const initialLot = {
        player: firstPlayer,
        currentBid: null,
        bidHistory: [],
      };

      transaction.update(roomRef, cleanData({
        status: 'active',
        currentPlayerIndex: 0,
        currentLot: initialLot,
      }));

      return { success: true };
    });
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to start bidding.' };
  }
}

export const startAuction = startBiddingTransaction;

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
  if (!roomCode) return { success: false, error: 'Room code not found.' };

  const roomRef = doc(db, 'rooms', roomCode);

  try {
    return await runTransaction(db, async (transaction) => {
      const roomSnap = await transaction.get(roomRef);
      if (!roomSnap.exists()) throw new Error(`Room not found.`);

      const room = roomSnap.data() as any;
      if (room.status !== 'active') throw new Error('Auction is not active.');

      const lot = room.currentLot;
      if (!lot || !lot.player) throw new Error('No active player.');

      const teams = normalizeTeamsArray(room.teams);
      const biddingTeam = teams.find(
        (t) => t.id === teamId || t.name === teamId || t.shortName === teamId
      );

      if (!biddingTeam) throw new Error('Team not found.');

      const maxSquad = room.settings?.maxSquadSize || room.settings?.squadSize || 25;
      if ((biddingTeam.players?.length || 0) >= maxSquad) {
        throw new Error(`${biddingTeam.name} squad is full.`);
      }

      const minRequired =
        lot.currentBid === null
          ? lot.player.basePrice
          : calculateNextValidBid(lot.currentBid, lot.player.basePrice);

      if (bidAmount < minRequired) {
        throw new Error(`Bid must be at least ₹${minRequired} Cr.`);
      }

      if (bidAmount > biddingTeam.purse) {
        throw new Error(`Insufficient purse.`);
      }

      const bidRecord = {
        teamId: biddingTeam.id,
        teamName: biddingTeam.name,
        amount: Number(bidAmount.toFixed(2)),
        timestamp: Date.now(),
      };

      const updatedBidHistory = [bidRecord, ...(lot.bidHistory || [])].slice(0, 20);

      transaction.update(roomRef, cleanData({
        'currentLot.currentBid': Number(bidAmount.toFixed(2)),
        'currentLot.leadingTeamId': biddingTeam.id,
        'currentLot.leadingTeamName': biddingTeam.name,
        'currentLot.bidHistory': updatedBidHistory,
      }));

      return { success: true };
    });
  } catch (error: any) {
    return { success: false, error: error?.message || 'Bid failed.' };
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

      const room = snap.data() as any;
      const lot = room.currentLot;
      if (!lot || lot.currentBid === null || !lot.leadingTeamId) {
        throw new Error('No leading bid.');
      }

      const winningTeamId = lot.leadingTeamId;
      const winningAmount = lot.currentBid;
      const soldPlayer: Player = {
        ...lot.player,
        status: 'sold',
        soldPrice: winningAmount,
        soldToTeamId: winningTeamId,
      };

      const teams = normalizeTeamsArray(room.teams);
      const updatedTeams = teams.map((t) => {
        if (t.id === winningTeamId || t.name === winningTeamId || t.shortName === winningTeamId) {
          return {
            ...t,
            purse: Number((t.purse - winningAmount).toFixed(2)),
            spent: Number(((t.spent || 0) + winningAmount).toFixed(2)),
            players: [...(t.players || []), soldPlayer],
          };
        }
        return t;
      });

      const pool: Player[] = room.playerPool || room.allPlayers || [];
      const currentIndex = room.currentPlayerIndex || 0;

      // Update sold player status across playerPool and allPlayers
      const updatedPool = pool.map((p, idx) =>
        idx === currentIndex || p.id === soldPlayer.id ? soldPlayer : p
      );
      const updatedAllPlayers = (room.allPlayers || pool).map((p: Player) =>
        p.id === soldPlayer.id ? soldPlayer : p
      );

      const nextIndex = currentIndex + 1;
      const hasNext = nextIndex < updatedPool.length;

      transaction.update(roomRef, cleanData({
        teams: updatedTeams,
        playerPool: updatedPool,
        allPlayers: updatedAllPlayers,
        currentPlayerIndex: nextIndex,
        currentLot: hasNext ? { player: updatedPool[nextIndex], currentBid: null, bidHistory: [] } : null,
        status: hasNext ? 'active' : 'round_ended',
        lastResult: {
          type: 'SOLD',
          playerName: soldPlayer.name,
          teamName: lot.leadingTeamName || 'Unknown Team',
          amount: winningAmount,
          timestamp: Date.now(),
        },
      }));

      return { success: true };
    });
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to mark sold.' };
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

      const room = snap.data() as any;
      const lot = room.currentLot;
      if (!lot || !lot.player) throw new Error('No active lot');

      const pool: Player[] = room.playerPool || room.allPlayers || [];
      const currentIndex = room.currentPlayerIndex || 0;
      const currentUnsoldPlayer: Player = { ...lot.player, status: 'unsold' };

      // Crucial: Update player with status 'unsold' in the pool arrays
      const updatedPool = pool.map((p, idx) =>
        idx === currentIndex || p.id === currentUnsoldPlayer.id ? currentUnsoldPlayer : p
      );
      const updatedAllPlayers = (room.allPlayers || pool).map((p: Player) =>
        p.id === currentUnsoldPlayer.id ? currentUnsoldPlayer : p
      );

      const nextIndex = currentIndex + 1;
      const hasNext = nextIndex < updatedPool.length;

      transaction.update(roomRef, cleanData({
        playerPool: updatedPool,
        allPlayers: updatedAllPlayers,
        currentPlayerIndex: nextIndex,
        currentLot: hasNext ? { player: updatedPool[nextIndex], currentBid: null, bidHistory: [] } : null,
        status: hasNext ? 'active' : 'round_ended',
        lastResult: {
          type: 'UNSOLD',
          playerName: currentUnsoldPlayer.name,
          teamName: '',
          amount: 0,
          timestamp: Date.now(),
        },
      }));

      return { success: true };
    });
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to mark unsold.' };
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

      const room = snap.data() as any;
      const lot = room.currentLot;
      if (!lot || !lot.bidHistory || lot.bidHistory.length === 0) {
        throw new Error('No bids to undo.');
      }

      const newHistory = lot.bidHistory.slice(1);
      const previousBid = newHistory.length > 0 ? newHistory[0] : null;

      transaction.update(roomRef, cleanData({
        'currentLot.currentBid': previousBid ? previousBid.amount : null,
        'currentLot.leadingTeamId': previousBid ? previousBid.teamId : null,
        'currentLot.leadingTeamName': previousBid ? previousBid.teamName : null,
        'currentLot.bidHistory': newHistory,
      }));

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

    const room = snap.data() as any;
    const pool: Player[] = room.playerPool || room.allPlayers || [];

    // Filter all players that hold unsold status
    const unsold = pool.filter((p: Player) => p.status === 'unsold');

    if (unsold.length === 0) {
      return { success: false, error: 'No unsold players left to re-auction.' };
    }

    // Reset unsold players to pending for the new round
    const resetUnsold = unsold.map((p: Player) => ({
      ...p,
      status: 'pending' as const,
      soldPrice: undefined,
      soldToTeamId: undefined,
    }));

    await updateDoc(roomRef, cleanData({
      playerPool: resetUnsold,
      currentPlayerIndex: 0,
      round: (room.round || 1) + 1,
      status: 'active',
      currentLot: {
        player: resetUnsold[0],
        currentBid: null,
        bidHistory: [],
      },
      lastResult: null,
    }));

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to re-auction unsold.' };
  }
}

export async function endAuctionTransaction(
  roomCodeInput: string,
  hostToken: string
): Promise<{ success: boolean; error?: string }> {
  const roomCode = resolveRoomCode(roomCodeInput);
  const roomRef = doc(db, 'rooms', roomCode);
  try {
    await updateDoc(roomRef, cleanData({
      status: 'completed',
      currentLot: null,
    }));
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to end auction.' };
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

    const room = snap.data() as any;
    const all = (room.allPlayers || []).map((p: Player) => ({
      ...p,
      status: 'pending' as const,
      soldPrice: undefined,
      soldToTeamId: undefined,
    }));

    const rawTeams = normalizeTeamsArray(room.teams);
    const resetTeams = rawTeams.map((t) => ({
      ...t,
      purse: room.settings?.pursePerTeam || 20,
      spent: 0,
      players: [],
    }));

    await updateDoc(roomRef, cleanData({
      status: 'lobby',
      round: 1,
      currentPlayerIndex: 0,
      currentLot: null,
      lastResult: null,
      playerPool: all,
      teams: resetTeams,
      lineups: {},
      masterScoutReport: null,
    }));

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to reset auction.' };
  }
}

export async function submitTeamLineupTransaction(
  roomCodeInput: string,
  teamId: string,
  playingIds: string[],
  benchIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const roomCode = resolveRoomCode(roomCodeInput);
  const roomRef = doc(db, 'rooms', roomCode);

  try {
    await updateDoc(roomRef, {
      [`lineups.${teamId}`]: {
        playingIds,
        benchIds,
        updatedAt: Date.now(),
      },
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to submit lineup.' };
  }
}

export async function saveMasterScoutReport(
  roomCodeInput: string,
  report: any
): Promise<{ success: boolean; error?: string }> {
  const roomCode = resolveRoomCode(roomCodeInput);
  const roomRef = doc(db, 'rooms', roomCode);

  try {
    await updateDoc(roomRef, {
      masterScoutReport: report,
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save scout report.' };
  }
}

export interface TradeProposal {
  id: string;
  senderTeamId: string;
  senderTeamName: string;
  senderPlayer: Player;
  receiverTeamId: string;
  receiverTeamName: string;
  receiverPlayer: Player;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt: number;
}

export async function proposeTradeTransaction(
  roomCodeInput: string,
  senderTeam: Team,
  senderPlayer: Player,
  receiverTeam: Team,
  receiverPlayer: Player
): Promise<{ success: boolean; error?: string }> {
  const roomCode = resolveRoomCode(roomCodeInput);
  const roomRef = doc(db, 'rooms', roomCode);

  try {
    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const tradeItem: TradeProposal = {
      id: tradeId,
      senderTeamId: senderTeam.id,
      senderTeamName: senderTeam.name,
      senderPlayer,
      receiverTeamId: receiverTeam.id,
      receiverTeamName: receiverTeam.name,
      receiverPlayer,
      status: 'pending',
      createdAt: Date.now(),
    };

    await updateDoc(roomRef, {
      [`trades.${tradeId}`]: tradeItem,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to send trade proposal.' };
  }
}

export async function respondTradeTransaction(
  roomCodeInput: string,
  tradeId: string,
  accept: boolean
): Promise<{ success: boolean; error?: string }> {
  const roomCode = resolveRoomCode(roomCodeInput);
  const roomRef = doc(db, 'rooms', roomCode);

  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');

      const room = snap.data() as any;
      const trade: TradeProposal = room?.trades?.[tradeId];
      if (!trade || trade.status !== 'pending') {
        throw new Error('Trade proposal is no longer active.');
      }

      if (!accept) {
        transaction.update(roomRef, {
          [`trades.${tradeId}.status`]: 'declined',
        });
        return { success: true };
      }

      // Mutual acceptance: Atomically swap players between both teams
      const rawTeams = normalizeTeamsArray(room.teams);
      const teamA = rawTeams.find((t) => t.id === trade.senderTeamId);
      const teamB = rawTeams.find((t) => t.id === trade.receiverTeamId);

      if (!teamA || !teamB) throw new Error('One of the trading teams was not found.');

      // Check if both players still belong to their respective teams
      const hasPlayerA = teamA.players.some((p) => p.id === trade.senderPlayer.id);
      const hasPlayerB = teamB.players.some((p) => p.id === trade.receiverPlayer.id);

      if (!hasPlayerA || !hasPlayerB) {
        throw new Error('One of the players is no longer with the original squad.');
      }

      // Swap players
      teamA.players = teamA.players.map((p) =>
        p.id === trade.senderPlayer.id ? { ...trade.receiverPlayer, soldToTeamId: teamA.id } : p
      );
      teamB.players = teamB.players.map((p) =>
        p.id === trade.receiverPlayer.id ? { ...trade.senderPlayer, soldToTeamId: teamB.id } : p
      );

      transaction.update(roomRef, {
        teams: cleanData(rawTeams),
        [`trades.${tradeId}.status`]: 'accepted',
      });

      return { success: true };
    });
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to process trade.' };
  }
  }