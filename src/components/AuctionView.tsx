import React, { useState, useEffect, useRef } from 'react';
import {
  Gavel,
  RotateCcw,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Flame,
  RefreshCw,
  Volume2,
  VolumeX,
  Award,
} from 'lucide-react';
import {
  RoomData,
  placeBidTransaction,
  markSoldTransaction,
  markUnsoldTransaction,
  undoLastBidTransaction,
  reAuctionUnsoldTransaction,
  endAuctionTransaction,
} from '../services/auctionService';
import {
  calculateMaxBid,
  PlayerRole,
  Team,
} from '../game/auctionRules';
import {
  playBidChime,
  playGavelHit,
  playUnsoldChime,
  playUndoSound,
  playOutbidSound,
  speakAuctioneer,
} from '../utils/audio';

interface AuctionViewProps {
  room: RoomData;
  isHost: boolean;
  hostToken: string;
  ownerToken: string;
  activeTab: 'auction' | 'squads' | 'log';
  setActiveTab: (tab: 'auction' | 'squads' | 'log') => void;
  soundEnabled: boolean;
  onOpenSummary: () => void;
}

export const AuctionView: React.FC<AuctionViewProps> = ({
  room,
  isHost,
  hostToken,
  ownerToken,
  activeTab,
  setActiveTab,
  soundEnabled,
  onOpenSummary,
}) => {
  const [bidding, setBidding] = useState(false);
  const [biddingError, setBiddingError] = useState('');
  const [hostActionLoading, setHostActionLoading] = useState(false);

  // Selected raise multiplier for owner (1, 2, or 4 steps)
  const [selectedMultiplier, setSelectedMultiplier] = useState<number>(1);

  // Normalize teams array safely whether array or object map
  const teamsList: Team[] = Array.isArray(room?.teams)
    ? (room.teams as Team[])
    : Object.values(room?.teams || {});

  const [hostPaddleTeamId, setHostPaddleTeamId] = useState<string>(
    teamsList[0]?.id || ''
  );

  // Track stamp visibility for 2.5s
  const [showStamp, setShowStamp] = useState(false);
  const [lastStampResult, setLastStampResult] = useState(room?.lastResult);
  const [isScreenShaking, setIsScreenShaking] = useState(false);

  // Voice narration toggle
  const [voiceNarration, setVoiceNarration] = useState<boolean>(false);

  const prevLeadingTeamIdRef = useRef<string | null>(null);
  const prevBidCountRef = useRef<number>(0);

  // Check if host heartbeat is stale (> 25 seconds ago)
  const [isHostOffline, setIsHostOffline] = useState(false);

  useEffect(() => {
    const checkHeartbeat = () => {
      const diff = Date.now() - (room?.hostHeartbeat || 0);
      setIsHostOffline(diff > 25000);
    };
    checkHeartbeat();
    const interval = setInterval(checkHeartbeat, 5000);
    return () => clearInterval(interval);
  }, [room?.hostHeartbeat]);

  // Stamp animation trigger when lastResult changes
  useEffect(() => {
    if (room?.lastResult && room.lastResult.timestamp !== lastStampResult?.timestamp) {
      setLastStampResult(room.lastResult);
      setShowStamp(true);
      setIsScreenShaking(true);
      setTimeout(() => setIsScreenShaking(false), 400);

      if (soundEnabled) {
        if (room.lastResult.type === 'SOLD') playGavelHit();
        else playUnsoldChime();
      }

      if (voiceNarration && soundEnabled) {
        const text =
          room.lastResult.type === 'SOLD'
            ? `${room.lastResult.playerName} sold to ${room.lastResult.teamName} for ${room.lastResult.amount} ${room.settings?.purseUnit || 'Crores'}`
            : `${room.lastResult.playerName} goes unsold.`;
        speakAuctioneer(text);
      }

      const timer = setTimeout(() => setShowStamp(false), 2600);
      return () => clearTimeout(timer);
    }
  }, [room?.lastResult, soundEnabled, voiceNarration, lastStampResult?.timestamp, room?.settings?.purseUnit]);

  // Detect outbid and bid audio cues
  useEffect(() => {
    if (!room?.currentLot) return;
    const bids = room.currentLot.bidHistory || [];
    if (bids.length > prevBidCountRef.current) {
      const latest = bids[0];
      const myTeam = teamsList.find((t) => t.ownerToken === ownerToken);

      if (
        myTeam &&
        prevLeadingTeamIdRef.current === myTeam.id &&
        latest?.teamId !== myTeam.id
      ) {
        if (soundEnabled) playOutbidSound();
      } else {
        if (soundEnabled && latest) playBidChime(latest.amount);
      }
    }
    prevBidCountRef.current = bids.length;
    prevLeadingTeamIdRef.current = room.currentLot.leadingTeamId || null;
  }, [room?.currentLot?.bidHistory?.length, room?.currentLot?.leadingTeamId, ownerToken, soundEnabled, teamsList]);

  const lot = room?.currentLot;
  const currentBid = lot?.currentBid ?? null;
  const isFirstBid = currentBid === null;

  // Determine active bidding team
  const myClaimedTeam = teamsList.find((t) => t.ownerToken === ownerToken);
  const activeBiddingTeam = isHost
    ? teamsList.find((t) => t.id === hostPaddleTeamId) || myClaimedTeam || teamsList[0]
    : myClaimedTeam;

  const teamPlayerCount = activeBiddingTeam ? (activeBiddingTeam.players?.length || 0) : 0;
  const teamPurse = activeBiddingTeam ? activeBiddingTeam.purse : 0;

  const maxSquad = room?.settings?.maxSquadSize || room?.settings?.squadSize || 25;
  const minSquad = room?.settings?.minSquadSize || maxSquad;
  const slotsLeft = maxSquad - teamPlayerCount;

  // Check if every team has fulfilled minimum squad requirement
  const allTeamsMetMin =
    teamsList.length > 0 &&
    teamsList.every((t) => (t.players?.length || 0) >= minSquad);

  // Max bid calculation using proper team object
  const maxAllowedBid = activeBiddingTeam
    ? calculateMaxBid(
        {
          ...activeBiddingTeam,
          players: activeBiddingTeam.players || [],
        },
        maxSquad
      )
    : 0;

  // Calculate proposed bid amount
  let proposedBidAmount = 0;
  if (isFirstBid) {
    proposedBidAmount = lot?.player?.basePrice || 0.5;
  } else {
    const step = room?.settings?.bidStep || 0.5;
    proposedBidAmount = Number(((currentBid || 0) + selectedMultiplier * step).toFixed(2));
  }

  // Reason why active bidding team cannot bid
  let bidDisabledReason = '';
  if (!lot) {
    bidDisabledReason = 'No active lot';
  } else if (!activeBiddingTeam) {
    bidDisabledReason = 'Claim a team to bid';
  } else if (slotsLeft <= 0) {
    bidDisabledReason = 'Squad is full';
  } else if (lot.leadingTeamId === activeBiddingTeam.id) {
    bidDisabledReason = 'Leading the bid';
  } else if (proposedBidAmount > maxAllowedBid) {
    bidDisabledReason = `Cannot afford (Max ₹${maxAllowedBid})`;
  } else if (proposedBidAmount > teamPurse) {
    bidDisabledReason = 'Insufficient purse';
  } else if (!isHost && isHostOffline) {
    bidDisabledReason = 'Host is offline';
  }

  const canBid = !bidDisabledReason && !bidding;

  // Handle owner or host placing a bid
  const handlePlaceBid = async (overrideTeamId?: string, overrideAmount?: number, overrideMult?: number) => {
    if (!lot || !lot.player) return;

    const targetTeam = overrideTeamId
      ? teamsList.find((t) => t.id === overrideTeamId)
      : activeBiddingTeam;

    if (!targetTeam || !targetTeam.id) {
      setBiddingError('Please select a team before placing a bid');
      return;
    }

    const roomIdentifier = room?.code || (room as any)?.roomCode;
    if (!roomIdentifier) {
      setBiddingError('Room code not found');
      return;
    }

    const amount = overrideAmount ?? proposedBidAmount;
    const mult = overrideMult ?? (isFirstBid ? 0 : selectedMultiplier);

    setBidding(true);
    setBiddingError('');

    try {
      const res = await placeBidTransaction(
        roomIdentifier,
        targetTeam.id,
        amount,
        mult,
        lot.currentBid ?? null,
        lot.player.id,
        isHost ? hostToken : undefined
      );

      if (!res?.success) {
        setBiddingError(res?.error || 'Failed to place bid');
      }
    } catch (err: any) {
      setBiddingError(err?.message || 'Bidding transaction failed');
    } finally {
      setBidding(false);
    }
  };

  // Host action: Sold
  const handleHostSold = async () => {
    const roomIdentifier = room?.code || (room as any)?.roomCode;
    if (!isHost || hostActionLoading || !roomIdentifier) return;
    setHostActionLoading(true);
    try {
      const res = await markSoldTransaction(roomIdentifier, hostToken);
      if (!res?.success) {
        setBiddingError(res?.error || 'Failed to mark sold');
      }
    } catch (err: any) {
      setBiddingError(err?.message || 'Transaction failed');
    } finally {
      setHostActionLoading(false);
    }
  };

  // Host action: Unsold
  const handleHostUnsold = async () => {
    const roomIdentifier = room?.code || (room as any)?.roomCode;
    if (!isHost || hostActionLoading || !roomIdentifier) return;
    setHostActionLoading(true);
    try {
      const res = await markUnsoldTransaction(roomIdentifier, hostToken);
      if (!res?.success) {
        setBiddingError(res?.error || 'Failed to mark unsold');
      }
    } catch (err: any) {
      setBiddingError(err?.message || 'Transaction failed');
    } finally {
      setHostActionLoading(false);
    }
  };

  // Host action: Undo
  const handleHostUndo = async () => {
    const roomIdentifier = room?.code || (room as any)?.roomCode;
    if (!isHost || hostActionLoading || !roomIdentifier) return;
    setHostActionLoading(true);
    try {
      const res = await undoLastBidTransaction(roomIdentifier, hostToken);
      if (!res?.success) {
        setBiddingError(res?.error || 'Failed to undo bid');
      } else {
        if (soundEnabled) playUndoSound();
      }
    } catch (err: any) {
      setBiddingError(err?.message || 'Transaction failed');
    } finally {
      setHostActionLoading(false);
    }
  };

  // Host action: Re-auction
  const handleHostReAuction = async () => {
    const roomIdentifier = room?.code || (room as any)?.roomCode;
    if (!isHost || hostActionLoading || !roomIdentifier) return;
    setHostActionLoading(true);
    try {
      const res = await reAuctionUnsoldTransaction(roomIdentifier, hostToken);
      if (!res?.success) {
        setBiddingError(res?.error || 'Failed to re-auction');
      }
    } catch (err: any) {
      setBiddingError(err?.message || 'Transaction failed');
    } finally {
      setHostActionLoading(false);
    }
  };

  // Host action: End Auction
  const handleHostEndAuction = async () => {
    const roomIdentifier = room?.code || (room as any)?.roomCode;
    if (!isHost || hostActionLoading || !roomIdentifier) return;
    if (!confirm('Conclude the auction and view final squad summaries?')) return;
    setHostActionLoading(true);
    try {
      const res = await endAuctionTransaction(roomIdentifier, hostToken);
      if (!res?.success) {
        setBiddingError(res?.error || 'Failed to end auction');
      }
    } catch (err: any) {
      setBiddingError(err?.message || 'Transaction failed');
    } finally {
      setHostActionLoading(false);
    }
  };

  const getRoleBadgeColor = (role: PlayerRole) => {
    switch (role) {
      case 'BAT':
        return 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 border-blue-400';
      case 'WK':
        return 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border-amber-400';
      case 'AR':
        return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-400';
      case 'BOWL':
        return 'bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200 border-purple-400';
    }
  };

  // Round ended screen
  if (room?.status === 'round_ended') {
    const unsoldPlayers = (room.allPlayers || []).filter((p) => p.status === 'unsold');
    return (
      <div className="w-full max-w-[540px] mx-auto px-4 py-8 text-center space-y-6">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-6 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary-light)] text-[var(--color-primary)] mx-auto flex items-center justify-center mb-4">
            <RefreshCw className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black font-display uppercase tracking-wider text-[var(--color-text-main)]">
            Round {room.round} Concluded
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-2">
            All players in this round have been presented. There are{' '}
            <span className="font-bold text-[var(--color-text-main)]">
              {unsoldPlayers.length} unsold players
            </span>{' '}
            available.
          </p>

          {isHost ? (
            <div className="mt-6 space-y-3">
              <button
                type="button"
                disabled={hostActionLoading}
                onClick={handleHostReAuction}
                className="w-full min-h-[44px] py-3.5 px-6 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-display text-lg font-bold uppercase tracking-wider transition active:scale-[0.98] flex items-center justify-center space-x-2 cursor-pointer"
              >
                <RefreshCw className="w-5 h-5" />
                <span>Re-Auction Unsold ({unsoldPlayers.length})</span>
              </button>
              <button
                type="button"
                disabled={hostActionLoading}
                onClick={handleHostEndAuction}
                className="w-full min-h-[44px] py-3 px-6 rounded-xl bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-[var(--color-text-main)] font-display text-sm font-bold uppercase tracking-wider transition cursor-pointer"
              >
                End Auction Now
              </button>
            </div>
          ) : (
            <div className="mt-6 p-4 bg-[var(--color-surface-subtle)] rounded-xl border border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
              Waiting for the host to start the next round or end the auction...
            </div>
          )}
        </div>
      </div>
    );
  }

  const isBiddingWar = Boolean(
    lot &&
    (lot.bidHistory?.length || 0) >= 2 &&
    (lot.bidHistory?.[0]?.timestamp || 0) - (lot.bidHistory?.[1]?.timestamp || 0) < 4000 &&
    lot.bidHistory?.[0]?.teamId !== lot.bidHistory?.[1]?.teamId
  );

  return (
    <div className={`w-full max-w-[540px] mx-auto px-4 py-3 space-y-3 ${isScreenShaking ? 'shake-action' : ''}`}>
      {!isHost && isHostOffline && (
        <div className="p-3 bg-red-600 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 shadow-md animate-pulse">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>The host is offline. Waiting for host reconnection...</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="grid grid-cols-4 gap-1 bg-[var(--color-surface-subtle)] p-1 rounded-xl border border-[var(--color-border)]">
        <button
          onClick={() => setActiveTab('auction')}
          className={`py-2 rounded-lg text-xs font-display font-black uppercase tracking-wider transition min-h-[38px] cursor-pointer ${
            activeTab === 'auction'
              ? 'bg-[var(--color-primary)] text-white shadow-xs'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
          }`}
        >
          Auction
        </button>
        <button
          onClick={() => setActiveTab('squads')}
          className={`py-2 rounded-lg text-xs font-display font-black uppercase tracking-wider transition min-h-[38px] cursor-pointer ${
            activeTab === 'squads'
              ? 'bg-[var(--color-primary)] text-white shadow-xs'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
          }`}
        >
          Squads
        </button>
        <button
          onClick={() => setActiveTab('log')}
          className={`py-2 rounded-lg text-xs font-display font-black uppercase tracking-wider transition min-h-[38px] cursor-pointer ${
            activeTab === 'log'
              ? 'bg-[var(--color-primary)] text-white shadow-xs'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
          }`}
        >
          Log
        </button>
        <button
          onClick={onOpenSummary}
          title="Open live financial and squad summary"
          className="py-2 rounded-lg text-xs font-display font-black uppercase tracking-wider transition min-h-[38px] text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] border border-[var(--color-primary)]/40 flex items-center justify-center space-x-1 cursor-pointer"
        >
          <span>Summary</span>
        </button>
      </div>

      {/* Dismissible Error Banner */}
      {biddingError && (
        <div
          onClick={() => setBiddingError('')}
          className="p-2.5 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 rounded-xl text-center text-xs font-bold text-amber-900 dark:text-amber-100 transition hover:opacity-85 cursor-pointer shadow-xs"
          title="Click to dismiss"
        >
          {biddingError} <span className="text-[10px] opacity-70 underline ml-1">(tap to dismiss)</span>
        </div>
      )}

      {/* CURRENT PLAYER CARD */}
      {lot ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm relative overflow-hidden">
          {showStamp && lastStampResult && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 backdrop-blur-[2px] pointer-events-none">
              <div
                className={`stamp-animate rubber-stamp px-6 py-2.5 rounded-2xl font-display font-black text-4xl sm:text-5xl uppercase tracking-widest shadow-2xl ${
                  lastStampResult.type === 'SOLD'
                    ? 'text-[var(--stamp-sold)] bg-white/95 dark:bg-black/90'
                    : 'text-[var(--stamp-unsold)] bg-white/95 dark:bg-black/90'
                }`}
              >
                {lastStampResult.type}
              </div>
            </div>
          )}

          {/* Top Info Bar: Role Badge & Base Price */}
          <div className="flex items-center justify-between mb-2">
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full border ${getRoleBadgeColor(
                lot.player.role
              )}`}
            >
              {lot.player.role}
            </span>
            <span className="text-xs font-bold text-[var(--color-text-dim)] font-mono">
              Base: ₹{lot.player.basePrice} {room?.settings?.purseUnit || 'Cr'}
            </span>
          </div>

          {/* Player Name */}
          <div className="text-center my-1">
            <h2 className="text-2xl sm:text-3xl font-black font-display tracking-wide uppercase text-[var(--color-text-main)]">
              {lot.player.name}
            </h2>
          </div>

          {/* Player Style Attributes: Batting and Bowling badges */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2 mb-3">
            {lot.player.cappedStatus && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-[var(--color-text-dim)]">
                {lot.player.cappedStatus}
              </span>
            )}

            {/* Batting Style (for BAT, WK, AR) */}
            {(lot.player.role === 'BAT' || lot.player.role === 'WK' || lot.player.role === 'AR') &&
              lot.player.battingStyle && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300">
                  🏏 {lot.player.battingStyle}
                </span>
              )}

            {/* Bowling Style (for BOWL, AR) */}
            {(lot.player.role === 'BOWL' || lot.player.role === 'AR') &&
              lot.player.bowlingStyle && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300">
                  ⚾ {lot.player.bowlingStyle}
                </span>
              )}
          </div>

          {/* Current Bid Display */}
          <div className="my-3 text-center bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl py-3 px-4">
            {isBiddingWar && (
              <div className="mb-2 inline-flex items-center space-x-1 px-3 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black font-display uppercase tracking-wider bidding-war-pulse shadow-sm">
                <Flame className="w-3.5 h-3.5 fill-white" />
                <span>Bidding War In Progress!</span>
              </div>
            )}
            <div className="text-[11px] font-bold font-display uppercase tracking-wider text-[var(--color-text-muted)]">
              {lot.currentBid === null ? 'Starting Bid Required' : 'Current Leading Bid'}
            </div>
            <div className="text-4xl sm:text-5xl font-black font-display tracking-tight text-[var(--color-accent)] scoreboard-num mt-0.5">
              ₹{lot.currentBid !== null ? lot.currentBid : lot.player.basePrice}{' '}
              <span className="text-2xl font-bold">{room?.settings?.purseUnit || 'Cr'}</span>
            </div>
          </div>

          <div className="mt-1.5 flex items-center justify-center space-x-1.5 text-xs font-semibold text-[var(--color-text-main)]">
            {lot.leadingTeamName ? (
              <>
                <Flame className="w-4 h-4 text-amber-500 fill-amber-500 animate-pulse" />
                <span className="text-[var(--color-text-muted)]">Held by:</span>
                <span className="font-bold underline decoration-[var(--color-primary)] decoration-2">
                  {lot.leadingTeamName}
                </span>
              </>
            ) : (
              <span className="text-[var(--color-text-dim)] italic">No bids placed yet</span>
            )}
          </div>

          {/* Voice Narration Button */}
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setVoiceNarration(!voiceNarration)}
              className={`px-2.5 py-1 rounded-md text-[11px] flex items-center space-x-1 font-bold transition cursor-pointer ${
                voiceNarration
                  ? 'bg-[var(--color-primary)] text-white shadow-xs'
                  : 'bg-[var(--color-surface-subtle)] text-[var(--color-text-dim)] hover:text-[var(--color-text-main)]'
              }`}
            >
              {voiceNarration ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{voiceNarration ? 'Voice ON' : 'Voice OFF'}</span>
            </button>
          </div>

          {/* Recent Bids Feed */}
          {(lot.bidHistory?.length || 0) > 0 && (
            <div className="space-y-1 mt-2 mb-2">
              <div className="text-[10px] font-bold text-[var(--color-text-dim)] uppercase tracking-wider">
                Recent Bids
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
                {(lot.bidHistory || []).slice(0, 4).map((b, i) => (
                  <div
                    key={b.timestamp + i}
                    className={`text-[11px] px-2.5 py-1 rounded-md border flex items-center space-x-1 ${
                      i === 0
                        ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)] font-bold border-[var(--color-accent)]/30'
                        : 'bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] border-[var(--color-border)]'
                    }`}
                  >
                    <span>{b.teamName}</span>
                    <span className="font-mono font-bold">₹{b.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-8 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl text-center">
          <p className="text-sm font-bold text-[var(--color-text-muted)]">
            No active player up for bidding.
          </p>
        </div>
      )}

      {/* OWNER BIDDING CONTROLS */}
      {activeBiddingTeam && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
            <div className="truncate mr-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-dim)]">
                {isHost && !myClaimedTeam ? 'Host Bidding For' : 'Your Team'}
              </span>
              <div className="text-sm font-black font-display uppercase tracking-wide text-[var(--color-text-main)] truncate">
                {activeBiddingTeam.name}
              </div>
            </div>

            <div className="flex items-center space-x-2 flex-shrink-0 text-right">
              <div>
                <span className="block text-[10px] font-semibold text-[var(--color-text-dim)]">
                  Squad
                </span>
                <span className="text-xs font-mono font-bold text-[var(--color-text-main)]">
                  {teamPlayerCount}/{minSquad === maxSquad ? maxSquad : `${minSquad}-${maxSquad}`}
                </span>
              </div>
              <div className="h-6 w-[1px] bg-[var(--color-border)]" />
              <div>
                <span className="block text-[10px] font-semibold text-[var(--color-text-dim)]">
                  Purse Left
                </span>
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  ₹{teamPurse}
                </span>
              </div>
              <div className="h-6 w-[1px] bg-[var(--color-border)]" />
              <div>
                <span className="block text-[10px] font-semibold text-[var(--color-text-dim)]">
                  Max Bid
                </span>
                <span className="text-xs font-mono font-bold text-[var(--color-accent)]">
                  ₹{maxAllowedBid}
                </span>
              </div>
            </div>
          </div>

          {/* Raise Multipliers */}
          {!isFirstBid && (
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-[var(--color-text-dim)] uppercase tracking-wider">
                Select Raise Amount
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 4].map((mult) => {
                  const step = room?.settings?.bidStep || 0.5;
                  const targetAmount = Number(((currentBid || 0) + mult * step).toFixed(2));
                  const canAffordThis = targetAmount <= maxAllowedBid && targetAmount <= teamPurse;
                  const isSelected = selectedMultiplier === mult;

                  return (
                    <button
                      key={mult}
                      type="button"
                      disabled={!canAffordThis}
                      onClick={() => setSelectedMultiplier(mult)}
                      className={`min-h-[44px] py-1.5 px-2 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center ${
                        isSelected
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] font-bold text-[var(--color-primary)] shadow-xs'
                          : canAffordThis
                          ? 'border-[var(--color-border)] bg-[var(--color-surface-subtle)] text-[var(--color-text-main)] hover:bg-[var(--color-surface-elevated)]'
                          : 'opacity-40 border-dashed border-gray-300 dark:border-gray-700 cursor-not-allowed'
                      }`}
                    >
                      <span className="text-[11px] font-display font-extrabold uppercase tracking-wide">
                        +{mult} ({mult * step})
                      </span>
                      <span className="text-xs font-mono font-bold">₹{targetAmount}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={!canBid}
            onClick={() => handlePlaceBid()}
            className={`w-full min-h-[52px] py-3.5 px-4 rounded-xl font-display text-xl font-black uppercase tracking-wider transition shadow-md flex items-center justify-center space-x-2 ${
              canBid
                ? 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white cursor-pointer active:scale-[0.98]'
                : 'bg-gray-300 dark:bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            {bidding ? (
              <span>Submitting Bid...</span>
            ) : canBid ? (
              <>
                <Gavel className="w-5 h-5 fill-current transform -rotate-12" />
                <span>
                  BID ₹{proposedBidAmount} {room?.settings?.purseUnit || 'Cr'}
                </span>
              </>
            ) : (
              <span className="text-sm font-semibold">{bidDisabledReason}</span>
            )}
          </button>
        </div>
      )}

      {/* HOST CONTROLS & TEAM PADDLES */}
      {isHost && (
        <div className="bg-[var(--color-surface-elevated)] border-2 border-amber-400/80 rounded-2xl p-4 shadow-md space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold font-display uppercase tracking-wider text-amber-700 dark:text-amber-300 flex items-center space-x-1">
              <Gavel className="w-4 h-4 text-amber-600" />
              <span>Host Console & Team Paddles</span>
            </span>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200">
              Host Authority
            </span>
          </div>

          {/* SQUAD REQUIREMENT FULFILLED BANNER: Appears ONLY when all teams have met minimum required players */}
          {allTeamsMetMin && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-400 dark:border-emerald-700 rounded-xl space-y-2">
              <div className="flex items-center space-x-2 text-emerald-800 dark:text-emerald-200">
                <Award className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="text-xs font-bold font-display uppercase tracking-wide">
                  All Squad Targets Met ({minSquad}+ Players Each)!
                </span>
              </div>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                Every team has reached the required roster size. You can conclude the auction now instead of cycling through remaining players.
              </p>
              <button
                type="button"
                disabled={hostActionLoading}
                onClick={handleHostEndAuction}
                className="w-full min-h-[40px] py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-display text-xs font-bold uppercase tracking-wider transition active:scale-[0.98] cursor-pointer flex items-center justify-center space-x-1.5 shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Finish Auction Early</span>
              </button>
            </div>
          )}

          <div>
            <span className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase tracking-wider mb-1.5">
              Tap a Paddle to Bid For That Team:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 max-h-36 overflow-y-auto">
              {teamsList.map((t) => {
                const tMaxSquad = room?.settings?.maxSquadSize || room?.settings?.squadSize || 25;
                const tPlayerCount = t.players?.length || 0;
                const tSlots = tMaxSquad - tPlayerCount;
                const tMaxBid = calculateMaxBid(
                  {
                    ...t,
                    players: t.players || [],
                  },
                  tMaxSquad
                );

                const step = room?.settings?.bidStep || 0.5;
                const nextStepAmount = Number(
                  (isFirstBid
                    ? lot?.player?.basePrice || 0.5
                    : (currentBid || 0) + step
                  ).toFixed(2)
                );

                const canPaddleBid =
                  Boolean(lot) &&
                  tSlots > 0 &&
                  lot?.leadingTeamId !== t.id &&
                  nextStepAmount <= tMaxBid &&
                  nextStepAmount <= t.purse;

                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={!canPaddleBid || bidding}
                    onClick={() => {
                      setHostPaddleTeamId(t.id);
                      handlePlaceBid(t.id, nextStepAmount, isFirstBid ? 0 : 1);
                    }}
                    className={`min-h-[44px] px-2 py-1.5 rounded-lg border text-left transition flex flex-col justify-between ${
                      lot?.leadingTeamId === t.id
                        ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40'
                        : canPaddleBid
                        ? 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-primary-light)]'
                        : 'opacity-40 border-dashed border-gray-300 dark:border-gray-800 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display font-black text-xs text-[var(--color-text-main)] truncate">
                        {t.shortName}
                      </span>
                      {lot?.leadingTeamId === t.id && (
                        <span className="text-[9px] font-bold text-amber-600 uppercase">Lead</span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-[var(--color-text-muted)] flex justify-between">
                      <span>₹{t.purse} left</span>
                      <span className="font-bold text-[var(--color-primary)]">
                        +₹{nextStepAmount}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sold / Unsold / Undo Buttons */}
          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[var(--color-border)]">
            <button
              type="button"
              disabled={hostActionLoading || !lot || lot.currentBid === null || !lot.leadingTeamId}
              onClick={handleHostSold}
              className={`min-h-[44px] py-2 px-3 rounded-xl font-display text-base font-black uppercase tracking-wider transition shadow-sm flex items-center justify-center space-x-1 ${
                Boolean(lot && lot.currentBid !== null && lot.leadingTeamId && !hostActionLoading)
                  ? 'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white cursor-pointer active:scale-95'
                  : 'bg-gray-300 dark:bg-gray-800 text-gray-500 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>SOLD</span>
            </button>

            <button
              type="button"
              disabled={hostActionLoading || !lot}
              onClick={handleHostUnsold}
              className="min-h-[44px] py-2 px-3 rounded-xl bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-main)] font-display text-base font-bold uppercase tracking-wider transition flex items-center justify-center space-x-1 cursor-pointer active:scale-95"
            >
              <XCircle className="w-4 h-4 text-gray-500" />
              <span>UNSOLD</span>
            </button>

            <button
              type="button"
              disabled={hostActionLoading || !lot || (lot.bidHistory?.length || 0) === 0}
              onClick={handleHostUndo}
              className={`min-h-[44px] py-2 px-3 rounded-xl border text-xs font-bold uppercase tracking-wider transition flex items-center justify-center space-x-1 ${
                Boolean(lot && (lot.bidHistory?.length || 0) > 0 && !hostActionLoading)
                  ? 'bg-amber-100 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 hover:bg-amber-200 cursor-pointer active:scale-95'
                  : 'bg-gray-200 dark:bg-gray-800 border-gray-300 dark:border-gray-800 text-gray-400 cursor-not-allowed'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>UNDO</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};