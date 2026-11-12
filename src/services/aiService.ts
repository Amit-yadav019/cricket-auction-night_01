import { Team, Player, getDynamicRoleRequirements, calculateMaxBid } from '../game/auctionRules';

export type PitchConditionTag =
  | 'balanced'
  | 'spin'
  | 'flat'
  | 'bounce'
  | 'swing'
  | 'dew'
  | 'slow_pitch'
  | 'large_ground'
  | 'small_ground'
  | 'high_altitude';

export interface TeamScoutRanking {
  teamId: string;
  teamName: string;
  scoreOutOf10: number;
  verdict: string;
  benchPenaltyNote?: string;
  benchStrength: string;
  benchPlayersList: string[];
  benchReplacementVerdict: string;
  squadCounters: {
    eliteSpinners: number;
    frontlineSpinners: number;
    partTimeSpinners: number;
    totalSpinners: number;
    totalWicketkeepers: number;
    middleOrderWks: number;
    paceBowlers: number;
  };
  projectedStats: {
    avgBattingScore: number;
    avgBattingWickets: number;
    avgBowlingConceded: number;
    avgBowlingWickets: number;
    netRunDifferential: number;
  };
  playingBalance: {
    battingDepth: string;
    deathBowling: string;
    spinQuality: string;
    powerplayImpact: string;
    battingOrderSynergy: string;
  };
  metrics: {
    sixthBowlingOption: boolean;
    powerHittingIndex: number;
    anchorStabilityIndex: number;
    deathOverRating: number;
    variationsRating: number;
    battingOrderScore: number;
  };
  archetypeBreakdown: string[];
  pros: string[];
  cons: string[];
}

export interface MasterScoutReport {
  executiveSummary: string;
  activeConditions: PitchConditionTag[];
  rankings: TeamScoutRanking[];
  generatedAt: number;
}

export interface TournamentSimulationResult {
  championTeamId: string;
  championTeamName: string;
  runnerUpTeamName: string;
  finalMatchSummary: string;
  orangeCap: { playerName: string; teamName: string; runs: number; strikeRate: number; reason: string };
  purpleCap: { playerName: string; teamName: string; wickets: number; economy: number; reason: string };
  superStriker: { playerName: string; teamName: string; strikeRate: number; runs: number };
  manOfTournament: { playerName: string; teamName: string; mvpPoints: number; summary: string };
  pointsTable: Array<{
    teamId: string;
    teamName: string;
    played: number;
    won: number;
    lost: number;
    nrr: string;
    points: number;
  }>;
}

export type BattingSlotRole = 'opener' | 'top_middle' | 'finisher' | 'tailender';
export type SpinTier = 'none' | 'part_time' | 'frontline' | 'elite';

export interface PlayerTacticalDNA {
  power: number;
  stability: number;
  ppBowl: number;
  deathBowl: number;
  variations: number;
  spinControl: number;
  fielding: number;
  versatility: number;
  leadership: number;
  isGenuineBowler: boolean;
  isGenuineSpinner: boolean;
  spinTier: SpinTier;
  isMiddleOrderWk: boolean;
  preferredSlot: BattingSlotRole;
  tag: string;
}

export interface TeamLineupConfig {
  playingIds: string[];
  benchIds: string[];
  impactPlayerId?: string;
  captainId?: string;
  viceCaptainId?: string;
  contractTypes?: Record<string, '1yr' | '3yr'>;
}

interface CalibratedProfile {
  cat: 'PACE' | 'SPIN' | 'AR_PACE' | 'AR_SPIN' | 'WK_TOP' | 'WK_MID' | 'BAT';
  bat?: number;
  ball?: number;
  slot?: BattingSlotRole;
  deathBias?: boolean;
}

// MASTER 350-PLAYER POST-2010 IPL (2011–2026) CALIBRATED DATABASE
const PLAYER_RATINGS_350: Record<string, CalibratedProfile> = {
  // === 1. PACE BOWLERS (85) ===
  'jasprit bumrah': { cat: 'PACE', ball: 99, deathBias: true },
  'lasith malinga': { cat: 'PACE', ball: 98, deathBias: true },
  'mitchell starc': { cat: 'PACE', ball: 97, deathBias: false },
  'trent boult': { cat: 'PACE', ball: 97, deathBias: false },
  'dale steyn': { cat: 'PACE', ball: 97, deathBias: false },
  'jofra archer': { cat: 'PACE', ball: 96, deathBias: true },
  'kagiso rabada': { cat: 'PACE', ball: 96, deathBias: true },
  'josh hazlewood': { cat: 'PACE', ball: 95, deathBias: false },
  'pat cummins': { cat: 'PACE', ball: 95, deathBias: false },
  'mohammed shami': { cat: 'PACE', ball: 95, deathBias: false },
  'bhuvneshwar kumar': { cat: 'PACE', ball: 94, deathBias: false },
  'matheesha pathirana': { cat: 'PACE', ball: 94, deathBias: true },
  'mark wood': { cat: 'PACE', ball: 94, deathBias: false },
  'lockie ferguson': { cat: 'PACE', ball: 93, deathBias: true },
  'arshdeep singh': { cat: 'PACE', ball: 93, deathBias: true },
  'mohammed siraj': { cat: 'PACE', ball: 92, deathBias: false },
  'dwayne bravo': { cat: 'PACE', ball: 92, deathBias: true },

  'mayank yadav': { cat: 'PACE', ball: 88, deathBias: false },
  'anrich nortje': { cat: 'PACE', ball: 87, deathBias: true },
  'lungi ngidi': { cat: 'PACE', ball: 87, deathBias: true },
  'matt henry': { cat: 'PACE', ball: 87, deathBias: false },
  'harshal patel': { cat: 'PACE', ball: 86, deathBias: true },
  't natarajan': { cat: 'PACE', ball: 86, deathBias: true },
  'mustafizur rahman': { cat: 'PACE', ball: 85, deathBias: true },
  'nathan ellis': { cat: 'PACE', ball: 85, deathBias: true },
  'spencer johnson': { cat: 'PACE', ball: 85, deathBias: false },
  'deepak chahar': { cat: 'PACE', ball: 84, deathBias: false },
  'khaleel ahmed': { cat: 'PACE', ball: 84, deathBias: false },
  'prasidh krishna': { cat: 'PACE', ball: 84, deathBias: false },
  'reece topley': { cat: 'PACE', ball: 84, deathBias: false },
  'daniel sams': { cat: 'PACE', ball: 84, deathBias: true },
  'kyle jamieson': { cat: 'PACE', ball: 84, deathBias: false },
  'avesh khan': { cat: 'PACE', ball: 83, deathBias: true },
  'sandeep sharma': { cat: 'PACE', ball: 83, deathBias: false },
  'morne morkel': { cat: 'PACE', ball: 83, deathBias: false },
  'chris morris': { cat: 'PACE', ball: 83, deathBias: true },
  'gerald coetzee': { cat: 'PACE', ball: 82, deathBias: true },
  'mohit sharma': { cat: 'PACE', ball: 81, deathBias: true },
  'mukesh kumar': { cat: 'PACE', ball: 81, deathBias: true },
  'josh tongue': { cat: 'PACE', ball: 81, deathBias: false },
  'nuwan thushara': { cat: 'PACE', ball: 81, deathBias: true },
  'shardul thakur': { cat: 'PACE', ball: 80, deathBias: false },
  'umesh yadav': { cat: 'PACE', ball: 80, deathBias: false },
  'dushmantha chameera': { cat: 'PACE', ball: 80, deathBias: false },
  'jhye richardson': { cat: 'PACE', ball: 80, deathBias: false },
  'alzarri joseph': { cat: 'PACE', ball: 79, deathBias: false },
  'riley meredith': { cat: 'PACE', ball: 79, deathBias: false },
  'ishant sharma': { cat: 'PACE', ball: 78, deathBias: false },
  'akash deep': { cat: 'PACE', ball: 78, deathBias: false },

  'nandre burger': { cat: 'PACE', ball: 77, deathBias: false },
  'eshan malinga': { cat: 'PACE', ball: 76, deathBias: true },
  'harshit rana': { cat: 'PACE', ball: 76, deathBias: true },
  'kwena maphaka': { cat: 'PACE', ball: 76, deathBias: false },
  'xavier bartlett': { cat: 'PACE', ball: 76, deathBias: false },
  'jacob duffy': { cat: 'PACE', ball: 76, deathBias: false },
  'jaydev unadkat': { cat: 'PACE', ball: 76, deathBias: true },
  'mohsin khan': { cat: 'PACE', ball: 75, deathBias: false },
  'vyshak vijaykumar': { cat: 'PACE', ball: 75, deathBias: true },
  'yash thakur': { cat: 'PACE', ball: 75, deathBias: true },
  'prince yadav': { cat: 'PACE', ball: 75, deathBias: true },
  'yash dayal': { cat: 'PACE', ball: 74, deathBias: false },
  'akash singh': { cat: 'PACE', ball: 74, deathBias: false },
  'gurjapneet singh': { cat: 'PACE', ball: 74, deathBias: false },
  'vaibhav arora': { cat: 'PACE', ball: 73, deathBias: false },
  'tushar deshpande': { cat: 'PACE', ball: 73, deathBias: true },
  'sushant mishra': { cat: 'PACE', ball: 73, deathBias: false },
  'auqib dar': { cat: 'PACE', ball: 73, deathBias: false },
  'akash madhwal': { cat: 'PACE', ball: 72, deathBias: true },
  'naman tiwari': { cat: 'PACE', ball: 72, deathBias: false },
  'anshul kamboj': { cat: 'PACE', ball: 71, deathBias: false },
  'rasikh salam': { cat: 'PACE', ball: 71, deathBias: true },
  'arjun tendulkar': { cat: 'PACE', ball: 71, deathBias: false },
  'gurnoor brar': { cat: 'PACE', ball: 71, deathBias: false },
  'ashwani kumar': { cat: 'PACE', ball: 70, deathBias: true },
  'umran malik': { cat: 'PACE', ball: 70, deathBias: false },
  'abhinandan singh': { cat: 'PACE', ball: 70, deathBias: false },
  'mangesh yadav': { cat: 'PACE', ball: 70, deathBias: false },
  'praful hinge': { cat: 'PACE', ball: 70, deathBias: false },
  'sakib hussain': { cat: 'PACE', ball: 70, deathBias: false },
  'shivam mavi': { cat: 'PACE', ball: 69, deathBias: false },
  'mukesh choudhary': { cat: 'PACE', ball: 69, deathBias: false },
  'simarjeet singh': { cat: 'PACE', ball: 68, deathBias: false },
  'chetan sakariya': { cat: 'PACE', ball: 68, deathBias: true },
  'kartik tyagi': { cat: 'PACE', ball: 67, deathBias: true },
  'brydon carse': { cat: 'PACE', ball: 67, deathBias: false },

  // === 2. SPECIALIST SPINNERS (60) ===
  'rashid khan': { cat: 'SPIN', ball: 99 },
  'varun chakaravarthy': { cat: 'SPIN', ball: 97 },
  'kuldeep yadav': { cat: 'SPIN', ball: 97 },
  'yuzvendra chahal': { cat: 'SPIN', ball: 96 },
  'ravichandran ashwin': { cat: 'SPIN', ball: 94 },
  'ravi bishnoi': { cat: 'SPIN', ball: 94 },
  'wanindu hasaranga': { cat: 'SPIN', ball: 94 },
  'noor ahmad': { cat: 'SPIN', ball: 93 },
  'mitchell santner': { cat: 'SPIN', ball: 93 },
  'adam zampa': { cat: 'SPIN', ball: 93 },
  'imran tahir': { cat: 'SPIN', ball: 93 },
  'krunal pandya': { cat: 'SPIN', ball: 92 },
  'harbhajan singh': { cat: 'SPIN', ball: 92 },
  'maheesh theekshana': { cat: 'SPIN', ball: 92 },
  'amit mishra': { cat: 'SPIN', ball: 92 },
  'mujeeb ur rahman': { cat: 'SPIN', ball: 92 },
  'keshav maharaj': { cat: 'SPIN', ball: 92 },
  'adil rashid': { cat: 'SPIN', ball: 92 },
  'akeal hosein': { cat: 'SPIN', ball: 92 },
  'tabraiz shamsi': { cat: 'SPIN', ball: 92 },

  'washington sundar': { cat: 'SPIN', ball: 83 },
  'r sai kishore': { cat: 'SPIN', ball: 83 },
  'sai kishore': { cat: 'SPIN', ball: 83 },
  'rahul chahar': { cat: 'SPIN', ball: 82 },
  'piyush chawla': { cat: 'SPIN', ball: 82 },
  'harpreet brar': { cat: 'SPIN', ball: 81 },
  'suyash sharma': { cat: 'SPIN', ball: 79 },
  'digvesh rathi': { cat: 'SPIN', ball: 79 },
  'mayank markande': { cat: 'SPIN', ball: 78 },
  'shreyas gopal': { cat: 'SPIN', ball: 78 },
  'vipraj nigam': { cat: 'SPIN', ball: 78 },
  'rehan ahmed': { cat: 'SPIN', ball: 78 },
  'karn sharma': { cat: 'SPIN', ball: 77 },
  'allah ghazanfar': { cat: 'SPIN', ball: 77 },
  'a m ghazanfar': { cat: 'SPIN', ball: 77 },
  'murugan ashwin': { cat: 'SPIN', ball: 76 },
  'jayant yadav': { cat: 'SPIN', ball: 76 },
  'manav suthar': { cat: 'SPIN', ball: 76 },
  'harsh dubey': { cat: 'SPIN', ball: 76 },
  'raghu sharma': { cat: 'SPIN', ball: 76 },
  'zeeshan ansari': { cat: 'SPIN', ball: 75 },
  'kumar kartikeya': { cat: 'SPIN', ball: 75 },
  'swapnil singh': { cat: 'SPIN', ball: 75 },
  'm siddharth': { cat: 'SPIN', ball: 75 },
  'krishnappa gowtham': { cat: 'SPIN', ball: 75 },
  'pravin tambe': { cat: 'SPIN', ball: 75 },
  'brad hogg': { cat: 'SPIN', ball: 75 },
  'tanveer sangha': { cat: 'SPIN', ball: 75 },
  'tripurana vijay': { cat: 'SPIN', ball: 75 },

  'kc cariappa': { cat: 'SPIN', ball: 73 },
  'pravin dubey': { cat: 'SPIN', ball: 73 },
  'saurabh kumar': { cat: 'SPIN', ball: 73 },
  'jagadeesha suchith': { cat: 'SPIN', ball: 73 },
  'iqbal abdulla': { cat: 'SPIN', ball: 73 },
  'izharulhaq naveed': { cat: 'SPIN', ball: 72 },
  'jake lintott': { cat: 'SPIN', ball: 71 },
  'tejas baroka': { cat: 'SPIN', ball: 70 },
  'krains fuletra': { cat: 'SPIN', ball: 70 },
  'shams mulani': { cat: 'SPIN', ball: 74 },
  'tanush kotian': { cat: 'SPIN', ball: 74 },

  // === 3. ALL-ROUNDERS (60 — DUAL BAT + BALL) ===
  'sunil narine': { cat: 'AR_SPIN', bat: 90, ball: 99, slot: 'opener' },
  'ravindra jadeja': { cat: 'AR_SPIN', bat: 82, ball: 95, slot: 'finisher' },
  'axar patel': { cat: 'AR_SPIN', bat: 84, ball: 95, slot: 'finisher' },
  'hardik pandya': { cat: 'AR_PACE', bat: 93, ball: 88, slot: 'finisher' },
  'glenn maxwell': { cat: 'AR_SPIN', bat: 93, ball: 84, slot: 'top_middle' },
  'glen maxwell': { cat: 'AR_SPIN', bat: 93, ball: 84, slot: 'top_middle' },
  'andre russell': { cat: 'AR_PACE', bat: 93, ball: 81, slot: 'finisher' },
  'cameron green': { cat: 'AR_PACE', bat: 90, ball: 81, slot: 'top_middle' },
  'abhishek sharma': { cat: 'AR_SPIN', bat: 91, ball: 60, slot: 'opener' },

  'shakib al hasan': { cat: 'AR_SPIN', bat: 84, ball: 87, slot: 'top_middle' },
  'jason holder': { cat: 'AR_PACE', bat: 79, ball: 87, slot: 'finisher' },
  'marco jansen': { cat: 'AR_PACE', bat: 75, ball: 86, slot: 'finisher' },
  'sam curran': { cat: 'AR_PACE', bat: 82, ball: 84, slot: 'finisher' },
  'chris woakes': { cat: 'AR_PACE', bat: 76, ball: 84, slot: 'finisher' },
  'ben stokes': { cat: 'AR_PACE', bat: 86, ball: 83, slot: 'top_middle' },
  'corbin bosch': { cat: 'AR_PACE', bat: 78, ball: 83, slot: 'finisher' },
  'jamie overton': { cat: 'AR_PACE', bat: 80, ball: 82, slot: 'finisher' },
  'marcus stoinis': { cat: 'AR_PACE', bat: 86, ball: 80, slot: 'top_middle' },
  'azmatullah omarzai': { cat: 'AR_PACE', bat: 80, ball: 80, slot: 'finisher' },
  'mitchell marsh': { cat: 'AR_PACE', bat: 87, ball: 79, slot: 'top_middle' },
  'moeen ali': { cat: 'AR_SPIN', bat: 82, ball: 79, slot: 'top_middle' },
  'romario shepherd': { cat: 'AR_PACE', bat: 81, ball: 78, slot: 'finisher' },
  'colin de grandhomme': { cat: 'AR_PACE', bat: 81, ball: 78, slot: 'finisher' },
  'jimmy neesham': { cat: 'AR_PACE', bat: 80, ball: 78, slot: 'finisher' },
  'shahbaz ahmed': { cat: 'AR_SPIN', bat: 78, ball: 78, slot: 'finisher' },
  'mohammad nabi': { cat: 'AR_SPIN', bat: 79, ball: 77, slot: 'finisher' },
  'sikandar raza': { cat: 'AR_SPIN', bat: 81, ball: 77, slot: 'top_middle' },
  'mitchell owen': { cat: 'AR_PACE', bat: 83, ball: 76, slot: 'opener' },
  'jacob bethell': { cat: 'AR_SPIN', bat: 84, ball: 75, slot: 'top_middle' },
  'matthew short': { cat: 'AR_SPIN', bat: 84, ball: 74, slot: 'opener' },
  'prashant veer': { cat: 'AR_SPIN', bat: 75, ball: 75, slot: 'finisher' },

  'liam livingstone': { cat: 'AR_SPIN', bat: 87, ball: 62, slot: 'finisher' },
  'will jacks': { cat: 'AR_SPIN', bat: 86, ball: 61, slot: 'opener' },
  'riyan parag': { cat: 'AR_SPIN', bat: 86, ball: 60, slot: 'top_middle' },
  'shivam dube': { cat: 'AR_PACE', bat: 87, ball: 68, slot: 'top_middle' },
  'venkatesh iyer': { cat: 'AR_PACE', bat: 84, ball: 68, slot: 'top_middle' },
  'naman dhir': { cat: 'AR_SPIN', bat: 83, ball: 68, slot: 'top_middle' },
  'nitish kumar reddy': { cat: 'AR_PACE', bat: 82, ball: 71, slot: 'top_middle' },
  'rachin ravindra': { cat: 'AR_SPIN', bat: 83, ball: 59, slot: 'opener' },
  'ramandeep singh': { cat: 'AR_PACE', bat: 78, ball: 69, slot: 'finisher' },
  'arshad khan': { cat: 'AR_PACE', bat: 74, ball: 77, slot: 'finisher' },
  'yudhvir singh charak': { cat: 'AR_PACE', bat: 70, ball: 76, slot: 'finisher' },
  'zak foulkes': { cat: 'AR_PACE', bat: 72, ball: 76, slot: 'finisher' },
  'rishi dhawan': { cat: 'AR_PACE', bat: 73, ball: 75, slot: 'finisher' },
  'jack edwards': { cat: 'AR_PACE', bat: 75, ball: 75, slot: 'finisher' },
  'anukul roy': { cat: 'AR_SPIN', bat: 73, ball: 75, slot: 'finisher' },
  'suryansh shedge': { cat: 'AR_PACE', bat: 77, ball: 73, slot: 'finisher' },
  'raj bawa': { cat: 'AR_PACE', bat: 74, ball: 74, slot: 'finisher' },
  'nishant sindhu': { cat: 'AR_SPIN', bat: 75, ball: 74, slot: 'finisher' },
  'ramakrishna ghosh': { cat: 'AR_PACE', bat: 72, ball: 74, slot: 'finisher' },
  'dian forrester': { cat: 'AR_PACE', bat: 74, ball: 74, slot: 'finisher' },
  'madhav tiwari': { cat: 'AR_PACE', bat: 72, ball: 74, slot: 'finisher' },
  'lalit yadav': { cat: 'AR_SPIN', bat: 74, ball: 73, slot: 'finisher' },
  'emanjot singh chahal': { cat: 'AR_SPIN', bat: 71, ball: 72, slot: 'finisher' },
  'aman khan': { cat: 'AR_PACE', bat: 74, ball: 71, slot: 'finisher' },
  'arshin kulkarni': { cat: 'AR_PACE', bat: 75, ball: 71, slot: 'opener' },
  'sanvir singh': { cat: 'AR_PACE', bat: 73, ball: 71, slot: 'finisher' },
  'vijay shankar': { cat: 'AR_PACE', bat: 77, ball: 70, slot: 'top_middle' },
  'shivam singh': { cat: 'AR_SPIN', bat: 72, ball: 70, slot: 'finisher' },
  'cooper connolly': { cat: 'AR_SPIN', bat: 76, ball: 54, slot: 'top_middle' },
  'kamindu mendis': { cat: 'AR_SPIN', bat: 78, ball: 55, slot: 'top_middle' },

  // === 4. WICKETKEEPERS (50 — TOP-ORDER & MIDDLE-ORDER) ===
  'jos buttler': { cat: 'WK_TOP', bat: 98, slot: 'opener' },
  'heinrich klaasen': { cat: 'WK_MID', bat: 98, slot: 'top_middle' },
  'nicholas pooran': { cat: 'WK_MID', bat: 97, slot: 'top_middle' },
  'kl rahul': { cat: 'WK_TOP', bat: 96, slot: 'opener' },
  'sanju samson': { cat: 'WK_TOP', bat: 95, slot: 'opener' },
  'rishabh pant': { cat: 'WK_MID', bat: 95, slot: 'top_middle' },
  'phil salt': { cat: 'WK_TOP', bat: 94, slot: 'opener' },
  'quinton de kock': { cat: 'WK_TOP', bat: 94, slot: 'opener' },
  'ms dhoni': { cat: 'WK_MID', bat: 93, slot: 'finisher' },
  'ishan kishan': { cat: 'WK_TOP', bat: 92, slot: 'opener' },
  'jonny bairstow': { cat: 'WK_TOP', bat: 91, slot: 'opener' },

  'jitesh sharma': { cat: 'WK_MID', bat: 88, slot: 'finisher' },
  'josh inglis': { cat: 'WK_MID', bat: 88, slot: 'top_middle' },
  'shai hope': { cat: 'WK_TOP', bat: 87, slot: 'opener' },
  'devon conway': { cat: 'WK_TOP', bat: 86, slot: 'opener' },
  'ben duckett': { cat: 'WK_TOP', bat: 85, slot: 'opener' },
  'ryan rickelton': { cat: 'WK_TOP', bat: 84, slot: 'opener' },
  'rahmanullah gurbaz': { cat: 'WK_TOP', bat: 84, slot: 'opener' },
  'dhruv jurel': { cat: 'WK_MID', bat: 83, slot: 'finisher' },
  'dinesh karthik': { cat: 'WK_MID', bat: 83, slot: 'finisher' },
  'prabhsimran singh': { cat: 'WK_TOP', bat: 83, slot: 'opener' },
  'tim seifert': { cat: 'WK_TOP', bat: 83, slot: 'opener' },
  'tristan stubbs': { cat: 'WK_MID', bat: 82, slot: 'finisher' },
  'robin uthappa': { cat: 'WK_TOP', bat: 82, slot: 'opener' },
  'matthew breetzke': { cat: 'WK_TOP', bat: 82, slot: 'opener' },
  'lhuan-dre pretorius': { cat: 'WK_TOP', bat: 82, slot: 'opener' },
  'glenn phillips': { cat: 'WK_MID', bat: 81, slot: 'finisher' },
  'wriddhiman saha': { cat: 'WK_TOP', bat: 80, slot: 'opener' },
  'connor esterhuizen': { cat: 'WK_MID', bat: 80, slot: 'finisher' },
  'tom banton': { cat: 'WK_TOP', bat: 80, slot: 'opener' },
  'parthiv patel': { cat: 'WK_TOP', bat: 79, slot: 'opener' },

  'sam billings': { cat: 'WK_MID', bat: 78, slot: 'finisher' },
  'matthew wade': { cat: 'WK_TOP', bat: 78, slot: 'opener' },
  'abishek porel': { cat: 'WK_MID', bat: 76, slot: 'top_middle' },
  'robin minz': { cat: 'WK_TOP', bat: 74, slot: 'opener' },
  'finn allen': { cat: 'WK_TOP', bat: 74, slot: 'opener' },
  'donovan ferreira': { cat: 'WK_MID', bat: 74, slot: 'finisher' },
  'tejasvi singh': { cat: 'WK_MID', bat: 74, slot: 'finisher' },
  'urvil patel': { cat: 'WK_TOP', bat: 73, slot: 'opener' },
  'salil arora': { cat: 'WK_MID', bat: 73, slot: 'finisher' },
  'kumar kushagra': { cat: 'WK_MID', bat: 72, slot: 'finisher' },
  'mukul choudhary': { cat: 'WK_MID', bat: 72, slot: 'finisher' },
  'baba indrajith': { cat: 'WK_MID', bat: 72, slot: 'top_middle' },
  'kartik sharma': { cat: 'WK_TOP', bat: 71, slot: 'opener' },
  'anuj rawat': { cat: 'WK_MID', bat: 71, slot: 'finisher' },
  'narayan jagadeesan': { cat: 'WK_TOP', bat: 70, slot: 'opener' },
  'vishnu vinod': { cat: 'WK_MID', bat: 70, slot: 'finisher' },
  'brijesh sharma': { cat: 'WK_MID', bat: 70, slot: 'finisher' },
  'ks bharat': { cat: 'WK_MID', bat: 69, slot: 'top_middle' },
  'sheldon jackson': { cat: 'WK_TOP', bat: 68, slot: 'opener' },

  // === 5. SPECIALIST BATTERS (95) ===
  'virat kohli': { cat: 'BAT', bat: 99, slot: 'opener' },
  'ab de villiers': { cat: 'BAT', bat: 99, slot: 'top_middle' },
  'suryakumar yadav': { cat: 'BAT', bat: 98, slot: 'top_middle' },
  'david warner': { cat: 'BAT', bat: 98, slot: 'opener' },
  'chris gayle': { cat: 'BAT', bat: 97, slot: 'opener' },
  'shubman gill': { cat: 'BAT', bat: 95, slot: 'opener' },
  'yashasvi jaiswal': { cat: 'BAT', bat: 95, slot: 'opener' },
  'travis head': { cat: 'BAT', bat: 95, slot: 'opener' },
  'faf du plessis': { cat: 'BAT', bat: 94, slot: 'opener' },
  'shreyas iyer': { cat: 'BAT', bat: 94, slot: 'top_middle' },
  'kane williamson': { cat: 'BAT', bat: 93, slot: 'top_middle' },
  'david miller': { cat: 'BAT', bat: 92, slot: 'finisher' },
  'kieron pollard': { cat: 'BAT', bat: 92, slot: 'finisher' },
  'martin guptill': { cat: 'BAT', bat: 90, slot: 'opener' },

  'ruturaj gaikwad': { cat: 'BAT', bat: 89, slot: 'opener' },
  'sai sudharsan': { cat: 'BAT', bat: 89, slot: 'opener' },
  'rajat patidar': { cat: 'BAT', bat: 89, slot: 'top_middle' },
  'virender sehwag': { cat: 'BAT', bat: 89, slot: 'opener' },
  'rinku singh': { cat: 'BAT', bat: 88, slot: 'finisher' },
  'suresh raina': { cat: 'BAT', bat: 88, slot: 'top_middle' },
  'gautam gambhir': { cat: 'BAT', bat: 88, slot: 'opener' },
  'rohit sharma': { cat: 'BAT', bat: 87, slot: 'opener' },
  'tilak varma': { cat: 'BAT', bat: 87, slot: 'top_middle' },
  'shimron hetmyer': { cat: 'BAT', bat: 86, slot: 'finisher' },
  'shikhar dhawan': { cat: 'BAT', bat: 86, slot: 'opener' },
  'steve smith': { cat: 'BAT', bat: 86, slot: 'top_middle' },
  'ambati rayudu': { cat: 'BAT', bat: 86, slot: 'top_middle' },
  'brendan mccullum': { cat: 'BAT', bat: 86, slot: 'opener' },
  'tim david': { cat: 'BAT', bat: 85, slot: 'finisher' },
  'pathum nissanka': { cat: 'BAT', bat: 85, slot: 'opener' },
  'rovman powell': { cat: 'BAT', bat: 84, slot: 'finisher' },
  'jake fraser-mcgurk': { cat: 'BAT', bat: 84, slot: 'opener' },
  'sherfane rutherford': { cat: 'BAT', bat: 84, slot: 'finisher' },
  'harry brook': { cat: 'BAT', bat: 84, slot: 'top_middle' },
  'devdutt padikkal': { cat: 'BAT', bat: 83, slot: 'opener' },
  'nitish rana': { cat: 'BAT', bat: 83, slot: 'top_middle' },
  'ajinkya rahane': { cat: 'BAT', bat: 83, slot: 'opener' },
  'aiden markram': { cat: 'BAT', bat: 83, slot: 'top_middle' },
  'eoin morgan': { cat: 'BAT', bat: 83, slot: 'finisher' },
  'aaron finch': { cat: 'BAT', bat: 83, slot: 'opener' },
  'rahul tripathi': { cat: 'BAT', bat: 82, slot: 'top_middle' },
  'dewald brevis': { cat: 'BAT', bat: 82, slot: 'top_middle' },
  'shahrukh khan': { cat: 'BAT', bat: 82, slot: 'finisher' },
  'rahul tewatia': { cat: 'BAT', bat: 82, slot: 'finisher' },
  'mayank agarwal': { cat: 'BAT', bat: 81, slot: 'opener' },
  'manish pandey': { cat: 'BAT', bat: 81, slot: 'top_middle' },
  'jason roy': { cat: 'BAT', bat: 81, slot: 'opener' },
  'prithvi shaw': { cat: 'BAT', bat: 80, slot: 'opener' },

  'nehal wadhera': { cat: 'BAT', bat: 78, slot: 'top_middle' },
  'shashank singh': { cat: 'BAT', bat: 78, slot: 'finisher' },
  'ashutosh sharma': { cat: 'BAT', bat: 78, slot: 'finisher' },
  'angkrish raghuvanshi': { cat: 'BAT', bat: 77, slot: 'opener' },
  'priyansh arya': { cat: 'BAT', bat: 77, slot: 'opener' },
  'vaibhav sooryavanshi': { cat: 'BAT', bat: 76, slot: 'opener' },
  'ayush badoni': { cat: 'BAT', bat: 76, slot: 'finisher' },
  'mahipal lomror': { cat: 'BAT', bat: 76, slot: 'top_middle' },
  'deepak hooda': { cat: 'BAT', bat: 76, slot: 'top_middle' },
  'abhinav manohar': { cat: 'BAT', bat: 76, slot: 'finisher' },
  'abdul samad': { cat: 'BAT', bat: 75, slot: 'finisher' },
  'musheer khan': { cat: 'BAT', bat: 75, slot: 'top_middle' },
  'atharva taide': { cat: 'BAT', bat: 75, slot: 'opener' },
  'manan vohra': { cat: 'BAT', bat: 75, slot: 'opener' },
  'mandeep singh': { cat: 'BAT', bat: 75, slot: 'top_middle' },
  'saurabh tiwary': { cat: 'BAT', bat: 75, slot: 'top_middle' },
  'ayush mhatre': { cat: 'BAT', bat: 74, slot: 'opener' },
  'pyla avinash': { cat: 'BAT', bat: 74, slot: 'opener' },
  'swastik chikara': { cat: 'BAT', bat: 74, slot: 'opener' },
  'anmolpreet singh': { cat: 'BAT', bat: 74, slot: 'opener' },
  'cheteshwar pujara': { cat: 'BAT', bat: 74, slot: 'top_middle' },
  'hanuma vihari': { cat: 'BAT', bat: 74, slot: 'top_middle' },
  'karun nair': { cat: 'BAT', bat: 74, slot: 'top_middle' },
  'yusuf pathan': { cat: 'BAT', bat: 79, slot: 'finisher' },
  'jp duminy': { cat: 'BAT', bat: 79, slot: 'top_middle' },
  'kedar jadhav': { cat: 'BAT', bat: 75, slot: 'finisher' },
  'sameer rizvi': { cat: 'BAT', bat: 73, slot: 'finisher' },
  'aniket verma': { cat: 'BAT', bat: 73, slot: 'finisher' },
  'harnoor pannu': { cat: 'BAT', bat: 73, slot: 'opener' },
  'himmat singh': { cat: 'BAT', bat: 73, slot: 'top_middle' },
  'akshat raghuwanshi': { cat: 'BAT', bat: 73, slot: 'top_middle' },
  'danish malewar': { cat: 'BAT', bat: 73, slot: 'top_middle' },
  'gurkeerat singh mann': { cat: 'BAT', bat: 73, slot: 'finisher' },
  'ripal patel': { cat: 'BAT', bat: 73, slot: 'finisher' },
  'priyam garg': { cat: 'BAT', bat: 73, slot: 'top_middle' },
  'yash dhull': { cat: 'BAT', bat: 73, slot: 'opener' },
  'shaik rasheed': { cat: 'BAT', bat: 73, slot: 'opener' },
  'sarfaraz khan': { cat: 'BAT', bat: 72, slot: 'top_middle' },
  'sahil parakh': { cat: 'BAT', bat: 72, slot: 'opener' },
  'ravi singh': { cat: 'BAT', bat: 72, slot: 'top_middle' },
  'sachin baby': { cat: 'BAT', bat: 72, slot: 'top_middle' },
  'virat singh': { cat: 'BAT', bat: 72, slot: 'top_middle' },
  'andre siddarth': { cat: 'BAT', bat: 72, slot: 'top_middle' },
  'vansh bedi': { cat: 'BAT', bat: 72, slot: 'finisher' },
  'smaran ravichandaran': { cat: 'BAT', bat: 71, slot: 'top_middle' },
  'satvik deswal': { cat: 'BAT', bat: 71, slot: 'top_middle' },
  'shubham dubey': { cat: 'BAT', bat: 70, slot: 'finisher' },
};

function getSpinTierFromRating(spinScore: number): SpinTier {
  if (spinScore >= 90) return 'elite';
  if (spinScore >= 74) return 'frontline';
  if (spinScore >= 52) return 'part_time';
  return 'none';
}

export function derivePlayerDNA(player: Player): PlayerTacticalDNA {
  const nameLower = player.name.trim().toLowerCase();
  const calibrated = PLAYER_RATINGS_350[nameLower];
  const isMarquee = (player.basePrice || 0.5) >= 2.0;
  const isPremium = (player.basePrice || 0.5) >= 1.5;
  const isMidTier = (player.basePrice || 0.5) >= 1.0;
  const isCapped = player.cappedStatus !== 'Uncapped';
  const tierBonus = isMarquee ? 18 : isPremium ? 13 : isMidTier ? 7 : isCapped ? 3 : 0;
  const nameSeed = player.name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 5;
  const leadership = isMarquee ? 90 + (nameSeed % 5) : isPremium ? 82 + (nameSeed % 5) : 70 + (nameSeed % 5);

  if (calibrated) {
    if (calibrated.cat === 'PACE') {
      const rating = calibrated.ball ?? 78;
      const isDeath = Boolean(calibrated.deathBias);
      const ppBowl = isDeath ? Math.max(70, rating - 4) : rating;
      const deathBowl = isDeath ? rating : Math.max(70, rating - 4);
      const variations = Math.min(99, rating - (isDeath ? 0 : 3));

      return {
        power: 24 + (nameSeed % 6),
        stability: 22 + (nameSeed % 5),
        ppBowl,
        deathBowl,
        variations,
        spinControl: 0,
        fielding: Math.min(94, 72 + Math.round((rating - 65) * 0.5)),
        versatility: Math.min(95, 70 + Math.round((rating - 65) * 0.5)),
        leadership,
        isGenuineBowler: true,
        isGenuineSpinner: false,
        spinTier: 'none',
        isMiddleOrderWk: false,
        preferredSlot: 'tailender',
        tag:
          rating >= 92
            ? isDeath
              ? `Tier 1 Elite Death Pacer (${rating}/100 · Overs 16–20)`
              : `Tier 1 Elite Strike Pacer (${rating}/100 · Overs 1–4)`
            : rating >= 78
            ? `Tier 2 Frontline Pacer (${rating}/100 · Tail #8–#11)`
            : `Tier 3 Impact Pacer (${rating}/100 · Tail #8–#11)`,
      };
    }

    if (calibrated.cat === 'SPIN') {
      const rating = calibrated.ball ?? 78;
      const spinTier = getSpinTierFromRating(rating);
      return {
        power: 24 + (nameSeed % 5),
        stability: 22 + (nameSeed % 5),
        ppBowl: rating >= 92 ? 72 : 48,
        deathBowl: rating >= 92 ? 74 : 52,
        variations: Math.min(99, rating),
        spinControl: rating,
        fielding: Math.min(94, 74 + Math.round((rating - 70) * 0.5)),
        versatility: Math.min(95, 72 + Math.round((rating - 70) * 0.5)),
        leadership,
        isGenuineBowler: true,
        isGenuineSpinner: true,
        spinTier,
        isMiddleOrderWk: false,
        preferredSlot: 'tailender',
        tag:
          spinTier === 'elite'
            ? `Tier 1 Elite Spinner (${rating}/100 · All Phases)`
            : spinTier === 'frontline'
            ? `Tier 2 Frontline Spinner (${rating}/100 · Overs 7–15)`
            : `Tier 3 Utility Spinner (${rating}/100 · Tail #8–#11)`,
      };
    }

    if (calibrated.cat === 'AR_SPIN') {
      const batRating = calibrated.bat ?? 80;
      const ballRating = calibrated.ball ?? 75;
      const spinTier = getSpinTierFromRating(ballRating);
      const slot = calibrated.slot ?? 'finisher';
      return {
        power: batRating,
        stability: Math.max(70, batRating - 4),
        ppBowl: ballRating >= 90 ? 70 : ballRating >= 75 ? 54 : 35,
        deathBowl: ballRating >= 90 ? 66 : ballRating >= 75 ? 44 : 25,
        variations: ballRating,
        spinControl: ballRating,
        fielding: Math.min(98, 84 + (nameSeed % 6)),
        versatility: Math.min(99, Math.round((batRating + ballRating) / 2) + 4),
        leadership,
        isGenuineBowler: ballRating >= 74,
        isGenuineSpinner: true,
        spinTier,
        isMiddleOrderWk: false,
        preferredSlot: slot,
        tag:
          spinTier === 'elite'
            ? `Elite Spin AR (Bat ${batRating} / Spin ${ballRating} · 4-Over Banker)`
            : spinTier === 'frontline'
            ? `Frontline Spin AR (Bat ${batRating} / Spin ${ballRating} · 2–4 Overs)`
            : `Batter + Part-Time Spin (Bat ${batRating} / Spin ${ballRating} · 6th Bowler)`,
      };
    }

    if (calibrated.cat === 'AR_PACE') {
      const batRating = calibrated.bat ?? 80;
      const ballRating = calibrated.ball ?? 75;
      const slot = calibrated.slot ?? 'finisher';
      return {
        power: batRating,
        stability: Math.max(68, batRating - 5),
        ppBowl: Math.max(64, ballRating - 2),
        deathBowl: ballRating,
        variations: ballRating,
        spinControl: 0,
        fielding: Math.min(97, 83 + (nameSeed % 6)),
        versatility: Math.min(99, Math.round((batRating + ballRating) / 2) + 4),
        leadership,
        isGenuineBowler: ballRating >= 74,
        isGenuineSpinner: false,
        spinTier: 'none',
        isMiddleOrderWk: false,
        preferredSlot: slot,
        tag:
          ballRating >= 78
            ? `Frontline Seam AR (Bat ${batRating} / Pace ${ballRating} · 3–4 Overs)`
            : `Power Seam AR (Bat ${batRating} / Med-Pace ${ballRating} · 6th Bowler)`,
      };
    }

    if (calibrated.cat === 'WK_TOP' || calibrated.cat === 'WK_MID') {
      const batRating = calibrated.bat ?? 84;
      const isMiddle = calibrated.cat === 'WK_MID';
      const slot = calibrated.slot ?? (isMiddle ? 'top_middle' : 'opener');
      return {
        power: batRating,
        stability: isMiddle ? Math.max(72, batRating - 5) : batRating,
        ppBowl: 0,
        deathBowl: 0,
        variations: 0,
        spinControl: 0,
        fielding: Math.min(98, 86 + (nameSeed % 6)),
        versatility: Math.min(96, batRating - 2),
        leadership,
        isGenuineBowler: false,
        isGenuineSpinner: false,
        spinTier: 'none',
        isMiddleOrderWk: isMiddle,
        preferredSlot: slot,
        tag: isMiddle
          ? `Middle-Order WK (${batRating}/100 · Ideal #3–#6)`
          : `Top-Order WK (${batRating}/100 · Ideal #1–#3)`,
      };
    }

    if (calibrated.cat === 'BAT') {
      const batRating = calibrated.bat ?? 82;
      const slot = calibrated.slot ?? 'top_middle';
      return {
        power: slot === 'finisher' ? batRating : Math.max(72, batRating - 2),
        stability: slot === 'opener' ? batRating : Math.max(70, batRating - 4),
        ppBowl: 0,
        deathBowl: 0,
        variations: 0,
        spinControl: 0,
        fielding: Math.min(97, 82 + (nameSeed % 6)),
        versatility: Math.min(95, batRating - 3),
        leadership,
        isGenuineBowler: false,
        isGenuineSpinner: false,
        spinTier: 'none',
        isMiddleOrderWk: false,
        preferredSlot: slot,
        tag:
          slot === 'opener'
            ? `Top-Order Batter (${batRating}/100 · Ideal #1–#3)`
            : slot === 'finisher'
            ? `Death-Over Finisher (${batRating}/100 · Ideal #5–#7)`
            : `Middle-Over Enforcer (${batRating}/100 · Ideal #3–#5)`,
      };
    }
  }

  // Fallback for any custom user-added player not in the 350-player list
  const bowlStyle = (player.bowlingStyle || '').toLowerCase();
  const isSpinStyle =
    bowlStyle.includes('spin') ||
    bowlStyle.includes('orthodox') ||
    bowlStyle.includes('offbreak') ||
    bowlStyle.includes('legbreak');

  if (player.role === 'BOWL') {
    const baseRating = Math.min(90, 72 + tierBonus);
    const spinTier: SpinTier = isSpinStyle ? 'frontline' : 'none';
    return {
      power: 24,
      stability: 22,
      ppBowl: isSpinStyle ? 48 : baseRating,
      deathBowl: isSpinStyle ? 52 : baseRating,
      variations: baseRating,
      spinControl: isSpinStyle ? baseRating : 0,
      fielding: 76,
      versatility: 74,
      leadership,
      isGenuineBowler: true,
      isGenuineSpinner: isSpinStyle,
      spinTier,
      isMiddleOrderWk: false,
      preferredSlot: 'tailender',
      tag: isSpinStyle ? `Frontline Spinner (${baseRating}/100)` : `Frontline Pacer (${baseRating}/100)`,
    };
  }

  if (player.role === 'AR') {
    const baseRating = Math.min(88, 74 + tierBonus);
    const spinTier: SpinTier = isSpinStyle ? 'frontline' : 'none';
    return {
      power: baseRating,
      stability: baseRating - 4,
      ppBowl: isSpinStyle ? 50 : baseRating - 4,
      deathBowl: isSpinStyle ? 44 : baseRating - 4,
      variations: baseRating - 4,
      spinControl: isSpinStyle ? baseRating - 2 : 0,
      fielding: 82,
      versatility: baseRating,
      leadership,
      isGenuineBowler: true,
      isGenuineSpinner: isSpinStyle,
      spinTier,
      isMiddleOrderWk: false,
      preferredSlot: 'finisher',
      tag: isSpinStyle ? `Spin All-Rounder (${baseRating}/100)` : `Seam All-Rounder (${baseRating}/100)`,
    };
  }

  const batRating = Math.min(90, 75 + tierBonus);
  return {
    power: batRating,
    stability: batRating,
    ppBowl: 0,
    deathBowl: 0,
    variations: 0,
    spinControl: 0,
    fielding: 82,
    versatility: 78,
    leadership,
    isGenuineBowler: false,
    isGenuineSpinner: false,
    spinTier: 'none',
    isMiddleOrderWk: false,
    preferredSlot: player.role === 'WK' ? 'opener' : 'top_middle',
    tag: player.role === 'WK' ? `Top-Order WK (${batRating}/100)` : `Top/Middle Batter (${batRating}/100)`,
  };
}

export function evaluateBattingSlotFit(
  player: Player,
  dna: PlayerTacticalDNA,
  slotIndex1Based: number,
  playingCount: number
): { fitScore: number; efficiencyMultiplier: number; note?: string } {
  const ratio = slotIndex1Based / Math.max(1, playingCount);

  if (dna.preferredSlot === 'tailender') {
    if (ratio <= 0.55) {
      return {
        fitScore: -0.45,
        efficiencyMultiplier: 0.45,
        note: `Batting Order Misalignment: Specialist bowler ${player.name} is placed far too high at #${slotIndex1Based}, exposing the top/middle order to new-ball wickets.`,
      };
    }
    return { fitScore: 0.05, efficiencyMultiplier: 1.0 };
  }

  if (dna.preferredSlot === 'opener') {
    if (ratio <= 0.32) {
      return {
        fitScore: 0.16,
        efficiencyMultiplier: 1.18,
        note: `Optimal Top-Order Deployment: ${player.name} at #${slotIndex1Based} (Stability ${dna.stability}/100) maximizes Powerplay fielding restrictions and high-volume Orange Cap scoring.`,
      };
    }
    if (ratio > 0.6) {
      return {
        fitScore: -0.25,
        efficiencyMultiplier: 0.68,
        note: `Underutilized Top-Order Batter: Natural opener ${player.name} (ideal #1–#3) is buried down at #${slotIndex1Based}, wasting their best Powerplay scoring window.`,
      };
    }
    return { fitScore: 0.06, efficiencyMultiplier: 0.96 };
  }

  if (dna.preferredSlot === 'top_middle') {
    if (ratio >= 0.22 && ratio <= 0.56) {
      return {
        fitScore: 0.16,
        efficiencyMultiplier: 1.12,
        note: `Ideal Middle-Overs Engine: ${player.name} at #${slotIndex1Based} (Power ${dna.power}/100) stabilizes collapses and dominates spin/pace transitions in overs 7–15.`,
      };
    }
    if (ratio > 0.6) {
      return {
        fitScore: -0.22,
        efficiencyMultiplier: 0.72,
        note: `Late Entry Penalty: ${player.name} (ideal #3–#5) is pushed down to #${slotIndex1Based}, leaving too few balls for a premier middle-order enforcer.`,
      };
    }
    return { fitScore: 0.05, efficiencyMultiplier: 0.95 };
  }

  if (ratio >= 0.42 && ratio <= 0.82) {
    return {
      fitScore: 0.16,
      efficiencyMultiplier: 1.15,
      note: `Prime Death-Over Finishing Slot: ${player.name} at #${slotIndex1Based} (Power ${dna.power}/100) provides elite boundary acceleration in overs 16–20.`,
    };
  }
  if (ratio <= 0.2) {
    return {
      fitScore: -0.08,
      efficiencyMultiplier: 0.88,
      note: `Pinch-Hitter Risk: Lower-order finisher ${player.name} opening at #${slotIndex1Based} boosts early boundary upside but carries high early-wicket risk.`,
    };
  }
  return { fitScore: 0.05, efficiencyMultiplier: 0.95 };
}

export function computeEnvironmentModifiers(conditions: PitchConditionTag[]) {
  const active = conditions.length > 0 ? conditions : (['balanced'] as PitchConditionTag[]);
  let runEnvShift = 0;
  let spinWeight = 1.0;
  let paceBounceWeight = 1.0;
  let powerWeight = 1.0;
  let stabilityFieldingWeight = 1.0;
  let deathWeight = 1.0;

  if (active.includes('spin')) {
    runEnvShift -= 12;
    spinWeight += 0.4;
  }
  if (active.includes('flat')) {
    runEnvShift += 16;
    powerWeight += 0.3;
  }
  if (active.includes('bounce')) {
    runEnvShift -= 6;
    paceBounceWeight += 0.35;
  }
  if (active.includes('swing')) {
    runEnvShift -= 9;
    paceBounceWeight += 0.38;
  }
  if (active.includes('dew')) {
    runEnvShift += 13;
    spinWeight -= 0.25;
    deathWeight += 0.35;
  }
  if (active.includes('slow_pitch')) {
    runEnvShift -= 10;
    stabilityFieldingWeight += 0.3;
    deathWeight += 0.25;
  }
  if (active.includes('large_ground')) {
    runEnvShift -= 10;
    spinWeight += 0.22;
    stabilityFieldingWeight += 0.28;
  }
  if (active.includes('small_ground')) {
    runEnvShift += 14;
    powerWeight += 0.28;
  }
  if (active.includes('high_altitude')) {
    runEnvShift += 11;
    powerWeight += 0.22;
  }

  return {
    active,
    runEnvShift,
    spinWeight,
    paceBounceWeight,
    powerWeight,
    stabilityFieldingWeight,
    deathWeight,
  };
}

export function evaluateAiBotBid(
  botTeam: Team,
  player: Player,
  nextBidAmount: number,
  minSquad: number,
  maxSquad: number,
  conditions: PitchConditionTag[] = ['balanced']
): boolean {
  const roster = botTeam.players || [];
  if (roster.length >= maxSquad) return false;

  const maxAllowed = calculateMaxBid(botTeam, maxSquad, 0.2);
  if (nextBidAmount > maxAllowed || nextBidAmount > botTeam.purse) return false;

  const dna = derivePlayerDNA(player);
  const roleCount = roster.filter((p) => p.role === player.role).length;
  const wkCount = roster.filter((p) => p.role === 'WK').length;

  let valuation = (player.basePrice || 0.5) * 2.2;
  if (dna.spinTier === 'elite' || dna.power >= 92 || dna.deathBowl >= 92) valuation += 3.2;
  if (player.role === 'WK' && wkCount === 0) valuation += 3.0;
  if (roleCount === 0) valuation += 2.0;
  if (roster.length < minSquad) valuation += 1.2;

  if (conditions.includes('spin') && dna.spinTier === 'elite') valuation += 2.2;
  if ((conditions.includes('bounce') || conditions.includes('swing')) && dna.ppBowl >= 84) valuation += 1.8;
  if ((conditions.includes('flat') || conditions.includes('small_ground')) && dna.power >= 90) valuation += 1.8;

  const slotsNeeded = Math.max(1, minSquad - roster.length);
  const budgetPerSlot = botTeam.purse / slotsNeeded;
  const ceiling = Math.min(maxAllowed, Math.max(player.basePrice || 0.5, Math.min(valuation, budgetPerSlot * 1.45)));

  return nextBidAmount <= ceiling;
}

export async function generateMasterScoutReport(
  teams: Team[],
  lineups: Record<string, TeamLineupConfig>,
  minSquad: number = 11,
  conditions: PitchConditionTag[] = ['balanced']
): Promise<MasterScoutReport> {
  const { playingCount, minBowlers, sixthBowlerTarget } = getDynamicRoleRequirements(minSquad);
  const env = computeEnvironmentModifiers(conditions);

  const rawRankings: TeamScoutRanking[] = teams.map((team) => {
    const players = Array.isArray(team.players) ? team.players : [];
    const savedLineup = lineups[team.id];

    const orderedPlayingXI: Player[] = [];
    if (savedLineup?.playingIds?.length > 0) {
      savedLineup.playingIds.slice(0, playingCount).forEach((pid) => {
        const found = players.find((p) => p.id === pid);
        if (found) orderedPlayingXI.push(found);
      });
    }
    if (orderedPlayingXI.length === 0) {
      orderedPlayingXI.push(...players.slice(0, playingCount));
    }

    const playingIdSet = new Set(orderedPlayingXI.map((p) => p.id));
    const impactPlayer = savedLineup?.impactPlayerId
      ? players.find((p) => p.id === savedLineup.impactPlayerId && !playingIdSet.has(p.id))
      : undefined;

    const bench = players.filter((p) => !playingIdSet.has(p.id) && p.id !== impactPlayer?.id);
    const effectiveSquad = impactPlayer ? [...orderedPlayingXI, impactPlayer] : orderedPlayingXI;

    const dnas = effectiveSquad.map((p, idx) => {
      const dna = derivePlayerDNA(p);
      const slotNum = idx + 1;
      const slotEval =
        idx < orderedPlayingXI.length
          ? evaluateBattingSlotFit(p, dna, slotNum, playingCount)
          : { fitScore: 0.15, efficiencyMultiplier: 1.05 };

      return {
        player: p,
        dna,
        slotNum,
        slotEval,
        isCaptain: savedLineup?.captainId === p.id,
        isViceCaptain: savedLineup?.viceCaptainId === p.id,
        isImpact: impactPlayer?.id === p.id,
        isLongTerm: savedLineup?.contractTypes?.[p.id] === '3yr',
      };
    });

    const batters = dnas.filter((d) => ['BAT', 'WK', 'AR'].includes(d.player.role));
    const avgPower =
      batters.length > 0 ? batters.reduce((sum, d) => sum + d.dna.power, 0) / batters.length : 55;
    const avgStability =
      batters.length > 0 ? batters.reduce((sum, d) => sum + d.dna.stability, 0) / batters.length : 55;

    const topN = Math.min(3, Math.max(2, Math.floor(playingCount / 3)));
    const sortedDeath = [...dnas].sort((a, b) => b.dna.deathBowl - a.dna.deathBowl);
    const deathOverRating = sortedDeath.slice(0, topN).reduce((sum, d) => sum + d.dna.deathBowl, 0) / topN;

    const sortedPP = [...dnas].sort((a, b) => b.dna.ppBowl - a.dna.ppBowl);
    const ppOverRating = sortedPP.slice(0, topN).reduce((sum, d) => sum + d.dna.ppBowl, 0) / topN;

    // 3-TIER SPINNER SEPARATION
    const eliteSpinners = dnas.filter((d) => d.dna.spinTier === 'elite');
    const frontlineSpinners = dnas.filter((d) => d.dna.spinTier === 'frontline');
    const partTimeSpinners = dnas.filter((d) => d.dna.spinTier === 'part_time');
    const allXiSpinners = [...eliteSpinners, ...frontlineSpinners, ...partTimeSpinners];

    const sortedSpin = [...allXiSpinners].sort((a, b) => b.dna.spinControl - a.dna.spinControl);
    const spinRating =
      sortedSpin.length > 0
        ? sortedSpin.slice(0, 2).reduce((sum, d) => sum + d.dna.spinControl, 0) / Math.min(2, sortedSpin.length)
        : 0;

    // Role & Position Counters
    const totalWks = dnas.filter((d) => d.player.role === 'WK').length;
    const middleOrderWks = dnas.filter((d) => d.player.role === 'WK' && d.dna.isMiddleOrderWk).length;
    const paceBowlers = dnas.filter((d) => d.dna.isGenuineBowler && !d.dna.isGenuineSpinner).length;

    const avgVariations =
      dnas.length > 0 ? dnas.reduce((sum, d) => sum + d.dna.variations, 0) / dnas.length : 50;
    const avgFielding =
      dnas.length > 0 ? dnas.reduce((sum, d) => sum + d.dna.fielding, 0) / dnas.length : 70;
    const avgVersatility =
      dnas.length > 0 ? dnas.reduce((sum, d) => sum + d.dna.versatility, 0) / dnas.length : 70;

    const rawOrderDelta = dnas.reduce((sum, d) => sum + d.slotEval.fitScore, 0);
    const clampedOrderDelta = Math.max(-1.4, Math.min(0.85, rawOrderDelta));
    const battingOrderScore = Math.min(99, Math.max(40, Math.round(74 + clampedOrderDelta * 24)));

    let spinTierAdjustment = 0;
    if (eliteSpinners.length >= 2) spinTierAdjustment = 0.45;
    else if (eliteSpinners.length === 1) spinTierAdjustment = 0.22;
    else if (frontlineSpinners.length >= 1) spinTierAdjustment = 0.0;
    else if (partTimeSpinners.length >= 1) spinTierAdjustment = -0.45;
    else spinTierAdjustment = env.active.includes('spin') ? -1.45 : -0.9;

    const middleWkBonus = middleOrderWks >= 1 ? 0.18 : 0;

    let multiConditionBonus = 0;
    if (env.active.includes('spin')) multiConditionBonus += ((spinRating - 65) / 100) * 0.45;
    if (env.active.includes('bounce') || env.active.includes('swing')) {
      multiConditionBonus += ((ppOverRating - 65) / 100) * 0.45;
    }
    if (env.active.includes('flat') || env.active.includes('high_altitude')) {
      multiConditionBonus += ((avgPower - 70) / 100) * 0.45;
    }
    if (env.active.includes('small_ground')) multiConditionBonus += ((avgPower - 72) / 100) * 0.35;
    if (env.active.includes('dew') || env.active.includes('slow_pitch')) {
      multiConditionBonus += ((deathOverRating - 72) / 100) * 0.35;
    }
    if (env.active.includes('large_ground')) {
      multiConditionBonus += (((avgStability + avgFielding + spinRating) / 3 - 68) / 100) * 0.45;
    }

    const captainEntry = dnas.find((d) => d.isCaptain);
    const vcEntry = dnas.find((d) => d.isViceCaptain);
    const leadershipBonus =
      (captainEntry ? (captainEntry.dna.leadership / 100) * 0.25 : 0) +
      (vcEntry ? (vcEntry.dna.leadership / 100) * 0.14 : 0);

    const impactBonus = impactPlayer ? 0.28 : 0;
    const longTermCount = dnas.filter((d) => d.isLongTerm).length;
    const dynastyBonus = Math.min(0.24, longTermCount * 0.04);
    const purseEfficiencyBonus = Math.min(0.22, (team.purse || 0) * 0.015);

    const genuineBowlers = dnas.filter((d) => d.dna.isGenuineBowler);
    const hasExtraBowler = genuineBowlers.length >= sixthBowlerTarget;
    const hasWK = totalWks >= 1;

    // Bench & Tournament Rotation Audit (Deep Match-to-Match Assessment)
    const benchDnas = bench.map((b) => ({ player: b, dna: derivePlayerDNA(b) }));
    const benchSpecialistSpinners = benchDnas.filter(
      (b) => b.dna.spinTier === 'elite' || b.dna.spinTier === 'frontline'
    );
    const benchPacers = benchDnas.filter((b) => b.dna.isGenuineBowler && !b.dna.isGenuineSpinner);
    const benchBatters = benchDnas.filter((b) => ['BAT', 'WK', 'AR'].includes(b.player.role));
    const benchPlayersList = benchDnas.map(
      (b) => `[${b.player.role}] ${b.player.name} — ${b.dna.tag}`
    );

    const hasFrontlineXiSpin = eliteSpinners.length + frontlineSpinners.length > 0;
    const weakestXiPacer = [...dnas]
      .filter((d) => d.dna.isGenuineBowler && !d.dna.isGenuineSpinner)
      .sort((a, b) => a.dna.deathBowl - b.dna.deathBowl)[0];

    let benchReplacementVerdict = '';
    if (bench.length === 0) {
      benchReplacementVerdict =
        'CRITICAL TOURNAMENT RISK (0 Bench Reserves): You have zero players on the bench. Across a multi-venue league, any injury, form slump, or sudden shift to a turning pitch leaves you with no tactical substitution.';
    } else if (!hasFrontlineXiSpin && benchSpecialistSpinners.length > 0) {
      benchReplacementVerdict = `IMMEDIATE BENCH UPGRADE AVAILABLE: Your Starting XI lacks a specialist spinner, leaving overs 7–15 exposed. You can rotate ${benchSpecialistSpinners
        .map((s) => `${s.player.name} (${s.dna.spinControl}/100 Spin)`)
        .join(' or ')} from the bench${
        weakestXiPacer ? ` in place of ${weakestXiPacer.player.name}` : ''
      } on dry or gripping wickets.`;
    } else if (!hasFrontlineXiSpin && benchSpecialistSpinners.length === 0) {
      benchReplacementVerdict = `NO SPECIALIST SPIN BACKUP IN SQUAD: Neither your Starting XI nor your ${bench.length} bench reserve(s) (${bench
        .map((b) => b.name)
        .join(', ')}) includes a Tier 1 or Tier 2 spinner. Expect higher runs conceded during middle overs on slow/turning surfaces.`;
    } else {
      const assets: string[] = [];
      if (benchSpecialistSpinners.length > 0)
        assets.push(
          `${benchSpecialistSpinners.length} Spinner (${benchSpecialistSpinners
            .map((s) => `${s.player.name} ${s.dna.spinControl}`)
            .join(', ')})`
        );
      if (benchPacers.length > 0)
        assets.push(
          `${benchPacers.length} Pacer (${benchPacers.map((p) => `${p.player.name} ${p.dna.deathBowl}`).join(', ')})`
        );
      if (benchBatters.length > 0)
        assets.push(
          `${benchBatters.length} Batter/WK (${benchBatters.map((b) => b.player.name).join(', ')})`
        );
      benchReplacementVerdict = `TOURNAMENT ROTATION READY (${bench.length} Reserves): Strong multi-pitch flexibility with ${assets.join(
        ' · '
      )} ready to rotate in based on venue conditions or injury cover.`;
    }

    const battingStrengthFactor =
      (avgPower * env.powerWeight * 0.55 + avgStability * env.stabilityFieldingWeight * 0.45) / 100;
    const orderRunsShift = clampedOrderDelta * 11;
    const avgBattingScore = Math.max(
      125,
      Math.min(238, Math.round(138 + battingStrengthFactor * 48 + env.runEnvShift + orderRunsShift))
    );
    const avgBattingWickets = Math.max(
      3,
      Math.min(playingCount - 1, Math.round(playingCount - 2 - (avgStability / 100) * 3.2))
    );

    const bowlingControlFactor =
      (deathOverRating * env.deathWeight * 0.36 +
        ppOverRating * env.paceBounceWeight * 0.26 +
        spinRating * env.spinWeight * 0.24 +
        avgVariations * 0.14) /
      100;
    const bowlerShortagePenalty = genuineBowlers.length < minBowlers ? (minBowlers - genuineBowlers.length) * 14 : 0;
    const spinDeficitRuns = eliteSpinners.length > 0 ? 0 : frontlineSpinners.length > 0 ? 5 : 13;
    const avgBowlingConceded = Math.max(
      122,
      Math.min(235, Math.round(206 - bowlingControlFactor * 46 + env.runEnvShift + bowlerShortagePenalty + spinDeficitRuns))
    );
    const avgBowlingWickets = Math.max(
      3,
      Math.min(playingCount - 1, Math.round(4 + bowlingControlFactor * 4.5))
    );
    const netRunDifferential = avgBattingScore - avgBowlingConceded;

    let rawScore =
      (avgPower * 0.23 +
        avgStability * 0.18 +
        deathOverRating * 0.2 +
        ppOverRating * 0.12 +
        spinRating * 0.12 +
        avgVariations * 0.06 +
        avgFielding * 0.04 +
        avgVersatility * 0.05) /
        10 +
      clampedOrderDelta +
      spinTierAdjustment +
      middleWkBonus +
      multiConditionBonus +
      leadershipBonus +
      impactBonus +
      dynastyBonus +
      purseEfficiencyBonus;

    if (!hasWK) rawScore -= 1.2;
    if (genuineBowlers.length < minBowlers) rawScore -= 1.35;
    if (hasExtraBowler) rawScore += 0.35;

    let benchPenaltyNote: string | undefined;
    if (bench.length === 0) {
      rawScore -= 1.5;
      benchPenaltyNote = 'Zero bench reserves (-1.50 pts): No injury or pitch-rotation backup beyond Starting Lineup.';
    } else if (!hasFrontlineXiSpin && benchSpecialistSpinners.length === 0) {
      rawScore -= 0.35;
      benchPenaltyNote = 'Incomplete Squad Depth (-0.35 pts): Zero frontline/elite spinners across both Starting XI and Bench.';
    } else {
      rawScore += Math.min(0.4, bench.length * 0.14);
    }

    const dnaFingerprint = dnas.reduce(
      (acc, d, idx) => acc + (d.dna.power * 0.0013 + d.dna.deathBowl * 0.0017 + idx * 0.0007),
      0
    );
    const finalScore = Math.min(9.95, Math.max(3.5, Number((rawScore + (dnaFingerprint % 0.19)).toFixed(2))));

    const pros: string[] = [];
    const cons: string[] = [];
    const archetypeBreakdown = dnas.map((d) => {
      const prefix = d.isImpact ? '[IMPACT SUB]' : `#${d.slotNum}`;
      const badges = [
        d.isCaptain ? '(C)' : '',
        d.isViceCaptain ? '(VC)' : '',
        d.isLongTerm ? '[3-YR]' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `${prefix} ${d.player.name} ${badges} — ${d.dna.tag}`.trim();
    });

    // === DETAILED PROS (Phase-by-Phase Tactical Strengths) ===
    const topOrderBatters = dnas.filter((d) => d.slotNum <= 3 && ['BAT', 'WK', 'AR'].includes(d.player.role));
    if (topOrderBatters.length >= 2) {
      const topPowerAvg = Math.round(
        topOrderBatters.reduce((s, d) => s + d.dna.power, 0) / topOrderBatters.length
      );
      const topStabAvg = Math.round(
        topOrderBatters.reduce((s, d) => s + d.dna.stability, 0) / topOrderBatters.length
      );
      if (topPowerAvg >= 84 || topStabAvg >= 84) {
        pros.push(
          `High-Output Top Order (Overs 1–6): ${topOrderBatters
            .map((b) => `#${b.slotNum} ${b.player.name}`)
            .join(', ')} combine ${topStabAvg}/100 stability with ${topPowerAvg}/100 boundary power to set strong Powerplay platforms.`
        );
      }
    }

    if (eliteSpinners.length > 0) {
      pros.push(
        `Tier 1 Elite Spin Attack (${eliteSpinners.length} World-Class): ${eliteSpinners
          .map((s) => `${s.player.name} (${s.dna.spinControl}/100)`)
          .join(' & ')} give you wicket-taking control and economy under 7.2 RPO during overs 7–15.`
      );
    } else if (frontlineSpinners.length > 0) {
      pros.push(
        `Tier 2 Frontline Spin Control (${frontlineSpinners.length}): ${frontlineSpinners
          .map((s) => `${s.player.name} (${s.dna.spinControl}/100)`)
          .join(', ')} provide reliable middle-over spin overs to prevent pace-only predictability.`
      );
    }

    if (middleOrderWks >= 1) {
      const midWkNames = dnas
        .filter((d) => d.player.role === 'WK' && d.dna.isMiddleOrderWk)
        .map((d) => `${d.player.name} (#${d.slotNum})`)
        .join(', ');
      pros.push(
        `Middle-Order Keeper Advantage (${middleOrderWks} Middle WK): Having ${midWkNames} frees up top-order overseas/domestic slots while maintaining explosive hitting against spin and death pace.`
      );
    }

    if (sortedDeath[0] && sortedDeath[0].dna.deathBowl >= 85) {
      const topTwoDeath = sortedDeath
        .slice(0, 2)
        .map((d) => `${d.player.name} (${d.dna.deathBowl}/100)`)
        .join(' & ');
      pros.push(
        `Death-Over Closing Arsenal (Overs 16–20): ${topTwoDeath} give you elite yorker, slower-ball, and hard-length execution when defending tight totals.`
      );
    }

    if (hasExtraBowler) {
      pros.push(
        `6th-Bowler Tactical Cushion: ${genuineBowlers.length} credible bowling options for a ${playingCount}-player lineup let your captain match up against left/right batters without relying on weak part-timers.`
      );
    }

    dnas.forEach((d) => {
      if (d.slotEval.fitScore >= 0.15 && d.slotEval.note && pros.length < 6) {
        pros.push(d.slotEval.note);
      }
    });

    if (bench.length >= 2) {
      pros.push(
        `Multi-Venue Bench Depth (${bench.length} Reserves): Having ${bench
          .map((b) => b.name)
          .join(', ')} on standby allows seamless tactical swaps across turning, bouncy, or dew-affected pitches.`
      );
    }

    // === DETAILED CONS (Actionable Vulnerabilities & Point Deductions) ===
    if (allXiSpinners.length === 0) {
      cons.push(
        `Zero Spinners in Starting XI (${spinTierAdjustment.toFixed(
          2
        )} pts penalty): A 100% pace/seam attack becomes predictable between overs 7–15, conceding an estimated +13 extra runs per match on dry or gripping surfaces.`
      );
    } else if (eliteSpinners.length === 0 && frontlineSpinners.length === 0 && partTimeSpinners.length > 0) {
      cons.push(
        `Part-Time Spin Reliance Only (${spinTierAdjustment.toFixed(
          2
        )} pts penalty): Relying solely on ${partTimeSpinners
          .map((s) => `${s.player.name} (${s.dna.spinControl}/100)`)
          .join(', ')} without a Tier 1 or Tier 2 specialist spinner exposes your middle overs against aggressive spin hitters.`
      );
    }

    if (middleOrderWks === 0 && totalWks >= 1) {
      cons.push(
        `No Middle-Order Wicketkeeper (0 Middle WKs): All keeping options in your XI are natural top-order openers—forcing a top-order WK down the order reduces their boundary efficiency.`
      );
    }

    if (deathOverRating < 80) {
      cons.push(
        `Death-Over Vulnerability (${Math.round(
          deathOverRating
        )}/100 Rating): Your bowling unit lacks a 90+ death specialist, increasing the risk of leaking 55+ runs in the final 4 overs on flat tracks or in heavy dew.`
      );
    }

    dnas.forEach((d) => {
      if (d.slotEval.fitScore < 0 && d.slotEval.note && cons.length < 6) {
        cons.push(d.slotEval.note);
      }
    });

    if (!hasExtraBowler) {
      cons.push(
        `No 6th Bowling Option: With only ${genuineBowlers.length} genuine bowlers in a ${playingCount}-player XI, a single bowler having an off-day leaves 4 unprotected overs to fill.`
      );
    }

    if (bench.length === 0) {
      cons.push(
        `Empty Bench Reserves (-1.50 pts penalty): Zero backup players drafted—any mid-tournament injury or unfavorable pitch condition leaves you with zero replacement options.`
      );
    } else if (!hasFrontlineXiSpin && benchSpecialistSpinners.length === 0) {
      cons.push(
        `Unbalanced Bench Reserves (-0.35 pts penalty): Your bench (${bench
          .map((b) => b.name)
          .join(', ')}) also lacks a Tier 1/2 spinner, meaning you cannot rotate a specialist spinner in for turning venues.`
      );
    }

    const spinLabel =
      eliteSpinners.length > 0
        ? `${Math.round(spinRating)}/100 · Tier 1 (${eliteSpinners.map((s) => `${s.player.name} ${s.dna.spinControl}`).join(', ')})`
        : frontlineSpinners.length > 0
        ? `${Math.round(spinRating)}/100 · Tier 2 (${frontlineSpinners.map((s) => `${s.player.name} ${s.dna.spinControl}`).join(', ')})`
        : partTimeSpinners.length > 0
        ? `${Math.round(spinRating)}/100 · Tier 3 Part-Time (${partTimeSpinners.map((s) => s.player.name).join(', ')})`
        : '0/100 (⚠️ No Spinner in XI)';

    return {
      teamId: team.id,
      teamName: team.name,
      scoreOutOf10: finalScore,
      verdict:
        finalScore >= 8.5
          ? `Championship Favorite (${playingCount}-Player Format)`
          : finalScore >= 7.5
          ? 'Playoff Contender — Strong Core with Minor Gaps'
          : 'Tactical Rebuild Needed — Exploitable Phase Weaknesses',
      benchPenaltyNote,
      benchStrength:
        bench.length >= 3
          ? `Deep (${bench.length} Reserves)`
          : bench.length >= 1
          ? `Active (${bench.length} Reserve${bench.length > 1 ? 's' : ''})`
          : 'Empty (0 Reserves)',
      benchPlayersList,
      benchReplacementVerdict,
      squadCounters: {
        eliteSpinners: eliteSpinners.length,
        frontlineSpinners: frontlineSpinners.length,
        partTimeSpinners: partTimeSpinners.length,
        totalSpinners: allXiSpinners.length,
        totalWicketkeepers: totalWks,
        middleOrderWks,
        paceBowlers,
      },
      projectedStats: {
        avgBattingScore,
        avgBattingWickets,
        avgBowlingConceded,
        avgBowlingWickets,
        netRunDifferential,
      },
      playingBalance: {
        battingDepth: `Power ${Math.round(avgPower)}/100 · Stability ${Math.round(avgStability)}/100`,
        deathBowling: `${Math.round(deathOverRating)}/100 (${sortedDeath[0]?.player.name || 'N/A'} ${sortedDeath[0]?.dna.deathBowl || ''})`,
        spinQuality: spinLabel,
        powerplayImpact: `${Math.round(ppOverRating)}/100 (${sortedPP[0]?.player.name || 'N/A'} ${sortedPP[0]?.dna.ppBowl || ''})`,
        battingOrderSynergy: `${battingOrderScore}/100 (${
          battingOrderScore >= 82 ? 'Optimal Sequence' : battingOrderScore >= 68 ? 'Balanced Sequence' : 'Suboptimal Order'
        })`,
      },
      metrics: {
        sixthBowlingOption: hasExtraBowler,
        powerHittingIndex: Math.round(avgPower),
        anchorStabilityIndex: Math.round(avgStability),
        deathOverRating: Math.round(deathOverRating),
        variationsRating: Math.round(avgVariations),
        battingOrderScore,
      },
      archetypeBreakdown,
      pros,
      cons,
    };
  });

  rawRankings.sort((a, b) => b.scoreOutOf10 - a.scoreOutOf10);
  for (let i = 1; i < rawRankings.length; i++) {
    if (rawRankings[i].scoreOutOf10 >= rawRankings[i - 1].scoreOutOf10) {
      rawRankings[i].scoreOutOf10 = Number((rawRankings[i - 1].scoreOutOf10 - 0.14).toFixed(2));
    }
  }

  const leader = rawRankings[0];
  const runnerUp = rawRankings[1];
  const conditionLabels = env.active.map((c) => c.replace('_', ' ').toUpperCase()).join(' + ');

  return {
    executiveSummary:
      leader && runnerUp
        ? `[${playingCount}-Player Format · ${conditionLabels}] ${leader.teamName} (${leader.scoreOutOf10.toFixed(
            2
          )}/10 · Proj. ${leader.projectedStats.avgBattingScore} Scored / ${leader.projectedStats.avgBowlingConceded} Conceded) leads ${runnerUp.teamName} (${runnerUp.scoreOutOf10.toFixed(
            2
          )}/10) through superior batting order alignment, spin-tier control, and tournament bench flexibility.`
        : 'Dynamic Squad & Venue Analysis complete.',
    activeConditions: env.active,
    rankings: rawRankings,
    generatedAt: Date.now(),
  };
}

export function simulateMiniTournament(
  teams: Team[],
  lineups: Record<string, TeamLineupConfig>,
  minSquad: number = 11,
  conditions: PitchConditionTag[] = ['balanced']
): TournamentSimulationResult {
  const { playingCount } = getDynamicRoleRequirements(minSquad);
  const env = computeEnvironmentModifiers(conditions);

  const standings: Record<
    string,
    { teamId: string; teamName: string; played: number; won: number; lost: number; runsFor: number; runsAgainst: number; points: number }
  > = {};

  const playerTracker: Record<
    string,
    {
      playerName: string;
      teamName: string;
      role: string;
      runs: number;
      balls: number;
      wickets: number;
      runsConceded: number;
      overs: number;
      mvpPoints: number;
      reason: string;
    }
  > = {};

  teams.forEach((t) => {
    standings[t.id] = {
      teamId: t.id,
      teamName: t.name,
      played: 0,
      won: 0,
      lost: 0,
      runsFor: 0,
      runsAgainst: 0,
      points: 0,
    };
  });

  const getEffectiveSquad = (t: Team) => {
    const cfg = lineups[t.id];
    const orderedBase: Player[] = [];
    if (cfg?.playingIds?.length > 0) {
      cfg.playingIds.slice(0, playingCount).forEach((pid) => {
        const found = t.players.find((p) => p.id === pid);
        if (found) orderedBase.push(found);
      });
    }
    if (orderedBase.length === 0) {
      orderedBase.push(...t.players.slice(0, playingCount));
    }

    const impact = cfg?.impactPlayerId ? t.players.find((p) => p.id === cfg.impactPlayerId) : undefined;
    const combined = impact && !orderedBase.some((p) => p.id === impact.id) ? [...orderedBase, impact] : orderedBase;
    return {
      squad: combined.length > 0 ? combined : t.players,
      captainId: cfg?.captainId,
      vcId: cfg?.viceCaptainId,
    };
  };

  const simulateMatch = (teamA: Team, teamB: Team, matchIndex: number) => {
    const sideA = getEffectiveSquad(teamA);
    const sideB = getEffectiveSquad(teamB);

    const playInnings = (
      battingSide: { squad: Player[]; captainId?: string; vcId?: string },
      battingTeamName: string,
      bowlingSide: { squad: Player[] },
      bowlingTeamName: string,
      inningsSeed: number
    ) => {
      let totalRuns = 0;
      let totalWickets = 0;

      const realBowlers = bowlingSide.squad.filter((p) => p.role === 'BOWL' || p.role === 'AR');
      const bowlingAttack = realBowlers.slice(0, 5);
      const hasEliteSpinner = bowlingAttack.some((b) => derivePlayerDNA(b).spinTier === 'elite');
      const hasFrontlineSpinner = bowlingAttack.some((b) => derivePlayerDNA(b).spinTier === 'frontline');

      const oppBowlStrength =
        bowlingAttack.length > 0
          ? bowlingAttack.reduce((s, b) => {
              const d = derivePlayerDNA(b);
              return s + (d.deathBowl * 0.4 + d.ppBowl * 0.3 + d.spinControl * 0.3);
            }, 0) / bowlingAttack.length
          : 60;

      const spinControlMult = hasEliteSpinner ? 0.96 : hasFrontlineSpinner ? 1.01 : 1.08;
      const oppPressureFactor = Math.max(0.82, Math.min(1.18, (1.42 - oppBowlStrength / 190) * spinControlMult));
      const batterLimit = Math.min(battingSide.squad.length, Math.max(5, playingCount));
      const envRunMult = 1 + env.runEnvShift / 185;

      battingSide.squad.slice(0, batterLimit).forEach((batter, idx) => {
        if (totalWickets >= playingCount - 1) return;
        const dna = derivePlayerDNA(batter);
        const slotNum = idx + 1;
        const slotFit = evaluateBattingSlotFit(batter, dna, slotNum, playingCount);

        const stabilityFactor = dna.stability / 100;
        const powerFactor = dna.power / 100;
        const capMult = batter.id === battingSide.captainId ? 1.12 : batter.id === battingSide.vcId ? 1.06 : 1.0;

        const positionVolume =
          slotNum <= 2 ? 1.24 : slotNum <= 4 ? 1.04 : slotNum <= 6 ? 0.78 : 0.4;

        const deterministicWave =
          0.88 + (((batter.name.charCodeAt(0) + matchIndex * 7 + inningsSeed * 3) % 11) / 40);

        const rawRuns =
          (stabilityFactor * 23 + powerFactor * 16) *
          positionVolume *
          slotFit.efficiencyMultiplier *
          deterministicWave *
          capMult *
          envRunMult *
          oppPressureFactor;

        const runs = Math.max(2, Math.round(rawRuns));

        const slotSrBoost = slotNum >= Math.ceil(playingCount * 0.45) && dna.preferredSlot === 'finisher' ? 1.08 : 1.0;
        const effectiveSr =
          (108 + powerFactor * 72) *
          slotSrBoost *
          slotFit.efficiencyMultiplier *
          envRunMult;
        const balls = Math.max(3, Math.round((runs / Math.max(90, effectiveSr)) * 100));

        totalRuns += runs;
        if (stabilityFactor < 0.84 || slotNum > 3) {
          totalWickets++;
        }

        if (!playerTracker[batter.id]) {
          playerTracker[batter.id] = {
            playerName: batter.name,
            teamName: battingTeamName,
            role: batter.role,
            runs: 0,
            balls: 0,
            wickets: 0,
            runsConceded: 0,
            overs: 0,
            mvpPoints: 0,
            reason: `Batting #${slotNum} · Stability ${dna.stability}/100 · Power ${dna.power}/100`,
          };
        }
        playerTracker[batter.id].runs += runs;
        playerTracker[batter.id].balls += balls;
        playerTracker[batter.id].mvpPoints += runs + (effectiveSr >= 155 ? 6 : 0);
      });

      const cappedWickets = Math.min(playingCount - 1, Math.max(4, totalWickets));
      const totalThreat = bowlingAttack.reduce((sum, b) => {
        const d = derivePlayerDNA(b);
        return sum + (d.deathBowl * 0.38 + d.ppBowl * 0.32 * env.paceBounceWeight + d.variations * 0.2 + d.spinControl * 0.1 * env.spinWeight);
      }, 0);

      bowlingAttack.forEach((bowler) => {
        const dna = derivePlayerDNA(bowler);
        if (!dna.isGenuineBowler) return;

        const threat =
          dna.deathBowl * 0.38 +
          dna.ppBowl * 0.32 * env.paceBounceWeight +
          dna.variations * 0.2 +
          dna.spinControl * 0.1 * env.spinWeight;

        const wktShare = totalThreat > 0 ? (threat / totalThreat) * cappedWickets : 1;
        const wkts = Math.max(0, Number(wktShare.toFixed(2)));

        const isHighRiskPhaseBowler = dna.deathBowl >= 80 || dna.ppBowl >= 82;
        const baseEcon = isHighRiskPhaseBowler
          ? 8.75 - (dna.variations / 100) * 0.75 + env.runEnvShift / 22
          : 7.75 - (dna.spinControl / 100) * 0.85 + env.runEnvShift / 22;

        const oversBowled = 4;
        const runsConceded = Math.max(16, Math.round(baseEcon * oversBowled));

        if (!playerTracker[bowler.id]) {
          playerTracker[bowler.id] = {
            playerName: bowler.name,
            teamName: bowlingTeamName,
            role: bowler.role,
            runs: 0,
            balls: 0,
            wickets: 0,
            runsConceded: 0,
            overs: 0,
            mvpPoints: 0,
            reason:
              dna.spinTier === 'elite'
                ? `Tier 1 Elite Spinner (${dna.spinControl}/100 Control)`
                : dna.deathBowl >= dna.ppBowl
                ? `Death Specialist (16–20 Overs · Variations ${dna.variations}/100)`
                : `Powerplay Swing Striker (1–4 Overs · PP ${dna.ppBowl}/100)`,
          };
        }
        playerTracker[bowler.id].wickets = Number((playerTracker[bowler.id].wickets + wkts).toFixed(2));
        playerTracker[bowler.id].runsConceded += runsConceded;
        playerTracker[bowler.id].overs += oversBowled;

        const econBonus = runsConceded / oversBowled <= 7.5 ? 6 : 0;
        const dualSkillBonus = bowler.role === 'AR' && wkts > 0 ? 14 : 0;
        playerTracker[bowler.id].mvpPoints += wkts * 25 + econBonus + dualSkillBonus;
      });

      return Math.max(120, totalRuns);
    };

    const scoreA = playInnings(sideA, teamA.name, sideB, teamB.name, 1);
    let scoreB = playInnings(sideB, teamB.name, sideA, teamA.name, 2);
    if (scoreA === scoreB) scoreB -= 1;

    return {
      scoreA,
      scoreB,
      winner: scoreA > scoreB ? teamA : teamB,
      loser: scoreA > scoreB ? teamB : teamA,
    };
  };

  let matchCounter = 1;
  const rounds = teams.length <= 4 ? 3 : 2;
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const m = simulateMatch(teams[i], teams[j], matchCounter++);
        standings[teams[i].id].played++;
        standings[teams[j].id].played++;
        standings[teams[i].id].runsFor += m.scoreA;
        standings[teams[i].id].runsAgainst += m.scoreB;
        standings[teams[j].id].runsFor += m.scoreB;
        standings[teams[j].id].runsAgainst += m.scoreA;
        standings[m.winner.id].won++;
        standings[m.winner.id].points += 2;
        standings[m.loser.id].lost++;
      }
    }
  }

  const pointsTable = Object.values(standings)
    .map((s) => {
      const nrrVal = (s.runsFor - s.runsAgainst) / Math.max(1, s.played * 20);
      return {
        ...s,
        nrr: (nrrVal >= 0 ? '+' : '') + nrrVal.toFixed(3),
        rawNrr: nrrVal,
      };
    })
    .sort((a, b) => b.points - a.points || b.rawNrr - a.rawNrr);

  const finalist1 = teams.find((t) => t.id === pointsTable[0]?.teamId) || teams[0];
  const finalist2 = teams.find((t) => t.id === pointsTable[1]?.teamId) || teams[1] || teams[0];
  const grandFinal = simulateMatch(finalist1, finalist2, 99);

  const allPlayersStats = Object.values(playerTracker);

  const orangeLeader = [...allPlayersStats].sort((a, b) => b.runs - a.runs)[0] || {
    playerName: 'N/A',
    teamName: finalist1.name,
    runs: 0,
    balls: 1,
    reason: 'Top Run Scorer',
  };

  const purpleLeader = [...allPlayersStats]
    .filter((p) => p.role === 'BOWL' || p.role === 'AR')
    .sort((a, b) => b.wickets - a.wickets || a.runsConceded - b.runsConceded)[0] || {
    playerName: 'No Bowler Drafted',
    teamName: finalist1.name,
    wickets: 0,
    runsConceded: 0,
    overs: 1,
    reason: 'Lead Wicket-Taker',
  };

  const superStrikerLeader =
    [...allPlayersStats]
      .filter((p) => p.runs >= 25)
      .sort((a, b) => b.runs / Math.max(1, b.balls) - a.runs / Math.max(1, a.balls))[0] || orangeLeader;

  const mvpLeader = [...allPlayersStats].sort((a, b) => b.mvpPoints - a.mvpPoints)[0] || orangeLeader;

  return {
    championTeamId: grandFinal.winner.id,
    championTeamName: grandFinal.winner.name,
    runnerUpTeamName: grandFinal.loser.name,
    finalMatchSummary: `${finalist1.name} (${grandFinal.scoreA}) vs ${finalist2.name} (${grandFinal.scoreB}) — ${grandFinal.winner.name} clinched the Trophy!`,
    orangeCap: {
      playerName: orangeLeader.playerName,
      teamName: orangeLeader.teamName,
      runs: orangeLeader.runs,
      strikeRate: Number(((orangeLeader.runs / Math.max(1, orangeLeader.balls)) * 100).toFixed(1)),
      reason: orangeLeader.reason,
    },
    purpleCap: {
      playerName: purpleLeader.playerName,
      teamName: purpleLeader.teamName,
      wickets: Math.max(1, Math.round(purpleLeader.wickets)),
      economy: Number((purpleLeader.runsConceded / Math.max(1, purpleLeader.overs)).toFixed(2)),
      reason: purpleLeader.reason,
    },
    superStriker: {
      playerName: superStrikerLeader.playerName,
      teamName: superStrikerLeader.teamName,
      strikeRate: Number(((superStrikerLeader.runs / Math.max(1, superStrikerLeader.balls)) * 100).toFixed(1)),
      runs: superStrikerLeader.runs,
    },
    manOfTournament: {
      playerName: mvpLeader.playerName,
      teamName: mvpLeader.teamName,
      mvpPoints: Math.round(mvpLeader.mvpPoints),
      summary:
        mvpLeader.role === 'AR'
          ? `All-Round MVP (${mvpLeader.runs} Runs & ${Math.round(mvpLeader.wickets)} Wkts)`
          : `${mvpLeader.runs} Runs · ${Math.round(mvpLeader.wickets)} Wkts`,
    },
    pointsTable: pointsTable.map(({ rawNrr, ...rest }) => rest),
  };
}

export async function fetchAiScoutReport(
  teams: Team[],
  minSquad: number = 11
): Promise<MasterScoutReport> {
  return generateMasterScoutReport(teams, {}, minSquad, ['balanced']);
}