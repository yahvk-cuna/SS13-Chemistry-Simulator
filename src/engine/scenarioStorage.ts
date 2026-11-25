import { decodeScenarioPayload, encodeScenarioPayload } from './scenarioShare';
import type { SimScenario } from './types';

export const SCENARIO_STORAGE_KEY = 'ss13-chem-sim:scenario:v1';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage !== undefined) return storage;
  try {
    return typeof globalThis !== 'undefined' && globalThis.localStorage
      ? globalThis.localStorage
      : null;
  } catch {
    return null;
  }
}

export function saveScenarioToStorage(
  scenario: SimScenario,
  storage?: StorageLike | null,
): boolean {
  const target = resolveStorage(storage);
  if (!target) return false;
  try {
    const payload = encodeScenarioPayload(scenario);
    target.setItem(SCENARIO_STORAGE_KEY, payload);
    return true;
  } catch {
    return false;
  }
}

export function loadScenarioFromStorage(
  storage?: StorageLike | null,
): SimScenario | null {
  const target = resolveStorage(storage);
  if (!target) return null;
  try {
    const raw = target.getItem(SCENARIO_STORAGE_KEY);
    if (!raw) return null;
    return decodeScenarioPayload(raw);
  } catch {
    return null;
  }
}

export function clearScenarioStorage(
  storage?: StorageLike | null,
): boolean {
  const target = resolveStorage(storage);
  if (!target) return false;
  try {
    target.removeItem(SCENARIO_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
