import React, { useState } from 'react';
import { Users, ChevronDown, ChevronUp, UserCheck, Shield, Plus } from 'lucide-react';
import { RoomData, claimTeam } from '../services/auctionService';
import { PlayerRole } from '../game/auctionRules';

interface SquadsViewProps {
  room: RoomData;
  ownerToken: string;
  ownerName: string;
  onUpdateOwnerName: (name: string) => void;
}

export const SquadsView: React.FC<SquadsViewProps> = ({
  room,
  ownerToken,
  ownerName,
  onUpdateOwnerName,
}) => {
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(
    room.teams[0]?.id || null
  );
  const [claimNameInput, setClaimNameInput] = useState(ownerName || '');
  const [claimingTeamId, setClaimingTeamId] = useState<string | null>(null);

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

  const handleClaim = async (teamId: string) => {
    const name = claimNameInput.trim() || 'Owner';
    onUpdateOwnerName(name);
    setClaimingTeamId(teamId);
    await claimTeam(room.code, teamId, name, ownerToken);
    setClaimingTeamId(null);
  };

  const maxSquad = room.settings.maxSquadSize || room.settings.squadSize;
  const minSquad = room.settings.minSquadSize || maxSquad;
  const myClaimedTeam = room.teams.find((t) => t.ownerToken === ownerToken);

  return (
    <div className="w-full max-w-[540px] mx-auto px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black font-display uppercase tracking-wider text-[var(--color-text-main)]">
            Team Squads
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            Purse cap: ₹{room.settings.pursePerTeam} {room.settings.purseUnit} · Target: {minSquad === maxSquad ? `${maxSquad} Players` : `${minSquad} to ${maxSquad} Players`}
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {room.teams.map((team) => {
          const maxSquad = room.settings.maxSquadSize || room.settings.squadSize;
          const minSquad = room.settings.minSquadSize || maxSquad;
          const isExpanded = expandedTeamId === team.id;
          const isMine = team.ownerToken === ownerToken;
          const isClaimed = !!team.claimedByOwnerName;
          const slotsLeft = maxSquad - team.players.length;

          return (
            <div
              key={team.id}
              className={`bg-[var(--color-surface)] border rounded-2xl overflow-hidden transition shadow-xs ${
                isMine
                  ? 'border-emerald-500 ring-1 ring-emerald-500/30'
                  : 'border-[var(--color-border)]'
              }`}
            >
              {/* Team Accordion Header */}
              <button
                type="button"
                onClick={() => setExpandedTeamId(isExpanded ? null : team.id)}
                className="w-full p-3.5 flex items-center justify-between text-left hover:bg-[var(--color-surface-subtle)] transition cursor-pointer min-h-[48px]"
              >
                <div className="flex items-center space-x-3 truncate mr-2">
                  <div className="w-10 h-10 rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border)] flex items-center justify-center font-display font-black text-sm text-[var(--color-primary)] flex-shrink-0">
                    {team.shortName}
                  </div>
                  <div className="truncate">
                    <div className="text-sm font-black font-display uppercase tracking-wide text-[var(--color-text-main)] truncate">
                      {team.name}
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)] flex items-center space-x-1.5">
                      <span>{isClaimed ? team.claimedByOwnerName : 'Open'}</span>
                      {isMine && <span className="text-emerald-600 font-bold">(You)</span>}
                      <span>·</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        ₹{team.purse} left
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 flex-shrink-0">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-[var(--color-surface-subtle)] text-[var(--color-text-main)] border border-[var(--color-border)]">
                    {team.players.length}/{minSquad === maxSquad ? maxSquad : `${minSquad}-${maxSquad}`}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-[var(--color-text-dim)]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[var(--color-text-dim)]" />
                  )}
                </div>
              </button>

              {/* Expanded Team Squad Details */}
              {isExpanded && (
                <div className="px-3.5 pb-3.5 pt-1 border-t border-[var(--color-border)] space-y-2.5 bg-[var(--color-surface-subtle)]/40">
                  {/* Stats Bar */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs py-2 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
                    <div>
                      <span className="text-[10px] text-[var(--color-text-dim)] uppercase block">Spent</span>
                      <span className="font-mono font-bold text-[var(--color-accent)]">₹{team.spent}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[var(--color-text-dim)] uppercase block">Purse Left</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">₹{team.purse}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[var(--color-text-dim)] uppercase block">Slots Left</span>
                      <span className="font-mono font-bold text-[var(--color-text-main)]">{slotsLeft}</span>
                    </div>
                  </div>

                  {/* Claim Button if Open & User has no team */}
                  {!isClaimed && !myClaimedTeam && room.status === 'lobby' && (
                    <div className="p-2 bg-[var(--color-primary-light)]/40 rounded-xl flex items-center justify-between">
                      <input
                        type="text"
                        placeholder="Your name"
                        value={claimNameInput}
                        onChange={(e) => setClaimNameInput(e.target.value)}
                        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2.5 py-1 text-xs font-semibold mr-2 flex-1 min-h-[36px]"
                      />
                      <button
                        onClick={() => handleClaim(team.id)}
                        disabled={claimingTeamId === team.id}
                        className="px-3 py-1 bg-[var(--color-primary)] text-white font-bold text-xs rounded-lg min-h-[36px] flex-shrink-0"
                      >
                        Claim Team
                      </button>
                    </div>
                  )}

                  {/* Players list */}
                  {team.players.length === 0 ? (
                    <p className="text-xs text-[var(--color-text-dim)] italic text-center py-3">
                      No players purchased yet.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {team.players.map((p, idx) => (
                        <div
                          key={p.id + idx}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <span className="text-[10px] font-mono text-[var(--color-text-dim)] w-4">
                              {idx + 1}.
                            </span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${getRoleBadgeColor(
                                p.role
                              )}`}
                            >
                              {p.role}
                            </span>
                            <span className="text-xs font-bold text-[var(--color-text-main)] truncate">
                              {p.name}
                            </span>
                          </div>
                          <span className="text-xs font-mono font-bold text-[var(--color-accent)] flex-shrink-0">
                            ₹{p.soldPrice ?? p.basePrice} {room.settings.purseUnit}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
