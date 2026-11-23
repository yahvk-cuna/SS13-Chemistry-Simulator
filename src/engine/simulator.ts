import {
  BLOOD_REGEN_FACTOR,
  BLOOD_VOLUME_NORMAL,
  BLOOD_VOLUME_OKAY,
  BLOOD_VOLUME_SURVIVE,
  BODYTEMP_AREA_SKIN_CHANGE_RATE,
  BODYTEMP_COLD_DAMAGE_LIMIT,
  BODYTEMP_COOLING_MAX,
  BODYTEMP_CORE_CHANGE_RATE,
  BODYTEMP_CORE_SKIN_CHANGE_RATE,
  BODYTEMP_HEAT_DAMAGE_LIMIT,
  BODYTEMP_HEATING_MAX,
  BODYTEMP_NORMAL,
  BODYTEMP_SKIN_CORE_CHANGE_RATE,
  BRAIN_DAMAGE_DEATH,
  CHEMICAL_QUANTISATION_LEVEL,
  CHEMICAL_VOLUME_ROUNDING,
  COLD_DAMAGE_LEVEL_1,
  COLD_DAMAGE_LEVEL_2,
  COLD_DAMAGE_LEVEL_3,
  EYES_HIGH_THRESHOLD,
  EYES_LOW_THRESHOLD,
  EYES_MAX_HEALTH,
  HEALTH_THRESHOLD_DEAD,
  HEALTH_THRESHOLD_FULLCRIT,
  LIVER_PRESETS,
  MAX_HEALTH,
  MAX_STAMINA,
  PATCH_TRANSFER_PER_TICK,
  REM,
  SSMOBS_DT,
  STAMINA_REGEN_TIME,
  STANDARD_ORGAN_HEALING,
  STANDARD_ORGAN_THRESHOLD,
  STOMACH_DEFAULT_EFFICIENCY,
  STOMACH_METABOLISM_CONSTANT,
  clamp,
  getTempChangeAmount,
  roundStep,
} from './constants';
import { runInBodyReactions } from './reactions';
import { REAGENTS, STOMACH_FOOD_IDS, isChemicalAllergyTrigger } from './reagents';
import { createRng, sptProbRate } from './rng';
import type {
  ActiveTransferComponent,
  DoseEvent,
  MobStat,
  OrganSlot,
  OrganState,
  PatientConfig,
  ReagentDef,
  ReagentInstance,
  ReagentSnapshot,
  SimContext,
  SimEvent,
  SimMutableState,
  SimOptions,
  SimResult,
  SimSummary,
  TickSnapshot,
} from './types';

function makeOrgan(
  slot: OrganSlot,
  label: string,
  damage: number,
  maxHealth = STANDARD_ORGAN_THRESHOLD,
  lowThreshold = maxHealth * 0.1,
  highThreshold = maxHealth * 0.45,
  robotic = false,
): OrganState {
  const clamped = clamp(damage, 0, maxHealth);
  return {
    slot,
    label,
    damage: clamped,
    maxHealth,
    lowThreshold,
    highThreshold,
    robotic,
    failing: maxHealth > 0 && clamped >= maxHealth,
  };
}

function createInitialState(patient: PatientConfig): SimMutableState {
  const liverPreset = LIVER_PRESETS[patient.liverType];
  const organs: Record<OrganSlot, OrganState> = {
    liver: liverPreset.liverless
      ? makeOrgan('liver', '肝脏', 0, 0, 0, 0, false)
      : makeOrgan(
          'liver',
          '肝脏',
          patient.organs.liver,
          liverPreset.maxHealth,
          liverPreset.maxHealth * 0.1,
          liverPreset.maxHealth * 0.45,
          liverPreset.robotic,
        ),
    heart: makeOrgan('heart', '心脏', patient.organs.heart),
    lungs: makeOrgan('lungs', '肺', patient.organs.lungs),
    stomach: makeOrgan('stomach', '胃', patient.organs.stomach),
    brain: makeOrgan(
      'brain',
      '大脑',
      patient.organs.brain,
      BRAIN_DAMAGE_DEATH,
      BRAIN_DAMAGE_DEATH * 0.1,
      BRAIN_DAMAGE_DEATH * 0.45,
    ),
    eyes: makeOrgan('eyes', '眼睛', patient.organs.eyes, EYES_MAX_HEALTH, EYES_LOW_THRESHOLD, EYES_HIGH_THRESHOLD),
    ears: makeOrgan('ears', '耳朵', patient.organs.ears),
  };

  if (liverPreset.liverless) {
    organs.liver.failing = true;
  }

  const health = roundStep(
    MAX_HEALTH - patient.brute - patient.burn - patient.tox - patient.oxy,
    0.01,
  );
  const stat = computeStat(health, organs.brain.damage, new Set(), 'STABLE', patient.bloodVolume);

  return {
    brute: patient.brute,
    burn: patient.burn,
    tox: patient.tox,
    oxy: patient.oxy,
    stamina: clamp(patient.stamina, 0, MAX_STAMINA),
    stamcrit: patient.stamina >= 100,
    timeSinceStaminaDamage: 0,
    staminaHitThisTick: false,
    health,
    stat,
    bloodVolume: clamp(patient.bloodVolume, 0, BLOOD_VOLUME_NORMAL),
    effectiveBloodVolume: clamp(patient.bloodVolume, 0, BLOOD_VOLUME_NORMAL),
    bleedFlow: Math.max(0, patient.bleedFlow),
    woundCount: patient.woundSeverity === 'none' ? 0 : Math.max(0, patient.woundCount),
    woundSeverity: patient.woundSeverity,
    woundCounter: 0,
    bodyTemp: patient.bodyTemp,
    coreTemp: patient.bodyTemp,
    ambientTemp: patient.ambientTemp,
    environment: patient.environment,
    chemTemp: patient.bodyTemp,
    onFire: patient.onFire,
    fireStacks: patient.onFire ? Math.max(1, patient.fireStacks) : 0,
    irradiated: patient.irradiated,
    unconscious: patient.unconscious,
    inStasis: patient.inStasis,
    touchProtection: clamp(patient.touchProtection, 0, 1),
    husked: patient.husked,
    allergies: [...(patient.allergies ?? [])],
    chemicalAllergy: Boolean(patient.chemicalAllergy),
    losebreath: 0,
    failedLastBreath: false,
    drowsiness: 0,
    sleeping: 0,
    dizzy: 0,
    jitter: 0,
    confusion: 0,
    disgust: 0,
    eyeBlur: 0,
    heartAttack: organs.heart.failing,
    liverFailureTime: 0,
    liverType: patient.liverType,
    metabolismEfficiency: patient.metabolismEfficiency || 1.0,
    organs,
    blood: [],
    stomach: [],
    activeTransfers: [],
    traits: new Set<string>(),
    delayedReviveTicks: null,
    delayedReviveHealing: 0,
    bleedMod: 1,
    lungPressureMod: 1,
  };
}

function computeStat(
  health: number,
  brainDmg: number,
  traits: Set<string>,
  currentStat: MobStat,
  effectiveBlood: number,
): MobStat {
  if (currentStat === 'DEAD') return 'DEAD';
  if ((health <= HEALTH_THRESHOLD_DEAD || brainDmg >= BRAIN_DAMAGE_DEATH) && !traits.has('TRAIT_NODEATH')) {
    return 'DEAD';
  }
  if (effectiveBlood <= BLOOD_VOLUME_SURVIVE && !traits.has('TRAIT_NODEATH')) {
    return 'DEAD';
  }
  if (health <= HEALTH_THRESHOLD_FULLCRIT && !traits.has('TRAIT_NOHARDCRIT')) {
    return 'HARD_CRIT';
  }
  if (health <= 0 && !traits.has('TRAIT_NOSOFTCRIT')) {
    return 'SOFT_CRIT';
  }
  return 'STABLE';
}

function organStatusLabel(organ: OrganState): string {
  if (organ.maxHealth <= 0 || organ.failing || organ.damage >= organ.maxHealth) return '无功能';
  if (organ.damage > organ.highThreshold) return '严重损伤';
  if (organ.damage > organ.lowThreshold) return '轻微损伤';
  return '正常';
}

function syncTraits(state: SimMutableState): void {
  const next = new Set<string>();
  for (const inst of state.blood) {
    const def = REAGENTS[inst.id];
    if (!def) continue;
    if (def.addedTraits) {
      for (const t of def.addedTraits) next.add(t);
    }
    if (inst.metabolizing && def.metabolizedTraits) {
      for (const t of def.metabolizedTraits) {
        if (inst.id === 'modafinil' && inst.overdosed && Number(inst.data.odProgress ?? 0) >= 82 && t === 'TRAIT_SLEEPIMMUNE') {
          continue;
        }
        next.add(t);
      }
    }
  }
  // If penthrite crashed (< floor threshold), clear its traits immediately
  const penthrite = state.blood.find((r) => r.id === 'penthrite');
  if (penthrite && penthrite.overdosed) {
    next.delete('TRAIT_STABLEHEART');
  }
  state.traits = next;
}

function snapshotReagent(
  inst: ReagentInstance,
  allergyState?: 'active' | 'blocked',
): ReagentSnapshot {
  const def = REAGENTS[inst.id];
  return {
    id: inst.id,
    zhName: def?.zhName ?? inst.id,
    enName: def?.enName ?? inst.id,
    color: def?.color ?? '#94a3b8',
    volume: Number(inst.volume.toFixed(3)),
    purity: Number(inst.creationPurity.toFixed(3)),
    overdoseThreshold: Number(inst.overdoseThreshold.toFixed(2)),
    overdosed: inst.overdosed,
    currentCycle: inst.currentCycle,
    metabolizing: inst.metabolizing,
    ...(allergyState ? { allergyState } : {}),
  };
}

interface TickAllergyInfo {
  activeAllergens: string[];
  blockedAllergens: string[];
  stateById: Map<string, 'active' | 'blocked'>;
}

function takeSnapshot(
  state: SimMutableState,
  tick: number,
  time: number,
  allergyInfo?: TickAllergyInfo,
): TickSnapshot {
  const organsSnap = {} as TickSnapshot['organs'];
  for (const slot of Object.keys(state.organs) as OrganSlot[]) {
    const org = state.organs[slot];
    organsSnap[slot] = {
      damage: Number(org.damage.toFixed(2)),
      maxHealth: org.maxHealth,
      failing: org.failing,
      statusZh: organStatusLabel(org),
    };
  }
  return {
    tick,
    time,
    health: Number(state.health.toFixed(2)),
    stat: state.stat,
    brute: Number(state.brute.toFixed(2)),
    burn: Number(state.burn.toFixed(2)),
    tox: Number(state.tox.toFixed(2)),
    oxy: Number(state.oxy.toFixed(2)),
    stamina: Number(state.stamina.toFixed(2)),
    stamcrit: state.stamcrit,
    bloodVolume: Number(state.bloodVolume.toFixed(2)),
    effectiveBloodVolume: Number(state.effectiveBloodVolume.toFixed(2)),
    bleedFlow: Number(state.bleedFlow.toFixed(2)),
    woundCounter: Number(state.woundCounter.toFixed(1)),
    woundsRemaining: state.woundCount,
    bodyTemp: Number(state.bodyTemp.toFixed(2)),
    coreTemp: Number(state.coreTemp.toFixed(2)),
    chemTemp: Number(state.chemTemp.toFixed(2)),
    losebreath: Number(state.losebreath.toFixed(2)),
    drowsiness: Number(state.drowsiness.toFixed(1)),
    sleeping: Number(state.sleeping.toFixed(1)),
    dizzy: Number(state.dizzy.toFixed(1)),
    jitter: Number(state.jitter.toFixed(1)),
    confusion: Number(state.confusion.toFixed(1)),
    disgust: Number(state.disgust.toFixed(1)),
    eyeBlur: Number(state.eyeBlur.toFixed(1)),
    heartAttack: state.heartAttack,
    husked: state.husked,
    organs: organsSnap,
    traits: Array.from(state.traits),
    bloodReagents: state.blood.map((r) => snapshotReagent(r, allergyInfo?.stateById.get(r.id))),
    stomachReagents: state.stomach.map((r) => snapshotReagent(r)),
    activeTransfers: state.activeTransfers.map((t) => ({
      label: t.label,
      reagentId: t.reagentId,
      remaining: Number(t.remaining.toFixed(2)),
    })),
    activeAllergens: allergyInfo?.activeAllergens ?? [],
    blockedAllergens: allergyInfo?.blockedAllergens ?? [],
  };
}

export function runSimulation(
  patient: PatientConfig,
  doses: DoseEvent[],
  options: SimOptions,
): SimResult {
  const dt = SSMOBS_DT;
  const totalTicks = Math.max(1, Math.floor(options.durationSeconds / dt));
  const rng = createRng(options.seed);
  const state = createInitialState(patient);
  const events: SimEvent[] = [];
  const reagentsSeenSet = new Set<string>();
  const triggeredODs = new Set<string>();
  const triggeredInverses = new Set<string>();
  const triggeredReactions = new Set<string>();
  const triggeredDangerReactions = new Set<string>();
  const triggeredAllergies = new Set<string>();
  const allergySet = new Set(state.allergies);
  let prevActiveAllergenIds = new Set<string>();
  let prevBlockedAllergenIds = new Set<string>();
  let wasChemicalAllergyActive = false;
  let triggeredHeartAttack = state.heartAttack;
  let triggeredStamcrit = state.stamcrit;
  let triggeredSleep = false;

  const ctx: SimContext = {
    dt,
    tick: 0,
    time: 0,
    rngMode: options.rngMode,
    rng,
    chance: (percentPerSec: number) => {
      const rate = sptProbRate(percentPerSec, dt);
      if (options.rngMode === 'expected') return rate;
      return rng() < rate ? 1 : 0;
    },
    discreteChance: (percentPerSec: number) => {
      const rate = sptProbRate(percentPerSec, dt);
      if (options.rngMode === 'expected') return rate >= 0.5;
      return rng() < rate;
    },
    randRange: (min: number, max: number) => {
      if (options.rngMode === 'expected') return (min + max) / 2;
      return min + rng() * (max - min);
    },
    state,
    addBloodReagent: (reagentId, amount, purity, temp, isLivingHolder = true) =>
      addToHolder(state.blood, reagentId, amount, purity, temp ?? state.chemTemp, isLivingHolder, true),
    removeBloodReagent: (reagentId, amount) => removeFromHolder(state.blood, reagentId, amount, true),
    getBloodReagent: (reagentId) => state.blood.find((r) => r.id === reagentId && r.volume > 0),
    getTotalReagentAmount: (reagentId) => {
      const b = state.blood.find((r) => r.id === reagentId)?.volume ?? 0;
      const s = state.stomach.find((r) => r.id === reagentId)?.volume ?? 0;
      return b + s;
    },
    adjustOrganDamage: (slot, amount, maximum, requireOrganic = false) => {
      const org = state.organs[slot];
      if (!org || org.maxHealth <= 0) return 0;
      if (requireOrganic && org.robotic) return 0;
      const cap = maximum !== undefined ? clamp(maximum, 0, org.maxHealth) : org.maxHealth;
      if (cap < org.damage && amount > 0) return 0;
      const prev = org.damage;
      org.damage = clamp(org.damage + amount, 0, cap);
      if (org.damage >= org.maxHealth && !org.failing) {
        org.failing = true;
        addEvent('danger', 'organ', `${org.label}功能衰竭！`, `${org.label}损伤达到 ${org.maxHealth}，器官停止运作。`);
      }
      return prev - org.damage;
    },
    addEvent: (severity, category, title, detail) => addEvent(severity, category, title, detail),
    markStaminaHit: () => {
      state.staminaHitThisTick = true;
    },
  };

  function addEvent(
    severity: SimEvent['severity'],
    category: SimEvent['category'],
    title: string,
    detail: string,
  ): void {
    events.push({ time: ctx.time, tick: ctx.tick, severity, category, title, detail });
    if (category === 'reaction') {
      triggeredReactions.add(title);
      if (severity === 'danger') triggeredDangerReactions.add(title);
    }
  }

  function addToHolder(
    holder: ReagentInstance[],
    reagentId: string,
    rawAmount: number,
    rawPurity: number | undefined,
    temp: number,
    isLivingHolder: boolean,
    isBlood: boolean,
  ): number {
    const def = REAGENTS[reagentId];
    if (!def || !Number.isFinite(rawAmount) || rawAmount <= 0) return 0;
    let amount = rawAmount;
    let purity = rawPurity ?? def.defaultPurity;

    // Purity inversion check on REAGENT_HOLDER_ALIVE (mob_life.dm:182)
    if (isLivingHolder && purity < 1 && def.inverseChemVal > 0 && purity < def.inverseChemVal && def.inverseChemId) {
      const invId = def.inverseChemId;
      const invDef = REAGENTS[invId];
      if (invDef) {
        const invPurity = Math.min(1 - def.inverseChemVal + purity + 0.01, 1);
        triggeredInverses.add(`${def.zhName} → ${invDef.zhName}`);
        addEvent(
          'warn',
          'reaction',
          `纯度过低逆转：${def.zhName} → ${invDef.zhName}`,
          `${def.zhName} 纯度 ${(purity * 100).toFixed(0)}% 低于逆阈值 ${(def.inverseChemVal * 100).toFixed(0)}%，入体转化为 ${invDef.zhName} (纯度 ${(invPurity * 100).toFixed(0)}%)。`,
        );
        return addToHolder(holder, invId, amount, invPurity, temp, false, isBlood);
      }
    }

    amount = roundStep(amount, CHEMICAL_QUANTISATION_LEVEL);
    if (amount <= 0) return 0;

    if (isBlood) {
      reagentsSeenSet.add(reagentId);
      // Equalize chemTemp lightly on addition
      const totalBloodVol = state.blood.reduce((sum, r) => sum + r.volume, 0);
      if (totalBloodVol + amount > 0) {
        state.chemTemp = (state.chemTemp * totalBloodVol + temp * amount) / (totalBloodVol + amount);
      }
    }

    const existing = holder.find((r) => r.id === reagentId);
    if (existing) {
      const total = existing.volume + amount;
      existing.purity = (existing.creationPurity * existing.volume + purity * amount) / total;
      existing.creationPurity = existing.purity;
      existing.ph = (existing.ph * existing.volume + def.ph * amount) / total;
      existing.volume = total;
      return amount;
    }

    if (amount < CHEMICAL_VOLUME_ROUNDING) return 0;

    const inst: ReagentInstance = {
      id: reagentId,
      volume: amount,
      purity,
      creationPurity: purity,
      ph: def.ph,
      metabolizationRate: def.metabolizationRate,
      overdoseThreshold: def.overdoseThreshold,
      overdosed: false,
      currentCycle: 0,
      metabolizing: false,
      data: {},
    };

    if (isBlood) {
      // Scale OD threshold by purity delta from default (reagents.dm:228)
      if (def.overdoseThreshold > 0) {
        inst.overdoseThreshold = Math.max(
          0,
          def.overdoseThreshold + (inst.creationPurity - def.defaultPurity) * def.overdoseThreshold,
        );
      }
      holder.push(inst);
      def.onMobAdd?.(ctx, inst);
    } else {
      holder.push(inst);
    }

    return amount;
  }

  function removeFromHolder(
    holder: ReagentInstance[],
    reagentId: string,
    rawAmount: number,
    isBlood: boolean,
  ): number {
    const amount = roundStep(rawAmount, CHEMICAL_QUANTISATION_LEVEL);
    if (amount <= 0) return 0;
    const idx = holder.findIndex((r) => r.id === reagentId);
    if (idx === -1) return 0;
    const inst = holder[idx];
    const removed = Math.min(inst.volume, amount);
    inst.volume -= removed;
    if (inst.volume < CHEMICAL_VOLUME_ROUNDING) {
      cleanupRemoved(holder, idx, isBlood);
    }
    return removed;
  }

  function cleanupRemoved(holder: ReagentInstance[], idx: number, isBlood: boolean): void {
    const inst = holder[idx];
    holder.splice(idx, 1);
    if (!isBlood) return;
    const def = REAGENTS[inst.id];
    if (inst.metabolizing) {
      inst.metabolizing = false;
      def?.onMobEndMetabolize?.(ctx, inst);
    }
    def?.onMobDelete?.(ctx, inst);
  }

  function deliverReagentNow(
    reagentId: string,
    volume: number,
    method: DoseEvent['method'],
    purity: number,
    temp: number,
  ): void {
    const def = REAGENTS[reagentId];
    if (!def || volume <= 0) return;

    if (method === 'INJECT' || method === 'IV_DRIP') {
      addToHolder(state.blood, reagentId, volume, purity, temp, true, true);
      def.exposeMob?.(ctx, 'INJECT', volume, purity, temp, state.touchProtection);
      runInBodyReactions(ctx);
      return;
    }

    if (method === 'INGEST') {
      addToHolder(state.stomach, reagentId, volume, purity, temp, true, false);
      def.exposeMob?.(ctx, 'INGEST', volume, purity, temp, state.touchProtection);
      runInBodyReactions(ctx);
      return;
    }

    if (method === 'TOUCH') {
      def.exposeMob?.(ctx, 'TOUCH', volume, purity, temp, state.touchProtection);
      if (def.penetratesSkin === 'TOUCH_VAPOR') {
        const amt = roundStep(volume * (1 - state.touchProtection), 0.1);
        if (amt >= 0.5) {
          addToHolder(state.blood, reagentId, amt, purity, temp, true, true);
          runInBodyReactions(ctx);
        }
      }
      return;
    }

    if (method === 'VAPOR') {
      def.exposeMob?.(ctx, 'VAPOR', volume, purity, temp, state.touchProtection);
      if (def.penetratesSkin !== 'NONE') {
        const amt = roundStep(volume * (1 - state.touchProtection), 0.1);
        if (amt >= 0.5) {
          addToHolder(state.blood, reagentId, amt, purity, temp, true, true);
          runInBodyReactions(ctx);
        }
      }
    }
  }

  function updateHealthAndStat(): void {
    const prevStat = state.stat;
    state.health = roundStep(
      MAX_HEALTH - state.brute - state.burn - state.tox - state.oxy,
      0.01,
    );
    state.stat = computeStat(
      state.health,
      state.organs.brain.damage,
      state.traits,
      state.stat,
      state.effectiveBloodVolume,
    );

    if (state.stat !== prevStat) {
      if (state.stat === 'DEAD') {
        addEvent('danger', 'vital', '患者死亡！', `t=${ctx.time}s 时生命值降至 ${state.health.toFixed(1)}（或脑伤/失血致死）。`);
      } else if (state.stat === 'HARD_CRIT') {
        addEvent('danger', 'vital', '进入重危状态 (Hard Crit)', `生命值 ${state.health.toFixed(1)} <= -30，呼吸停滞恶化！`);
      } else if (state.stat === 'SOFT_CRIT') {
        addEvent('warn', 'vital', '进入轻危状态 (Soft Crit)', `生命值 ${state.health.toFixed(1)} <= 0。`);
      } else if (state.stat === 'STABLE' && prevStat !== 'STABLE') {
        addEvent('good', 'vital', '脱离危急恢复稳定', `生命值回升至 ${state.health.toFixed(1)}。`);
      }
    }
  }

  // Initial snapshot at t=0
  const snapshots: TickSnapshot[] = [takeSnapshot(state, 0, 0)];
  let fullHealTime: number | null =
    state.health >= MAX_HEALTH && state.brute === 0 && state.burn === 0 && state.tox === 0 && state.oxy === 0
      ? 0
      : null;

  const activeDoses = doses.filter((d) => d.enabled && d.volume > 0 && REAGENTS[d.reagentId]);
  const firedDoseIds = new Set<string>();
  const groupedPatches = new Map<number, DoseEvent[]>();
  const standaloneDoses: DoseEvent[] = [];
  for (const d of activeDoses) {
    if (d.method === 'PATCH' && d.patchGroup !== undefined) {
      const list = groupedPatches.get(d.patchGroup) ?? [];
      list.push(d);
      groupedPatches.set(d.patchGroup, list);
    } else {
      standaloneDoses.push(d);
    }
  }
  const sortedPatchGroupIds = Array.from(groupedPatches.keys()).sort((a, b) => a - b);
  const firedPatchGroups = new Set<number>();

  const ALLERGY_ORGAN_POOL: ReadonlyArray<OrganSlot | 'appendix'> = [
    'brain',
    'appendix',
    'lungs',
    'heart',
    'liver',
    'stomach',
  ];

  for (let tick = 1; tick <= totalTicks; tick++) {
    const time = tick * dt;
    ctx.tick = tick;
    ctx.time = time;
    state.staminaHitThisTick = false;

    const tickActiveAllergenIds = new Set<string>();
    const tickBlockedAllergenIds = new Set<string>();
    const tickActiveAllergenNames = new Set<string>();
    const tickBlockedAllergenNames = new Set<string>();
    const tickAllergyStateById = new Map<string, 'active' | 'blocked'>();

    // 1. Scheduled dose delivery (at startTime <= time)
    for (const groupId of sortedPatchGroupIds) {
      if (firedPatchGroups.has(groupId)) continue;
      const groupDoses = groupedPatches.get(groupId)!;
      const groupStartTime = Math.min(...groupDoses.map((d) => d.startTime));
      if (groupStartTime > time) continue;
      firedPatchGroups.add(groupId);

      const compMap = new Map<string, ActiveTransferComponent>();
      for (const d of groupDoses) {
        const existing = compMap.get(d.reagentId);
        if (existing) {
          const total = existing.remaining + d.volume;
          existing.purity = (existing.purity * existing.remaining + d.purity * d.volume) / total;
          existing.temp = (existing.temp * existing.remaining + d.temp * d.volume) / total;
          existing.remaining = total;
        } else {
          compMap.set(d.reagentId, {
            reagentId: d.reagentId,
            remaining: d.volume,
            purity: d.purity,
            temp: d.temp,
          });
        }
      }
      const components = Array.from(compMap.values());
      const totalVol = components.reduce((sum, c) => sum + c.remaining, 0);
      const compNames = components.map((c) => REAGENTS[c.reagentId]?.zhName ?? c.reagentId);
      const label =
        components.length > 1
          ? `复合贴片 #${groupId} (${compNames.join('+')})`
          : `${compNames[0]} 贴片 #${groupId}`;
      state.activeTransfers.push({
        id: `patch-group-${groupId}`,
        label,
        reagentId: components[0].reagentId,
        remaining: totalVol,
        ratePerTick: PATCH_TRANSFER_PER_TICK,
        purity: components[0].purity,
        temp: components[0].temp,
        method: 'PATCH',
        components,
      });
      const detailParts = components.map(
        (c) =>
          `${REAGENTS[c.reagentId]?.zhName ?? c.reagentId} ${Number(c.remaining.toFixed(2))}u (${Math.round(c.purity * 100)}%)`,
      );
      addEvent(
        'info',
        'dose',
        `贴附${components.length > 1 ? '复合' : '缓释'}贴片 #${groupId}：${compNames.join(' + ')}`,
        `总量 ${Number(totalVol.toFixed(2))}u（${detailParts.join('，')}），按比例共享总计 0.75u/tick。`,
      );
    }

    for (const d of standaloneDoses) {
      if (firedDoseIds.has(d.id) || d.startTime > time) continue;
      firedDoseIds.add(d.id);
      const def = REAGENTS[d.reagentId];
      if (d.method === 'PATCH') {
        state.activeTransfers.push({
          id: d.id,
          label: `${def.zhName} 贴片`,
          reagentId: d.reagentId,
          remaining: d.volume,
          ratePerTick: PATCH_TRANSFER_PER_TICK,
          purity: d.purity,
          temp: d.temp,
          method: 'PATCH',
        });
        addEvent('info', 'dose', `贴附缓释贴片：${def.zhName}`, `总量 ${d.volume}u (纯度 ${(d.purity * 100).toFixed(0)}%)，每 tick 释放 0.75u。`);
      } else if (d.method === 'IV_DRIP') {
        state.activeTransfers.push({
          id: d.id,
          label: `${def.zhName} 静脉滴注`,
          reagentId: d.reagentId,
          remaining: d.volume,
          ratePerTick: Math.max(0.5, d.ivRate),
          purity: d.purity,
          temp: d.temp,
          method: 'INJECT',
        });
        addEvent('info', 'dose', `连接静脉滴注：${def.zhName}`, `总容量 ${d.volume}u，速率 ${d.ivRate}u/tick (纯度 ${(d.purity * 100).toFixed(0)}%)。`);
      } else {
        const methodName: Record<string, string> = {
          INJECT: '注射',
          INGEST: '口服',
          TOUCH: '接触泼洒',
          VAPOR: '蒸气喷洒',
        };
        addEvent(
          'info',
          'dose',
          `${methodName[d.method] ?? d.method}：${def.zhName} ${d.volume}u`,
          `纯度 ${(d.purity * 100).toFixed(0)}%${d.reagentId === 'seiver' ? `，药液温度 ${d.temp}K` : ''}。`,
        );
        deliverReagentNow(d.reagentId, d.volume, d.method, d.purity, d.temp);
      }
    }

    // 1b. Active Patches & IV Drips
    for (let i = state.activeTransfers.length - 1; i >= 0; i--) {
      const tr = state.activeTransfers[i];
      if (tr.method === 'PATCH' && state.inStasis) continue;
      if (tr.components && tr.components.length > 0) {
        const totalRem = tr.components.reduce((sum, c) => sum + c.remaining, 0);
        const stepTotal = Math.min(totalRem, tr.ratePerTick);
        if (totalRem > 0 && stepTotal > 0) {
          for (const c of tr.components) {
            const share = (c.remaining / totalRem) * stepTotal;
            if (share <= 0) continue;
            c.remaining = Math.max(0, c.remaining - share);
            const def = REAGENTS[c.reagentId];
            addToHolder(state.blood, c.reagentId, share, c.purity, c.temp, true, true);
            def?.exposeMob?.(ctx, tr.method, share, c.purity, c.temp, state.touchProtection);
          }
          runInBodyReactions(ctx);
        }
        tr.components = tr.components.filter((c) => c.remaining >= CHEMICAL_VOLUME_ROUNDING);
        tr.remaining = tr.components.reduce((sum, c) => sum + c.remaining, 0);
      } else {
        const stepAmt = Math.min(tr.remaining, tr.ratePerTick);
        if (stepAmt > 0) {
          tr.remaining -= stepAmt;
          const def = REAGENTS[tr.reagentId];
          addToHolder(state.blood, tr.reagentId, stepAmt, tr.purity, tr.temp, true, true);
          def?.exposeMob?.(ctx, tr.method, stepAmt, tr.purity, tr.temp, state.touchProtection);
          runInBodyReactions(ctx);
        }
      }
      if (tr.remaining < CHEMICAL_VOLUME_ROUNDING) {
        state.activeTransfers.splice(i, 1);
      }
    }

    // 2. Stomach Digestion into Bloodstream (_stomach.dm:75-103)
    if (!state.inStasis && state.stat !== 'DEAD' && !state.organs.stomach.failing) {
      for (const bit of [...state.stomach]) {
        const def = REAGENTS[bit.id];
        if (!def || bit.metabolizationRate <= 0) continue;
        const rateMin = Math.max(bit.metabolizationRate, STOMACH_METABOLISM_CONSTANT);
        const amount = Math.min(
          (roundStep(STOMACH_DEFAULT_EFFICIENCY * bit.volume, 0.05) + rateMin) * dt,
          bit.volume,
        );
        if (amount > 0) {
          bit.volume -= amount;
          addToHolder(state.blood, bit.id, amount, bit.creationPurity, state.chemTemp, false, true);
          runInBodyReactions(ctx);
        }
      }
      state.stomach = state.stomach.filter((r) => r.volume >= CHEMICAL_VOLUME_ROUNDING);
    }

    // 3. Delayed Strange Reagent Revival check
    if (state.stat === 'DEAD' && state.delayedReviveTicks !== null) {
      state.delayedReviveTicks -= 1;
      if (state.delayedReviveTicks <= 0) {
        state.delayedReviveTicks = null;
        const healEach = state.delayedReviveHealing / 2;
        state.brute = Math.max(0, state.brute - healEach);
        state.burn = Math.max(0, state.burn - healEach);
        state.oxy = Math.max(0, state.oxy - 40);
        state.stat = 'SOFT_CRIT';
        addEvent('good', 'vital', '奇异试剂复活成功！', `尸体恢复生命体征，回复 ${state.delayedReviveHealing.toFixed(1)} 点外伤。`);
      }
    }

    // 4. Bloodstream temperature equalization & Reagent Metabolism (mob_life.dm)
    state.chemTemp += (state.bodyTemp - state.chemTemp) * 0.25;

    const liver = state.organs.liver;
    const liverPreset = LIVER_PRESETS[state.liverType];
    const liverless = state.liverType === 'none' || liver.failing;
    const dead = state.stat === 'DEAD';

    if (state.inStasis) {
      for (const inst of [...state.blood]) {
        const def = REAGENTS[inst.id];
        if (!def?.ignoreStasis) continue;
        processSingleBloodReagent(inst, def, false, false);
      }
    } else if (dead) {
      for (const inst of [...state.blood]) {
        const def = REAGENTS[inst.id];
        if (!def?.deadProcess) continue;
        processSingleBloodReagent(inst, def, liverless, true);
      }
    } else {
      const liverHealthPct = liverPreset.liverless ? 0 : (liver.maxHealth - liver.damage) / liver.maxHealth;
      const liverTolerance = liverPreset.liverless ? 0 : liverPreset.toxTolerance * liverHealthPct;
      let totalToxinLiverDmg = 0;

      for (const inst of [...state.blood]) {
        if (inst.volume < CHEMICAL_VOLUME_ROUNDING) continue;
        const def = REAGENTS[inst.id];
        if (!def) continue;

        const stomachAmt = state.stomach.find((s) => s.id === inst.id)?.volume ?? 0;
        const totalAmt = inst.volume + stomachAmt;

        // Liver toxin tolerance skip (mob_life.dm:40-47)
        if (def.isToxin && !liverless && !liverPreset.liverless) {
          if (totalAmt <= liverTolerance * (def.liverToleranceMultiplier ?? 1)) {
            const cleared = inst.metabolizationRate * state.metabolismEfficiency * dt;
            inst.volume = Math.max(0, inst.volume - cleared);
            continue;
          }
        }

        processSingleBloodReagent(inst, def, liverless, false);

        // Toxin liver damage (mob_life.dm:54-60)
        if (def.isToxin && !liverless && !liverPreset.liverless && !liver.robotic) {
          totalToxinLiverDmg +=
            ((totalAmt / 15) * (def.toxpwr ?? 0) * (def.liverDamageMultiplier ?? 1)) /
            liverPreset.liverResistance;
        }
      }

      if (totalToxinLiverDmg > 0 && !liverPreset.liverless) {
        ctx.adjustOrganDamage('liver', Math.min(totalToxinLiverDmg * dt, 2 * dt));
      }
    }

    // Cleanup depleted blood reagents
    for (let i = state.blood.length - 1; i >= 0; i--) {
      if (state.blood[i].volume < CHEMICAL_VOLUME_ROUNDING) {
        cleanupRemoved(state.blood, i, true);
      }
    }
    syncTraits(state);

    function processSingleBloodReagent(
      inst: ReagentInstance,
      def: ReagentDef,
      isLiverless: boolean,
      isDead: boolean,
    ): void {
      // Extreme Medicine Allergy hook (allergic.dm:76-90, runs at COMSIG_MOB_REAGENT_TICK before liverless check)
      let stopMetabolism = false;
      if (allergySet.has(inst.id)) {
        const hasEpi =
          (state.blood.find((r) => r.id === 'epinephrine')?.volume ?? 0) >= CHEMICAL_VOLUME_ROUNDING;
        if (hasEpi) {
          stopMetabolism = true;
          tickBlockedAllergenIds.add(inst.id);
          tickBlockedAllergenNames.add(def.zhName);
          tickAllergyStateById.set(inst.id, 'blocked');
          if (!prevBlockedAllergenIds.has(inst.id)) {
            addEvent(
              'warn',
              'allergy',
              `肾上腺素阻断过敏：${def.zhName}`,
              `体内存在肾上腺素，已抑制 ${def.zhName} 的过敏毒素与组胺生成，但同时暂停其代谢消耗（在肾上腺素耗尽前需及时清血）。`,
            );
          }
        } else {
          triggeredAllergies.add(def.zhName);
          tickActiveAllergenIds.add(inst.id);
          tickActiveAllergenNames.add(def.zhName);
          tickAllergyStateById.set(inst.id, 'active');
          if (!prevActiveAllergenIds.has(inst.id)) {
            addEvent(
              'danger',
              'allergy',
              `药物过敏爆发：${def.zhName}`,
              `患者对 ${def.zhName} 极端过敏，每 tick 产生 +${3 * dt} 毒素、+${3 * dt}u 组胺及 ${(sptProbRate(10, dt) * 100).toFixed(0)}% 呕吐/内脏损伤风险！可用肾上腺素阻断并配合苯海拉明清组胺及清血。`,
            );
          }
          state.tox += 3 * dt;
          ctx.addBloodReagent('histamine', 3 * dt, 1, state.chemTemp, true);

          const pVomit = sptProbRate(10, dt);
          if (options.rngMode === 'expected') {
            state.tox = Math.max(0, state.tox - 3 * pVomit);
            if (state.stomach.length > 0 && pVomit > 0) {
              for (const bit of state.stomach) {
                const extraPurge = STOMACH_FOOD_IDS.has(bit.id) ? 0 : Math.min(bit.volume * 0.9, 10);
                const lost = pVomit * (bit.volume * 0.1 + extraPurge);
                bit.volume = Math.max(0, bit.volume - lost);
              }
              state.stomach = state.stomach.filter((r) => r.volume >= CHEMICAL_VOLUME_ROUNDING);
            }
            const expectedOrganLoss = (10 * pVomit) / 6;
            for (const slot of ['brain', 'lungs', 'heart', 'liver', 'stomach'] as const) {
              ctx.adjustOrganDamage(slot, expectedOrganLoss);
            }
          } else if (rng() < pVomit) {
            state.tox = Math.max(0, state.tox - 3);
            if (state.stomach.length > 0) {
              for (const bit of state.stomach) {
                bit.volume = Math.max(0, bit.volume * 0.9);
                if (!STOMACH_FOOD_IDS.has(bit.id)) {
                  bit.volume = Math.max(0, bit.volume - Math.min(bit.volume, 10));
                }
              }
              state.stomach = state.stomach.filter((r) => r.volume >= CHEMICAL_VOLUME_ROUNDING);
            }
            const chosen = ALLERGY_ORGAN_POOL[Math.floor(rng() * ALLERGY_ORGAN_POOL.length)];
            if (chosen !== 'appendix') {
              ctx.adjustOrganDamage(chosen, 10);
              addEvent(
                'warn',
                'allergy',
                `过敏呕吐与内脏损伤（${def.zhName}）`,
                `触发急性呕吐（毒素 -3，排出胃内残留），并对「${state.organs[chosen].label}」造成 +10 损伤。`,
              );
            } else {
              addEvent(
                'warn',
                'allergy',
                `过敏呕吐（${def.zhName}）`,
                '触发急性呕吐（毒素 -3，排出胃内残留）；器官损伤随机命中未建模的阑尾（5 项核心内脏未受损）。',
              );
            }
          }
        }
      }

      if (isLiverless && !def.selfConsuming) {
        if (inst.metabolizing) {
          inst.metabolizing = false;
          def.onMobEndMetabolize?.(ctx, inst);
        }
        return;
      }

      let metabolizingOut = inst.metabolizationRate * dt;
      if (!def.unaffectedByMetabolism) {
        if (def.reverseMetabolism) metabolizingOut /= state.metabolismEfficiency;
        else metabolizingOut *= state.metabolismEfficiency;
      }
      const metabolizedVol = Math.min(metabolizingOut, inst.volume);
      const ratio = REM * metabolizedVol;

      if (!inst.metabolizing) {
        inst.metabolizing = true;
        def.onMobMetabolize?.(ctx, inst);
        syncTraits(state);
      }

      if (!isDead) {
        if (inst.overdoseThreshold > 0 && inst.volume >= inst.overdoseThreshold && !inst.overdosed) {
          inst.overdosed = true;
          triggeredODs.add(def.zhName);
          addEvent(
            'danger',
            'overdose',
            `药物过量 (OD)：${def.zhName}`,
            `血液浓度 ${inst.volume.toFixed(2)}u 达到过量阈值 ${inst.overdoseThreshold.toFixed(2)}u！`,
          );
          def.overdoseStart?.(ctx, inst);
        }
        if (inst.overdosed) {
          def.overdoseProcess?.(ctx, inst, ratio, dt);
        }
      }

      inst.currentCycle += 1;
      def.onMobLife?.(ctx, inst, ratio, dt);
      if (isDead) {
        def.onMobDead?.(ctx, inst, ratio, dt);
      }

      if (!stopMetabolism) {
        if (def.metabolizeReagent) {
          def.metabolizeReagent(ctx, inst, metabolizedVol, dt);
        } else {
          inst.volume = Math.max(0, inst.volume - metabolizedVol);
        }
      }
    }

    // 4b. Chemical Allergy Genetic Mutation (body.dm:861-896)
    if (state.chemicalAllergy && !state.inStasis && state.stat !== 'DEAD') {
      const dangerInsts = state.blood.filter((inst) => {
        if (!inst.metabolizing || inst.volume < 1) return false;
        const d = REAGENTS[inst.id];
        return Boolean(d && isChemicalAllergyTrigger(d));
      });
      if (dangerInsts.length > 0) {
        triggeredAllergies.add('化学过敏突变');
        tickActiveAllergenNames.add('化学过敏突变');
        for (const inst of dangerInsts) {
          if (!tickAllergyStateById.has(inst.id)) {
            tickAllergyStateById.set(inst.id, 'active');
          }
        }
        if (!wasChemicalAllergyActive) {
          wasChemicalAllergyActive = true;
          const names = dangerInsts.map((i) => REAGENTS[i.id]?.zhName ?? i.id).join(' / ');
          addEvent(
            'danger',
            'allergy',
            '化学过敏突变发作',
            `正在代谢非豁免药物（${names}，存量 ≥1u），引发全身毒素、失血与呼吸抑制！不受肾上腺素阻断，请改用「无过敏」药物或甘露醇/突变酮。`,
          );
        }
        const pGate = sptProbRate(80, dt);
        if (options.rngMode === 'expected') {
          const pTox = pGate * sptProbRate(33, dt);
          if (state.disgust < 100) state.disgust = Math.min(100, state.disgust + 24 * pTox);
          state.tox += 3 * pTox;

          const pBlood = pGate * sptProbRate(12, dt);
          if (state.jitter < 36) state.jitter = Math.min(36, state.jitter + 6 * pBlood);
          if (state.dizzy < 36) state.dizzy = Math.min(36, state.dizzy + 6 * pBlood);
          if (state.bloodVolume > BLOOD_VOLUME_OKAY) {
            state.bloodVolume = Math.max(BLOOD_VOLUME_OKAY, state.bloodVolume - 18 * pBlood);
          }

          const pBreath = pGate * sptProbRate(6, dt);
          if (state.confusion < 12) state.confusion = Math.min(12, state.confusion + 4 * pBreath);
          if (state.losebreath < 4) {
            state.losebreath = Math.min(4, state.losebreath + (4 - state.losebreath) * pBreath);
          }
        } else if (rng() < pGate) {
          if (rng() < sptProbRate(33, dt)) {
            if (state.disgust < 100) state.disgust = Math.min(100, state.disgust + 24);
            state.tox += [2, 3, 4][Math.floor(rng() * 3)];
          }
          if (rng() < sptProbRate(12, dt)) {
            if (state.jitter < 36) state.jitter = Math.min(36, state.jitter + 6);
            if (state.dizzy < 36) state.dizzy = Math.min(36, state.dizzy + 6);
            if (state.bloodVolume > BLOOD_VOLUME_OKAY) {
              const bloodLoss = [12, 16, 20, 24][Math.floor(rng() * 4)];
              state.bloodVolume = Math.max(BLOOD_VOLUME_OKAY, state.bloodVolume - bloodLoss);
            }
          }
          if (rng() < sptProbRate(6, dt)) {
            if (state.confusion < 12) state.confusion = Math.min(12, state.confusion + 4);
            state.losebreath = Math.max(state.losebreath, 4);
          }
        }
      } else if (wasChemicalAllergyActive) {
        wasChemicalAllergyActive = false;
        addEvent('info', 'allergy', '化学过敏突变缓解', '血液中已无正在代谢的 ≥1u 非豁免药物。');
      }
    } else if (wasChemicalAllergyActive) {
      wasChemicalAllergyActive = false;
    }

    // 5. Cryoxadone / Pyroxadone wound healing milestones (33 / 66 / 99)
    if (state.woundCount > 0) {
      const thresh = state.woundSeverity === 'critical' ? 99 : state.woundSeverity === 'severe' ? 66 : 33;
      while (state.woundCount > 0 && state.woundCounter >= thresh) {
        state.woundCounter -= thresh;
        state.woundCount -= 1;
        state.bleedFlow = Math.max(0, state.bleedFlow * (state.woundCount / (state.woundCount + 1)));
        addEvent('good', 'status', '重度伤口愈合！', `治疗计数器达到 ${thresh}，治愈 1 处${state.woundSeverity === 'critical' ? '危重' : state.woundSeverity === 'severe' ? '重度' : '中度'}伤口（剩余 ${state.woundCount} 处）。`);
      }
    }

    // 6. Organ passive healing & organ failure (_organ.dm, _liver.dm, life.dm)
    if (!state.inStasis && state.stat !== 'DEAD') {
      for (const slot of Object.keys(state.organs) as OrganSlot[]) {
        const org = state.organs[slot];
        if (org.maxHealth <= 0 || org.robotic || org.failing || org.damage <= 0) continue;
        org.damage = Math.max(0, org.damage - STANDARD_ORGAN_HEALING * org.maxHealth * dt);
      }

      // Liver failure or liverless effects
      if (state.liverType === 'none') {
        if (!state.traits.has('TRAIT_STABLELIVER')) {
          state.tox += 0.6 * dt;
          const targets: OrganSlot[] = ['heart', 'lungs', 'stomach', 'eyes', 'ears'];
          if (options.rngMode === 'expected') {
            for (const s of targets) ctx.adjustOrganDamage(s, (0.5 * dt) / targets.length);
          } else {
            ctx.adjustOrganDamage(targets[Math.floor(rng() * targets.length)], 0.5 * dt);
          }
        }
      } else if (state.organs.liver.failing && !state.traits.has('TRAIT_STABLELIVER')) {
        state.liverFailureTime += dt;
        const ft = state.liverFailureTime;
        if (ft >= 60 && ft < 120) {
          state.tox += 0.2 * dt;
          state.disgust += 0.1 * dt;
        } else if (ft >= 120 && ft < 180) {
          state.tox += 0.4 * dt;
          state.drowsiness += 0.5 * dt;
          state.disgust += 0.3 * dt;
        } else if (ft >= 180 && ft < 240) {
          state.tox += 0.6 * dt;
          const targets: OrganSlot[] = ['heart', 'lungs', 'stomach', 'eyes', 'ears'];
          if (options.rngMode === 'expected') {
            for (const s of targets) ctx.adjustOrganDamage(s, (0.2 * dt) / targets.length);
          } else {
            ctx.adjustOrganDamage(targets[Math.floor(rng() * targets.length)], 0.2 * dt);
          }
          state.drowsiness += 1 * dt;
          state.disgust += 0.6 * dt;
        } else if (ft >= 240) {
          state.tox += 0.8 * dt;
          const targets: OrganSlot[] = ['heart', 'lungs', 'stomach', 'eyes', 'ears'];
          if (options.rngMode === 'expected') {
            for (const s of targets) ctx.adjustOrganDamage(s, (0.5 * dt) / targets.length);
          } else {
            ctx.adjustOrganDamage(targets[Math.floor(rng() * targets.length)], 0.5 * dt);
          }
          state.drowsiness += 1.6 * dt;
          state.disgust += 1.2 * dt;
        }
      } else if (state.liverFailureTime > 0) {
        state.liverFailureTime = Math.max(0, state.liverFailureTime - 1);
      }

      // Heart failure & cardiac arrest (human/life.dm:285)
      if (state.organs.heart.failing && !state.traits.has('TRAIT_STABLEHEART')) {
        state.heartAttack = true;
      }
      if (state.heartAttack && !state.traits.has('TRAIT_STABLEHEART')) {
        triggeredHeartAttack = true;
        state.oxy += 4 * dt;
        state.brute += 1 * dt;
        state.unconscious = true;
      }
    }

    // 7. Breathing & Critical Suffocation (carbon/life.dm:46-95, 424-452)
    if (!state.inStasis && state.stat !== 'DEAD') {
      let nextBreath = 4;
      if (state.organs.lungs.damage > state.organs.lungs.highThreshold) nextBreath -= 1;
      if (state.organs.heart.damage > state.organs.heart.highThreshold) nextBreath -= 1;

      if (tick % nextBreath === 0 || state.failedLastBreath) {
        const lexorinBlocking = state.blood.some((r) => r.id === 'lexorin' && r.metabolizing);
        if (!lexorinBlocking) {
          if (state.organs.lungs.failing) {
            state.losebreath += 1;
          } else if (state.stat === 'HARD_CRIT') {
            state.losebreath += 1;
          } else if (state.stat === 'SOFT_CRIT') {
            state.losebreath += 0.25;
          }

          if (state.losebreath >= 1 || state.environment === 'vacuum') {
            if (state.losebreath >= 1) state.losebreath = Math.max(0, state.losebreath - 1);
            state.failedLastBreath = true;
            const epiActive = state.blood.some((r) => r.id === 'epinephrine' && r.metabolizing);
            if (state.health >= 0) {
              state.oxy += 3;
            } else if (!state.traits.has('TRAIT_NOCRITDAMAGE') && !epiActive) {
              state.oxy += 1;
            }
          } else {
            state.failedLastBreath = false;
            if (state.stat === 'STABLE' && state.oxy > 0) {
              state.oxy = Math.max(0, state.oxy - 5);
            }
          }
        }
      }
    }

    // 8. Blood & Bleeding (blood.dm:154-280)
    if (!state.inStasis && state.stat !== 'DEAD') {
      const heartMult =
        state.heartAttack && !state.traits.has('TRAIT_STABLEHEART')
          ? 0
          : clamp((state.organs.heart.maxHealth - state.organs.heart.damage) / state.organs.heart.maxHealth, 0, 1);

      if (heartMult > 0 && state.bloodVolume < BLOOD_VOLUME_NORMAL && state.bodyTemp >= 260) {
        state.bloodVolume = Math.min(
          BLOOD_VOLUME_NORMAL,
          state.bloodVolume + BLOOD_REGEN_FACTOR * heartMult * dt,
        );
      }

      if (state.bleedFlow > 0) {
        const bled = state.bleedFlow * state.bleedMod * dt;
        state.bloodVolume = Math.max(0, state.bloodVolume - bled);
        if (!state.traits.has('TRAIT_EASYBLEED')) {
          state.bleedFlow = Math.max(0, state.bleedFlow - 0.02 * dt);
        }
      }

      const salgluVol = state.blood.find((r) => r.id === 'salglu_solution')?.volume ?? 0;
      state.effectiveBloodVolume = Math.min(BLOOD_VOLUME_NORMAL, state.bloodVolume + salgluVol * 5);

      const effRatio = state.effectiveBloodVolume / BLOOD_VOLUME_NORMAL;
      const targetOxy = Math.max((1 - effRatio) * 100, 0);
      if (targetOxy > 0 && state.oxy < targetOxy) {
        state.oxy += roundStep(0.01 * (BLOOD_VOLUME_NORMAL - state.effectiveBloodVolume), 0.25) * dt;
      }
    }

    // 9. Body & Core Temperature (_species.dm:1061-1271)
    if (state.environment === 'cryo') {
      // Cryo cell regulates body temperature toward cryo ambient temp without freezing damage
      state.bodyTemp += (state.ambientTemp - state.bodyTemp) * 0.45;
      state.coreTemp += (state.bodyTemp - state.coreTemp) * 0.4;
    } else if (!state.inStasis) {
      if (state.stat !== 'DEAD') {
        const nat = getTempChangeAmount(BODYTEMP_NORMAL - state.coreTemp, BODYTEMP_CORE_CHANGE_RATE * dt);
        state.coreTemp += state.metabolismEfficiency * nat;
      }
      const skinCoreChange = getTempChangeAmount(state.bodyTemp - state.coreTemp, BODYTEMP_SKIN_CORE_CHANGE_RATE * dt);
      state.coreTemp += skinCoreChange;

      const areaDiff = state.ambientTemp - state.bodyTemp;
      if (!state.onFire || areaDiff > 0) {
        const areaChange = getTempChangeAmount(areaDiff, BODYTEMP_AREA_SKIN_CHANGE_RATE * dt);
        state.bodyTemp += clamp(areaChange, BODYTEMP_COOLING_MAX, BODYTEMP_HEATING_MAX);
      }
      if (!state.onFire) {
        const coreSkinDiff = state.coreTemp - state.bodyTemp;
        let coreSkinChange = getTempChangeAmount(coreSkinDiff, BODYTEMP_CORE_SKIN_CHANGE_RATE * dt);
        coreSkinChange = coreSkinDiff > 0 ? Math.min(coreSkinChange, coreSkinDiff) : Math.max(coreSkinChange, coreSkinDiff);
        state.bodyTemp += coreSkinChange;
      } else {
        state.bodyTemp += Math.min(45, state.fireStacks * 3) * dt;
        state.burn += state.fireStacks * 0.15 * dt;
      }

      if (state.stat !== 'DEAD' || state.burn < 100) {
        if (state.coreTemp > BODYTEMP_HEAT_DAMAGE_LIMIT) {
          const fireMod = state.onFire ? state.fireStacks / 50 : 0;
          const base = Math.max(1.01, 2 - fireMod);
          const burnDmg = Math.max(Math.log(Math.max(1, state.coreTemp - BODYTEMP_NORMAL)) / Math.log(base) - 5, 0) * 0.5 * dt;
          state.burn += burnDmg;
        } else if (state.coreTemp < BODYTEMP_COLD_DAMAGE_LIMIT) {
          if (state.coreTemp >= 201) state.burn += COLD_DAMAGE_LEVEL_1 * dt;
          else if (state.coreTemp >= 120) state.burn += COLD_DAMAGE_LEVEL_2 * dt;
          else state.burn += COLD_DAMAGE_LEVEL_3 * dt;
        }
      }
    }

    // 10. Radiation ongoing damage (halted by Potassium Iodide / Pentetic Acid)
    if (!state.inStasis && state.stat !== 'DEAD' && state.irradiated && !state.traits.has('TRAIT_HALT_RADIATION_EFFECTS')) {
      state.tox += 0.5 * dt;
    }

    // 11. Stamina 10s reset timer, stamcrit & debuff decays
    if (state.staminaHitThisTick) {
      state.timeSinceStaminaDamage = 0;
    } else {
      state.timeSinceStaminaDamage += dt;
      if (state.timeSinceStaminaDamage >= STAMINA_REGEN_TIME && state.stamina > 0) {
        state.stamina = 0;
        state.stamcrit = false;
      }
    }

    if (state.stamina >= 100 && !state.stamcrit && state.stat !== 'DEAD') {
      const chgAdr = state.blood.find((r) => r.id === 'changelingadrenaline' && r.metabolizing);
      if (chgAdr && chgAdr.volume > 0) {
        chgAdr.volume = Math.max(0, chgAdr.volume - Math.min(chgAdr.volume, 1));
        state.stamina = 90;
        addEvent('info', 'status', '化形肾上腺素抵消耐力倒地', '消耗 1u 药液并将耐力损耗锁定在 90。');
      } else {
        state.stamcrit = true;
        state.stamina = Math.min(MAX_STAMINA, state.stamina + 30);
        triggeredStamcrit = true;
        addEvent('warn', 'status', '耐力崩溃倒地 (Stamcrit)', '耐力损耗达 100，进入失能倒地状态 (+30 缓冲耐力损耗)。');
      }
    }

    // Timed debuff decays
    state.drowsiness = Math.max(0, state.drowsiness - dt);
    state.sleeping = Math.max(0, state.sleeping - dt);
    if (state.sleeping > 0) triggeredSleep = true;
    state.dizzy = Math.max(0, state.dizzy - dt);
    state.jitter = Math.max(0, state.jitter - dt);
    state.confusion = Math.max(0, state.confusion - dt);
    state.eyeBlur = Math.max(0, state.eyeBlur - dt);
    state.disgust = Math.max(0, state.disgust - 0.25 * dt);

    // 12. Final Health & Stat update
    updateHealthAndStat();
    if (
      fullHealTime === null &&
      state.stat === 'STABLE' &&
      state.brute <= 0.1 &&
      state.burn <= 0.1 &&
      state.tox <= 0.1 &&
      state.oxy <= 0.1
    ) {
      fullHealTime = time;
    }

    prevActiveAllergenIds = tickActiveAllergenIds;
    prevBlockedAllergenIds = tickBlockedAllergenIds;

    snapshots.push(
      takeSnapshot(state, tick, time, {
        activeAllergens: Array.from(tickActiveAllergenNames),
        blockedAllergens: Array.from(tickBlockedAllergenNames),
        stateById: tickAllergyStateById,
      }),
    );
  }

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  let minHealth = first.health;
  let maxHealth = first.health;
  let critDuration = 0;
  let deathTime: number | null = first.stat === 'DEAD' ? 0 : null;

  for (let i = 0; i < snapshots.length; i++) {
    const s = snapshots[i];
    if (s.health < minHealth) minHealth = s.health;
    if (s.health > maxHealth) maxHealth = s.health;
    if (i > 0 && (s.stat === 'SOFT_CRIT' || s.stat === 'HARD_CRIT')) {
      critDuration += dt;
    }
    if (deathTime === null && s.stat === 'DEAD') {
      deathTime = s.time;
    }
  }

  let worstOrgan = {
    slot: 'liver' as OrganSlot,
    label: '肝脏',
    damage: 0,
    maxHealth: 100,
    failing: false,
  };
  let worstPct = -1;
  for (const s of snapshots) {
    for (const slot of Object.keys(s.organs) as OrganSlot[]) {
      const o = s.organs[slot];
      const pct = o.maxHealth > 0 ? o.damage / o.maxHealth : 0;
      if (pct > worstPct) {
        worstPct = pct;
        worstOrgan = {
          slot,
          label: state.organs[slot].label,
          damage: o.damage,
          maxHealth: o.maxHealth,
          failing: o.failing,
        };
      }
    }
  }

  const summary: SimSummary = {
    initialHealth: first.health,
    finalHealth: last.health,
    minHealth,
    maxHealth,
    finalStat: last.stat,
    deathTime,
    fullHealTime,
    critDuration,
    healedBrute: Number((first.brute - last.brute).toFixed(2)),
    healedBurn: Number((first.burn - last.burn).toFixed(2)),
    healedTox: Number((first.tox - last.tox).toFixed(2)),
    healedOxy: Number((first.oxy - last.oxy).toFixed(2)),
    worstOrgan,
    triggeredODs: Array.from(triggeredODs),
    triggeredInverses: Array.from(triggeredInverses),
    triggeredReactions: Array.from(triggeredReactions),
    triggeredDangerReactions: Array.from(triggeredDangerReactions),
    triggeredAllergies: Array.from(triggeredAllergies),
    triggeredHeartAttack,
    triggeredStamcrit,
    triggeredSleep,
  };

  return {
    snapshots,
    events,
    summary,
    reagentsSeen: Array.from(reagentsSeenSet),
  };
}
