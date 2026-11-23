import { clamp } from './constants';
import { REAGENTS } from './reagents';
import type { DeliveryMethod, DoseEvent, ReagentDef, SavedRegimen } from './types';

export const SAVED_REGIMENS_STORAGE_KEY = 'ss13_chem_sim_saved_regimens_v1';

export const VALID_METHODS: Set<DeliveryMethod> = new Set([
  'INJECT',
  'INGEST',
  'PATCH',
  'TOUCH',
  'VAPOR',
  'IV_DRIP',
]);

function makeUniqueDoseId(idx: number): string {
  return `dose-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
}

function makeUniqueRegimenId(): string {
  return `reg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Create a default DoseEvent from a ReagentDef (100% purity; INGEST for probital, PATCH for others).
 */
export function createDefaultDose(def: ReagentDef): DoseEvent {
  const defaultMethod: DeliveryMethod = def.id === 'probital' ? 'INGEST' : 'PATCH';
  return {
    id: makeUniqueDoseId(0),
    reagentId: def.id,
    volume: def.id === 'syriniver' ? 5 : 15,
    method: defaultMethod,
    startTime: 0,
    purity: 1,
    temp: 300,
    ivRate: 5,
    enabled: true,
  };
}

/**
 * Deep-copy DoseEvent items with fresh unique IDs so replacing or appending regimens never creates duplicates.
 */
export function cloneRegimenDoses(doses: DoseEvent[]): DoseEvent[] {
  return doses.map((d, idx) => ({
    ...d,
    id: makeUniqueDoseId(idx),
  }));
}

/**
 * Validate and normalize an untrusted dose object, returning null if its reagentId is unknown.
 */
export function sanitizeDoseEvent(raw: unknown, idx = 0): DoseEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const reagentId = typeof obj.reagentId === 'string' ? obj.reagentId.trim() : '';
  const def = REAGENTS[reagentId];
  if (!def) return null;

  const rawMethod = typeof obj.method === 'string' ? (obj.method as DeliveryMethod) : 'INJECT';
  const method: DeliveryMethod = VALID_METHODS.has(rawMethod) ? rawMethod : 'INJECT';

  const volumeNum = typeof obj.volume === 'number' && Number.isFinite(obj.volume) ? obj.volume : 15;
  const purityNum = typeof obj.purity === 'number' && Number.isFinite(obj.purity) ? obj.purity : def.defaultPurity;
  const startTimeNum = typeof obj.startTime === 'number' && Number.isFinite(obj.startTime) ? obj.startTime : 0;
  const tempNum = typeof obj.temp === 'number' && Number.isFinite(obj.temp) ? obj.temp : 300;
  const ivRateNum = typeof obj.ivRate === 'number' && Number.isFinite(obj.ivRate) ? obj.ivRate : 5;
  const enabled = typeof obj.enabled === 'boolean' ? obj.enabled : true;

  return {
    id: makeUniqueDoseId(idx),
    reagentId,
    volume: Number(clamp(volumeNum, 0.1, 500).toFixed(2)),
    method,
    startTime: Math.round(clamp(startTimeNum, 0, 600)),
    purity: Number(clamp(purityNum, 0.05, 1).toFixed(2)),
    temp: Math.round(clamp(tempNum, 5, 1200)),
    ivRate: Number(clamp(ivRateNum, 0.5, 20).toFixed(2)),
    enabled,
  };
}

/**
 * Generate a concise fallback name when saving without user input.
 */
export function buildDefaultRegimenName(doses: DoseEvent[]): string {
  const valid = doses.filter((d) => REAGENTS[d.reagentId]);
  if (valid.length === 0) return '空给药方案';
  const active = valid.filter((d) => d.enabled);
  const source = active.length > 0 ? active : valid;
  const names: string[] = [];
  for (const d of source) {
    const zh = REAGENTS[d.reagentId]?.zhName;
    if (zh && !names.includes(zh)) names.push(zh);
    if (names.length >= 3) break;
  }
  const head = names.join(' + ');
  return valid.length > names.length ? `${head} 等${valid.length}项` : head;
}

/**
 * Insert or overwrite a saved regimen entry (matching by targetId or trimmed name) and move it to the top.
 */
export function createOrUpdateSavedRegimen(
  existing: SavedRegimen[],
  nameInput: string,
  doses: DoseEvent[],
  targetId?: string,
): { list: SavedRegimen[]; saved: SavedRegimen } {
  const sanitizedDoses = doses
    .map((d, idx) => sanitizeDoseEvent(d, idx))
    .filter((d): d is DoseEvent => d !== null);
  const cleanName = nameInput.trim() || buildDefaultRegimenName(sanitizedDoses);
  const now = Date.now();

  const matched =
    (targetId ? existing.find((item) => item.id === targetId) : undefined) ??
    existing.find((item) => item.name.trim() === cleanName);

  const saved: SavedRegimen = {
    id: matched ? matched.id : makeUniqueRegimenId(),
    name: cleanName,
    updatedAt: now,
    doses: cloneRegimenDoses(sanitizedDoses),
  };

  const list = [saved, ...existing.filter((item) => item.id !== saved.id)];
  return { list, saved };
}

/**
 * Serialize saved regimens as versioned JSON for clipboard/file export.
 */
export function serializeRegimensJson(regimens: SavedRegimen[]): string {
  return JSON.stringify({ version: 1, regimens }, null, 2);
}

function normalizeRegimenRecord(raw: unknown, idx: number): SavedRegimen | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.doses)) return null;

  const doses = obj.doses
    .map((d, dIdx) => sanitizeDoseEvent(d, dIdx))
    .filter((d): d is DoseEvent => d !== null);
  if (doses.length === 0) return null;

  const rawName = typeof obj.name === 'string' ? obj.name.trim() : '';
  const name = rawName || buildDefaultRegimenName(doses);
  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : `${makeUniqueRegimenId()}-${idx}`;
  const updatedAt =
    typeof obj.updatedAt === 'number' && Number.isFinite(obj.updatedAt) ? obj.updatedAt : Date.now();

  return { id, name, updatedAt, doses };
}

/**
 * Parse exported JSON in any supported shape ({ regimens }, SavedRegimen[], SavedRegimen, or DoseEvent[]).
 */
export function parseRegimensJson(jsonText: string): SavedRegimen[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('JSON 格式无效，请检查内容是否完整。');
  }

  const normalized: SavedRegimen[] = [];

  if (Array.isArray(parsed)) {
    const looksLikeRegimens = parsed.some(
      (item) => item && typeof item === 'object' && Array.isArray((item as Record<string, unknown>).doses),
    );
    if (looksLikeRegimens) {
      parsed.forEach((item, idx) => {
        const reg = normalizeRegimenRecord(item, idx);
        if (reg) normalized.push(reg);
      });
    } else {
      const doses = parsed
        .map((d, idx) => sanitizeDoseEvent(d, idx))
        .filter((d): d is DoseEvent => d !== null);
      if (doses.length > 0) {
        normalized.push({
          id: makeUniqueRegimenId(),
          name: buildDefaultRegimenName(doses),
          updatedAt: Date.now(),
          doses,
        });
      }
    }
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.regimens)) {
      obj.regimens.forEach((item, idx) => {
        const reg = normalizeRegimenRecord(item, idx);
        if (reg) normalized.push(reg);
      });
    } else if (Array.isArray(obj.doses)) {
      const reg = normalizeRegimenRecord(obj, 0);
      if (reg) normalized.push(reg);
    }
  }

  if (normalized.length === 0) {
    throw new Error('未在 JSON 中找到有效的给药方案或已知药品 ID。');
  }

  return normalized;
}

/**
 * Safely read saved regimens from browser localStorage.
 */
export function loadSavedRegimensFromStorage(): SavedRegimen[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(SAVED_REGIMENS_STORAGE_KEY);
    if (!raw) return [];
    return parseRegimensJson(raw);
  } catch {
    return [];
  }
}

/**
 * Safely persist saved regimens to browser localStorage.
 */
export function saveRegimensToStorage(list: SavedRegimen[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(SAVED_REGIMENS_STORAGE_KEY, serializeRegimensJson(list));
  } catch {
    // Ignore storage quota or private-browsing write failures cleanly
  }
}
