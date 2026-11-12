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
  Hand,
  Clock,
  PauseCircle,
  PlayCircle,
  Music,
  Zap,
  Sparkles,
  Bot,
  Eye,
} from 'lucide-react';
import {
  RoomData,
  placeBidTransaction,
  markSoldTransaction,
  markUnsoldTransaction,
  undoLastBidTransaction,
  reAuctionUnsoldTransaction,
  endAuctionTransaction,
  toggleThinkingTimeTransaction,
  sendTableReactionTransaction,
  toggleAiBotTeamTransaction,
} from '../services/auctionService';
import {
  calculateMaxBid,
  PlayerRole,
  Team,
  PitchProfile,
} from '../game/auctionRules';
import {
  playBidChime,
  playGavelHit,
  playUnsoldChime,
  playUndoSound,
  playOutbidSound,
  speakAuctioneer,
} from '../utils/audio';
import { sound } from '../services/soundService';
import { evaluateAiBotBid } from '../services/aiService';

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

const OPENING_UNSOLD_SECONDS = 8.0;
const POST_BID_SOLD_SECONDS = 6.0;
const HOLD_DURATION_SECONDS = 10;

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
  const [thinkingLoading, setThinkingLoading] = useState(false);

  const [autoTimerEnabled, setAutoTimerEnabled] = useState<boolean>(true);
  const [lotSecondsLeft, setLotSecondsLeft] = useState<number>(OPENING_UNSOLD_SECONDS);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState<number>(0);
  const [bgmActive, setBgmActive] = useState<boolean>(false);

  const [playerHoldCount, setPlayerHoldCount] = useState<number>(0);
  const [selectedMultiplier, setSelectedMultiplier] = useState<number>(1);

  const teamsList: Team[] = Array.isArray(room?.teams)
    ? (room.teams as Team[])
    : Object.values(room?.teams || {});

  const [hostPaddleTeamId, setHostPaddleTeamId] = useState<string>(
    teamsList[0]?.id || ''
  );

  const [lastStampTs, setLastStampTs] = useState<number | undefined>(room?.lastResult?.timestamp);
  const [isScreenShaking, setIsScreenShaking] = useState(false);
  const [voiceNarration, setVoiceNarration] = useState<boolean>(false);

  const prevLeadingTeamIdRef = useRef<string | null>(null);
  const prevBidCountRef = useRef<number>(0);
  const prevThinkingTsRef = useRef<number | null>(null);
  const autoHammerLockRef = useRef<string | null>(null);
  const lotDeadlineRef = useRef<number>(Date.now() + OPENING_UNSOLD_SECONDS * 1000);
  const lastTickSecondRef = useRef<number>(-1);

  const [isHostOffline, setIsHostOffline] = useState(false);

  const lot = room?.currentLot;
  const currentBid = lot?.currentBid ?? null;
  const isFirstBid = currentBid === null;
  const thinkingAlert = (room as any)?.thinkingAlert;
  const isHoldActive = Boolean(thinkingAlert && holdSecondsLeft > 0);
  const maxSquad = room?.settings?.maxSquadSize || room?.settings?.squadSize || 25;
  const minSquad = room?.settings?.minSquadSize || maxSquad;
  const pitchProfile: PitchProfile = (room?.settings as any)?.pitchProfile || 'balanced';

  // Reset hold counter & 8.0-second opening timer when a new player arrives
  useEffect(() => {
    if (!lot?.player?.id) return;
    setPlayerHoldCount(0);
    setBiddingError('');
    setSelectedMultiplier(1);
    autoHammerLockRef.current = null;
    lastTickSecondRef.current = -1;

    const initialDuration = lot.currentBid === null ? OPENING_UNSOLD_SECONDS : POST_BID_SOLD_SECONDS;
    lotDeadlineRef.current = Date.now() + initialDuration * 1000;
    setLotSecondsLeft(initialDuration);
  }, [lot?.player?.id]);

  // Reset to 6.0 seconds every time a new bid is placed
  useEffect(() => {
    if (!lot?.player?.id) return;
    if (lot.currentBid !== null) {
      autoHammerLockRef.current = null;
      lastTickSecondRef.current = -1;
      lotDeadlineRef.current = Date.now() + POST_BID_SOLD_SECONDS * 1000;
      setLotSecondsLeft(POST_BID_SOLD_SECONDS);
    }
  }, [lot?.currentBid, lot?.leadingTeamId, lot?.bidHistory?.length]);

  // Smart AI Bot Auto-Bidding Loop (Runs on Host client for any team marked isAiBot)
  useEffect(() => {
    if (!isHost || !lot?.player || room?.status !== 'active' || isHoldActive) return;

    const aiTeams = teamsList.filter((t) => (t as any).isAiBot && t.id !== lot.leadingTeamId);
    if (aiTeams.length === 0) return;

    const timer = setTimeout(() => {
      const step = room?.settings?.bidStep || 0.5;
      const nextAmount = Number(
        (lot.currentBid === null ? lot.player.basePrice || 0.5 : lot.currentBid + step).toFixed(2)
      );

      for (const bot of aiTeams) {
        if (evaluateAiBotBid(bot, lot.player, nextAmount, minSquad, maxSquad, pitchProfile)) {
          handlePlaceBid(bot.id, nextAmount, lot.currentBid === null ? 0 : 1);
          break;
        }
      }
    }, 1800);

    return () => clearTimeout(timer);
  }, [isHost, lot?.player?.id, lot?.currentBid, lot?.leadingTeamId, room?.status, isHoldActive]);

  useEffect(() => {
    const checkHeartbeat = () => {
      const diff = Date.now() - (room?.hostHeartbeat || 0);
      setIsHostOffline(diff > 25000);
    };
    checkHeartbeat();
    const interval = setInterval(checkHeartbeat, 5000);
    return () => clearInterval(interval);
  }, [room?.hostHeartbeat]);

  // 10-Second Strategic Hold Countdown
  useEffect(() => {
    if (!thinkingAlert?.expiresAt) {
      setHoldSecondsLeft(0);
      return;
    }

    if (thinkingAlert.timestamp !== prevThinkingTsRef.current) {
      prevThinkingTsRef.current = thinkingAlert.timestamp;
      if (soundEnabled) sound.playTimeoutAlert();
    }

    const tick = () => {
      const remMs = thinkingAlert.expiresAt - Date.now();
      const remSec = Math.max(0, Number((remMs / 1000).toFixed(1)));
      setHoldSecondsLeft(remSec);

      const postHoldBuffer = lot?.currentBid === null ? OPENING_UNSOLD_SECONDS : POST_BID_SOLD_SECONDS;
      lotDeadlineRef.current = Date.now() + postHoldBuffer * 1000;

      if (remSec === 0 && isHost) {
        const roomIdentifier = room?.code || (room as any)?.roomCode;
        if (roomIdentifier) {
          toggleThinkingTimeTransaction(roomIdentifier, '', '', false);
        }
      }
    };

    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [thinkingAlert?.expiresAt, thinkingAlert?.timestamp, isHost, soundEnabled, room?.code, lot?.currentBid]);

  // Main 8s Unsold / 6s Sold Auto-Gavel Countdown Loop
  useEffect(() => {
    if (!lot?.player?.id || room?.status !== 'active' || !autoTimerEnabled) return;

    const interval = setInterval(() => {
      if (thinkingAlert?.expiresAt && thinkingAlert.expiresAt > Date.now()) {
        return;
      }

      const remainingMs = lotDeadlineRef.current - Date.now();
      const remainingSec = Math.max(0, Number((remainingMs / 1000).toFixed(1)));
      setLotSecondsLeft(remainingSec);

      const wholeSec = Math.ceil(remainingSec);
      if (wholeSec > 0 && wholeSec <= 5 && wholeSec !== lastTickSecondRef.current) {
        lastTickSecondRef.current = wholeSec;
        if (soundEnabled) sound.playCountdownTick();
      }

      if (remainingMs <= 0 && isHost && !hostActionLoading) {
        const lockKey = `${lot.player.id}_${lot.currentBid ?? 'none'}_${lot.bidHistory?.length || 0}`;
        if (autoHammerLockRef.current === lockKey) return;
        autoHammerLockRef.current = lockKey;

        const roomIdentifier = room?.code || (room as any)?.roomCode;
        if (!roomIdentifier) return;

        if (lot.currentBid !== null && lot.leadingTeamId) {
          markSoldTransaction(roomIdentifier, hostToken);
        } else {
          markUnsoldTransaction(roomIdentifier, hostToken);
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [
    lot?.player?.id,
    lot?.currentBid,
    lot?.leadingTeamId,
    lot?.bidHistory?.length,
    room?.status,
    autoTimerEnabled,
    thinkingAlert?.expiresAt,
    isHost,
    hostActionLoading,
    soundEnabled,
    room?.code,
    hostToken,
  ]);

  useEffect(() => {
    if (room?.lastResult && room.lastResult.timestamp !== lastStampTs) {
      setLastStampTs(room.lastResult.timestamp);
      setIsScreenShaking(true);
      setTimeout(() => setIsScreenShaking(false), 380);

      if (soundEnabled) {
        if (room.lastResult.type === 'SOLD') {
          playGavelHit();
          sound.playGavelCrack();
        } else {
          playUnsoldChime();
          sound.playUnsold();
        }
      }

      if (voiceNarration && soundEnabled) {
        const text =
          room.lastResult.type === 'SOLD'
            ? `${room.lastResult.playerName} sold to ${room.lastResult.teamName} for ${room.lastResult.amount} ${room.settings?.purseUnit || 'Crores'}`
            : `${room.lastResult.playerName} goes unsold.`;
        speakAuctioneer(text);
      }
    }
  }, [room?.lastResult?.timestamp, soundEnabled, voiceNarration, lastStampTs, room?.settings?.purseUnit]);

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
        if (soundEnabled && latest) {
          playBidChime(latest.amount);
          sound.playBid();
        }
      }
    }
    prevBidCountRef.current = bids.length;
    prevLeadingTeamIdRef.current = room.currentLot.leadingTeamId || null;
  }, [room?.currentLot?.bidHistory?.length, room?.currentLot?.leadingTeamId, ownerToken, soundEnabled, teamsList]);

  const myClaimedTeam = teamsList.find((t) => t.ownerToken === ownerToken);
  const activeBiddingTeam = isHost
    ? teamsList.find((t) => t.id === hostPaddleTeamId) || myClaimedTeam || teamsList[0]
    : myClaimedTeam;

  const teamPlayerCount = activeBiddingTeam ? (activeBiddingTeam.players?.length || 0) : 0;
  const teamPurse = activeBiddingTeam ? activeBiddingTeam.purse : 0;
  const slotsLeft = maxSquad - teamPlayerCount;

  const allTeamsMetMin =
    teamsList.length > 0 &&
    teamsList.every((t) => (t.players?.length || 0) >= minSquad);

  const maxAllowedBid = activeBiddingTeam
    ? calculateMaxBid(
        {
          ...activeBiddingTeam,
          players: activeBiddingTeam.players || [],
        },
        maxSquad
      )
    : 0;

  let proposedBidAmount = 0;
  if (isFirstBid) {
    proposedBidAmount = lot?.player?.basePrice || 0.5;
  } else {
    const step = room?.settings?.bidStep || 0.5;
    proposedBidAmount = Number(((currentBid || 0) + selectedMultiplier * step).toFixed(2));
  }

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
      } else {
        lotDeadlineRef.current = Date.now() + POST_BID_SOLD_SECONDS * 1000;
        setLotSecondsLeft(POST_BID_SOLD_SECONDS);
        if (thinkingAlert) {
          await toggleThinkingTimeTransaction(roomIdentifier, '', '', false);
        }
      }
    } catch (err: any) {
      setBiddingError(err?.message || 'Bidding transaction failed');
    } finally {
      setBidding(false);
    }
  };

  const handleTake10SecHold = async () => {
    const roomIdentifier = room?.code || (room as any)?.roomCode;
    if (!roomIdentifier || !myClaimedTeam) return;
    const nextCount = playerHoldCount + 1;
    setPlayerHoldCount(nextCount);
    setThinkingLoading(true);
    await toggleThinkingTimeTransaction(
      roomIdentifier,
      myClaimedTeam.id,
      myClaimedTeam.name,
      true,
      HOLD_DURATION_SECONDS,
      nextCount
    );
    setThinkingLoading(false);
  };

  const handleReleaseHold = async () => {
    const roomIdentifier = room?.code || (room as any)?.roomCode;
    if (!roomIdentifier) return;
    await toggleThinkingTimeTransaction(roomIdentifier, '', '', false);
  };

  const handleSendReaction = async (emoji: string, label: string) => {
    const roomIdentifier = room?.code || (room as any)?.roomCode;
    const sender = myClaimedTeam || activeBiddingTeam;
    if (!roomIdentifier || !sender) return;
    await sendTableReactionTransaction(
      roomIdentifier,
      sender.id,
      sender.shortName || sender.name.slice(0, 3).toUpperCase(),
      emoji,
      label
    );
  };

  const handleToggleBgm = () => {
    const active = sound.toggleBroadcastBgm();
    setBgmActive(active);
  };

  const handleHostSold = async () => {
    const roomIdentifier = room?.code || (room as any)?.roomCode;
    if (!isHost || hostActionLoading || !roomIdentifier) return;
    setHostActionLoading(true);
    try {
      const res = await markSoldTransaction(roomIdentifier, hostToken);
      if (!res?.success) {
        setBiddingError(res?.error || 'Failed to mark sold');
      } else {
        await toggleThinkingTimeTransaction(roomIdentifier, '', '', false);
      }
    } catch (err: any) {
      setBiddingError(err?.message || 'Transaction failed');
    } finally {
      setHostActionLoading(false);
    }
  };

  const handleHostUnsold = async () => {
    const roomIdentifier = room?.code || (room as any)?.roomCode;
    if (!isHost || hostActionLoading || !roomIdentifier) return;
    setHostActionLoading(true);
    try {
      const res = await markUnsoldTransaction(roomIdentifier, hostToken);
      if (!res?.success) {
        setBiddingError(res?.error || 'Failed to mark unsold');
      } else {
        await toggleThinkingTimeTransaction(roomIdentifier, '', '', false);
      }
    } catch (err: any) {
      setBiddingError(err?.message || 'Transaction failed');
    } finally {
      setHostActionLoading(false);
    }
  };

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
        lotDeadlineRef.current = Date.now() + POST_BID_SOLD_SECONDS * 1000;
      }
    } catch (err: any) {
      setBiddingError(err?.message || 'Transaction failed');
    } finally {
      setHostActionLoading(false);
    }
  };

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
        return 'bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/40';
      case 'WK':
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/40';
      case 'AR':
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/40';
      case 'BOWL':
        return 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/40';
    }
  };

  if (room?.status === 'round_ended') {
    const unsoldPlayers = (room.allPlayers || room.playerPool || []).filter(
      (p) => p.status === 'unsold'
    );
    return (
      <div className="w-full max-w-[540px] mx-auto px-4 py-8 text-center space-y-6">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-6 shadow-xl">
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

  const maxTimerWindow = isFirstBid ? OPENING_UNSOLD_SECONDS : POST_BID_SOLD_SECONDS;
  const timerPercent = Math.min(100, Math.max(0, (lotSecondsLeft / maxTimerWindow) * 100));

  // Live Value / Overpay Telemetry Tag
  const basePrice = lot?.player?.basePrice || 0.5;
  const priceRatio = currentBid ? currentBid / basePrice : 1;
  const valueBadge =
    currentBid && priceRatio >= 5
      ? { label: '💸 RECORD BIDDING WAR', color: 'bg-rose-500/15 text-rose-500 border-rose-500/40' }
      : currentBid && priceRatio <= 1.5 && basePrice >= 1.5
      ? { label: '🔥 STEAL VALUE', color: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40' }
      : null;

  // Upcoming Players Preview (when public pool is enabled)
  const upcomingPlayers =
    room?.settings?.poolVisibility !== 'hidden' && Array.isArray((room as any)?.queue)
      ? ((room as any).queue as any[]).slice(0, 3)
      : [];

  const getAuctioneerCallout = () => {
    if (isHoldActive) return '⏸️ HAMMER PAUSED — STRATEGY HUDDLE';
    if (lotSecondsLeft <= 1.5) {
      return isFirstBid ? '⚠️ FINAL CALL — GOING UNSOLD!' : '🔨 GOING TWICE... FINAL CALL!';
    }
    if (lotSecondsLeft <= 3.2) {
      return isFirstBid ? '⏳ ANY OPENING BIDS?' : '📢 GOING ONCE...';
    }
    return isFirstBid ? `OPENING BID WINDOW (${OPENING_UNSOLD_SECONDS}s)` : `ACTIVE BIDDING (${POST_BID_SOLD_SECONDS}s CLOCK)`;
  };

  return (
    <div
      className={`w-full max-w-[540px] mx-auto px-4 py-3 pb-16 space-y-3 relative ${
        isScreenShaking ? 'shake-action' : ''
      }`}
    >
      <div
        className="fixed inset-0 pointer-events-none -z-10"
        style={{
          background:
            'radial-gradient(circle at 50% 18%, rgba(245, 158, 11, 0.14), transparent 65%)',
        }}
      />

      {!isHost && isHostOffline && (
        <div className="p-3 bg-red-600 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 shadow-md animate-pulse">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>The host is offline. Waiting for host reconnection...</span>
        </div>
      )}

      {/* LIVE 10-SECOND STRATEGIC HOLD OVERLAY BANNER */}
      {isHoldActive && thinkingAlert && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-stone-950 p-3.5 shadow-[0_0_30px_rgba(245,158,11,0.5)] border-2 border-amber-200 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-stone-950 text-amber-400 flex items-center justify-center shadow-md animate-bounce">
                <PauseCircle className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-stone-950 text-amber-400">
                    HOLD #{thinkingAlert.holdCount || 1}
                  </span>
                  <span className="text-xs font-black uppercase tracking-wide">
                    {thinkingAlert.teamName}
                  </span>
                </div>
                <p className="text-[11px] font-bold text-stone-900 mt-0.5">
                  10s Thinking Window — Auto-Gavel Paused
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <div className="px-3 py-1 rounded-xl bg-stone-950 text-amber-400 font-mono font-black text-base shadow-inner">
                {holdSecondsLeft.toFixed(1)}s
              </div>

              {(isHost || (myClaimedTeam && thinkingAlert.teamId === myClaimedTeam.id)) && (
                <button
                  type="button"
                  onClick={handleReleaseHold}
                  className="px-2.5 py-1.5 bg-stone-950 hover:bg-stone-800 text-white rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer flex items-center space-x-1"
                >
                  <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Resume</span>
                </button>
              )}
            </div>
          </div>

          <div className="w-full h-1.5 bg-stone-950/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-stone-950 transition-all duration-100 ease-linear"
              style={{ width: `${Math.min(100, (holdSecondsLeft / HOLD_DURATION_SECONDS) * 100)}%` }}
            />
          </div>
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

      {/* NEXT UP IN QUEUE PREVIEW PILL */}
      {upcomingPlayers.length > 0 && (
        <div className="px-3 py-1.5 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)] flex items-center justify-between text-[10px] overflow-x-auto whitespace-nowrap space-x-2">
          <span className="font-display font-black uppercase tracking-wider text-[var(--color-primary)] flex items-center space-x-1 shrink-0">
            <Eye className="w-3 h-3" />
            <span>Next Up:</span>
          </span>
          <div className="flex items-center space-x-2 text-[var(--color-text-muted)]">
            {upcomingPlayers.map((up, i) => (
              <span key={up.id || i} className="font-medium">
                <strong className="text-[var(--color-text-main)]">{up.name}</strong> ({up.role})
                {i < upcomingPlayers.length - 1 ? ' •' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {biddingError && (
        <div
          onClick={() => setBiddingError('')}
          className="p-2.5 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 rounded-xl text-center text-xs font-bold text-amber-900 dark:text-amber-100 transition hover:opacity-85 cursor-pointer shadow-xs"
        >
          {biddingError} <span className="text-[10px] opacity-70 underline ml-1">(tap to dismiss)</span>
        </div>
      )}

      {/* BROADCAST PLAYER PODIUM CARD */}
      {lot ? (
        <div
          key={lot.player.id}
          className="bg-gradient-to-b from-[var(--color-surface-elevated)] to-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-4 sm:p-5 shadow-xl relative overflow-hidden transition-all duration-300"
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className={`text-xs font-black px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${getRoleBadgeColor(
                lot.player.role
              )}`}
            >
              {lot.player.role}
            </span>

            {autoTimerEnabled && (
              <div
                className={`px-3 py-1 rounded-full font-mono text-xs font-black flex items-center space-x-1.5 border shadow-xs transition-all ${
                  isHoldActive
                    ? 'bg-amber-500/20 border-amber-500 text-amber-500'
                    : lotSecondsLeft <= 2.0
                    ? 'bg-rose-600 text-white border-rose-400 animate-pulse scale-105'
                    : 'bg-[var(--color-surface-subtle)] border-[var(--color-border)] text-[var(--color-text-main)]'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {isHoldActive
                    ? 'PAUSED'
                    : `${lotSecondsLeft.toFixed(1)}s ${isFirstBid ? 'UNSOLD' : 'SOLD'}`}
                </span>
              </div>
            )}

            <span className="text-xs font-bold text-[var(--color-text-dim)] font-mono">
              Base: ₹{lot.player.basePrice} {room?.settings?.purseUnit || 'Cr'}
            </span>
          </div>

          {autoTimerEnabled && (
            <div className="w-full h-1.5 bg-[var(--color-surface-subtle)] rounded-full overflow-hidden mb-3 border border-[var(--color-border)]">
              <div
                className={`h-full transition-all duration-100 ease-linear ${
                  isHoldActive
                    ? 'bg-amber-400'
                    : lotSecondsLeft <= 2.0
                    ? 'bg-rose-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${isHoldActive ? 100 : timerPercent}%` }}
              />
            </div>
          )}

          <div className="text-center my-1">
            <h2 className="text-2xl sm:text-3xl font-black font-display tracking-wide uppercase text-[var(--color-text-main)] drop-shadow-xs">
              {lot.player.name}
            </h2>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2 mb-3">
            {lot.player.cappedStatus && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-[var(--color-text-dim)]">
                {lot.player.cappedStatus}
              </span>
            )}

            {(lot.player.role === 'BAT' || lot.player.role === 'WK' || lot.player.role === 'AR') &&
              lot.player.battingStyle && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-300">
                  🏏 {lot.player.battingStyle}
                </span>
              )}

            {(lot.player.role === 'BOWL' || lot.player.role === 'AR') &&
              lot.player.bowlingStyle && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-600 dark:text-purple-300">
                  ⚾ {lot.player.bowlingStyle}
                </span>
              )}

            {valueBadge && (
              <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${valueBadge.color}`}>
                {valueBadge.label}
              </span>
            )}
          </div>

          {/* Current Bid Scoreboard */}
          <div className="my-3 text-center bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-2xl py-3.5 px-4 shadow-inner">
            {isBiddingWar ? (
              <div className="mb-2 inline-flex items-center space-x-1 px-3 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black font-display uppercase tracking-wider bidding-war-pulse shadow-sm">
                <Flame className="w-3.5 h-3.5 fill-white" />
                <span>Bidding War In Progress!</span>
              </div>
            ) : (
              autoTimerEnabled && (
                <div
                  className={`mb-1.5 inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-black font-display uppercase tracking-wider ${
                    lotSecondsLeft <= 2.0 && !isHoldActive
                      ? 'bg-rose-500/20 text-rose-500 animate-pulse'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>{getAuctioneerCallout()}</span>
                </div>
              )
            )}

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

          {/* Broadcast Audio & BGM Controls */}
          <div className="mt-3 flex items-center justify-between pt-2 border-t border-[var(--color-border)]/60">
            <button
              type="button"
              onClick={handleToggleBgm}
              className={`px-2.5 py-1 rounded-lg text-[11px] flex items-center space-x-1 font-bold transition cursor-pointer ${
                bgmActive
                  ? 'bg-amber-500 text-stone-950 shadow-xs'
                  : 'bg-[var(--color-surface-subtle)] text-[var(--color-text-dim)] hover:text-[var(--color-text-main)]'
              }`}
            >
              <Music className="w-3.5 h-3.5" />
              <span>{bgmActive ? 'Arena BGM ON' : 'Arena BGM OFF'}</span>
            </button>

            <button
              type="button"
              onClick={() => setVoiceNarration(!voiceNarration)}
              className={`px-2.5 py-1 rounded-lg text-[11px] flex items-center space-x-1 font-bold transition cursor-pointer ${
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
            <div className="space-y-1 mt-2.5">
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

      {/* OWNER BIDDING CONTROLS, TABLE REACTIONS & UNLIMITED 10-SECOND HOLD */}
      {activeBiddingTeam && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-4 shadow-md space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
            <div className="truncate mr-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-dim)]">
                {isHost && !myClaimedTeam ? 'Host Bidding For' : 'Your Franchise'}
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
                        +{mult} ({(mult * step).toFixed(1)})
                      </span>
                      <span className="text-xs font-mono font-bold">₹{targetAmount}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bid + Unlimited 10s Hold Action Row */}
          <div className="flex items-stretch space-x-2">
            <button
              type="button"
              disabled={!canBid}
              onClick={() => handlePlaceBid()}
              className={`flex-1 min-h-[54px] py-3.5 px-4 rounded-2xl font-display text-xl font-black uppercase tracking-wider transition shadow-lg flex items-center justify-center space-x-2 ${
                canBid
                  ? 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white cursor-pointer active:scale-[0.98]'
                  : 'bg-gray-300 dark:bg-gray-800 text-gray-500 cursor-not-allowed'
              }`}
            >
              {bidding ? (
                <span>Submitting...</span>
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

            {myClaimedTeam && lot && (
              <button
                type="button"
                disabled={thinkingLoading}
                onClick={handleTake10SecHold}
                title="Pause the auto-gavel for 10 seconds (Unlimited uses per player)"
                className="px-4 py-2 rounded-2xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-display font-black text-xs uppercase tracking-wider transition shadow-lg cursor-pointer flex flex-col items-center justify-center active:scale-95 shrink-0"
              >
                <div className="flex items-center space-x-1">
                  <Hand className="w-4 h-4" />
                  <span>+10s HOLD</span>
                </div>
                <span className="text-[9px] font-mono font-bold opacity-80">
                  {playerHoldCount > 0 ? `Used ${playerHoldCount}x` : 'Pause Hammer'}
                </span>
              </button>
            )}
          </div>

          {/* QUICK-TAP TABLE REACTIONS & BLUFFS */}
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            {[
              { emoji: '👀', label: 'Watching' },
              { emoji: '🔥', label: 'Price Up!' },
              { emoji: '🤝', label: 'Good Buy' },
              { emoji: '❌', label: 'We Are Out' },
            ].map((rx) => (
              <button
                key={rx.label}
                type="button"
                onClick={() => handleSendReaction(rx.emoji, rx.label)}
                className="py-1.5 px-2 rounded-xl bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-[10px] font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] transition cursor-pointer flex items-center justify-center space-x-1 active:scale-95"
              >
                <span>{rx.emoji}</span>
                <span className="truncate">{rx.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* HOST CONTROLS, AI BOT SEATS & MANUAL OVERRIDES */}
      {isHost && (
        <div className="bg-[var(--color-surface-elevated)] border-2 border-amber-400/80 rounded-3xl p-4 shadow-md space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold font-display uppercase tracking-wider text-amber-700 dark:text-amber-300 flex items-center space-x-1">
              <Gavel className="w-4 h-4 text-amber-600" />
              <span>Host Console & AI Seats</span>
            </span>

            <button
              type="button"
              onClick={() => setAutoTimerEnabled(!autoTimerEnabled)}
              className={`text-[10px] font-mono font-black px-2.5 py-1 rounded-lg border cursor-pointer flex items-center space-x-1 transition ${
                autoTimerEnabled
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
                  : 'bg-[var(--color-surface-subtle)] text-[var(--color-text-dim)] border-[var(--color-border)]'
              }`}
            >
              <Zap className="w-3 h-3" />
              <span>{autoTimerEnabled ? 'Auto-Gavel ON (8s/6s)' : 'Manual Mode'}</span>
            </button>
          </div>

          {allTeamsMetMin && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-400 dark:border-emerald-700 rounded-xl space-y-2">
              <div className="flex items-center space-x-2 text-emerald-800 dark:text-emerald-200">
                <Award className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="text-xs font-bold font-display uppercase tracking-wide">
                  All Squad Targets Met ({minSquad}+ Players Each)!
                </span>
              </div>
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
              Tap Paddle to Bid · Toggle 🤖 AI Bot on Empty Seats:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 max-h-40 overflow-y-auto">
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

                const isAi = Boolean((t as any).isAiBot);
                const isUnclaimed = !t.ownerToken || isAi;

                return (
                  <div
                    key={t.id}
                    className={`rounded-lg border p-1.5 flex flex-col justify-between space-y-1 ${
                      lot?.leadingTeamId === t.id
                        ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                    }`}
                  >
                    <button
                      type="button"
                      disabled={!canPaddleBid || bidding}
                      onClick={() => {
                        setHostPaddleTeamId(t.id);
                        handlePlaceBid(t.id, nextStepAmount, isFirstBid ? 0 : 1);
                      }}
                      className="text-left w-full cursor-pointer disabled:opacity-40"
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
                        <span>₹{t.purse}</span>
                        <span className="font-bold text-[var(--color-primary)]">+₹{nextStepAmount}</span>
                      </div>
                    </button>

                    {isUnclaimed && (
                      <button
                        type="button"
                        onClick={() =>
                          toggleAiBotTeamTransaction(room.code, t.id, !isAi)
                        }
                        className={`w-full py-0.5 px-1 rounded text-[9px] font-black uppercase flex items-center justify-center space-x-1 cursor-pointer ${
                          isAi
                            ? 'bg-blue-600 text-white'
                            : 'bg-[var(--color-surface-subtle)] text-[var(--color-text-dim)] hover:text-[var(--color-text-main)]'
                        }`}
                      >
                        <Bot className="w-2.5 h-2.5" />
                        <span>{isAi ? 'AI Active' : '+ AI Bot'}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

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