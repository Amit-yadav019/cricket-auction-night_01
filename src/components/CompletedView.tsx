import React, { useEffect, useState } from 'react';
import { Trophy, Flame, RotateCcw, Award, Users, Sparkles, Star } from 'lucide-react';
import confetti from 'canvas-confetti';
import { RoomData, resetAuctionTransaction } from '../services/auctionService';
import { PlayerRole } from '../game/auctionRules';
import { sound } from '../services/soundService';
import { fetchAiScoutReport, AiScoutReport } from '../services/aiService';

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
  const [scoutReports, setScoutReports] = useState<AiScoutReport[]>([]);
  const [loadingScout, setLoadingScout] = useState(false);

  useEffect(() => {
    // Fire celebratory confetti & fanfare sound on mount
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
      sound.playFanfare();
    } catch (e) {
      // Ignore if canvas not supported
    }

    // Auto-fetch AI scout reports
    handleFetchScout();
  }, []);

  const handleFetchScout = async () => {
    setLoadingScout(true);
    try {
      const reports = await fetchAiScoutReport(
        room.teams,
        room.settings.purseUnit,
        room.settings.minSquadSize,
        room.settings.maxSquadSize
      );
      setScoutReports(reports);
    } finally {
      setLoadingScout(false);
    }
  };

  const handleResetAuction = async () => {
    if (!isHost) return;
    if (confirm('Start a new auction? This resets purses and rosters, keeping team claims intact.')) {
      await resetAuctionTransaction(room.code, hostToken);
    }
  };

  // Find biggest buy across all sold players
  const allSoldPlayers: { player: any; teamName: string; price: number }[] = [];
  for (const t of room.teams) {
    for (const p of t.players) {
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
                <span className="text-lg font-bold">{room.settings.purseUnit}</span>
              </div>
            </div>
          </div>
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
                AI Franchise Scout Report
              </h2>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Tactical grading & tournament prediction powered by Gemini
              </p>
            </div>
          </div>
          <button
            onClick={handleFetchScout}
            disabled={loadingScout}
            className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-[var(--color-primary-light)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition cursor-pointer"
          >
            {loadingScout ? 'Analyzing...' : 'Refresh'}
          </button>
        </div>

        {loadingScout && (
          <div className="py-6 text-center space-y-2">
            <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs text-[var(--color-text-muted)] font-display uppercase tracking-wider">
              Scouting team depth & calculating squad grades...
            </p>
          </div>
        )}

        {!loadingScout && scoutReports.length > 0 && (
          <div className="space-y-2.5 mt-2">
            {scoutReports.map((report, idx) => (
              <div
                key={report.teamName + idx}
                className="p-3 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-2xl space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-display font-black text-sm uppercase text-[var(--color-text-main)]">
                      {report.teamName}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-amber-400 text-amber-950 font-black font-display text-xs">
                      {report.grade}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-[var(--color-primary)] bg-[var(--color-primary-light)] px-2 py-0.5 rounded-full">
                    {report.predictedFinish}
                  </span>
                </div>
                <p className="text-xs font-bold text-[var(--color-accent)]">{report.verdict}</p>
                <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                  {report.analysis}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ALL TEAM SQUADS BREAKDOWN */}
      <div className="space-y-4">
        <h2 className="text-lg font-black font-display uppercase tracking-wider text-[var(--color-text-main)] flex items-center space-x-2">
          <Award className="w-5 h-5 text-[var(--color-primary)]" />
          <span>Final Team Rosters</span>
        </h2>

        {room.teams.map((team) => (
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

            {/* Players List */}
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
                      ₹{p.soldPrice ?? p.basePrice} {room.settings.purseUnit}
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
            onClick={handleResetAuction}
            className="w-full min-h-[48px] py-3 px-6 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-display text-lg font-bold uppercase tracking-wider shadow-md transition active:scale-95 flex items-center justify-center space-x-2 cursor-pointer"
          >
            <RotateCcw className="w-5 h-5" />
            <span>Start a New Auction</span>
          </button>
          <p className="text-[11px] text-[var(--color-text-dim)]">
            Resets purse budgets and squad rosters while keeping team phone claims.
          </p>
        </div>
      )}
    </div>
  );
};
