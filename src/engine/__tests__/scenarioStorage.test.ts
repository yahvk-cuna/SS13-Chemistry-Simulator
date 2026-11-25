import { describe, expect, it } from 'vitest';
import { createDefaultDose } from '../regimenStorage';
import { REAGENTS } from '../reagents';
import {
  createBlankScenario,
  getScenarioHistoryUrl,
  makeBasePatient,
  tryReadScenarioFromHash,
} from '../scenarioShare';
import {
  SCENARIO_STORAGE_KEY,
  clearScenarioStorage,
  loadScenarioFromStorage,
  saveScenarioToStorage,
  type StorageLike,
} from '../scenarioStorage';
import type { SimScenario } from '../types';

function createFakeStorage(): { storage: StorageLike; map: Map<string, string> } {
  const map = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
  return { storage, map };
}

describe('scenarioStorage', () => {
  it('round-trips a full scenario including doses, allergies, and chemicalAllergy', () => {
    const { storage, map } = createFakeStorage();
    const scenario: SimScenario = {
      patient: makeBasePatient({
        brute: 45,
        burn: 18,
        liverType: 'cyber_t2',
        allergies: ['libital', 'epinephrine'],
        chemicalAllergy: true,
        organs: {
          liver: 30,
          heart: 12,
          lungs: 0,
          stomach: 5,
          brain: 0,
          eyes: 0,
          ears: 0,
        },
      }),
      doses: [
        {
          ...createDefaultDose(REAGENTS.libital),
          method: 'PATCH',
          volume: 15,
          purity: 0.75,
          patchGroup: 1,
        },
        {
          ...createDefaultDose(REAGENTS.epinephrine),
          method: 'IV_DRIP',
          volume: 20,
          startTime: 10,
          ivRate: 2.5,
          enabled: false,
        },
      ],
      durationSeconds: 300,
      rngMode: 'random',
      seed: 98765,
    };

    const saved = saveScenarioToStorage(scenario, storage);
    expect(saved).toBe(true);
    expect(typeof map.get(SCENARIO_STORAGE_KEY)).toBe('string');
    expect((map.get(SCENARIO_STORAGE_KEY) ?? '').length).toBeGreaterThan(0);

    const loaded = loadScenarioFromStorage(storage);
    expect(loaded).not.toBeNull();
    expect(loaded?.patient).toEqual(scenario.patient);
    expect(loaded?.durationSeconds).toBe(scenario.durationSeconds);
    expect(loaded?.rngMode).toBe(scenario.rngMode);
    expect(loaded?.seed).toBe(scenario.seed);
    expect(loaded?.patient.allergies).toEqual(['libital', 'epinephrine']);
    expect(loaded?.patient.chemicalAllergy).toBe(true);
    expect(loaded?.doses).toHaveLength(2);
    expect(loaded?.doses.map(({ id: _id, ...rest }) => rest)).toEqual(
      scenario.doses.map(({ id: _id, ...rest }) => rest),
    );
  });

  it('returns null when storage is empty', () => {
    const { storage } = createFakeStorage();
    expect(loadScenarioFromStorage(storage)).toBeNull();
  });

  it('returns null when storage contains a corrupted payload string', () => {
    const { storage, map } = createFakeStorage();
    map.set(SCENARIO_STORAGE_KEY, 'not!valid!payload');
    expect(loadScenarioFromStorage(storage)).toBeNull();

    map.set(SCENARIO_STORAGE_KEY, 'AQ_corrupted_truncated');
    expect(loadScenarioFromStorage(storage)).toBeNull();
  });

  it('silently handles storage exceptions without throwing', () => {
    const throwingStorage: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const scenario: SimScenario = {
      patient: makeBasePatient({ tox: 20 }),
      doses: [],
      durationSeconds: 180,
      rngMode: 'expected',
      seed: 42,
    };

    expect(() => saveScenarioToStorage(scenario, throwingStorage)).not.toThrow();
    expect(saveScenarioToStorage(scenario, throwingStorage)).toBe(false);

    expect(() => loadScenarioFromStorage(throwingStorage)).not.toThrow();
    expect(loadScenarioFromStorage(throwingStorage)).toBeNull();

    expect(() => clearScenarioStorage(throwingStorage)).not.toThrow();
    expect(clearScenarioStorage(throwingStorage)).toBe(false);

    expect(saveScenarioToStorage(scenario, null)).toBe(false);
    expect(loadScenarioFromStorage(null)).toBeNull();
    expect(clearScenarioStorage(null)).toBe(false);
  });

  it('returns null after clearing stored scenario', () => {
    const { storage } = createFakeStorage();
    const scenario: SimScenario = {
      patient: makeBasePatient({ brute: 30, chemicalAllergy: true }),
      doses: [createDefaultDose(REAGENTS.aiuri)],
      durationSeconds: 120,
      rngMode: 'expected',
      seed: 42,
    };

    expect(saveScenarioToStorage(scenario, storage)).toBe(true);
    expect(loadScenarioFromStorage(storage)).not.toBeNull();

    expect(clearScenarioStorage(storage)).toBe(true);
    expect(loadScenarioFromStorage(storage)).toBeNull();
  });
});

describe('getScenarioHistoryUrl', () => {
  it('returns clean pathname + search without hash for blank scenarios', () => {
    const blank = createBlankScenario();
    expect(getScenarioHistoryUrl(blank, { pathname: '/sim/', search: '?v=1' })).toBe('/sim/?v=1');
  });

  it('appends decodable #s=... hash for non-blank scenarios', () => {
    const scenario: SimScenario = {
      patient: makeBasePatient({ brute: 42, burn: 15 }),
      doses: [createDefaultDose(REAGENTS.libital)],
      durationSeconds: 180,
      rngMode: 'expected',
      seed: 42,
    };
    const url = getScenarioHistoryUrl(scenario, { pathname: '/', search: '' });
    expect(url.startsWith('/#s=')).toBe(true);
    const hash = url.slice(1);
    const { scenario: decoded, error } = tryReadScenarioFromHash(hash);
    expect(error).toBeNull();
    expect(decoded?.patient.brute).toBe(42);
    expect(decoded?.patient.burn).toBe(15);
    expect(decoded?.doses).toHaveLength(1);
    expect(decoded?.doses[0].reagentId).toBe('libital');
  });
});
