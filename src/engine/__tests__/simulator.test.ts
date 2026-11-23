import { describe, expect, it } from 'vitest';
import { SIM_PRESETS, makeBasePatient } from '../presets';
import { EFFECT_TRAITS, REAGENTS, REAGENT_LIST, getReagentTraits } from '../reagents';
import {
  cloneRegimenDoses,
  createDefaultDose,
  createOrUpdateSavedRegimen,
  parseRegimensJson,
  serializeRegimensJson,
} from '../regimenStorage';
import { runSimulation } from '../simulator';
import type { DoseEvent } from '../types';

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
      SIM_PRESETS.find((p) => p.id === 'cryo-pod')!.patient,
      SIM_PRESETS.find((p) => p.id === 'cryo-pod')!.doses,
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

  it('runs all 10 presets cleanly with finite values', () => {
    for (const preset of SIM_PRESETS) {
      const res = runSimulation(preset.patient, preset.doses, {
        durationSeconds: preset.durationSeconds,
        rngMode: 'expected',
        seed: 42,
      });
      expect(res.snapshots.length).toBeGreaterThan(10);
      for (const s of res.snapshots) {
        expect(Number.isFinite(s.health)).toBe(true);
        expect(Number.isFinite(s.bodyTemp)).toBe(true);
        expect(Number.isFinite(s.bloodVolume)).toBe(true);
      }
    }
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
});
