import React, { useState } from 'react';
import {
  Copy,
  Check,
  Share2,
  Users,
  Play,
  UserCheck,
} from 'lucide-react';
import { RoomData, claimTeam, releaseTeam, startAuction } from '../services/auctionService';
import { Team } from '../game/auctionRules';

interface LobbyViewProps {
  room: RoomData;
  isHost: boolean;
  hostToken: string;
  ownerToken: string;
  ownerName: string;
  onUpdateOwnerName: (name: string) => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  room,
  isHost,
  hostToken,
  ownerToken,
  ownerName,
  onUpdateOwnerName,
}) => {
  const [copied, setCopied] = useState(false);
  const [claimNameInput, setClaimNameInput] = useState(ownerName || '');
  const [claiming, setClaiming] = useState(false);
  const [actionError, setActionError] = useState('');
  const [starting, setStarting] = useState(false);

  const teamsList: Team[] = Array.isArray(room?.teams) ? room.teams : [];
  const allPlayersList = room?.allPlayers || room?.playerPool || [];

  const shareableUrl = `${window.location.origin}${window.location.pathname}?room=${room?.code || ''}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareableUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Cricket Auction Night',
          text: `Join the auction! Room code: ${room?.code || ''}`,
          url: shareableUrl,
        });
      } catch {
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  // Check if current user already claimed a team
  const myClaimedTeam = teamsList.find((t) => t && t.ownerToken === ownerToken);

  const handleClaimSubmit = async (teamId: string) => {
    if (myClaimedTeam) {
      setActionError('You already own a team. Release it first to claim another.');
      return;
    }

    const trimmedName = claimNameInput.trim();
    if (!trimmedName) {
      setActionError('Please enter your name first');
      return;
    }
    setActionError('');
    setClaiming(true);
    onUpdateOwnerName(trimmedName);

    const res = await claimTeam(room.code, teamId, trimmedName, ownerToken);
    setClaiming(false);
    if (!res.success) {
      setActionError(res.error || 'Failed to claim team');
    }
  };

  const handleRelease = async (teamId: string) => {
    const res = await releaseTeam(room.code, teamId, isHost ? hostToken : ownerToken);
    if (!res.success) {
      setActionError(res.error || 'Failed to release team');
    }
  };

  const handleStartBidding = async () => {
    if (!isHost) return;
    setStarting(true);
    setActionError('');
    const res = await startAuction(room.code, hostToken);
    setStarting(false);
    if (!res.success) {
      setActionError(res.error || 'Failed to start auction');
    }
  };

  const claimedCount = teamsList.filter((t) => t && !!t.claimedByOwnerName).length;

  return (
    <div className="w-full max-w-[540px] mx-auto px-4 py-5 space-y-5">
      {/* Room Code Card */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 text-center shadow-xs">
        <span className="text-xs font-mono font-bold text-[var(--color-text-dim)] uppercase tracking-wider">
          Room Code
        </span>
        <div className="my-2">
          <span className="text-4xl sm:text-5xl font-black font-mono tracking-widest text-[var(--color-primary)] scoreboard-num select-all">
            {room?.code}
          </span>
        </div>

        <p className="text-xs text-[var(--color-text-muted)] mb-4">
          Share this link with team owners. They can join from any phone!
        </p>

        <div className="flex items-center justify-center space-x-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex-1 max-w-[200px] min-h-[44px] px-4 py-2 bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl text-xs font-bold text-[var(--color-text-main)] flex items-center justify-center space-x-2 transition cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Link Copied!' : 'Copy Share Link'}</span>
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="min-h-[44px] px-4 py-2 bg-[var(--color-primary-light)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            <span>Share</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-xl text-xs font-bold text-red-700 dark:text-red-300 text-center">
          {actionError}
        </div>
      )}

      {/* My Team Status (if claimed) */}
      {myClaimedTeam && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-500 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black font-display text-lg">
              {myClaimedTeam.shortName}
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                You Are The Owner Of
              </div>
              <div className="text-base font-black font-display text-[var(--color-text-main)]">
                {myClaimedTeam.name}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100">
              Ready
            </span>
            <button
              type="button"
              onClick={() => handleRelease(myClaimedTeam.id)}
              className="px-2.5 py-1 text-xs font-bold text-red-600 hover:text-red-800 hover:underline cursor-pointer"
            >
              Release
            </button>
          </div>
        </div>
      )}

      {/* Name Input (only visible if user has NOT claimed a team yet) */}
      {!myClaimedTeam && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 shadow-xs">
          <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">
            Your Name / Nickname
          </label>
          <input
            type="text"
            placeholder="e.g. Captain Virat"
            value={claimNameInput}
            onChange={(e) => setClaimNameInput(e.target.value)}
            className="w-full min-h-[44px] bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm font-bold text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-primary)]"
          />
          <p className="text-[11px] text-[var(--color-text-dim)] mt-1">
            Type your name above, then tap an "Open" team below to claim it!
          </p>
        </div>
      )}

      {/* Teams Grid */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold font-display uppercase tracking-wider text-[var(--color-text-main)] flex items-center space-x-2">
            <Users className="w-5 h-5 text-[var(--color-primary)]" />
            <span>Teams ({claimedCount} / {teamsList.length} Claimed)</span>
          </h2>
          <span className="text-xs text-[var(--color-text-dim)] font-medium">
            Purse: ₹{room?.settings?.pursePerTeam || 20} {room?.settings?.purseUnit || 'Cr'}
          </span>
        </div>

        <div className="space-y-2">
          {teamsList.map((team, index) => {
            if (!team) return null;
            const teamId = team.id || `team_${index}`;
            const isMine = team.ownerToken === ownerToken;
            const isClaimed = Boolean(team.claimedByOwnerName);

            return (
              <div
                key={teamId}
                className={`p-3 rounded-xl border flex items-center justify-between transition ${
                  isMine
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                    : isClaimed
                    ? 'border-[var(--color-border)] bg-[var(--color-surface-subtle)]'
                    : 'border-dashed border-[var(--color-primary)]/50 bg-[var(--color-primary-light)]/20 hover:bg-[var(--color-primary-light)]/40'
                }`}
              >
                <div className="flex items-center space-x-3 truncate">
                  <div className="w-9 h-9 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border)] flex items-center justify-center font-display font-black text-xs text-[var(--color-primary)] flex-shrink-0">
                    {team.shortName || 'TM'}
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-bold text-[var(--color-text-main)] truncate">
                      {team.name || 'Team'}
                    </div>
                    <div className="text-[11px] text-[var(--color-text-muted)] flex items-center space-x-1">
                      {isClaimed ? (
                        <>
                          <UserCheck className="w-3 h-3 text-emerald-600 inline" />
                          <span className="font-semibold">{team.claimedByOwnerName}</span>
                          {isMine && <span className="text-emerald-600 font-bold">(You)</span>}
                        </>
                      ) : (
                        <span className="text-[var(--color-primary)] font-bold">Open (Available)</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 flex-shrink-0">
                  {/* Single team claim restriction: Button shows only if team is unclaimed AND user hasn't claimed any team yet */}
                  {!isClaimed && !myClaimedTeam && (
                    <button
                      type="button"
                      disabled={claiming}
                      onClick={() => handleClaimSubmit(teamId)}
                      className="px-3.5 py-1.5 rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] font-display text-xs font-bold uppercase tracking-wider min-h-[38px] transition cursor-pointer active:scale-95"
                    >
                      {claiming ? 'Claiming...' : 'Claim Team'}
                    </button>
                  )}

                  {isHost && isClaimed && (
                    <button
                      type="button"
                      onClick={() => handleRelease(teamId)}
                      title="Release team phone"
                      className="px-2.5 py-1.5 rounded-lg bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 hover:bg-red-200 text-xs font-semibold min-h-[36px] cursor-pointer"
                    >
                      Release
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {isHost && (
          <p className="text-[11px] text-[var(--color-text-dim)] pt-1 italic text-center">
            Note: Teams without an owner phone can be bid on directly by the Host using on-screen paddles!
          </p>
        )}
      </div>

      {/* Host Start Auction Button */}
      {isHost ? (
        <div className="sticky bottom-4 bg-[var(--color-surface)]/95 backdrop-blur-md border border-[var(--color-border)] p-3 rounded-2xl shadow-xl space-y-2">
          <button
            type="button"
            disabled={starting}
            onClick={handleStartBidding}
            className="w-full min-h-[50px] py-3 px-6 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-display text-xl font-bold uppercase tracking-wider shadow-md hover:shadow-lg transition active:scale-[0.99] flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>{starting ? 'Starting Auction...' : 'Start Bidding'}</span>
          </button>
          <div className="text-center text-[11px] text-[var(--color-text-dim)] font-medium">
            {allPlayersList.length} players loaded · Squad: {room?.settings?.minSquadSize || room?.settings?.squadSize || 15}-{room?.settings?.maxSquadSize || room?.settings?.squadSize || 25} players · {room?.settings?.poolVisibility === 'hidden' ? 'Secret Pool (Blind Lots)' : 'Open Pool'}
          </div>
        </div>
      ) : (
        <div className="text-center py-4 bg-[var(--color-surface-subtle)] rounded-xl border border-[var(--color-border)]">
          <p className="text-xs font-semibold text-[var(--color-text-muted)] animate-pulse">
            Waiting for the Host to start bidding...
          </p>
        </div>
      )}
    </div>
  );
};