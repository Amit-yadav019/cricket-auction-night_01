import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Flame,
  RotateCcw,
  Award,
  Sparkles,
  CheckCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { RoomData, resetAuctionTransaction, submitTeamLineupTransaction, saveMasterScoutReport } from '../services/auctionService';
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
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
      sound.playFanfare();
    } catch {
      // Ignore if canvas not supported
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

  const togglePlayerInPlayingUnit = (playerId: string) => {
    if (selectedPlayingIds.includes(playerId)) {
      setSelectedPlayingIds(selectedPlayingIds.filter((id) => id !== playerId));
    } else {
      if (selectedPlayingIds.length >= targetPlayingCount) {
        alert(`You can select at most ${targetPlayingCount} players in your Starting Unit. Uncheck one first.`);
        return;
      }
      setSelectedPlayingIds([...selectedPlayingIds, playerId]);
    }
  };

  const handleSaveLineup = async () => {
    if (!myTeam || !myTeam.players) return;
    if (selectedPlayingIds.length !== targetPlayingCount && myTeam.players.length >= targetPlayingCount) {
      alert(`Please select exactly ${targetPlayingCount} players for your Starting Playing Unit.`);
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
      setLineupSuccessMsg('Lineup locked & submitted successfully!');
      setTimeout(() => setLineupSuccessMsg(''), 4000);
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
      alert('Analysis error: ' + (err?.message || err));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleResetAuction = async () => {
    if (!isHost) return;
    if (confirm('Start a new auction? This resets purses and rosters, keeping team claims intact.')) {
      setResetting(true);
      await resetAuctionTransaction(room.code, hostToken);
      setResetting(false);
    }
  };

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

  const submittedCount = teamsList.filter((t) => existingLineups[t.id]?.playingIds?.length > 0).length;

  return (
    <div className="w-full max-w-[540px] mx-auto px-4 py-6 space-y-6">
      {/* Header Trophy Card */}
      <div className="bg-[var(--color-surface)] border-2 border-[var(--color-primary)] rounded-3xl p-6 text-center shadow-lg relative overflow-hidden">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 mx-auto flex items-center justify-center mb-3 shadow-inner">
          <Trophy className="w-9 h-9" />
        </div>
        <h1 className="text-3xl font-black font-display uppercase tracking-wider text-[var(--color-text-main)]">
          Auction Concluded!
        </h1>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          All team squads and budgets are locked in.
        </p>

        {onOpenSummary && (
          <div className="mt-4">
            <button
              onClick={onOpenSummary}
              className="px-4 py-2 bg-[var(--color-primary-light)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer"
            >
              Open Full Financial & Roster Summary
            </button>
          </div>
        )}
      </div>

      {/* HIGHLIGHTED BIGGEST BUY CARD */}
      {biggestBuy && (
        <div className="bg-gradient-to-br from-amber-500/10 via-red-500/10 to-amber-500/5 border-2 border-amber-500 rounded-3xl p-5 shadow-md relative">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-500 text-white font-display text-xs font-black uppercase tracking-wider mb-2 shadow-xs">
            <Flame className="w-4 h-4 fill-white" />
            <span>Biggest Buy of the Auction</span>
          </div>

          <div className="flex items-center justify-between mt-1">
            <div>
              <div className="flex items-center space-x-2">
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${getRoleBadgeColor(
                    biggestBuy.player.role
                  )}`}
                >
                  {biggestBuy.player.role}
                </span>
                <h3 className="text-2xl font-black font-display uppercase tracking-wide text-[var(--color-text-main)]">
                  {biggestBuy.player.name}
                </h3>
              </div>
              <p className="text-xs font-semibold text-[var(--color-text-muted)] mt-0.5">
                Acquired by <span className="font-bold text-[var(--color-primary)]">{biggestBuy.teamName}</span>
              </p>
            </div>

            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-[var(--color-text-dim)]">Hammer Price</span>
              <div className="text-3xl font-black font-display text-[var(--color-accent)] scoreboard-num">
                ₹{biggestBuy.price}{' '}
                <span className="text-lg font-bold">{room.settings?.purseUnit || 'Cr'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OWNER LINEUP BUILDER */}
      {myTeam && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2.5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary)]">
                Team Owner Console
              </span>
              <h2 className="text-sm font-black font-display uppercase text-[var(--color-text-main)]">
                {myTeam.name} Lineup Builder
              </h2>
            </div>
            <span className="text-xs font-bold font-mono px-2.5 py-1 rounded-full bg-[var(--color-surface-subtle)] border border-[var(--color-border)]">
              {selectedPlayingIds.length}/{targetPlayingCount} Playing
            </span>
          </div>

          <p className="text-[11px] text-[var(--color-text-muted)]">
            Tap to select your <strong>{targetPlayingCount} starting players</strong>. Unselected squad members will automatically become your <strong>bench & tactical replacements</strong>.
          </p>

          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {(myTeam.players || []).map((player) => {
              const isPlaying = selectedPlayingIds.includes(player.id);
              return (
                <div
                  key={player.id}
                  onClick={() => togglePlayerInPlayingUnit(player.id)}
                  className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                    isPlaying
                      ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                      : 'border-[var(--color-border)] bg-[var(--color-surface-subtle)] opacity-75'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 truncate">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--color-surface-elevated)] text-[var(--color-text-main)]">
                      {player.role}
                    </span>
                    <span className="text-xs font-bold text-[var(--color-text-main)] truncate">
                      {player.name}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isPlaying
                          ? 'bg-emerald-500 text-white'
                          : 'bg-gray-200 dark:bg-gray-800 text-gray-500'
                      }`}
                    >
                      {isPlaying ? 'Playing Unit' : 'Bench'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {lineupSuccessMsg && (
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-400 text-emerald-800 dark:text-emerald-200 text-xs font-bold rounded-lg text-center">
              {lineupSuccessMsg}
            </div>
          )}

          <button
            type="button"
            disabled={submittingLineup}
            onClick={handleSaveLineup}
            className="w-full min-h-[42px] py-2 px-4 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-display text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center justify-center space-x-1.5 shadow-sm"
          >
            <CheckCircle className="w-4 h-4" />
            <span>{submittingLineup ? 'Saving Lineup...' : 'Lock & Submit My Squad'}</span>
          </button>
        </div>
      )}

      {/* AI FRANCHISE TALENT SCOUT REPORT */}
      <div className="bg-[var(--color-surface)] border border-emerald-500/30 rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--color-primary)] text-white flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base font-black font-display uppercase tracking-wide text-[var(--color-text-main)]">
                AI Prime-Form Franchise Scout
              </h2>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Evaluates peak T20 form, playing balance & bench depth
              </p>
            </div>
          </div>
          {isHost && (
            <button
              onClick={handleGenerateScoutReport}
              disabled={analyzing}
              className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-[var(--color-primary-light)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition cursor-pointer flex items-center space-x-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin' : ''}`} />
              <span>{analyzing ? 'Analyzing...' : masterReport ? 'Re-Analyze' : 'Analyze Teams'}</span>
            </button>
          )}
        </div>

        {/* Readiness Bar */}
        <div className="p-2.5 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl flex items-center justify-between text-xs">
          <span className="font-semibold text-[var(--color-text-muted)]">Owner Lineups Submitted:</span>
          <span className="font-mono font-bold text-[var(--color-primary)]">
            {submittedCount} / {teamsList.length} Teams
          </span>
        </div>

        {analyzing && (
          <div className="py-6 text-center space-y-2">
            <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs text-[var(--color-text-muted)] font-display uppercase tracking-wider">
              Scouting team depth & calculating squad grades...
            </p>
          </div>
        )}

        {!analyzing && masterReport && (
          <div className="space-y-3 mt-2">
            <div className="p-3 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text-muted)] italic">
              "{masterReport.executiveSummary}"
            </div>

            <div className="space-y-2.5">
              {masterReport.rankings.map((rep) => {
                const isExpanded = expandedTeamId === rep.teamId;
                return (
                  <div
                    key={rep.teamId}
                    className="border border-[var(--color-border)] rounded-xl overflow-hidden bg-[var(--color-surface-elevated)]"
                  >
                    <div
                      onClick={() => setExpandedTeamId(isExpanded ? null : rep.teamId)}
                      className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-[var(--color-surface-subtle)] transition"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-7 h-7 rounded-lg bg-[var(--color-primary-light)] text-[var(--color-primary)] flex items-center justify-center font-display font-black text-xs">
                          #{rep.rank}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-[var(--color-text-main)]">
                            {rep.teamName}
                          </div>
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            {rep.verdict}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <div className="text-right">
                          <span className="text-xs font-black font-mono text-[var(--color-primary)]">
                            {rep.scoreOutOf10}/10
                          </span>
                          <span className="block text-[9px] text-[var(--color-text-dim)] uppercase">Score</span>
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-3.5 border-t border-[var(--color-border)] bg-[var(--color-surface)] space-y-3 text-xs">
                        {/* Bench Penalty Warning */}
                        {rep.benchPenaltyNote && (
                          <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-xl text-[11px] text-red-800 dark:text-red-200 font-semibold flex items-center space-x-2">
                            <span>⚠️</span>
                            <span>{rep.benchPenaltyNote}</span>
                          </div>
                        )}

                        {/* Tactical Metrics Grid */}
                        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                          <div className="p-2 rounded-lg bg-[var(--color-surface-subtle)]">
                            <span className="text-[10px] text-[var(--color-text-dim)] block">Batting Depth</span>
                            <span className="font-semibold text-[var(--color-text-main)]">
                              {rep.playingBalance.battingDepth}
                            </span>
                          </div>
                          <div className="p-2 rounded-lg bg-[var(--color-surface-subtle)]">
                            <span className="text-[10px] text-[var(--color-text-dim)] block">Death Bowling</span>
                            <span className="font-semibold text-[var(--color-text-main)]">
                              {rep.playingBalance.deathBowling}
                            </span>
                          </div>
                          <div className="p-2 rounded-lg bg-[var(--color-surface-subtle)]">
                            <span className="text-[10px] text-[var(--color-text-dim)] block">Spin Quality</span>
                            <span className="font-semibold text-[var(--color-text-main)]">
                              {rep.playingBalance.spinQuality}
                            </span>
                          </div>
                          <div className="p-2 rounded-lg bg-[var(--color-surface-subtle)]">
                            <span className="text-[10px] text-[var(--color-text-dim)] block">Bench Depth Status</span>
                            <span className="font-semibold text-[var(--color-text-main)]">
                              {rep.benchStrength}
                            </span>
                          </div>
                        </div>

                        {/* 6th Bowling Option Check Badge */}
                        {rep.metrics && (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-surface-subtle)] text-[11px]">
                            <span className="text-[var(--color-text-dim)]">6th Bowling Option:</span>
                            <span className={`font-bold flex items-center space-x-1 ${rep.metrics.sixthBowlingOption ? 'text-emerald-600' : 'text-amber-600'}`}>
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>{rep.metrics.sixthBowlingOption ? 'Present (Protected)' : 'None (High Risk)'}</span>
                            </span>
                          </div>
                        )}

                        {/* Pros */}
                        {rep.pros?.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400 block flex items-center space-x-1">
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

                        {/* Cons */}
                        {rep.cons?.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase text-red-600 dark:text-red-400 block">
                              Tactical Vulnerabilities:
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
          <div className="p-4 text-center bg-[var(--color-surface-subtle)] rounded-xl border border-dashed border-[var(--color-border)]">
            <p className="text-xs text-[var(--color-text-muted)]">
              {isHost
                ? 'Tap "Analyze Teams" above to generate a prime-form head-to-head tournament scout report.'
                : 'Waiting for the host to trigger the AI tactical analysis...'}
            </p>
          </div>
        )}
      </div>

      {/* ALL TEAM SQUADS BREAKDOWN */}
      <div className="space-y-4">
        <h2 className="text-lg font-black font-display uppercase tracking-wider text-[var(--color-text-main)] flex items-center space-x-2">
          <Award className="w-5 h-5 text-[var(--color-primary)]" />
          <span>Final Team Rosters</span>
        </h2>

        {teamsList.map((team) => (
          <div
            key={team.id}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
              <div>
                <h3 className="text-base font-black font-display uppercase text-[var(--color-text-main)]">
                  {team.name}
                </h3>
                <span className="text-xs text-[var(--color-text-muted)] font-medium">
                  Owner: {team.claimedByOwnerName || 'Unclaimed'}
                </span>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-[var(--color-text-dim)] uppercase block">Spent / Left</span>
                <span className="text-xs font-mono font-bold text-[var(--color-text-main)]">
                  <span className="text-[var(--color-accent)]">₹{team.spent}</span> /{' '}
                  <span className="text-emerald-600 dark:text-emerald-400">₹{team.purse} left</span>
                </span>
              </div>
            </div>

            {team.players.length === 0 ? (
              <p className="text-xs text-[var(--color-text-dim)] italic">No players acquired.</p>
            ) : (
              <div className="space-y-1.5">
                {team.players.map((p, idx) => (
                  <div
                    key={p.id + idx}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[var(--color-surface-subtle)] text-xs"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span className="font-mono text-[var(--color-text-dim)] text-[10px] w-4">
                        {idx + 1}.
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${getRoleBadgeColor(
                          p.role
                        )}`}
                      >
                        {p.role}
                      </span>
                      <span className="font-bold text-[var(--color-text-main)] truncate">
                        {p.name}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-[var(--color-accent)] flex-shrink-0">
                      ₹{p.soldPrice ?? p.basePrice} {room.settings?.purseUnit || 'Cr'}
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
        <div className="sticky bottom-4 bg-[var(--color-surface)]/95 backdrop-blur-md border border-[var(--color-border)] p-4 rounded-2xl shadow-xl text-center space-y-2">
          <button
            type="button"
            disabled={resetting}
            onClick={handleResetAuction}
            className="w-full min-h-[48px] py-3 px-6 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-display text-lg font-bold uppercase tracking-wider shadow-md transition active:scale-95 flex items-center justify-center space-x-2 cursor-pointer"
          >
            <RotateCcw className={`w-5 h-5 ${resetting ? 'animate-spin' : ''}`} />
            <span>{resetting ? 'Resetting Room...' : 'Start a New Auction'}</span>
          </button>
          <p className="text-[11px] text-[var(--color-text-dim)]">
            Resets purse budgets and squad rosters while keeping team phone claims.
          </p>
        </div>
      )}
    </div>
  );
};