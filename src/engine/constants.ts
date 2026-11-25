import type { MobStat } from './types';

export const MOB_STAT_ZH: Record<MobStat, string> = {
  STABLE: '稳定存活',
  SOFT_CRIT: '轻度危急',
  HARD_CRIT: '重度危急',
  DEAD: '死亡',
};

export const SSMOBS_DT = 2; // SSmobs.wait = 2 SECONDS
export const REAGENTS_METABOLISM = 0.2; // u/s (0.4u per 2s tick)
export const REM = 1 / (REAGENTS_METABOLISM * SSMOBS_DT); // 2.5

export const MIN_FIXED_DURATION_SECONDS = 10;
export const DEFAULT_FIXED_DURATION_SECONDS = 180;
export const MAX_DURATION_SECONDS = 1800;
export const AUTO_MIN_DURATION_SECONDS = 30;
export const AUTO_TAIL_TICKS = 5; // 10s visual flat tail after steady/dead condition is first reached

export const CHEMICAL_QUANTISATION_LEVEL = 0.0001;
export const CHEMICAL_VOLUME_ROUNDING = 0.01;
export const REAGENT_STANDARD_PURITY = 0.75;
export const CONSUMABLE_STANDARD_PURITY = 0.5;
export const DEFAULT_REAGENT_TEMPERATURE = 300;
export const CHEMICAL_NORMAL_PH = 7.0;

export const STOMACH_METABOLISM_CONSTANT = 0.25;
export const STOMACH_DEFAULT_EFFICIENCY = 0.05;
export const PATCH_TRANSFER_PER_TICK = 0.75; // transfer_per_second = 0.75 passed per Life tick
export const PATCH_MAX_VOLUME = 40; // /obj/item/reagent_containers/applicator/patch::volume
export const PILL_MAX_VOLUME = 50; // /obj/item/reagent_containers/applicator/pill::volume

export const MAX_HEALTH = 100;
export const HEALTH_THRESHOLD_CRIT = 0;
export const HEALTH_THRESHOLD_FULLCRIT = -30;
export const HEALTH_THRESHOLD_DEAD = -100;
export const MAX_STAMINA = 120;
export const STAMINA_REGEN_TIME = 10;

export const BLOOD_VOLUME_NORMAL = 560;
export const BLOOD_VOLUME_SAFE = BLOOD_VOLUME_NORMAL * 0.85; // 476
export const BLOOD_VOLUME_OKAY = BLOOD_VOLUME_NORMAL * 0.7; // 392
export const BLOOD_VOLUME_RISKY = BLOOD_VOLUME_NORMAL * 0.55; // 308
export const BLOOD_VOLUME_BAD = BLOOD_VOLUME_NORMAL * 0.4; // 224
export const BLOOD_VOLUME_SURVIVE = BLOOD_VOLUME_NORMAL * 0.2; // 112
export const BLOOD_REGEN_FACTOR = 0.25;
export const OXYLOSS_PASSOUT_THRESHOLD = 50;

export const STANDARD_ORGAN_THRESHOLD = 100;
export const STANDARD_ORGAN_HEALING = 50 / 100000; // 0.0005
export const BRAIN_DAMAGE_DEATH = 200;
export const EYES_MAX_HEALTH = 50;
export const EYES_LOW_THRESHOLD = 20;
export const EYES_HIGH_THRESHOLD = 30;
export const HEART_MAX_HEALTH = 100;

export const UNHUSK_DAMAGE_THRESHOLD = 50;
export const SYNTHFLESH_UNHUSK_AMOUNT = 60;
export const SYNTHFLESH_UNHUSK_MAX = 100;

export const TEMPERATURE_DAMAGE_COEFFICIENT = 1.5;
export const T0C = 273.15;
export const BODYTEMP_NORMAL = 310.15;
export const BODYTEMP_HEAT_DAMAGE_LIMIT = BODYTEMP_NORMAL + 30; // 340.15
export const BODYTEMP_COLD_DAMAGE_LIMIT = BODYTEMP_NORMAL - 40; // 270.15
export const BODYTEMP_AUTORECOVERY_DIVISOR = 28;
export const BODYTEMP_STANDARD_CHANGE_RATE = 0.06;
export const BODYTEMP_CORE_CHANGE_RATE = BODYTEMP_STANDARD_CHANGE_RATE * 0.25; // 0.015
export const BODYTEMP_SKIN_CORE_CHANGE_RATE = BODYTEMP_STANDARD_CHANGE_RATE * 0.65; // 0.039
export const BODYTEMP_CORE_SKIN_CHANGE_RATE = BODYTEMP_STANDARD_CHANGE_RATE * 0.75; // 0.045
export const BODYTEMP_AREA_SKIN_CHANGE_RATE = BODYTEMP_STANDARD_CHANGE_RATE * 0.85; // 0.051
export const BODYTEMP_COOLING_MAX = -30;
export const BODYTEMP_HEATING_MAX = 30;
export const COLD_DAMAGE_LEVEL_1 = 0.25;
export const COLD_DAMAGE_LEVEL_2 = 0.75;
export const COLD_DAMAGE_LEVEL_3 = 1.5;

export interface LiverPreset {
  id: 'organic' | 'evolved' | 'cyber_t1' | 'cyber_t2' | 'cyber_t3' | 'none';
  label: string;
  maxHealth: number;
  toxTolerance: number;
  liverResistance: number;
  robotic: boolean;
  liverless: boolean;
}

export const LIVER_PRESETS: Record<LiverPreset['id'], LiverPreset> = {
  organic: {
    id: 'organic',
    label: '标准有机肝 (耐受3u · 抗性1.0x)',
    maxHealth: 100,
    toxTolerance: 3,
    liverResistance: 1.0,
    robotic: false,
    liverless: false,
  },
  evolved: {
    id: 'evolved',
    label: '进化肝 (耐受6u · 抗性1.5x · 120HP)',
    maxHealth: 120,
    toxTolerance: 6,
    liverResistance: 1.5,
    robotic: false,
    liverless: false,
  },
  cyber_t1: {
    id: 'cyber_t1',
    label: '基础赛博肝 T1 (耐受2u · 抗性0.9x · 50HP)',
    maxHealth: 50,
    toxTolerance: 2,
    liverResistance: 0.9,
    robotic: true,
    liverless: false,
  },
  cyber_t2: {
    id: 'cyber_t2',
    label: '赛博肝 T2 (耐受5u · 抗性1.2x · 150HP)',
    maxHealth: 150,
    toxTolerance: 5,
    liverResistance: 1.2,
    robotic: true,
    liverless: false,
  },
  cyber_t3: {
    id: 'cyber_t3',
    label: '升级赛博肝 T3 (耐受10u · 抗性1.5x · 200HP)',
    maxHealth: 200,
    toxTolerance: 10,
    liverResistance: 1.5,
    robotic: true,
    liverless: false,
  },
  none: {
    id: 'none',
    label: '无肝脏 / 肝切除 (仅自耗药代谢)',
    maxHealth: 0,
    toxTolerance: 0,
    liverResistance: 1.0,
    robotic: false,
    liverless: true,
  },
};

export function metabolizeFreeConstant(value: number, metabolizationRate: number): number {
  if (metabolizationRate <= 0) return 0;
  return (value * REAGENTS_METABOLISM) / metabolizationRate;
}

export function roundStep(val: number, step: number): number {
  if (step <= 0) return val;
  return Math.round(val / step) * step;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export function getTempChangeAmount(tempDiff: number, changeRate = BODYTEMP_STANDARD_CHANGE_RATE): number {
  if (tempDiff < 0) {
    return -(BODYTEMP_AUTORECOVERY_DIVISOR / 2) * Math.log(Math.max(1e-6, 1 - tempDiff * changeRate));
  }
  return (BODYTEMP_AUTORECOVERY_DIVISOR / 2) * Math.log(Math.max(1e-6, 1 + tempDiff * changeRate));
}
