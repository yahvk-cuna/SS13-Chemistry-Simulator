import {
  BODYTEMP_HEAT_DAMAGE_LIMIT,
  BODYTEMP_NORMAL,
  REAGENTS_METABOLISM,
  REAGENT_STANDARD_PURITY,
  REM,
  SYNTHFLESH_UNHUSK_AMOUNT,
  SYNTHFLESH_UNHUSK_MAX,
  T0C,
  TEMPERATURE_DAMAGE_COEFFICIENT,
  UNHUSK_DAMAGE_THRESHOLD,
  metabolizeFreeConstant,
  roundStep,
} from './constants';
import type { OrganSlot, ReagentDef, ReagentInstance } from './types';

function normP(inst: ReagentInstance, def: ReagentDef): number {
  const base = def.defaultPurity || 1;
  return inst.creationPurity / base;
}

function makeOmnizineLike(opts: {
  id: string;
  enName: string;
  zhName: string;
  aliases?: string[];
  category: ReagentDef['category'];
  healing: number;
  overdoseThreshold: number;
  color?: string;
  ph?: number;
  summaryZh: string;
  mechanicsNoteZh: string;
}): ReagentDef {
  return {
    id: opts.id,
    enName: opts.enName,
    zhName: opts.zhName,
    aliases: opts.aliases,
    category: opts.category,
    targets: ['全伤', '钝伤', '烧伤', '毒素', '窒息'],
    color: opts.color ?? '#DCDCDC',
    ph: opts.ph ?? 2,
    metabolizationRate: 0.25 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: opts.overdoseThreshold,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: opts.summaryZh,
    mechanicsNoteZh: opts.mechanicsNoteZh,
    onMobLife: (ctx, _inst, ratio, dt) => {
      const heal = 2 * opts.healing * ratio * dt;
      ctx.state.tox = Math.max(0, ctx.state.tox - heal);
      ctx.state.oxy = Math.max(0, ctx.state.oxy - heal);
      ctx.state.brute = Math.max(0, ctx.state.brute - heal);
      ctx.state.burn = Math.max(0, ctx.state.burn - heal);
    },
    overdoseProcess: (ctx, _inst, ratio, dt) => {
      const hurt = 3 * ratio * dt;
      ctx.state.tox += hurt;
      ctx.state.oxy += hurt;
      ctx.state.brute += hurt;
      ctx.state.burn += hurt;
    },
  };
}

function makeCoagulant(opts: {
  id: string;
  enName: string;
  zhName: string;
  aliases?: string[];
  color: string;
  rateMult: number;
  od: number;
  clotRate: number;
  passiveBleedMod: number;
  summaryZh: string;
}): ReagentDef {
  const rate = opts.rateMult * REAGENTS_METABOLISM;
  return {
    id: opts.id,
    enName: opts.enName,
    zhName: opts.zhName,
    aliases: opts.aliases,
    category: 'unique',
    targets: ['止血'],
    color: opts.color,
    ph: 7,
    metabolizationRate: rate,
    defaultPurity: 1,
    overdoseThreshold: opts.od,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_COAGULATING'],
    summaryZh: opts.summaryZh,
    mechanicsNoteZh: `被动使出血流速 ×${opts.passiveBleedMod}；每 tick 降低出血流量 ${(opts.clotRate * 0.5).toFixed(2)}u/s。过量(${opts.od}u)时每秒 7.5% 概率造成血管栓塞（窒息+心肺伤）。`,
    onMobMetabolize: (ctx) => {
      ctx.state.bleedMod *= opts.passiveBleedMod;
    },
    onMobEndMetabolize: (ctx) => {
      ctx.state.bleedMod /= opts.passiveBleedMod;
    },
    onMobLife: (ctx, _inst, ratio, dt) => {
      const reduce = metabolizeFreeConstant(0.5, rate) * opts.clotRate * ratio * dt;
      ctx.state.bleedFlow = Math.max(0, ctx.state.bleedFlow - reduce);
    },
    overdoseProcess: (ctx, _inst, ratio, _dt) => {
      const p = ctx.chance(7.5);
      if (p > 0) {
        ctx.state.losebreath += 3 * p;
        const oxyAmt =
          metabolizeFreeConstant(1, rate) * ctx.randRange(1, 3) * ratio * p +
          0.1 * metabolizeFreeConstant(0.5, rate) * ctx.randRange(3, 4) * ratio * p;
        ctx.state.oxy += oxyAmt;
        const organDmg = metabolizeFreeConstant(0.5, rate) * ratio * p;
        if (ctx.rngMode === 'expected') {
          ctx.adjustOrganDamage('lungs', organDmg * 0.5);
          ctx.adjustOrganDamage('heart', organDmg * 0.5);
        } else {
          ctx.adjustOrganDamage(ctx.rng() < 0.5 ? 'lungs' : 'heart', organDmg);
        }
      }
    },
  };
}

function makeSimpleToxin(opts: {
  id: string;
  enName: string;
  zhName: string;
  aliases?: string[];
  color: string;
  ph: number;
  toxpwr: number;
  rateMult?: number;
  defaultPurity?: number;
  summaryZh: string;
  mechanicsNoteZh: string;
}): ReagentDef {
  const rate = (opts.rateMult ?? 1) * REAGENTS_METABOLISM;
  return {
    id: opts.id,
    enName: opts.enName,
    zhName: opts.zhName,
    aliases: opts.aliases,
    category: 'helper',
    targets: ['毒素'],
    color: opts.color,
    ph: opts.ph,
    metabolizationRate: rate,
    defaultPurity: opts.defaultPurity ?? 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    isToxin: true,
    toxpwr: opts.toxpwr,
    liverDamageMultiplier: 1,
    liverToleranceMultiplier: 1,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: opts.summaryZh,
    mechanicsNoteZh: opts.mechanicsNoteZh,
    onMobLife: (ctx, inst, ratio, dt) => {
      if (opts.toxpwr && ctx.state.health > -100) {
        const dmg =
          metabolizeFreeConstant(0.5, inst.metabolizationRate) *
          opts.toxpwr *
          (inst.creationPurity / (opts.defaultPurity ?? 1)) *
          ratio *
          dt;
        ctx.state.tox += dmg;
      }
    },
  };
}

const ALL_REAGENTS: ReagentDef[] = [
  // ==================== CORE C2 MEDICINES ====================
  {
    id: 'libital',
    enName: 'Libital',
    zhName: '利比特',
    category: 'c2',
    targets: ['钝伤'],
    color: '#ECEC8D',
    ph: 8.2,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 0,
    inverseChemVal: 0.3,
    inverseChemId: 'libitoil',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '核心钝伤治疗剂。每 tick 治疗 3 点钝伤（满纯度 4 点），造成 0.3 点肝脏损伤。',
    mechanicsNoteZh: 'rate=0.2u/tick，默认纯度75%，无过量阈值；纯度<30%转化为力比多油。',
    onMobLife(ctx, inst, ratio, dt) {
      ctx.adjustOrganDamage('liver', 0.3 * ratio * dt, undefined, true);
      ctx.state.brute = Math.max(0, ctx.state.brute - 3 * normP(inst, this) * ratio * dt);
    },
  },
  {
    id: 'helbital',
    enName: 'Helbital',
    zhName: '赫比妥',
    category: 'c2',
    targets: ['钝伤'],
    color: '#9400D3',
    ph: 8,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 35,
    inverseChemVal: 0.3,
    inverseChemId: 'helgrasp',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '伤害越高治疗钝伤越快（总伤/20~总伤/10）。非重危状态会造成窒息副作用；过量 35u 施加死灵灼烧诅咒。',
    mechanicsNoteZh:
      'rate=0.2u/tick，过量35u(满纯度46.67u)，纯度<30%转化为赫尔之握；连续代谢>=50周期结束时获得厄运预兆。',
    onMobLife(ctx, inst, ratio, dt) {
      const deathIsComing =
        (ctx.state.tox + ctx.state.oxy + ctx.state.burn + ctx.state.brute) * normP(inst, this);
      let heal = 0;
      if (ctx.state.stat === 'STABLE') {
        heal = Math.max(deathIsComing / 20, 3);
        ctx.state.oxy += 2 * ratio * dt;
      } else if (ctx.state.stat === 'SOFT_CRIT') {
        heal = roundStep(deathIsComing / 13, 0.1);
        ctx.state.oxy += 1 * ratio * dt;
      } else {
        heal = roundStep(deathIsComing / 10, 0.1);
      }
      ctx.state.brute = Math.max(0, ctx.state.brute - heal * ratio * dt);
    },
    overdoseProcess(ctx, inst, _ratio, dt) {
      if (!inst.data.helbent) {
        inst.data.helbent = true;
        ctx.addEvent('danger', 'overdose', '赫比妥诅咒生效', '受到亡灵巫师死灵诅咒（半致盲 + 持续灼烧）。');
      }
      // CURSE_WASTING deals ~0.375 burn/s (0.75 per 2s tick)
      ctx.state.burn += 0.375 * dt;
    },
    onMobEndMetabolize(ctx, inst) {
      if (inst.currentCycle >= 50) {
        const omens = Math.min(Math.round(inst.currentCycle / 51), 3);
        if (omens > 0) {
          ctx.addEvent('warn', 'status', '赫比妥厄运预兆', `代谢超过50周期，消退时施加 ${omens} 层厄运预兆。`);
        }
      }
    },
  },
  {
    id: 'probital',
    enName: 'Probital',
    zhName: '益生泰尔',
    category: 'c2',
    targets: ['钝伤'],
    color: '#FFFF6B',
    ph: 5.5,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 20,
    inverseChemVal: 0.5,
    inverseChemId: 'metafactor',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '每 tick 治疗 3 点钝伤（满纯度 4 点）但消耗耐力。口服时还会产生有丝分裂素代谢因子，将食物转为治疗肽。',
    mechanicsNoteZh: 'rate=0.2u/tick，过量20u（满纯度26.67u），纯度<50%直接转化有丝分裂素代谢因子。',
    exposeMob(ctx, method, volume, purity, temp) {
      if (method !== 'INGEST') return;
      // Removes 5% probital and adds 25% metafactor directly to bloodstream
      const stom = ctx.state.stomach.find((r) => r.id === 'probital');
      if (stom) {
        stom.volume = Math.max(0, stom.volume - volume * 0.05);
      }
      ctx.addBloodReagent('metafactor', volume * 0.25, purity, temp, true);
      ctx.addEvent(
        'good',
        'reaction',
        '益生泰尔口服酶转化',
        `口服 ${(volume * 0.05).toFixed(2)}u 益生泰尔转化为 ${(volume * 0.25).toFixed(2)}u 有丝分裂素代谢因子入血。`,
      );
    },
    onMobLife(ctx, inst, ratio, dt) {
      ctx.state.brute = Math.max(0, ctx.state.brute - 3 * ratio * normP(inst, this) * dt);
      const stam = Math.round(ctx.state.stamina);
      let sleepy = 3.5;
      if (stam >= 10 && stam <= 40) sleepy = 3;
      else if (stam >= 41 && stam <= 60) sleepy = 2.5;
      else if (stam >= 61) sleepy = 2;
      ctx.state.stamina = Math.min(120, ctx.state.stamina + sleepy * ratio * dt);
      ctx.markStaminaHit();
    },
    overdoseProcess(ctx, _inst, ratio, dt) {
      ctx.state.stamina = Math.min(120, ctx.state.stamina + 3 * ratio * dt);
      ctx.markStaminaHit();
      if (ctx.state.stamina >= 80) {
        ctx.state.drowsiness += 2 * ratio * dt;
      }
      if (ctx.state.stamina >= 100) {
        ctx.state.stamina = Math.max(0, ctx.state.stamina - 100);
        ctx.state.sleeping = Math.max(ctx.state.sleeping, 10);
        ctx.addEvent('warn', 'status', '益生泰尔过量昏睡', '耐力损耗达100，清除100耐力损耗并入睡10秒！');
      }
    },
  },
  {
    id: 'aiuri',
    enName: 'Aiuri',
    zhName: '艾尤里',
    category: 'c2',
    targets: ['烧伤'],
    color: '#8C93FF',
    ph: 4,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 0,
    inverseChemVal: 0.35,
    inverseChemId: 'aivime',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '核心烧伤药。每 tick 治疗 2 点烧伤（满纯度 2.67 点），造成 0.25 点眼部损伤。',
    mechanicsNoteZh: 'rate=0.2u/tick，无过量阈值；纯度<35%转化为艾维姆（视力模糊）。',
    onMobLife(ctx, inst, ratio, dt) {
      ctx.state.burn = Math.max(0, ctx.state.burn - 2 * normP(inst, this) * ratio * dt);
      ctx.adjustOrganDamage('eyes', 0.25 * ratio * dt, undefined, true);
    },
  },
  {
    id: 'lenturi',
    enName: 'Lenturi',
    zhName: '伦图里',
    category: 'c2',
    targets: ['烧伤'],
    color: '#6171FF',
    ph: 4.7,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 0,
    inverseChemVal: 0.4,
    inverseChemId: 'lentslurri',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '高效烧伤药。每 tick 治疗 3.75 点烧伤（满纯度 5 点），造成 0.4 点胃部损伤。',
    mechanicsNoteZh: 'Tianguan13源码 inverse_chem_val=0.4（40%以下转化为伦茨卢里，wiki 旧写为25%）。',
    onMobLife(ctx, inst, ratio, dt) {
      ctx.state.burn = Math.max(0, ctx.state.burn - 3.75 * ratio * normP(inst, this) * dt);
      ctx.adjustOrganDamage('stomach', 0.4 * ratio * dt, undefined, true);
    },
  },
  {
    id: 'hercuri',
    enName: 'Hercuri',
    zhName: '赫丘利',
    category: 'c2',
    targets: ['烧伤', '温控灭火'],
    color: '#F7FFA5',
    ph: 8.9,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 25,
    inverseChemVal: 0.3,
    inverseChemId: 'herignis',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '强力退烧灭火烧伤药。烧伤>50时每 tick 治 3 点，否则治 2.25 点；并强力降低体温与火层。',
    mechanicsNoteZh: 'rate=0.2u/tick，过量25u大幅加重降温（可能失温冻伤）；蒸气(VAPOR)喷洒可瞬间扑灭火焰。',
    exposeMob(ctx, method, volume) {
      if (method !== 'VAPOR') return;
      ctx.state.bodyTemp = Math.max(50, ctx.state.bodyTemp - volume * TEMPERATURE_DAMAGE_COEFFICIENT);
      ctx.state.fireStacks = Math.max(0, ctx.state.fireStacks - volume / 2);
      if (volume >= 0.5 * REAGENTS_METABOLISM) {
        ctx.state.onFire = false;
        ctx.state.fireStacks = 0;
        ctx.addEvent('good', 'status', '赫丘利蒸气灭火', `蒸气施用 ${volume.toFixed(1)}u 扑灭了体表火焰并降温。`);
      }
    },
    onMobLife(ctx, inst, ratio, dt) {
      const healRate = ctx.state.burn > 50 ? 3 : 2.25;
      ctx.state.burn = Math.max(0, ctx.state.burn - healRate * ratio * dt * normP(inst, this));
      const coolRand = ctx.randRange(-25, -5);
      const dTemp = coolRand * TEMPERATURE_DAMAGE_COEFFICIENT * ratio * dt;
      ctx.state.bodyTemp = Math.max(50, ctx.state.bodyTemp + dTemp);
      ctx.state.coreTemp = Math.max(50, ctx.state.coreTemp + dTemp);
      ctx.state.chemTemp = Math.max(2.7, ctx.state.chemTemp - 10 * ratio * dt);
      ctx.state.fireStacks = Math.max(0, ctx.state.fireStacks - 1 * ratio * dt);
      if (ctx.state.fireStacks <= 0) ctx.state.onFire = false;
    },
    overdoseProcess(ctx, _inst, ratio, dt) {
      const dTemp = -10 * TEMPERATURE_DAMAGE_COEFFICIENT * ratio * dt;
      ctx.state.bodyTemp = Math.max(50, ctx.state.bodyTemp + dTemp);
      ctx.state.coreTemp = Math.max(50, ctx.state.coreTemp + dTemp);
    },
  },
  {
    id: 'granibitaluri',
    enName: 'Granibitaluri',
    zhName: '格兰尼比塔卢里',
    aliases: ['格拉尼比塔卢里'],
    category: 'c2',
    targets: ['钝伤', '烧伤', '止痛'],
    color: '#E0E0E0',
    ph: 7,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 50,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_ANALGESIA'],
    summaryZh: '钝伤+烧伤双效止痛剂。轻伤时每 tick 各治 1.5 点，随总外伤递减至 0.5 点。',
    mechanicsNoteZh: '无逆反应；过量 50u 每 tick 造成 0.2 肝脏损伤与 0.2 毒素（适合配合水杨酸/奥沙雄龙收尾）。',
    onMobLife(ctx, _inst, ratio, dt) {
      const healAmount = Math.max(
        1.5 - roundStep(0.01 * (ctx.state.brute + ctx.state.burn), 0.2),
        0.5,
      );
      ctx.state.brute = Math.max(0, ctx.state.brute - healAmount * ratio * dt);
      ctx.state.burn = Math.max(0, ctx.state.burn - healAmount * ratio * dt);
    },
    overdoseProcess(ctx, _inst, ratio, dt) {
      ctx.adjustOrganDamage('liver', 0.2 * ratio * dt, undefined, true);
      ctx.state.tox += 0.2 * ratio * dt;
    },
  },
  {
    id: 'synthflesh',
    enName: 'Synthflesh',
    zhName: '合成肉',
    category: 'c2',
    targets: ['钝伤', '烧伤'],
    color: '#FFEBEB',
    ph: 7.2,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '仅靠贴片/接触/蒸气瞬间生效！每 1u 立即治疗 1.25 钝伤与 1.25 烧伤，但产生治疗总量 50%~75% 的毒素。',
    mechanicsNoteZh: '注射或口服无效；入血后无持续治疗效果。60~100u（且烧伤<=50）可使焦尸恢复正常形态。',
    exposeMob(ctx, method, volume, purity, _temp, touchProtection) {
      if (method !== 'PATCH' && method !== 'TOUCH' && method !== 'VAPOR') return;
      const eff = 1 - touchProtection;
      if (eff <= 0) return;
      const maxHeal = 1.25 * volume * eff;
      const healedBrute = Math.min(ctx.state.brute, maxHeal);
      const healedBurn = Math.min(ctx.state.burn, maxHeal);
      ctx.state.brute -= healedBrute;
      ctx.state.burn -= healedBurn;
      const toxFactor = 0.5 + 0.25 * (1 - purity);
      const addedTox = (healedBrute + healedBurn) * toxFactor;
      ctx.state.tox += addedTox;

      if (ctx.state.husked && ctx.state.burn <= UNHUSK_DAMAGE_THRESHOLD) {
        const bloodSynth = ctx.getBloodReagent('synthflesh');
        const totalVol = (bloodSynth?.volume ?? 0) + (method === 'TOUCH' ? volume : 0);
        const effPurity = bloodSynth?.purity ?? purity;
        if (totalVol >= SYNTHFLESH_UNHUSK_MAX || totalVol * effPurity >= SYNTHFLESH_UNHUSK_AMOUNT) {
          ctx.state.husked = false;
          ctx.removeBloodReagent('synthflesh', bloodSynth?.volume ?? 0);
          ctx.addEvent('good', 'status', '合成肉解除焦尸化', '合成肉剂量充足，患者焦尸状态已恢复！');
        }
      }
    },
  },
  {
    id: 'multiver',
    enName: 'Multiver',
    zhName: '多功能解毒剂',
    category: 'c2',
    targets: ['毒素', '清毒清除'],
    color: '#000000',
    ph: 9.2,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 0,
    inverseChemVal: 0.35,
    inverseChemId: 'monover',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '体内药物种类越多解毒越快（最多+3/tick），每 tick 造成 0.5 肺伤并清除 3u 非药试剂；若>=3种药物则保留其他药物。',
    mechanicsNoteZh: '满纯度100%时仅需+1种其他药物即可不清除药物（默认75%需+2种）；体内含安纳西时清除功能失效。',
    onMobLife(ctx, inst, ratio, dt) {
      let medibonus = 0;
      for (const r of ctx.state.blood) {
        if (REAGENTS[r.id]?.isMedicine) medibonus += 1;
      }
      if (inst.creationPurity >= 1) medibonus += 1;
      const toxHeal = 0.5 * Math.min(medibonus, 6 * normP(inst, this)) * ratio * dt;
      ctx.state.tox = Math.max(0, ctx.state.tox - toxHeal);
      ctx.adjustOrganDamage('lungs', 0.5 * ratio * dt, undefined, true);
      const hasAnacea = ctx.state.blood.some((r) => r.id === 'anacea' && r.volume > 0);
      if (!hasAnacea) {
        for (const r of [...ctx.state.blood]) {
          if (r.id === 'multiver') continue;
          const rDef = REAGENTS[r.id];
          if (medibonus >= 3 && rDef?.isMedicine) continue;
          ctx.removeBloodReagent(r.id, 3 * (rDef?.purgeMultiplier ?? 1) * ratio * dt);
        }
      }
    },
  },
  {
    id: 'seiver',
    enName: 'Seiver',
    zhName: '赛维尔',
    aliases: ['塞维尔'],
    category: 'c2',
    targets: ['毒素', '辐射'],
    color: '#000000',
    ph: 3.7,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 0,
    inverseChemVal: 0.45,
    inverseChemId: 'technetium',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '温度依赖型解毒剂：高温治普通毒素（上限1000K治5点/tick），超低温对受辐射者最高治 34 点/tick；每治5毒伤造成1心伤。',
    mechanicsNoteZh: '低温辐射特效需药液温度<150K（50K必触发，50~150K概率判定一次）；纯度<45%转化为锝99。',
    onMobMetabolize(ctx, inst) {
      inst.data.radsHealThreshold = ctx.randRange(50, 150);
    },
    onMobLife(ctx, inst, ratio, dt) {
      const chemtemp = Math.min(ctx.state.chemTemp || T0C, 1000);
      const nP = normP(inst, this);
      let healypoints = 0;
      const toxcalc = Math.min(roundStep(5 + (chemtemp - 1000) / 175, 0.1), 5) * ratio * dt * nP;
      if (toxcalc > 0) {
        ctx.state.tox = Math.max(0, ctx.state.tox - toxcalc);
        healypoints += toxcalc;
      }
      const radcalc = roundStep((T0C - chemtemp) / 6, 0.1) * ratio * dt;
      if (radcalc > 0 && ctx.state.irradiated) {
        const thresh = Number(inst.data.radsHealThreshold ?? 100);
        const scaledRad = radcalc * nP;
        if (chemtemp < thresh * 0.1) {
          ctx.state.tox = Math.max(0, ctx.state.tox - scaledRad * 0.9);
        } else if (chemtemp < thresh) {
          ctx.state.tox = Math.max(0, ctx.state.tox - scaledRad * 0.75);
        }
        healypoints += radcalc / 5;
      }
      healypoints = roundStep(healypoints, 0.1);
      ctx.adjustOrganDamage('heart', healypoints / 5, undefined, true);
    },
  },
  {
    id: 'syriniver',
    enName: 'Syriniver',
    zhName: '木泰尔',
    aliases: ['赛瑞尼维尔', '温辐疗'],
    category: 'c2',
    targets: ['毒素', '清毒清除'],
    color: '#8CDF24',
    ph: 8.6,
    metabolizationRate: 0.75 * REAGENTS_METABOLISM, // 0.3u/tick
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 6,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '注射时立刻治 1.5x 毒素并按肝脏健康度转化为安全的穆西弗（最高80%~100%）。极易过量（阈值6u）。',
    mechanicsNoteZh: 'rate=0.3u/tick；推荐20%稀释静脉滴注。代谢时每 tick 治 1 毒素、伤肝 0.8（0.54*ratio*dt）、清除 0.4u 试剂。',
    exposeMob(ctx, method, volume, purity, temp) {
      if (method !== 'INJECT') return;
      const nP = purity / REAGENT_STANDARD_PURITY;
      if (volume >= 0.4) {
        ctx.state.tox = Math.max(0, ctx.state.tox - 1.5 * Math.min(2, volume) * nP);
      }
      const liver = ctx.state.organs.liver;
      if (ctx.state.liverType === 'none' || liver.failing) return;
      const conv = volume * (Math.min(100 - liver.damage, 80) / 100) * nP;
      if (conv > 0) {
        ctx.removeBloodReagent('syriniver', conv);
        ctx.addBloodReagent('musiver', conv, purity, temp, true);
      }
    },
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.adjustOrganDamage('liver', 0.54 * ratio * dt, undefined, true);
      ctx.state.tox = Math.max(0, ctx.state.tox - 1.34 * ratio * dt);
      for (const r of [...ctx.state.blood]) {
        if (r.id === 'syriniver' || r.id === 'musiver') continue;
        ctx.removeBloodReagent(r.id, 0.27 * ratio * dt);
      }
    },
    overdoseProcess(ctx, _inst, ratio, dt) {
      ctx.adjustOrganDamage('liver', 1 * ratio * dt, undefined, true);
      ctx.state.disgust += 2 * ratio * dt;
      ctx.addBloodReagent('musiver', 0.15 * ratio * dt, REAGENT_STANDARD_PURITY, ctx.state.chemTemp, true);
    },
  },
  {
    id: 'musiver',
    enName: 'Musiver',
    zhName: '穆西弗',
    aliases: ['穆西维尔'],
    category: 'c2',
    targets: ['毒素', '清毒清除'],
    color: '#DFD54E',
    ph: 9.1,
    metabolizationRate: 0.25 * REAGENTS_METABOLISM, // 0.1u/tick
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 25,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '木泰尔注射后的代谢产物，肝毒仅为其1/8！每 tick 治 1.5 毒素并清除 0.2u 其他试剂。',
    mechanicsNoteZh: 'rate=0.1u/tick，过量25u导致严重肝损、恶心与肌无力创伤。',
    onMobLife(ctx, inst, ratio, dt) {
      ctx.adjustOrganDamage('liver', 0.2 * ratio * dt, undefined, true);
      ctx.state.tox = Math.max(0, ctx.state.tox - 3 * normP(inst, this) * ratio * dt);
      for (const r of [...ctx.state.blood]) {
        if (r.id === 'syriniver' || r.id === 'musiver') continue;
        const mult = REAGENTS[r.id]?.purgeMultiplier ?? 1;
        ctx.removeBloodReagent(r.id, 0.4 * mult * ratio * dt);
      }
    },
    overdoseStart(ctx) {
      ctx.addEvent('danger', 'overdose', '穆西弗过量：肌无力创伤', '触发绝对韧性肌无力创伤、重度肝损伤与厌恶呕吐！');
    },
    overdoseProcess(ctx, _inst, ratio, dt) {
      ctx.adjustOrganDamage('liver', 3 * ratio * dt, undefined, true);
      ctx.state.disgust += 6 * ratio * dt;
    },
  },
  {
    id: 'tirimol',
    enName: 'Tirimol',
    zhName: '特里莫尔',
    category: 'c2',
    targets: ['窒息'],
    color: '#FF6464',
    ph: 5.6,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 0,
    inverseChemVal: 0.25,
    inverseChemId: 'super_melatonin',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '应急窒息药，每 tick 治 4.5 窒息（满纯度6点）但造成 2 点耐力损耗，耗尽时若停留>21周期会强制入睡10秒。',
    mechanicsNoteZh: 'rate=0.2u/tick；纯度<25%转化为超级褪黑素（睡后使所有药物纯度×1.25）。',
    onMobLife(ctx, inst, ratio, dt) {
      ctx.state.oxy = Math.max(0, ctx.state.oxy - 4.5 * ratio * dt * normP(inst, this));
      ctx.state.stamina = Math.min(120, ctx.state.stamina + 2 * ratio * dt);
      ctx.markStaminaHit();
      if (inst.data.drowsyNext === undefined) {
        inst.data.drowsyNext = ctx.time + 15;
      } else if (ctx.time >= Number(inst.data.drowsyNext)) {
        ctx.state.drowsiness += 20;
        inst.data.drowsyNext = ctx.time + 45;
      }
    },
    onMobEndMetabolize(ctx, inst) {
      if (inst.currentCycle > 21) {
        ctx.state.sleeping = Math.max(ctx.state.sleeping, 10);
        ctx.addEvent('warn', 'status', '特里莫尔耗尽昏睡', `在体内停留 ${inst.currentCycle} 周期，耗尽时入睡 10 秒。`);
      }
    },
  },
  {
    id: 'convermol',
    enName: 'Convermol',
    zhName: '肯尔莫',
    category: 'c2',
    targets: ['窒息'],
    color: '#FF6464',
    ph: 5.6,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 35,
    inverseChemVal: 0.5,
    inverseChemId: 'coveroli',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '以 5:1 比率将窒息伤转化为毒素伤，治疗速度随体内停留周期数线性递增。',
    mechanicsNoteZh: '过量 35u 时不仅按理论上限产生毒素，还会不断加速自身代谢至 1u/tick；Tianguan13源码逆阈值为 <50%（可维罗利）。',
    onMobLife(ctx, inst, ratio, dt) {
      let oxycalc = 2.5 * ratio * (inst.currentCycle - 1);
      if (!inst.overdosed) {
        oxycalc = Math.min(oxycalc, ctx.state.oxy + 0.5);
      }
      ctx.state.oxy = Math.max(0, ctx.state.oxy - 2 * oxycalc * normP(inst, this) * ratio * dt);
      ctx.state.tox += (2 * oxycalc * ratio * dt) / 5;
      if (ctx.chance((inst.currentCycle - 1) / 2) > 0 && ctx.state.losebreath > 0) {
        ctx.state.losebreath = Math.max(0, ctx.state.losebreath - 1);
      }
    },
    overdoseProcess(_ctx, inst) {
      inst.metabolizationRate += 2.5 * REAGENTS_METABOLISM;
    },
  },
  {
    id: 'penthrite',
    enName: 'Penthrite',
    zhName: '彭斯莱特',
    category: 'c2',
    targets: ['危急抢救', '心脏', '全伤'],
    color: '#F5F5F5',
    ph: 12.7,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 50,
    inverseChemVal: 0.25,
    inverseChemId: 'nooartrium',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_STABLEHEART', 'TRAIT_NOHARDCRIT', 'TRAIT_NOSOFTCRIT', 'TRAIT_NOCRITDAMAGE'],
    summaryZh: '维持心跳阻止进入轻/重危（下限 -60HP，满纯度 -80HP），低于0HP时急速回血但损伤心脏；禁止与肾上腺素/阿托品混用！',
    mechanicsNoteZh: '低于阈值(-60/-80)立刻清空自身并引发心脏骤停；与肾上腺素或阿托品1:1相遇瞬间体内爆炸！',
    onMobLife(ctx, inst, ratio, dt) {
      ctx.adjustOrganDamage('stomach', 0.25 * ratio * dt, undefined, true);
      const floorThresh = -30 * (2 * normP(inst, this));
      if (ctx.state.health <= 0 && ctx.state.health > floorThresh) {
        ctx.state.tox = Math.max(0, ctx.state.tox - 2 * ratio * dt);
        ctx.state.brute = Math.max(0, ctx.state.brute - 2 * ratio * dt);
        ctx.state.burn = Math.max(0, ctx.state.burn - 2 * ratio * dt);
        ctx.state.oxy = Math.max(0, ctx.state.oxy - 6 * ratio * dt);
        ctx.state.losebreath = 0;
        ctx.adjustOrganDamage('heart', 1 * Math.max(inst.volume / 10, 1) * ratio * dt, undefined, true);
        ctx.state.jitter = Math.max(ctx.state.jitter, 2 * ratio * dt);
        ctx.state.dizzy = Math.max(ctx.state.dizzy, 2 * ratio * dt);
      }
      if (ctx.state.health <= floorThresh) {
        ctx.state.traits.delete('TRAIT_STABLEHEART');
        ctx.state.heartAttack = true;
        inst.volume = 0;
        ctx.addEvent(
          'danger',
          'vital',
          '彭斯莱特崩溃：心脏骤停',
          `生命值跌破维持阈值 (${floorThresh.toFixed(0)})，彭斯莱特耗竭清空并诱发心肌梗塞！`,
        );
      }
    },
    overdoseProcess(ctx, _inst, ratio, dt) {
      ctx.state.traits.delete('TRAIT_STABLEHEART');
      ctx.state.stamina = Math.min(120, ctx.state.stamina + 10 * ratio * dt);
      ctx.markStaminaHit();
      ctx.adjustOrganDamage('heart', 10 * ratio * dt, undefined, true);
      if (!ctx.state.heartAttack) {
        ctx.state.heartAttack = true;
        ctx.addEvent('danger', 'overdose', '彭斯莱特过量：心脏骤停', '过量 50u 导致心搏骤停与剧烈心损！');
      }
    },
  },

  // ==================== SUPERIOR MEDICINES ====================
  {
    id: 'sal_acid',
    enName: 'Salicylic Acid',
    zhName: '水杨酸',
    category: 'superior',
    targets: ['钝伤'],
    color: '#D2D2D2',
    ph: 2.1,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 25,
    inverseChemVal: 0.3,
    inverseChemId: 'benzoic_acid',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '高阶重度钝伤药：钝伤>25时每 tick 治 4 点，<=25时每 tick 仅治 0.5 点，无器官副伤。',
    mechanicsNoteZh: '过量 25u 且仍有钝伤时，每 tick 反向造成 4.5 点钝伤。',
    onMobLife(ctx, inst, ratio, dt) {
      const rate = ctx.state.brute > 25 ? 4 : 0.5;
      ctx.state.brute = Math.max(0, ctx.state.brute - rate * ratio * dt * normP(inst, this));
    },
    overdoseProcess(ctx, _inst, ratio, dt) {
      if (ctx.state.brute > 0) {
        ctx.state.brute += 4.5 * ratio * dt;
      }
    },
  },
  {
    id: 'oxandrolone',
    enName: 'Oxandrolone',
    zhName: '奥沙雄龙',
    aliases: ['氧雄龙'],
    category: 'superior',
    targets: ['烧伤'],
    color: '#1E8BFF',
    ph: 10.7,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 25,
    inverseChemVal: 0.3,
    inverseChemId: 'oxymetholone',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '高阶重度烧伤药：烧伤>25时每 tick 治 4 点，<=25时每 tick 治 0.5 点，无器官副伤。',
    mechanicsNoteZh: '过量 25u 且仍有烧伤时，每 tick 反向造成 4.5 点烧伤。',
    onMobLife(ctx, inst, ratio, dt) {
      const rate = ctx.state.burn > 25 ? 4 : 0.5;
      ctx.state.burn = Math.max(0, ctx.state.burn - rate * ratio * dt * normP(inst, this));
    },
    overdoseProcess(ctx, _inst, ratio, dt) {
      if (ctx.state.burn > 0) {
        ctx.state.burn += 4.5 * ratio * dt;
      }
    },
  },
  {
    id: 'salbutamol',
    enName: 'Salbutamol',
    zhName: '沙丁胺醇',
    category: 'superior',
    targets: ['窒息'],
    color: '#00FFFF',
    ph: 2,
    metabolizationRate: 0.25 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0.25,
    inverseChemId: 'bamethan',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '最强窒息急救药！代谢极慢（0.1u/tick），每 tick 治 3 点窒息并减少失去呼吸层数。',
    mechanicsNoteZh: '无过量阈值，无任何器官/毒素副作用。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.state.oxy = Math.max(0, ctx.state.oxy - 6 * ratio * dt);
      ctx.state.losebreath = Math.max(0, ctx.state.losebreath - 4 * ratio * dt);
    },
  },
  {
    id: 'albuterol',
    enName: 'Albuterol',
    zhName: '沙丁胺醇（吸入型）',
    aliases: ['沙丁胺醇', '支气管扩张剂'],
    category: 'superior',
    targets: ['肺部', '窒息'],
    color: '#8df5f0',
    ph: 4,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 30,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '支气管扩张剂，提升肺部受压倍率 +0.4（改善低压缺氧与哮喘）；过量 30u 反而导致肺功能下降。',
    mechanicsNoteZh: '过量 40 周期后引起视线模糊与耐力损耗（上限80）。',
    onMobMetabolize: (ctx) => {
      ctx.state.lungPressureMod += 0.4;
    },
    onMobEndMetabolize: (ctx) => {
      ctx.state.lungPressureMod = Math.max(0.2, ctx.state.lungPressureMod - 0.4);
    },
    overdoseProcess(ctx, inst, _ratio, dt) {
      if (ctx.chance(35) > 0) {
        if (ctx.rngMode === 'expected' || ctx.rng() < 0.6) {
          ctx.state.losebreath += ctx.chance(35) * 0.6;
        }
      }
      if (inst.currentCycle > 40) {
        if (ctx.state.stamina < 80) {
          ctx.state.stamina = Math.min(80, ctx.state.stamina + dt);
          ctx.markStaminaHit();
        }
      }
    },
  },
  {
    id: 'regen_jelly',
    enName: 'Regenerative Jelly',
    zhName: '再生果冻',
    category: 'superior',
    targets: ['全伤', '钝伤', '烧伤', '毒素', '窒息'],
    color: '#CC23FF',
    ph: 7,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '每 tick 平衡治疗四项基础伤害各 1.5 点，无过量阈值与副作用（rate=0.4u/tick）。',
    mechanicsNoteZh: '四项各 -0.75 * ratio * dt = -1.5/tick（1.0x代谢）。',
    onMobLife(ctx, _inst, ratio, dt) {
      const heal = 0.75 * ratio * dt;
      ctx.state.brute = Math.max(0, ctx.state.brute - heal);
      ctx.state.burn = Math.max(0, ctx.state.burn - heal);
      ctx.state.oxy = Math.max(0, ctx.state.oxy - heal);
      ctx.state.tox = Math.max(0, ctx.state.tox - heal);
    },
  },
  {
    id: 'pen_acid',
    enName: 'Pentetic Acid',
    zhName: '喷替酸',
    category: 'superior',
    targets: ['毒素', '清毒清除', '辐射'],
    color: '#E6FFF0',
    ph: 1,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0.4,
    inverseChemId: 'pendetide',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_HALT_RADIATION_EFFECTS'],
    summaryZh: '每 tick 治疗 2 点毒素并清除 2u 所有其他试剂（含药物与毒素），同时免疫辐射伤害。',
    mechanicsNoteZh: 'rate=0.2u/tick，无过量；能压制安纳西对药物的清除速率。纯度<40%转化为彭德泰德。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.state.tox = Math.max(0, ctx.state.tox - 2 * ratio * dt);
      for (const r of [...ctx.state.blood]) {
        if (r.id === 'pen_acid') continue;
        const mult = REAGENTS[r.id]?.purgeMultiplier ?? 1;
        ctx.removeBloodReagent(r.id, 2 * mult * ratio * dt);
      }
    },
  },
  {
    id: 'atropine',
    enName: 'Atropine',
    zhName: '阿托品',
    category: 'superior',
    targets: ['危急抢救', '全伤'],
    color: '#1D3535',
    ph: 12,
    metabolizationRate: 0.25 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 35,
    inverseChemVal: 0.35,
    inverseChemId: 'hyoscyamine',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    addedTraits: ['TRAIT_NOCRITDAMAGE', 'TRAIT_PREVENT_IMPLANT_AUTO_EXPLOSION'],
    summaryZh: '危急状态(HP<=0)每 tick 治 2 钝/烧/毒 + 5 窒息，并清除失呼吸防止濒死窒息。与彭斯莱特混用会爆炸！',
    mechanicsNoteZh: 'rate=0.1u/tick，过量35u造成 0.5 毒素/tick 并持续眩晕颤抖。',
    onMobLife(ctx, _inst, ratio, dt) {
      if (ctx.state.health <= 0) {
        ctx.state.tox = Math.max(0, ctx.state.tox - 4 * ratio * dt);
        ctx.state.brute = Math.max(0, ctx.state.brute - 4 * ratio * dt);
        ctx.state.burn = Math.max(0, ctx.state.burn - 4 * ratio * dt);
        ctx.state.oxy = Math.max(0, ctx.state.oxy - 10 * ratio * dt);
      }
      ctx.state.losebreath = 0;
      const p = ctx.chance(10);
      if (p > 0) {
        ctx.state.dizzy = Math.max(ctx.state.dizzy, 10 * p);
        ctx.state.jitter = Math.max(ctx.state.jitter, 10 * p);
      }
    },
    overdoseProcess(ctx, _inst, ratio, dt) {
      ctx.state.tox += 1 * ratio * dt;
      ctx.state.dizzy = Math.max(ctx.state.dizzy, 4 * ratio * dt);
      ctx.state.jitter = Math.max(ctx.state.jitter, 4 * ratio * dt);
    },
  },
  {
    id: 'calomel',
    enName: 'Calomel',
    zhName: '甘汞',
    category: 'superior',
    targets: ['清毒清除'],
    color: '#c85319',
    ph: 1.5,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 20,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '快速血液清除剂：每 tick 清除 3u 所有其他试剂，但生命>0时造成 (HP/40) 毒素；生命<0时反而治疗毒素。',
    mechanicsNoteZh: 'rate=0.4u/tick；过量 20u 每 tick 额外造成 2.5 毒素并加快自身清除 2u/tick。',
    onMobLife(ctx, _inst, ratio, dt) {
      for (const r of [...ctx.state.blood]) {
        if (r.id === 'calomel') continue;
        const mult = REAGENTS[r.id]?.purgeMultiplier ?? 1;
        ctx.removeBloodReagent(r.id, 1.5 * mult * ratio * dt);
      }
      const toxAmt = roundStep(ctx.state.health / 40, 0.1);
      ctx.state.tox = Math.max(0, ctx.state.tox + 0.5 * toxAmt * ratio * dt);
    },
    overdoseProcess(ctx, _inst, ratio, dt) {
      ctx.removeBloodReagent('calomel', 1 * ratio * dt);
      ctx.state.tox += 1.25 * ratio * dt;
    },
  },
  {
    id: 'ammoniated_mercury',
    enName: 'Ammoniated Mercury',
    zhName: '氨化汞',
    category: 'superior',
    targets: ['毒素', '清毒清除'],
    color: '#f3f1f0',
    ph: 7,
    metabolizationRate: 0.1 * REAGENTS_METABOLISM, // 0.04u/tick
    defaultPurity: 1,
    overdoseThreshold: 10,
    inverseChemVal: 0.5,
    inverseChemId: 'ammoniated_sludge',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '极速清除毒素类试剂(5u/tick)，外伤低时每 tick 治 3 毒素；若外伤较高会严重反伤毒素！无毒素时加速自净。',
    mechanicsNoteZh: '毒素调整=(round(钝伤/15,0.1)+round(烧伤/30,0.1)-3)×1u/tick；过量10u造成 3 毒素/tick。',
    onMobLife(ctx, _inst, ratio, dt) {
      let toxinCount = 0;
      for (const r of [...ctx.state.blood]) {
        const def = REAGENTS[r.id];
        if (!def?.isToxin) continue;
        toxinCount += 1;
        ctx.removeBloodReagent(r.id, 25 * (def.purgeMultiplier ?? 1) * ratio * dt);
      }
      const toxFactor =
        roundStep(ctx.state.brute / 15, 0.1) + roundStep(ctx.state.burn / 30, 0.1) - 3;
      ctx.state.tox = Math.max(0, ctx.state.tox + 5 * toxFactor * ratio * dt);
      if (toxinCount === 0) {
        ctx.removeBloodReagent('ammoniated_mercury', 5 * ratio * dt);
      }
    },
    overdoseProcess(ctx, _inst, ratio, dt) {
      ctx.state.tox += 15 * ratio * dt;
    },
  },
  {
    id: 'cryoxadone',
    enName: 'Cryoxadone',
    zhName: '冰晶沙酮',
    category: 'superior',
    targets: ['全伤', '伤口愈合', '温控灭火'],
    color: '#0000C8',
    ph: 11,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '低温仓专用药：体温<273.15K生效（昏迷/睡眠时效力翻倍），治疗四项伤势并推进严重伤口愈合计数器 (33/66/99)。',
    mechanicsNoteZh: '功率 = -0.00003 * T² + 3；代谢速率随体温降低而减慢 (0.4*(0.00001*T²+0.5))。',
    onMobLife(ctx, inst, ratio, dt) {
      inst.metabolizationRate = REAGENTS_METABOLISM * (0.00001 * ctx.state.bodyTemp ** 2 + 0.5);
      if (ctx.state.bodyTemp >= T0C) return;
      let power = -0.00003 * ctx.state.bodyTemp ** 2 + 3;
      if (ctx.state.unconscious || ctx.state.sleeping > 0 || ctx.state.stat !== 'STABLE') {
        power *= 2;
      }
      if (power <= 0) return;
      ctx.state.oxy = Math.max(0, ctx.state.oxy - 1.5 * power * ratio * dt);
      ctx.state.brute = Math.max(0, ctx.state.brute - 0.5 * power * ratio * dt);
      ctx.state.burn = Math.max(0, ctx.state.burn - 0.5 * power * ratio * dt);
      ctx.state.tox = Math.max(0, ctx.state.tox - 0.5 * power * ratio * dt);
      if (ctx.state.woundCount > 0) {
        ctx.state.woundCounter += 0.5 * power * ratio * dt;
      }
    },
  },
  {
    id: 'pyroxadone',
    enName: 'Pyroxadone',
    zhName: '吡洛沙酮',
    category: 'superior',
    targets: ['全伤', '伤口愈合', '温控灭火'],
    color: '#f7832a',
    ph: 12,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '高温急救药：体温>340.15K生效，温度越高(340/400/460K -> 2/3/5功率)或着火(×2)时急速全伤治疗与伤口愈合。',
    mechanicsNoteZh: '与冰晶沙酮共享伤口愈合计数器 (33/66/99)，可逆转毁容。',
    onMobLife(ctx, _inst, ratio, dt) {
      if (ctx.state.bodyTemp <= BODYTEMP_HEAT_DAMAGE_LIMIT) return;
      let power = 5;
      if (ctx.state.bodyTemp <= 400) power = 2;
      else if (ctx.state.bodyTemp <= 460) power = 3;
      if (ctx.state.onFire) power *= 2;
      ctx.state.oxy = Math.max(0, ctx.state.oxy - 1 * power * ratio * dt);
      ctx.state.brute = Math.max(0, ctx.state.brute - 0.5 * power * ratio * dt);
      ctx.state.burn = Math.max(0, ctx.state.burn - 0.75 * power * ratio * dt);
      ctx.state.tox = Math.max(0, ctx.state.tox - 0.5 * power * ratio * dt);
      if (ctx.state.woundCount > 0) {
        ctx.state.woundCounter += 0.5 * power * ratio * dt;
      }
    },
  },
  {
    id: 'rezadone',
    enName: 'Rezadone',
    zhName: '瑞扎酮',
    category: 'superior',
    targets: ['钝伤', '烧伤', '尸体复活'],
    color: '#669900',
    ph: 12.2,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 30,
    inverseChemVal: 0.25,
    inverseChemId: 'inreziniver',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '每 tick 治 1 钝伤与 1 烧伤，5u 以上接触即可解除烧伤焦尸状态(烧伤<50)。',
    mechanicsNoteZh: '过量 30u 每 tick 造成 1 毒素、眩晕与颤抖。',
    exposeMob(ctx, _method, volume, _purity, _temp, touchProtection) {
      const effVol = volume * (1 - touchProtection);
      if (effVol >= 5 && ctx.state.husked && ctx.state.burn < UNHUSK_DAMAGE_THRESHOLD) {
        ctx.state.husked = false;
        ctx.addEvent('good', 'status', '瑞扎酮解除焦尸', '瑞扎酮使患者摆脱焦尸状态。');
      }
    },
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.state.brute = Math.max(0, ctx.state.brute - 0.5 * ratio * dt);
      ctx.state.burn = Math.max(0, ctx.state.burn - 0.5 * ratio * dt);
    },
    overdoseProcess(ctx, _inst, ratio, dt) {
      ctx.state.tox += 0.5 * ratio * dt;
      ctx.state.dizzy = Math.max(ctx.state.dizzy, 5 * ratio * dt);
      ctx.state.jitter = Math.max(ctx.state.jitter, 5 * ratio * dt);
    },
  },

  // ==================== UNIQUE MEDICINES ====================
  {
    id: 'mannitol',
    enName: 'Mannitol',
    zhName: '甘露醇',
    category: 'unique',
    targets: ['大脑'],
    color: '#A0A0A0',
    ph: 10.4,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 15,
    inverseChemVal: 0.45,
    inverseChemId: 'toxic_monomers',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_TUMOR_SUPPRESSED'],
    summaryZh: '脑损伤特效药，每 tick 治疗 2 点大脑损伤（满纯度 2.67 点）；过量仅刷提示文本。',
    mechanicsNoteZh: 'rate=0.4u/tick；纯度<45%转化为逆产物。',
    onMobLife(ctx, inst, ratio, dt) {
      ctx.adjustOrganDamage('brain', -1 * ratio * dt * normP(inst, this), undefined, true);
    },
  },
  {
    id: 'neurine',
    enName: 'Neurine',
    zhName: '神经碱',
    aliases: ['神经素'],
    category: 'unique',
    targets: ['大脑', '尸体复活'],
    color: '#C0C0C0',
    ph: 7,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 0,
    inverseChemVal: 0.5,
    inverseChemId: 'neruwhine',
    isMedicine: true,
    reverseMetabolism: true,
    selfConsuming: true,
    deadProcess: true,
    penetratesSkin: 'VAPOR',
    addedTraits: ['TRAIT_ANTICONVULSANT'],
    summaryZh: '修复轻度脑创伤、清除神经毒素；100% 纯度时会记住初始脑伤并在消退时回溯；死亡状态每 tick 治 1 脑伤。',
    mechanicsNoteZh: '自耗药（无肝亦可代谢）且对死者生效。纯度<50%转化为内鲁瓦因。',
    onMobAdd(ctx, inst) {
      if (inst.creationPurity >= 1) {
        inst.data.initialBdamage = ctx.state.organs.brain.damage;
      }
    },
    onMobLife(ctx, inst, ratio, dt) {
      if (ctx.getBloodReagent('neurotoxin')) {
        ctx.removeBloodReagent('neurotoxin', 2.5 * ratio * dt * normP(inst, this));
      }
    },
    onMobDead(ctx, inst, ratio, dt) {
      ctx.adjustOrganDamage('brain', -0.5 * ratio * dt * normP(inst, this), undefined, true);
    },
    onMobDelete(ctx, inst) {
      if (inst.data.initialBdamage !== undefined) {
        const init = Number(inst.data.initialBdamage);
        if (init < ctx.state.organs.brain.damage) {
          ctx.state.organs.brain.damage = init;
          ctx.addEvent('good', 'organ', '100%纯度神经碱脑伤回溯', `脑伤恢复至入血前记录的 ${init.toFixed(1)}。`);
        }
      }
    },
  },
  {
    id: 'mutadone',
    enName: 'Mutadone',
    zhName: '突变酮',
    category: 'unique',
    targets: ['专效解毒', '抗晕止吐'],
    color: '#5096C8',
    ph: 2,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '立即移除基因突变与颤抖状态。',
    mechanicsNoteZh: 'rate=0.4u/tick。',
    onMobLife(ctx) {
      ctx.state.jitter = 0;
    },
  },
  {
    id: 'potass_iodide',
    enName: 'Potassium Iodide',
    zhName: '碘化钾',
    category: 'unique',
    targets: ['辐射', '毒素'],
    color: '#BAA15D',
    ph: 12,
    metabolizationRate: 2 * REAGENTS_METABOLISM, // 0.8u/tick
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_HALT_RADIATION_EFFECTS'],
    summaryZh: '免疫辐射引起的灼烧与毒素伤害；若患者受辐射，每 tick 额外治 1 点毒素。',
    mechanicsNoteZh: '代谢极快（0.8u/tick）。',
    onMobLife(ctx, _inst, ratio, dt) {
      if (ctx.state.irradiated) {
        ctx.state.tox = Math.max(0, ctx.state.tox - 0.25 * ratio * dt);
      }
    },
  },
  {
    id: 'salglu_solution',
    enName: 'Saline-Glucose Solution',
    zhName: '盐水葡萄糖溶液',
    aliases: ['生理盐水葡萄糖溶液', '生理盐水-葡萄糖溶液'],
    category: 'unique',
    targets: ['补血', '钝伤', '烧伤'],
    color: '#DCDCDC',
    ph: 5.5,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 60,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '每 1u 临时等效稀释 +5u 血量（防大失血缺氧），每 tick 恢复 0.5u 血液，约 33% 概率治 0.5 钝/烧伤。',
    mechanicsNoteZh: 'rate=0.2u/tick，过量阈值高达 60u；过量时 33% 概率反向造成 0.5 钝/烧伤。',
    onMobLife(ctx, _inst, ratio, dt) {
      const p = ctx.chance(18);
      if (p > 0) {
        ctx.state.brute = Math.max(0, ctx.state.brute - 0.5 * ratio * p);
        ctx.state.burn = Math.max(0, ctx.state.burn - 0.5 * ratio * p);
      }
      ctx.state.bloodVolume = Math.min(560, ctx.state.bloodVolume + 0.25 * ratio * dt);
    },
    overdoseProcess(ctx, _inst, ratio) {
      const p = ctx.chance(18);
      if (p > 0) {
        ctx.state.brute += 0.5 * ratio * p;
        ctx.state.burn += 0.5 * ratio * p;
      }
    },
  },
  {
    id: 'ephedrine',
    enName: 'Ephedrine',
    zhName: '麻黄碱',
    category: 'unique',
    targets: ['耐力', '抗晕止吐'],
    color: '#D2FFFA',
    ph: 12,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 30,
    inverseChemVal: 0.4,
    inverseChemId: 'corazargh',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_BATON_RESISTANCE', 'TRAIT_STIMULATED'],
    summaryZh: '提升移动速度、免疫电棍击倒、缩短行动受限，每 tick 恢复 4 点耐力（满纯度5.33）。',
    mechanicsNoteZh: '过量 30u 每秒高概率(18%)产生毒素与失呼吸，且有低概率(1%~2%/s)诱发心搏骤停！纯度<40%转化为科拉扎尔格。',
    onMobLife(ctx, inst, ratio, dt) {
      ctx.state.stamina = Math.max(0, ctx.state.stamina - 4 * ratio * dt * normP(inst, this));
    },
    overdoseProcess(ctx, inst, ratio) {
      const scale = 1 + (1 - normP(inst, this));
      if (ctx.discreteChance(1 * scale)) {
        if (!ctx.state.heartAttack) {
          ctx.state.heartAttack = true;
          ctx.addEvent('danger', 'overdose', '麻黄碱过量：心搏骤停！', '随机触发麻黄碱过量致死性心力衰竭。');
        }
      }
      const p = ctx.chance(18 * scale);
      if (p > 0) {
        ctx.state.tox += 1 * ratio * p;
        ctx.state.losebreath += p;
      }
    },
  },
  {
    id: 'diphenhydramine',
    enName: 'Diphenhydramine',
    zhName: '苯海拉明',
    category: 'unique',
    targets: ['专效解毒', '抗晕止吐'],
    color: '#64FFE6',
    ph: 11.5,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '快速清除血液中的致命组胺（4u/tick），减少颤抖，略微导致困倦。',
    mechanicsNoteZh: '过敏休克（组胺过量）的特效解药。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.state.drowsiness += 2 * ctx.chance(5);
      ctx.state.jitter = Math.max(0, ctx.state.jitter - 2 * ratio * dt);
      ctx.removeBloodReagent('histamine', 2 * ratio * dt);
    },
  },
  {
    id: 'oculine',
    enName: 'Oculine',
    zhName: '明目素',
    category: 'unique',
    targets: ['眼睛'],
    color: '#404040',
    ph: 10,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 30,
    inverseChemVal: 0.45,
    inverseChemId: 'oculater',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '修复眼部损伤（每 tick 治 2 点，满纯度 2.67），清除暂时失明与视力模糊。',
    mechanicsNoteZh: '过量 30u 反向每 tick 造成 1.5 点眼伤；纯度<45%转化为奥库莱特（暂时失明）。',
    onMobLife(ctx, inst, ratio, dt) {
      const nP = normP(inst, this);
      ctx.state.eyeBlur = Math.max(0, ctx.state.eyeBlur - 2 * ratio * dt * nP);
      ctx.adjustOrganDamage('eyes', -1 * ratio * dt * nP, undefined, true);
    },
    overdoseProcess(ctx, _inst, ratio, dt) {
      ctx.adjustOrganDamage('eyes', 0.75 * ratio * dt, undefined, true);
    },
  },
  {
    id: 'inacusiate',
    enName: 'Inacusiate',
    zhName: '复聪剂',
    aliases: ['因纳库西埃特'],
    category: 'unique',
    targets: ['耳朵'],
    color: '#606060',
    ph: 2,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 0,
    inverseChemVal: 0.3,
    inverseChemId: 'tinacusiate',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '快速修复耳部损伤（每 tick 治 4 点，满纯度 5.33）并治疗损伤性耳聋。',
    mechanicsNoteZh: 'rate=0.4u/tick；纯度<30%转化为蒂纳库西亚特。',
    onMobLife(ctx, inst, ratio, dt) {
      ctx.adjustOrganDamage('ears', -2 * normP(inst, this) * ratio * dt);
    },
  },
  {
    id: 'epinephrine',
    enName: 'Epinephrine',
    zhName: '肾上腺素',
    category: 'unique',
    targets: ['危急抢救', '耐力'],
    color: '#D2FFFA',
    ph: 10.2,
    metabolizationRate: 0.25 * REAGENTS_METABOLISM, // 0.1u/tick
    defaultPurity: 1,
    overdoseThreshold: 30,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_NOCRITDAMAGE'],
    summaryZh: '阻止危急状态缺氧恶化！危急时每 tick 全伤各治 0.5 点，恢复耐力 2 点；与莱克索林冲突，禁止与彭斯莱特混用！',
    mechanicsNoteZh: 'rate=0.1u/tick，过量30u引起耐力损耗/毒素/失呼吸；体内有莱克索林时会停止治疗并生成组胺。',
    onMobLife(ctx, _inst, ratio, dt) {
      if (ctx.getBloodReagent('lexorin')) {
        const p = ctx.chance(10);
        if (p > 0) ctx.addBloodReagent('histamine', 4 * p, 1, ctx.state.chemTemp, true);
        return;
      }
      if (ctx.state.health <= 0) {
        const heal = 1 * ratio * dt;
        ctx.state.tox = Math.max(0, ctx.state.tox - heal);
        ctx.state.brute = Math.max(0, ctx.state.brute - heal);
        ctx.state.burn = Math.max(0, ctx.state.burn - heal);
        ctx.state.oxy = Math.max(0, ctx.state.oxy - heal);
      }
      ctx.state.losebreath = Math.max(0, ctx.state.losebreath - 4 * ratio * dt);
      ctx.state.stamina = Math.max(0, ctx.state.stamina - 4 * ratio * dt);
    },
    metabolizeReagent(ctx, inst, metabolizedVol, dt) {
      if (ctx.getBloodReagent('lexorin')) {
        ctx.removeBloodReagent('lexorin', 1 * REM * metabolizedVol * dt);
        inst.volume -= 0.5 * REM * metabolizedVol * dt;
      }
      inst.volume -= metabolizedVol;
    },
    overdoseProcess(ctx, _inst, ratio) {
      const p = ctx.chance(18);
      if (p > 0) {
        ctx.state.stamina = Math.min(120, ctx.state.stamina + 5 * ratio * p);
        ctx.markStaminaHit();
        ctx.state.tox += 2 * ratio * p;
        ctx.state.losebreath += p;
      }
    },
  },
  {
    id: 'antihol',
    enName: 'Antihol',
    zhName: '安替霍尔',
    category: 'unique',
    targets: ['专效解毒', '毒素'],
    color: '#00B4C8',
    ph: 4,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 0,
    inverseChemVal: 0.35,
    inverseChemId: 'prohol',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '极速清除体内乙醇（8u/tick，满纯度10.67u），消除混乱/眩晕/困倦，并微幅治毒 0.2/tick。',
    mechanicsNoteZh: '纯度<35%转化为普罗霍尔（加重醉酒）。',
    onMobLife(ctx, inst, ratio, dt) {
      ctx.state.confusion = 0;
      ctx.state.dizzy = 0;
      ctx.state.drowsiness = 0;
      for (const r of [...ctx.state.blood]) {
        if (REAGENTS[r.id]?.isAlcohol) {
          ctx.removeBloodReagent(r.id, 4 * ratio * dt * normP(inst, this));
        }
      }
      ctx.state.tox = Math.max(0, ctx.state.tox - 0.1 * ratio * dt);
    },
  },
  {
    id: 'insulin',
    enName: 'Insulin',
    zhName: '胰岛素',
    category: 'unique',
    targets: ['专效解毒'],
    color: '#FFFFF0',
    ph: 6.7,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '快速清除体内糖分（6u/tick）并缩短睡眠时间。',
    mechanicsNoteZh: '对抗高血糖休克或蜂蜜代谢产糖。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.state.sleeping = Math.max(0, ctx.state.sleeping - 2 * ratio * dt);
      ctx.removeBloodReagent('sugar', 3 * ratio * dt);
    },
  },
  {
    id: 'strange_reagent',
    enName: 'Strange Reagent',
    zhName: '奇异试剂',
    category: 'unique',
    targets: ['尸体复活'],
    color: '#A0E85E',
    ph: 0.5,
    metabolizationRate: 1.25 * REAGENTS_METABOLISM, // 0.5u/tick
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '仅对尸体口服有效：使未焦尸且钝+烧<=200的尸体7秒后复活（活人误服每 tick 随机烧钝伤各0~2.5）。',
    mechanicsNoteZh: '复活最低需求量 = max(1, (钝伤+烧伤-100)/5) u；对活人有害！',
    exposeMob(ctx, method, volume) {
      if (ctx.state.stat !== 'DEAD' || (method !== 'INGEST' && method !== 'TOUCH')) return;
      if (method === 'TOUCH') return; // carbon requires INGEST
      if (ctx.state.husked) {
        ctx.addEvent('warn', 'status', '奇异试剂复活失败', '目标处于焦尸状态，无法复活。');
        return;
      }
      const totalDmg = ctx.state.brute + ctx.state.burn;
      if (totalDmg > 200) {
        ctx.addEvent('warn', 'status', '奇异试剂复活失败', `外伤总量 ${totalDmg.toFixed(1)} 超过 200 上限。`);
        return;
      }
      const needed = Math.max(1, roundStep(-(100 - totalDmg) / 5, 0.01));
      if (volume < needed) {
        ctx.addEvent(
          'warn',
          'status',
          '奇异试剂剂量不足',
          `需要至少 ${needed.toFixed(2)}u 才能复活，当前施用 ${volume.toFixed(2)}u。`,
        );
        return;
      }
      const healing = needed * 5 + (volume - needed) * 5 * 0.8;
      ctx.state.delayedReviveTicks = 4; // ~7 seconds
      ctx.state.delayedReviveHealing = healing;
      ctx.addEvent('good', 'vital', '奇异试剂启动复活程序', `将在约 7 秒后复活并回复 ${healing.toFixed(1)} 点外伤。`);
    },
    onMobLife(ctx, _inst, ratio, dt) {
      const rnd = ctx.randRange(0, 2.5);
      ctx.state.brute += 0.4 * rnd * ratio * dt;
      ctx.state.burn += 0.4 * rnd * ratio * dt;
    },
  },
  {
    id: 'synaptizine',
    enName: 'Synaptizine',
    zhName: '突触嗪',
    category: 'unique',
    targets: ['抗晕止吐'],
    color: '#FF00FF',
    ph: 4,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '减轻困倦与幻觉、缩短击晕时间，并清除碎心者毒素；每 tick 有 30% 概率造成 1 毒素。',
    mechanicsNoteZh: 'rate=0.4u/tick；实际造成毒素为 0.5 * ratio（16%/s SPT_PROB）。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.state.drowsiness = Math.max(0, ctx.state.drowsiness - 5 * ratio * dt);
      if (ctx.getBloodReagent('mindbreaker')) {
        ctx.removeBloodReagent('mindbreaker', 2.5 * ratio * dt);
      }
      ctx.state.tox += 0.5 * ratio * ctx.chance(16);
    },
  },
  {
    id: 'synaphydramine',
    enName: 'Diphen-Synaptizine',
    zhName: '双苯突触嗪',
    aliases: ['Synaphydramine'],
    category: 'unique',
    targets: ['专效解毒', '抗晕止吐'],
    color: '#EC536D',
    ph: 5.2,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '同时清除碎心者毒素与组胺（各 5u/tick），减少困倦与幻觉，微概率致少量毒素。',
    mechanicsNoteZh: 'rate=0.4u/tick。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.state.drowsiness = Math.max(0, ctx.state.drowsiness - 5 * ratio * dt);
      ctx.removeBloodReagent('mindbreaker', 2.5 * ratio * dt);
      ctx.removeBloodReagent('histamine', 2.5 * ratio * dt);
      ctx.state.tox += 0.5 * ratio * ctx.chance(16);
    },
  },
  {
    id: 'spaceacillin',
    enName: 'Spaceacillin',
    zhName: '太空西林',
    category: 'unique',
    targets: ['专效解毒'],
    color: '#E1F2E6',
    ph: 8.1,
    metabolizationRate: 0.1 * REAGENTS_METABOLISM, // 0.04u/tick
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0.3,
    inverseChemId: 'sepsisillin',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    addedTraits: ['TRAIT_VIRUS_RESISTANCE'],
    summaryZh: '广谱抗病毒/抗感染药，代谢极慢(0.04u/tick)，抑制疾病传播与严重烧伤感染。',
    mechanicsNoteZh: '纯度<30%转化为败血西林（免疫缺陷）。',
  },
  {
    id: 'mine_salve',
    enName: "Miner's Salve",
    zhName: '矿工药膏',
    category: 'unique',
    targets: ['止痛', '钝伤', '烧伤'],
    color: '#6D6374',
    ph: 2.6,
    metabolizationRate: 0.4 * REAGENTS_METABOLISM, // 0.16u/tick
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_ANALGESIA'],
    summaryZh: '强力止痛并缓慢治疗钝伤与烧伤（每 tick 各 0.25 点，即 1u 约治 1.5 点总伤）。',
    mechanicsNoteZh: '代谢缓慢(0.16u/tick)，自带止痛效果并辅助严重烧伤伤口愈合。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.state.brute = Math.max(0, ctx.state.brute - 0.3125 * ratio * dt);
      ctx.state.burn = Math.max(0, ctx.state.burn - 0.3125 * ratio * dt);
    },
  },
  {
    id: 'modafinil',
    enName: 'Modafinil',
    zhName: '莫达非尼',
    category: 'unique',
    targets: ['促醒清醒', '耐力'],
    color: '#BEF7D8',
    ph: 7.89,
    metabolizationRate: 0.1 * REAGENTS_METABOLISM, // 0.04u/tick
    defaultPurity: 1,
    overdoseThreshold: 20,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_SLEEPIMMUNE'],
    summaryZh: '超慢代谢提神药，免疫睡眠并每 tick 恢复 6 点耐力；但过量阈值随机波动，过量极其致命！',
    mechanicsNoteZh: '过量时速率骤降至 0.01u/tick，第1~40周期失呼吸，41~80周期致死缺氧，第82+周期永久睡眠并每 tick 造成 30 点窒息与耐力损伤！',
    onMobLife(ctx, inst, ratio, dt) {
      if (inst.overdosed) return;
      inst.overdoseThreshold += 5 * (ctx.randRange(-1, 1) * ratio * dt);
      ctx.state.stamina = Math.max(0, ctx.state.stamina - 15 * ratio * dt);
      ctx.state.jitter = Math.max(ctx.state.jitter, 5 * ratio * dt);
      inst.metabolizationRate = 0.005 * REAGENTS_METABOLISM * ctx.randRange(5, 20);
    },
    overdoseStart(ctx, inst) {
      inst.metabolizationRate = 0.025 * REAGENTS_METABOLISM;
      inst.data.odProgress = 0;
      ctx.addEvent('danger', 'overdose', '莫达非尼过量触发！', '代谢速率骤降至 0.01u/tick，进入三阶段致命过量进程。');
    },
    overdoseProcess(ctx, inst, ratio, dt) {
      const prog = Number(inst.data.odProgress ?? 0) + 1;
      inst.data.odProgress = prog;
      if (prog <= 40) {
        ctx.state.jitter = Math.max(ctx.state.jitter, 20);
        ctx.state.dizzy = Math.max(ctx.state.dizzy, 20);
        ctx.state.losebreath += ctx.chance(30);
      } else if (prog <= 80) {
        ctx.state.oxy += 2 * ratio * dt;
        ctx.state.stamina = Math.min(120, ctx.state.stamina + 2 * ratio * dt);
        ctx.markStaminaHit();
        ctx.state.losebreath += ctx.chance(30);
      } else {
        ctx.state.traits.delete('TRAIT_SLEEPIMMUNE');
        if (prog === 81) {
          ctx.state.oxy += 2 * ratio * dt;
          ctx.state.stamina = Math.min(120, ctx.state.stamina + 2 * ratio * dt);
          ctx.markStaminaHit();
        } else {
          ctx.state.sleeping = Math.max(ctx.state.sleeping, 20);
          ctx.state.oxy += 30 * ratio * dt;
          ctx.state.stamina = Math.min(120, ctx.state.stamina + 30 * ratio * dt);
          ctx.markStaminaHit();
        }
      }
    },
  },
  {
    id: 'morphine',
    enName: 'Morphine',
    zhName: '吗啡',
    category: 'unique',
    targets: ['止痛', '耐力', '镇静催眠'],
    color: '#A9FBFB',
    ph: 8.96,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 30,
    inverseChemVal: 0,
    isMedicine: true,
    isOpioid: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_ANALGESIA'],
    summaryZh: '强效阿片类止痛药，无视受伤减速；停留过久会引起恶心、视物模糊、困倦甚至昏睡（>48周期）。',
    mechanicsNoteZh: '过量 30u 每秒 18% 概率丢弃物品、眩晕颤抖；可用纳洛酮快速清除。',
    onMobLife(ctx, inst, ratio, dt) {
      if (ctx.state.disgust < 100) {
        ctx.state.disgust += 1.5 * ratio * ctx.chance(50 * (2 - inst.creationPurity));
      }
      if (inst.currentCycle === 16) {
        ctx.state.eyeBlur += 2 * ratio * dt;
      } else if (inst.currentCycle >= 24 && inst.currentCycle < 36) {
        ctx.state.drowsiness = Math.min(12, ctx.state.drowsiness + 2 * ratio * ctx.chance(66 * (2 - inst.creationPurity)));
      } else if (inst.currentCycle >= 36 && inst.currentCycle < 48) {
        ctx.state.drowsiness = Math.min(12, ctx.state.drowsiness + 2 * ratio * dt);
      } else if (inst.currentCycle >= 48) {
        ctx.state.drowsiness = Math.min(20, ctx.state.drowsiness + 3 * ratio * dt);
        if (ctx.chance(Math.min(100, 30 * (inst.currentCycle - 47))) > 0) {
          ctx.state.sleeping = Math.max(ctx.state.sleeping, 4 * ratio);
        }
      }
    },
    overdoseProcess(ctx) {
      if (ctx.chance(18) > 0) {
        ctx.state.dizzy = Math.max(ctx.state.dizzy, 4);
        ctx.state.jitter = Math.max(ctx.state.jitter, 4);
      }
    },
  },
  {
    id: 'haloperidol',
    enName: 'Haloperidol',
    zhName: '氟哌啶醇',
    category: 'unique',
    targets: ['清毒清除', '镇静催眠'],
    color: '#27870a',
    ph: 4.3,
    metabolizationRate: 0.4 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '快速清除体内致幻/兴奋毒品(5u/tick)，减轻颤抖幻觉；但每 tick 耗费 2.5 耐力并造成困倦与脑伤风险。',
    mechanicsNoteZh: '若耐力损耗>=100会自动加速清除自身。',
    onMobLife(ctx, inst, ratio, dt) {
      for (const r of [...ctx.state.blood]) {
        const def = REAGENTS[r.id];
        if (!def?.isDrug) continue;
        ctx.removeBloodReagent(r.id, 2.5 * (def.purgeMultiplier ?? 1) * ratio * dt);
      }
      ctx.state.drowsiness += 5 * ratio * dt;
      ctx.state.jitter = Math.max(0, ctx.state.jitter - 7.5 * ratio * dt);
      if (ctx.state.stamina >= 100) {
        ctx.removeBloodReagent('haloperidol', 1.25 * inst.metabolizationRate * ratio * dt);
      }
      const p = ctx.chance(10);
      if (p > 0) {
        ctx.adjustOrganDamage('brain', p, 50, true);
      }
      ctx.state.stamina = Math.min(120, ctx.state.stamina + 3.125 * ratio * dt);
      ctx.markStaminaHit();
    },
  },
  {
    id: 'leporazine',
    enName: 'Leporazine',
    zhName: '莱波拉嗪',
    aliases: ['勒波拉嗪'],
    category: 'unique',
    targets: ['温控灭火'],
    color: '#DB90C6',
    ph: 8.4,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '双向稳温剂：使体表温度与核心体温向正常体温(310.15K)迅速回归（每 tick ±30K）。',
    mechanicsNoteZh: '防止失温与高温烫伤的万能恒温药。',
    onMobLife(ctx, _inst, ratio, dt) {
      const target = BODYTEMP_NORMAL;
      const step = 20 * TEMPERATURE_DAMAGE_COEFFICIENT * ratio * dt;
      if (ctx.state.bodyTemp > target) ctx.state.bodyTemp = Math.max(target, ctx.state.bodyTemp - step);
      else if (ctx.state.bodyTemp < target + 1) ctx.state.bodyTemp = Math.min(target, ctx.state.bodyTemp + step);

      if (ctx.state.coreTemp > target) ctx.state.coreTemp = Math.max(target, ctx.state.coreTemp - step);
      else if (ctx.state.coreTemp < target + 1) ctx.state.coreTemp = Math.min(target, ctx.state.coreTemp + step);
    },
  },
  {
    id: 'higadrite',
    enName: 'Higadrite',
    zhName: '海加德',
    aliases: ['海加德石'],
    category: 'unique',
    targets: ['肝脏'],
    color: '#FF3542',
    ph: 7,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    selfConsuming: true,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_STABLELIVER'],
    summaryZh: '稳定肝脏功能，在体内期间完全阻止肝衰竭带来的持续毒素与多器官损伤。',
    mechanicsNoteZh: '自耗药（无肝脏/肝衰竭时仍可正常代谢生效）。',
  },
  {
    id: 'psicodine',
    enName: 'Psicodine',
    zhName: '赛可定',
    category: 'unique',
    targets: ['大脑', '抗晕止吐'],
    color: '#07E79E',
    ph: 9.12,
    metabolizationRate: 0.25 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 30,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_FEARLESS'],
    summaryZh: '抑制恐惧、恢复理智，并大幅消除颤抖、眩晕、混乱与厌恶。',
    mechanicsNoteZh: 'rate=0.1u/tick；过量 30u 引起幻觉与 1 毒素/tick。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.state.jitter = Math.max(0, ctx.state.jitter - 24 * ratio * dt);
      ctx.state.dizzy = Math.max(0, ctx.state.dizzy - 24 * ratio * dt);
      ctx.state.confusion = Math.max(0, ctx.state.confusion - 12 * ratio * dt);
      ctx.state.disgust = Math.max(0, ctx.state.disgust - 12 * ratio * dt);
    },
    overdoseProcess(ctx, _inst, ratio, dt) {
      ctx.state.tox += 2 * ratio * dt;
    },
  },
  makeCoagulant({
    id: 'coagulant',
    enName: 'Sanguirite',
    zhName: '血石',
    aliases: ['凝血剂', 'Coagulant'],
    color: '#bb2424',
    rateMult: 0.25,
    od: 20,
    clotRate: 0.3,
    passiveBleedMod: 0.7,
    summaryZh: '标准止血凝固剂：减少 30% 失血量，每 tick 降低最重伤口流速 0.3。过量阈值 20u。',
  }),
  makeCoagulant({
    id: 'seraka_extract',
    enName: 'Seraka Extract',
    zhName: '塞拉卡提取物',
    color: '#00767C',
    rateMult: 0.2,
    od: 10,
    clotRate: 0.4,
    passiveBleedMod: 0.5,
    summaryZh: '强效蘑菇凝血剂：减少 50% 失血量，每 tick 降流速 0.4；极易过量（阈值 10u）。',
  }),
  makeCoagulant({
    id: 'banana_peel',
    enName: 'Pulped Banana Peel',
    zhName: '捣烂的香蕉皮',
    aliases: ['香蕉皮浆'],
    color: '#50531a',
    rateMult: 0.5,
    od: 20,
    clotRate: 0.2,
    passiveBleedMod: 0.8,
    summaryZh: '弱效凝血剂：减少 20% 失血量，每 tick 降流速 0.2；代谢较快(0.2u/tick)。',
  }),
  {
    id: 'determination',
    enName: 'Determination',
    zhName: '决心',
    category: 'unique',
    targets: ['伤口愈合', '止痛'],
    color: '#D2FFFA',
    ph: 7,
    metabolizationRate: 0.75 * REAGENTS_METABOLISM, // 0.3u/tick
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false, // /datum/reagent/determination (not subtype of /medicine!)
    reverseMetabolism: false,
    selfConsuming: true,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_ANALGESIA'],
    summaryZh: '受伤激发肾上腺决意（上限10u）：止痛并按伤口数轻微回血与回耐力；药效消退时爆发耐力跌落！',
    mechanicsNoteZh: '自耗药（无肝可代谢）；曾达到>=2.5u时，消退会按每处伤口(6/9/12)施加耐力惩罚。',
    onMobLife(ctx, inst, ratio, dt) {
      if (inst.volume >= 2.5) inst.data.significant = true;
      inst.volume = Math.min(inst.volume, 10);
      const wounds = ctx.state.woundCount;
      if (wounds > 0) {
        ctx.state.brute = Math.max(0, ctx.state.brute - 0.167 * ratio * dt * wounds);
        ctx.state.burn = Math.max(0, ctx.state.burn - 0.25 * ratio * dt * wounds);
        ctx.state.stamina = Math.max(0, ctx.state.stamina - 0.67 * ratio * dt);
      }
    },
    onMobEndMetabolize(ctx, inst) {
      if (inst.data.significant && ctx.state.woundCount > 0) {
        const sevIndex =
          ctx.state.woundSeverity === 'critical' ? 3 : ctx.state.woundSeverity === 'severe' ? 2 : 1;
        const crash = (sevIndex + 1) * 3 * ctx.state.woundCount;
        ctx.state.stamina = Math.min(120, ctx.state.stamina + crash);
        ctx.markStaminaHit();
        ctx.addEvent('warn', 'status', '决心退潮疲惫爆发', `决心消退，受到 ${crash} 点耐力冲击！`);
      }
    },
  },
  {
    id: 'ondansetron',
    enName: 'Ondansetron',
    zhName: '昂丹司琼',
    category: 'unique',
    targets: ['抗晕止吐'],
    color: '#74d3ff',
    ph: 10.6,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '强力止吐抗恶心，快速消除厌恶值，偶发困倦或轻度耐力损耗。',
    mechanicsNoteZh: 'rate=0.2u/tick。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.state.drowsiness += 2 * ratio * ctx.chance(8);
      if (ctx.state.stamina <= 0) {
        ctx.state.stamina = Math.min(120, ctx.state.stamina + 10 * ratio * ctx.chance(15));
        ctx.markStaminaHit();
      }
      ctx.state.disgust = Math.max(0, ctx.state.disgust - 10 * ratio * dt);
    },
  },
  {
    id: 'naloxone',
    enName: 'Naloxone',
    zhName: '纳洛酮',
    category: 'unique',
    targets: ['专效解毒', '促醒清醒'],
    color: '#f5f5dc',
    ph: 4,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'TOUCH_VAPOR',
    metabolizedTraits: ['TRAIT_ADDICTIONRESILIENT'],
    summaryZh: '阿片受体拮抗剂：接触或蒸气均可入血，每 tick 清除 6u 吗啡等阿片药，减少困倦与失呼吸。',
    mechanicsNoteZh: 'rate=0.2u/tick，TOUCH 可穿透皮肤入血！',
    onMobLife(ctx, _inst, ratio, dt) {
      for (const r of [...ctx.state.blood]) {
        if (REAGENTS[r.id]?.isOpioid) {
          ctx.removeBloodReagent(r.id, 3 * ratio * dt);
        }
      }
      ctx.state.drowsiness = Math.max(0, ctx.state.drowsiness - 5 * ratio * dt);
      if (ctx.state.losebreath >= 1) {
        ctx.state.losebreath = Math.max(0, ctx.state.losebreath - 1 * ratio * dt);
      }
    },
  },
  {
    id: 'lidocaine',
    enName: 'Lidocaine',
    zhName: '利多卡因',
    category: 'unique',
    targets: ['止痛'],
    color: '#6dbdbd',
    ph: 6.09,
    metabolizationRate: 0.2 * REAGENTS_METABOLISM, // 0.08u/tick
    defaultPurity: 1,
    overdoseThreshold: 20,
    inverseChemVal: 0.55,
    inverseChemId: 'lidopaine',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_ANALGESIA'],
    summaryZh: '天关13模块化手术止痛药：代谢极慢(0.08u/tick)，提供完全无痛状态；过量 20u 严重损伤心脏！',
    mechanicsNoteZh: '出自 modular_skyrat/modular_reagents：过量时每 tick +15 心脏损伤（上限80），纯度<55%转化为利多巴因。',
    overdoseProcess(ctx, _inst, _ratio, dt) {
      ctx.adjustOrganDamage('heart', 3 * REM * dt, 80, false);
    },
  },
  {
    id: 'sansufentanyl',
    enName: 'Sansufentanyl',
    zhName: '三氟芬太尼',
    category: 'unique',
    targets: ['止痛', '镇静催眠'],
    color: '#07e4d1',
    ph: 6.2,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '导致暂时的混乱、眩晕与轻微耐力消耗。',
    mechanicsNoteZh: 'rate=0.4u/tick。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.state.confusion = Math.min(5, ctx.state.confusion + 1.5 * ratio * dt);
      ctx.state.dizzy = Math.min(12, ctx.state.dizzy + 3 * ratio * dt);
      ctx.state.stamina = Math.min(120, ctx.state.stamina + 0.5 * ratio * dt);
      ctx.markStaminaHit();
    },
  },
  {
    id: 'inaprovaline',
    enName: 'Inaprovaline',
    zhName: '伊纳普罗瓦林',
    category: 'unique',
    targets: ['窒息', '肺部'],
    color: '#A4D8D8',
    ph: 8.5,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '经典呼吸稳定剂：当失去呼吸层数>=5时每 tick 减少 5 层。',
    mechanicsNoteZh: 'rate=0.4u/tick。',
    onMobLife(ctx, _inst, ratio, dt) {
      if (ctx.state.losebreath >= 5) {
        ctx.state.losebreath = Math.max(0, ctx.state.losebreath - 2.5 * ratio * dt);
      }
    },
  },

  // ==================== SPECIAL / NON-CRAFTABLE MEDICINES ====================
  makeOmnizineLike({
    id: 'omnizine',
    enName: 'Omnizine',
    zhName: '万灵素',
    category: 'special',
    healing: 0.5,
    overdoseThreshold: 30,
    summaryZh: '万能慢性回复剂：每 tick 治疗四项基础伤害各 0.5 点，过量 30u 时净造成各 1 点全伤。',
    mechanicsNoteZh: 'rate=0.1u/tick，过量阈值 30u（先+1.5后-0.5=净+1/tick）。',
  }),
  makeOmnizineLike({
    id: 'protozine',
    enName: 'Protozine',
    zhName: '原质素',
    category: 'special',
    healing: 0.2,
    overdoseThreshold: 30,
    color: '#d8c7b7',
    summaryZh: '弱化版万灵素：每 tick 治疗四项基础伤害各 0.2 点，过量 30u 时净造成各 1.3 点全伤。',
    mechanicsNoteZh: 'rate=0.1u/tick。',
  }),
  makeOmnizineLike({
    id: 'godblood',
    enName: 'Godblood',
    zhName: '神血',
    category: 'special',
    healing: 0.5,
    overdoseThreshold: 150,
    summaryZh: '高阈值版万灵素：每 tick 治疗四项基础伤害各 0.5 点，过量阈值高达 150u！',
    mechanicsNoteZh: 'rate=0.1u/tick。',
  }),
  {
    id: 'honey',
    enName: 'Honey',
    zhName: '蜂蜜',
    category: 'special',
    targets: ['全伤', '催化/底物'],
    color: '#d3a308',
    ph: 7,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 0.5,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    unaffectedByMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '天然食物型治疗物：代谢极快(0.4u/tick)，每 tick 55% 概率全伤各治 1 点，并向血液生成 3u 糖。',
    mechanicsNoteZh: '不受代谢效率影响（食物基类）；生成糖可能触发高血糖(120u)。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.addBloodReagent('sugar', 1.5 * ratio * dt, 1, ctx.state.chemTemp, true);
      const p = ctx.chance(33);
      if (p > 0) {
        const heal = 0.5 * ratio * p;
        ctx.state.brute = Math.max(0, ctx.state.brute - heal);
        ctx.state.burn = Math.max(0, ctx.state.burn - heal);
        ctx.state.oxy = Math.max(0, ctx.state.oxy - heal);
        ctx.state.tox = Math.max(0, ctx.state.tox - heal);
      }
    },
  },
  {
    id: 'earthsblood',
    enName: 'Earthsblood',
    zhName: '大地之血',
    category: 'special',
    targets: ['全伤', '耐力'],
    color: '#FFAF00',
    ph: 11,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 25,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_PACIFISM'],
    summaryZh: '前25周期温和回复并+1脑伤/tick；第26周期起狂暴全伤治疗（5钝/烧 + 3窒/毒/耐力）但持续+2脑伤并强制和平主义。',
    mechanicsNoteZh: '过量 25u 在第26周期后净造成 1 毒素/tick，第101周期后净造成 3 毒素/tick，并引发严重脑创伤。',
    onMobLife(ctx, inst, ratio, dt) {
      if (inst.currentCycle < 25) {
        ctx.state.brute = Math.max(0, ctx.state.brute - 0.5 * ratio * dt);
        ctx.state.burn = Math.max(0, ctx.state.burn - 0.5 * ratio * dt);
        ctx.state.oxy = Math.max(0, ctx.state.oxy - 0.25 * ratio * dt);
        ctx.state.tox = Math.max(0, ctx.state.tox - 0.25 * ratio * dt);
        ctx.state.stamina = Math.max(0, ctx.state.stamina - 1 * ratio * dt);
        ctx.adjustOrganDamage('brain', 0.5 * ratio * dt, 150, true);
      } else {
        ctx.state.brute = Math.max(0, ctx.state.brute - 2.5 * ratio * dt);
        ctx.state.burn = Math.max(0, ctx.state.burn - 2.5 * ratio * dt);
        ctx.state.oxy = Math.max(0, ctx.state.oxy - 1.5 * ratio * dt);
        ctx.state.tox = Math.max(0, ctx.state.tox - 1.5 * ratio * dt);
        ctx.state.stamina = Math.max(0, ctx.state.stamina - 4 * ratio * dt);
        ctx.adjustOrganDamage('brain', 1 * ratio * dt, 150, true);
        ctx.state.jitter = Math.max(ctx.state.jitter, 3 * ratio * dt);
      }
    },
    overdoseProcess(ctx, inst, ratio, dt) {
      if (inst.currentCycle > 26) {
        ctx.state.tox += 2 * ratio * dt;
        if (inst.currentCycle > 101) ctx.state.tox += 3 * ratio * dt;
      }
    },
  },
  {
    id: 'silibinin',
    enName: 'Silibinin',
    zhName: '水飞蓟宾',
    category: 'special',
    targets: ['肝脏'],
    color: '#FFFFD0',
    ph: 7,
    metabolizationRate: 1.5 * REAGENTS_METABOLISM, // 0.6u/tick
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '强力护肝与肝脏修复药：每 tick 修复 ~2.0 点有机肝脏损伤（代谢极快 0.6u/tick）。',
    mechanicsNoteZh: '代码系数 -0.67 * ratio * dt，配合 1.5x REM = -2.01/tick（1.0x代谢）。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.adjustOrganDamage('liver', -0.67 * ratio * dt, undefined, true);
    },
  },
  {
    id: 'polypyr',
    enName: 'Polypyrylium Oligomers',
    zhName: '聚吡喃鎓低聚物',
    category: 'special',
    targets: ['肺部', '钝伤'],
    color: '#9423FF',
    ph: 7,
    metabolizationRate: 0.25 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 50,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '罕见肺部修复剂：每 tick 治疗 0.5 肺伤与 0.7 钝伤（0.1u/tick）。',
    mechanicsNoteZh: '过量 50u 反向损伤肺部。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.adjustOrganDamage('lungs', -0.5 * ratio * dt, undefined, true);
      ctx.state.brute = Math.max(0, ctx.state.brute - 0.7 * ratio * dt);
    },
    overdoseProcess(ctx, _inst, ratio, dt) {
      ctx.adjustOrganDamage('lungs', 1 * ratio * dt, undefined, true);
    },
  },
  {
    id: 'metafactor',
    enName: 'Mitogen Metabolism Factor',
    zhName: '有丝分裂素代谢因子',
    category: 'special',
    targets: ['催化/底物'],
    color: '#FFBE00',
    ph: 7,
    metabolizationRate: 0.0625 * REAGENTS_METABOLISM, // 0.025u/tick
    defaultPurity: 1,
    overdoseThreshold: 10,
    inverseChemVal: 0.1,
    inverseChemId: 'probital_failed',
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '体内催化酶(>=0.5u生效)：将摄入血液中的营养物即时转化为治疗肽！代谢极慢(0.025u/tick)。',
    mechanicsNoteZh: '过量 10u 时代谢速率暴增32倍至 0.8u/tick 并频繁呕吐。',
    overdoseStart(ctx, inst) {
      inst.metabolizationRate = 2 * REAGENTS_METABOLISM;
      ctx.addEvent('warn', 'overdose', '代谢因子过量', '速率飙升至 0.8u/tick 并诱发呕吐。');
    },
  },
  {
    id: 'muscle_stimulant',
    enName: 'Muscle Stimulant',
    zhName: '肌肉兴奋剂',
    category: 'special',
    targets: ['耐力', '止痛'],
    color: '#C8A5DC',
    ph: 7,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_ANALGESIA'],
    summaryZh: '使患者无视受伤造成的移动减速与疼痛。',
    mechanicsNoteZh: 'rate=0.4u/tick。',
  },
  {
    id: 'cordiolis_hepatico',
    enName: 'Cordiolis Hepatico',
    zhName: '科迪奥利斯肝心素',
    category: 'special',
    targets: ['心脏', '肝脏'],
    color: '#000000',
    ph: 7,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    selfConsuming: true,
    penetratesSkin: 'VAPOR',
    addedTraits: ['TRAIT_STABLELIVER', 'TRAIT_STABLEHEART'],
    summaryZh: '在体内时免除对心脏与肝脏的生理需求，完全屏蔽心停与肝衰竭惩罚。',
    mechanicsNoteZh: '自耗药（无肝亦可代谢）。',
  },
  {
    id: 'stimulants',
    enName: 'Stimulants',
    zhName: '兴奋剂',
    category: 'special',
    targets: ['耐力', '危急抢救'],
    color: '#78008C',
    ph: 8.7,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 60,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_BATON_RESISTANCE', 'TRAIT_ANALGESIA', 'TRAIT_STIMULATED'],
    summaryZh: '辛迪加战斗兴奋剂：极速提升移速与抗晕，每 tick 回 5 耐力；HP 处于 0~50 时全伤各治 1 点！',
    mechanicsNoteZh: 'rate=0.2u/tick，过量阈值高达 60u。',
    onMobLife(ctx, _inst, ratio, dt) {
      if (ctx.state.health < 50 && ctx.state.health > 0) {
        const heal = 1 * ratio * dt;
        ctx.state.oxy = Math.max(0, ctx.state.oxy - heal);
        ctx.state.tox = Math.max(0, ctx.state.tox - heal);
        ctx.state.brute = Math.max(0, ctx.state.brute - heal);
        ctx.state.burn = Math.max(0, ctx.state.burn - heal);
      }
      ctx.state.stamina = Math.max(0, ctx.state.stamina - 12 * ratio * dt);
    },
    overdoseProcess(ctx, _inst, ratio) {
      const p = ctx.chance(18);
      if (p > 0) {
        ctx.state.stamina = Math.min(120, ctx.state.stamina + 2.5 * ratio * p);
        ctx.markStaminaHit();
        ctx.state.tox += 1 * ratio * p;
        ctx.state.losebreath += p;
      }
    },
  },
  {
    id: 'syndicate_nanites',
    enName: 'Restorative Nanites',
    zhName: '修复纳米机器人',
    category: 'special',
    targets: ['全伤', '大脑'],
    color: '#555555',
    ph: 11,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 30,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '辛迪加医疗机械专属：每 tick 治 5 钝/烧/毒 + 15 窒息 + 15 脑伤！',
    mechanicsNoteZh: '过量 30u 每秒 13% 概率排出 2u 自身以防损坏。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.state.brute = Math.max(0, ctx.state.brute - 2.5 * ratio * dt);
      ctx.state.burn = Math.max(0, ctx.state.burn - 2.5 * ratio * dt);
      ctx.state.tox = Math.max(0, ctx.state.tox - 2.5 * ratio * dt);
      ctx.state.oxy = Math.max(0, ctx.state.oxy - 7.5 * ratio * dt);
      ctx.adjustOrganDamage('brain', -7.5 * ratio * dt);
    },
    overdoseProcess(ctx, inst) {
      const p = ctx.chance(13);
      if (p > 0) {
        ctx.removeBloodReagent('syndicate_nanites', 5 * inst.metabolizationRate * p);
      }
    },
  },
  {
    id: 'changelingadrenaline',
    enName: 'Changeling Adrenaline',
    zhName: '变形怪肾上腺素',
    aliases: ['化形肾上腺素'],
    category: 'special',
    targets: ['耐力', '抗晕止吐'],
    color: '#C1151D',
    ph: 7,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 30,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_SLEEPIMMUNE', 'TRAIT_BATON_RESISTANCE'],
    summaryZh: '免疫睡眠与电棍，每 tick 极速恢复 10 点耐力，且在即将耐力倒地(stamcrit)时消耗 1u 强行拉回！',
    mechanicsNoteZh: '过量 30u 每 tick 造成 1 点毒素。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.state.stamina = Math.max(0, ctx.state.stamina - 15 * ratio * dt);
      ctx.state.jitter = Math.max(ctx.state.jitter, 10 * ratio * dt);
      ctx.state.dizzy = Math.max(ctx.state.dizzy, 10 * ratio * dt);
    },
    overdoseProcess(ctx, _inst, ratio, dt) {
      ctx.state.tox += 0.5 * ratio * dt;
    },
  },
  {
    id: 'changelinghaste',
    enName: 'Changeling Haste',
    zhName: '变形怪加速',
    aliases: ['化形加速'],
    category: 'special',
    targets: ['耐力'],
    color: '#AE151D',
    ph: 7,
    metabolizationRate: 2.5 * REAGENTS_METABOLISM, // 1u/tick
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '将移动速度拉满但每 tick 造成 2 点毒素，代谢极快(1u/tick)。',
    mechanicsNoteZh: 'Tianguan13源码为 4 * ratio * dt（按 1u/tick 速率对应每 tick 造成 2 毒素? 注意 rate=0.5 u/s -> metabolized_vol=1u -> ratio=2.5 -> 4*2.5*2 = 20? 等等，注意: metabolization_rate=0.5 u/s -> 1u/tick -> ratio=2.5，实际上代码写的是 adjust_tox_loss(4 * ratio * dt) 即随高消耗倍率放大，在 2.5 ratio 下高达 20 毒素！注：wiki 写的 2 点可能是旧版注释或相对值）。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.state.tox += 4 * ratio * dt;
    },
  },
  {
    id: 'adminordrazine',
    enName: 'Adminordrazine',
    zhName: '阿德米诺德嗪',
    category: 'special',
    targets: ['全伤', '钝伤', '烧伤', '毒素', '窒息'],
    color: '#E0BB00',
    ph: 7,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: true,
    reverseMetabolism: true,
    deadProcess: true,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_ANALGESIA'],
    summaryZh: '管理员神药：几乎瞬间治愈全部伤害、器官损伤、缺血与异常状态。',
    mechanicsNoteZh: 'rate=0.4u/tick。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.state.brute = Math.max(0, ctx.state.brute - 2.5 * ratio * dt);
      ctx.state.burn = Math.max(0, ctx.state.burn - 2.5 * ratio * dt);
      ctx.state.tox = Math.max(0, ctx.state.tox - 2.5 * ratio * dt);
      ctx.state.oxy = 0;
      ctx.state.stamina = 0;
      ctx.state.stamcrit = false;
      ctx.state.bloodVolume = 560;
      ctx.state.bleedFlow = 0;
      ctx.state.heartAttack = false;
      ctx.state.losebreath = 0;
      for (const slot of Object.keys(ctx.state.organs) as OrganSlot[]) {
        ctx.state.organs[slot].damage = 0;
        ctx.state.organs[slot].failing = false;
      }
    },
  },

  // ==================== INVERSE / IMPURE REAGENTS ====================
  {
    id: 'libitoil',
    enName: 'Libitoil',
    zhName: '力比多油',
    category: 'inverse',
    targets: ['逆产物'],
    color: '#3e2d1a',
    ph: 13.5,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '利比特低纯度(<30%)逆产物：使酒精耐受恶化并轻微损伤肝脏(0.1/tick)。',
    mechanicsNoteZh: 'rate=0.4u/tick。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.adjustOrganDamage('liver', 0.05 * ratio * dt);
    },
  },
  {
    id: 'helgrasp',
    enName: 'Helgrasp',
    zhName: '赫尔之握',
    category: 'inverse',
    targets: ['逆产物'],
    color: '#300040',
    ph: 14,
    metabolizationRate: 2.5 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '赫比妥低纯度(<30%)逆产物：召唤死灵之手抓取患者并造成毒素损伤。',
    mechanicsNoteZh: 'rate=1.0u/tick。',
    onMobLife(ctx, inst, ratio, dt) {
      ctx.state.tox += metabolizeFreeConstant(0.5, inst.metabolizationRate) * 0.25 * ratio * dt;
    },
  },
  {
    id: 'aivime',
    enName: 'Aivime',
    zhName: '艾维姆',
    category: 'inverse',
    targets: ['逆产物'],
    color: '#5544aa',
    ph: 3.1,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '艾尤里低纯度(<35%)逆产物：干扰视觉，每 tick 造成 0.1 眼伤与持续视物模糊。',
    mechanicsNoteZh: 'rate=0.4u/tick。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.adjustOrganDamage('eyes', 0.05 * ratio * dt);
      ctx.state.eyeBlur += 1.25 * dt;
    },
  },
  {
    id: 'lentslurri',
    enName: 'Lentslurri',
    zhName: '伦茨卢里',
    category: 'inverse',
    targets: ['逆产物'],
    color: '#3b4a9e',
    ph: 2,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '伦图里低纯度(<40%)逆产物：肌肉松弛剂，大幅降低移动速度。',
    mechanicsNoteZh: 'rate=0.4u/tick，致成瘾且无治疗作用。',
  },
  {
    id: 'herignis',
    enName: 'Herignis',
    zhName: '赫里格尼斯',
    category: 'inverse',
    targets: ['逆产物', '温控灭火'],
    color: '#ff1818',
    ph: 0.8,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 25,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '赫丘利低纯度(<30%)逆产物：与赫丘利相反，急剧升高体温并容易引燃热伤！过量25u伤肝。',
    mechanicsNoteZh: 'rate=0.4u/tick，过量25u每 tick 造成 2 肝脏损伤并加速升温。',
    onMobLife(ctx, inst, ratio, dt) {
      const heating = 0.5 * ctx.randRange(5, 25) * inst.creationPurity * ratio * dt;
      ctx.state.chemTemp += heating;
      ctx.state.bodyTemp += heating * TEMPERATURE_DAMAGE_COEFFICIENT;
      ctx.state.coreTemp += heating * TEMPERATURE_DAMAGE_COEFFICIENT;
    },
    overdoseProcess(ctx, inst, ratio, dt) {
      ctx.adjustOrganDamage('liver', 1 * ratio * dt, undefined, true);
      const heating = 5 * inst.creationPurity * ratio * dt * TEMPERATURE_DAMAGE_COEFFICIENT;
      ctx.state.bodyTemp += heating;
      ctx.state.coreTemp += heating;
    },
  },
  {
    id: 'monover',
    enName: 'Monover',
    zhName: '莫诺维尔',
    aliases: ['单功能解毒剂'],
    category: 'inverse',
    targets: ['逆产物', '毒素'],
    color: '#1b1b1b',
    ph: 0.5,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '多功能解毒剂逆产物(<35%)：仅当体内只有它一种试剂时才治疗毒素，否则每秒损伤肺部！',
    mechanicsNoteZh: '与多功能解毒剂恰好相反的机制。',
    onMobLife(ctx, inst, ratio, dt) {
      if (ctx.state.blood.length > 1) {
        ctx.adjustOrganDamage('lungs', 0.5 * dt, undefined, true);
      } else {
        ctx.state.tox = Math.max(0, ctx.state.tox - 1 * ratio * inst.creationPurity * dt);
      }
    },
  },
  {
    id: 'technetium',
    enName: 'Technetium 99',
    zhName: '锝99',
    aliases: ['锝-99'],
    category: 'inverse',
    targets: ['逆产物'],
    color: '#445533',
    ph: 2,
    metabolizationRate: 0.75 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '赛维尔逆产物(<45%)：医疗扫描示踪剂，每隔 9 秒施加一次中等毒素伤害。',
    mechanicsNoteZh: 'rate=0.3u/tick。',
    onMobLife(ctx, inst, ratio, dt) {
      const rem = Number(inst.data.poisonTimer ?? 0) - dt;
      if (rem <= 0) {
        inst.data.poisonTimer = 9;
        ctx.state.tox += 1.34 * inst.creationPurity * ratio * dt;
      } else {
        inst.data.poisonTimer = rem;
      }
    },
  },
  {
    id: 'super_melatonin',
    enName: 'Super Melatonin',
    zhName: '超级褪黑素',
    category: 'inverse',
    targets: ['逆产物', '镇静催眠'],
    color: '#2c1f63',
    ph: 12.5,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    selfConsuming: true,
    deadProcess: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '特里莫尔逆产物(<25%)：第 11 周期起强制患者沉睡，睡着后使体内所有药物纯度提升 1.25 倍！',
    mechanicsNoteZh: '自耗药（无肝可代谢），醒来或药尽时撤销纯度加成。',
    onMobLife(ctx, inst) {
      const boosted = (inst.data.boostedIds as string[] | undefined) ?? [];
      if (inst.currentCycle >= 11) {
        ctx.state.sleeping = Math.max(ctx.state.sleeping, 4);
        if (ctx.state.sleeping > 0) {
          for (const r of ctx.state.blood) {
            if (boosted.includes(r.id) || !REAGENTS[r.id]?.isMedicine) continue;
            r.creationPurity *= 1.25;
            boosted.push(r.id);
          }
          inst.data.boostedIds = boosted;
        }
      }
    },
    onMobDelete(ctx, inst) {
      const boosted = (inst.data.boostedIds as string[] | undefined) ?? [];
      for (const id of boosted) {
        const r = ctx.getBloodReagent(id);
        if (r) r.creationPurity *= 0.8;
      }
      inst.data.boostedIds = [];
    },
  },
  {
    id: 'coveroli',
    enName: 'Coveroli',
    zhName: '可维罗利',
    aliases: ['科维罗利'],
    category: 'inverse',
    targets: ['逆产物', '肺部'],
    color: '#88aaaa',
    ph: 3.82,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '肯尔莫逆产物(<50%)：肺部保护膜，扩大肺部耐受极端高低温空气的范围。',
    mechanicsNoteZh: 'rate=0.4u/tick。',
  },
  {
    id: 'nooartrium',
    enName: 'Nooartrium',
    zhName: '努阿特姆',
    aliases: ['努阿特里姆'],
    category: 'inverse',
    targets: ['逆产物', '尸体复活'],
    color: '#3c0b0b',
    ph: 14,
    metabolizationRate: 0.125 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 20,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    selfConsuming: true,
    deadProcess: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '彭斯莱特逆产物(<25%)：若心脏完好可短暂唤醒刚死去的尸体！期间免疫死亡但持续撕裂钝伤与心脏，药尽/过量会炸毁心脏。',
    mechanicsNoteZh: '自耗药 + 死者生效；过量20u直接引爆心脏。',
    onMobDead(ctx, inst) {
      const heart = ctx.state.organs.heart;
      if (heart.failing || heart.damage >= heart.maxHealth) return;
      inst.metabolizationRate = 0.5 * REAGENTS_METABOLISM;
      ctx.state.stat = 'STABLE';
      ctx.state.traits.add('TRAIT_NODEATH');
      ctx.state.traits.add('TRAIT_STABLEHEART');
      ctx.state.traits.add('TRAIT_NOCRITDAMAGE');
      ctx.state.traits.add('TRAIT_NOHARDCRIT');
      ctx.state.traits.add('TRAIT_NOSOFTCRIT');
      ctx.state.brute = Math.max(0, ctx.state.brute - 25);
      ctx.state.burn = Math.max(0, ctx.state.burn - 25);
      ctx.state.oxy = Math.max(0, ctx.state.oxy - 25);
      inst.data.backFromDead = true;
      ctx.addEvent('warn', 'vital', '努阿特姆强行起尸！', '尸体被临时拉回存活状态，免疫死亡但心脏正迅速损耗！');
    },
    onMobLife(ctx, inst, ratio, dt) {
      if (!inst.data.backFromDead) return;
      const imp = 1 - inst.creationPurity;
      ctx.state.bleedFlow += 4 * imp * ratio * dt;
      ctx.state.brute += 20 * imp * ratio * dt;
      ctx.adjustOrganDamage('heart', 4 * (1 + imp) * ratio * dt);
    },
    overdoseStart(ctx, inst) {
      if (!inst.data.backFromDead) return;
      ctx.state.traits.delete('TRAIT_NODEATH');
      ctx.state.heartAttack = true;
      ctx.state.organs.heart.damage = ctx.state.organs.heart.maxHealth;
      ctx.state.organs.heart.failing = true;
      ctx.addEvent('danger', 'overdose', '努阿特姆过量：心脏爆裂！', '过量引爆了心脏，临时生还效果破灭！');
    },
    onMobDelete(ctx, inst) {
      if (inst.data.backFromDead) {
        ctx.state.traits.delete('TRAIT_NODEATH');
        ctx.state.traits.delete('TRAIT_STABLEHEART');
        ctx.state.traits.delete('TRAIT_NOCRITDAMAGE');
        ctx.state.traits.delete('TRAIT_NOHARDCRIT');
        ctx.state.traits.delete('TRAIT_NOSOFTCRIT');
      }
    },
  },
  {
    id: 'benzoic_acid',
    enName: 'Benzoic Acid',
    zhName: '苯甲酸',
    category: 'inverse',
    targets: ['逆产物'],
    color: '#e6c843',
    ph: 3.4,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '水杨酸逆产物(<30%)：优质植物肥料，对人体无治疗效果。',
    mechanicsNoteZh: '无毒素惩罚（tox_damage = 0）。',
  },
  {
    id: 'oxymetholone',
    enName: 'Oxymetholone',
    zhName: '羟甲烯龙',
    category: 'inverse',
    targets: ['逆产物'],
    color: '#520c23',
    ph: 12.2,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 25,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '奥沙雄龙逆产物(<30%)：合成代谢类固醇，过量25u导致体温飙升、耐力损耗、吐血与瘫痪。',
    mechanicsNoteZh: 'rate=0.2u/tick。',
    overdoseProcess(ctx, _inst, ratio) {
      const p = ctx.chance(25);
      if (p > 0) {
        ctx.state.bodyTemp += 15 * TEMPERATURE_DAMAGE_COEFFICIENT * ratio * p;
        ctx.state.jitter = Math.max(ctx.state.jitter, 3);
        ctx.state.stamina = Math.min(120, ctx.state.stamina + 2.5 * ratio * p);
        ctx.markStaminaHit();
      }
    },
  },
  {
    id: 'bamethan',
    enName: 'Bamethan',
    zhName: '巴美坦',
    category: 'inverse',
    targets: ['逆产物'],
    color: '#ecd4d6',
    ph: 4.5,
    metabolizationRate: 0.2 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_EASYBLEED'],
    summaryZh: '沙丁胺醇逆产物(<25%)：血液稀释剂，代谢期间极易出现大量流血伤口。',
    mechanicsNoteZh: 'rate=0.08u/tick（极慢）。',
  },
  {
    id: 'pendetide',
    enName: 'Pendetide',
    zhName: '彭德泰德',
    category: 'inverse',
    targets: ['逆产物', '清毒清除'],
    color: '#09ff00',
    ph: 3.7,
    metabolizationRate: 0.0625 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '喷替酸逆产物(<40%)：极慢代谢(0.025u/tick)，瞬间清光体内赛维尔、碘化钾、多功能解毒剂并加重辐射痛苦。',
    mechanicsNoteZh: '每 tick 按 40*ratio*dt 速率清除上述解毒剂。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.removeBloodReagent('seiver', 40 * ratio * dt);
      ctx.removeBloodReagent('potass_iodide', 40 * ratio * dt);
      ctx.removeBloodReagent('multiver', 40 * ratio * dt);
      if (ctx.state.irradiated) {
        ctx.state.jitter = Math.max(ctx.state.jitter, 10);
        ctx.state.disgust += 2.4 * ratio * dt;
      }
    },
  },
  {
    id: 'hyoscyamine',
    enName: 'Hyoscyamine',
    zhName: '莨菪碱',
    category: 'inverse',
    targets: ['逆产物', '心脏', '胃部'],
    color: '#273333',
    ph: 13.6,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 40,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '阿托品逆产物(<35%)：少有的有益逆试剂！每 tick 恢复 1 点胃损伤与 1 点心脏损伤（毒素<=25时还微弱治毒）。',
    mechanicsNoteZh: '过量 40u 随机对内脏造成高额损伤。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.adjustOrganDamage('stomach', -1 * ratio * dt);
      ctx.adjustOrganDamage('heart', -1 * ratio * dt);
      if (ctx.state.tox <= 25) {
        ctx.state.tox = Math.max(0, ctx.state.tox - 0.5);
      }
    },
    overdoseProcess(ctx, _inst, ratio, dt) {
      const slots: OrganSlot[] = ['heart', 'liver', 'lungs', 'stomach', 'eyes', 'ears', 'brain'];
      if (ctx.rngMode === 'expected') {
        for (const s of slots) ctx.adjustOrganDamage(s, (2 * dt) / slots.length);
      } else {
        ctx.adjustOrganDamage(slots[Math.floor(ctx.rng() * slots.length)], 2 * dt);
      }
      ctx.removeBloodReagent('hyoscyamine', 1 * ratio * dt);
    },
  },
  {
    id: 'ammoniated_sludge',
    enName: 'Ammoniated Sludge',
    zhName: '氨化污泥',
    category: 'inverse',
    targets: ['逆产物'],
    color: '#353535',
    ph: 10.2,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '氨化汞逆产物(<50%)：引起间歇性歇斯底里尖叫，无毒素/治疗效果。',
    mechanicsNoteZh: 'rate=0.4u/tick。',
  },
  {
    id: 'inreziniver',
    enName: 'Inreziniver',
    zhName: '因雷齐尼韦',
    category: 'inverse',
    targets: ['逆产物'],
    color: '#c92eb4',
    ph: 13.9,
    metabolizationRate: 0.125 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '瑞扎酮逆产物(<25%)：诱导重度鱼类恐惧症创伤，直到代谢完毕才消失。',
    mechanicsNoteZh: 'rate=0.05u/tick。',
  },
  {
    id: 'neruwhine',
    enName: 'Neruwhine',
    zhName: '内鲁瓦因',
    aliases: ['神经酒'],
    category: 'inverse',
    targets: ['逆产物'],
    color: '#DCDCAA',
    ph: 13.4,
    metabolizationRate: 0.0625 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '神经碱逆产物(<50%)：在体内期间诱导随机临时脑创伤，代谢极慢(0.025u/tick)。',
    mechanicsNoteZh: '无毒素加成。',
  },
  {
    id: 'corazargh',
    enName: 'Corazargh',
    zhName: '科拉扎尔格',
    aliases: ['科拉扎格'],
    category: 'inverse',
    targets: ['逆产物', '心脏'],
    color: '#5F5F5F',
    ph: 13.5,
    metabolizationRate: 2.5 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    selfConsuming: true,
    deadProcess: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '麻黄碱逆产物(<40%)：干扰天然起搏器，迫使患者必须手动泵动心脏。',
    mechanicsNoteZh: 'rate=1.0u/tick，自耗药。',
  },
  {
    id: 'oculater',
    enName: 'Oculater',
    zhName: '奥库莱特',
    aliases: ['奥库拉特'],
    category: 'inverse',
    targets: ['逆产物'],
    color: '#DDDDDD',
    ph: 13,
    metabolizationRate: 0.5 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '明目素逆产物(<45%)：暂时致盲，代谢结束后恢复视力。',
    mechanicsNoteZh: 'rate=0.2u/tick。',
  },
  {
    id: 'tinacusiate',
    enName: 'Tinacusiate',
    zhName: '蒂纳库西亚特',
    aliases: ['蒂纳库西埃特'],
    category: 'inverse',
    targets: ['逆产物'],
    color: '#DDDDFF',
    ph: 1,
    metabolizationRate: 0.1 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '复聪剂杂质：扰乱听觉字体样式，造成 0.1 点轻微肝损/tick。',
    mechanicsNoteZh: 'rate=0.04u/tick。',
    onMobLife(ctx, inst, ratio, dt) {
      ctx.adjustOrganDamage('liver', metabolizeFreeConstant(0.5, inst.metabolizationRate) * 0.1 * ratio * dt, undefined, true);
    },
  },
  {
    id: 'prohol',
    enName: 'Prohol',
    zhName: '普罗霍尔',
    category: 'inverse',
    targets: ['逆产物'],
    color: '#4C8000',
    ph: 7,
    metabolizationRate: 0.125 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '安替霍尔逆产物(<35%)：潜伏在血液中大幅增强酒精的醉酒威力。',
    mechanicsNoteZh: 'rate=0.05u/tick。',
  },
  {
    id: 'lidopaine',
    enName: 'Lidopaine',
    zhName: '利多巴因',
    category: 'inverse',
    targets: ['逆产物', '心脏', '耐力'],
    color: '#85111f',
    ph: 6.09,
    metabolizationRate: 0.4 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '利多卡因逆产物(<55%)：极其痛苦的致痛剂！每 tick 造成 15 心脏损伤(上限85)与 25 耐力损耗。',
    mechanicsNoteZh: '出自 Tianguan13 modular_reagents/medicine.dm（3 * REM * dt 心伤，5 * REM * dt 耐力伤）。',
    onMobLife(ctx, _inst, _ratio, dt) {
      ctx.adjustOrganDamage('heart', 3 * REM * dt, 85);
      ctx.state.stamina = Math.min(120, ctx.state.stamina + 5 * REM * dt);
      ctx.markStaminaHit();
    },
  },
  {
    id: 'sepsisillin',
    enName: 'Sepsisillin',
    zhName: '败血西林',
    category: 'inverse',
    targets: ['逆产物'],
    color: '#002f06',
    ph: 8.1,
    metabolizationRate: 0.25 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    metabolizedTraits: ['TRAIT_IMMUNODEFICIENCY'],
    summaryZh: '太空西林逆产物(<30%)：削弱免疫系统并加速病毒感染恶化。',
    mechanicsNoteZh: 'rate=0.1u/tick。',
  },
  {
    id: 'probital_failed',
    enName: 'Metabolic Inhibition Factor',
    zhName: '代谢抑制因子',
    category: 'inverse',
    targets: ['逆产物'],
    color: '#b3ff00',
    ph: 1,
    metabolizationRate: 0.0625 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 10,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '益生泰尔失败产物：会将食物中的营养物催化为损伤大脑的朊病毒肽！',
    mechanicsNoteZh: 'rate=0.025u/tick，过量10u提速至 1.6u/tick。',
    overdoseStart(_ctx, inst) {
      inst.metabolizationRate = 4 * REAGENTS_METABOLISM;
    },
  },
  {
    id: 'peptides_failed',
    enName: 'Prion Peptides',
    zhName: '朊病毒肽',
    category: 'inverse',
    targets: ['逆产物', '大脑'],
    color: '#808820',
    ph: 2.1,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '错误催化产物：消耗饱食度并每 tick 造成 0.25 点大脑损伤（上限170）。',
    mechanicsNoteZh: 'rate=0.4u/tick。',
    onMobLife(ctx, _inst, ratio, dt) {
      ctx.adjustOrganDamage('brain', 0.125 * ratio * dt, 170);
    },
  },
  {
    id: 'toxic_monomers',
    enName: 'Toxic Monomers',
    zhName: '有毒单体',
    category: 'inverse',
    targets: ['逆产物', '毒素'],
    color: '#992200',
    ph: 2,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '通用未指定逆试剂（如低纯度甘露醇产物）：每 tick 造成 1 点毒素伤害。',
    mechanicsNoteZh: 'rate=0.4u/tick。',
    onMobLife(ctx, inst, ratio, dt) {
      ctx.state.tox += metabolizeFreeConstant(0.5, inst.metabolizationRate) * 1 * ratio * dt;
    },
  },

  // ==================== HELPERS / TOXINS / FOOD ====================
  {
    id: 'nutriment',
    enName: 'Nutriment',
    zhName: '营养物',
    category: 'helper',
    targets: ['催化/底物'],
    color: '#664330',
    ph: 7,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 0.5,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    unaffectedByMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '基础食物营养物：每 tick 30%/s 概率治 0.5 钝+烧伤；遇到益生泰尔产生的代谢因子会立刻转为治疗肽！',
    mechanicsNoteZh: '食物类不受代谢效率修正；与有丝分裂素代谢因子(>=0.5u) 1:1 催化转化治疗肽。',
    onMobLife(ctx, _inst, ratio) {
      const p = ctx.chance(30);
      if (p > 0) {
        const heal = 0.5 * 1 * ratio * p;
        ctx.state.brute = Math.max(0, ctx.state.brute - heal);
        ctx.state.burn = Math.max(0, ctx.state.burn - heal);
      }
    },
  },
  {
    id: 'peptides',
    enName: 'Peptides',
    zhName: '肽',
    aliases: ['治疗肽'],
    category: 'helper',
    targets: ['钝伤', '烧伤'],
    color: '#BBD4D9',
    ph: 7,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 0.5,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    inverseChemId: 'peptides_failed',
    isMedicine: false,
    reverseMetabolism: false,
    unaffectedByMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '由益生泰尔+营养物催化生成：每 tick 有较高概率(30%/s ≈ 51%/tick)治疗 1.5 钝伤与 1.5 烧伤！',
    mechanicsNoteZh: 'Tianguan13 food_reagents.dm 中 peptides 继承 nutriment/on_mob_life，heal = 0.5 * brute_heal(3) * ratio。',
    onMobLife(ctx, _inst, ratio) {
      const p = ctx.chance(30);
      if (p > 0) {
        const heal = 0.5 * 3 * ratio * p;
        ctx.state.brute = Math.max(0, ctx.state.brute - heal);
        ctx.state.burn = Math.max(0, ctx.state.burn - heal);
      }
    },
  },
  makeSimpleToxin({
    id: 'toxin',
    enName: 'Toxin',
    zhName: '毒素',
    color: '#CF3600',
    ph: 7,
    toxpwr: 1.5,
    summaryZh: '标准基础毒物：每 tick 造成 1.5 点毒素并按 (总量/15)×1.5 损伤肝脏（低于肝耐受3u时被过滤）。',
    mechanicsNoteZh: '适合用于测试解毒剂与肝脏耐受机制。',
  }),
  makeSimpleToxin({
    id: 'amatoxin',
    enName: 'Amatoxin',
    zhName: '鹅膏毒肽',
    aliases: ['鹅膏毒素'],
    color: '#792300',
    ph: 13,
    toxpwr: 2.5,
    summaryZh: '强力毒物：每 tick 造成 2.5 点毒素并造成高额肝脏毒素损伤。',
    mechanicsNoteZh: 'toxpwr = 2.5，用于压力测试多功能解毒剂、木泰尔、甘汞、氨化汞等清除能力。',
  }),
  {
    id: 'anacea',
    enName: 'Anacea',
    zhName: '安纳西',
    aliases: ['阿纳西娅'],
    category: 'helper',
    targets: ['清毒清除'],
    color: '#3C5133',
    ph: 8,
    metabolizationRate: 0.08 * REAGENTS_METABOLISM, // 0.032u/tick
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    isToxin: true,
    toxpwr: 0.15,
    liverDamageMultiplier: 1,
    liverToleranceMultiplier: 1,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '反医疗毒药：极慢代谢(0.032u/tick)，以极快速度清光体内所有医疗药物(最高62.5u/tick)并瘫痪多功能解毒剂的清除！',
    mechanicsNoteZh: '若体内有甘汞或喷替酸，清药速率降低为1/10；清除安纳西需依赖木泰尔、甘汞、喷替酸或氨化汞。',
    onMobLife(ctx, inst, ratio, dt) {
      const hasSuppressor = ctx.state.blood.some(
        (r) => (r.id === 'calomel' || r.id === 'pen_acid') && r.volume > 0,
      );
      const removeAmt = hasSuppressor ? 0.5 : 5;
      ctx.state.tox +=
        metabolizeFreeConstant(0.5, inst.metabolizationRate) *
        0.15 *
        normP(inst, this) *
        ratio *
        dt;
      for (const r of [...ctx.state.blood]) {
        const def = REAGENTS[r.id];
        if (!def?.isMedicine) continue;
        ctx.removeBloodReagent(
          r.id,
          6.25 * removeAmt * (def.purgeMultiplier ?? 1) * normP(inst, this) * ratio * dt,
        );
      }
    },
  },
  {
    id: 'lexorin',
    enName: 'Lexorin',
    zhName: '莱克索林',
    category: 'helper',
    targets: ['窒息'],
    color: '#7DC3A0',
    ph: 1.2,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    isToxin: true,
    toxpwr: 0,
    liverDamageMultiplier: 1,
    liverToleranceMultiplier: 1,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '强力阻断呼吸毒药：阻止肺部正常呼吸并每 tick 造成 5 点窒息（满纯度6.67），与肾上腺素相遇会剧烈反应生成组胺。',
    mechanicsNoteZh: '肾上腺素与其同时存在时会停止加血并彼此抵消清除，10%/s 生成 4u 组胺。',
    onMobLife(ctx, inst, ratio, dt) {
      ctx.state.oxy += 2.5 * normP(inst, this) * ratio * dt;
      ctx.state.losebreath += 1 * normP(inst, this) * ratio * dt;
    },
  },
  {
    id: 'histamine',
    enName: 'Histamine',
    zhName: '组胺',
    category: 'helper',
    targets: ['毒素'],
    color: '#FA6464',
    ph: 7,
    metabolizationRate: 0.25 * REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 30,
    inverseChemVal: 0,
    isMedicine: false,
    isToxin: true,
    toxpwr: 0,
    silentToxin: true,
    liverDamageMultiplier: 1,
    liverToleranceMultiplier: 1,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '过敏休克介质：随机造成钝伤；过量 30u 时每 tick 造成 4 点钝伤、毒素与窒息！可用苯海拉明/双苯突触嗪解毒。',
    mechanicsNoteZh: 'rate=0.1u/tick，OD=30u。',
    onMobLife(ctx, _inst, ratio) {
      const p = ctx.chance(30) * 0.25 * 0.75;
      if (p > 0) {
        ctx.state.brute += 4 * ratio * p;
      }
    },
    overdoseProcess(ctx, _inst, ratio, dt) {
      const hurt = 4 * ratio * dt;
      ctx.state.oxy += hurt;
      ctx.state.brute += hurt;
      ctx.state.tox += hurt;
    },
  },
  {
    id: 'mindbreaker',
    enName: 'Mindbreaker Toxin',
    zhName: '碎心者毒素',
    category: 'helper',
    targets: ['毒素'],
    color: '#B31008',
    ph: 11,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: REAGENT_STANDARD_PURITY,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    isToxin: true,
    toxpwr: 0,
    liverDamageMultiplier: 1,
    liverToleranceMultiplier: 1,
    isDrug: true,
    reverseMetabolism: false,
    penetratesSkin: 'VAPOR',
    summaryZh: '致幻毒素，可用突触嗪/双苯突触嗪或氟哌啶醇清除。',
    mechanicsNoteZh: 'rate=0.4u/tick。',
  },
  {
    id: 'ethanol',
    enName: 'Ethanol',
    zhName: '乙醇',
    aliases: ['酒精'],
    category: 'helper',
    targets: ['催化/底物'],
    color: '#404030',
    ph: 7.33,
    metabolizationRate: 0.3 * REAGENTS_METABOLISM, // Tianguan13 bubber edit: 0.12u/tick
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    isAlcohol: true,
    reverseMetabolism: false,
    unaffectedByMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '纯酒精：在体内造成醉酒与轻微有机肝损伤，可用安替霍尔迅速清除。',
    mechanicsNoteZh: 'rate=0.12u/tick。',
    onMobLife(ctx, inst, _ratio, dt) {
      const bp = ctx.getBloodReagent('prohol') ? 85 : 65;
      const dmg = (Math.sqrt(inst.volume) * Math.pow(bp, 1.6) * 0.015 * dt) / 300;
      ctx.adjustOrganDamage('liver', Math.max(0, dmg));
    },
  },
  {
    id: 'sugar',
    enName: 'Sugar',
    zhName: '糖',
    category: 'helper',
    targets: ['催化/底物'],
    color: '#FFFFFF',
    ph: 7,
    metabolizationRate: 5 * REAGENTS_METABOLISM, // 2u/tick
    defaultPurity: 1,
    overdoseThreshold: 120,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    unaffectedByMetabolism: true,
    penetratesSkin: 'VAPOR',
    summaryZh: '快速消耗(2u/tick)；过量 120u 引发高血糖休克昏睡 20 秒，可用胰岛素清除。',
    mechanicsNoteZh: '蜂蜜或生理盐水过量会产生糖。',
    overdoseStart(ctx) {
      ctx.state.sleeping = Math.max(ctx.state.sleeping, 20);
      ctx.addEvent('warn', 'overdose', '高血糖休克', '血糖超过 120u，引发昏睡 20 秒！');
    },
    overdoseProcess(ctx, _inst, ratio, dt) {
      ctx.state.drowsiness = Math.min(60, ctx.state.drowsiness + 0.5 * ratio * dt);
    },
  },
  {
    id: 'water',
    enName: 'Water',
    zhName: '水',
    category: 'helper',
    targets: ['催化/底物', '补血', '温控灭火'],
    color: '#AAAAAA',
    ph: 7,
    metabolizationRate: REAGENTS_METABOLISM,
    defaultPurity: 1,
    overdoseThreshold: 0,
    inverseChemVal: 0,
    isMedicine: false,
    reverseMetabolism: false,
    penetratesSkin: 'NONE',
    summaryZh: '万能稀释溶剂（如稀释木泰尔静脉滴注）：入血每 tick 恢复 0.1u 血量并辅助有机肝恢复；泼洒可灭火。',
    mechanicsNoteZh: 'rate=0.4u/tick。',
    exposeMob(ctx, method) {
      if (method === 'TOUCH') {
        ctx.state.onFire = false;
        ctx.state.fireStacks = 0;
      }
    },
    onMobLife(ctx, _inst, ratio, dt) {
      const liver = ctx.state.organs.liver;
      if (ctx.state.liverType !== 'none' && !liver.robotic && !liver.failing && liver.damage > 0) {
        ctx.adjustOrganDamage('liver', -0.5 * 0.0005 * liver.maxHealth * ratio * dt);
      }
      ctx.state.bloodVolume = Math.min(560, ctx.state.bloodVolume + 0.05 * ratio * dt);
    },
  },
];

export const REAGENT_LIST: ReagentDef[] = ALL_REAGENTS;

export const REAGENTS: Record<string, ReagentDef> = Object.fromEntries(
  ALL_REAGENTS.map((r) => [r.id, r]),
);

export function getDisplayColor(hex: string): string {
  const lower = hex.toLowerCase();
  if (lower === '#000000' || lower === '#1b1b1b') return '#94a3b8';
  if (lower === '#1d3535' || lower === '#273333' || lower === '#353535') return '#64748b';
  if (lower === '#0000c8') return '#4f7cff';
  if (lower === '#002f06') return '#22c55e';
  if (lower === '#3c0b0b') return '#f87171';
  if (lower === '#300040') return '#c084fc';
  if (lower === '#2c1f63') return '#818cf8';
  return hex;
}

export function computeEffectiveOD(def: ReagentDef, purity: number): number {
  if (!def.overdoseThreshold) return 0;
  return Math.max(0, def.overdoseThreshold + (purity - def.defaultPurity) * def.overdoseThreshold);
}

export const MECHANISM_TRAITS = [
  '治疗药物',
  '无过量(无OD)',
  '有过量(OD)',
  '有逆反应',
  '无肝可代',
  '死后生效',
  '毒素/有害',
  '逆产物',
] as const;

export const EFFECT_TRAITS = [
  '全伤',
  '钝伤',
  '烧伤',
  '毒素',
  '窒息',
  '耐力',
  '止血',
  '补血',
  '伤口愈合',
  '清毒清除',
  '危急抢救',
  '止痛',
  '大脑',
  '心脏',
  '肝脏',
  '肺部',
  '胃部',
  '眼睛',
  '耳朵',
  '辐射',
  '专效解毒',
  '抗晕止吐',
  '镇静催眠',
  '促醒清醒',
  '温控灭火',
  '尸体复活',
  '催化/底物',
] as const;

/**
 * Derive unified filterable traits combining reagent targets and source-code pharmacology flags.
 */
export function getReagentTraits(def: ReagentDef): string[] {
  const traits = new Set<string>(def.targets);
  if (def.isMedicine) traits.add('治疗药物');
  if (def.overdoseThreshold === 0) traits.add('无过量(无OD)');
  else traits.add('有过量(OD)');
  if (def.inverseChemVal > 0) traits.add('有逆反应');
  if (def.selfConsuming) traits.add('无肝可代');
  if (def.deadProcess) traits.add('死后生效');
  if (def.isToxin || def.category === 'inverse') traits.add('毒素/有害');
  if (def.category === 'inverse') traits.add('逆产物');
  return Array.from(traits);
}
