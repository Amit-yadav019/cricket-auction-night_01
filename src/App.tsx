/**
 * Cricket Auction Night - Mobile-first real-time multiplayer cricket auction.
 * @license Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { HomeView } from './components/HomeView';
import { HostSetupView } from './components/HostSetupView';
import { LobbyView } from './components/LobbyView';
import { AuctionView } from './components/AuctionView';
import { SquadsView } from './components/SquadsView';
import { LogView } from './components/LogView';
import { CompletedView } from './components/CompletedView';
import { FirebaseHelperModal } from './components/FirebaseHelperModal';
import { AuctionSummaryModal } from './components/AuctionSummaryModal';
import {
  RoomData,
  createAuctionRoom,
  subscribeToRoom,
  sendHostHeartbeat,
  generateRoomCode,
  generateHostToken,
  generateOwnerToken,
} from './services/auctionService';
import { AuctionSettings, Team, Player } from './game/auctionRules';
import { DEFAULT_100_PLAYERS, DEFAULT_TEAMS_LIST } from './game/defaultPlayers';
import { initAnonymousAuth, testConnection } from './firebase';

export default function App() {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomData | null>(null);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [hostToken, setHostToken] = useState<string>('');
  const [ownerToken, setOwnerToken] = useState<string>('');
  const [ownerName, setOwnerName] = useState<string>('');

  const [viewState, setViewState] = useState<'home' | 'setup' | 'room'>('home');
  const [auctionTab, setAuctionTab] = useState<'auction' | 'squads' | 'log'>('auction');

  const [loading, setLoading] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isFirebaseGuideOpen, setIsFirebaseGuideOpen] = useState<boolean>(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState<boolean>(false);

  // Initialize Auth & Tokens on mount
  useEffect(() => {
    // Check anonymous auth
    initAnonymousAuth().then(({ user, error }) => {
      if (error) setAuthError(error);
    });

    testConnection().catch((err) => console.warn('Conn test note:', err));

    // Stored owner name
    const storedOwnerName = localStorage.getItem('cricket_owner_name') || '';
    if (storedOwnerName) setOwnerName(storedOwnerName);

    // Parse URL params
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room')?.toUpperCase();
    const hostParam = params.get('host');
    const autostart = params.get('autostart');

    if (roomParam) {
      setRoomCode(roomParam);

      // Check host credentials
      const savedHostToken =
        hostParam || localStorage.getItem(`cricket_host_token_${roomParam}`) || '';
      if (savedHostToken) {
        setHostToken(savedHostToken);
        setIsHost(true);
        localStorage.setItem(`cricket_host_token_${roomParam}`, savedHostToken);
      }

      // Check owner token
      let savedOwnerToken = localStorage.getItem(`cricket_owner_token_${roomParam}`);
      if (!savedOwnerToken) {
        savedOwnerToken = generateOwnerToken();
        localStorage.setItem(`cricket_owner_token_${roomParam}`, savedOwnerToken);
      }
      setOwnerToken(savedOwnerToken);

      setViewState('room');
    } else if (autostart === '1') {
      // Autostart parameter for fast test verification
      handleQuickDemoRoom();
    }
  }, []);

  // Quick demo room generator for fast autostart
  const handleQuickDemoRoom = async () => {
    const demoCode = generateRoomCode();
    const demoHostToken = generateHostToken();
    const demoOwnerToken = generateOwnerToken();

    const settings: AuctionSettings = {
      pursePerTeam: 20,
      purseUnit: 'Cr',
      minSquadSize: 3,
      maxSquadSize: 5,
      squadSize: 5,
      bidStep: 0.5,
      shuffleOrder: false,
      selectedPlayerIds: DEFAULT_100_PLAYERS.slice(0, 16).map((p) => p.id),
      poolVisibility: 'public',
    };

    const teams: Team[] = DEFAULT_TEAMS_LIST.slice(0, 3).map((t, idx) => {
      const team: Team = {
        id: t.id,
        name: t.name,
        shortName: t.shortName,
        purse: 20,
        spent: 0,
        players: [],
      };
      if (idx === 0) {
        team.claimedByOwnerName = 'Captain Virat';
        team.ownerToken = demoOwnerToken;
      }
      return team;
    });

   await createAuctionRoom(
  demoCode,
  settings,
  teams,
  DEFAULT_100_PLAYERS.slice(0, 16),
  demoHostToken
);

    localStorage.setItem(`cricket_host_token_${demoCode}`, demoHostToken);
    localStorage.setItem(`cricket_owner_token_${demoCode}`, demoOwnerToken);
    setHostToken(demoHostToken);
    setOwnerToken(demoOwnerToken);
    setIsHost(true);
    setRoomCode(demoCode);
    setViewState('room');
  };

  // Subscribe to room doc via onSnapshot
  useEffect(() => {
    if (!roomCode) return;

    setLoading(true);
    const unsubscribe = subscribeToRoom(
      roomCode,
      (updatedRoom) => {
        setLoading(false);
        if (updatedRoom) {
          setRoom(updatedRoom);
          setConnectionError('');

          // Verify host authority
          const storedHostToken =
            hostToken || localStorage.getItem(`cricket_host_token_${roomCode}`);
          if (storedHostToken && updatedRoom.hostToken === storedHostToken) {
            setIsHost(true);
            setHostToken(storedHostToken);
          } else {
            setIsHost(false);
          }
        } else {
          setConnectionError(`Room "${roomCode}" not found. Please verify the room code.`);
        }
      },
      (err) => {
        setLoading(false);
        setConnectionError('Connection lost. Reconnecting...');
      }
    );

    return () => unsubscribe();
  }, [roomCode, hostToken]);

  // Host Heartbeat effect: ping every 6 seconds
  useEffect(() => {
    if (!isHost || !roomCode || !hostToken) return;

    const interval = setInterval(() => {
      sendHostHeartbeat(roomCode, hostToken);
    }, 6000);

    return () => clearInterval(interval);
  }, [isHost, roomCode, hostToken]);

  // Join existing room
  const handleJoinRoom = (code: string) => {
    const clean = code.trim().toUpperCase();
    let savedOwnerToken = localStorage.getItem(`cricket_owner_token_${clean}`);
    if (!savedOwnerToken) {
      savedOwnerToken = generateOwnerToken();
      localStorage.setItem(`cricket_owner_token_${clean}`, savedOwnerToken);
    }
    setOwnerToken(savedOwnerToken);

    const savedHostToken = localStorage.getItem(`cricket_host_token_${clean}`) || '';
    if (savedHostToken) {
      setHostToken(savedHostToken);
      setIsHost(true);
    } else {
      setIsHost(false);
      setHostToken('');
    }

    setRoomCode(clean);
    setViewState('room');

    // Update URL query without full reload
    const newUrl = `${window.location.pathname}?room=${clean}`;
    window.history.pushState({}, '', newUrl);
  };

  // Create new auction room from Host Setup View
  const handleCreateRoom = async (
    settings: AuctionSettings,
    teams: Team[],
    selectedPlayers: Player[]
  ) => {
    setLoading(true);
    try {
      const code = generateRoomCode();
      const token = generateHostToken();

      // Automatically assign owner token for host
      let myOwnerToken = localStorage.getItem(`cricket_owner_token_${code}`);
      if (!myOwnerToken) {
        myOwnerToken = generateOwnerToken();
        localStorage.setItem(`cricket_owner_token_${code}`, myOwnerToken);
      }
      setOwnerToken(myOwnerToken);
        await createAuctionRoom(code,settings,teams, selectedPlayers,hostToken);



      // Persist host token
      localStorage.setItem(`cricket_host_token_${code}`, token);
      setHostToken(token);
      setIsHost(true);
      setRoomCode(code);
      setViewState('room');

      // Update URL with host token in browser address bar (so refresh preserves host)
      const hostUrl = `${window.location.pathname}?room=${code}&host=${token}`;
      window.history.pushState({}, '', hostUrl);
    } catch (err: any) {
      alert('Failed to create room: ' + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateOwnerName = (name: string) => {
    setOwnerName(name);
    localStorage.setItem('cricket_owner_name', name);
  };

  const handleLeaveRoom = () => {
    setRoomCode(null);
    setRoom(null);
    setViewState('home');
    window.history.pushState({}, '', window.location.pathname);
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text-main)] flex flex-col antialiased">
      <Header
        room={room}
        isHost={isHost}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        onOpenSummary={room ? () => setIsSummaryOpen(true) : undefined}
      />

      <main className="flex-1 pb-10">
        {/* Loading overlay */}
        {loading && !room && (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <div className="w-10 h-10 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-bold font-display uppercase tracking-wider text-[var(--color-text-muted)]">
              Connecting to Pitch...
            </p>
          </div>
        )}

        {/* Connection or room error */}
        {connectionError && (
          <div className="max-w-[540px] mx-auto px-4 mt-6">
            <div className="p-4 bg-red-50 dark:bg-red-950/60 border border-red-300 dark:border-red-800 rounded-2xl text-center space-y-2">
              <p className="text-xs font-bold text-red-700 dark:text-red-300">{connectionError}</p>
              <button
                onClick={handleLeaveRoom}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-red-700 min-h-[40px]"
              >
                Return to Home
              </button>
            </div>
          </div>
        )}

        {/* 1. HOME VIEW */}
        {viewState === 'home' && !loading && (
          <HomeView
            onHostNew={() => setViewState('setup')}
            onJoinRoom={handleJoinRoom}
            onOpenFirebaseGuide={() => setIsFirebaseGuideOpen(true)}
            authError={authError}
          />
        )}

        {/* 2. HOST SETUP VIEW */}
        {viewState === 'setup' && (
          <HostSetupView
            onBack={() => setViewState('home')}
            onCreateRoom={handleCreateRoom}
            isCreating={loading}
          />
        )}

        {/* 3. ROOM VIEW */}
        {viewState === 'room' && room && !loading && (
          <>
            {room.status === 'lobby' ? (
              <LobbyView
                room={room}
                isHost={isHost}
                hostToken={hostToken}
                ownerToken={ownerToken}
                ownerName={ownerName}
                onUpdateOwnerName={handleUpdateOwnerName}
              />
            ) : room.status === 'completed' ? (
              <CompletedView
                room={room}
                isHost={isHost}
                hostToken={hostToken}
                onOpenSummary={() => setIsSummaryOpen(true)}
              />
            ) : (
              // Active Auction or Round Ended
              <>
                {auctionTab === 'auction' && (
                  <AuctionView
                    room={room}
                    isHost={isHost}
                    hostToken={hostToken}
                    ownerToken={ownerToken}
                    activeTab={auctionTab}
                    setActiveTab={setAuctionTab}
                    soundEnabled={soundEnabled}
                    onOpenSummary={() => setIsSummaryOpen(true)}
                  />
                )}

                {auctionTab === 'squads' && (
                  <div className="space-y-3">
                    {/* Navigation Tabs Bar */}
                    <div className="max-w-[540px] mx-auto px-4 pt-3">
                      <div className="grid grid-cols-4 gap-1 bg-[var(--color-surface-subtle)] p-1 rounded-xl border border-[var(--color-border)]">
                        <button
                          onClick={() => setAuctionTab('auction')}
                          className="py-2 rounded-lg text-xs font-display font-black uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] min-h-[38px] cursor-pointer"
                        >
                          Auction
                        </button>
                        <button
                          onClick={() => setAuctionTab('squads')}
                          className="py-2 rounded-lg text-xs font-display font-black uppercase tracking-wider bg-[var(--color-primary)] text-white min-h-[38px] cursor-pointer"
                        >
                          Squads
                        </button>
                        <button
                          onClick={() => setAuctionTab('log')}
                          className="py-2 rounded-lg text-xs font-display font-black uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] min-h-[38px] cursor-pointer"
                        >
                          Log
                        </button>
                        <button
                          onClick={() => setIsSummaryOpen(true)}
                          className="py-2 rounded-lg text-xs font-display font-black uppercase tracking-wider text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] border border-[var(--color-primary)]/40 min-h-[38px] cursor-pointer"
                        >
                          Summary
                        </button>
                      </div>
                    </div>
                    <SquadsView
                      room={room}
                      ownerToken={ownerToken}
                      ownerName={ownerName}
                      onUpdateOwnerName={handleUpdateOwnerName}
                    />
                  </div>
                )}

                {auctionTab === 'log' && (
                  <div className="space-y-3">
                    <div className="max-w-[540px] mx-auto px-4 pt-3">
                      <div className="grid grid-cols-4 gap-1 bg-[var(--color-surface-subtle)] p-1 rounded-xl border border-[var(--color-border)]">
                        <button
                          onClick={() => setAuctionTab('auction')}
                          className="py-2 rounded-lg text-xs font-display font-black uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] min-h-[38px] cursor-pointer"
                        >
                          Auction
                        </button>
                        <button
                          onClick={() => setAuctionTab('squads')}
                          className="py-2 rounded-lg text-xs font-display font-black uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] min-h-[38px] cursor-pointer"
                        >
                          Squads
                        </button>
                        <button
                          onClick={() => setAuctionTab('log')}
                          className="py-2 rounded-lg text-xs font-display font-black uppercase tracking-wider bg-[var(--color-primary)] text-white min-h-[38px] cursor-pointer"
                        >
                          Log
                        </button>
                        <button
                          onClick={() => setIsSummaryOpen(true)}
                          className="py-2 rounded-lg text-xs font-display font-black uppercase tracking-wider text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] border border-[var(--color-primary)]/40 min-h-[38px] cursor-pointer"
                        >
                          Summary
                        </button>
                      </div>
                    </div>
                    <LogView room={room} />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* Live Auction Financial & Roster Summary Modal */}
      {room && (
        <AuctionSummaryModal
          isOpen={isSummaryOpen}
          onClose={() => setIsSummaryOpen(false)}
          room={room}
        />
      )}

      {/* Firebase Setup & Free Hosting Guide Modal */}
      <FirebaseHelperModal
        isOpen={isFirebaseGuideOpen}
        onClose={() => setIsFirebaseGuideOpen(false)}
      />
    </div>
  );
}
