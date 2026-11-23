import type { LiverPreset } from './constants';

export type DeliveryMethod =
  | 'INJECT'
  | 'INGEST'
  | 'PATCH'
  | 'TOUCH'
  | 'VAPOR'
  | 'IV_DRIP';

export type ReagentCategory = 'c2' | 'superior' | 'unique' | 'special' | 'inverse' | 'helper';

export type MobStat = 'STABLE' | 'SOFT_CRIT' | 'HARD_CRIT' | 'DEAD';

export type OrganSlot = 'liver' | 'heart' | 'lungs' | 'stomach' | 'brain' | 'eyes' | 'ears';

export type LiverTypeId = LiverPreset['id'];

export type EnvironmentPreset = 'normal' | 'cryo' | 'hot' | 'vacuum';

export type WoundSeverity = 'none' | 'moderate' | 'severe' | 'critical';

export type RngMode = 'expected' | 'random';

export interface OrganState {
  slot: OrganSlot;
  label: string;
  damage: number;
  maxHealth: number;
  lowThreshold: number;
  highThreshold: number;
  robotic: boolean;
  failing: boolean;
}

export interface ReagentInstance {
  id: string;
  volume: number;
  purity: number;
  creationPurity: number;
  ph: number;
  metabolizationRate: number;
  overdoseThreshold: number;
  overdosed: boolean;
  currentCycle: number;
  metabolizing: boolean;
  data: Record<string, number | boolean | string | string[]>;
}

export interface SimContext {
  dt: number;
  tick: number;
  time: number;
  rngMode: RngMode;
  rng: () => number;
  chance: (percentPerSec: number) => number;
  discreteChance: (percentPerSec: number) => boolean;
  randRange: (min: number, max: number) => number;
  state: SimMutableState;
  addBloodReagent: (
    reagentId: string,
    amount: number,
    purity?: number,
    temp?: number,
    isLivingHolder?: boolean,
  ) => number;
  removeBloodReagent: (reagentId: string, amount: number) => number;
  getBloodReagent: (reagentId: string) => ReagentInstance | undefined;
  getTotalReagentAmount: (reagentId: string) => number;
  adjustOrganDamage: (slot: OrganSlot, amount: number, maximum?: number, requireOrganic?: boolean) => number;
  addEvent: (
    severity: SimEvent['severity'],
    category: SimEvent['category'],
    title: string,
    detail: string,
  ) => void;
  markStaminaHit: () => void;
}

export interface ReagentDef {
  id: string;
  enName: string;
  zhName: string;
  aliases?: string[];
  category: ReagentCategory;
  targets: string[];
  color: string;
  ph: number;
  metabolizationRate: number; // u/s
  defaultPurity: number;
  overdoseThreshold: number; // 0 = no OD
  inverseChemVal: number;
  inverseChemId?: string;
  isMedicine: boolean;
  isToxin?: boolean;
  toxpwr?: number;
  liverDamageMultiplier?: number;
  liverToleranceMultiplier?: number;
  silentToxin?: boolean;
  healthRequired?: number;
  reverseMetabolism: boolean;
  unaffectedByMetabolism?: boolean;
  selfConsuming?: boolean;
  deadProcess?: boolean;
  ignoreStasis?: boolean;
  penetratesSkin: 'VAPOR' | 'TOUCH_VAPOR' | 'NONE';
  purgeMultiplier?: number;
  isOpioid?: boolean;
  isDrug?: boolean;
  isAlcohol?: boolean;
  metabolizedTraits?: string[];
  addedTraits?: string[];
  summaryZh: string;
  mechanicsNoteZh: string;
  exposeMob?: (
    ctx: SimContext,
    method: DeliveryMethod,
    volume: number,
    purity: number,
    temp: number,
    touchProtection: number,
  ) => void;
  onMobAdd?: (ctx: SimContext, inst: ReagentInstance) => void;
  onMobMetabolize?: (ctx: SimContext, inst: ReagentInstance) => void;
  onMobLife?: (ctx: SimContext, inst: ReagentInstance, ratio: number, dt: number) => void;
  onMobDead?: (ctx: SimContext, inst: ReagentInstance, ratio: number, dt: number) => void;
  overdoseStart?: (ctx: SimContext, inst: ReagentInstance) => void;
  overdoseProcess?: (ctx: SimContext, inst: ReagentInstance, ratio: number, dt: number) => void;
  onMobEndMetabolize?: (ctx: SimContext, inst: ReagentInstance) => void;
  onMobDelete?: (ctx: SimContext, inst: ReagentInstance) => void;
  metabolizeReagent?: (ctx: SimContext, inst: ReagentInstance, metabolizedVol: number, dt: number) => void;
}

export interface DoseEvent {
  id: string;
  reagentId: string;
  volume: number;
  method: DeliveryMethod;
  startTime: number;
  purity: number;
  temp: number;
  ivRate: number; // u/tick for IV_DRIP
  enabled: boolean;
}

export interface SavedRegimen {
  id: string;
  name: string;
  updatedAt: number;
  doses: DoseEvent[];
}

export interface PatientConfig {
  brute: number;
  burn: number;
  tox: number;
  oxy: number;
  stamina: number;
  organs: Record<OrganSlot, number>;
  liverType: LiverTypeId;
  metabolismEfficiency: number;
  bloodVolume: number;
  bleedFlow: number;
  woundSeverity: WoundSeverity;
  woundCount: number;
  bodyTemp: number;
  ambientTemp: number;
  environment: EnvironmentPreset;
  onFire: boolean;
  fireStacks: number;
  irradiated: boolean;
  unconscious: boolean;
  inStasis: boolean;
  touchProtection: number;
  husked: boolean;
  allergies: string[];
  chemicalAllergy: boolean;
}

export interface SimOptions {
  durationSeconds: number;
  rngMode: RngMode;
  seed: number;
}

export interface ActiveTransferBuffer {
  id: string;
  label: string;
  reagentId: string;
  remaining: number;
  ratePerTick: number;
  purity: number;
  temp: number;
  method: 'PATCH' | 'INJECT';
}

export interface SimMutableState {
  brute: number;
  burn: number;
  tox: number;
  oxy: number;
  stamina: number;
  stamcrit: boolean;
  timeSinceStaminaDamage: number;
  staminaHitThisTick: boolean;
  health: number;
  stat: MobStat;
  bloodVolume: number;
  effectiveBloodVolume: number;
  bleedFlow: number;
  woundCount: number;
  woundSeverity: WoundSeverity;
  woundCounter: number;
  bodyTemp: number;
  coreTemp: number;
  ambientTemp: number;
  environment: EnvironmentPreset;
  chemTemp: number;
  onFire: boolean;
  fireStacks: number;
  irradiated: boolean;
  unconscious: boolean;
  inStasis: boolean;
  touchProtection: number;
  husked: boolean;
  allergies: string[];
  chemicalAllergy: boolean;
  losebreath: number;
  failedLastBreath: boolean;
  drowsiness: number;
  sleeping: number;
  dizzy: number;
  jitter: number;
  confusion: number;
  disgust: number;
  eyeBlur: number;
  heartAttack: boolean;
  liverFailureTime: number;
  liverType: LiverTypeId;
  metabolismEfficiency: number;
  organs: Record<OrganSlot, OrganState>;
  blood: ReagentInstance[];
  stomach: ReagentInstance[];
  activeTransfers: ActiveTransferBuffer[];
  traits: Set<string>;
  delayedReviveTicks: number | null;
  delayedReviveHealing: number;
  bleedMod: number;
  lungPressureMod: number;
}

export interface ReagentSnapshot {
  id: string;
  zhName: string;
  enName: string;
  color: string;
  volume: number;
  purity: number;
  overdoseThreshold: number;
  overdosed: boolean;
  currentCycle: number;
  metabolizing: boolean;
  allergyState?: 'active' | 'blocked';
}

export interface TickSnapshot {
  tick: number;
  time: number;
  health: number;
  stat: MobStat;
  brute: number;
  burn: number;
  tox: number;
  oxy: number;
  stamina: number;
  stamcrit: boolean;
  bloodVolume: number;
  effectiveBloodVolume: number;
  bleedFlow: number;
  woundCounter: number;
  woundsRemaining: number;
  bodyTemp: number;
  coreTemp: number;
  chemTemp: number;
  losebreath: number;
  drowsiness: number;
  sleeping: number;
  dizzy: number;
  jitter: number;
  confusion: number;
  disgust: number;
  eyeBlur: number;
  heartAttack: boolean;
  husked: boolean;
  organs: Record<OrganSlot, { damage: number; maxHealth: number; failing: boolean; statusZh: string }>;
  traits: string[];
  bloodReagents: ReagentSnapshot[];
  stomachReagents: ReagentSnapshot[];
  activeTransfers: { label: string; reagentId: string; remaining: number }[];
  activeAllergens: string[];
  blockedAllergens: string[];
}

export interface SimEvent {
  time: number;
  tick: number;
  severity: 'info' | 'good' | 'warn' | 'danger';
  category: 'dose' | 'reaction' | 'overdose' | 'organ' | 'status' | 'vital' | 'allergy';
  title: string;
  detail: string;
}

export interface SimSummary {
  initialHealth: number;
  finalHealth: number;
  minHealth: number;
  maxHealth: number;
  finalStat: MobStat;
  deathTime: number | null;
  fullHealTime: number | null;
  critDuration: number;
  healedBrute: number;
  healedBurn: number;
  healedTox: number;
  healedOxy: number;
  worstOrgan: { slot: OrganSlot; label: string; damage: number; maxHealth: number; failing: boolean };
  triggeredODs: string[];
  triggeredInverses: string[];
  triggeredReactions: string[];
  triggeredDangerReactions: string[];
  triggeredAllergies: string[];
  triggeredHeartAttack: boolean;
  triggeredStamcrit: boolean;
  triggeredSleep: boolean;
}

export interface SimResult {
  snapshots: TickSnapshot[];
  events: SimEvent[];
  summary: SimSummary;
  reagentsSeen: string[];
}

export interface SimPreset {
  id: string;
  name: string;
  description: string;
  durationSeconds: number;
  patient: PatientConfig;
  doses: DoseEvent[];
}
