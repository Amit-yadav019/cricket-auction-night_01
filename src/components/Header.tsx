import React, { useState } from 'react';
import { Copy, Check, Share2, Volume2, VolumeX, BarChart3 } from 'lucide-react';
import { RoomData } from '../services/auctionService';

interface HeaderProps {
  room: RoomData | null;
  isHost: boolean;
  onToggleSound?: () => void;
  soundEnabled?: boolean;
  onOpenSummary?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  room,
  isHost,
  onToggleSound,
  soundEnabled = true,
  onOpenSummary,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    if (!room) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${room.code}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!room) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${room.code}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Cricket Auction Night',
          text: `Join our cricket player auction! Room code: ${room.code}`,
          url,
        });
      } catch (err) {
        // User cancelled or share failed, fallback to copy
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  const getProgressText = () => {
    if (!room) return 'Cricket Auction Night';
    if (room.status === 'lobby') return `Lobby · Code: ${room.code}`;
    if (room.status === 'completed') return 'Auction Concluded';

    const soldCount = room.allPlayers.filter((p) => p.status === 'sold').length;
    const currentLotNum = (room.currentLot?.playerIndex ?? room.activePlayerIndex) + 1;
    const totalLots = room.allPlayers.length;
    const roundPrefix = room.round > 1 ? `Round ${room.round} · ` : '';

    return `${roundPrefix}Lot ${currentLotNum} of ${totalLots} · ${soldCount} sold`;
  };

  return (
    <header className="sticky top-0 z-30 w-full bg-[var(--color-primary)] text-[var(--color-primary-text)] shadow-md border-b border-black/10">
      <div className="max-w-[640px] mx-auto px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {/* Cricket Ball Icon */}
          <div className="w-7 h-7 rounded-full bg-[var(--color-accent)] flex items-center justify-center shadow-inner relative overflow-hidden flex-shrink-0">
            <div className="w-full h-[2px] bg-white/70 absolute transform rotate-45"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-white/90"></div>
          </div>
          <div>
            <h1 className="text-lg font-extrabold leading-tight tracking-wider font-display m-0">
              Auction Night
            </h1>
            <p className="text-xs text-white/80 font-medium tracking-wide">
              {getProgressText()}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {room && (
            <>
              <button
                onClick={handleShare}
                aria-label="Share room link"
                title="Share link"
                className="p-2 rounded-lg bg-black/20 hover:bg-black/30 transition text-white text-xs flex items-center space-x-1 font-semibold min-h-[38px]"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Share2 className="w-4 h-4" />}
                <span className="hidden sm:inline">{copied ? 'Copied' : 'Share'}</span>
              </button>

              <button
                onClick={handleCopyLink}
                aria-label="Copy room code"
                title="Copy room code"
                className="px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 transition text-white font-mono font-bold text-xs flex items-center space-x-1 min-h-[38px]"
              >
                <span>{room.code}</span>
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5 text-white/70" />}
              </button>
            </>
          )}

          {room && onOpenSummary && (
            <button
              onClick={onOpenSummary}
              aria-label="Open auction summary and dashboard"
              title="Auction Summary & Stats"
              className="px-2.5 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 transition text-white text-xs flex items-center space-x-1 font-semibold min-h-[38px] cursor-pointer"
            >
              <BarChart3 className="w-4 h-4 text-amber-300" />
              <span className="hidden sm:inline">Summary</span>
            </button>
          )}

          {onToggleSound && (
            <button
              onClick={onToggleSound}
              aria-label={soundEnabled ? 'Mute sound' : 'Unmute sound'}
              className="p-2 rounded-lg bg-black/20 hover:bg-black/30 text-white min-h-[38px]"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-white/60" />}
            </button>
          )}

          {isHost && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-400 text-amber-950 shadow-xs">
              Host
            </span>
          )}
        </div>
      </div>
    </header>
  );
};
