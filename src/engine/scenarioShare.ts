import { BLOOD_VOLUME_NORMAL, BODYTEMP_NORMAL, LIVER_PRESETS, clamp } from './constants';
import { REAGENTS } from './reagents';
import { sanitizeDoseEvent } from './regimenStorage';
import type {
  DeliveryMethod,
  DoseEvent,
  EnvironmentPreset,
  LiverTypeId,
  OrganSlot,
  PatientConfig,
  RngMode,
  SimScenario,
  WoundSeverity,
} from './types';

export const DEFAULT_DURATION_SECONDS = 180;
export const DEFAULT_RNG_MODE: RngMode = 'expected';
export const DEFAULT_SEED = 42;
export const SCENARIO_HASH_KEY = 's';
export const SCENARIO_DURATIONS = [60, 120, 180, 300, 600] as const;

const BINARY_FORMAT_VERSION = 1;

/**
 * Append-only stable reagent ID table for compact binary URL sharing.
 * IMPORTANT: Never reorder, rename, or remove existing slots; only append new reagent IDs at the end
 * so previously shared `#s=` links remain permanently valid.
 */
export const REAGENT_SHARE_ORDER = [
  'libital',
  'helbital',
  'probital',
  'aiuri',
  'lenturi',
  'hercuri',
  'granibitaluri',
  'synthflesh',
  'multiver',
  'seiver',
  'syriniver',
  'musiver',
  'tirimol',
  'convermol',
  'penthrite',
  'sal_acid',
  'oxandrolone',
  'salbutamol',
  'albuterol',
  'regen_jelly',
  'pen_acid',
  'atropine',
  'calomel',
  'ammoniated_mercury',
  'cryoxadone',
  'pyroxadone',
  'rezadone',
  'mannitol',
  'neurine',
  'mutadone',
  'potass_iodide',
  'salglu_solution',
  'ephedrine',
  'diphenhydramine',
  'oculine',
  'inacusiate',
  'epinephrine',
  'antihol',
  'insulin',
  'strange_reagent',
  'synaptizine',
  'synaphydramine',
  'spaceacillin',
  'mine_salve',
  'modafinil',
  'morphine',
  'haloperidol',
  'leporazine',
  'higadrite',
  'psicodine',
  'coagulant',
  'seraka_extract',
  'banana_peel',
  'determination',
  'ondansetron',
  'naloxone',
  'lidocaine',
  'sansufentanyl',
  'inaprovaline',
  'omnizine',
  'protozine',
  'godblood',
  'honey',
  'earthsblood',
  'silibinin',
  'polypyr',
  'metafactor',
  'muscle_stimulant',
  'cordiolis_hepatico',
  'stimulants',
  'syndicate_nanites',
  'changelingadrenaline',
  'changelinghaste',
  'adminordrazine',
  'libitoil',
  'helgrasp',
  'aivime',
  'lentslurri',
  'herignis',
  'monover',
  'technetium',
  'super_melatonin',
  'coveroli',
  'nooartrium',
  'benzoic_acid',
  'oxymetholone',
  'bamethan',
  'pendetide',
  'hyoscyamine',
  'ammoniated_sludge',
  'inreziniver',
  'neruwhine',
  'corazargh',
  'oculater',
  'tinacusiate',
  'prohol',
  'lidopaine',
  'sepsisillin',
  'probital_failed',
  'peptides_failed',
  'toxic_monomers',
  'nutriment',
  'peptides',
  'toxin',
  'amatoxin',
  'anacea',
  'lexorin',
  'histamine',
  'mindbreaker',
  'ethanol',
  'sugar',
  'water',
] as const;

const REAGENT_INDEX_BY_ID: ReadonlyMap<string, number> = new Map(
  REAGENT_SHARE_ORDER.map((id, idx) => [id, idx]),
);

const METHOD_ORDER: readonly DeliveryMethod[] = ['PATCH', 'INJECT', 'INGEST', 'IV_DRIP', 'TOUCH', 'VAPOR'];
const LIVER_TYPE_ORDER: readonly LiverTypeId[] = ['organic', 'evolved', 'cyber_t1', 'cyber_t2', 'cyber_t3', 'none'];
const ENV_ORDER: readonly EnvironmentPreset[] = ['normal', 'cryo', 'hot', 'vacuum'];
const WOUND_ORDER: readonly WoundSeverity[] = ['none', 'moderate', 'severe', 'critical'];
const ORGAN_ORDER: readonly OrganSlot[] = ['liver', 'heart', 'lungs', 'stomach', 'brain', 'eyes', 'ears'];

export function makeBasePatient(overrides: Partial<PatientConfig> = {}): PatientConfig {
  return {
    brute: 0,
    burn: 0,
    tox: 0,
    oxy: 0,
    stamina: 0,
    liverType: 'organic',
    metabolismEfficiency: 1.0,
    bloodVolume: BLOOD_VOLUME_NORMAL,
    bleedFlow: 0,
    woundSeverity: 'none',
    woundCount: 0,
    bodyTemp: BODYTEMP_NORMAL,
    ambientTemp: 293.15,
    environment: 'normal',
    onFire: false,
    fireStacks: 0,
    irradiated: false,
    unconscious: false,
    inStasis: false,
    touchProtection: 0,
    husked: false,
    ...overrides,
    allergies: overrides.allergies ? [...overrides.allergies] : [],
    chemicalAllergy: overrides.chemicalAllergy ?? false,
    organs: {
      liver: 0,
      heart: 0,
      lungs: 0,
      stomach: 0,
      brain: 0,
      eyes: 0,
      ears: 0,
      ...(overrides.organs ?? {}),
    },
  };
}

export function createBlankScenario(): SimScenario {
  return {
    patient: makeBasePatient(),
    doses: [],
    durationSeconds: DEFAULT_DURATION_SECONDS,
    rngMode: DEFAULT_RNG_MODE,
    seed: DEFAULT_SEED,
  };
}

class ByteWriter {
  private readonly buf: number[] = [];

  writeU8(byte: number): void {
    this.buf.push(Math.max(0, Math.min(255, Math.round(byte))) & 0xff);
  }

  writeVarUint(n: number): void {
    let v = Math.max(0, Math.floor(n));
    while (v >= 0x80) {
      this.buf.push((v % 0x80) | 0x80);
      v = Math.floor(v / 0x80);
    }
    this.buf.push(v);
  }

  writeCompactNum(val: number): void {
    const scaled = Math.max(0, Math.round(val * 100));
    if (scaled % 100 === 0) {
      this.writeVarUint((scaled / 100) * 2);
    } else {
      this.writeVarUint(scaled * 2 + 1);
    }
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}

class ByteReader {
  offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get length(): number {
    return this.bytes.length;
  }

  readU8(): number {
    if (this.offset >= this.bytes.length) {
      throw new Error('分享链接编码无效或已被截断，无法解析场景数据。');
    }
    return this.bytes[this.offset++];
  }

  readVarUint(): number {
    let result = 0;
    let multiplier = 1;
    for (let i = 0; i < 8; i++) {
      const b = this.readU8();
      result += (b & 0x7f) * multiplier;
      if ((b & 0x80) === 0) return result;
      multiplier *= 128;
    }
    throw new Error('分享链接数值溢出，无法解析场景数据。');
  }

  readCompactNum(): number {
    const raw = this.readVarUint();
    if (raw % 2 === 0) return raw / 2;
    return ((raw - 1) / 2) / 100;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(input: string): Uint8Array {
  if (!/^[A-Za-z0-9\-_]+$/.test(input)) {
    throw new Error('分享链接编码无效或已被截断，无法解析场景数据。');
  }
  const clean = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (clean.length % 4)) % 4;
  const padded = clean + '='.repeat(padLen);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error('分享链接编码无效或已被截断，无法解析场景数据。');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function computePatientMask(patient: PatientConfig): {
  pMask: number;
  orgMask: number;
  validAllergyIndices: number[];
  statusFlags: number;
  hasCustomWounds: boolean;
} {
  const base = makeBasePatient();
  let pMask = 0;

  if (patient.brute !== base.brute) pMask |= 1 << 0;
  if (patient.burn !== base.burn) pMask |= 1 << 1;
  if (patient.tox !== base.tox) pMask |= 1 << 2;
  if (patient.oxy !== base.oxy) pMask |= 1 << 3;
  if (patient.stamina !== base.stamina) pMask |= 1 << 4;

  let orgMask = 0;
  ORGAN_ORDER.forEach((slot, idx) => {
    if (patient.organs[slot] > 0) orgMask |= 1 << idx;
  });
  if (orgMask !== 0) pMask |= 1 << 5;

  const validAllergyIndices: number[] = [];
  const seenAllergies = new Set<string>();
  for (const id of patient.allergies) {
    if (seenAllergies.has(id)) continue;
    const idx = REAGENT_INDEX_BY_ID.get(id);
    if (idx !== undefined && REAGENTS[id]) {
      seenAllergies.add(id);
      validAllergyIndices.push(idx);
    }
  }
  if (validAllergyIndices.length > 0) pMask |= 1 << 6;

  if (patient.liverType !== base.liverType) pMask |= 1 << 7;
  if (patient.metabolismEfficiency !== base.metabolismEfficiency) pMask |= 1 << 8;
  if (patient.bloodVolume !== base.bloodVolume) pMask |= 1 << 9;
  if (patient.bleedFlow !== base.bleedFlow) pMask |= 1 << 10;

  const hasCustomWounds =
    patient.woundSeverity !== base.woundSeverity ||
    (patient.woundSeverity !== 'none' && patient.woundCount !== base.woundCount);
  if (hasCustomWounds) pMask |= 1 << 11;

  if (patient.bodyTemp !== base.bodyTemp) pMask |= 1 << 12;
  if (patient.ambientTemp !== base.ambientTemp) pMask |= 1 << 13;
  if (patient.environment !== base.environment) pMask |= 1 << 14;

  let statusFlags = 0;
  if (patient.onFire) statusFlags |= 1 << 0;
  if (patient.irradiated) statusFlags |= 1 << 1;
  if (patient.unconscious) statusFlags |= 1 << 2;
  if (patient.inStasis) statusFlags |= 1 << 3;
  if (patient.husked) statusFlags |= 1 << 4;
  if (patient.chemicalAllergy) statusFlags |= 1 << 5;
  if (patient.onFire && Math.round(clamp(patient.fireStacks, 1, 100) * 100) !== 1000) {
    statusFlags |= 1 << 6;
  }
  if (statusFlags !== 0) pMask |= 1 << 15;

  if (patient.touchProtection !== base.touchProtection) pMask |= 1 << 16;

  return { pMask, orgMask, validAllergyIndices, statusFlags, hasCustomWounds };
}

function writePatient(
  writer: ByteWriter,
  patient: PatientConfig,
  meta: ReturnType<typeof computePatientMask>,
): void {
  const { pMask, orgMask, validAllergyIndices, statusFlags } = meta;
  writer.writeVarUint(pMask);

  if (pMask & (1 << 0)) writer.writeCompactNum(clamp(patient.brute, 0, 400));
  if (pMask & (1 << 1)) writer.writeCompactNum(clamp(patient.burn, 0, 400));
  if (pMask & (1 << 2)) writer.writeCompactNum(clamp(patient.tox, 0, 400));
  if (pMask & (1 << 3)) writer.writeCompactNum(clamp(patient.oxy, 0, 400));
  if (pMask & (1 << 4)) writer.writeCompactNum(clamp(patient.stamina, 0, 120));

  if (pMask & (1 << 5)) {
    writer.writeU8(orgMask);
    ORGAN_ORDER.forEach((slot, idx) => {
      if (orgMask & (1 << idx)) {
        writer.writeCompactNum(Math.max(0, patient.organs[slot]));
      }
    });
  }

  if (pMask & (1 << 6)) {
    writer.writeVarUint(validAllergyIndices.length);
    for (const idx of validAllergyIndices) {
      writer.writeVarUint(idx);
    }
  }

  if (pMask & (1 << 7)) {
    const ltIdx = Math.max(0, LIVER_TYPE_ORDER.indexOf(patient.liverType));
    writer.writeU8(ltIdx);
  }
  if (pMask & (1 << 8)) writer.writeCompactNum(clamp(patient.metabolismEfficiency, 0.25, 3));
  if (pMask & (1 << 9)) writer.writeCompactNum(clamp(patient.bloodVolume, 0, BLOOD_VOLUME_NORMAL));
  if (pMask & (1 << 10)) writer.writeCompactNum(clamp(patient.bleedFlow, 0, 30));

  if (pMask & (1 << 11)) {
    const wsIdx = Math.max(0, WOUND_ORDER.indexOf(patient.woundSeverity));
    const wc = patient.woundSeverity === 'none' ? 0 : Math.round(clamp(patient.woundCount, 0, 20));
    writer.writeU8((wsIdx << 5) | (wc & 0x1f));
  }

  if (pMask & (1 << 12)) writer.writeCompactNum(clamp(patient.bodyTemp, 50, 1000));
  if (pMask & (1 << 13)) writer.writeCompactNum(clamp(patient.ambientTemp, 2.7, 1200));
  if (pMask & (1 << 14)) {
    const evIdx = Math.max(0, ENV_ORDER.indexOf(patient.environment));
    writer.writeU8(evIdx);
  }

  if (pMask & (1 << 15)) {
    writer.writeU8(statusFlags);
    if (statusFlags & (1 << 6)) {
      writer.writeCompactNum(clamp(patient.fireStacks, 1, 100));
    }
  }

  if (pMask & (1 << 16)) {
    writer.writeU8(Math.round(clamp(patient.touchProtection, 0, 1) * 100));
  }
}

function readPatient(reader: ByteReader): PatientConfig {
  const pMask = reader.readVarUint();
  if (pMask >= 1 << 17) {
    throw new Error('不支持的患者参数字段或分享链接已损坏。');
  }

  const base = makeBasePatient();

  const brute = pMask & (1 << 0) ? clamp(reader.readCompactNum(), 0, 400) : base.brute;
  const burn = pMask & (1 << 1) ? clamp(reader.readCompactNum(), 0, 400) : base.burn;
  const tox = pMask & (1 << 2) ? clamp(reader.readCompactNum(), 0, 400) : base.tox;
  const oxy = pMask & (1 << 3) ? clamp(reader.readCompactNum(), 0, 400) : base.oxy;
  const stamina = pMask & (1 << 4) ? clamp(reader.readCompactNum(), 0, 120) : base.stamina;

  const rawOrgans: Record<OrganSlot, number> = { ...base.organs };
  if (pMask & (1 << 5)) {
    const orgMask = reader.readU8();
    if (orgMask & 0x80) {
      throw new Error('分享链接器官掩码无效，无法解析场景。');
    }
    ORGAN_ORDER.forEach((slot, idx) => {
      if (orgMask & (1 << idx)) {
        rawOrgans[slot] = reader.readCompactNum();
      }
    });
  }

  const allergies: string[] = [];
  if (pMask & (1 << 6)) {
    const count = reader.readVarUint();
    if (count > REAGENT_SHARE_ORDER.length) {
      throw new Error('分享链接过敏原数量异常，无法解析场景。');
    }
    for (let i = 0; i < count; i++) {
      const idx = reader.readVarUint();
      const id = REAGENT_SHARE_ORDER[idx];
      if (!id || !REAGENTS[id]) {
        throw new Error('分享链接包含未知的过敏原索引，无法解析场景。');
      }
      if (!allergies.includes(id)) allergies.push(id);
    }
  }

  let liverType = base.liverType;
  if (pMask & (1 << 7)) {
    const ltIdx = reader.readU8();
    if (ltIdx >= LIVER_TYPE_ORDER.length) {
      throw new Error('分享链接包含未知的肝脏型号，无法解析场景。');
    }
    liverType = LIVER_TYPE_ORDER[ltIdx];
  }

  const metabolismEfficiency =
    pMask & (1 << 8) ? clamp(reader.readCompactNum(), 0.25, 3) : base.metabolismEfficiency;
  const bloodVolume =
    pMask & (1 << 9) ? clamp(reader.readCompactNum(), 0, BLOOD_VOLUME_NORMAL) : base.bloodVolume;
  const bleedFlow = pMask & (1 << 10) ? clamp(reader.readCompactNum(), 0, 30) : base.bleedFlow;

  let woundSeverity = base.woundSeverity;
  let woundCount = base.woundCount;
  if (pMask & (1 << 11)) {
    const wb = reader.readU8();
    const wsIdx = wb >> 5;
    if (wsIdx >= WOUND_ORDER.length) {
      throw new Error('分享链接包含未知的伤口等级，无法解析场景。');
    }
    woundSeverity = WOUND_ORDER[wsIdx];
    woundCount = woundSeverity === 'none' ? 0 : Math.round(clamp(wb & 0x1f, 0, 20));
  }

  const bodyTemp = pMask & (1 << 12) ? clamp(reader.readCompactNum(), 50, 1000) : base.bodyTemp;
  const ambientTemp = pMask & (1 << 13) ? clamp(reader.readCompactNum(), 2.7, 1200) : base.ambientTemp;

  let environment = base.environment;
  if (pMask & (1 << 14)) {
    const evIdx = reader.readU8();
    if (evIdx >= ENV_ORDER.length) {
      throw new Error('分享链接包含未知的环境预设，无法解析场景。');
    }
    environment = ENV_ORDER[evIdx];
  }

  let onFire = base.onFire;
  let fireStacks = base.fireStacks;
  let irradiated = base.irradiated;
  let unconscious = base.unconscious;
  let inStasis = base.inStasis;
  let husked = base.husked;
  let chemicalAllergy = base.chemicalAllergy;
  if (pMask & (1 << 15)) {
    const sf = reader.readU8();
    if (sf & 0x80) {
      throw new Error('分享链接状态标志位无效，无法解析场景。');
    }
    onFire = Boolean(sf & (1 << 0));
    irradiated = Boolean(sf & (1 << 1));
    unconscious = Boolean(sf & (1 << 2));
    inStasis = Boolean(sf & (1 << 3));
    husked = Boolean(sf & (1 << 4));
    chemicalAllergy = Boolean(sf & (1 << 5));
    const hasCustomFireStacks = Boolean(sf & (1 << 6));
    const parsedStacks = hasCustomFireStacks ? clamp(reader.readCompactNum(), 1, 100) : 10;
    fireStacks = onFire ? parsedStacks : 0;
  }

  const touchProtection =
    pMask & (1 << 16) ? clamp(reader.readU8() / 100, 0, 1) : base.touchProtection;

  const liverMax = LIVER_PRESETS[liverType].liverless ? 0 : LIVER_PRESETS[liverType].maxHealth;

  return makeBasePatient({
    brute,
    burn,
    tox,
    oxy,
    stamina,
    liverType,
    metabolismEfficiency,
    bloodVolume,
    bleedFlow,
    woundSeverity,
    woundCount,
    bodyTemp,
    ambientTemp,
    environment,
    onFire,
    fireStacks,
    irradiated,
    unconscious,
    inStasis,
    touchProtection,
    husked,
    allergies,
    chemicalAllergy,
    organs: {
      liver: clamp(rawOrgans.liver, 0, liverMax),
      heart: clamp(rawOrgans.heart, 0, 100),
      lungs: clamp(rawOrgans.lungs, 0, 100),
      stomach: clamp(rawOrgans.stomach, 0, 100),
      brain: clamp(rawOrgans.brain, 0, 200),
      eyes: clamp(rawOrgans.eyes, 0, 50),
      ears: clamp(rawOrgans.ears, 0, 100),
    },
  });
}

function writeDoses(writer: ByteWriter, validDoses: { dose: DoseEvent; reagentIdx: number }[]): void {
  writer.writeVarUint(validDoses.length);
  for (const { dose: d, reagentIdx } of validDoses) {
    const methodIdx = Math.max(0, METHOD_ORDER.indexOf(d.method));
    const st = Math.round(clamp(d.startTime, 0, 600));
    const purPct = Math.round(clamp(d.purity, 0.05, 1) * 100);
    const tm = Math.round(clamp(d.temp, 5, 1200));
    const iv = Number(clamp(d.ivRate, 0.5, 20).toFixed(2));
    const patchGroup =
      d.method === 'PATCH' && d.patchGroup !== undefined
        ? Math.round(clamp(d.patchGroup, 1, 99))
        : undefined;

    const hasStart = st !== 0;
    const hasCustomPurity = purPct !== 100;
    const hasExtra =
      (d.method === 'PATCH' && patchGroup !== undefined) ||
      (d.method === 'IV_DRIP' && Math.abs(iv - 5) > 1e-4);
    const hasCustomTemp = tm !== 300;
    const isDisabled = !d.enabled;

    let dFlags = methodIdx & 0b111;
    if (hasStart) dFlags |= 1 << 3;
    if (hasCustomPurity) dFlags |= 1 << 4;
    if (hasExtra) dFlags |= 1 << 5;
    if (hasCustomTemp) dFlags |= 1 << 6;
    if (isDisabled) dFlags |= 1 << 7;

    writer.writeU8(dFlags);
    writer.writeVarUint(reagentIdx);
    writer.writeCompactNum(clamp(d.volume, 0.1, 500));

    if (hasStart) writer.writeVarUint(st);
    if (hasCustomPurity) writer.writeU8(purPct);
    if (hasExtra) {
      if (d.method === 'PATCH') {
        writer.writeU8(patchGroup!);
      } else {
        writer.writeCompactNum(iv);
      }
    }
    if (hasCustomTemp) writer.writeVarUint(tm);
  }
}

function readDoses(reader: ByteReader): DoseEvent[] {
  const count = reader.readVarUint();
  if (count > 200) {
    throw new Error('分享链接包含过多给药条目，无法解析场景。');
  }
  const result: DoseEvent[] = [];
  for (let i = 0; i < count; i++) {
    const dFlags = reader.readU8();
    const methodIdx = dFlags & 0b111;
    if (methodIdx >= METHOD_ORDER.length) {
      throw new Error('分享链接包含未知的给药方式，无法解析场景。');
    }
    const method = METHOD_ORDER[methodIdx];
    const hasStart = Boolean(dFlags & (1 << 3));
    const hasCustomPurity = Boolean(dFlags & (1 << 4));
    const hasExtra = Boolean(dFlags & (1 << 5));
    const hasCustomTemp = Boolean(dFlags & (1 << 6));
    const isDisabled = Boolean(dFlags & (1 << 7));

    if (hasExtra && method !== 'PATCH' && method !== 'IV_DRIP') {
      throw new Error('分享链接给药标志位无效，无法解析场景。');
    }

    const reagentIdx = reader.readVarUint();
    const reagentId = REAGENT_SHARE_ORDER[reagentIdx];
    if (!reagentId || !REAGENTS[reagentId]) {
      throw new Error('分享链接包含未知的药品索引，无法解析场景。');
    }

    const volume = reader.readCompactNum();
    const startTime = hasStart ? reader.readVarUint() : 0;
    const purity = hasCustomPurity ? reader.readU8() / 100 : 1;

    let patchGroup: number | undefined;
    let ivRate = 5;
    if (hasExtra) {
      if (method === 'PATCH') {
        patchGroup = reader.readU8();
      } else {
        ivRate = reader.readCompactNum();
      }
    }

    const temp = hasCustomTemp ? reader.readVarUint() : 300;
    const normalized = sanitizeDoseEvent(
      {
        reagentId,
        volume,
        method,
        startTime,
        purity,
        temp,
        ivRate,
        enabled: !isDisabled,
        patchGroup,
      },
      i,
    );
    if (normalized) result.push(normalized);
  }
  return result;
}

export function encodeScenarioPayload(scenario: SimScenario): string {
  const writer = new ByteWriter();
  const patientMeta = computePatientMask(scenario.patient);

  const validDoses: { dose: DoseEvent; reagentIdx: number }[] = [];
  for (const d of scenario.doses) {
    const reagentIdx = REAGENT_INDEX_BY_ID.get(d.reagentId);
    if (reagentIdx !== undefined && REAGENTS[d.reagentId]) {
      validDoses.push({ dose: d, reagentIdx });
    }
  }

  const dur = Math.round(clamp(scenario.durationSeconds, 10, 600));
  const hasCustomDuration = dur !== DEFAULT_DURATION_SECONDS;
  const isRandomMode = scenario.rngMode === 'random';
  const seed = Math.max(1, Math.round(scenario.seed || DEFAULT_SEED));
  const hasCustomSeed = isRandomMode && seed !== DEFAULT_SEED;

  const hasPatient = patientMeta.pMask !== 0;
  const hasDoses = validDoses.length > 0;

  let header = BINARY_FORMAT_VERSION & 0b111;
  if (hasPatient) header |= 1 << 3;
  if (hasDoses) header |= 1 << 4;
  if (hasCustomDuration) header |= 1 << 5;
  if (isRandomMode) header |= 1 << 6;
  if (hasCustomSeed) header |= 1 << 7;

  writer.writeU8(header);
  if (hasCustomDuration) writer.writeVarUint(dur);
  if (hasCustomSeed) writer.writeVarUint(seed);
  if (hasPatient) writePatient(writer, scenario.patient, patientMeta);
  if (hasDoses) writeDoses(writer, validDoses);

  return bytesToBase64Url(writer.toUint8Array());
}

export function decodeScenarioPayload(payload: string): SimScenario {
  const clean = payload.trim();
  if (!clean) {
    throw new Error('URL 分享编码为空，无法解析场景。');
  }

  const bytes = base64UrlToBytes(clean);
  const reader = new ByteReader(bytes);
  const header = reader.readU8();

  const version = header & 0b111;
  if (version !== BINARY_FORMAT_VERSION) {
    throw new Error('不支持的场景链接版本或格式。');
  }

  const hasPatient = Boolean(header & (1 << 3));
  const hasDoses = Boolean(header & (1 << 4));
  const hasCustomDuration = Boolean(header & (1 << 5));
  const isRandomMode = Boolean(header & (1 << 6));
  const hasCustomSeed = Boolean(header & (1 << 7));

  if (hasCustomSeed && !isRandomMode) {
    throw new Error('分享链接随机种子标志位无效，无法解析场景。');
  }

  const durationSeconds = hasCustomDuration
    ? Math.round(clamp(reader.readVarUint(), 10, 600))
    : DEFAULT_DURATION_SECONDS;
  const rngMode: RngMode = isRandomMode ? 'random' : DEFAULT_RNG_MODE;
  const seed = hasCustomSeed ? Math.max(1, reader.readVarUint()) : DEFAULT_SEED;
  const patient = hasPatient ? readPatient(reader) : makeBasePatient();
  const doses = hasDoses ? readDoses(reader) : [];

  if (reader.offset !== reader.length) {
    throw new Error('分享链接包含多余数据或已损坏，无法解析场景。');
  }

  return { patient, doses, durationSeconds, rngMode, seed };
}

export function buildScenarioShareUrl(scenario: SimScenario, baseHref?: string): string {
  const payload = encodeScenarioPayload(scenario);
  const fallback = typeof window !== 'undefined' ? window.location.href : 'https://ss13-chem-sim.local/';
  const url = new URL(baseHref ?? fallback, 'https://ss13-chem-sim.local/');
  url.hash = `${SCENARIO_HASH_KEY}=${payload}`;
  return url.toString();
}

export function extractScenarioPayloadFromInput(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('file://')) {
    try {
      const url = new URL(trimmed);
      if (url.hash.length > 1) {
        const fromHash = new URLSearchParams(url.hash.slice(1)).get(SCENARIO_HASH_KEY);
        if (fromHash !== null) return fromHash;
      }
      const fromQuery = url.searchParams.get(SCENARIO_HASH_KEY);
      if (fromQuery !== null) return fromQuery;
      return null;
    } catch {
      return null;
    }
  }

  const hashIdx = trimmed.indexOf('#');
  if (hashIdx !== -1) {
    const hashStr = trimmed.slice(hashIdx + 1);
    const fromHash = new URLSearchParams(hashStr).get(SCENARIO_HASH_KEY);
    if (fromHash !== null) return fromHash;
  }

  const queryIdx = trimmed.indexOf('?');
  if (queryIdx !== -1) {
    const queryStr = trimmed.slice(queryIdx + 1).split('#')[0];
    const fromQuery = new URLSearchParams(queryStr).get(SCENARIO_HASH_KEY);
    if (fromQuery !== null) return fromQuery;
  }

  if (trimmed.startsWith(`${SCENARIO_HASH_KEY}=`)) {
    return new URLSearchParams(trimmed).get(SCENARIO_HASH_KEY);
  }

  if (/^[A-Za-z0-9\-_]+$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function parseScenarioFromUrlOrText(rawInput: string): SimScenario {
  const payload = extractScenarioPayloadFromInput(rawInput);
  if (payload === null) {
    throw new Error('未识别到有效的场景链接或分享编码（需包含 #s=... 参数或编码串）。');
  }
  return decodeScenarioPayload(payload);
}

export function tryReadScenarioFromHash(hash: string): { scenario: SimScenario | null; error: string | null } {
  const clean = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!clean) return { scenario: null, error: null };
  const params = new URLSearchParams(clean);
  if (!params.has(SCENARIO_HASH_KEY)) return { scenario: null, error: null };
  const payload = params.get(SCENARIO_HASH_KEY) ?? '';
  try {
    return { scenario: decodeScenarioPayload(payload), error: null };
  } catch (err) {
    return {
      scenario: null,
      error: err instanceof Error ? err.message : 'URL 分享场景解析失败，已加载空白场景。',
    };
  }
}

export const BLANK_SCENARIO_PAYLOAD = encodeScenarioPayload(createBlankScenario());

export function getScenarioHistoryUrl(
  scenario: SimScenario,
  locationLike: { pathname: string; search: string },
): string {
  const base = `${locationLike.pathname}${locationLike.search}`;
  const payload = encodeScenarioPayload(scenario);
  return payload === BLANK_SCENARIO_PAYLOAD ? base : `${base}#${SCENARIO_HASH_KEY}=${payload}`;
}
