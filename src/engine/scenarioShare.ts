import { BLOOD_VOLUME_NORMAL, BODYTEMP_NORMAL, LIVER_PRESETS, clamp } from './constants';
import { REAGENTS } from './reagents';
import { sanitizeDoseEvent } from './regimenStorage';
import type {
  DeliveryMethod,
  DoseEvent,
  EnvironmentPreset,
  LiverTypeId,
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

const VALID_ENVIRONMENTS = new Set<EnvironmentPreset>(['normal', 'cryo', 'hot', 'vacuum']);
const VALID_WOUND_SEVERITIES = new Set<WoundSeverity>(['none', 'moderate', 'severe', 'critical']);

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

interface WireOrganDelta {
  lv?: number;
  ht?: number;
  lg?: number;
  sm?: number;
  bn?: number;
  ey?: number;
  er?: number;
}

interface WirePatientDelta {
  br?: number;
  bn?: number;
  tx?: number;
  ox?: number;
  st?: number;
  og?: WireOrganDelta;
  lt?: LiverTypeId;
  me?: number;
  bv?: number;
  bf?: number;
  ws?: WoundSeverity;
  wc?: number;
  bt?: number;
  at?: number;
  ev?: EnvironmentPreset;
  fi?: boolean;
  fs?: number;
  ir?: boolean;
  un?: boolean;
  is?: boolean;
  tp?: number;
  hk?: boolean;
  al?: string[];
  ca?: boolean;
}

interface WireDoseItem {
  r: string;
  v: number;
  m?: DeliveryMethod;
  t?: number;
  p?: number;
  tm?: number;
  iv?: number;
  e?: boolean;
  pg?: number;
}

interface WireScenarioV1 {
  v: 1;
  p?: WirePatientDelta;
  d?: WireDoseItem[];
  dur?: number;
  m?: 'r';
  sd?: number;
}

function num(val: unknown): number | undefined {
  return typeof val === 'number' && Number.isFinite(val) ? val : undefined;
}

function bool(val: unknown): boolean | undefined {
  return typeof val === 'boolean' ? val : undefined;
}

function roundNum(val: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(input: string): Uint8Array {
  const clean = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (clean.length % 4)) % 4;
  const padded = clean + '='.repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodePatientDelta(patient: PatientConfig): WirePatientDelta | undefined {
  const base = makeBasePatient();
  const delta: WirePatientDelta = {};

  if (patient.brute !== base.brute) delta.br = roundNum(patient.brute, 2);
  if (patient.burn !== base.burn) delta.bn = roundNum(patient.burn, 2);
  if (patient.tox !== base.tox) delta.tx = roundNum(patient.tox, 2);
  if (patient.oxy !== base.oxy) delta.ox = roundNum(patient.oxy, 2);
  if (patient.stamina !== base.stamina) delta.st = roundNum(patient.stamina, 2);

  const og: WireOrganDelta = {};
  if (patient.organs.liver !== 0) og.lv = roundNum(patient.organs.liver, 2);
  if (patient.organs.heart !== 0) og.ht = roundNum(patient.organs.heart, 2);
  if (patient.organs.lungs !== 0) og.lg = roundNum(patient.organs.lungs, 2);
  if (patient.organs.stomach !== 0) og.sm = roundNum(patient.organs.stomach, 2);
  if (patient.organs.brain !== 0) og.bn = roundNum(patient.organs.brain, 2);
  if (patient.organs.eyes !== 0) og.ey = roundNum(patient.organs.eyes, 2);
  if (patient.organs.ears !== 0) og.er = roundNum(patient.organs.ears, 2);
  if (Object.keys(og).length > 0) delta.og = og;

  if (patient.liverType !== base.liverType) delta.lt = patient.liverType;
  if (patient.metabolismEfficiency !== base.metabolismEfficiency) {
    delta.me = roundNum(patient.metabolismEfficiency, 3);
  }
  if (patient.bloodVolume !== base.bloodVolume) delta.bv = roundNum(patient.bloodVolume, 2);
  if (patient.bleedFlow !== base.bleedFlow) delta.bf = roundNum(patient.bleedFlow, 2);
  if (patient.woundSeverity !== base.woundSeverity) delta.ws = patient.woundSeverity;
  if (patient.woundCount !== base.woundCount) delta.wc = Math.round(patient.woundCount);
  if (patient.bodyTemp !== base.bodyTemp) delta.bt = roundNum(patient.bodyTemp, 2);
  if (patient.ambientTemp !== base.ambientTemp) delta.at = roundNum(patient.ambientTemp, 2);
  if (patient.environment !== base.environment) delta.ev = patient.environment;
  if (patient.onFire !== base.onFire) delta.fi = patient.onFire;
  if (patient.fireStacks !== base.fireStacks) delta.fs = roundNum(patient.fireStacks, 2);
  if (patient.irradiated !== base.irradiated) delta.ir = patient.irradiated;
  if (patient.unconscious !== base.unconscious) delta.un = patient.unconscious;
  if (patient.inStasis !== base.inStasis) delta.is = patient.inStasis;
  if (patient.touchProtection !== base.touchProtection) delta.tp = roundNum(patient.touchProtection, 3);
  if (patient.husked !== base.husked) delta.hk = patient.husked;

  const validAllergies = Array.from(new Set(patient.allergies.filter((id) => Boolean(REAGENTS[id]))));
  if (validAllergies.length > 0) delta.al = validAllergies;
  if (patient.chemicalAllergy) delta.ca = true;

  return Object.keys(delta).length > 0 ? delta : undefined;
}

function decodePatientDelta(raw: unknown): PatientConfig {
  if (!raw || typeof raw !== 'object') return makeBasePatient();
  const obj = raw as Record<string, unknown>;

  const rawLt = typeof obj.lt === 'string' && obj.lt in LIVER_PRESETS ? (obj.lt as LiverTypeId) : 'organic';
  const rawEv =
    typeof obj.ev === 'string' && VALID_ENVIRONMENTS.has(obj.ev as EnvironmentPreset)
      ? (obj.ev as EnvironmentPreset)
      : 'normal';
  const rawWs =
    typeof obj.ws === 'string' && VALID_WOUND_SEVERITIES.has(obj.ws as WoundSeverity)
      ? (obj.ws as WoundSeverity)
      : 'none';

  const liverMax = LIVER_PRESETS[rawLt].liverless ? 0 : LIVER_PRESETS[rawLt].maxHealth;
  const rawOg = obj.og && typeof obj.og === 'object' ? (obj.og as Record<string, unknown>) : {};

  const allergies: string[] = [];
  if (Array.isArray(obj.al)) {
    for (const item of obj.al) {
      if (typeof item === 'string' && REAGENTS[item] && !allergies.includes(item)) {
        allergies.push(item);
      }
    }
  }

  const onFire = bool(obj.fi) ?? false;
  const woundCount = rawWs === 'none' ? 0 : Math.round(clamp(num(obj.wc) ?? 1, 0, 20));

  return makeBasePatient({
    brute: clamp(num(obj.br) ?? 0, 0, 400),
    burn: clamp(num(obj.bn) ?? 0, 0, 400),
    tox: clamp(num(obj.tx) ?? 0, 0, 400),
    oxy: clamp(num(obj.ox) ?? 0, 0, 400),
    stamina: clamp(num(obj.st) ?? 0, 0, 120),
    liverType: rawLt,
    metabolismEfficiency: clamp(num(obj.me) ?? 1.0, 0.25, 3),
    bloodVolume: clamp(num(obj.bv) ?? BLOOD_VOLUME_NORMAL, 0, BLOOD_VOLUME_NORMAL),
    bleedFlow: clamp(num(obj.bf) ?? 0, 0, 30),
    woundSeverity: rawWs,
    woundCount,
    bodyTemp: clamp(num(obj.bt) ?? BODYTEMP_NORMAL, 50, 1000),
    ambientTemp: clamp(num(obj.at) ?? 293.15, 2.7, 1200),
    environment: rawEv,
    onFire,
    fireStacks: onFire ? clamp(num(obj.fs) ?? 10, 1, 100) : 0,
    irradiated: bool(obj.ir) ?? false,
    unconscious: bool(obj.un) ?? false,
    inStasis: bool(obj.is) ?? false,
    touchProtection: clamp(num(obj.tp) ?? 0, 0, 1),
    husked: bool(obj.hk) ?? false,
    allergies,
    chemicalAllergy: bool(obj.ca) ?? false,
    organs: {
      liver: clamp(num(rawOg.lv) ?? 0, 0, liverMax),
      heart: clamp(num(rawOg.ht) ?? 0, 0, 100),
      lungs: clamp(num(rawOg.lg) ?? 0, 0, 100),
      stomach: clamp(num(rawOg.sm) ?? 0, 0, 100),
      brain: clamp(num(rawOg.bn) ?? 0, 0, 200),
      eyes: clamp(num(rawOg.ey) ?? 0, 0, 50),
      ears: clamp(num(rawOg.er) ?? 0, 0, 100),
    },
  });
}

function encodeDosesDelta(doses: DoseEvent[]): WireDoseItem[] | undefined {
  const out: WireDoseItem[] = [];
  for (const d of doses) {
    if (!REAGENTS[d.reagentId]) continue;
    const item: WireDoseItem = {
      r: d.reagentId,
      v: roundNum(clamp(d.volume, 0.1, 500), 2),
    };
    if (d.method !== 'PATCH') item.m = d.method;
    const st = Math.round(clamp(d.startTime, 0, 600));
    if (st !== 0) item.t = st;
    const pur = roundNum(clamp(d.purity, 0.05, 1), 2);
    if (Math.abs(pur - 1) > 1e-4) item.p = pur;
    const tm = Math.round(clamp(d.temp, 5, 1200));
    if (tm !== 300) item.tm = tm;
    const iv = roundNum(clamp(d.ivRate, 0.5, 20), 2);
    if (Math.abs(iv - 5) > 1e-4) item.iv = iv;
    if (!d.enabled) item.e = false;
    if (d.method === 'PATCH' && d.patchGroup !== undefined) item.pg = d.patchGroup;
    out.push(item);
  }
  return out.length > 0 ? out : undefined;
}

function decodeDosesDelta(raw: unknown): DoseEvent[] {
  if (!Array.isArray(raw)) return [];
  const result: DoseEvent[] = [];
  raw.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const obj = item as Record<string, unknown>;
    const normalized = sanitizeDoseEvent(
      {
        reagentId: obj.r,
        volume: obj.v,
        method: obj.m ?? 'PATCH',
        startTime: obj.t ?? 0,
        purity: obj.p ?? 1,
        temp: obj.tm ?? 300,
        ivRate: obj.iv ?? 5,
        enabled: obj.e ?? true,
        patchGroup: obj.pg,
      },
      idx,
    );
    if (normalized) result.push(normalized);
  });
  return result;
}

export function encodeScenarioPayload(scenario: SimScenario): string {
  const wire: WireScenarioV1 = { v: 1 };
  const p = encodePatientDelta(scenario.patient);
  if (p) wire.p = p;
  const d = encodeDosesDelta(scenario.doses);
  if (d) wire.d = d;
  const dur = Math.round(clamp(scenario.durationSeconds, 10, 600));
  if (dur !== DEFAULT_DURATION_SECONDS) wire.dur = dur;
  if (scenario.rngMode === 'random') {
    wire.m = 'r';
    const sd = Math.max(1, Math.round(scenario.seed || DEFAULT_SEED));
    if (sd !== DEFAULT_SEED) wire.sd = sd;
  }
  const bytes = new TextEncoder().encode(JSON.stringify(wire));
  return bytesToBase64Url(bytes);
}

export function decodeScenarioPayload(payload: string): SimScenario {
  const clean = payload.trim();
  if (!clean) {
    throw new Error('URL 分享编码为空，无法解析场景。');
  }
  let parsed: unknown;
  try {
    const bytes = base64UrlToBytes(clean);
    const jsonText = new TextDecoder().decode(bytes);
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('分享链接编码无效或已被截断，无法解析场景数据。');
  }

  if (!parsed || typeof parsed !== 'object' || (parsed as Record<string, unknown>).v !== 1) {
    throw new Error('不支持的场景链接版本或格式。');
  }

  const wire = parsed as Record<string, unknown>;
  const patient = decodePatientDelta(wire.p);
  const doses = decodeDosesDelta(wire.d);
  const durRaw = num(wire.dur);
  const durationSeconds = durRaw !== undefined ? Math.round(clamp(durRaw, 10, 600)) : DEFAULT_DURATION_SECONDS;
  const rngMode: RngMode = wire.m === 'r' ? 'random' : DEFAULT_RNG_MODE;
  const seedRaw = num(wire.sd);
  const seed = seedRaw !== undefined ? Math.max(1, Math.round(seedRaw)) : DEFAULT_SEED;

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
