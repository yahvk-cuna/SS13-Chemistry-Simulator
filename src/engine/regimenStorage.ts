import { PATCH_MAX_VOLUME, PILL_MAX_VOLUME, clamp } from './constants';
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
  let patchGroup: number | undefined;
  if (method === 'PATCH' && typeof obj.patchGroup === 'number' && Number.isFinite(obj.patchGroup)) {
    const rounded = Math.round(obj.patchGroup);
    if (rounded >= 1 && rounded <= 99) {
      patchGroup = rounded;
    }
  }

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
    ...(patchGroup !== undefined ? { patchGroup } : {}),
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

export type PlainTextRecipeFormat = 'multiline' | 'compact';

export interface PlainTextRecipeOptions {
  format: PlainTextRecipeFormat;
  title?: string;
  includeDisabled?: boolean;
}

/**
 * Upstream in-container explosion pairs that must never be packed into the same patch or pill.
 */
export function areReagentsContainerIncompatible(aId: string, bId: string): boolean {
  return (
    (aId === 'penthrite' && (bId === 'epinephrine' || bId === 'atropine')) ||
    (bId === 'penthrite' && (aId === 'epinephrine' || aId === 'atropine'))
  );
}

/**
 * Auto-pack enabled PATCH doses occurring at the same startTime into ≤40u composite patches,
 * avoiding explosive pairs. Multi-dose bins get sequential patchGroup IDs (1, 2, ...).
 */
export function autoPackPatchGroups(doses: DoseEvent[]): DoseEvent[] {
  const patchIndicesByTime = new Map<number, number[]>();
  doses.forEach((d, idx) => {
    if (!d.enabled || d.method !== 'PATCH' || d.volume <= 0 || !REAGENTS[d.reagentId]) return;
    const t = Math.round(clamp(d.startTime, 0, 600));
    const list = patchIndicesByTime.get(t) ?? [];
    list.push(idx);
    patchIndicesByTime.set(t, list);
  });

  const sortedTimes = Array.from(patchIndicesByTime.keys()).sort((a, b) => a - b);
  const groupByDoseIdx = new Map<number, number | undefined>();
  let nextGroupId = 1;

  for (const t of sortedTimes) {
    const indices = [...(patchIndicesByTime.get(t) ?? [])].sort((ia, ib) => doses[ib].volume - doses[ia].volume);
    const bins: { total: number; doseIndices: number[]; reagentIds: string[] }[] = [];

    for (const idx of indices) {
      const d = doses[idx];
      let placed = false;
      for (const bin of bins) {
        if (
          bin.total + d.volume <= PATCH_MAX_VOLUME + 1e-6 &&
          !bin.reagentIds.some((rid) => areReagentsContainerIncompatible(rid, d.reagentId))
        ) {
          bin.total += d.volume;
          bin.doseIndices.push(idx);
          bin.reagentIds.push(d.reagentId);
          placed = true;
          break;
        }
      }
      if (!placed) {
        bins.push({ total: d.volume, doseIndices: [idx], reagentIds: [d.reagentId] });
      }
    }

    for (const bin of bins) {
      if (bin.doseIndices.length >= 2) {
        const gid = nextGroupId++;
        for (const idx of bin.doseIndices) {
          groupByDoseIdx.set(idx, gid);
        }
      } else {
        groupByDoseIdx.set(bin.doseIndices[0], undefined);
      }
    }
  }

  return doses.map((d, idx) => {
    if (!d.enabled || d.method !== 'PATCH') return { ...d };
    const patchGroup = groupByDoseIdx.get(idx);
    if (patchGroup === undefined) {
      const copy = { ...d };
      delete copy.patchGroup;
      return copy;
    }
    return { ...d, patchGroup };
  });
}

function formatNumberTrim(val: number, decimals = 2): string {
  return Number(val.toFixed(decimals)).toString();
}

interface RecipeIngredient {
  reagentId: string;
  volume: number;
  pct: number;
  temp: number;
  enabled: boolean;
}

function mergeIngredients(items: RecipeIngredient[]): RecipeIngredient[] {
  const merged = new Map<string, RecipeIngredient>();
  for (const item of items) {
    const key = `${item.reagentId}|${item.pct}|${item.temp}|${item.enabled ? 1 : 0}`;
    const prev = merged.get(key);
    if (prev) {
      prev.volume = Number((prev.volume + item.volume).toFixed(4));
    } else {
      merged.set(key, { ...item });
    }
  }
  return Array.from(merged.values());
}

function formatIngredientText(ing: RecipeIngredient, style: PlainTextRecipeFormat): string {
  const def = REAGENTS[ing.reagentId];
  const zhName = def?.zhName ?? ing.reagentId;
  const vol = formatNumberTrim(ing.volume);
  const extras: string[] = [`${ing.pct}%`];
  if (ing.reagentId === 'seiver' && ing.temp !== 300) {
    extras.push(`${ing.temp}K`);
  }
  if (!ing.enabled) {
    extras.push('禁用');
  }
  return style === 'multiline'
    ? `${zhName} ${vol}u（${extras.join(', ')}）`
    : `${zhName} ${vol}u(${extras.join(', ')})`;
}

function toRecipeIngredient(d: DoseEvent): RecipeIngredient {
  return {
    reagentId: d.reagentId,
    volume: d.volume,
    pct: Math.round(d.purity * 100),
    temp: d.reagentId === 'seiver' ? Math.round(d.temp) : 300,
    enabled: d.enabled,
  };
}

function packStepContainers(sourceDoses: DoseEvent[], maxCap: number): RecipeIngredient[][] {
  const chunks: RecipeIngredient[] = [];
  for (const d of sourceDoses) {
    let rem = d.volume;
    const base = toRecipeIngredient(d);
    while (rem > 1e-6) {
      const piece = Math.min(rem, maxCap);
      chunks.push({ ...base, volume: Number(piece.toFixed(4)) });
      rem = Number((rem - piece).toFixed(4));
    }
  }

  chunks.sort((a, b) => b.volume - a.volume);
  const bins: { total: number; items: RecipeIngredient[] }[] = [];

  for (const chunk of chunks) {
    let placed = false;
    for (const bin of bins) {
      if (
        bin.total + chunk.volume <= maxCap + 1e-6 &&
        !bin.items.some((it) => areReagentsContainerIncompatible(it.reagentId, chunk.reagentId))
      ) {
        bin.total += chunk.volume;
        bin.items.push(chunk);
        placed = true;
        break;
      }
    }
    if (!placed) {
      bins.push({ total: chunk.volume, items: [chunk] });
    }
  }

  return bins.map((b) => mergeIngredients(b.items));
}

function hasIncompatiblePair(items: RecipeIngredient[]): boolean {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (areReagentsContainerIncompatible(items[i].reagentId, items[j].reagentId)) {
        return true;
      }
    }
  }
  return false;
}

interface StepEntry {
  multiline: string;
  compact: string;
}

/**
 * Format doses as a structured medical recipe (multiline checklist or compact single-line summary),
 * grouping composite/auto-packed patches (≤40u) and oral pills (≤50u), and omitting times on single-step plans.
 */
export function formatRegimenPlainText(doses: DoseEvent[], options: PlainTextRecipeOptions): string {
  const includeDisabled = Boolean(options.includeDisabled);
  const items = doses.filter((d) => REAGENTS[d.reagentId] && d.volume > 0 && (includeDisabled || d.enabled));
  if (items.length === 0) return '';

  const cleanTitle = options.title?.trim() ?? '';

  // Effective delivery time (explicit patchGroup shares its earliest dose time, matching simulator.ts)
  const groupStartMap = new Map<number, number>();
  for (const d of items) {
    if (d.method === 'PATCH' && d.patchGroup !== undefined) {
      const t = Math.round(d.startTime);
      const prev = groupStartMap.get(d.patchGroup);
      if (prev === undefined || t < prev) groupStartMap.set(d.patchGroup, t);
    }
  }

  const getEffectiveTime = (d: DoseEvent): number =>
    d.method === 'PATCH' && d.patchGroup !== undefined
      ? (groupStartMap.get(d.patchGroup) ?? Math.round(d.startTime))
      : Math.round(d.startTime);

  const distinctTimes = Array.from(new Set(items.map(getEffectiveTime))).sort((a, b) => a - b);
  const isMultiStep = distinctTimes.length > 1;

  let patchCounter = 0;
  let pillCounter = 0;

  const stepResults: { time: number; entries: StepEntry[] }[] = [];

  for (const t of distinctTimes) {
    const stepDoses = items.filter((d) => getEffectiveTime(d) === t);
    const entries: StepEntry[] = [];

    // 1. Explicit composite patch groups
    const explicitPatchMap = new Map<number, DoseEvent[]>();
    for (const d of stepDoses) {
      if (d.method === 'PATCH' && d.patchGroup !== undefined) {
        const arr = explicitPatchMap.get(d.patchGroup) ?? [];
        arr.push(d);
        explicitPatchMap.set(d.patchGroup, arr);
      }
    }
    const explicitGroupIds = Array.from(explicitPatchMap.keys()).sort((a, b) => a - b);
    for (const gid of explicitGroupIds) {
      const groupDoses = explicitPatchMap.get(gid) ?? [];
      const merged = mergeIngredients(groupDoses.map(toRecipeIngredient));
      const totalVol = merged.reduce((sum, i) => sum + i.volume, 0);
      const distinctCount = new Set(merged.map((i) => i.reagentId)).size;
      const patchNo = Math.max(patchCounter + 1, gid);
      patchCounter = patchNo;
      const baseLabel = `${distinctCount >= 2 ? '复合贴片' : '贴片'} #${patchNo}`;
      const compactLabel = `${distinctCount >= 2 ? '复合贴片' : '贴片'}#${patchNo}`;
      const capStr = `${formatNumberTrim(totalVol)}/${PATCH_MAX_VOLUME}u`;
      const overNote = totalVol > PATCH_MAX_VOLUME + 1e-6 ? '，超40u上限' : '';
      const incompatNote = hasIncompatiblePair(merged) ? '，含禁忌混装' : '';
      const multiBody = merged.map((m) => formatIngredientText(m, 'multiline')).join(' + ');
      const compactBody = merged.map((m) => formatIngredientText(m, 'compact')).join(' + ');
      entries.push({
        multiline: `${baseLabel}（${capStr}${overNote}${incompatNote}）：${multiBody}`,
        compact: `[${compactLabel} ${capStr}${overNote}${incompatNote}] ${compactBody}`,
      });
    }

    // 2. Ungrouped patches packed at ≤40u
    const ungroupedPatches = stepDoses.filter((d) => d.method === 'PATCH' && d.patchGroup === undefined);
    if (ungroupedPatches.length > 0) {
      const packedPatches = packStepContainers(ungroupedPatches, PATCH_MAX_VOLUME);
      for (const container of packedPatches) {
        patchCounter += 1;
        const totalVol = container.reduce((sum, i) => sum + i.volume, 0);
        const distinctCount = new Set(container.map((i) => i.reagentId)).size;
        const baseLabel = `${distinctCount >= 2 ? '复合贴片' : '贴片'} #${patchCounter}`;
        const compactLabel = `${distinctCount >= 2 ? '复合贴片' : '贴片'}#${patchCounter}`;
        const capStr = `${formatNumberTrim(totalVol)}/${PATCH_MAX_VOLUME}u`;
        const multiBody = container.map((m) => formatIngredientText(m, 'multiline')).join(' + ');
        const compactBody = container.map((m) => formatIngredientText(m, 'compact')).join(' + ');
        entries.push({
          multiline: `${baseLabel}（${capStr}）：${multiBody}`,
          compact: `[${compactLabel} ${capStr}] ${compactBody}`,
        });
      }
    }

    // 3. Oral pills packed at ≤50u
    const ingestDoses = stepDoses.filter((d) => d.method === 'INGEST');
    if (ingestDoses.length > 0) {
      const packedPills = packStepContainers(ingestDoses, PILL_MAX_VOLUME);
      for (const pill of packedPills) {
        pillCounter += 1;
        const totalVol = pill.reduce((sum, i) => sum + i.volume, 0);
        const distinctCount = new Set(pill.map((i) => i.reagentId)).size;
        const baseLabel = `${distinctCount >= 2 ? '复合药丸' : '药丸'} #${pillCounter}`;
        const compactLabel = `${distinctCount >= 2 ? '复合药丸' : '药丸'}#${pillCounter}`;
        const capStr = `${formatNumberTrim(totalVol)}/${PILL_MAX_VOLUME}u`;
        const multiBody = pill.map((m) => formatIngredientText(m, 'multiline')).join(' + ');
        const compactBody = pill.map((m) => formatIngredientText(m, 'compact')).join(' + ');
        entries.push({
          multiline: `${baseLabel}（${capStr}）：${multiBody}`,
          compact: `[${compactLabel} ${capStr}] ${compactBody}`,
        });
      }
    }

    // 4. Direct injection, IV drip (grouped by rate), touch, vapor
    const injectDoses = stepDoses.filter((d) => d.method === 'INJECT');
    if (injectDoses.length > 0) {
      const merged = mergeIngredients(injectDoses.map(toRecipeIngredient));
      const totalVol = formatNumberTrim(merged.reduce((sum, i) => sum + i.volume, 0));
      entries.push({
        multiline: `注射（${totalVol}u）：${merged.map((m) => formatIngredientText(m, 'multiline')).join(' + ')}`,
        compact: `[注射 ${totalVol}u] ${merged.map((m) => formatIngredientText(m, 'compact')).join(' + ')}`,
      });
    }

    const ivDoses = stepDoses.filter((d) => d.method === 'IV_DRIP');
    if (ivDoses.length > 0) {
      const ivByRate = new Map<string, DoseEvent[]>();
      for (const d of ivDoses) {
        const rateKey = formatNumberTrim(d.ivRate);
        const arr = ivByRate.get(rateKey) ?? [];
        arr.push(d);
        ivByRate.set(rateKey, arr);
      }
      for (const [rateStr, rateGroup] of ivByRate.entries()) {
        const merged = mergeIngredients(rateGroup.map(toRecipeIngredient));
        const totalVol = formatNumberTrim(merged.reduce((sum, i) => sum + i.volume, 0));
        entries.push({
          multiline: `静脉滴注（${totalVol}u · ${rateStr}u/t）：${merged.map((m) => formatIngredientText(m, 'multiline')).join(' + ')}`,
          compact: `[静滴 ${totalVol}u · ${rateStr}u/t] ${merged.map((m) => formatIngredientText(m, 'compact')).join(' + ')}`,
        });
      }
    }

    const touchDoses = stepDoses.filter((d) => d.method === 'TOUCH');
    if (touchDoses.length > 0) {
      const merged = mergeIngredients(touchDoses.map(toRecipeIngredient));
      const totalVol = formatNumberTrim(merged.reduce((sum, i) => sum + i.volume, 0));
      entries.push({
        multiline: `泼洒接触（${totalVol}u）：${merged.map((m) => formatIngredientText(m, 'multiline')).join(' + ')}`,
        compact: `[接触 ${totalVol}u] ${merged.map((m) => formatIngredientText(m, 'compact')).join(' + ')}`,
      });
    }

    const vaporDoses = stepDoses.filter((d) => d.method === 'VAPOR');
    if (vaporDoses.length > 0) {
      const merged = mergeIngredients(vaporDoses.map(toRecipeIngredient));
      const totalVol = formatNumberTrim(merged.reduce((sum, i) => sum + i.volume, 0));
      entries.push({
        multiline: `蒸气喷洒（${totalVol}u）：${merged.map((m) => formatIngredientText(m, 'multiline')).join(' + ')}`,
        compact: `[蒸气 ${totalVol}u] ${merged.map((m) => formatIngredientText(m, 'compact')).join(' + ')}`,
      });
    }

    stepResults.push({ time: t, entries });
  }

  if (options.format === 'compact') {
    const compactText = isMultiStep
      ? stepResults
          .map((step) => `[t=${step.time}s] ${step.entries.map((e) => e.compact).join(' | ')}`)
          .join(' → ')
      : stepResults
          .flatMap((step) => step.entries.map((e) => e.compact))
          .join(' | ');
    return cleanTitle ? `${cleanTitle}: ${compactText}` : compactText;
  }

  const lines: string[] = [`【${cleanTitle || '给药配方'}】`];

  if (!isMultiStep) {
    lines.push('成品配制：');
    const allEntries = stepResults.flatMap((s) => s.entries);
    allEntries.forEach((entry, idx) => {
      lines.push(`  ${idx + 1}. ${entry.multiline}`);
    });
  } else {
    lines.push('配制与施药步骤：');
    stepResults.forEach((step, idx) => {
      lines.push(`  第 ${idx + 1} 步 [t=${step.time}s]`);
      for (const entry of step.entries) {
        lines.push(`    - ${entry.multiline}`);
      }
    });
  }

  return lines.join('\n');
}
