import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Flame,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Zap,
  Crown,
  Medal,
  AlertTriangle,
  Users,
  Check,
  Layers,
  TrendingUp,
  ArrowDownUp,
  ShieldAlert,
  BarChart3,
  Award,
  PlayCircle,
  Repeat,
  X,
  Send,
  Swords,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  RoomData,
  resetAuctionTransaction,
  submitTeamLineupTransaction,
  saveMasterScoutReport,
  reAuctionUnsoldTransaction,
  proposeTradeTransaction,
  respondTradeTransaction,
  TradeProposal,
} from '../services/auctionService';
import { PlayerRole, Team, Player } from '../game/auctionRules';
import { sound } from '../services/soundService';
import {
  generateMasterScoutReport,
  MasterScoutReport,
  simulateMiniTournament,
  TournamentSimulationResult,
} from '../services/aiService';

interface CompletedViewProps {
  room: RoomData | null;
  isHost: boolean;
  hostToken: string;
  onOpenSummary?: () => void;
}

export const CompletedView: React.FC<CompletedViewProps> = ({
  room,
  isHost,
  hostToken,
  onOpenSummary,
}) => {
  const [resetting, setResetting] = useState(false);
  const [reAuctioning, setReAuctioning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [submittingLineup, setSubmittingLineup] = useState(false);
  const [lineupSuccessMsg, setLineupSuccessMsg] = useState('');
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [hasInitializedLineup, setHasInitializedLineup] = useState(false);

  // Tournament Simulation State
  const [simResult, setSimResult] = useState<TournamentSimulationResult | null>(null);

  // Trade Window States
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [myPlayerToOffer, setMyPlayerToOffer] = useState<Player | null>(null);
  const [targetTeamId, setTargetTeamId] = useState<string>('');
  const [targetPlayerToAsk, setTargetPlayerToAsk] = useState<Player | null>(null);
  const [isProposingTrade, setIsProposingTrade] = useState(false);
  const [tradeActionLoading, setTradeActionLoading] = useState<string | null>(null);

  const teamsList: Team[] = Array.isArray(room?.teams) ? room.teams : [];
  const minSquad = room?.settings?.minSquadSize || room?.settings?.squadSize || 11;
  const targetPlayingCount = minSquad;

  const existingLineups = (room as any)?.lineups || {};
  const masterReport: MasterScoutReport | null = (room as any)?.masterScoutReport || null;

  const roomCode = room?.code || '';
  const storedOwnerToken = roomCode
    ? localStorage.getItem(`cricket_owner_token_${roomCode}`) || ''
    : '';
  const myTeam = teamsList.find((t) => t.ownerToken && t.ownerToken === storedOwnerToken);

  const [selectedPlayingIds, setSelectedPlayingIds] = useState<string[]>([]);

  const allPoolPlayers: Player[] = room?.playerPool || room?.allPlayers || [];
  const unsoldPlayers = allPoolPlayers.filter((p: Player) => p.status === 'unsold');

  const allTrades: Record<string, TradeProposal> = (room as any)?.trades || {};
  const activePendingTrades = Object.values(allTrades).filter((t) => t.status === 'pending');

  const incomingTrades = activePendingTrades.filter(
    (t) => myTeam && t.receiverTeamId === myTeam.id
  );
  const outgoingTrades = activePendingTrades.filter(
    (t) => myTeam && t.senderTeamId === myTeam.id
  );

  useEffect(() => {
    try {
      confetti({
        particleCount: 110,
        spread: 85,
        origin: { y: 0.5 },
      });
      sound.playFanfare();
    } catch {
      // Fallback
    }
  }, []);

  useEffect(() => {
    if (!myTeam || !myTeam.players) return;

    const savedForMyTeam = existingLineups[myTeam.id];
    if (savedForMyTeam?.playingIds && savedForMyTeam.playingIds.length > 0) {
      setSelectedPlayingIds(savedForMyTeam.playingIds);
    } else if (!hasInitializedLineup) {
      setSelectedPlayingIds(myTeam.players.slice(0, targetPlayingCount).map((p) => p.id));
      setHasInitializedLineup(true);
    }
  }, [myTeam?.id, myTeam?.players, existingLineups, hasInitializedLineup, targetPlayingCount]);

  useEffect(() => {
    if (masterReport?.rankings && masterReport.rankings.length > 0 && !expandedTeamId) {
      setExpandedTeamId(masterReport.rankings[0].teamId);
    }
  }, [masterReport]);

  const handlePlayerTap = (playerId: string) => {
    setSelectedPlayingIds((prev) => {
      const isAlreadyPlaying = prev.includes(playerId);
      if (isAlreadyPlaying) {
        return prev.filter((id) => id !== playerId);
      }
      if (prev.length < targetPlayingCount) {
        return [...prev, playerId];
      }
      const [, ...remainingStarters] = prev;
      return [...remainingStarters, playerId];
    });
  };

  const handleSaveLineup = async () => {
    if (!room?.code || !myTeam || !myTeam.players) return;
    if (selectedPlayingIds.length !== targetPlayingCount && myTeam.players.length >= targetPlayingCount) {
      alert(`Please select exactly ${targetPlayingCount} players for your Starting Lineup.`);
      return;
    }

    const benchIds = myTeam.players
      .filter((p) => !selectedPlayingIds.includes(p.id))
      .map((p) => p.id);

    setSubmittingLineup(true);
    setLineupSuccessMsg('');
    const res = await submitTeamLineupTransaction(room.code, myTeam.id, selectedPlayingIds, benchIds);
    setSubmittingLineup(false);

    if (res.success) {
      setLineupSuccessMsg('Lineup locked & broadcasted to tournament scout!');
      setTimeout(() => setLineupSuccessMsg(''), 4500);
    } else {
      alert(res.error || 'Failed to submit lineup');
    }
  };

  const handleSendTradeProposal = async () => {
    if (!room?.code || !myTeam || !myPlayerToOffer || !targetTeamId || !targetPlayerToAsk) {
      alert('Please select both a player to offer and a player to request.');
      return;
    }

    const targetTeam = teamsList.find((t) => t.id === targetTeamId);
    if (!targetTeam) return;

    setIsProposingTrade(true);
    const res = await proposeTradeTransaction(
      room.code,
      myTeam,
      myPlayerToOffer,
      targetTeam,
      targetPlayerToAsk
    );
    setIsProposingTrade(false);

    if (res.success) {
      setIsTradeModalOpen(false);
      setMyPlayerToOffer(null);
      setTargetPlayerToAsk(null);
      setTargetTeamId('');
      alert(`Trade offer sent to ${targetTeam.name}! Waiting for their acceptance.`);
    } else {
      alert(res.error || 'Failed to send trade proposal.');
    }
  };

  const handleRespondToTrade = async (tradeId: string, accept: boolean) => {
    if (!room?.code) return;
    setTradeActionLoading(tradeId);
    const res = await respondTradeTransaction(room.code, tradeId, accept);
    setTradeActionLoading(null);

    if (!res.success) {
      alert(res.error || 'Failed to process trade.');
    }
  };

  const handleGenerateScoutReport = async () => {
    if (!room?.code) return;
    setAnalyzing(true);
    try {
      const report = await generateMasterScoutReport(teamsList, existingLineups, minSquad);
      await saveMasterScoutReport(room.code, report);
    } catch (err: any) {
      alert('Analysis Error: ' + (err?.message || err));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRunTournamentSim = () => {
    if (teamsList.length < 2) {
      alert('Need at least 2 teams to simulate a tournament.');
      return;
    }
    const result = simulateMiniTournament(teamsList, existingLineups, minSquad);
    setSimResult(result);
    sound.playFanfare();
    try {
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
    } catch {
      // Ignore
    }
  };

  const handleReAuctionUnsold = async () => {
    if (!isHost || !room?.code) return;
    if (unsoldPlayers.length === 0) {
      alert('There are no unsold players left to re-auction.');
      return;
    }
    const nextRound = (room.round || 1) + 1;
    if (
      confirm(
        `Start Round ${nextRound} with ${unsoldPlayers.length} unsold player(s)? Existing squads and remaining team budgets are fully preserved.`
      )
    ) {
      setReAuctioning(true);
      const res = await reAuctionUnsoldTransaction(room.code, hostToken);
      setReAuctioning(false);
      if (!res.success) {
        alert(res.error || 'Failed to start re-auction.');
      }
    }
  };

  const handleResetAuction = async () => {
    if (!isHost || !room?.code) return;
    if (confirm('Start a brand new auction? This resets budgets and squad rosters back to lobby while keeping team claims intact.')) {
      setResetting(true);
      await resetAuctionTransaction(room.code, hostToken);
      setResetting(false);
    }
  };

  const getRoleBadgeStyle = (role: PlayerRole) => {
    switch (role) {
      case 'BAT':
        return 'bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30';
      case 'WK':
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30';
      case 'AR':
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30';
      case 'BOWL':
        return 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 8.5) return 'text-emerald-500 border-emerald-500/40 bg-emerald-500/10';
    if (score >= 7.0) return 'text-blue-500 border-blue-500/40 bg-blue-500/10';
    if (score >= 5.5) return 'text-amber-500 border-amber-500/40 bg-amber-500/10';
    return 'text-rose-500 border-rose-500/40 bg-rose-500/10';
  };

  const renderRankPlate = (rank: number) => {
    if (rank === 1) {
      return (
        <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 text-stone-950 flex items-center justify-center shadow-lg shadow-amber-500/30 ring-2 ring-amber-400/80 animate-pulse">
          <Crown className="w-5 h-5 fill-stone-950 drop-shadow" />
        </div>
      );
    }
    if (rank === 2) {
      return (
        <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-slate-400 to-slate-200 text-stone-950 flex items-center justify-center shadow-md shadow-slate-400/20 ring-1 ring-slate-300">
          <Medal className="w-5 h-5 fill-stone-950" />
        </div>
      );
    }
    if (rank === 3) {
      return (
        <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-700 to-amber-600 text-white flex items-center justify-center shadow-md shadow-amber-800/20 ring-1 ring-amber-500">
          <Medal className="w-5 h-5 fill-white" />
        </div>
      );
    }
    return (
      <div className="w-9 h-9 rounded-2xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)] flex items-center justify-center font-display font-black text-xs text-[var(--color-text-dim)] shadow-inner">
        #{rank}
      </div>
    );
  };

  const myPlayingPlayers = (myTeam?.players || []).filter((p) => selectedPlayingIds.includes(p.id));
  const myBenchPlayers = (myTeam?.players || []).filter((p) => !selectedPlayingIds.includes(p.id));
  const myWkCount = myPlayingPlayers.filter((p) => p.role === 'WK').length;
  const myBatCount = myPlayingPlayers.filter((p) => p.role === 'BAT').length;
  const myArCount = myPlayingPlayers.filter((p) => p.role === 'AR').length;
  const myBowlCount = myPlayingPlayers.filter((p) => p.role === 'BOWL').length;
  const myTotalBowlers = myBowlCount + myArCount;

  const otherTeams = teamsList.filter((t) => myTeam && t.id !== myTeam.id);
  const selectedOtherTeam = teamsList.find((t) => t.id === targetTeamId);

  return (
    <div className="w-full max-w-[620px] mx-auto px-3.5 sm:px-4 py-6 pb-20 space-y-6 transition-all duration-300">
      {/* BROADCAST PODIUM HEADER */}
      <div className="relative overflow-hidden bg-gradient-to-b from-[var(--color-surface-elevated)] via-[var(--color-surface)] to-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-6 sm:p-7 text-center shadow-2xl backdrop-blur-md">
        <div className="relative w-18 h-18 rounded-3xl bg-gradient-to-tr from-amber-500/20 via-yellow-400/15 to-transparent text-amber-500 mx-auto flex items-center justify-center mb-3.5 shadow-inner ring-1 ring-amber-500/40">
          <Trophy className="w-9 h-9 drop-shadow-md animate-pulse" />
        </div>

        <span className="text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 inline-flex items-center space-x-1 mb-2 shadow-xs">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>Official Broadcast Dashboard</span>
        </span>

        <h1 className="text-3xl sm:text-4xl font-black font-display uppercase tracking-wider text-[var(--color-text-main)]">
          Auction Concluded
        </h1>
        <p className="text-xs text-[var(--color-text-muted)] max-w-sm mx-auto mt-1.5 leading-relaxed">
          Franchise budgets are locked. Trade players with mutual acceptance, lock starting lineups, and simulate the tournament.
        </p>

        {onOpenSummary && (
          <div className="mt-5">
            <button
              onClick={onOpenSummary}
              className="px-4.5 py-2.5 bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface-elevated)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] text-[var(--color-text-main)] font-display text-xs font-bold uppercase tracking-wider rounded-2xl transition cursor-pointer shadow-xs inline-flex items-center space-x-2 active:scale-95"
            >
              <BarChart3 className="w-4 h-4 text-[var(--color-primary)]" />
              <span>Open Ledger & Detailed Summary</span>
            </button>
          </div>
        )}
      </div>

      {/* INCOMING TRADE PROPOSALS */}
      {incomingTrades.length > 0 && (
        <div className="space-y-3">
          {incomingTrades.map((trade) => (
            <div
              key={trade.id}
              className="bg-gradient-to-r from-blue-500/15 via-[var(--color-surface)] to-[var(--color-surface)] border-2 border-blue-500/50 rounded-3xl p-4.5 shadow-lg space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-500 text-white inline-flex items-center space-x-1">
                  <Repeat className="w-3 h-3" />
                  <span>Incoming Trade Proposal</span>
                </span>
                <span className="text-[10px] text-[var(--color-text-muted)] font-bold">
                  From {trade.senderTeamName}
                </span>
              </div>

              <div className="flex items-center justify-between bg-[var(--color-surface-subtle)] p-3 rounded-2xl border border-[var(--color-border)] text-xs">
                <div>
                  <span className="text-[9px] text-[var(--color-text-dim)] uppercase font-bold block">You Receive</span>
                  <div className="flex items-center space-x-1.5 font-bold text-emerald-500">
                    <span className={`text-[8px] font-black px-1 py-0.5 rounded border uppercase ${getRoleBadgeStyle(trade.senderPlayer.role)}`}>
                      {trade.senderPlayer.role}
                    </span>
                    <span>{trade.senderPlayer.name}</span>
                  </div>
                </div>

                <ArrowDownUp className="w-4 h-4 text-[var(--color-text-dim)]" />

                <div className="text-right">
                  <span className="text-[9px] text-[var(--color-text-dim)] uppercase font-bold block">You Give</span>
                  <div className="flex items-center justify-end space-x-1.5 font-bold text-rose-500">
                    <span>{trade.receiverPlayer.name}</span>
                    <span className={`text-[8px] font-black px-1 py-0.5 rounded border uppercase ${getRoleBadgeStyle(trade.receiverPlayer.role)}`}>
                      {trade.receiverPlayer.role}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  disabled={tradeActionLoading === trade.id}
                  onClick={() => handleRespondToTrade(trade.id, true)}
                  className="flex-1 py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-display text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-md active:scale-95 flex items-center justify-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{tradeActionLoading === trade.id ? 'Accepting...' : 'Accept Trade'}</span>
                </button>
                <button
                  type="button"
                  disabled={tradeActionLoading === trade.id}
                  onClick={() => handleRespondToTrade(trade.id, false)}
                  className="py-2 px-4 rounded-xl bg-[var(--color-surface-subtle)] hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 font-display text-xs font-bold uppercase tracking-wider transition cursor-pointer active:scale-95"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* OUTGOING PENDING TRADES */}
      {outgoingTrades.length > 0 && (
        <div className="space-y-2">
          {outgoingTrades.map((trade) => (
            <div
              key={trade.id}
              className="p-3 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-2xl flex items-center justify-between text-xs"
            >
              <div className="flex items-center space-x-2">
                <RefreshCw className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                <span className="text-[var(--color-text-muted)] font-medium">
                  Trade offer to <span className="font-bold text-[var(--color-text-main)]">{trade.receiverTeamName}</span> pending:
                </span>
                <span className="font-bold text-[var(--color-text-main)]">
                  {trade.senderPlayer.name} ⇄ {trade.receiverPlayer.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleRespondToTrade(trade.id, false)}
                className="text-[10px] font-bold text-rose-500 hover:underline cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}

      {/* OWNER TACTICAL LINEUP STUDIO */}
      {myTeam && (
        <div className="bg-[var(--color-surface)] border-2 border-[var(--color-primary)]/50 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3.5">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-2xl bg-[var(--color-primary)] text-white flex items-center justify-center font-display font-black text-xs shadow-md">
                {myTeam.shortName || 'TM'}
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary)] block leading-none">
                  Owner Squad Studio
                </span>
                <h2 className="text-base font-black font-display uppercase text-[var(--color-text-main)]">
                  {myTeam.name}
                </h2>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setIsTradeModalOpen(true)}
                className="text-[10px] font-black font-display uppercase tracking-wider px-3 py-1.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-600 dark:text-blue-400 border border-blue-500/30 transition cursor-pointer flex items-center space-x-1.5 active:scale-95 shadow-xs"
              >
                <Repeat className="w-3.5 h-3.5" />
                <span>Trade</span>
              </button>

              <span
                className={`font-mono text-xs font-black px-3 py-1 rounded-full border transition-all ${
                  selectedPlayingIds.length === targetPlayingCount
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 shadow-xs'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/40'
                }`}
              >
                {selectedPlayingIds.length} / {targetPlayingCount}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 p-2.5 rounded-2xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-center text-[10px]">
            <div className="p-1.5 rounded-xl bg-[var(--color-surface)] shadow-xs">
              <span className="text-[var(--color-text-dim)] block text-[9px] uppercase font-bold">WK</span>
              <span className={`font-mono font-black ${myWkCount >= 1 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {myWkCount} {myWkCount >= 1 ? '✓' : '⚠️'}
              </span>
            </div>
            <div className="p-1.5 rounded-xl bg-[var(--color-surface)] shadow-xs">
              <span className="text-[var(--color-text-dim)] block text-[9px] uppercase font-bold">BAT</span>
              <span className="font-mono font-black text-[var(--color-text-main)]">{myBatCount}</span>
            </div>
            <div className="p-1.5 rounded-xl bg-[var(--color-surface)] shadow-xs">
              <span className="text-[var(--color-text-dim)] block text-[9px] uppercase font-bold">AR</span>
              <span className="font-mono font-black text-[var(--color-text-main)]">{myArCount}</span>
            </div>
            <div className="p-1.5 rounded-xl bg-[var(--color-surface)] shadow-xs">
              <span className="text-[var(--color-text-dim)] block text-[9px] uppercase font-bold">BOWLERS</span>
              <span className={`font-mono font-black ${myTotalBowlers >= 5 ? 'text-emerald-500' : 'text-amber-500'}`}>
                {myTotalBowlers} {myTotalBowlers >= 6 ? '(6th Armed)' : myTotalBowlers === 5 ? '(5 Bowlers)' : '⚠️ Short'}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black font-display uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Starting Lineup ({myPlayingPlayers.length})</span>
                </span>
                <span className="text-[10px] text-[var(--color-text-dim)] font-medium">Tap to bench</span>
              </div>

              {myPlayingPlayers.length === 0 ? (
                <div className="p-4 text-center border border-dashed border-[var(--color-border)] rounded-2xl text-xs text-[var(--color-text-dim)]">
                  No starting players selected. Tap bench players below to promote them.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                  {myPlayingPlayers.map((player) => (
                    <button
                      type="button"
                      key={player.id}
                      onClick={() => handlePlayerTap(player.id)}
                      className="w-full p-2.5 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 transition cursor-pointer flex items-center justify-between text-xs text-left shadow-xs"
                    >
                      <div className="flex items-center space-x-2 truncate pointer-events-none">
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase ${getRoleBadgeStyle(player.role)}`}>
                          {player.role}
                        </span>
                        <span className="font-bold text-[var(--color-text-main)] truncate">{player.name}</span>
                      </div>
                      <span className="text-[10px] font-bold text-rose-500 shrink-0 ml-2">Bench ✕</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black font-display uppercase tracking-wider text-[var(--color-text-dim)] flex items-center space-x-1.5">
                  <Layers className="w-4 h-4" />
                  <span>Tactical Bench Reserves ({myBenchPlayers.length})</span>
                </span>
                <span className="text-[10px] text-[var(--color-text-dim)] font-medium">Tap to swap</span>
              </div>

              {myBenchPlayers.length === 0 ? (
                <div className="p-3 text-center bg-rose-500/10 border border-rose-500/25 rounded-2xl text-[11px] text-rose-600 dark:text-rose-400 font-semibold flex items-center justify-center space-x-2">
                  <ShieldAlert className="w-4 h-4 text-rose-500" />
                  <span>Zero bench depth! The AI scout will deduct points.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                  {myBenchPlayers.map((player) => (
                    <button
                      type="button"
                      key={player.id}
                      onClick={() => handlePlayerTap(player.id)}
                      className="w-full p-2.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] hover:border-[var(--color-primary)] active:scale-95 transition cursor-pointer flex items-center justify-between text-xs text-left opacity-80 hover:opacity-100 shadow-xs"
                    >
                      <div className="flex items-center space-x-2 truncate pointer-events-none">
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase ${getRoleBadgeStyle(player.role)}`}>
                          {player.role}
                        </span>
                        <span className="font-medium text-[var(--color-text-muted)] truncate">{player.name}</span>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-500 shrink-0 ml-2 flex items-center space-x-0.5">
                        <ArrowDownUp className="w-3 h-3 inline" />
                        <span>Swap</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {lineupSuccessMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-2xl text-center flex items-center justify-center space-x-2 animate-bounce">
              <Check className="w-4 h-4" />
              <span>{lineupSuccessMsg}</span>
            </div>
          )}

          <button
            type="button"
            disabled={submittingLineup}
            onClick={handleSaveLineup}
            className="w-full min-h-[48px] py-3 px-5 rounded-2xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-display text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center justify-center space-x-2 shadow-lg active:scale-98"
          >
            <ShieldCheck className="w-4.5 h-4.5" />
            <span>{submittingLineup ? 'Locking Squad Lineup...' : 'Lock & Save My Tactical Squad'}</span>
          </button>
        </div>
      )}

      {/* MUTUAL PLAYER TRADE MODAL */}
      {isTradeModalOpen && myTeam && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-500 flex items-center justify-center">
                  <Repeat className="w-4 h-4" />
                </div>
                <h3 className="font-display font-black text-sm uppercase text-[var(--color-text-main)]">
                  Propose Franchise Trade
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTradeModalOpen(false)}
                className="p-1 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-dim)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-[var(--color-text-dim)] block mb-1.5">
                Step 1: Choose player you want to trade away
              </label>
              <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-1 bg-[var(--color-surface-subtle)] rounded-xl border border-[var(--color-border)]">
                {myTeam.players.map((p) => {
                  const isSelected = myPlayerToOffer?.id === p.id;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setMyPlayerToOffer(p)}
                      className={`p-2 rounded-lg text-left text-xs transition cursor-pointer border truncate ${
                        isSelected
                          ? 'border-blue-500 bg-blue-500/20 font-bold text-blue-500'
                          : 'border-transparent hover:bg-[var(--color-surface)] text-[var(--color-text-main)]'
                      }`}
                    >
                      <span className={`text-[8px] font-black px-1 py-0.5 rounded mr-1.5 ${getRoleBadgeStyle(p.role)}`}>
                        {p.role}
                      </span>
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-[var(--color-text-dim)] block mb-1.5">
                Step 2: Select franchise to trade with
              </label>
              <select
                value={targetTeamId}
                onChange={(e) => {
                  setTargetTeamId(e.target.value);
                  setTargetPlayerToAsk(null);
                }}
                className="w-full p-2.5 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-xs text-[var(--color-text-main)] font-semibold"
              >
                <option value="">-- Choose Franchise --</option>
                {otherTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.players.length} players)
                  </option>
                ))}
              </select>
            </div>

            {selectedOtherTeam && (
              <div>
                <label className="text-[10px] font-black uppercase text-[var(--color-text-dim)] block mb-1.5">
                  Step 3: Select player you want in return
                </label>
                {selectedOtherTeam.players.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-dim)] italic">This team has no players to trade.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-1 bg-[var(--color-surface-subtle)] rounded-xl border border-[var(--color-border)]">
                    {selectedOtherTeam.players.map((p) => {
                      const isSelected = targetPlayerToAsk?.id === p.id;
                      return (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => setTargetPlayerToAsk(p)}
                          className={`p-2 rounded-lg text-left text-xs transition cursor-pointer border truncate ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-500/20 font-bold text-emerald-500'
                              : 'border-transparent hover:bg-[var(--color-surface)] text-[var(--color-text-main)]'
                          }`}
                        >
                          <span className={`text-[8px] font-black px-1 py-0.5 rounded mr-1.5 ${getRoleBadgeStyle(p.role)}`}>
                            {p.role}
                          </span>
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="pt-2 border-t border-[var(--color-border)]">
              {myPlayerToOffer && targetPlayerToAsk && (
                <div className="mb-3 p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-xs text-center">
                  Trade <span className="font-bold text-rose-500">{myPlayerToOffer.name}</span> for{' '}
                  <span className="font-bold text-emerald-500">{targetPlayerToAsk.name}</span>
                </div>
              )}

              <button
                type="button"
                disabled={isProposingTrade || !myPlayerToOffer || !targetPlayerToAsk}
                onClick={handleSendTradeProposal}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-display text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-md flex items-center justify-center space-x-1.5 active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isProposingTrade ? 'Transmitting Proposal...' : 'Send Mutual Trade Offer'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MASTER AI PRIME-FORM POWER RANKINGS (1 TO N) */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-emerald-500 text-white flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black font-display uppercase tracking-wide text-[var(--color-text-main)]">
                Tactical Power Rankings
              </h2>
              <p className="text-[11px] text-[var(--color-text-dim)] font-medium">
                9-Vector T20 Archetype, Phase & Bench Depth Analysis
              </p>
            </div>
          </div>

          {isHost && (
            <button
              onClick={handleGenerateScoutReport}
              disabled={analyzing}
              className="text-[10px] font-bold font-display uppercase tracking-wider px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer flex items-center space-x-1.5 shadow-md active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin' : ''}`} />
              <span>{analyzing ? 'Analyzing...' : masterReport ? 'Re-Analyze' : 'Analyze Teams'}</span>
            </button>
          )}
        </div>

        {analyzing && (
          <div className="py-10 text-center space-y-3">
            <div className="w-9 h-9 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs text-[var(--color-text-muted)] font-display uppercase tracking-wider font-bold">
              Evaluating boundary ceiling, stability anchors, phase bowling & bench depth...
            </p>
          </div>
        )}

        {!analyzing && masterReport && (
          <div className="space-y-4">
            <div className="p-4 bg-gradient-to-r from-emerald-500/10 via-[var(--color-surface-subtle)] to-[var(--color-surface-subtle)] border border-emerald-500/25 rounded-2xl text-xs text-[var(--color-text-main)] italic leading-relaxed">
              "{masterReport.executiveSummary}"
            </div>

            <div className="space-y-3.5">
              {masterReport.rankings.map((rep, idx) => {
                const dynamicRank = idx + 1;
                const isExpanded = expandedTeamId === rep.teamId;
                const scorePercent = Math.min(100, Math.max(0, (rep.scoreOutOf10 / 10) * 100));

                return (
                  <div
                    key={rep.teamId}
                    className={`border rounded-2xl overflow-hidden transition-all duration-300 ${
                      isExpanded
                        ? 'border-[var(--color-primary)] bg-[var(--color-surface-elevated)] shadow-xl'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-hover)]'
                    }`}
                  >
                    <div
                      onClick={() => setExpandedTeamId(isExpanded ? null : rep.teamId)}
                      className="p-4 cursor-pointer hover:bg-[var(--color-surface-subtle)] transition space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {renderRankPlate(dynamicRank)}
                          <div>
                            <div className="text-sm font-black font-display uppercase tracking-wide text-[var(--color-text-main)]">
                              {rep.teamName}
                            </div>
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                              {rep.verdict}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-3">
                          <div className={`font-mono font-black text-sm px-3 py-1 rounded-full border shadow-xs ${getScoreColor(rep.scoreOutOf10)}`}>
                            {rep.scoreOutOf10.toFixed(2)}
                            <span className="text-[9px] text-[var(--color-text-dim)] font-normal"> / 10</span>
                          </div>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-[var(--color-text-dim)]" /> : <ChevronDown className="w-4 h-4 text-[var(--color-text-dim)]" />}
                        </div>
                      </div>

                      <div className="w-full bg-[var(--color-surface-subtle)] h-1.5 rounded-full overflow-hidden border border-[var(--color-border)]">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-emerald-500 via-amber-500 to-emerald-400"
                          style={{ width: `${scorePercent}%` }}
                        />
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-4.5 border-t border-[var(--color-border)] bg-[var(--color-surface)] space-y-4 text-xs">
                        {rep.benchPenaltyNote && (
                          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-[11px] text-rose-700 dark:text-rose-300 font-semibold flex items-start space-x-2">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-500 mt-0.5" />
                            <span>{rep.benchPenaltyNote}</span>
                          </div>
                        )}

                        <div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-dim)] block mb-2">
                            Phase & Tactical Balance Matrix
                          </span>
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div className="p-2.5 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)]">
                              <span className="text-[9px] text-[var(--color-text-dim)] uppercase font-bold block">Batting Depth</span>
                              <span className="font-bold text-[var(--color-text-main)]">{rep.playingBalance.battingDepth}</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)]">
                              <span className="text-[9px] text-[var(--color-text-dim)] uppercase font-bold block">Death Bowling</span>
                              <span className="font-bold text-[var(--color-text-main)]">{rep.playingBalance.deathBowling}</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)]">
                              <span className="text-[9px] text-[var(--color-text-dim)] uppercase font-bold block">Spin & Middle Control</span>
                              <span className="font-bold text-[var(--color-text-main)]">{rep.playingBalance.spinQuality}</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)]">
                              <span className="text-[9px] text-[var(--color-text-dim)] uppercase font-bold block">Bench Depth</span>
                              <span className="font-bold text-[var(--color-text-main)]">{rep.benchStrength}</span>
                            </div>
                          </div>
                        </div>

                        {rep.archetypeBreakdown?.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-black uppercase text-[var(--color-primary)] block">
                              Player Tactical Archetypes:
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {rep.archetypeBreakdown.map((item, i) => (
                                <span
                                  key={i}
                                  className="text-[10px] px-2 py-1 rounded-lg bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-[var(--color-text-main)]"
                                >
                                  {item}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {rep.pros?.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 block flex items-center space-x-1">
                              <Zap className="w-3.5 h-3.5" />
                              <span>Prime Strengths:</span>
                            </span>
                            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-[var(--color-text-muted)]">
                              {rep.pros.map((pro, i) => (
                                <li key={i}>{pro}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {rep.cons?.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400 block flex items-center space-x-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Tactical Vulnerabilities:</span>
                            </span>
                            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-[var(--color-text-muted)]">
                              {rep.cons.map((con, i) => (
                                <li key={i}>{con}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!analyzing && !masterReport && (
          <div className="p-7 text-center bg-[var(--color-surface-subtle)] rounded-2xl border border-dashed border-[var(--color-border)] space-y-1.5">
            <TrendingUp className="w-7 h-7 text-[var(--color-text-dim)] mx-auto mb-1 animate-pulse" />
            <p className="text-xs font-bold text-[var(--color-text-main)]">Leaderboard Simulation Pending</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              {isHost
                ? 'Tap "Analyze Teams" above to run the 9-Vector Tactical Scout.'
                : 'Waiting for the host to trigger the AI tournament scout...'}
            </p>
          </div>
        )}
      </div>

      {/* HEAD-TO-HEAD MINI-LEAGUE TOURNAMENT SIMULATOR */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center">
              <Swords className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black font-display uppercase text-[var(--color-text-main)]">
                Mini-League Simulator
              </h2>
              <p className="text-[11px] text-[var(--color-text-dim)]">
                Algorithmic ball-by-ball simulation of finalized Starting XIs
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRunTournamentSim}
            className="text-[10px] font-black font-display uppercase tracking-wider px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 transition cursor-pointer shadow-md active:scale-95"
          >
            {simResult ? 'Re-Simulate' : 'Simulate Tournament'}
          </button>
        </div>

        {simResult && (
          <div className="space-y-4 pt-2 border-t border-[var(--color-border)]">
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-transparent border border-amber-500/40 text-center space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-500 block">
                🏆 Tournament Champion
              </span>
              <h3 className="text-2xl font-black font-display uppercase text-[var(--color-text-main)]">
                {simResult.championTeamName}
              </h3>
              <p className="text-[11px] text-[var(--color-text-muted)]">{simResult.finalMatchSummary}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-2xl bg-orange-500/10 border border-orange-500/30">
                <span className="text-[9px] font-black uppercase text-orange-500 block">🧢 Orange Cap</span>
                <span className="font-black text-sm text-[var(--color-text-main)] block mt-0.5">
                  {simResult.orangeCap.playerName}
                </span>
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {simResult.orangeCap.runs} Runs (SR {simResult.orangeCap.strikeRate})
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30">
                <span className="text-[9px] font-black uppercase text-purple-500 block">🧢 Purple Cap</span>
                <span className="font-black text-sm text-[var(--color-text-main)] block mt-0.5">
                  {simResult.purpleCap.playerName}
                </span>
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {simResult.purpleCap.wickets} Wkts (Econ {simResult.purpleCap.economy})
                </span>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-[var(--color-surface-subtle)] text-[var(--color-text-dim)] uppercase font-black">
                  <tr>
                    <th className="py-2 px-3">Team</th>
                    <th className="py-2 px-2 text-center">P</th>
                    <th className="py-2 px-2 text-center">W</th>
                    <th className="py-2 px-2 text-center">L</th>
                    <th className="py-2 px-2 text-right">NRR</th>
                    <th className="py-2 px-3 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {simResult.pointsTable.map((row) => (
                    <tr key={row.teamId} className="font-mono">
                      <td className="py-2 px-3 font-sans font-bold text-[var(--color-text-main)]">{row.teamName}</td>
                      <td className="py-2 px-2 text-center">{row.played}</td>
                      <td className="py-2 px-2 text-center text-emerald-500 font-bold">{row.won}</td>
                      <td className="py-2 px-2 text-center text-rose-500">{row.lost}</td>
                      <td className="py-2 px-2 text-right">{row.nrr}</td>
                      <td className="py-2 px-3 text-right font-black text-amber-500">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* SQUAD ROSTERS SUMMARY */}
      <div className="space-y-3.5">
        <h2 className="text-base font-black font-display uppercase tracking-wider text-[var(--color-text-main)] flex items-center space-x-2">
          <Award className="w-4.5 h-4.5 text-[var(--color-primary)]" />
          <span>Final Official Squad Sheets</span>
        </h2>

        {teamsList.map((team) => (
          <div
            key={team.id}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between pb-2.5 border-b border-[var(--color-border)]">
              <div>
                <h3 className="text-sm font-black font-display uppercase text-[var(--color-text-main)]">{team.name}</h3>
                <span className="text-[11px] text-[var(--color-text-muted)] font-medium">
                  Owner: {team.claimedByOwnerName || 'Unclaimed'}
                </span>
              </div>

              <div className="text-right">
                <span className="text-[9px] text-[var(--color-text-dim)] uppercase block font-bold">Spent / Remaining</span>
                <span className="text-xs font-mono font-bold text-[var(--color-text-main)]">
                  <span className="text-amber-500">₹{team.spent}</span> /{' '}
                  <span className="text-emerald-500">₹{team.purse} {room?.settings?.purseUnit || 'Cr'}</span>
                </span>
              </div>
            </div>

            {team.players.length === 0 ? (
              <p className="text-xs text-[var(--color-text-dim)] italic">No players acquired.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {team.players.map((p, idx) => (
                  <div
                    key={p.id + idx}
                    className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--color-surface-subtle)] text-xs"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase ${getRoleBadgeStyle(p.role)}`}>
                        {p.role}
                      </span>
                      <span className="font-bold text-[var(--color-text-main)] truncate text-[11px]">{p.name}</span>
                    </div>
                    <span className="font-mono font-bold text-amber-500 text-[11px] flex-shrink-0 ml-1.5">
                      ₹{p.soldPrice ?? p.basePrice}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* HOST RESTART & RE-AUCTION CONTROLS */}
      {isHost && (
        <div className="sticky bottom-10 bg-[var(--color-surface)]/95 backdrop-blur-md border border-[var(--color-border)] p-4 rounded-2xl shadow-2xl text-center space-y-2.5 z-20">
          {unsoldPlayers.length > 0 && (
            <button
              type="button"
              disabled={reAuctioning}
              onClick={handleReAuctionUnsold}
              className="w-full min-h-[48px] py-3 px-6 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-display text-sm font-black uppercase tracking-wider shadow-lg transition active:scale-98 flex items-center justify-center space-x-2 cursor-pointer"
            >
              <RotateCcw className={`w-4 h-4 ${reAuctioning ? 'animate-spin' : ''}`} />
              <span>
                {reAuctioning ? 'Preparing Round...' : `Re-Auction Unsold Players (${unsoldPlayers.length} Left)`}
              </span>
            </button>
          )}

          <button
            type="button"
            disabled={resetting}
            onClick={handleResetAuction}
            className="w-full min-h-[44px] py-2.5 px-6 rounded-xl bg-stone-700 hover:bg-stone-800 text-white font-display text-xs font-bold uppercase tracking-wider shadow-md transition active:scale-98 flex items-center justify-center space-x-2 cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
            <span>{resetting ? 'Resetting Room...' : 'Start A Brand New Auction'}</span>
          </button>
        </div>
      )}
    </div>
  );
};