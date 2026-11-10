import React, { useState } from 'react';
import { X, Trophy, DollarSign, Users, Award, Shield, CheckCircle2, Sparkles } from 'lucide-react';
import { RoomData } from '../services/auctionService';
import { PlayerRole } from '../game/auctionRules';
import { fetchAiScoutReport, AiScoutReport } from '../services/aiService';

interface AuctionSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: RoomData;
}

export const AuctionSummaryModal: React.FC<AuctionSummaryModalProps> = ({
  isOpen,
  onClose,
  room,
}) => {
  const [scoutReports, setScoutReports] = useState<AiScoutReport[]>([]);
  const [loadingScout, setLoadingScout] = useState(false);

  if (!isOpen) return null;

  const minSquad = room.settings.minSquadSize || 3;
  const maxSquad = room.settings.maxSquadSize || room.settings.squadSize || 6;
  const initialPurse = room.settings.pursePerTeam;
  const unit = room.settings.purseUnit;

  // Aggregate league stats
  const totalAllocated = room.teams.length * initialPurse;
  const totalSpent = room.teams.reduce((acc, t) => acc + t.spent, 0);
  const totalRemaining = room.teams.reduce((acc, t) => acc + t.purse, 0);
  const totalSoldPlayers = room.teams.reduce((acc, t) => acc + t.players.length, 0);

  // Highest buy
  let biggestBuy: { player: any; teamName: string; price: number } | null = null;
  for (const t of room.teams) {
    for (const p of t.players) {
      if (p.soldPrice && (!biggestBuy || p.soldPrice > biggestBuy.price)) {
        biggestBuy = { player: p, teamName: t.name, price: p.soldPrice };
      }
    }
  }

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-fade-in">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl max-w-xl w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 shadow-2xl relative space-y-4">
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close summary"
          className="absolute right-4 top-4 p-2 text-[var(--color-text-dim)] hover:text-[var(--color-text-main)] rounded-full hover:bg-[var(--color-surface-subtle)] min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div>
          <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold uppercase tracking-wider mb-1">
            <Trophy className="w-3.5 h-3.5" />
            <span>Auction Financial & Roster Summary</span>
          </div>
          <h2 className="text-2xl font-black font-display uppercase tracking-wide text-[var(--color-text-main)]">
            Live Auction Dashboard
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            Purse expenditures, remaining balances, and player pickup breakdowns.
          </p>
        </div>

        {/* Macro Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
          <div className="bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl p-2.5">
            <span className="text-[10px] text-[var(--color-text-dim)] uppercase font-bold block">
              Total Spent
            </span>
            <span className="font-display font-black text-lg text-[var(--color-accent)] scoreboard-num">
              ₹{Number(totalSpent.toFixed(2))} <span className="text-xs">{unit}</span>
            </span>
          </div>

          <div className="bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl p-2.5">
            <span className="text-[10px] text-[var(--color-text-dim)] uppercase font-bold block">
              Purse Remaining
            </span>
            <span className="font-display font-black text-lg text-emerald-600 dark:text-emerald-400 scoreboard-num">
              ₹{Number(totalRemaining.toFixed(2))} <span className="text-xs">{unit}</span>
            </span>
          </div>

          <div className="bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl p-2.5">
            <span className="text-[10px] text-[var(--color-text-dim)] uppercase font-bold block">
              Players Sold
            </span>
            <span className="font-display font-black text-lg text-[var(--color-primary)] scoreboard-num">
              {totalSoldPlayers}
            </span>
          </div>

          <div className="bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl p-2.5">
            <span className="text-[10px] text-[var(--color-text-dim)] uppercase font-bold block">
              Squad Target
            </span>
            <span className="font-display font-black text-base text-[var(--color-text-main)] scoreboard-num">
              {minSquad === maxSquad ? `${maxSquad}` : `${minSquad}-${maxSquad}`}
            </span>
          </div>
        </div>

        {/* Highlighted Biggest Buy */}
        {biggestBuy && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-2xl flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 truncate mr-2">
              <Award className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div className="truncate">
                <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-300 block">
                  Top Buy of Auction
                </span>
                <span className="font-bold text-[var(--color-text-main)] truncate">
                  {biggestBuy.player.name} ({biggestBuy.teamName})
                </span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="font-display font-black text-base text-[var(--color-accent)] scoreboard-num">
                ₹{biggestBuy.price} {unit}
              </span>
            </div>
          </div>
        )}

        {/* Team By Team Detailed Roster & Purse Table */}
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold font-display uppercase tracking-wider text-[var(--color-text-main)]">
              Team Expenditures & Roster Compositions
            </h3>
            <span className="text-[10px] text-[var(--color-text-dim)]">
              Min {minSquad} · Max {maxSquad} Players
            </span>
          </div>

          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {room.teams.map((team) => {
              const count = team.players.length;
              const hasMetMin = count >= minSquad;
              const isMaxed = count >= maxSquad;

              // Role distribution
              const batCount = team.players.filter((p) => p.role === 'BAT').length;
              const wkCount = team.players.filter((p) => p.role === 'WK').length;
              const arCount = team.players.filter((p) => p.role === 'AR').length;
              const bowlCount = team.players.filter((p) => p.role === 'BOWL').length;

              return (
                <div
                  key={team.id}
                  className="bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-2xl p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 truncate">
                      <div className="w-8 h-8 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center font-display font-black text-xs text-[var(--color-primary)] flex-shrink-0">
                        {team.shortName}
                      </div>
                      <div className="truncate">
                        <span className="font-bold text-xs text-[var(--color-text-main)] block truncate">
                          {team.name}
                        </span>
                        <span className="text-[10px] text-[var(--color-text-dim)]">
                          Owner: {team.claimedByOwnerName || 'Unassigned'}
                        </span>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <span className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                        ₹{team.purse} {unit} left
                      </span>
                      <span className="block text-[10px] text-[var(--color-accent)] font-semibold">
                        Spent: ₹{team.spent}
                      </span>
                    </div>
                  </div>

                  {/* Squad Count & Role Chips */}
                  <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border)]/60 text-[11px]">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-[10px] text-[var(--color-text-dim)] font-medium">Roles:</span>
                      <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 text-[10px] font-bold">
                        {batCount} BAT
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 text-[10px] font-bold">
                        {wkCount} WK
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 text-[10px] font-bold">
                        {arCount} AR
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200 text-[10px] font-bold">
                        {bowlCount} BOWL
                      </span>
                    </div>

                    <span
                      className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isMaxed
                          ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
                          : hasMetMin
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                      }`}
                    >
                      {count}/{minSquad === maxSquad ? maxSquad : `${minSquad}-${maxSquad}`}
                      {isMaxed ? ' (Full)' : hasMetMin ? ' (Min Met)' : ' (Under Min)'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Talent Scout Section */}
        <div className="bg-[var(--color-surface-subtle)] border border-emerald-500/30 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-lg bg-[var(--color-primary)] text-white flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              </div>
              <span className="font-display font-black text-sm uppercase text-[var(--color-text-main)]">
                AI Franchise Talent Scout
              </span>
            </div>
            <button
              onClick={async () => {
                setLoadingScout(true);
                const reports = await fetchAiScoutReport(
                  room.teams,
                  unit,
                  minSquad,
                  maxSquad
                );
                setScoutReports(reports);
                setLoadingScout(false);
              }}
              disabled={loadingScout}
              className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-[var(--color-primary-light)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition cursor-pointer"
            >
              {loadingScout ? 'Scouting...' : scoutReports.length > 0 ? 'Refresh Analysis' : 'Run AI Scout Analysis'}
            </button>
          </div>

          {loadingScout && (
            <div className="py-4 text-center space-y-1">
              <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-[11px] text-[var(--color-text-muted)] font-display uppercase tracking-wider">
                Evaluating squad compositions & auction efficiency...
              </p>
            </div>
          )}

          {scoutReports.length > 0 && !loadingScout && (
            <div className="space-y-2 pt-1">
              {scoutReports.map((report, idx) => (
                <div
                  key={report.teamName + idx}
                  className="p-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl space-y-1"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-display font-black uppercase text-[var(--color-text-main)]">
                      {report.teamName}
                    </span>
                    <div className="flex items-center space-x-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-amber-400 text-amber-950 font-black font-display text-[11px]">
                        Grade {report.grade}
                      </span>
                      <span className="text-[9px] font-bold text-[var(--color-primary)] bg-[var(--color-primary-light)] px-1.5 py-0.5 rounded-full">
                        {report.predictedFinish}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] font-bold text-[var(--color-accent)]">{report.verdict}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)] leading-tight">{report.analysis}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full min-h-[44px] py-2.5 rounded-xl bg-[var(--color-primary)] text-white font-bold text-xs uppercase tracking-wider hover:bg-[var(--color-primary-hover)] transition cursor-pointer"
        >
          Back to Auction
        </button>
      </div>
    </div>
  );
};
