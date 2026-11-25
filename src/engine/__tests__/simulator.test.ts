import { describe, expect, it } from 'vitest';
import { BLOOD_VOLUME_NORMAL, BLOOD_VOLUME_OKAY } from '../constants';
import {
  EFFECT_TRAITS,
  EXTREME_ALLERGY_CANDIDATES,
  REAGENTS,
  REAGENT_LIST,
  getReagentTraits,
  isChemicalAllergyTrigger,
  isExtremeAllergyCandidate,
  isNoAllergyReagent,
  rollRandomAllergies,
} from '../reagents';
import {
  cloneRegimenDoses,
  createDefaultDose,
  createOrUpdateSavedRegimen,
  formatRegimenPlainText,
  parseRegimensJson,
  serializeRegimensJson,
  autoPackPatchGroups,
} from '../regimenStorage';
import {
  REAGENT_SHARE_ORDER,
  buildScenarioShareUrl,
  createBlankScenario,
  decodeScenarioPayload,
  encodeScenarioPayload,
  makeBasePatient,
  parseScenarioFromUrlOrText,
  tryReadScenarioFromHash,
} from '../scenarioShare';
import { runSimulation } from '../simulator';
import type { DoseEvent, SimScenario } from '../types';

function dose(
  reagentId: string,
  volume: number,
  overrides: Partial<DoseEvent> = {},
): DoseEvent {
  return {
    id: `t-${reagentId}-${Math.random()}`,
    reagentId,
    volume,
    method: 'INJECT',
    startTime: 0,
    purity: reagentId === 'libital' || reagentId === 'helbital' || reagentId === 'probital' || reagentId === 'aiuri' || reagentId === 'lenturi' || reagentId === 'hercuri' || reagentId === 'multiver' || reagentId === 'seiver' || reagentId === 'syriniver' || reagentId === 'tirimol' || reagentId === 'convermol' || reagentId === 'penthrite' || reagentId === 'anacea' ? 0.75 : 1.0,
    temp: 300,
    ivRate: 5,
    enabled: true,
    ...overrides,
  };
}

describe('Tianguan13 Pharmacology Simulator', () => {
  it('heals exact Libital brute & net liver damage at 75% and 100% purity', () => {
    const res75 = runSimulation(
      makeBasePatient({ brute: 50 }),
      [dose('libital', 10, { purity: 0.75 })],
      { durationSeconds: 10, rngMode: 'expected', seed: 1 },
    );
    // Tick 1: brute 50 -> 47.0 (-3.0), liver 0 + 0.3 - 0.1 passive regen = 0.2
    expect(res75.snapshots[1].brute).toBeCloseTo(47.0, 2);
    expect(res75.snapshots[1].organs.liver.damage).toBeCloseTo(0.2, 2);

    const res100 = runSimulation(
      makeBasePatient({ brute: 50 }),
      [dose('libital', 10, { purity: 1.0 })],
      { durationSeconds: 10, rngMode: 'expected', seed: 1 },
    );
    // Tick 1 at 100% purity: 3 * (1 / 0.75) = 4.0 brute healed
    expect(res100.snapshots[1].brute).toBeCloseTo(46.0, 2);
  });

  it('digests oral pills from stomach to blood using exact Tianguan13 stomach drip rate', () => {
    const res = runSimulation(
      makeBasePatient({ brute: 60 }),
      [dose('sal_acid', 20, { method: 'INGEST', purity: 1.0 })],
      { durationSeconds: 10, rngMode: 'expected', seed: 1 },
    );
    // Tick 1: 20u enters stomach; transfer = (round(0.05*20, 0.05) + max(0.1, 0.25)) * 2 = 2.5u
    // Stomach left: 17.5u; Blood metabolizes 0.2u -> 2.3u left in blood
    const s1 = res.snapshots[1];
    expect(s1.stomachReagents[0]?.volume).toBeCloseTo(17.5, 2);
    expect(s1.bloodReagents[0]?.volume).toBeCloseTo(2.3, 2);
  });

  it('scales overdose threshold with purity and converts reagents below inverse threshold', () => {
    // Probital base OD = 20 @ 75% purity -> 25 @ 100% purity
    const noOd = runSimulation(
      makeBasePatient({ brute: 40 }),
      [dose('probital', 22, { purity: 1.0, method: 'INJECT' })],
      { durationSeconds: 10, rngMode: 'expected', seed: 1 },
    );
    expect(noOd.summary.triggeredODs).toEqual([]);

    const withOd = runSimulation(
      makeBasePatient({ brute: 40 }),
      [dose('probital', 26, { purity: 1.0, method: 'INJECT' })],
      { durationSeconds: 10, rngMode: 'expected', seed: 1 },
    );
    expect(withOd.summary.triggeredODs).toContain('益生泰尔');

    // Lenturi inverse threshold in Tianguan13 is < 0.40 -> lentslurri
    const invLenturi = runSimulation(
      makeBasePatient({ burn: 40 }),
      [dose('lenturi', 10, { purity: 0.35 })],
      { durationSeconds: 10, rngMode: 'expected', seed: 1 },
    );
    expect(invLenturi.snapshots[1].bloodReagents.some((r) => r.id === 'lentslurri')).toBe(true);
    expect(invLenturi.snapshots[1].burn).toBeCloseTo(40, 2);
  });

  it('keeps sticky overdose active even after blood volume drops below threshold', () => {
    const res = runSimulation(
      makeBasePatient({ brute: 80 }),
      [dose('sal_acid', 25.2, { purity: 1.0 })],
      { durationSeconds: 20, rngMode: 'expected', seed: 1 },
    );
    // Tick 1: starts at 25.2 >= 25 -> OD triggered, metabolizes 0.2 -> 25.0
    // Tick 2: starts at 25.0 -> 24.8, still overdosed!
    // Net brute on tick 1: 80 + 4.5(OD) - 4.0(heal) = 80.5; tick 2: 81.0
    expect(res.snapshots[1].brute).toBeCloseTo(80.5, 2);
    expect(res.snapshots[2].bloodReagents[0]?.volume).toBeCloseTo(24.8, 2);
    expect(res.snapshots[2].bloodReagents[0]?.overdosed).toBe(true);
    expect(res.snapshots[2].brute).toBeCloseTo(81.0, 2);
  });

  it('converts injected Syriniver into Musiver scaled by liver health', () => {
    const healthy = runSimulation(
      makeBasePatient({ tox: 50 }),
      [dose('syriniver', 20, { method: 'INJECT', purity: 0.75 })],
      { durationSeconds: 6, rngMode: 'expected', seed: 1 },
    );
    // 20u injected -> instant 3.0 tox heal, 80% (16u) converted to musiver, 4u syriniver remains
    // Tick 1 metabolizes 0.3u syriniver -> 3.7u, 0.1u musiver -> 15.9u (also syriniver purges 0.27? No, issyrinormusc skips both!)
    const s1 = healthy.snapshots[1];
    expect(s1.bloodReagents.find((r) => r.id === 'syriniver')?.volume).toBeCloseTo(3.7, 2);
    expect(s1.bloodReagents.find((r) => r.id === 'musiver')?.volume).toBeCloseTo(15.9, 2);
    expect(healthy.summary.triggeredODs).toEqual([]);

    const badLiver = runSimulation(
      makeBasePatient({ tox: 50, organs: { liver: 80, heart: 0, lungs: 0, stomach: 0, brain: 0, eyes: 0, ears: 0 } }),
      [dose('syriniver', 20, { method: 'INJECT', purity: 0.75 })],
      { durationSeconds: 6, rngMode: 'expected', seed: 1 },
    );
    // (100 - 80)/100 = 20% converted (4u musiver), 16u syriniver remains -> Syriniver OD (>= 6u)!
    expect(badLiver.summary.triggeredODs).toContain('木泰尔');
  });

  it('handles Multiver unique-med non-purge threshold, 100% purity bonus, and Anacea block', () => {
    // 2 meds at 75% purity -> medibonus=2 < 3 -> Multiver purges Libital
    const twoMeds75 = runSimulation(
      makeBasePatient({ tox: 30, brute: 30 }),
      [dose('multiver', 10, { purity: 0.75 }), dose('libital', 10, { purity: 0.75 })],
      { durationSeconds: 4, rngMode: 'expected', seed: 1 },
    );
    // Libital loses 0.2 (metab) + 3.0 (multiver purge) = 3.2 -> 6.8u left
    expect(twoMeds75.snapshots[1].bloodReagents.find((r) => r.id === 'libital')?.volume).toBeCloseTo(6.8, 2);

    // 2 meds with 100% pure Multiver -> medibonus=3 -> does NOT purge Libital!
    const twoMeds100 = runSimulation(
      makeBasePatient({ tox: 30, brute: 30 }),
      [dose('multiver', 10, { purity: 1.0 }), dose('libital', 10, { purity: 0.75 })],
      { durationSeconds: 4, rngMode: 'expected', seed: 1 },
    );
    expect(twoMeds100.snapshots[1].bloodReagents.find((r) => r.id === 'libital')?.volume).toBeCloseTo(9.8, 2);

    // Anacea blocks Multiver purging of amatoxin
    const blocked = runSimulation(
      makeBasePatient({ tox: 10 }),
      [dose('multiver', 10, { purity: 0.75 }), dose('amatoxin', 10, { purity: 1.0 }), dose('anacea', 5, { purity: 0.75 })],
      { durationSeconds: 4, rngMode: 'expected', seed: 1 },
    );
    expect(blocked.snapshots[1].bloodReagents.find((r) => r.id === 'amatoxin')?.volume).toBeCloseTo(9.6, 2);
  });

  it('triggers Penthrite + Epinephrine in-body explosion and clears blood', () => {
    const res = runSimulation(
      makeBasePatient({ brute: 20, oxy: 20 }),
      [dose('penthrite', 10, { purity: 0.75 }), dose('epinephrine', 10, { startTime: 4, purity: 1.0 })],
      { durationSeconds: 12, rngMode: 'expected', seed: 1 },
    );
    expect(res.events.some((e) => e.title.includes('体内化学爆炸'))).toBe(true);
    const snapAfter = res.snapshots[2]; // t=4s
    expect(snapAfter.bloodReagents.length).toBe(0);
    expect(snapAfter.brute).toBeGreaterThan(50);
  });

  it('converts Nutriment into Peptides when Probital oral spawns Metafactor', () => {
    const res = runSimulation(
      makeBasePatient({ brute: 50, burn: 20 }),
      [
        dose('probital', 10, { method: 'INGEST', purity: 0.75 }),
        dose('nutriment', 10, { method: 'INGEST', startTime: 2, purity: 0.5 }),
      ],
      { durationSeconds: 20, rngMode: 'expected', seed: 1 },
    );
    expect(res.reagentsSeen).toContain('metafactor');
    expect(res.reagentsSeen).toContain('peptides');
  });

  it('activates Cryoxadone only below 273.15K and heals wounds at counter 33', () => {
    const warm = runSimulation(
      makeBasePatient({ brute: 50, burn: 50, bodyTemp: 310.15 }),
      [dose('cryoxadone', 15, { purity: 1.0 })],
      { durationSeconds: 10, rngMode: 'expected', seed: 1 },
    );
    expect(warm.snapshots[1].brute).toBeCloseTo(50, 2);

    const cold = runSimulation(
      makeBasePatient({
        brute: 45,
        burn: 45,
        tox: 30,
        oxy: 30,
        woundSeverity: 'severe',
        woundCount: 2,
        bleedFlow: 1.5,
        bodyTemp: 220,
        ambientTemp: 170,
        environment: 'cryo',
        unconscious: true,
      }),
      [dose('cryoxadone', 30, { purity: 1.0 })],
      { durationSeconds: 120, rngMode: 'expected', seed: 1 },
    );
    expect(cold.snapshots[cold.snapshots.length - 1].woundsRemaining).toBe(0);
    expect(cold.snapshots[cold.snapshots.length - 1].health).toBeGreaterThan(95);
  });

  it('stops non-self-consuming reagents when liverless while Higadrite still metabolizes', () => {
    const res = runSimulation(
      makeBasePatient({ brute: 40, liverType: 'none' }),
      [dose('libital', 10, { purity: 0.75 }), dose('higadrite', 10, { purity: 1.0 })],
      { durationSeconds: 10, rngMode: 'expected', seed: 1 },
    );
    // Libital stays at 10u (not metabolized), Higadrite drops 0.4u/tick -> 9.6u on tick 1
    // Higadrite grants TRAIT_STABLELIVER so tox stays 0
    expect(res.snapshots[1].bloodReagents.find((r) => r.id === 'libital')?.volume).toBeCloseTo(10.0, 2);
    expect(res.snapshots[1].bloodReagents.find((r) => r.id === 'higadrite')?.volume).toBeCloseTo(9.6, 2);
    expect(res.snapshots[1].tox).toBeCloseTo(0, 2);
    expect(res.snapshots[1].brute).toBeCloseTo(40, 2);
  });

  it('encodes and decodes blank and complex scenarios cleanly via compact binary shareable URLs', () => {
    expect(new Set(REAGENT_SHARE_ORDER).size).toBe(REAGENT_LIST.length);
    for (const r of REAGENT_LIST) {
      expect(REAGENT_SHARE_ORDER).toContain(r.id);
    }

    const blank = createBlankScenario();
    const blankPayload = encodeScenarioPayload(blank);
    expect(blankPayload).toBe('AQ');
    expect(blankPayload.length).toBeLessThanOrEqual(4);
    const decodedBlank = decodeScenarioPayload(blankPayload);
    expect(decodedBlank.patient).toEqual(blank.patient);
    expect(decodedBlank.doses).toEqual([]);
    expect(decodedBlank.durationSeconds).toBe(180);
    expect(decodedBlank.rngMode).toBe('expected');

    const typical: SimScenario = {
      patient: makeBasePatient({ brute: 55, burn: 45, tox: 20, oxy: 15 }),
      doses: [
        dose('libital', 15, { method: 'PATCH', startTime: 0, purity: 1.0, patchGroup: 1 }),
        dose('lenturi', 15, { method: 'PATCH', startTime: 0, purity: 1.0, patchGroup: 1 }),
        dose('multiver', 10, { method: 'INGEST', startTime: 0, purity: 0.75 }),
      ],
      durationSeconds: 180,
      rngMode: 'expected',
      seed: 42,
    };
    const typicalPayload = encodeScenarioPayload(typical);
    expect(typicalPayload.length).toBeLessThanOrEqual(32);

    const complex: SimScenario = {
      patient: makeBasePatient({
        brute: 55,
        burn: 32.5,
        tox: 18,
        oxy: 12,
        stamina: 40,
        liverType: 'cyber_t2',
        metabolismEfficiency: 1.25,
        bloodVolume: 420,
        bleedFlow: 2.5,
        woundSeverity: 'severe',
        woundCount: 2,
        bodyTemp: 240,
        ambientTemp: 170,
        environment: 'cryo',
        onFire: true,
        fireStacks: 6,
        irradiated: true,
        unconscious: true,
        inStasis: true,
        touchProtection: 0.5,
        husked: true,
        allergies: ['sal_acid', 'atropine'],
        chemicalAllergy: true,
        organs: { liver: 25, heart: 10, lungs: 15, stomach: 5, brain: 30, eyes: 12, ears: 8 },
      }),
      doses: [
        dose('sal_acid', 15, { method: 'PATCH', startTime: 0, purity: 1.0, enabled: true, patchGroup: 1 }),
        dose('atropine', 10, { method: 'PATCH', startTime: 0, purity: 1.0, enabled: true, patchGroup: 1 }),
        dose('seiver', 10, { method: 'INJECT', startTime: 6, purity: 0.75, temp: 220, enabled: false }),
        dose('syriniver', 20, { method: 'IV_DRIP', startTime: 4, purity: 0.75, ivRate: 1.5, enabled: true }),
      ],
      durationSeconds: 300,
      rngMode: 'random',
      seed: 9876,
    };

    const complexPayload = encodeScenarioPayload(complex);
    expect(complexPayload.length).toBeLessThanOrEqual(100);

    const shareUrl = buildScenarioShareUrl(complex, 'https://chem.example.org/sim/');
    expect(shareUrl.startsWith('https://chem.example.org/sim/#s=')).toBe(true);

    const parsedFromFullUrl = parseScenarioFromUrlOrText(shareUrl);
    expect(parsedFromFullUrl.patient).toEqual(complex.patient);
    expect(parsedFromFullUrl.durationSeconds).toBe(300);
    expect(parsedFromFullUrl.rngMode).toBe('random');
    expect(parsedFromFullUrl.seed).toBe(9876);
    expect(parsedFromFullUrl.doses.length).toBe(4);
    expect(parsedFromFullUrl.doses[0].method).toBe('PATCH');
    expect(parsedFromFullUrl.doses[0].purity).toBe(1);
    expect(parsedFromFullUrl.doses[0].patchGroup).toBe(1);
    expect(parsedFromFullUrl.doses[1].patchGroup).toBe(1);
    expect(parsedFromFullUrl.doses[2].temp).toBe(220);
    expect(parsedFromFullUrl.doses[2].enabled).toBe(false);
    expect(parsedFromFullUrl.doses[3].ivRate).toBe(1.5);

    const hashRead = tryReadScenarioFromHash(new URL(shareUrl).hash);
    expect(hashRead.error).toBeNull();
    expect(hashRead.scenario?.patient).toEqual(complex.patient);

    // Run simulation cleanly on decoded scenario
    const simRes = runSimulation(parsedFromFullUrl.patient, parsedFromFullUrl.doses, {
      durationSeconds: parsedFromFullUrl.durationSeconds,
      rngMode: parsedFromFullUrl.rngMode,
      seed: parsedFromFullUrl.seed,
    });
    expect(simRes.snapshots.length).toBeGreaterThan(10);

    // Also supports bare payload string and #s= fragment; rejects malformed/truncated/JSON strings cleanly
    const fromBare = parseScenarioFromUrlOrText(complexPayload);
    expect(fromBare.patient.allergies).toEqual(['sal_acid', 'atropine']);
    const badHash = tryReadScenarioFromHash('#s=invalid_payload!!!');
    expect(badHash.scenario).toBeNull();
    expect(badHash.error).toBeTruthy();

    const truncatedHash = tryReadScenarioFromHash(`#s=${complexPayload.slice(0, -4)}`);
    expect(truncatedHash.scenario).toBeNull();
    expect(truncatedHash.error).toBeTruthy();

    const legacyJson = tryReadScenarioFromHash('#s=eyJ2IjoxfQ');
    expect(legacyJson.scenario).toBeNull();
    expect(legacyJson.error).toBeTruthy();
  });

  it('simulates proportional 0.75u/t release for composite patches and pauses in stasis', () => {
    const groupedRes = runSimulation(
      makeBasePatient({ brute: 30, burn: 30 }),
      [
        dose('libital', 15, { method: 'PATCH', purity: 1.0, patchGroup: 1 }),
        dose('lenturi', 15, { method: 'PATCH', purity: 1.0, patchGroup: 1 }),
      ],
      { durationSeconds: 6, rngMode: 'expected', seed: 1 },
    );

    const s1 = groupedRes.snapshots[1];
    // 15u + 15u share 0.75u/t -> 0.375u each into blood; each metabolizes 0.2u -> 0.175u left
    expect(s1.activeTransfers.length).toBe(1);
    expect(s1.activeTransfers[0].remaining).toBeCloseTo(29.25, 2);
    expect(s1.bloodReagents.find((r) => r.id === 'libital')?.volume).toBeCloseTo(0.175, 3);
    expect(s1.bloodReagents.find((r) => r.id === 'lenturi')?.volume).toBeCloseTo(0.175, 3);

    // Compare with standalone patches (0.75u each -> 0.55u left after 0.2u metabolism)
    const separateRes = runSimulation(
      makeBasePatient({ brute: 30, burn: 30 }),
      [
        dose('libital', 15, { method: 'PATCH', purity: 1.0 }),
        dose('lenturi', 15, { method: 'PATCH', purity: 1.0 }),
      ],
      { durationSeconds: 6, rngMode: 'expected', seed: 1 },
    );
    expect(separateRes.snapshots[1].bloodReagents.find((r) => r.id === 'libital')?.volume).toBeCloseTo(0.55, 3);

    // Composite patch pauses completely while in stasis
    const stasisRes = runSimulation(
      makeBasePatient({ brute: 30, burn: 30, inStasis: true }),
      [
        dose('libital', 15, { method: 'PATCH', purity: 1.0, patchGroup: 1 }),
        dose('lenturi', 15, { method: 'PATCH', purity: 1.0, patchGroup: 1 }),
      ],
      { durationSeconds: 6, rngMode: 'expected', seed: 1 },
    );
    expect(stasisRes.snapshots[1].activeTransfers[0].remaining).toBeCloseTo(30, 2);
    expect(stasisRes.snapshots[1].bloodReagents).toEqual([]);
  });

  it('auto-packs patches ≤40u cleanly and avoids explosive penthrite combinations', () => {
    const packed = autoPackPatchGroups([
      dose('libital', 25, { method: 'PATCH', startTime: 0, purity: 1.0 }),
      dose('lenturi', 15, { method: 'PATCH', startTime: 0, purity: 1.0 }),
      dose('aiuri', 20, { method: 'PATCH', startTime: 0, purity: 1.0 }),
      dose('penthrite', 10, { method: 'PATCH', startTime: 10, purity: 0.75 }),
      dose('epinephrine', 10, { method: 'PATCH', startTime: 10, purity: 1.0 }),
      dose('sal_acid', 15, { method: 'INJECT', startTime: 0, purity: 1.0 }),
    ]);

    // t=0: 25 + 15 = 40u grouped as #1; 20u cannot fit and stays single -> ungrouped
    expect(packed[0].patchGroup).toBe(1);
    expect(packed[1].patchGroup).toBe(1);
    expect(packed[2].patchGroup).toBeUndefined();
    // t=10: penthrite + epinephrine must NOT share a patch
    expect(packed[3].patchGroup).toBeUndefined();
    expect(packed[4].patchGroup).toBeUndefined();
    expect(packed[5].patchGroup).toBeUndefined();
  });

  it('exports recipe-style plain text with container packing and conditional timestamps', () => {
    // Single-step plan (all t=0s): must omit timestamps and keep drug/volume/purity + merged containers
    const singleStepDoses: DoseEvent[] = [
      dose('libital', 15, { method: 'PATCH', startTime: 0, purity: 1.0, enabled: true }),
      dose('lenturi', 15, { method: 'PATCH', startTime: 0, purity: 1.0, enabled: true }),
      dose('multiver', 15, { method: 'INGEST', startTime: 0, purity: 0.75, enabled: true }),
      dose('salglu_solution', 30, { method: 'INGEST', startTime: 0, purity: 1.0, enabled: true }),
    ];

    expect(formatRegimenPlainText([], { format: 'multiline' })).toBe('');

    const singleMulti = formatRegimenPlainText(singleStepDoses, {
      format: 'multiline',
      title: '外伤标准救治',
    });
    expect(singleMulti).toContain('【外伤标准救治】');
    expect(singleMulti).not.toContain('原料');
    expect(singleMulti).toContain('成品配制：');
    expect(singleMulti).toContain('复合贴片 #1（30/40u）：利比特 15u（100%） + 伦图里 15u（100%）');
    expect(singleMulti).toContain('复合药丸 #1（45/50u）：盐水葡萄糖溶液 30u（100%） + 多功能解毒剂 15u（75%）');
    expect(singleMulti).not.toContain('t=');

    const singleCompact = formatRegimenPlainText(singleStepDoses, {
      format: 'compact',
    });
    expect(singleCompact).not.toContain('t=');
    expect(singleCompact).toContain('[复合贴片#1 30/40u]');
    expect(singleCompact).toContain('[复合药丸#1 45/50u]');

    // Multi-step plan + explicit patch group + over-50u pill split + incompatible container avoidance
    const multiStepDoses: DoseEvent[] = [
      dose('penthrite', 10, { method: 'PATCH', startTime: 0, purity: 0.75, enabled: true }),
      dose('epinephrine', 10, { method: 'PATCH', startTime: 0, purity: 1.0, enabled: true }),
      dose('seiver', 10, { method: 'INJECT', startTime: 8, purity: 0.75, temp: 220, enabled: true }),
      dose('syriniver', 20, { method: 'IV_DRIP', startTime: 8, purity: 0.75, ivRate: 1.5, enabled: true }),
      dose('libital', 15, { method: 'PATCH', startTime: 12, purity: 1.0, patchGroup: 2, enabled: true }),
      dose('aiuri', 15, { method: 'PATCH', startTime: 12, purity: 1.0, patchGroup: 2, enabled: true }),
      dose('lenturi', 12, { method: 'INGEST', startTime: 4, purity: 0.85, enabled: false }),
    ];

    const multiRecipe = formatRegimenPlainText(multiStepDoses, {
      format: 'multiline',
      includeDisabled: false,
    });
    expect(multiRecipe).toContain('配制与施药步骤：');
    expect(multiRecipe).toContain('第 1 步 [t=0s]');
    expect(multiRecipe).toContain('第 2 步 [t=8s]');
    expect(multiRecipe).toContain('第 3 步 [t=12s]');
    expect(multiRecipe).toContain('复合贴片 #3（30/40u）：利比特 15u（100%） + 艾尤里 15u（100%）');
    expect(multiRecipe).toContain('静脉滴注（20u · 1.5u/t）：木泰尔 20u（75%）');
    expect(multiRecipe).not.toContain('伦图里');
    // Penthrite and Epinephrine must stay in separate patches (#1 and #2)
    expect(multiRecipe).not.toMatch(/复合贴片 #1.*彭斯莱特.*肾上腺素/);

    const compactAll = formatRegimenPlainText(multiStepDoses, {
      format: 'compact',
      includeDisabled: true,
    });
    expect(compactAll).toContain('[t=0s]');
    expect(compactAll).toContain('[t=4s] [药丸#1 12/50u] 伦图里 12u(85%, 禁用)');
    expect(compactAll).toContain('[t=8s]');
    expect(compactAll).toContain('220K');
    expect(compactAll).toContain('[t=12s]');
  });

  it('saves, overwrites, clones with fresh IDs, and imports/exports regimens via JSON', () => {
    const initialDoses = [
      dose('libital', 15, { purity: 0.75 }),
      dose('lenturi', 15, { purity: 0.75 }),
    ];

    // Auto-named save
    const firstSave = createOrUpdateSavedRegimen([], '', initialDoses);
    expect(firstSave.list.length).toBe(1);
    expect(firstSave.saved.name).toBe('利比特 + 伦图里');
    expect(firstSave.saved.doses.length).toBe(2);

    // Overwrite by same name
    const updatedDoses = [dose('sal_acid', 20, { purity: 1.0 })];
    const overwritten = createOrUpdateSavedRegimen(firstSave.list, '利比特 + 伦图里', updatedDoses);
    expect(overwritten.list.length).toBe(1);
    expect(overwritten.saved.id).toBe(firstSave.saved.id);
    expect(overwritten.saved.doses.length).toBe(1);
    expect(overwritten.saved.doses[0].reagentId).toBe('sal_acid');

    // Cloning assigns fresh unique DoseEvent IDs for replace/append
    const clonedA = cloneRegimenDoses(overwritten.saved.doses);
    const clonedB = cloneRegimenDoses(overwritten.saved.doses);
    expect(clonedA[0].id).not.toBe(clonedB[0].id);

    // JSON export & import roundtrip + invalid reagent filtering
    const json = serializeRegimensJson(overwritten.list);
    const reimported = parseRegimensJson(json);
    expect(reimported.length).toBe(1);
    expect(reimported[0].name).toBe('利比特 + 伦图里');
    expect(reimported[0].doses[0].reagentId).toBe('sal_acid');

    const rawDoseJson = JSON.stringify([
      { reagentId: 'oxandrolone', volume: 18, method: 'INJECT', purity: 1 },
      { reagentId: 'unknown_fake_chem', volume: 10 },
    ]);
    const fromRawArray = parseRegimensJson(rawDoseJson);
    expect(fromRawArray.length).toBe(1);
    expect(fromRawArray[0].doses.length).toBe(1);
    expect(fromRawArray[0].doses[0].reagentId).toBe('oxandrolone');

    // Overwrite by targetId preserves explicit target name
    const overwriteById = createOrUpdateSavedRegimen(overwritten.list, '利比特 + 伦图里', fromRawArray[0].doses, firstSave.saved.id);
    expect(overwriteById.saved.id).toBe(firstSave.saved.id);
    expect(overwriteById.saved.name).toBe('利比特 + 伦图里');
    expect(overwriteById.saved.doses[0].reagentId).toBe('oxandrolone');

    // Default dose presets: 100% purity, INGEST for probital, PATCH for others
    const dSynth = createDefaultDose(REAGENTS.synthflesh);
    expect(dSynth.method).toBe('PATCH');
    expect(dSynth.purity).toBe(1);

    const dProbital = createDefaultDose(REAGENTS.probital);
    expect(dProbital.method).toBe('INGEST');
    expect(dProbital.purity).toBe(1);

    const dSyriniver = createDefaultDose(REAGENTS.syriniver);
    expect(dSyriniver.method).toBe('PATCH');
    expect(dSyriniver.purity).toBe(1);
    expect(dSyriniver.volume).toBe(5);

    const dLibital = createDefaultDose(REAGENTS.libital);
    expect(dLibital.method).toBe('PATCH');
    expect(dLibital.purity).toBe(1);
    expect(dLibital.volume).toBe(15);
  });

  it('normalizes reagent targets and derives consistent mechanism traits', () => {
    const allowedTargets = new Set<string>([...EFFECT_TRAITS, '逆产物']);
    for (const r of REAGENT_LIST) {
      expect(r.targets.length).toBeGreaterThan(0);
      for (const t of r.targets) {
        expect(allowedTargets.has(t)).toBe(true);
        expect(t.includes('测试')).toBe(false);
      }
    }

    const neurineTraits = getReagentTraits(REAGENTS.neurine);
    expect(neurineTraits).toContain('大脑');
    expect(neurineTraits).toContain('死后生效');
    expect(neurineTraits).toContain('无肝可代');
    expect(neurineTraits).toContain('有逆反应');
  });

  it('classifies upstream allergy blacklist, no-allergy trait, and candidate rolls accurately', () => {
    const noAllergyIds = [
      'libital',
      'lenturi',
      'probital',
      'synthflesh',
      'coagulant',
      'seraka_extract',
      'banana_peel',
      'epinephrine',
      'diphenhydramine',
      'synaphydramine',
      'salglu_solution',
      'albuterol',
      'insulin',
      'regen_jelly',
      'strange_reagent',
      'determination',
      'honey',
      'peptides',
    ];
    for (const id of noAllergyIds) {
      const def = REAGENTS[id];
      expect(isNoAllergyReagent(def)).toBe(true);
      expect(getReagentTraits(def)).toContain('无过敏');
      expect(isExtremeAllergyCandidate(def)).toBe(false);
    }

    for (const id of ['granibitaluri', 'sal_acid', 'atropine', 'mannitol', 'mutadone']) {
      const def = REAGENTS[id];
      expect(isExtremeAllergyCandidate(def)).toBe(true);
      expect(isNoAllergyReagent(def)).toBe(false);
      expect(getReagentTraits(def)).not.toContain('无过敏');
    }

    for (const id of ['toxin', 'amatoxin', 'histamine', 'libitoil']) {
      const def = REAGENTS[id];
      expect(isNoAllergyReagent(def)).toBe(false);
      expect(isExtremeAllergyCandidate(def)).toBe(false);
    }

    expect(isChemicalAllergyTrigger(REAGENTS.mannitol)).toBe(false);
    expect(isChemicalAllergyTrigger(REAGENTS.mutadone)).toBe(false);
    expect(isChemicalAllergyTrigger(REAGENTS.sal_acid)).toBe(true);
    expect(isChemicalAllergyTrigger(REAGENTS.granibitaluri)).toBe(true);

    const rolled = rollRandomAllergies(6);
    expect(rolled.length).toBe(6);
    expect(new Set(rolled).size).toBe(6);
    expect(EXTREME_ALLERGY_CANDIDATES.length).toBe(38);
    for (const id of rolled) {
      expect(isExtremeAllergyCandidate(REAGENTS[id])).toBe(true);
    }
  });

  it('simulates Extreme Medicine Allergy toxicity, histamine OD, stomach vomit purge, and organ damage', () => {
    const res = runSimulation(
      makeBasePatient({ allergies: ['sal_acid'] }),
      [
        dose('sal_acid', 10, { purity: 1.0 }),
        dose('water', 10, { method: 'INGEST', purity: 1.0 }),
        dose('nutriment', 10, { method: 'INGEST', purity: 0.5 }),
      ],
      { durationSeconds: 12, rngMode: 'expected', seed: 7 },
    );

    const s1 = res.snapshots[1];
    // +6 tox - 3 * 0.19 (vomit relief) = 5.43
    expect(s1.tox).toBeCloseTo(5.43, 2);
    expect(s1.activeAllergens).toContain('水杨酸');
    expect(s1.bloodReagents.find((r) => r.id === 'sal_acid')?.allergyState).toBe('active');
    expect(s1.bloodReagents.find((r) => r.id === 'histamine')?.volume).toBeCloseTo(6.0, 2);

    // 6-organ pool: 10 * 0.19 / 6 = 0.3167 raw; passive healing removes 0.1 (100HP organs) or 0.2 (200HP brain)
    expect(s1.organs.lungs.damage).toBeCloseTo((10 * 0.19) / 6 - 0.1, 2);
    expect(s1.organs.eyes.damage).toBeCloseTo(0, 4);
    expect(s1.organs.ears.damage).toBeCloseTo(0, 4);

    // Both digest 1.5u -> 8.5u before vomit; non-food water purges 19% (-> 6.885u), food nutriment only loses 1.9% (-> 8.339u)
    const waterLeft = s1.stomachReagents.find((r) => r.id === 'water')?.volume ?? 0;
    const nutrimentLeft = s1.stomachReagents.find((r) => r.id === 'nutriment')?.volume ?? 0;
    expect(waterLeft).toBeCloseTo(6.885, 2);
    expect(nutrimentLeft).toBeCloseTo(8.339, 2);

    // By 12s (6 ticks), injected histamine exceeds 30u and triggers histamine OD
    expect(res.summary.triggeredAllergies).toContain('水杨酸');
    expect(res.summary.triggeredODs).toContain('组胺');
  });

  it('blocks Extreme Medicine Allergy with Epinephrine, pauses consumption, and resumes after depletion', () => {
    // Epinephrine metabolizes at 0.1u/tick, so 0.4u lasts Ticks 1..4 and depletes before Tick 5
    const res = runSimulation(
      makeBasePatient({ brute: 50, allergies: ['sal_acid'] }),
      [
        dose('sal_acid', 10, { purity: 1.0 }),
        dose('epinephrine', 0.4, { purity: 1.0 }),
      ],
      { durationSeconds: 12, rngMode: 'expected', seed: 11 },
    );

    const s1 = res.snapshots[1];
    expect(s1.blockedAllergens).toContain('水杨酸');
    expect(s1.activeAllergens).toEqual([]);
    expect(s1.tox).toBeCloseTo(0, 3);
    expect(s1.bloodReagents.some((r) => r.id === 'histamine')).toBe(false);
    // Allergen metabolism is paused while Epinephrine is present, yet on_mob_life still heals brute
    expect(s1.bloodReagents.find((r) => r.id === 'sal_acid')?.volume).toBeCloseTo(10.0, 2);
    expect(s1.bloodReagents.find((r) => r.id === 'sal_acid')?.allergyState).toBe('blocked');
    expect(s1.brute).toBeLessThan(50);

    const s4 = res.snapshots[4];
    expect(s4.tox).toBeCloseTo(0, 3);
    expect(s4.bloodReagents.find((r) => r.id === 'sal_acid')?.volume).toBeCloseTo(10.0, 2);

    // Tick 5 (t=10s): Epinephrine gone -> allergy bursts & consumption resumes
    const s5 = res.snapshots[5];
    expect(s5.activeAllergens).toContain('水杨酸');
    expect(s5.blockedAllergens).toEqual([]);
    expect(s5.tox).toBeGreaterThan(5);
    expect(s5.bloodReagents.find((r) => r.id === 'histamine')?.volume).toBeCloseTo(6.0, 2);
    expect(s5.bloodReagents.find((r) => r.id === 'sal_acid')?.volume).toBeCloseTo(9.8, 2);
  });

  it('runs Extreme Medicine Allergy cleanly in seeded random mode', () => {
    const res = runSimulation(
      makeBasePatient({ brute: 30, allergies: ['sal_acid'] }),
      [dose('sal_acid', 15, { purity: 1.0 }), dose('water', 15, { method: 'INGEST', purity: 1.0 })],
      { durationSeconds: 60, rngMode: 'random', seed: 123 },
    );
    expect(res.summary.triggeredAllergies).toContain('水杨酸');
    expect(res.events.some((e) => e.category === 'allergy')).toBe(true);
    for (const s of res.snapshots) {
      expect(Number.isFinite(s.health)).toBe(true);
      expect(Number.isFinite(s.tox)).toBe(true);
    }
  });

  it('triggers Chemical Allergy mutation even with Epinephrine, while exempting blacklist and mannitol/mutadone', () => {
    const triggered = runSimulation(
      makeBasePatient({ chemicalAllergy: true }),
      [dose('sal_acid', 15, { purity: 1.0 }), dose('epinephrine', 10, { purity: 1.0 })],
      { durationSeconds: 20, rngMode: 'expected', seed: 5 },
    );
    const lastTrig = triggered.snapshots[triggered.snapshots.length - 1];
    expect(triggered.summary.triggeredAllergies).toContain('化学过敏突变');
    expect(lastTrig.tox).toBeGreaterThan(0);
    expect(lastTrig.bloodVolume).toBeLessThan(BLOOD_VOLUME_NORMAL);
    expect(lastTrig.bloodVolume).toBeGreaterThanOrEqual(BLOOD_VOLUME_OKAY);

    const exempt = runSimulation(
      makeBasePatient({ chemicalAllergy: true, brute: 20 }),
      [
        dose('libital', 10, { purity: 0.75 }),
        dose('mannitol', 10, { purity: 1.0 }),
        dose('mutadone', 10, { purity: 1.0 }),
      ],
      { durationSeconds: 20, rngMode: 'expected', seed: 5 },
    );
    expect(exempt.summary.triggeredAllergies).toEqual([]);
    expect(exempt.events.some((e) => e.category === 'allergy')).toBe(false);
  });

  it('records blood-entry effective OD even when reagent fully metabolizes in the same tick', () => {
    // 0.15u 75% purity sal_acid (base OD 25u @ 100% -> effective OD 18.75u) fully metabolizes in tick 1 (< 0.2u/tick), leaving bloodReagents empty at every snapshot
    const res = runSimulation(
      makeBasePatient({ brute: 20 }),
      [dose('sal_acid', 0.15, { method: 'INJECT', purity: 0.75 })],
      { durationSeconds: 10, rngMode: 'expected', seed: 1 },
    );

    expect(res.reagentsSeen).toContain('sal_acid');
    expect(res.snapshots.every((s) => s.bloodReagents.every((r) => r.id !== 'sal_acid'))).toBe(true);
    expect(res.reagentEffectiveODs.sal_acid).toEqual({
      peakOd: 18.75,
      minOd: 18.75,
      maxOd: 18.75,
    });
  });
});
