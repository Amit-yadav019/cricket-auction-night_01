import React, { useState } from 'react';
import {
  Share2,
  Copy,
  Check,
  FileText,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { RoomData } from '../services/auctionService';
import { sound } from '../services/soundService';

interface HeaderProps {
  room: RoomData;
  isHost: boolean;
  onOpenSummary?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  room,
  isHost,
  onOpenSummary,
}) => {
  const [copied, setCopied] = useState(false);
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    if (typeof (sound as any).isMuted === 'function') {
      return (sound as any).isMuted();
    }
    return false;
  });

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard fallback
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Cricket Auction Night',
          text: `Join my cricket auction room with code ${room.code}!`,
          url,
        });
      } catch {
        // Share cancelled
      }
    } else {
      handleCopyCode();
    }
  };

  const toggleSound = () => {
    if (typeof (sound as any).toggleMute === 'function') {
      const nextMuted = (sound as any).toggleMute();
      setIsMuted(Boolean(nextMuted));
    } else if (typeof (sound as any).setEnabled === 'function') {
      (sound as any).setEnabled(isMuted);
      setIsMuted(!isMuted);
    } else {
      setIsMuted((prev) => !prev);
    }
  };

  // Safe numerical calculations to prevent "Lot NaN of ..."
  const pool = room.playerPool || room.allPlayers || [];
  const poolLength = pool.length;
  const rawIndex = Number(room.currentPlayerIndex);
  const safeCurrentIndex = Number.isNaN(rawIndex) ? 0 : rawIndex;

  const displayLotNumber =
    room.status === 'round_ended' || room.status === 'completed'
      ? poolLength
      : Math.min(safeCurrentIndex + 1, poolLength > 0 ? poolLength : 1);

  const totalSold = (room.teams || []).reduce(
    (sum, t) => sum + (t.players ? t.players.length : 0),
    0
  );

  return (
    <header className="sticky top-0 z-30 w-full bg-[var(--color-surface)]/90 backdrop-blur-md border-b border-[var(--color-border)] px-3.5 sm:px-6 py-3 transition-colors">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Logo and Room Progress Tracker */}
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-rose-500/15 flex items-center justify-center border border-rose-500/30">
            <div className="w-4 h-4 rounded-full bg-rose-500 shadow-sm" />
          </div>

          <div>
            <h1 className="text-sm sm:text-base font-black font-display uppercase tracking-wider text-[var(--color-text-main)] leading-none">
              Auction Night
            </h1>
            <p className="text-[11px] text-[var(--color-text-muted)] font-mono mt-0.5">
              {room.status === 'lobby' ? (
                'Waiting in Lobby'
              ) : (
                <>
                  Lot <span className="font-bold text-[var(--color-text-main)]">{displayLotNumber}</span> of{' '}
                  <span className="font-bold text-[var(--color-text-main)]">{poolLength}</span>
                  {' · '}
                  <span className="text-emerald-500 font-bold">{totalSold}</span> sold
                </>
              )}
            </p>
          </div>
        </div>

        {/* Global Action Controls */}
        <div className="flex items-center space-x-2">
          {/* Share Room Button */}
          <button
            type="button"
            onClick={handleShare}
            className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-xs font-bold font-display uppercase text-[var(--color-text-main)] transition cursor-pointer shadow-xs active:scale-95"
          >
            <Share2 className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            <span>Share</span>
          </button>

          {/* Copy Room Code Button */}
          <button
            type="button"
            onClick={handleCopyCode}
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-xs font-mono font-bold text-[var(--color-text-main)] transition cursor-pointer shadow-xs active:scale-95"
            title="Click to copy Room Code"
          >
            <span>{room.code}</span>
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            )}
          </button>

          {/* Summary Modal Toggle */}
          {onOpenSummary && (
            <button
              type="button"
              onClick={onOpenSummary}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-xs font-bold font-display uppercase text-[var(--color-text-main)] transition cursor-pointer shadow-xs active:scale-95"
            >
              <FileText className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span className="hidden md:inline">Summary</span>
            </button>
          )}

          {/* Sound FX Toggle */}
          <button
            type="button"
            onClick={toggleSound}
            className="p-2 rounded-xl bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-[var(--color-text-muted)] transition cursor-pointer shadow-xs active:scale-95"
            title={isMuted ? 'Unmute Sounds' : 'Mute Sounds'}
          >
            {!isMuted ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-[var(--color-text-dim)]" />
            )}
          </button>

          {/* Host Indicator Badge */}
          {isHost && (
            <span className="px-2.5 py-1 rounded-xl bg-amber-500 text-stone-950 font-display text-[10px] font-black uppercase tracking-wider shadow-xs">
              HOST
            </span>
          )}
        </div>
      </div>
    </header>
  );
};