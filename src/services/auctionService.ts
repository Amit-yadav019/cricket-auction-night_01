import {
  doc,
  runTransaction,
  onSnapshot,
  setDoc,
  updateDoc,
  DocumentSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  Player,
  Team,
  CurrentLot,
  AuctionSettings,
  validateBid,
  calculateMaxBid,
  isAuctionComplete,
} from '../game/auctionRules';

export interface RoomData {
  id: string;
  code: string;
  hostToken: string;
  hostHeartbeat: number;
  status: 'lobby' | 'auction' | 'round_ended' | 'completed';
  settings: AuctionSettings;
  round: number;
  teams: Team[];
  allPlayers: Player[];
  activePlayerIndex: number;
  currentLot: CurrentLot | null;
  lastResult: {
    type: 'SOLD' | 'UNSOLD';
    playerName: string;
    teamName?: string;
    amount?: number;
    timestamp: number;
  } | null;
  auctionLog: {
    id: string;
    timestamp: number;
    message: string;
    type: 'bid' | 'sold' | 'unsold' | 'undo' | 'system';
  }[];
  lastActionHostToken?: string;
  createdAt: number;
  updatedAt: number;
}

const ROOM_CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += ROOM_CODE_CHARS.charAt(
      Math.floor(Math.random() * ROOM_CODE_CHARS.length)
    );
  }
  return code;
}

export function generateHostToken(): string {
  return `host_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

export function generateOwnerToken(): string {
  return `owner_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

export function removeUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined) as any;
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) {
        cleaned[k] = removeUndefined(v);
      }
    }
    return cleaned;
  }
  return obj;
}

function safeTxUpdate(tx: any, ref: any, data: any) {
  tx.update(ref, removeUndefined(data));
}

/**
 * Creates a new auction room doc in Firestore.
 */
export async function createAuctionRoom(
  code: string,
  hostToken: string,
  settings: AuctionSettings,
  teams: Team[],
  players: Player[]
): Promise<string> {
  const path = `rooms/${code}`;
  const now = Date.now();

  const initialRoom: RoomData = {
    id: code,
    code,
    hostToken,
    hostHeartbeat: now,
    status: 'lobby',
    settings,
    round: 1,
    teams,
    allPlayers: players,
    activePlayerIndex: 0,
    currentLot: null,
    lastResult: null,
    auctionLog: [
      {
        id: `log_${now}`,
        timestamp: now,
        message: `Auction room created with ${teams.length} teams and ${players.length} players.`,
        type: 'system',
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  try {
    const sanitized = removeUndefined(initialRoom);
    await setDoc(doc(db, 'rooms', code), sanitized);
    return code;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Subscribes to real-time room updates via onSnapshot.
 */
export function subscribeToRoom(
  code: string,
  onUpdate: (room: RoomData | null) => void,
  onError: (error: Error) => void
): () => void {
  const roomRef = doc(db, 'rooms', code);

  return onSnapshot(
    roomRef,
    (snap: DocumentSnapshot) => {
      if (snap.exists()) {
        onUpdate(snap.data() as RoomData);
      } else {
        onUpdate(null);
      }
    },
    (error) => {
      console.error('onSnapshot error:', error);
      onError(error);
    }
  );
}

/**
 * Updates host heartbeat timestamp.
 */
export async function sendHostHeartbeat(code: string, hostToken: string): Promise<void> {
  try {
    const roomRef = doc(db, 'rooms', code);
    await updateDoc(roomRef, {
      hostHeartbeat: Date.now(),
      updatedAt: Date.now(),
    });
  } catch (err) {
    // Non-fatal background heartbeat error
    console.warn('Heartbeat error:', err);
  }
}

/**
 * Claims a team for an owner in lobby.
 */
export async function claimTeam(
  code: string,
  teamId: string,
  ownerName: string,
  ownerToken: string
): Promise<{ success: boolean; error?: string }> {
  const roomRef = doc(db, 'rooms', code);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');
      const room = snap.data() as RoomData;

      if (room.status !== 'lobby') {
        throw new Error('Auction already started');
      }

      const team = room.teams.find((t) => t.id === teamId);
      if (!team) throw new Error('Team not found');

      if (team.claimedByOwnerName && team.ownerToken !== ownerToken) {
        throw new Error('This team was just claimed by someone else!');
      }

      // Check if user already claimed another team
      const existingTeam = room.teams.find((t) => t.ownerToken === ownerToken && t.id !== teamId);
      if (existingTeam) {
        existingTeam.claimedByOwnerName = undefined;
        existingTeam.ownerToken = undefined;
      }

      team.claimedByOwnerName = ownerName;
      team.ownerToken = ownerToken;

      const now = Date.now();
      const updatedLog = [
        {
          id: `log_${now}`,
          timestamp: now,
          message: `${ownerName} claimed ${team.name}.`,
          type: 'system' as const,
        },
        ...room.auctionLog.slice(0, 40),
      ];

      safeTxUpdate(tx, roomRef, {
        teams: room.teams,
        auctionLog: updatedLog,
        updatedAt: now,
      });
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to claim team' };
  }
}

/**
 * Host releases a team's phone/owner.
 */
export async function releaseTeam(
  code: string,
  teamId: string,
  hostToken: string
): Promise<{ success: boolean; error?: string }> {
  const roomRef = doc(db, 'rooms', code);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');
      const room = snap.data() as RoomData;

      if (room.hostToken !== hostToken) {
        throw new Error('Unauthorized: Host only action');
      }

      const team = room.teams.find((t) => t.id === teamId);
      if (!team) throw new Error('Team not found');

      const prevOwner = team.claimedByOwnerName || 'Owner';
      team.claimedByOwnerName = undefined;
      team.ownerToken = undefined;

      const now = Date.now();
      const updatedLog = [
        {
          id: `log_${now}`,
          timestamp: now,
          message: `Host released ${team.name} (previously ${prevOwner}).`,
          type: 'system' as const,
        },
        ...room.auctionLog.slice(0, 40),
      ];

      safeTxUpdate(tx, roomRef, {
        teams: room.teams,
        auctionLog: updatedLog,
        lastActionHostToken: hostToken,
        updatedAt: now,
      });
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to release team' };
  }
}

/**
 * Host starts bidding from Lobby.
 */
export async function startAuction(
  code: string,
  hostToken: string
): Promise<{ success: boolean; error?: string }> {
  const roomRef = doc(db, 'rooms', code);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');
      const room = snap.data() as RoomData;

      if (room.hostToken !== hostToken) {
        throw new Error('Unauthorized: Host only action');
      }

      if (room.allPlayers.length === 0) {
        throw new Error('No players selected for auction');
      }

      const firstPlayer = room.allPlayers[0];
      firstPlayer.status = 'active';

      const now = Date.now();
      const currentLot: CurrentLot = {
        playerIndex: 0,
        player: firstPlayer,
        currentBid: null,
        leadingTeamId: null,
        leadingTeamName: null,
        bidHistory: [],
        startedAt: now,
      };

      const updatedLog = [
        {
          id: `log_${now}`,
          timestamp: now,
          message: `Auction started! First lot: ${firstPlayer.name} (${firstPlayer.role}, Base ₹${firstPlayer.basePrice} ${room.settings.purseUnit}).`,
          type: 'system' as const,
        },
        ...room.auctionLog.slice(0, 40),
      ];

      safeTxUpdate(tx, roomRef, {
        status: 'auction',
        activePlayerIndex: 0,
        currentLot,
        allPlayers: room.allPlayers,
        auctionLog: updatedLog,
        lastActionHostToken: hostToken,
        updatedAt: now,
      });
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to start auction' };
  }
}

/**
 * Places a bid through a Firestore TRANSACTION.
 * Re-reads current auction doc and validates every rule before writing.
 * If two owners bid simultaneously, first committed wins and other gets "Someone bid first, try again."
 */
export async function placeBidTransaction(
  code: string,
  teamId: string,
  proposedAmount: number,
  raiseMultiplier: number,
  clientCurrentBid: number | null,
  clientPlayerId: string,
  hostToken?: string
): Promise<{ success: boolean; error?: string }> {
  const roomRef = doc(db, 'rooms', code);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');
      const room = snap.data() as RoomData;

      if (room.status !== 'auction') {
        throw new Error('Auction is not currently active');
      }

      const lot = room.currentLot;
      if (!lot) {
        throw new Error('No active player up for auction');
      }

      // Check if another bid committed while user was tapping
      if (lot.currentBid !== clientCurrentBid || lot.player.id !== clientPlayerId) {
        throw new Error('Someone bid first, try again.');
      }

      const team = room.teams.find((t) => t.id === teamId);
      if (!team) throw new Error('Team not found');

      const lowestBasePrice = Math.min(
        ...room.allPlayers.map((p) => p.basePrice),
        0.5
      );

      const maxSquad = room.settings.maxSquadSize || room.settings.squadSize;
      const minSquad = room.settings.minSquadSize || maxSquad;

      const validation = validateBid({
        teamId: team.id,
        teamPurse: team.purse,
        teamPlayerCount: team.players.length,
        maxSquadSize: maxSquad,
        minSquadSize: minSquad,
        lowestBasePrice,
        currentBid: lot.currentBid,
        leadingTeamId: lot.leadingTeamId,
        basePrice: lot.player.basePrice,
        bidStep: room.settings.bidStep,
        proposedAmount,
        currentPlayerId: lot.player.id,
        targetPlayerId: clientPlayerId,
      });

      if (!validation.valid) {
        throw new Error(validation.reason || 'Invalid bid');
      }

      const now = Date.now();
      const newBidItem = {
        teamId: team.id,
        teamName: team.name,
        amount: proposedAmount,
        timestamp: now,
        raiseMultiplier,
      };

      const updatedHistory = [newBidItem, ...lot.bidHistory];
      const updatedLot: CurrentLot = {
        ...lot,
        currentBid: proposedAmount,
        leadingTeamId: team.id,
        leadingTeamName: team.name,
        bidHistory: updatedHistory,
      };

      const logMsg =
        lot.currentBid === null
          ? `${team.name} opened with base bid ₹${proposedAmount} ${room.settings.purseUnit}`
          : `${team.name} raised to ₹${proposedAmount} ${room.settings.purseUnit} (+${raiseMultiplier}x)`;

      const updatedLog = [
        {
          id: `log_${now}`,
          timestamp: now,
          message: logMsg,
          type: 'bid' as const,
        },
        ...room.auctionLog.slice(0, 40),
      ];

      const updatePayload: any = {
        currentLot: updatedLot,
        auctionLog: updatedLog,
        updatedAt: now,
      };

      if (hostToken && room.hostToken === hostToken) {
        updatePayload.lastActionHostToken = hostToken;
      }

      safeTxUpdate(tx, roomRef, updatePayload);
    });

    return { success: true };
  } catch (err: any) {
    const msg = err.message || 'Failed to place bid';
    if (msg.includes('Someone bid first') || msg.includes('no longer active')) {
      return { success: false, error: 'Someone bid first, try again.' };
    }
    return { success: false, error: msg };
  }
}

/**
 * Host marks current player as SOLD through a Firestore TRANSACTION.
 */
export async function markSoldTransaction(
  code: string,
  hostToken: string
): Promise<{ success: boolean; error?: string }> {
  const roomRef = doc(db, 'rooms', code);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');
      const room = snap.data() as RoomData;

      if (room.hostToken !== hostToken) {
        throw new Error('Unauthorized: Host only action');
      }

      const lot = room.currentLot;
      if (!lot || lot.currentBid === null || !lot.leadingTeamId) {
        throw new Error('Cannot sell: no active bids on this player');
      }

      const winningTeam = room.teams.find((t) => t.id === lot.leadingTeamId);
      if (!winningTeam) throw new Error('Winning team not found');

      const salePrice = lot.currentBid;
      const soldPlayer: Player = {
        ...lot.player,
        status: 'sold',
        soldPrice: salePrice,
        soldToTeamId: winningTeam.id,
      };

      winningTeam.purse = Number((winningTeam.purse - salePrice).toFixed(2));
      winningTeam.spent = Number((winningTeam.spent + salePrice).toFixed(2));
      winningTeam.players.push(soldPlayer);

      // Update player in allPlayers array
      room.allPlayers[lot.playerIndex] = soldPlayer;

      const now = Date.now();
      const lastResult = {
        type: 'SOLD' as const,
        playerName: soldPlayer.name,
        teamName: winningTeam.name,
        amount: salePrice,
        timestamp: now,
      };

      const updatedLog = [
        {
          id: `log_${now}`,
          timestamp: now,
          message: `🔨 SOLD! ${soldPlayer.name} to ${winningTeam.name} for ₹${salePrice} ${room.settings.purseUnit}.`,
          type: 'sold' as const,
        },
        ...room.auctionLog.slice(0, 40),
      ];

      // Advance to next player
      const nextIndex = lot.playerIndex + 1;
      const remainingUnprocessed = room.allPlayers.length - nextIndex;
      const maxSquad = room.settings.maxSquadSize || room.settings.squadSize;
      const minSquad = room.settings.minSquadSize || maxSquad;
      const isComplete = isAuctionComplete(
        room.teams,
        maxSquad,
        remainingUnprocessed,
        minSquad
      );

      if (isComplete || nextIndex >= room.allPlayers.length) {
        const hasUnsold = room.allPlayers.some((p) => p.status === 'unsold');
        const anySquadHasSlots = room.teams.some(
          (t) => t.players.length < maxSquad
        );

        const newStatus =
          hasUnsold && anySquadHasSlots ? 'round_ended' : 'completed';

        safeTxUpdate(tx, roomRef, {
          teams: room.teams,
          allPlayers: room.allPlayers,
          currentLot: null,
          lastResult,
          status: newStatus,
          auctionLog: updatedLog,
          lastActionHostToken: hostToken,
          updatedAt: now,
        });
      } else {
        const nextPlayer = room.allPlayers[nextIndex];
        nextPlayer.status = 'active';

        const nextLot: CurrentLot = {
          playerIndex: nextIndex,
          player: nextPlayer,
          currentBid: null,
          leadingTeamId: null,
          leadingTeamName: null,
          bidHistory: [],
          startedAt: now,
        };

        safeTxUpdate(tx, roomRef, {
          teams: room.teams,
          allPlayers: room.allPlayers,
          activePlayerIndex: nextIndex,
          currentLot: nextLot,
          lastResult,
          auctionLog: updatedLog,
          lastActionHostToken: hostToken,
          updatedAt: now,
        });
      }
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to mark sold' };
  }
}

/**
 * Host marks current player as UNSOLD through a Firestore TRANSACTION.
 */
export async function markUnsoldTransaction(
  code: string,
  hostToken: string
): Promise<{ success: boolean; error?: string }> {
  const roomRef = doc(db, 'rooms', code);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');
      const room = snap.data() as RoomData;

      if (room.hostToken !== hostToken) {
        throw new Error('Unauthorized: Host only action');
      }

      const lot = room.currentLot;
      if (!lot) throw new Error('No active player');

      const unsoldPlayer: Player = {
        ...lot.player,
        status: 'unsold',
      };

      room.allPlayers[lot.playerIndex] = unsoldPlayer;

      const now = Date.now();
      const lastResult = {
        type: 'UNSOLD' as const,
        playerName: unsoldPlayer.name,
        timestamp: now,
      };

      const updatedLog = [
        {
          id: `log_${now}`,
          timestamp: now,
          message: `❌ UNSOLD: ${unsoldPlayer.name} passed with no bids.`,
          type: 'unsold' as const,
        },
        ...room.auctionLog.slice(0, 40),
      ];

      const nextIndex = lot.playerIndex + 1;
      const remainingUnprocessed = room.allPlayers.length - nextIndex;
      const maxSquad = room.settings.maxSquadSize || room.settings.squadSize;
      const minSquad = room.settings.minSquadSize || maxSquad;
      const isComplete = isAuctionComplete(
        room.teams,
        maxSquad,
        remainingUnprocessed,
        minSquad
      );

      if (isComplete || nextIndex >= room.allPlayers.length) {
        const hasUnsold = room.allPlayers.some((p) => p.status === 'unsold');
        const anySquadHasSlots = room.teams.some(
          (t) => t.players.length < maxSquad
        );
        const newStatus =
          hasUnsold && anySquadHasSlots ? 'round_ended' : 'completed';

        safeTxUpdate(tx, roomRef, {
          allPlayers: room.allPlayers,
          currentLot: null,
          lastResult,
          status: newStatus,
          auctionLog: updatedLog,
          lastActionHostToken: hostToken,
          updatedAt: now,
        });
      } else {
        const nextPlayer = room.allPlayers[nextIndex];
        nextPlayer.status = 'active';

        const nextLot: CurrentLot = {
          playerIndex: nextIndex,
          player: nextPlayer,
          currentBid: null,
          leadingTeamId: null,
          leadingTeamName: null,
          bidHistory: [],
          startedAt: now,
        };

        safeTxUpdate(tx, roomRef, {
          allPlayers: room.allPlayers,
          activePlayerIndex: nextIndex,
          currentLot: nextLot,
          lastResult,
          auctionLog: updatedLog,
          lastActionHostToken: hostToken,
          updatedAt: now,
        });
      }
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to mark unsold' };
  }
}

/**
 * Host undoes the last bid through a Firestore TRANSACTION.
 * Restores the previous leader and price.
 */
export async function undoLastBidTransaction(
  code: string,
  hostToken: string
): Promise<{ success: boolean; error?: string }> {
  const roomRef = doc(db, 'rooms', code);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');
      const room = snap.data() as RoomData;

      if (room.hostToken !== hostToken) {
        throw new Error('Unauthorized: Host only action');
      }

      const lot = room.currentLot;
      if (!lot || lot.bidHistory.length === 0) {
        throw new Error('No bids to undo');
      }

      const undoneBid = lot.bidHistory[0];
      const remainingHistory = lot.bidHistory.slice(1);

      let prevBid: number | null = null;
      let prevLeaderId: string | null = null;
      let prevLeaderName: string | null = null;

      if (remainingHistory.length > 0) {
        const prev = remainingHistory[0];
        prevBid = prev.amount;
        prevLeaderId = prev.teamId;
        prevLeaderName = prev.teamName;
      }

      const updatedLot: CurrentLot = {
        ...lot,
        currentBid: prevBid,
        leadingTeamId: prevLeaderId,
        leadingTeamName: prevLeaderName,
        bidHistory: remainingHistory,
      };

      const now = Date.now();
      const updatedLog = [
        {
          id: `log_${now}`,
          timestamp: now,
          message: `↩️ Undid bid of ₹${undoneBid.amount} ${room.settings.purseUnit} by ${undoneBid.teamName}.`,
          type: 'undo' as const,
        },
        ...room.auctionLog.slice(0, 40),
      ];

      safeTxUpdate(tx, roomRef, {
        currentLot: updatedLot,
        auctionLog: updatedLog,
        lastActionHostToken: hostToken,
        updatedAt: now,
      });
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to undo bid' };
  }
}

/**
 * Host re-auctions unsold players for another round.
 */
export async function reAuctionUnsoldTransaction(
  code: string,
  hostToken: string
): Promise<{ success: boolean; error?: string }> {
  const roomRef = doc(db, 'rooms', code);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');
      const room = snap.data() as RoomData;

      if (room.hostToken !== hostToken) {
        throw new Error('Unauthorized: Host only action');
      }

      const unsoldPlayers: Player[] = room.allPlayers
        .filter((p) => p.status === 'unsold')
        .map((p) => ({ ...p, status: 'pending' }));

      if (unsoldPlayers.length === 0) {
        throw new Error('No unsold players available for re-auction');
      }

      const nextRound = room.round + 1;
      const firstPlayer = unsoldPlayers[0];
      firstPlayer.status = 'active';

      const now = Date.now();
      const currentLot: CurrentLot = {
        playerIndex: 0,
        player: firstPlayer,
        currentBid: null,
        leadingTeamId: null,
        leadingTeamName: null,
        bidHistory: [],
        startedAt: now,
      };

      const updatedLog = [
        {
          id: `log_${now}`,
          timestamp: now,
          message: `Round ${nextRound} started with ${unsoldPlayers.length} unsold players!`,
          type: 'system' as const,
        },
        ...room.auctionLog.slice(0, 40),
      ];

      safeTxUpdate(tx, roomRef, {
        status: 'auction',
        round: nextRound,
        allPlayers: unsoldPlayers,
        activePlayerIndex: 0,
        currentLot,
        auctionLog: updatedLog,
        lastActionHostToken: hostToken,
        updatedAt: now,
      });
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to re-auction' };
  }
}

/**
 * Host ends the auction manually.
 */
export async function endAuctionTransaction(
  code: string,
  hostToken: string
): Promise<{ success: boolean; error?: string }> {
  const roomRef = doc(db, 'rooms', code);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');
      const room = snap.data() as RoomData;

      if (room.hostToken !== hostToken) {
        throw new Error('Unauthorized: Host only action');
      }

      const now = Date.now();
      const updatedLog = [
        {
          id: `log_${now}`,
          timestamp: now,
          message: `Auction concluded by the host.`,
          type: 'system' as const,
        },
        ...room.auctionLog.slice(0, 40),
      ];

      safeTxUpdate(tx, roomRef, {
        status: 'completed',
        currentLot: null,
        auctionLog: updatedLog,
        lastActionHostToken: hostToken,
        updatedAt: now,
      });
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to end auction' };
  }
}

/**
 * Host resets the auction (resets purses and squads, keeps team claims).
 */
export async function resetAuctionTransaction(
  code: string,
  hostToken: string
): Promise<{ success: boolean; error?: string }> {
  const roomRef = doc(db, 'rooms', code);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');
      const room = snap.data() as RoomData;

      if (room.hostToken !== hostToken) {
        throw new Error('Unauthorized: Host only action');
      }

      // Reset team purses and squads, preserving claimedByOwnerName and ownerToken
      const resetTeams = room.teams.map((t) => ({
        ...t,
        purse: room.settings.pursePerTeam,
        spent: 0,
        players: [],
      }));

      // Reset all players to pending
      const resetPlayers = room.allPlayers.map((p) => ({
        ...p,
        status: 'pending' as const,
        soldPrice: undefined,
        soldToTeamId: undefined,
      }));

      const now = Date.now();
      const updatedLog = [
        {
          id: `log_${now}`,
          timestamp: now,
          message: `Auction reset by host. Team claims kept.`,
          type: 'system' as const,
        },
      ];

      safeTxUpdate(tx, roomRef, {
        status: 'lobby',
        round: 1,
        teams: resetTeams,
        allPlayers: resetPlayers,
        activePlayerIndex: 0,
        currentLot: null,
        lastResult: null,
        auctionLog: updatedLog,
        lastActionHostToken: hostToken,
        updatedAt: now,
      });
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to reset auction' };
  }
}
