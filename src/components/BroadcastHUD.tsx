import React, { useState, useEffect } from 'react';
import { Wallet, Users, Shield, ChevronRight, ChevronLeft, Flame, Gavel } from 'lucide-react';
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
    amount: number;
  } | null>(null);

  const teams = Array.isArray(room?.teams) ? room.teams : [];
  const minSquad = room?.settings?.minSquadSize || room?.settings?.squadSize || 11;
  const maxSquad = room?.settings?.maxSquadSize || 25;
  const purseUnit = room?.settings?.purseUnit || 'Cr';

  useEffect(() => {
    const res = room?.lastResult;
    if (!res || !res.timestamp) return;
    if (Date.now() - res.timestamp < 4000) {
      setStampOverlay({
        type: res.type,
        playerName: res.playerName,
        teamName: res.teamName,
        amount: res.amount,
      });
      sound.playGavelCrack();
      const timer = setTimeout(() => setStampOverlay(null), 3200);
      return () => clearTimeout(timer);
    }
  }, [room?.lastResult?.timestamp]);

  useEffect(() => {
    if (room?.status === 'active') {
      sound.startCrowdAmbience();
    } else {
      sound.stopCrowdAmbience();
    }
    return () => sound.stopCrowdAmbience();
  }, [room?.status]);

  const allSold: { name: string; team: string; price: number }[] = [];
  teams.forEach((t) => {
    (t.players || []).forEach((p) => {
      allSold.push({ name: p.name, team: t.shortName || t.name, price: p.soldPrice || p.basePrice });
    });
  });
  const highestBuy = [...allSold].sort((a, b) => b.price - a.price)[0];

  if (!room || room.status === 'lobby') return null;

  return (
    <>
      {/* 1. 3D GAVEL & GLOWING STAMP OVERLAY */}
      {stampOverlay && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
          <div className="relative flex flex-col items-center p-8 rounded-3xl bg-stone-950/95 border-2 border-amber-500/50 shadow-2xl animate-bounce">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-3 rotate-[-25deg]">
              <Gavel className="w-9 h-9" />
            </div>

            <div
              className={`px-8 py-2.5 rounded-2xl border-4 font-display font-black text-4xl sm:text-5xl tracking-widest uppercase transform -rotate-6 shadow-2xl ${
                stampOverlay.type === 'SOLD'
                  ? 'border-emerald-400 text-emerald-400 bg-emerald-950/80 shadow-emerald-500/40'
                  : 'border-rose-500 text-rose-500 bg-rose-950/80 shadow-rose-500/40'
              }`}
            >
              {stampOverlay.type}
            </div>

            <h3 className="text-xl font-black font-display uppercase text-white mt-4">
              {stampOverlay.playerName}
            </h3>
            {stampOverlay.type === 'SOLD' && (
              <p className="text-sm font-bold text-amber-400 mt-1">
                To {stampOverlay.teamName} for ₹{stampOverlay.amount} {purseUnit}
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
                          Squad: <strong className="text-[var(--color-text-main)]">{count}/{minSquad}</strong> (Max {maxSquad})
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

      {/* 3. LIVE BROADCAST TICKER TAPE (BOTTOM FOOTER) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-stone-950/95 border-t border-amber-500/30 text-white py-1.5 px-3 overflow-hidden flex items-center space-x-3 text-[11px] font-mono shadow-2xl">
        <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-display font-black text-[9px] uppercase tracking-widest shrink-0 flex items-center space-x-1 animate-pulse">
          <Flame className="w-3 h-3" />
          <span>LIVE FEED</span>
        </span>

        <div className="flex-1 overflow-x-auto whitespace-nowrap scrollbar-none flex items-center space-x-6 text-stone-300">
          {highestBuy && (
            <span>
              🔥 HIGHEST BUY: <strong className="text-amber-400">{highestBuy.name}</strong> ({highestBuy.team} · ₹{highestBuy.price} {purseUnit})
            </span>
          )}
          {teams.map((t) => (
            <span key={t.id}>
              • <strong className="text-white">{t.shortName || t.name}</strong>: ₹{t.purse} {purseUnit} left ({Math.max(0, minSquad - (t.players?.length || 0))} slots needed)
            </span>
          ))}
          {allSold.slice(-3).reverse().map((s, idx) => (
            <span key={idx}>
              • ✅ <strong className="text-emerald-400">{s.name}</strong> sold to {s.team} for ₹{s.price} {purseUnit}
            </span>
          ))}
        </div>
      </div>
    </>
  );
};