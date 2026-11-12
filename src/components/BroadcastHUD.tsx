import React, { useState, useEffect } from 'react';
import { Wallet, Users, Shield, ChevronRight, ChevronLeft, Flame, Gavel, Trophy, Sparkles } from 'lucide-react';
import { RoomData } from '../services/auctionService';
import { calculateMaxBid } from '../game/auctionRules';
import { sound } from '../services/soundService';

interface BroadcastHUDProps {
  room: RoomData | null;
}

export const BroadcastHUD: React.FC<BroadcastHUDProps> = ({ room }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stampOverlay, setStampOverlay] = useState<{
    type: 'SOLD' | 'UNSOLD';
    playerName: string;
    teamName: string;
    teamShort: string;
    amount: number;
  } | null>(null);

  const teams = Array.isArray(room?.teams) ? room.teams : [];
  const minSquad = room?.settings?.minSquadSize || room?.settings?.squadSize || 11;
  const maxSquad = room?.settings?.maxSquadSize || 25;
  const purseUnit = room?.settings?.purseUnit || 'Cr';

  // Trigger 3D Swinging Gavel + Glowing Stamp + Franchise Badge on SOLD/UNSOLD
  useEffect(() => {
    const res = room?.lastResult;
    if (!res || !res.timestamp) return;
    if (Date.now() - res.timestamp < 4000) {
      const matchedTeam = teams.find(
        (t) => t.name === res.teamName || t.shortName === res.teamName
      );
      setStampOverlay({
        type: res.type,
        playerName: res.playerName,
        teamName: res.teamName,
        teamShort: matchedTeam?.shortName || res.teamName?.slice(0, 3).toUpperCase() || 'IPL',
        amount: res.amount,
      });
      sound.playGavelCrack();
      const timer = setTimeout(() => setStampOverlay(null), 3200);
      return () => clearTimeout(timer);
    }
  }, [room?.lastResult?.timestamp]);

  // Manage subtle stadium crowd murmur during active bidding
  useEffect(() => {
    if (room?.status === 'active') {
      sound.startCrowdAmbience();
    } else {
      sound.stopCrowdAmbience();
    }
    return () => sound.stopCrowdAmbience();
  }, [room?.status]);

  // Countdown tick if room timer is in final 5 seconds
  useEffect(() => {
    const expiresAt = (room as any)?.timerExpiresAt;
    if (!expiresAt || room?.status !== 'active') return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
      if (remaining > 0 && remaining <= 5) {
        sound.playCountdownTick();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [(room as any)?.timerExpiresAt, room?.status]);

  const allSold: { name: string; team: string; price: number }[] = [];
  teams.forEach((t) => {
    (t.players || []).forEach((p) => {
      allSold.push({
        name: p.name,
        team: t.shortName || t.name,
        price: p.soldPrice || p.basePrice,
      });
    });
  });
  const highestBuy = [...allSold].sort((a, b) => b.price - a.price)[0];

  if (!room || room.status === 'lobby') return null;

  return (
    <>
      {/* Custom Broadcast Motion Keyframes */}
      <style>{`
        @keyframes gavelSlam {
          0% { transform: rotate(-55deg) scale(1.4); opacity: 0; }
          55% { transform: rotate(12deg) scale(0.95); opacity: 1; }
          75% { transform: rotate(-6deg) scale(1.03); }
          100% { transform: rotate(0deg) scale(1); opacity: 1; }
        }
        @keyframes stampImpact {
          0% { transform: scale(2.4) rotate(-18deg); opacity: 0; }
          60% { transform: scale(0.92) rotate(-5deg); opacity: 1; }
          80% { transform: scale(1.04) rotate(-7deg); }
          100% { transform: scale(1) rotate(-6deg); opacity: 1; }
        }
        @keyframes tickerScroll {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
        .animate-gavel-slam {
          animation: gavelSlam 0.48s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .animate-stamp-impact {
          animation: stampImpact 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .animate-ticker-marquee {
          display: inline-flex;
          animation: tickerScroll 28s linear infinite;
        }
        .animate-ticker-marquee:hover {
          animation-play-state: paused;
        }
      `}</style>

      {/* 1. 3D SWINGING GAVEL & GLOWING SOLD/UNSOLD STAMP WITH FRANCHISE BADGE */}
      {stampOverlay && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center bg-black/60 backdrop-blur-xs">
          <div className="relative flex flex-col items-center p-8 sm:p-10 rounded-3xl bg-gradient-to-b from-stone-900 via-stone-950 to-black border-2 border-amber-500/60 shadow-[0_0_60px_rgba(245,158,11,0.35)] max-w-sm w-full mx-4 text-center overflow-hidden">
            {/* Radial Broadcast Spotlight */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  stampOverlay.type === 'SOLD'
                    ? 'radial-gradient(circle at 50% 35%, rgba(16, 185, 129, 0.25), transparent 70%)'
                    : 'radial-gradient(circle at 50% 35%, rgba(244, 63, 94, 0.25), transparent 70%)',
              }}
            />

            {/* Swinging 3D Gavel Icon */}
            <div className="animate-gavel-slam relative w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-600/30 to-yellow-400/20 border border-amber-400/50 text-amber-400 flex items-center justify-center mb-4 shadow-xl">
              <Gavel className="w-11 h-11 drop-shadow-[0_4px_12px_rgba(251,191,36,0.6)]" />
            </div>

            {/* Slamming Glowing Stamp */}
            <div
              className={`animate-stamp-impact px-9 py-2.5 rounded-2xl border-4 font-display font-black text-4xl sm:text-5xl tracking-widest uppercase shadow-2xl ${
                stampOverlay.type === 'SOLD'
                  ? 'border-emerald-400 text-emerald-400 bg-emerald-950/90 shadow-[0_0_35px_rgba(52,211,153,0.55)]'
                  : 'border-rose-500 text-rose-500 bg-rose-950/90 shadow-[0_0_35px_rgba(244,63,94,0.55)]'
              }`}
            >
              {stampOverlay.type}
            </div>

            {/* Player Name */}
            <h3 className="text-2xl font-black font-display uppercase tracking-wide text-white mt-5">
              {stampOverlay.playerName}
            </h3>

            {/* Franchise Crest Badge & Hammer Price */}
            {stampOverlay.type === 'SOLD' ? (
              <div className="mt-3 flex flex-col items-center space-y-1.5">
                <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/50">
                  <span className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 font-display font-black text-[10px] flex items-center justify-center">
                    {stampOverlay.teamShort}
                  </span>
                  <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                    {stampOverlay.teamName}
                  </span>
                </div>
                <p className="text-lg font-mono font-black text-emerald-400">
                  ₹{stampOverlay.amount} {purseUnit}
                </p>
              </div>
            ) : (
              <p className="text-xs font-bold uppercase tracking-widest text-rose-400 mt-2">
                Returned to Unsold Pool
              </p>
            )}
          </div>
        </div>
      )}

      {/* 2. LIVE FRANCHISE PURSE LEADERBOARD DRAWER */}
      <div className="fixed top-20 right-0 z-40 flex items-start">
        <button
          type="button"
          onClick={() => setDrawerOpen(!drawerOpen)}
          className="bg-[var(--color-surface-elevated)] border border-r-0 border-[var(--color-border)] px-2.5 py-3 rounded-l-2xl shadow-xl flex flex-col items-center space-y-1 text-[10px] font-black font-display uppercase text-[var(--color-primary)] cursor-pointer hover:bg-[var(--color-surface-subtle)] transition"
          title="Live Franchise Purses & Max Bid Allowance"
        >
          {drawerOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          <Wallet className="w-4 h-4 text-amber-500" />
          <span className="[writing-mode:vertical-rl] tracking-widest">PURSES</span>
        </button>

        {drawerOpen && (
          <div className="w-72 sm:w-80 max-h-[75vh] overflow-y-auto bg-[var(--color-surface)]/95 backdrop-blur-xl border border-[var(--color-border)] rounded-bl-3xl shadow-2xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
              <span className="text-xs font-black font-display uppercase tracking-wider text-[var(--color-text-main)] flex items-center space-x-1.5">
                <Shield className="w-4 h-4 text-amber-500" />
                <span>Franchise Purse & Max Bid</span>
              </span>
            </div>

            <div className="space-y-2.5">
              {teams.map((t) => {
                const count = t.players?.length || 0;
                const maxAllowed = calculateMaxBid(t, maxSquad, 0.2);
                const needed = Math.max(0, minSquad - count);
                return (
                  <div
                    key={t.id}
                    className="p-2.5 rounded-2xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)] space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black font-display uppercase text-[var(--color-text-main)] truncate">
                        {t.name}
                      </span>
                      <span className="font-mono font-black text-emerald-500">
                        ₹{t.purse} {purseUnit}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-[var(--color-text-muted)]">
                      <span className="flex items-center space-x-1">
                        <Users className="w-3 h-3" />
                        <span>
                          Squad: <strong className="text-[var(--color-text-main)]">{count}/{minSquad}</strong>{' '}
                          {needed > 0 ? `(${needed} needed)` : '✓'}
                        </span>
                      </span>
                      <span>
                        Max Bid: <strong className="text-amber-500 font-mono">₹{maxAllowed}</strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 3. CONTINUOUS BROADCAST MARQUEE TICKER TAPE (BOTTOM FOOTER) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-stone-950/95 border-t border-amber-500/40 text-white py-1.5 px-3 overflow-hidden flex items-center space-x-3 text-[11px] font-mono shadow-2xl">
        <span className="px-2.5 py-0.5 rounded bg-gradient-to-r from-rose-600 to-amber-600 text-white font-display font-black text-[9px] uppercase tracking-widest shrink-0 flex items-center space-x-1 shadow-sm">
          <Flame className="w-3 h-3 animate-pulse" />
          <span>LIVE BROADCAST</span>
        </span>

        <div className="flex-1 overflow-hidden relative">
          <div className="animate-ticker-marquee whitespace-nowrap space-x-8 text-stone-200">
            {[0, 1].map((loopIdx) => (
              <span key={loopIdx} className="inline-flex items-center space-x-8">
                {highestBuy && (
                  <span className="inline-flex items-center space-x-1">
                    <Trophy className="w-3 h-3 text-amber-400 inline" />
                    <span>
                      HIGHEST BUY: <strong className="text-amber-400">{highestBuy.name}</strong> ({highestBuy.team} · ₹{highestBuy.price} {purseUnit})
                    </span>
                  </span>
                )}
                {teams.map((t) => (
                  <span key={`${loopIdx}-${t.id}`}>
                    • <strong className="text-white">{t.shortName || t.name}</strong> remaining purse:{' '}
                    <strong className="text-emerald-400">₹{t.purse} {purseUnit}</strong> ({Math.max(0, minSquad - (t.players?.length || 0))} slots needed)
                  </span>
                ))}
                {allSold.slice(-4).reverse().map((s, idx) => (
                  <span key={`${loopIdx}-sold-${idx}`} className="inline-flex items-center space-x-1">
                    <Sparkles className="w-3 h-3 text-emerald-400 inline" />
                    <span>
                      <strong className="text-emerald-400">{s.name}</strong> sold to <strong>{s.team}</strong> for ₹{s.price} {purseUnit}
                    </span>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};