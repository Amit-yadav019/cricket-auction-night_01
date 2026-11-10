import React, { useState, useEffect, useRef } from 'react';
import {
  Gavel,
  RotateCcw,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ArrowUp,
  Clock,
  Sparkles,
  RefreshCw,
  Trophy,
  Volume2,
  VolumeX,
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
  getValidNextBids,
  PlayerRole,
} from '../game/auctionRules';
import {
  playBidChime,
  playGavelHit,
  playUnsoldChime,
  playUndoSound,
  playOutbidSound,
  playWarningSound,
  speakAuctioneer,
} from '../utils/audio';
import { fetchAiCommentary } from '../services/aiService';

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

  // Selected raise multiplier for owner (0 for first bid, 1, 2, or 4)
  const [selectedMultiplier, setSelectedMultiplier] = useState<number>(1);

  // Host selected paddle team (for host bidding on behalf of teams)
  const [hostPaddleTeamId, setHostPaddleTeamId] = useState<string>(
    room.teams[0]?.id || ''
  );

  // Track stamp visibility for 2.5s
  const [showStamp, setShowStamp] = useState(false);
  const [lastStampResult, setLastStampResult] = useState(room.lastResult);
  const [isScreenShaking, setIsScreenShaking] = useState(false);

  // AI Live Commentary & Voice Narration
  const [aiCommentary, setAiCommentary] = useState<string>('');
  const [isGeneratingCommentary, setIsGeneratingCommentary] = useState<boolean>(false);
  const [voiceNarration, setVoiceNarration] = useState<boolean>(false);

  const prevLeadingTeamIdRef = useRef<string | null>(null);
  const prevBidCountRef = useRef<number>(0);

  // Check if host heartbeat is stale (> 25 seconds ago)
  const [isHostOffline, setIsHostOffline] = useState(false);

  useEffect(() => {
    const checkHeartbeat = () => {
      const diff = Date.now() - (room.hostHeartbeat || 0);
      setIsHostOffline(diff > 25000);
    };
    checkHeartbeat();
    const interval = setInterval(checkHeartbeat, 5000);
    return () => clearInterval(interval);
  }, [room.hostHeartbeat]);

  // Stamp animation trigger when lastResult changes
  useEffect(() => {
    if (room.lastResult && room.lastResult.timestamp !== lastStampResult?.timestamp) {
      setLastStampResult(room.lastResult);
      setShowStamp(true);
      setIsScreenShaking(true);
      setTimeout(() => setIsScreenShaking(false), 400);

      if (soundEnabled) {
        if (room.lastResult.type === 'SOLD') playGavelHit();
        else playUnsoldChime();
      }

      // Fetch AI Sold/Unsold Commentary
      const foundPlayer = room.allPlayers.find((p) => p.name === room.lastResult?.playerName);
      fetchAiCommentary({
        player: {
          name: room.lastResult.playerName,
          role: foundPlayer?.role || 'BAT',
          basePrice: foundPlayer?.basePrice || 0.5,
        },
        teamName: room.lastResult.teamName,
        event: room.lastResult.type === 'SOLD' ? 'sold' : 'unsold',
        bidAmount: room.lastResult.amount,
        purseUnit: room.settings.purseUnit,
      }).then((line) => {
        setAiCommentary(line);
        if (voiceNarration && soundEnabled) speakAuctioneer(line);
      });

      const timer = setTimeout(() => setShowStamp(false), 2600);
      return () => clearTimeout(timer);
    }
  }, [room.lastResult, soundEnabled, voiceNarration]);

  // AI Commentary trigger on new lot entering the podium
  useEffect(() => {
    if (!room.currentLot) return;
    const currentLotPlayer = room.currentLot.player;
    setIsGeneratingCommentary(true);

    fetchAiCommentary({
      player: {
        name: currentLotPlayer.name,
        role: currentLotPlayer.role,
        basePrice: currentLotPlayer.basePrice,
      },
      event: 'lot_start',
      purseUnit: room.settings.purseUnit,
    }).then((line) => {
      setAiCommentary(line);
      setIsGeneratingCommentary(false);
      if (voiceNarration && soundEnabled) speakAuctioneer(line);
    });
  }, [room.currentLot?.player.id]);

  // Detect outbid and bid audio cues
  useEffect(() => {
    if (!room.currentLot) return;
    const bids = room.currentLot.bidHistory;
    if (bids.length > prevBidCountRef.current) {
      const latest = bids[0];
      const myTeam = room.teams.find((t) => t.ownerToken === ownerToken);

      // Play outbid warning if user's team held the lead and just lost it
      if (
        myTeam &&
        prevLeadingTeamIdRef.current === myTeam.id &&
        latest.teamId !== myTeam.id
      ) {
        if (soundEnabled) playOutbidSound();
      } else {
        if (soundEnabled) playBidChime(latest.amount);
      }
    }
    prevBidCountRef.current = bids.length;
    prevLeadingTeamIdRef.current = room.currentLot.leadingTeamId;
  }, [room.currentLot?.bidHistory.length, room.currentLot?.leadingTeamId, ownerToken, soundEnabled]);

  const lot = room.currentLot;
  const currentBid = lot?.currentBid ?? null;
  const isFirstBid = currentBid === null;

  // Determine which team the current user is bidding for
  const myClaimedTeam = room.teams.find((t) => t.ownerToken === ownerToken);
  // For host, if no claimed team, use hostPaddleTeamId
  const activeBiddingTeam = isHost
    ? room.teams.find((t) => t.id === hostPaddleTeamId) || myClaimedTeam || room.teams[0]
    : myClaimedTeam;

  const teamPlayerCount = activeBiddingTeam ? activeBiddingTeam.players.length : 0;
  const teamPurse = activeBiddingTeam ? activeBiddingTeam.purse : 0;

  const lowestBasePrice = Math.min(...room.allPlayers.map((p) => p.basePrice), 0.5);

  // Calculate stats for the active bidding team
  const maxSquad = room.settings.maxSquadSize || room.settings.squadSize;
  const minSquad = room.settings.minSquadSize || maxSquad;
  const slotsLeft = maxSquad - teamPlayerCount;
  const maxAllowedBid = activeBiddingTeam
    ? calculateMaxBid(
        teamPurse,
        teamPlayerCount,
        maxSquad,
        lowestBasePrice,
        minSquad
      )
    : 0;

  // Valid next bids
  const validNextBids = lot
    ? getValidNextBids(currentBid, lot.player.basePrice, room.settings.bidStep)
    : [];

  // Determine current selected bid amount
  let proposedBidAmount = 0;
  if (isFirstBid) {
    proposedBidAmount = lot?.player.basePrice || 0;
  } else {
    const match = validNextBids.find((b) => b.multiplier === selectedMultiplier);
    proposedBidAmount = match
      ? match.amount
      : validNextBids[0]?.amount || (currentBid || 0) + room.settings.bidStep;
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
    if (!lot) return;
    const targetTeam = overrideTeamId
      ? room.teams.find((t) => t.id === overrideTeamId)
      : activeBiddingTeam;

    if (!targetTeam) return;

    const amount = overrideAmount ?? proposedBidAmount;
    const mult = overrideMult ?? (isFirstBid ? 0 : selectedMultiplier);

    setBidding(true);
    setBiddingError('');

    const res = await placeBidTransaction(
      room.code,
      targetTeam.id,
      amount,
      mult,
      lot.currentBid,
      lot.player.id,
      isHost ? hostToken : undefined
    );

    setBidding(false);
    if (!res.success) {
      setBiddingError(res.error || 'Bid rejected');
      setTimeout(() => setBiddingError(''), 4000);
    } else {
      if (soundEnabled) playBidChime();
    }
  };

  // Host action: Sold
  const handleHostSold = async () => {
    if (!isHost || hostActionLoading) return;
    setHostActionLoading(true);
    const res = await markSoldTransaction(room.code, hostToken);
    setHostActionLoading(false);
    if (!res.success) {
      setBiddingError(res.error || 'Failed to mark sold');
    }
  };

  // Host action: Unsold
  const handleHostUnsold = async () => {
    if (!isHost || hostActionLoading) return;
    setHostActionLoading(true);
    const res = await markUnsoldTransaction(room.code, hostToken);
    setHostActionLoading(false);
    if (!res.success) {
      setBiddingError(res.error || 'Failed to mark unsold');
    }
  };

  // Host action: Undo
  const handleHostUndo = async () => {
    if (!isHost || hostActionLoading) return;
    setHostActionLoading(true);
    const res = await undoLastBidTransaction(room.code, hostToken);
    setHostActionLoading(false);
    if (!res.success) {
      setBiddingError(res.error || 'Failed to undo bid');
    } else {
      if (soundEnabled) playUndoSound();
    }
  };

  // Host action: Re-auction
  const handleHostReAuction = async () => {
    if (!isHost || hostActionLoading) return;
    setHostActionLoading(true);
    const res = await reAuctionUnsoldTransaction(room.code, hostToken);
    setHostActionLoading(false);
    if (!res.success) {
      setBiddingError(res.error || 'Failed to re-auction');
    }
  };

  // Host action: End Auction
  const handleHostEndAuction = async () => {
    if (!isHost || hostActionLoading) return;
    if (!confirm('Conclude the auction and view final squad summaries?')) return;
    setHostActionLoading(true);
    const res = await endAuctionTransaction(room.code, hostToken);
    setHostActionLoading(false);
    if (!res.success) {
      setBiddingError(res.error || 'Failed to end auction');
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

  // Round ended screen: show options for re-auction or end
  if (room.status === 'round_ended') {
    const unsoldPlayers = room.allPlayers.filter((p) => p.status === 'unsold');
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
            available and teams with open squad slots.
          </p>

          {isHost ? (
            <div className="mt-6 space-y-3">
              <button
                type="button"
                disabled={hostActionLoading}
                onClick={handleHostReAuction}
                className="w-full min-h-[48px] py-3.5 px-6 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-display text-lg font-bold uppercase tracking-wider shadow-md transition active:scale-[0.99] flex items-center justify-center space-x-2 cursor-pointer"
              >
                <RefreshCw className="w-5 h-5" />
                <span>Re-auction Unsold ({unsoldPlayers.length})</span>
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
      lot.bidHistory.length >= 2 &&
      lot.bidHistory[0].timestamp - lot.bidHistory[1].timestamp < 14000 &&
      lot.bidHistory[0].teamId !== lot.bidHistory[1].teamId
  );

  return (
    <div className={`w-full max-w-[540px] mx-auto px-4 py-3 space-y-3 ${isScreenShaking ? 'shake-active' : ''}`}>
      {/* Offline Banner for Owners */}
      {!isHost && isHostOffline && (
        <div className="p-3 bg-red-600 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 shadow-md animate-pulse">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>The host is offline. Waiting for host reconnection...</span>
        </div>
      )}

      {/* Navigation Tabs (Auction / Squads / Log / Summary) */}
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

      {/* Error notification if simultaneous bid or failure */}
      {biddingError && (
        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 rounded-xl text-center text-xs font-bold text-amber-900 dark:text-amber-100 animate-bounce">
          {biddingError}
        </div>
      )}

      {/* CURRENT PLAYER CARD */}
      {lot ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm relative overflow-hidden">
          {/* Animated SOLD / UNSOLD Rubber Stamp with authentic ink look */}
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

          {/* Top Info Bar */}
          <div className="flex items-center justify-between mb-2">
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full border ${getRoleBadgeColor(
                lot.player.role
              )}`}
            >
              {lot.player.role}
            </span>
            <span className="text-xs font-bold text-[var(--color-text-dim)] font-mono">
              Base: ₹{lot.player.basePrice} {room.settings.purseUnit}
            </span>
          </div>

          {/* Player Name */}
          <div className="text-center my-1">
            <h2 className="text-2xl sm:text-3xl font-black font-display tracking-wide uppercase text-[var(--color-text-main)]">
              {lot.player.name}
            </h2>
          </div>

          {/* Big Current Bid Number */}
          <div className="my-3 text-center bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl py-3 px-4">
            {isBiddingWar && (
              <div className="mb-2 inline-flex items-center space-x-1 px-3 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black font-display uppercase tracking-wider bidding-war-pulse shadow-sm">
                <Flame className="w-3.5 h-3.5 fill-white" />
                <span>Bidding War in Progress!</span>
              </div>
            )}
            <div className="text-[11px] font-bold font-display uppercase tracking-wider text-[var(--color-text-muted)]">
              {lot.currentBid === null ? 'Starting Bid Required' : 'Current Leading Bid'}
            </div>
            <div className="text-4xl sm:text-5xl font-black font-display tracking-tight text-[var(--color-accent)] scoreboard-num mt-0.5">
              ₹ {lot.currentBid !== null ? lot.currentBid : lot.player.basePrice}{' '}
              <span className="text-2xl font-bold">{room.settings.purseUnit}</span>
            </div>

            {/* Leading Team Banner */}
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
          </div>

          {/* AI AUCTIONEER COMMENTARY BOX */}
          <div className="mb-3 bg-gradient-to-r from-emerald-500/10 via-amber-500/10 to-emerald-500/5 border border-emerald-500/30 dark:border-emerald-500/40 rounded-xl p-3 shadow-xs relative">
            <div className="flex items-start space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-[var(--color-primary)] text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-xs">
                <Sparkles className="w-4 h-4 text-amber-300" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black font-display uppercase tracking-wider text-[var(--color-primary)] flex items-center space-x-1.5">
                    <span>AI Auctioneer Commentary</span>
                    {isGeneratingCommentary && <span className="animate-pulse">🎙️...</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !voiceNarration;
                      setVoiceNarration(next);
                      if (next && aiCommentary) speakAuctioneer(aiCommentary);
                    }}
                    title={voiceNarration ? 'Mute AI voice' : 'Enable AI voice narration'}
                    className={`px-2 py-0.5 rounded-md text-[10px] flex items-center space-x-1 font-bold transition cursor-pointer ${
                      voiceNarration
                        ? 'bg-[var(--color-primary)] text-white shadow-xs'
                        : 'bg-black/5 dark:bg-white/10 text-[var(--color-text-dim)] hover:text-[var(--color-text-main)]'
                    }`}
                  >
                    {voiceNarration ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                    <span>{voiceNarration ? 'Voice ON' : 'Voice OFF'}</span>
                  </button>
                </div>
                <p className="text-xs font-semibold text-[var(--color-text-main)] mt-1 leading-snug italic">
                  "{aiCommentary || `${lot.player.name} (${lot.player.role}) is in the auction ring! Let's see those paddles up!`}"
                </p>
              </div>
            </div>
          </div>

          {/* Last 4 Bids Feed */}
          {lot.bidHistory.length > 0 && (
            <div className="space-y-1 mb-2">
              <div className="text-[10px] font-bold text-[var(--color-text-dim)] uppercase tracking-wider">
                Recent Bids
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
                {lot.bidHistory.slice(0, 4).map((b, i) => (
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

          {/* Last Result Notice Line */}
          {room.lastResult && (
            <div className="mt-2 pt-2 border-t border-[var(--color-border)] text-[11px] text-[var(--color-text-muted)] text-center truncate">
              <span className="font-semibold text-[var(--color-text-dim)]">Last: </span>
              <span className="font-bold text-[var(--color-text-main)]">{room.lastResult.playerName}</span>
              {room.lastResult.type === 'SOLD' ? (
                <span>
                  {' '}sold to <strong className="text-[var(--color-primary)]">{room.lastResult.teamName}</strong> for ₹{room.lastResult.amount} {room.settings.purseUnit}
                </span>
              ) : (
                <span className="text-gray-500"> marked unsold</span>
              )}
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
      {activeBiddingTeam ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 shadow-sm space-y-3">
          {/* Team Info Banner */}
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
              <div className="h-6 w-[1px] bg-[var(--color-border)]"></div>
              <div>
                <span className="block text-[10px] font-semibold text-[var(--color-text-dim)]">
                  Purse Left
                </span>
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  ₹{teamPurse}
                </span>
              </div>
              <div className="h-6 w-[1px] bg-[var(--color-border)]"></div>
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

          {/* Raise Chips (+1x, +2x, +4x) */}
          {!isFirstBid && (
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-[var(--color-text-dim)] uppercase tracking-wider">
                Select Raise Amount
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 4].map((mult) => {
                  const targetAmount = Number(
                    ((currentBid || 0) + mult * room.settings.bidStep).toFixed(2)
                  );
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
                          : 'opacity-40 border-dashed border-gray-300 dark:border-gray-700 cursor-not-allowed text-gray-400'
                      }`}
                    >
                      <span className="text-[11px] font-display font-extrabold uppercase tracking-wide">
                        +{mult}× ({mult * room.settings.bidStep})
                      </span>
                      <span className="text-xs font-mono font-bold">₹{targetAmount}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* The Big Bid Button */}
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
                  BID ₹{proposedBidAmount} {room.settings.purseUnit}
                </span>
              </>
            ) : (
              <span className="text-sm font-semibold">{bidDisabledReason}</span>
            )}
          </button>
        </div>
      ) : (
        <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl text-center">
          <p className="text-xs text-[var(--color-text-muted)] font-semibold">
            You haven't claimed a team yet. Go to Lobby or Squads to claim an open team.
          </p>
        </div>
      )}

      {/* HOST CONTROLS & TEAM PADDLES (HOST ONLY) */}
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

          {/* Quick Team Paddles */}
          <div>
            <span className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase tracking-wider mb-1.5">
              Tap a Paddle to Bid for That Team:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 max-h-36 overflow-y-auto">
              {room.teams.map((t) => {
                const tMaxSquad = room.settings.maxSquadSize || room.settings.squadSize;
                const tMinSquad = room.settings.minSquadSize || tMaxSquad;
                const tSlots = tMaxSquad - t.players.length;
                const tMaxBid = calculateMaxBid(
                  t.purse,
                  t.players.length,
                  tMaxSquad,
                  lowestBasePrice,
                  tMinSquad
                );
                const nextStepAmount = Number(
                  (isFirstBid
                    ? lot?.player.basePrice || 0
                    : (currentBid || 0) + room.settings.bidStep
                  ).toFixed(2)
                );
                const canPaddleBid =
                  lot &&
                  tSlots > 0 &&
                  lot.leadingTeamId !== t.id &&
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

          {/* Sold / Unsold / Undo Control Buttons */}
          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[var(--color-border)]">
            <button
              type="button"
              disabled={hostActionLoading || !lot || lot.currentBid === null || !lot.leadingTeamId}
              onClick={handleHostSold}
              className={`min-h-[46px] py-2 px-3 rounded-xl font-display text-base font-black uppercase tracking-wider transition shadow-sm flex items-center justify-center space-x-1 ${
                lot && lot.currentBid !== null && lot.leadingTeamId && !hostActionLoading
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
              className="min-h-[46px] py-2 px-3 rounded-xl bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-main)] font-display text-base font-bold uppercase tracking-wider transition flex items-center justify-center space-x-1 cursor-pointer active:scale-95"
            >
              <XCircle className="w-4 h-4 text-gray-500" />
              <span>UNSOLD</span>
            </button>

            <button
              type="button"
              disabled={hostActionLoading || !lot || lot.bidHistory.length === 0}
              onClick={handleHostUndo}
              className={`min-h-[46px] py-2 px-3 rounded-xl border text-xs font-bold uppercase tracking-wider transition flex items-center justify-center space-x-1 ${
                lot && lot.bidHistory.length > 0 && !hostActionLoading
                  ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 hover:bg-amber-200 cursor-pointer active:scale-95'
                  : 'bg-gray-200 dark:bg-gray-800/40 border-gray-300 dark:border-gray-800 text-gray-400 cursor-not-allowed'
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
