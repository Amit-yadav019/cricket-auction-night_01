import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_BASE_PRICES,
  roundToBasePrice,
  calculateMaxBid,
  getValidNextBids,
  validateBid,
  parseCustomPlayers,
  pickRandomBalanced,
  isAuctionComplete,
  Player,
  Team,
} from './auctionRules';
import { DEFAULT_100_PLAYERS } from './defaultPlayers';

test('Player pool contains exactly 100 players matching allowed base prices', () => {
  assert.equal(DEFAULT_100_PLAYERS.length, 100);
  const batCount = DEFAULT_100_PLAYERS.filter((p) => p.role === 'BAT').length;
  const wkCount = DEFAULT_100_PLAYERS.filter((p) => p.role === 'WK').length;
  const arCount = DEFAULT_100_PLAYERS.filter((p) => p.role === 'AR').length;
  const bowlCount = DEFAULT_100_PLAYERS.filter((p) => p.role === 'BOWL').length;

  assert.equal(batCount, 27);
  assert.equal(wkCount, 14);
  assert.equal(arCount, 25);
  assert.equal(bowlCount, 34);

  // All base prices must be one of 0.5, 1, 1.5, 2
  for (const p of DEFAULT_100_PLAYERS) {
    assert.ok(
      ALLOWED_BASE_PRICES.includes(p.basePrice),
      `Player ${p.name} has invalid base price ${p.basePrice}`
    );
  }
});

test('Base prices limited to 0.5, 1, 1.5, 2 and nearest rounding works correctly', () => {
  assert.equal(roundToBasePrice(0.4), 0.5);
  assert.equal(roundToBasePrice(0.5), 0.5);
  assert.equal(roundToBasePrice(0.7), 0.5);
  assert.equal(roundToBasePrice(0.8), 1.0);
  assert.equal(roundToBasePrice(1.2), 1.0);
  assert.equal(roundToBasePrice(1.3), 1.5);
  assert.equal(roundToBasePrice(1.8), 2.0);
  assert.equal(roundToBasePrice(10.0), 2.0);
});

test('Custom player parser correctly skips invalid roles and rounds base prices', () => {
  const input = `
    Sachin Tendulkar, BAT, 2.0
    Wasim Akram, BOWL, 1.8
    Custom Star, INVALID_ROLE, 1.5
    Anil Kumble, BOWL, 0.9
  `;
  const parsed = parseCustomPlayers(input);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].name, 'Sachin Tendulkar');
  assert.equal(parsed[0].role, 'BAT');
  assert.equal(parsed[0].basePrice, 2.0);

  assert.equal(parsed[1].name, 'Wasim Akram');
  assert.equal(parsed[1].role, 'BOWL');
  assert.equal(parsed[1].basePrice, 2.0);

  assert.equal(parsed[2].name, 'Anil Kumble');
  assert.equal(parsed[2].role, 'BOWL');
  assert.equal(parsed[2].basePrice, 1.0);
});

test('First bid equals base price, subsequent bids raise by only 1x, 2x, or 4x bidStep', () => {
  const basePrice = 1.5;
  const bidStep = 0.5;

  const firstOptions = getValidNextBids(null, basePrice, bidStep);
  assert.equal(firstOptions.length, 1);
  assert.equal(firstOptions[0].amount, 1.5);
  assert.equal(firstOptions[0].multiplier, 0);

  const nextOptions = getValidNextBids(1.5, basePrice, bidStep);
  assert.equal(nextOptions.length, 3);
  assert.deepEqual(nextOptions.map((o) => o.amount), [2.0, 2.5, 3.5]);
});

test('MaxBid rule with single squad size and squad size range (min 3, max 5)', () => {
  // Case A: Fixed squad size 6, 2 bought -> slotsLeft = 4. Reserve (4-1)*0.5 = 1.5 -> maxBid 18.5
  const maxBid1 = calculateMaxBid(20, 2, 6, 0.5);
  assert.equal(maxBid1, 18.5);

  // Case B: Range min 3, max 5
  // 1. Team has 1 player (needs 2 more to satisfy min 3):
  // mandatorySlotsLeft = 2 -> reserve (2-1)*0.5 = 0.5 -> maxBid = 20 - 0.5 = 19.5
  const maxBidRangeEarly = calculateMaxBid(20, 1, 5, 0.5, 3);
  assert.equal(maxBidRangeEarly, 19.5);

  // 2. Team has 3 players (min 3 satisfied! Can spend all remaining purse on slot 4):
  const maxBidRangeSatisfied = calculateMaxBid(12, 3, 5, 0.5, 3);
  assert.equal(maxBidRangeSatisfied, 12);

  // 3. Team has 5 players (reached maxSquadSize 5 -> full, maxBid 0):
  const maxBidRangeFull = calculateMaxBid(10, 5, 5, 0.5, 3);
  assert.equal(maxBidRangeFull, 0);
});

test('validateBid enforces leader cannot rebid, squad limits, and step validity', () => {
  const baseParams = {
    teamId: 'csk',
    teamPurse: 20,
    teamPlayerCount: 1,
    maxSquadSize: 5,
    minSquadSize: 3,
    lowestBasePrice: 0.5,
    currentBid: 2.0,
    leadingTeamId: 'mi',
    basePrice: 1.5,
    bidStep: 0.5,
    proposedAmount: 2.5,
    currentPlayerId: 'player_1',
    targetPlayerId: 'player_1',
  };

  const validRes = validateBid(baseParams);
  assert.equal(validRes.valid, true);

  const leaderRebid = validateBid({ ...baseParams, leadingTeamId: 'csk' });
  assert.equal(leaderRebid.valid, false);
  assert.match(leaderRebid.reason!, /already leading/i);

  const staleBid = validateBid({ ...baseParams, targetPlayerId: 'player_2' });
  assert.equal(staleBid.valid, false);
  assert.match(staleBid.reason!, /no longer active/i);

  const invalidStep = validateBid({ ...baseParams, proposedAmount: 2.7 });
  assert.equal(invalidStep.valid, false);
  assert.match(invalidStep.reason!, /raise by 1x, 2x, or 4x/i);
});

test('pickRandomBalanced guarantees minimum 2 players in each pool (BAT, WK, AR, BOWL)', () => {
  // Test picking a small count of 12 players with min 2 per pool
  const selectedIds = pickRandomBalanced(DEFAULT_100_PLAYERS, 12, 2);
  assert.equal(selectedIds.length, 12);

  const selectedPlayers = DEFAULT_100_PLAYERS.filter((p) =>
    selectedIds.includes(p.id)
  );
  const batCount = selectedPlayers.filter((p) => p.role === 'BAT').length;
  const wkCount = selectedPlayers.filter((p) => p.role === 'WK').length;
  const arCount = selectedPlayers.filter((p) => p.role === 'AR').length;
  const bowlCount = selectedPlayers.filter((p) => p.role === 'BOWL').length;

  assert.ok(batCount >= 2, `BAT count ${batCount} is less than 2`);
  assert.ok(wkCount >= 2, `WK count ${wkCount} is less than 2`);
  assert.ok(arCount >= 2, `AR count ${arCount} is less than 2`);
  assert.ok(bowlCount >= 2, `BOWL count ${bowlCount} is less than 2`);
});

test('Auction completion logic detects full squads or no players left', () => {
  const teams: Team[] = [
    {
      id: 't1',
      name: 'Team 1',
      shortName: 'T1',
      purse: 5,
      spent: 15,
      players: new Array(5).fill({ id: 'p', name: 'P', role: 'BAT', basePrice: 1, status: 'sold' }),
    },
    {
      id: 't2',
      name: 'Team 2',
      shortName: 'T2',
      purse: 5,
      spent: 15,
      players: new Array(5).fill({ id: 'p', name: 'P', role: 'BAT', basePrice: 1, status: 'sold' }),
    },
  ];

  // Both teams reached maxSquadSize 5 -> complete
  assert.equal(isAuctionComplete(teams, 5, 10, 3), true);

  // Missing slots, but players remaining -> not complete
  teams[1].players.pop(); // 4 players
  assert.equal(isAuctionComplete(teams, 5, 5, 3), false);

  // 0 players remaining -> complete
  assert.equal(isAuctionComplete(teams, 5, 0, 3), true);
});
