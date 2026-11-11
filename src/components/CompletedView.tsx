import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Flame,
  RotateCcw,
  Sparkles,
  CheckCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Zap,
  Crown,
  Medal,
  AlertTriangle,
  ArrowRightLeft,
  Users,
  Check,
  Layers,
  TrendingUp,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  RoomData,
  resetAuctionTransaction,
  submitTeamLineupTransaction,
  saveMasterScoutReport,
} from '../services/auctionService';
import { PlayerRole, Team, Player } from '../game/auctionRules';
import { sound } from '../services/soundService';
import { generateMasterScoutReport, MasterScoutReport } from '../services/aiService';

interface CompletedViewProps {
  room: RoomData;
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
  const [analyzing, setAnalyzing] = useState(false);
  const [submittingLineup, setSubmittingLineup] = useState(false);
  const [lineupSuccessMsg, setLineupSuccessMsg] = useState('');
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  const teamsList: Team[] = Array.isArray(room?.teams) ? room.teams : [];
  const minSquad = room?.settings?.minSquadSize || room?.settings?.squadSize || 11;
  const targetPlayingCount = minSquad;

  const existingLineups = (room as any)?.lineups || {};
  const masterReport: MasterScoutReport | null = (room as any)?.masterScoutReport || null;

  const storedOwnerToken = localStorage.getItem(`cricket_owner_token_${room.code}`) || '';
  const myTeam = teamsList.find((t) => t.ownerToken && t.ownerToken === storedOwnerToken);

  const [selectedPlayingIds, setSelectedPlayingIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      confetti({
        particleCount: 100,
        spread: 90,
        origin: { y: 0.55 },
      });
      sound.playFanfare();
    } catch {
      // Fallback if canvas is unavailable
    }
  }, []);

  useEffect(() => {
    if (myTeam && myTeam.players) {
      const savedForMyTeam = existingLineups[myTeam.id];
      if (savedForMyTeam?.playingIds && savedForMyTeam.playingIds.length > 0) {
        setSelectedPlayingIds(savedForMyTeam.playingIds);
      } else {
        setSelectedPlayingIds(myTeam.players.slice(0, targetPlayingCount).map((p) => p.id));
      }
    }
  }, [myTeam?.id, existingLineups]);

  useEffect(() => {
    if (masterReport?.rankings && masterReport.rankings.length > 0 && !expandedTeamId) {
      setExpandedTeamId(masterReport.rankings[0].teamId);
    }
  }, [masterReport]);

  const togglePlayerInPlayingUnit = (playerId: string) => {
    if (selectedPlayingIds.includes(playerId)) {
      setSelectedPlayingIds(selectedPlayingIds.filter((id) => id !== playerId));
    } else {
      if (selectedPlayingIds.length >= targetPlayingCount) {
        alert(`Starting unit is full (${targetPlayingCount}/${targetPlayingCount}). Tap a player in your Starting Lineup to bench them first.`);
        return;
      }
      setSelectedPlayingIds([...selectedPlayingIds, playerId]);
    }
  };

  const handleSaveLineup = async () => {
    if (!myTeam || !myTeam.players) return;
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
      setLineupSuccessMsg('Lineup locked & synced with tournament scout!');
      setTimeout(() => setLineupSuccessMsg(''), 4500);
    } else {
      alert(res.error || 'Failed to submit lineup');
    }
  };

  const handleGenerateScoutReport = async () => {
    setAnalyzing(true);
    try {
      const report = await generateMasterScoutReport(teamsList, existingLineups, minSquad);
      await saveMasterScoutReport(room.code, report);
    } catch (err: any) {
      alert('Scouting Error: ' + (err?.message || err));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleResetAuction = async () => {
    if (!isHost) return;
    if (confirm('Start a new auction? This resets purse balances and squad rosters while keeping owner claims intact.')) {
      setResetting(true);
      await resetAuctionTransaction(room.code, hostToken);
      setResetting(false);
    }
  };

  // Find biggest hammer buy
  const allSoldPlayers: { player: any; teamName: string; price: number }[] = [];
  for (const t of teamsList) {
    for (const p of t.players || []) {
      if (p.soldPrice) {
        allSoldPlayers.push({ player: p, teamName: t.name, price: p.soldPrice });
      }
    }
  }
  allSoldPlayers.sort((a, b) => b.price - a.price);
  const biggestBuy = allSoldPlayers[0] || null;

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
    if (score >= 8.5) return 'text-emerald-500 border-emerald-500 bg-emerald-500/10';
    if (score >= 7.0) return 'text-blue-500 border-blue-500 bg-blue-500/10';
    if (score >= 5.5) return 'text-amber-500 border-amber-500 bg-amber-500/10';
    return 'text-rose-500 border-rose-500 bg-rose-500/10';
  };

  // Dynamic ranking medals from 1 to N
  const renderRankPlate = (rank: number) => {
    if (rank === 1) {
      return (
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 text-stone-900 flex items-center justify-center shadow-md shadow-amber-500/30 ring-2 ring-amber-400">
          <Crown className="w-4 h-4 fill-stone-900 drop-shadow" />
        </div>
      );
    }
    if (rank === 2) {
      return (
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-slate-400 to-slate-200 text-stone-900 flex items-center justify-center shadow-md shadow-slate-400/20 ring-1 ring-slate-300">
          <Medal className="w-4 h-4 fill-stone-900" />
        </div>
      );
    }
    if (rank === 3) {
      return (
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-700 to-amber-600 text-white flex items-center justify-center shadow-md shadow-amber-800/20 ring-1 ring-amber-500">
          <Medal className="w-4 h-4 fill-white" />
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)] flex items-center justify-center font-display font-black text-xs text-[var(--color-text-dim)]">
        #{rank}
      </div>
    );
  };

  // Lineup role counters for Owner Studio
  const myPlayingPlayers = (myTeam?.players || []).filter((p) => selectedPlayingIds.includes(p.id));
  const myBenchPlayers = (myTeam?.players || []).filter((p) => !selectedPlayingIds.includes(p.id));
  const myWkCount = myPlayingPlayers.filter((p) => p.role === 'WK').length;
  const myBatCount = myPlayingPlayers.filter((p) => p.role === 'BAT').length;
  const myArCount = myPlayingPlayers.filter((p) => p.role === 'AR').length;
  const myBowlCount = myPlayingPlayers.filter((p) => p.role === 'BOWL').length;
  const myTotalBowlers = myBowlCount + myArCount;

  const submittedCount = teamsList.filter((t) => existingLineups[t.id]?.playingIds?.length > 0).length;

  return (
    <div className="w-full max-w-[600px] mx-auto px-3.5 sm:px-4 py-5 space-y-5 animate-fade-in">
      {/* BROADCAST HEADER BANNER */}
      <div className="relative overflow-hidden bg-gradient-to-b from-[var(--color-surface-elevated)] to-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-6 text-center shadow-xl">
        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-yellow-400/10 text-amber-500 mx-auto flex items-center justify-center mb-3 shadow-inner ring-1 ring-amber-500/30">
          <Trophy className="w-8 h-8 drop-shadow animate-pulse" />
        </div>

        <span className="text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 inline-block mb-1.5 shadow-xs">
          Tournament Official
        </span>
        <h1 className="text-3xl font-black font-display uppercase tracking-wider text-[var(--color-text-main)]">
          Auction Concluded
        </h1>
        <p className="text-xs text-[var(--color-text-muted)] max-w-sm mx-auto mt-1">
          Lock in your starting tactical unit and view your franchise rank on the prime-form leaderboard.
        </p>

        {onOpenSummary && (
          <div className="mt-4">
            <button
              onClick={onOpenSummary}
              className="px-4 py-2 bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-[var(--color-text-main)] font-display text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer shadow-xs inline-flex items-center space-x-1.5 active:scale-95"
            >
              <span>View Roster & Financial Ledger</span>
            </button>
          </div>
        )}
      </div>

      {/* BIGGEST BUY HIGHLIGHT */}
      {biggestBuy && (
        <div className="relative overflow-hidden bg-gradient-to-r from-amber-500/15 via-red-500/10 to-amber-500/5 border border-amber-500/40 rounded-3xl p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-amber-500 text-white font-display text-[10px] font-black uppercase tracking-wider shadow-xs">
              <Flame className="w-3.5 h-3.5 fill-white animate-bounce" />
              <span>Record Hammer Acquisition</span>
            </div>
            <span className="text-[11px] font-black text-amber-600 dark:text-amber-400 font-mono">
              ₹{biggestBuy.price} {room.settings?.purseUnit || 'Cr'}
            </span>
          </div>

          <div className="flex items-center justify-between mt-2.5">
            <div>
              <div className="flex items-center space-x-2">
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase ${getRoleBadgeStyle(biggestBuy.player.role)}`}>
                  {biggestBuy.player.role}
                </span>
                <h3 className="text-xl font-black font-display uppercase tracking-wide text-[var(--color-text-main)]">
                  {biggestBuy.player.name}
                </h3>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                Acquired by <span className="font-bold text-[var(--color-primary)]">{biggestBuy.teamName}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* OWNER TACTICAL LINEUP STUDIO */}
      {myTeam && (
        <div className="bg-[var(--color-surface)] border-2 border-[var(--color-primary)]/40 rounded-3xl p-4 sm:p-5 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-[var(--color-primary)] text-white flex items-center justify-center font-display font-black text-xs shadow-xs">
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

            <div>
              <span
                className={`font-mono text-xs font-black px-3 py-1 rounded-full border transition ${
                  selectedPlayingIds.length === targetPlayingCount
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/40'
                }`}
              >
                {selectedPlayingIds.length} / {targetPlayingCount} Starting
              </span>
            </div>
          </div>

          {/* Balance Tracker HUD */}
          <div className="grid grid-cols-4 gap-1.5 p-2 rounded-2xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-center text-[10px]">
            <div className="p-1 rounded-lg bg-[var(--color-surface)]">
              <span className="text-[var(--color-text-dim)] block text-[9px] uppercase font-bold">WK</span>
              <span className={`font-mono font-black ${myWkCount >= 1 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {myWkCount} {myWkCount >= 1 ? '✓' : '⚠️'}
              </span>
            </div>
            <div className="p-1 rounded-lg bg-[var(--color-surface)]">
              <span className="text-[var(--color-text-dim)] block text-[9px] uppercase font-bold">BAT</span>
              <span className="font-mono font-black text-[var(--color-text-main)]">{myBatCount}</span>
            </div>
            <div className="p-1 rounded-lg bg-[var(--color-surface)]">
              <span className="text-[var(--color-text-dim)] block text-[9px] uppercase font-bold">AR</span>
              <span className="font-mono font-black text-[var(--color-text-main)]">{myArCount}</span>
            </div>
            <div className="p-1 rounded-lg bg-[var(--color-surface)]">
              <span className="text-[var(--color-text-dim)] block text-[9px] uppercase font-bold">BOWLERS</span>
              <span className={`font-mono font-black ${myTotalBowlers >= 5 ? 'text-emerald-500' : 'text-amber-500'}`}>
                {myTotalBowlers} {myTotalBowlers >= 6 ? '(6th Armed)' : myTotalBowlers === 5 ? '(5 Bowlers)' : '⚠️ Short'}
              </span>
            </div>
          </div>

          {/* Lineup Pickers */}
          <div className="space-y-3">
            {/* STARTING PLAYING UNIT */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-black font-display uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Starting Lineup ({myPlayingPlayers.length})</span>
                </span>
                <span className="text-[10px] text-[var(--color-text-dim)]">Tap to move to bench</span>
              </div>

              {myPlayingPlayers.length === 0 ? (
                <div className="p-3 text-center border border-dashed border-[var(--color-border)] rounded-2xl text-xs text-[var(--color-text-dim)]">
                  No starting players selected. Tap players below to draft into the playing unit.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {myPlayingPlayers.map((player) => (
                    <div
                      key={player.id}
                      onClick={() => togglePlayerInPlayingUnit(player.id)}
                      className="p-2 rounded-xl border border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/15 cursor-pointer transition transform active:scale-98 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase ${getRoleBadgeStyle(player.role)}`}>
                          {player.role}
                        </span>
                        <span className="font-bold text-[var(--color-text-main)] truncate">{player.name}</span>
                      </div>
                      <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-500 opacity-60 flex-shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* BENCH RESERVES */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-black font-display uppercase tracking-wider text-[var(--color-text-dim)] flex items-center space-x-1">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Tactical Bench Reserves ({myBenchPlayers.length})</span>
                </span>
                <span className="text-[10px] text-[var(--color-text-dim)]">Tap to promote</span>
              </div>

              {myBenchPlayers.length === 0 ? (
                <div className="p-2.5 text-center bg-rose-500/10 border border-rose-500/25 rounded-2xl text-[11px] text-rose-600 dark:text-rose-400 font-semibold flex items-center justify-center space-x-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                  <span>Zero bench depth! The AI evaluator will deduct -2.0 points.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {myBenchPlayers.map((player) => (
                    <div
                      key={player.id}
                      onClick={() => togglePlayerInPlayingUnit(player.id)}
                      className="p-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] hover:border-[var(--color-primary)] cursor-pointer transition transform active:scale-98 flex items-center justify-between text-xs opacity-75 hover:opacity-100"
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase ${getRoleBadgeStyle(player.role)}`}>
                          {player.role}
                        </span>
                        <span className="font-medium text-[var(--color-text-muted)] truncate">{player.name}</span>
                      </div>
                      <ArrowRightLeft className="w-3.5 h-3.5 text-[var(--color-text-dim)] flex-shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {lineupSuccessMsg && (
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-2xl text-center flex items-center justify-center space-x-1.5 animate-bounce">
              <Check className="w-4 h-4" />
              <span>{lineupSuccessMsg}</span>
            </div>
          )}

          <button
            type="button"
            disabled={submittingLineup}
            onClick={handleSaveLineup}
            className="w-full min-h-[46px] py-2.5 px-4 rounded-2xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-display text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center justify-center space-x-2 shadow-md active:scale-98"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{submittingLineup ? 'Locking Squad Lineup...' : 'Lock & Save My Tactical Squad'}</span>
          </button>
        </div>
      )}

      {/* MASTER AI PRIME-FORM POWER RANKINGS (1 TO N) */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-4 sm:p-5 shadow-md space-y-4">
        {/* Header and Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-500 to-emerald-500 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <h2 className="text-base font-black font-display uppercase tracking-wide text-[var(--color-text-main)] flex items-center space-x-1.5">
                <span>Prime-Form Power Rankings</span>
              </h2>
              <p className="text-[10px] text-[var(--color-text-dim)] font-medium">
                Teams ranked 1 to {teamsList.length} at historical peak T20 performance
              </p>
            </div>
          </div>

          {isHost && (
            <button
              onClick={handleGenerateScoutReport}
              disabled={analyzing}
              className="text-[10px] font-bold font-display uppercase tracking-wider px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer flex items-center space-x-1 shadow-sm active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin' : ''}`} />
              <span>{analyzing ? 'Simulating...' : masterReport ? 'Re-Analyze' : 'Analyze Teams'}</span>
            </button>
          )}
        </div>

        {/* Readiness Bar */}
        <div className="p-3 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-2xl flex items-center justify-between text-xs">
          <span className="font-semibold text-[var(--color-text-muted)] flex items-center space-x-1.5">
            <Users className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            <span>Owner Lineups Submitted</span>
          </span>
          <span className="font-mono font-black text-xs px-2.5 py-0.5 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-[var(--color-primary)]">
            {submittedCount} / {teamsList.length} Teams Ready
          </span>
        </div>

        {analyzing && (
          <div className="py-8 text-center space-y-2">
            <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs text-[var(--color-text-muted)] font-display uppercase tracking-wider font-bold">
              Simulating head-to-head prime form match-ups & bench depth...
            </p>
          </div>
        )}

        {!analyzing && masterReport && (
          <div className="space-y-3.5">
            {/* Executive Summary */}
            <div className="p-3.5 bg-gradient-to-r from-emerald-500/10 via-[var(--color-surface-subtle)] to-[var(--color-surface-subtle)] border border-emerald-500/20 rounded-2xl text-xs text-[var(--color-text-main)] italic leading-relaxed">
              "{masterReport.executiveSummary}"
            </div>

            {/* DYNAMIC RANKINGS: 1 to N */}
            <div className="space-y-3">
              {masterReport.rankings.map((rep, idx) => {
                const dynamicRank = idx + 1;
                const isExpanded = expandedTeamId === rep.teamId;
                const scorePercent = Math.min(100, Math.max(0, (rep.scoreOutOf10 / 10) * 100));

                return (
                  <div
                    key={rep.teamId}
                    className={`border rounded-2xl overflow-hidden transition duration-200 ${
                      isExpanded
                        ? 'border-[var(--color-primary)] bg-[var(--color-surface-elevated)] shadow-lg'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-hover)]'
                    }`}
                  >
                    {/* Team Header Row */}
                    <div
                      onClick={() => setExpandedTeamId(isExpanded ? null : rep.teamId)}
                      className="p-3.5 cursor-pointer hover:bg-[var(--color-surface-subtle)] transition space-y-2.5"
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
                          {/* Numerical Score Badge */}
                          <div className="text-right">
                            <div className={`font-mono font-black text-sm px-2.5 py-0.5 rounded-full border ${getScoreColor(rep.scoreOutOf10)}`}>
                              {rep.scoreOutOf10.toFixed(1)}
                              <span className="text-[9px] text-[var(--color-text-dim)] font-normal"> / 10</span>
                            </div>
                          </div>

                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-[var(--color-text-dim)]" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-[var(--color-text-dim)]" />
                          )}
                        </div>
                      </div>

                      {/* Animated Score Progress Bar */}
                      <div className="w-full bg-[var(--color-surface-subtle)] h-1.5 rounded-full overflow-hidden border border-[var(--color-border)]">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-emerald-500 via-amber-500 to-emerald-400"
                          style={{ width: `${scorePercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Expanded Detail Panel */}
                    {isExpanded && (
                      <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] space-y-3.5 text-xs">
                        {/* Penalty or Warning Callout */}
                        {rep.benchPenaltyNote && (
                          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-[11px] text-rose-700 dark:text-rose-300 font-semibold flex items-start space-x-2">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-500 mt-0.5" />
                            <span>{rep.benchPenaltyNote}</span>
                          </div>
                        )}

                        {/* Tactical 4-Pillar Matrix */}
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-dim)] block mb-1.5">
                            Tactical Balance Matrix
                          </span>
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div className="p-2.5 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)]">
                              <span className="text-[9px] text-[var(--color-text-dim)] uppercase font-bold block">
                                Batting Depth
                              </span>
                              <span className="font-bold text-[var(--color-text-main)]">
                                {rep.playingBalance.battingDepth}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)]">
                              <span className="text-[9px] text-[var(--color-text-dim)] uppercase font-bold block">
                                Death Bowling
                              </span>
                              <span className="font-bold text-[var(--color-text-main)]">
                                {rep.playingBalance.deathBowling}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)]">
                              <span className="text-[9px] text-[var(--color-text-dim)] uppercase font-bold block">
                                Spin & Middle Overs
                              </span>
                              <span className="font-bold text-[var(--color-text-main)]">
                                {rep.playingBalance.spinQuality}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)]">
                              <span className="text-[9px] text-[var(--color-text-dim)] uppercase font-bold block">
                                Bench Quality
                              </span>
                              <span className="font-bold text-[var(--color-text-main)]">
                                {rep.benchStrength}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 6th Bowling Option Security */}
                        {rep.metrics && (
                          <div className="p-2.5 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)] flex items-center justify-between text-[11px]">
                            <span className="font-medium text-[var(--color-text-muted)]">6th Bowling Option:</span>
                            <span
                              className={`font-black flex items-center space-x-1 ${
                                rep.metrics.sixthBowlingOption
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>{rep.metrics.sixthBowlingOption ? 'Guaranteed (A+)' : 'Missing / High Risk (C)'}</span>
                            </span>
                          </div>
                        )}

                        {/* Key Pros */}
                        {rep.pros?.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 block flex items-center space-x-1">
                              <Zap className="w-3 h-3" />
                              <span>Prime Strengths:</span>
                            </span>
                            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-[var(--color-text-muted)]">
                              {rep.pros.map((pro, i) => (
                                <li key={i}>{pro}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Key Vulnerabilities */}
                        {rep.cons?.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400 block flex items-center space-x-1">
                              <AlertTriangle className="w-3 h-3" />
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
          <div className="p-6 text-center bg-[var(--color-surface-subtle)] rounded-2xl border border-dashed border-[var(--color-border)] space-y-1">
            <TrendingUp className="w-6 h-6 text-[var(--color-text-dim)] mx-auto mb-1 animate-pulse" />
            <p className="text-xs font-bold text-[var(--color-text-main)]">
              Leaderboard Simulation Pending
            </p>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              {isHost
                ? 'Tap "Analyze Teams" above to generate the full tournament ranking and head-to-head tactical scout.'
                : 'Waiting for the host to trigger the AI tournament scout...'}
            </p>
          </div>
        )}
      </div>

      {/* ALL TEAM SQUADS BREAKDOWN */}
      <div className="space-y-3">
        <h2 className="text-base font-black font-display uppercase tracking-wider text-[var(--color-text-main)] flex items-center space-x-2">
          <Layers className="w-4 h-4 text-[var(--color-primary)]" />
          <span>Final Official Squad Sheets</span>
        </h2>

        {teamsList.map((team) => (
          <div
            key={team.id}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 shadow-xs space-y-2.5"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
              <div>
                <h3 className="text-sm font-black font-display uppercase text-[var(--color-text-main)]">
                  {team.name}
                </h3>
                <span className="text-[11px] text-[var(--color-text-muted)] font-medium">
                  Owner: {team.claimedByOwnerName || 'Unclaimed'}
                </span>
              </div>

              <div className="text-right">
                <span className="text-[9px] text-[var(--color-text-dim)] uppercase block font-bold">Spent / Remaining</span>
                <span className="text-xs font-mono font-bold text-[var(--color-text-main)]">
                  <span className="text-amber-500">₹{team.spent}</span> /{' '}
                  <span className="text-emerald-500">₹{team.purse} {room.settings?.purseUnit || 'Cr'}</span>
                </span>
              </div>
            </div>

            {team.players.length === 0 ? (
              <p className="text-xs text-[var(--color-text-dim)] italic">No players acquired.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {team.players.map((p, idx) => (
                  <div
                    key={p.id + idx}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-[var(--color-surface-subtle)] text-xs"
                  >
                    <div className="flex items-center space-x-1.5 truncate">
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase ${getRoleBadgeStyle(p.role)}`}>
                        {p.role}
                      </span>
                      <span className="font-bold text-[var(--color-text-main)] truncate text-[11px]">
                        {p.name}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-amber-500 text-[11px] flex-shrink-0">
                      ₹{p.soldPrice ?? p.basePrice}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Host Restart Controls */}
      {isHost && (
        <div className="sticky bottom-4 bg-[var(--color-surface)]/95 backdrop-blur-md border border-[var(--color-border)] p-3.5 rounded-2xl shadow-xl text-center space-y-1.5">
          <button
            type="button"
            disabled={resetting}
            onClick={handleResetAuction}
            className="w-full min-h-[46px] py-2.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-display text-sm font-bold uppercase tracking-wider shadow-md transition active:scale-98 flex items-center justify-center space-x-2 cursor-pointer"
          >
            <RotateCcw className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />
            <span>{resetting ? 'Resetting Room...' : 'Start A New Auction'}</span>
          </button>
          <p className="text-[10px] text-[var(--color-text-dim)]">
            Clears purses and rosters back to lobby while preserving team phone claims.
          </p>
        </div>
      )}
    </div>
  );
};