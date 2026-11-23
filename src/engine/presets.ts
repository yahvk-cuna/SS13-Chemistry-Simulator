import { BLOOD_VOLUME_NORMAL, BODYTEMP_NORMAL } from './constants';
import type { PatientConfig, SimPreset } from './types';

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

export const SIM_PRESETS: SimPreset[] = [
  {
    id: 'c2-combo',
    name: '1. 常规创伤复合急救 (利比特 + 伦图里 + 多功能解毒剂)',
    description:
      '演示核心 C2 药物组合：3 种独特药物同时在体使多功能解毒剂激活最高解毒速度且不清除其他药物，同时产生轻微肝/胃/肺副伤。',
    durationSeconds: 180,
    patient: makeBasePatient({ brute: 70, burn: 60, tox: 25 }),
    doses: [
      { id: 'd1', reagentId: 'libital', volume: 15, method: 'INJECT', startTime: 0, purity: 0.75, temp: 300, ivRate: 5, enabled: true },
      { id: 'd2', reagentId: 'lenturi', volume: 15, method: 'INJECT', startTime: 0, purity: 0.75, temp: 300, ivRate: 5, enabled: true },
      { id: 'd3', reagentId: 'multiver', volume: 10, method: 'INJECT', startTime: 0, purity: 0.75, temp: 300, ivRate: 5, enabled: true },
    ],
  },
  {
    id: 'superior-combo',
    name: '2. 高阶重伤无副伤配方 (水杨酸 + 奥沙雄龙 + 格兰尼)',
    description:
      '高阶医疗经典组合：水杨酸与奥沙雄龙在损伤>25时每tick狂治4点，配合格兰尼比塔卢里收尾轻伤并止痛，零器官损伤。',
    durationSeconds: 180,
    patient: makeBasePatient({ brute: 95, burn: 85 }),
    doses: [
      { id: 'd1', reagentId: 'sal_acid', volume: 18, method: 'INJECT', startTime: 0, purity: 1.0, temp: 300, ivRate: 5, enabled: true },
      { id: 'd2', reagentId: 'oxandrolone', volume: 18, method: 'INJECT', startTime: 0, purity: 1.0, temp: 300, ivRate: 5, enabled: true },
      { id: 'd3', reagentId: 'granibitaluri', volume: 16, method: 'INJECT', startTime: 0, purity: 1.0, temp: 300, ivRate: 5, enabled: true },
    ],
  },
  {
    id: 'syriniver-iv',
    name: '3. 木泰尔 (Syriniver) 20% 稀释静脉滴注抢救重度中毒',
    description:
      '重度毒素 120 点时直接大剂量推注木泰尔必过量(阈值6u)；采用 20u 木泰尔 + 80u 水静脉滴注(5u/tick)，每次仅入血1u并转化为安全的穆西弗！',
    durationSeconds: 240,
    patient: makeBasePatient({ tox: 120 }),
    doses: [
      { id: 'd1', reagentId: 'syriniver', volume: 20, method: 'IV_DRIP', startTime: 0, purity: 0.75, temp: 300, ivRate: 1, enabled: true },
      { id: 'd2', reagentId: 'water', volume: 80, method: 'IV_DRIP', startTime: 0, purity: 1.0, temp: 300, ivRate: 4, enabled: true },
    ],
  },
  {
    id: 'probital-peptides',
    name: '4. 益生泰尔口服 + 营养物催化治疗肽',
    description:
      '益生泰尔经口服(INGEST)后会在体内生成有丝分裂素代谢因子，随后摄入营养物将瞬间转化为治疗肽协同治疗钝伤与烧伤！',
    durationSeconds: 180,
    patient: makeBasePatient({ brute: 85, burn: 30 }),
    doses: [
      { id: 'd1', reagentId: 'probital', volume: 15, method: 'INGEST', startTime: 0, purity: 0.75, temp: 300, ivRate: 5, enabled: true },
      { id: 'd2', reagentId: 'nutriment', volume: 25, method: 'INGEST', startTime: 4, purity: 0.5, temp: 300, ivRate: 5, enabled: true },
    ],
  },
  {
    id: 'hardcrit-rescue',
    name: '5. 濒死重危抢救 (赫比妥 + 阿托品 + 沙丁胺醇)',
    description:
      '总伤害 140（生命 -40 重危）：赫比妥利用高总伤高速回血且无窒息副伤，阿托品阻断重危恶化并全伤回血，沙丁胺醇扫除缺氧。',
    durationSeconds: 180,
    patient: makeBasePatient({ brute: 90, oxy: 50 }),
    doses: [
      { id: 'd1', reagentId: 'helbital', volume: 15, method: 'INJECT', startTime: 0, purity: 0.75, temp: 300, ivRate: 5, enabled: true },
      { id: 'd2', reagentId: 'atropine', volume: 10, method: 'INJECT', startTime: 0, purity: 1.0, temp: 300, ivRate: 5, enabled: true },
      { id: 'd3', reagentId: 'salbutamol', volume: 10, method: 'INJECT', startTime: 0, purity: 1.0, temp: 300, ivRate: 5, enabled: true },
    ],
  },
  {
    id: 'penthrite-boom',
    name: '6. 禁忌混药演示：彭斯莱特 + 肾上腺素 体内爆炸',
    description:
      '急诊常见事故：前线刚注射过肾上腺素（或之后误打肾上腺素），体内与彭斯莱特 1:1 相遇立刻引爆并清空所有血液试剂！',
    durationSeconds: 120,
    patient: makeBasePatient({ brute: 60, oxy: 60 }),
    doses: [
      { id: 'd1', reagentId: 'penthrite', volume: 15, method: 'INJECT', startTime: 0, purity: 0.75, temp: 300, ivRate: 5, enabled: true },
      { id: 'd2', reagentId: 'epinephrine', volume: 10, method: 'INJECT', startTime: 10, purity: 1.0, temp: 300, ivRate: 5, enabled: true },
    ],
  },
  {
    id: 'cryo-pod',
    name: '7. 低温冷冻仓全伤与重度伤口愈合 (冰晶沙酮)',
    description:
      '将患者置于 170K 低温仓昏迷中注射 30u 冰晶沙酮：治疗率翻倍，迅速治愈全四项伤害并推进伤口计数器(66点/处)治好 2 处重度伤口。',
    durationSeconds: 180,
    patient: makeBasePatient({
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
    doses: [
      { id: 'd1', reagentId: 'cryoxadone', volume: 30, method: 'INJECT', startTime: 0, purity: 1.0, temp: 170, ivRate: 5, enabled: true },
    ],
  },
  {
    id: 'fire-pyrox',
    name: '8. 火场高温抢救 (吡洛沙酮 + 赫丘利蒸气灭火)',
    description:
      '全身着火 450K 重度烧伤：先借高温触发吡洛沙酮双倍火中治疗加速回复并治愈伤口，随后喷洒赫丘利蒸气灭火降温。',
    durationSeconds: 180,
    patient: makeBasePatient({
      burn: 90,
      brute: 40,
      woundSeverity: 'moderate',
      woundCount: 1,
      bodyTemp: 450,
      ambientTemp: 310,
      onFire: true,
      fireStacks: 10,
    }),
    doses: [
      { id: 'd1', reagentId: 'pyroxadone', volume: 20, method: 'INJECT', startTime: 0, purity: 1.0, temp: 300, ivRate: 5, enabled: true },
      { id: 'd2', reagentId: 'hercuri', volume: 15, method: 'VAPOR', startTime: 16, purity: 0.75, temp: 300, ivRate: 5, enabled: true },
    ],
  },
  {
    id: 'inverse-disaster',
    name: '9. 低纯度逆反应灾难 (25% 利比特 + 20% 特里莫尔)',
    description:
      '制药 pH 失控产物演示：低于逆阈值的利比特与特里莫尔入血后分别转化为力比多油（伤肝无治疗）与超级褪黑素（第11周期强制催眠）。',
    durationSeconds: 180,
    patient: makeBasePatient({ brute: 50, oxy: 45 }),
    doses: [
      { id: 'd1', reagentId: 'libital', volume: 15, method: 'INJECT', startTime: 0, purity: 0.25, temp: 300, ivRate: 5, enabled: true },
      { id: 'd2', reagentId: 'tirimol', volume: 15, method: 'INJECT', startTime: 0, purity: 0.20, temp: 300, ivRate: 5, enabled: true },
      { id: 'd3', reagentId: 'salbutamol', volume: 10, method: 'INJECT', startTime: 26, purity: 1.0, temp: 300, ivRate: 5, enabled: true },
    ],
  },
  {
    id: 'anacea-purge',
    name: '10. 毒素清除对抗：安纳西瘫痪多功能解毒 vs 喷替酸/甘汞',
    description:
      '体内同时存在安纳西与鹅膏毒肽：多功能解毒剂会被安纳西锁死清除功能并被速清；使用喷替酸则能反制安纳西并成功清毒保命。',
    durationSeconds: 180,
    patient: makeBasePatient({ tox: 40 }),
    doses: [
      { id: 'd1', reagentId: 'anacea', volume: 10, method: 'INJECT', startTime: 0, purity: 0.75, temp: 300, ivRate: 5, enabled: true },
      { id: 'd2', reagentId: 'amatoxin', volume: 15, method: 'INJECT', startTime: 0, purity: 1.0, temp: 300, ivRate: 5, enabled: true },
      { id: 'd3', reagentId: 'multiver', volume: 15, method: 'INJECT', startTime: 4, purity: 0.75, temp: 300, ivRate: 5, enabled: true },
      { id: 'd4', reagentId: 'pen_acid', volume: 15, method: 'INJECT', startTime: 10, purity: 1.0, temp: 300, ivRate: 5, enabled: true },
    ],
  },
];
