import React, { useState } from 'react';
import { Shield, Users, Trophy, Play, ArrowRight, Gavel, HelpCircle } from 'lucide-react';

interface HomeViewProps {
  onHostNew: () => void;
  onJoinRoom: (code: string) => void;
  onOpenFirebaseGuide: () => void;
  authError?: string;
}

export const HomeView: React.FC<HomeViewProps> = ({
  onHostNew,
  onJoinRoom,
  onOpenFirebaseGuide,
  authError,
}) => {
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = joinCode.trim().toUpperCase();
    if (cleanCode.length !== 5) {
      setError('Please enter a 5-character room code.');
      return;
    }
    setError('');
    onJoinRoom(cleanCode);
  };

  return (
    <div className="w-full max-w-[540px] mx-auto px-4 py-6 space-y-6">
      {/* Hero Card */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 text-center shadow-sm relative overflow-hidden">
        {/* Subtle decorative stadium pitch lines */}
        <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full border-8 border-[var(--color-primary)]/10 pointer-events-none"></div>

        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--color-primary-light)] text-[var(--color-primary)] mb-3 shadow-inner">
          <Gavel className="w-8 h-8 transform -rotate-12" />
        </div>

        <h1 className="text-3xl font-black font-display tracking-wide uppercase text-[var(--color-text-main)]">
          Cricket Auction Night
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1.5 max-w-sm mx-auto">
          The ultimate live multiplayer cricket player auction. Host on one screen, bid live from your phone with no account!
        </p>

        {authError && (
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xl text-left text-xs text-amber-800 dark:text-amber-200 flex items-start space-x-2">
            <HelpCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
            <div className="flex-1">
              <span className="font-semibold">Notice:</span> {authError}
              <button
                onClick={onOpenFirebaseGuide}
                className="ml-2 underline font-bold hover:text-amber-950 dark:hover:text-amber-100"
              >
                Setup Guide
              </button>
            </div>
          </div>
        )}

        {/* Primary CTA: Host */}
        <div className="mt-6">
          <button
            onClick={onHostNew}
            className="w-full min-h-[48px] py-3.5 px-6 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-display text-xl font-bold uppercase tracking-wider shadow-md hover:shadow-lg transition active:scale-[0.99] flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>Host a New Auction</span>
          </button>
        </div>
      </div>

      {/* Join Room Form */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-bold font-display uppercase tracking-wider text-[var(--color-text-main)] mb-1 flex items-center space-x-2">
          <Users className="w-5 h-5 text-[var(--color-primary)]" />
          <span>Join an Existing Room</span>
        </h2>
        <p className="text-xs text-[var(--color-text-muted)] mb-4">
          Enter the 5-character code shared by your host to join as a team owner.
        </p>

        <form onSubmit={handleJoinSubmit} className="space-y-3">
          <div>
            <label htmlFor="join-code" className="sr-only">Room Code</label>
            <div className="relative">
              <input
                id="join-code"
                type="text"
                maxLength={5}
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value.toUpperCase());
                  setError('');
                }}
                placeholder="ROOM CODE (e.g. K8M3X)"
                className="w-full min-h-[48px] text-center font-mono font-black text-2xl uppercase tracking-widest bg-[var(--color-surface-subtle)] border-2 border-[var(--color-border)] focus:border-[var(--color-primary)] rounded-xl px-4 py-2 text-[var(--color-text-main)] focus:outline-none transition"
              />
            </div>
            {error && <p className="text-xs text-[var(--color-accent)] font-semibold mt-1 text-center">{error}</p>}
          </div>

          <button
            type="submit"
            className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] font-display text-lg font-bold uppercase tracking-wider transition flex items-center justify-center space-x-2 cursor-pointer"
          >
            <span>Enter Room</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </form>
      </div>

      {/* Feature Highlights */}
      <div className="grid grid-cols-3 gap-2.5 text-center">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3">
          <Shield className="w-5 h-5 text-[var(--color-primary)] mx-auto mb-1" />
          <div className="text-xs font-bold font-display uppercase text-[var(--color-text-main)]">Atomic Bids</div>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Firestore transactions prevent race conditions</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3">
          <Users className="w-5 h-5 text-[var(--color-primary)] mx-auto mb-1" />
          <div className="text-xs font-bold font-display uppercase text-[var(--color-text-main)]">No Logins</div>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Anonymous joining on mobile phones</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3">
          <Trophy className="w-5 h-5 text-[var(--color-primary)] mx-auto mb-1" />
          <div className="text-xs font-bold font-display uppercase text-[var(--color-text-main)]">100 Legends</div>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Kohli, Dhoni, Rohit, Bumrah & more</p>
        </div>
      </div>

      {/* Footer Info & Download Project ZIP */}
      <div className="flex flex-col items-center justify-center space-y-2 pt-2 pb-4">
        <a
          href="/cricket-auction-night.zip"
          download="cricket-auction-night.zip"
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] transition flex items-center space-x-1.5 shadow-xs"
          title="Download complete project source code as a ZIP archive"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Download Project Code (.ZIP)</span>
        </a>

        <button
          onClick={onOpenFirebaseGuide}
          className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-primary)] transition underline flex items-center justify-center space-x-1"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>How to deploy & host for free (Firebase / Vercel)</span>
        </button>
      </div>
    </div>
  );
};
