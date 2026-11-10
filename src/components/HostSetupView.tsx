import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Shuffle,
  CheckSquare,
  Square,
  Sparkles,
  Users,
  Coins,
  Search,
  UserPlus,
  Eye,
  EyeOff,
  SlidersHorizontal,
} from 'lucide-react';
import {
  Player,
  PlayerRole,
  BasePrice,
  ALLOWED_BASE_PRICES,
  AuctionSettings,
  Team,
  parseCustomPlayers,
  pickRandomBalanced,
} from '../game/auctionRules';
import { DEFAULT_100_PLAYERS, DEFAULT_TEAMS_LIST } from '../game/defaultPlayers';

interface HostSetupViewProps {
  onBack: () => void;
  onCreateRoom: (
    settings: AuctionSettings,
    teams: Team[],
    selectedPlayers: Player[]
  ) => Promise<void>;
  isCreating: boolean;
}

export const HostSetupView: React.FC<HostSetupViewProps> = ({
  onBack,
  onCreateRoom,
  isCreating,
}) => {
  // Settings state
  const [pursePerTeam, setPursePerTeam] = useState<number>(20);
  const [purseUnit, setPurseUnit] = useState<'Cr' | 'L'>('Cr');

  // Squad Range: Min Squad and Max Squad (e.g. Min 3, Max 5)
  const [minSquadSize, setMinSquadSize] = useState<number>(3);
  const [maxSquadSize, setMaxSquadSize] = useState<number>(5);

  const [bidStep, setBidStep] = useState<number>(0.5);
  const [shuffleOrder, setShuffleOrder] = useState<boolean>(true);

  // Player Pool Visibility to Owners (Public vs Hidden/Secret)
  const [poolVisibility, setPoolVisibility] = useState<'public' | 'hidden'>('public');

  // Minimum players per pool when picking random (default 2)
  const [minPerPool, setMinPerPool] = useState<number>(2);

  // Teams state (2 to 10)
  const [teams, setTeams] = useState<{ id: string; name: string; shortName: string }[]>(
    DEFAULT_TEAMS_LIST.slice(0, 4) // Default 4 teams
  );
  const [newTeamName, setNewTeamName] = useState('');

  // Players state
  const [playerPool, setPlayerPool] = useState<Player[]>(() =>
    DEFAULT_100_PLAYERS.map((p) => ({ ...p }))
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    new Set(DEFAULT_100_PLAYERS.map((p) => p.id))
  );

  // Filter & search
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | PlayerRole>('ALL');

  // Custom players box
  const [showCustomBox, setShowCustomBox] = useState(false);
  const [customInputText, setCustomInputText] = useState('');
  const [customMsg, setCustomMsg] = useState('');

  // Random pick N (defaults to teams * maxSquadSize)
  const [randomCount, setRandomCount] = useState<number>(() => teams.length * 5);

  // Team management
  const handleAddTeam = () => {
    const trimmed = newTeamName.trim();
    if (!trimmed) return;
    if (teams.length >= 10) return;

    const short =
      trimmed
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .substring(0, 4) || trimmed.substring(0, 3).toUpperCase();

    const id = `team_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setTeams([...teams, { id, name: trimmed, shortName: short }]);
    setNewTeamName('');
  };

  const handleRemoveTeam = (id: string) => {
    if (teams.length <= 2) return;
    setTeams(teams.filter((t) => t.id !== id));
  };

  const handleShuffleTeams = () => {
    setTeams([...teams].sort(() => Math.random() - 0.5));
  };

  // Player pool actions
  const handleTogglePlayer = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(playerPool.map((p) => p.id)));
  };

  const handleClearAll = () => {
    setSelectedIds(new Set());
  };

  const handlePickRandom = () => {
    const requiredMin = teams.length * minSquadSize;
    const targetCount = Math.max(requiredMin, randomCount);
    // Guarantees at least minPerPool (e.g. 2) in each role pool (BAT, WK, AR, BOWL)
    const chosen = pickRandomBalanced(playerPool, targetCount, minPerPool);
    setSelectedIds(new Set(chosen));
  };

  const handleBasePriceChange = (playerId: string, newBase: BasePrice) => {
    setPlayerPool((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, basePrice: newBase } : p))
    );
  };

  const handleAddCustomPlayers = () => {
    if (!customInputText.trim()) return;
    const parsed = parseCustomPlayers(customInputText);
    if (parsed.length === 0) {
      setCustomMsg(
        'No valid players parsed. Format: Name, ROLE (BAT/WK/AR/BOWL), base (0.5/1/1.5/2)'
      );
      return;
    }

    setPlayerPool((prev) => [...parsed, ...prev]);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      parsed.forEach((p) => next.add(p.id));
      return next;
    });
    setCustomMsg(`Added and selected ${parsed.length} player(s)!`);
    setCustomInputText('');
    setTimeout(() => setCustomMsg(''), 4000);
  };

  // Live Counts
  const selectedPlayersList = useMemo(() => {
    return playerPool.filter((p) => selectedIds.has(p.id));
  }, [playerPool, selectedIds]);

  const countsByRole = useMemo(() => {
    const counts = { BAT: 0, WK: 0, AR: 0, BOWL: 0 };
    for (const p of selectedPlayersList) {
      if (counts[p.role] !== undefined) {
        counts[p.role]++;
      }
    }
    return counts;
  }, [selectedPlayersList]);

  // Minimum required players based on minSquadSize
  const minRequiredPlayers = teams.length * minSquadSize;
  const recommendedPlayers = teams.length * maxSquadSize;
  const isPlayerCountSufficient = selectedPlayersList.length >= minRequiredPlayers;

  // Filtered player pool for display
  const displayedPlayers = useMemo(() => {
    return playerPool.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === 'ALL' || p.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [playerPool, searchQuery, roleFilter]);

  const handleStartCreation = async () => {
    if (!isPlayerCountSufficient) return;

    let finalPlayers = [...selectedPlayersList];
    if (shuffleOrder) {
      finalPlayers = finalPlayers.sort(() => Math.random() - 0.5);
    }

    const settings: AuctionSettings = {
      pursePerTeam,
      purseUnit,
      minSquadSize,
      maxSquadSize,
      squadSize: maxSquadSize, // backward compatibility
      bidStep,
      shuffleOrder,
      selectedPlayerIds: finalPlayers.map((p) => p.id),
      poolVisibility,
    };

    const initialTeams: Team[] = teams.map((t) => ({
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      purse: pursePerTeam,
      spent: 0,
      players: [],
    }));

    await onCreateRoom(settings, initialTeams, finalPlayers);
  };

  const getRoleBadgeColor = (role: PlayerRole) => {
    switch (role) {
      case 'BAT':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 border-blue-300 dark:border-blue-700';
      case 'WK':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 border-amber-300 dark:border-amber-700';
      case 'AR':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700';
      case 'BOWL':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200 border-purple-300 dark:border-purple-700';
    }
  };

  return (
    <div className="w-full max-w-[640px] mx-auto px-4 py-5 space-y-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-1.5 text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] min-h-[44px] px-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <span className="text-xs font-bold font-mono tracking-wider text-[var(--color-text-dim)] uppercase">
          Step 1: Auction Setup
        </span>
      </div>

      <div className="text-center">
        <h1 className="text-2xl font-black font-display uppercase tracking-wider text-[var(--color-text-main)]">
          Configure Auction
        </h1>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          Set purses, team squad ranges, pool visibility, and player rules.
        </p>
      </div>

      {/* 1. Purse & Squad Range Rules */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <h2 className="text-base font-bold font-display uppercase tracking-wider text-[var(--color-text-main)] flex items-center space-x-2">
          <Coins className="w-5 h-5 text-[var(--color-primary)]" />
          <span>Purse & Squad Range</span>
        </h2>

        {/* Purse Per Team */}
        <div>
          <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">
            Purse Per Team
          </label>
          <div className="flex items-center space-x-1.5">
            <span className="font-bold text-sm text-[var(--color-text-muted)]">₹</span>
            <input
              type="number"
              min={5}
              max={200}
              value={pursePerTeam}
              onChange={(e) => setPursePerTeam(Math.max(1, Number(e.target.value)))}
              className="w-full min-h-[44px] bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-lg px-3 py-1 font-bold text-lg text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-primary)]"
            />
            <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden flex-shrink-0">
              <button
                type="button"
                onClick={() => setPurseUnit('Cr')}
                className={`px-3 py-2 text-xs font-bold ${
                  purseUnit === 'Cr'
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]'
                }`}
              >
                Cr
              </button>
              <button
                type="button"
                onClick={() => setPurseUnit('L')}
                className={`px-3 py-2 text-xs font-bold ${
                  purseUnit === 'L'
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]'
                }`}
              >
                L
              </button>
            </div>
          </div>
        </div>

        {/* Squad Range: Min Squad to Max Squad */}
        <div className="p-3.5 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-main)] flex items-center space-x-1.5">
              <SlidersHorizontal className="w-4 h-4 text-[var(--color-primary)]" />
              <span>Squad Size Range (Min — Max)</span>
            </span>
            <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-[var(--color-surface)] text-[var(--color-primary)] border border-[var(--color-border)]">
              {minSquadSize} to {maxSquadSize} Players
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            {/* Min Squad */}
            <div>
              <span className="block text-[11px] font-semibold text-[var(--color-text-muted)] mb-1">
                Minimum Squad Requirement
              </span>
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => setMinSquadSize(Math.max(2, minSquadSize - 1))}
                  className="w-9 h-10 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] font-bold text-base hover:bg-[var(--color-surface-elevated)]"
                >
                  -
                </button>
                <div className="flex-1 text-center font-display font-black text-xl text-[var(--color-text-main)]">
                  {minSquadSize}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = minSquadSize + 1;
                    setMinSquadSize(next);
                    if (next > maxSquadSize) setMaxSquadSize(next);
                  }}
                  className="w-9 h-10 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] font-bold text-base hover:bg-[var(--color-surface-elevated)]"
                >
                  +
                </button>
              </div>
            </div>

            {/* Max Squad */}
            <div>
              <span className="block text-[11px] font-semibold text-[var(--color-text-muted)] mb-1">
                Maximum Squad Limit
              </span>
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => setMaxSquadSize(Math.max(minSquadSize, maxSquadSize - 1))}
                  className="w-9 h-10 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] font-bold text-base hover:bg-[var(--color-surface-elevated)]"
                >
                  -
                </button>
                <div className="flex-1 text-center font-display font-black text-xl text-[var(--color-text-main)]">
                  {maxSquadSize}
                </div>
                <button
                  type="button"
                  onClick={() => setMaxSquadSize(Math.min(15, maxSquadSize + 1))}
                  className="w-9 h-10 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] font-bold text-base hover:bg-[var(--color-surface-elevated)]"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-[var(--color-text-dim)] pt-1 italic">
            Teams must buy at least {minSquadSize} players. Once {minSquadSize} are met, teams can spend full remaining purse on bonus slots up to {maxSquadSize}.
          </p>
        </div>

        {/* Bid Step & Shuffle */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">
              Bid Step (₹ {purseUnit})
            </label>
            <select
              value={bidStep}
              onChange={(e) => setBidStep(parseFloat(e.target.value))}
              className="w-full min-h-[44px] bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-lg px-3 font-semibold text-xs text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-primary)]"
            >
              <option value="0.25">0.25 {purseUnit}</option>
              <option value="0.5">0.5 {purseUnit} (Default)</option>
              <option value="1">1.0 {purseUnit}</option>
              <option value="2">2.0 {purseUnit}</option>
            </select>
          </div>

          <div className="flex flex-col justify-end">
            <label className="inline-flex items-center space-x-2 cursor-pointer min-h-[44px]">
              <input
                type="checkbox"
                checked={shuffleOrder}
                onChange={(e) => setShuffleOrder(e.target.checked)}
                className="w-5 h-5 rounded text-[var(--color-primary)] focus:ring-[var(--color-primary)] accent-[var(--color-primary)]"
              />
              <span className="text-xs font-semibold text-[var(--color-text-main)]">
                Shuffle player order
              </span>
            </label>
          </div>
        </div>

        {/* Player Pool Visibility to Owners (Public vs Secret/Hidden) */}
        <div className="pt-2 border-t border-[var(--color-border)]">
          <label className="block text-xs font-bold text-[var(--color-text-main)] mb-1.5 flex items-center space-x-1.5">
            {poolVisibility === 'public' ? (
              <Eye className="w-4 h-4 text-[var(--color-primary)]" />
            ) : (
              <EyeOff className="w-4 h-4 text-amber-500" />
            )}
            <span>Player Pool Visibility for Owners</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPoolVisibility('public')}
              className={`p-2.5 rounded-xl border text-left transition min-h-[44px] ${
                poolVisibility === 'public'
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)] font-bold shadow-xs'
                  : 'border-[var(--color-border)] bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]'
              }`}
            >
              <span className="text-xs font-bold block">Visible to Owners</span>
              <span className="text-[10px] opacity-80 block">
                Owners can browse all upcoming players in the pool.
              </span>
            </button>

            <button
              type="button"
              onClick={() => setPoolVisibility('hidden')}
              className={`p-2.5 rounded-xl border text-left transition min-h-[44px] ${
                poolVisibility === 'hidden'
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 font-bold shadow-xs'
                  : 'border-[var(--color-border)] bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]'
              }`}
            >
              <span className="text-xs font-bold block">Secret / Blind Lots</span>
              <span className="text-[10px] opacity-80 block">
                Hidden from owners until each lot enters the auction ring!
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Teams Configuration (2 to 10) */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold font-display uppercase tracking-wider text-[var(--color-text-main)] flex items-center space-x-2">
            <Users className="w-5 h-5 text-[var(--color-primary)]" />
            <span>Teams ({teams.length} of 10)</span>
          </h2>
          <button
            type="button"
            onClick={handleShuffleTeams}
            title="Shuffle team order"
            className="p-1.5 rounded-lg bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] min-h-[36px] flex items-center space-x-1 text-xs"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Shuffle</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {teams.map((t, idx) => (
            <div
              key={t.id}
              className="flex items-center justify-between px-3 py-2 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl"
            >
              <div className="flex items-center space-x-2 truncate">
                <span className="font-mono text-xs font-bold text-[var(--color-primary)] w-5">
                  {idx + 1}.
                </span>
                <span className="text-xs font-bold text-[var(--color-text-main)] truncate">
                  {t.name}
                </span>
              </div>
              {teams.length > 2 && (
                <button
                  type="button"
                  onClick={() => handleRemoveTeam(t.id)}
                  aria-label={`Remove team ${t.name}`}
                  className="p-1 text-[var(--color-text-dim)] hover:text-red-500 rounded min-h-[36px]"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {teams.length < 10 && (
          <div className="flex space-x-2 pt-1">
            <input
              type="text"
              placeholder="Add custom team name"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTeam())}
              className="flex-1 min-h-[44px] bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-lg px-3 text-xs text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-primary)]"
            />
            <button
              type="button"
              onClick={handleAddTeam}
              className="px-4 py-2 bg-[var(--color-surface-elevated)] border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] font-bold text-xs rounded-lg min-h-[44px] flex items-center space-x-1"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Player Pool Selector & Base Prices */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold font-display uppercase tracking-wider text-[var(--color-text-main)] flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-[var(--color-primary)]" />
              <span>Player Pool</span>
            </h2>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[var(--color-primary-light)] text-[var(--color-primary)]">
              {selectedPlayersList.length} Selected
            </span>
          </div>

          {/* Live Role Counts Bar with Min 2 Indicators */}
          <div className="grid grid-cols-4 gap-1.5 mt-2.5 text-center text-xs">
            <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg py-1.5">
              <div className="flex items-center justify-center space-x-1">
                <span className="font-bold text-blue-700 dark:text-blue-300">BAT</span>
                {countsByRole.BAT >= 2 && <span className="text-[9px] text-blue-600 font-bold">✓≥2</span>}
              </div>
              <span className="block font-mono font-black text-sm text-blue-900 dark:text-blue-100">
                {countsByRole.BAT}
              </span>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg py-1.5">
              <div className="flex items-center justify-center space-x-1">
                <span className="font-bold text-amber-700 dark:text-amber-300">WK</span>
                {countsByRole.WK >= 2 && <span className="text-[9px] text-amber-600 font-bold">✓≥2</span>}
              </div>
              <span className="block font-mono font-black text-sm text-amber-900 dark:text-amber-100">
                {countsByRole.WK}
              </span>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg py-1.5">
              <div className="flex items-center justify-center space-x-1">
                <span className="font-bold text-emerald-700 dark:text-emerald-300">AR</span>
                {countsByRole.AR >= 2 && <span className="text-[9px] text-emerald-600 font-bold">✓≥2</span>}
              </div>
              <span className="block font-mono font-black text-sm text-emerald-900 dark:text-emerald-100">
                {countsByRole.AR}
              </span>
            </div>
            <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-lg py-1.5">
              <div className="flex items-center justify-center space-x-1">
                <span className="font-bold text-purple-700 dark:text-purple-300">BOWL</span>
                {countsByRole.BOWL >= 2 && <span className="text-[9px] text-purple-600 font-bold">✓≥2</span>}
              </div>
              <span className="block font-mono font-black text-sm text-purple-900 dark:text-purple-100">
                {countsByRole.BOWL}
              </span>
            </div>
          </div>

          {/* Validation Status Badge */}
          <div
            className={`mt-2.5 px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between ${
              isPlayerCountSufficient
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800'
                : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-800'
            }`}
          >
            <span>
              Required: At least {minRequiredPlayers} players ({teams.length} teams × {minSquadSize} min squad).
            </span>
            <span className="font-mono font-bold">
              {selectedPlayersList.length} / {minRequiredPlayers}
            </span>
          </div>
        </div>

        {/* Quick Batch Select Buttons with Pool Guarantee */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleSelectAll}
            className="px-3 py-1.5 bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-lg text-xs font-bold text-[var(--color-text-main)] min-h-[38px] flex items-center space-x-1 cursor-pointer"
          >
            <CheckSquare className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            <span>Select All 100</span>
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            className="px-3 py-1.5 bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-lg text-xs font-bold text-[var(--color-text-main)] min-h-[38px] flex items-center space-x-1 cursor-pointer"
          >
            <Square className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
          <div className="flex items-center space-x-1 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-lg px-2 py-0.5">
            <span className="text-[10px] text-[var(--color-text-dim)]">N:</span>
            <input
              type="number"
              min={minRequiredPlayers}
              max={playerPool.length}
              value={randomCount}
              onChange={(e) => setRandomCount(Number(e.target.value))}
              className="w-12 text-center text-xs font-bold bg-transparent text-[var(--color-text-main)] focus:outline-none"
            />
            <button
              type="button"
              onClick={handlePickRandom}
              title="Picks random N guaranteeing at least 2 players in each role pool (BAT, WK, AR, BOWL)"
              className="px-2 py-1 text-xs font-bold text-[var(--color-primary)] hover:underline min-h-[36px] cursor-pointer"
            >
              Pick Random (≥2 Each Pool)
            </button>
          </div>
        </div>

        {/* Add Custom Players Toggle */}
        <div className="border-t border-[var(--color-border)] pt-3">
          <button
            type="button"
            onClick={() => setShowCustomBox(!showCustomBox)}
            className="text-xs font-bold text-[var(--color-primary)] hover:underline flex items-center space-x-1 min-h-[38px] cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>
              {showCustomBox
                ? 'Hide Custom Players Box'
                : 'Add Your Own Players (Custom List)'}
            </span>
          </button>

          {showCustomBox && (
            <div className="mt-2.5 p-3 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl space-y-2">
              <p className="text-[11px] text-[var(--color-text-muted)]">
                One per line:{' '}
                <code className="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded">
                  Name, ROLE, base
                </code>{' '}
                (e.g.{' '}
                <span className="font-mono">Sachin Tendulkar, BAT, 2.0</span>).
                Invalid roles skipped; base rounded to nearest of 0.5, 1, 1.5, or 2.
              </p>
              <textarea
                rows={3}
                placeholder="Sachin Tendulkar, BAT, 2&#10;Brian Lara, BAT, 2&#10;Muttiah Muralitharan, BOWL, 1.5"
                value={customInputText}
                onChange={(e) => setCustomInputText(e.target.value)}
                className="w-full text-xs font-mono bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-2 text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-primary)]"
              />
              {customMsg && (
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {customMsg}
                </p>
              )}
              <button
                type="button"
                onClick={handleAddCustomPlayers}
                className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold text-xs rounded-lg min-h-[40px] cursor-pointer"
              >
                Parse & Add to Pool
              </button>
            </div>
          )}
        </div>

        {/* Search & Role Filter */}
        <div className="flex items-center space-x-2 pt-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-[var(--color-text-dim)]" />
            <input
              type="text"
              placeholder="Search player name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-lg text-xs text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as any)}
            className="min-h-[44px] bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-lg px-2.5 text-xs font-bold text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-primary)]"
          >
            <option value="ALL">All Roles</option>
            <option value="BAT">BAT</option>
            <option value="WK">WK</option>
            <option value="AR">AR</option>
            <option value="BOWL">BOWL</option>
          </select>
        </div>

        {/* Players List with Base Price Dropdowns */}
        <div className="max-h-[360px] overflow-y-auto space-y-1.5 pr-1 divide-y divide-[var(--color-border)]/40">
          {displayedPlayers.map((player) => {
            const isSelected = selectedIds.has(player.id);
            return (
              <div
                key={player.id}
                className={`pt-1.5 pb-1.5 px-2 flex items-center justify-between rounded-lg transition ${
                  isSelected
                    ? 'bg-[var(--color-primary-light)]/40'
                    : 'hover:bg-[var(--color-surface-subtle)]'
                }`}
              >
                <label className="flex items-center space-x-2.5 flex-1 cursor-pointer truncate mr-2 min-h-[40px]">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleTogglePlayer(player.id)}
                    className="w-4 h-4 rounded text-[var(--color-primary)] focus:ring-[var(--color-primary)] accent-[var(--color-primary)]"
                  />
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${getRoleBadgeColor(
                      player.role
                    )}`}
                  >
                    {player.role}
                  </span>
                  <span className="text-xs font-bold text-[var(--color-text-main)] truncate">
                    {player.name}
                  </span>
                </label>

                {/* Base price dropdown: ONLY 0.5, 1, 1.5, 2 */}
                <div className="flex items-center space-x-1 flex-shrink-0">
                  <span className="text-[11px] font-semibold text-[var(--color-text-dim)]">
                    Base ₹
                  </span>
                  <select
                    value={player.basePrice}
                    onChange={(e) =>
                      handleBasePriceChange(
                        player.id,
                        parseFloat(e.target.value) as BasePrice
                      )
                    }
                    className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1 text-xs font-bold text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-primary)] min-h-[36px]"
                  >
                    {ALLOWED_BASE_PRICES.map((bp) => (
                      <option key={bp} value={bp}>
                        {bp} {purseUnit}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="sticky bottom-0 bg-[var(--color-surface)]/95 backdrop-blur-md border-t border-[var(--color-border)] p-3 rounded-2xl shadow-lg">
        <button
          type="button"
          disabled={!isPlayerCountSufficient || isCreating}
          onClick={handleStartCreation}
          className={`w-full min-h-[50px] py-3.5 px-6 rounded-xl font-display text-xl font-bold uppercase tracking-wider transition shadow-md flex items-center justify-center space-x-2 ${
            isPlayerCountSufficient && !isCreating
              ? 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white cursor-pointer active:scale-[0.99]'
              : 'bg-gray-300 dark:bg-gray-800 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isCreating ? (
            <span>Creating Room...</span>
          ) : (
            <span>
              {isPlayerCountSufficient
                ? `Create Auction Room (${selectedPlayersList.length} Players)`
                : `Need ${minRequiredPlayers - selectedPlayersList.length} More Players`}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
