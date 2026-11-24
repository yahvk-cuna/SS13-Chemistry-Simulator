# 天关13（Tianguan13 / SS13）药物代谢与伤势模拟器 — 开发索引与日志（DEV_INDEX）

> 本文档面向后续接手的 AI 对话与开发者，集中记录 `/home/yahvk/ss13-chem-sim` 的模块架构、上游 `/home/yahvk/Tianguan13` 精确源码/汉化路径、药理公式、内置试剂目录、已知坑点与开发日志，避免在庞大的 TG/SS13 源码仓库中重复全局搜索。

---

## 1. 项目概览与常用命令

- **项目目录**：`/home/yahvk/ss13-chem-sim`
- **上游源码仓库**：`/home/yahvk/Tianguan13`（当前基准提交：`2f7bad2d63227592124b7f891151e8af3d9d9bb0`）
- **在线 Wiki 参考**：TG13 中文 Wiki 药物章节（`https://tgwiki.spacestation14cn.com/index.php?title=Guide_to_chemistry#%E8%8D%AF%E7%89%A9_2`）
- **技术栈**：Bun + React 19 + TypeScript（strict 模式）+ Vite + Vitest + `lucide-react` + 原生 SVG 交互图表与 CSS 变量样式表
- **包脚本（[package.json](file:///home/yahvk/ss13-chem-sim/package.json)，统一使用 `bun`）**：
  - `bun run dev`：启动 Vite 本地开发服务器
  - `bun run test`（执行 `vitest run`）：运行 Vitest 单元测试（Node 环境，不依赖浏览器）
  - `bun run typecheck`（执行 `tsc --noEmit`）：全量 TypeScript 类型检查（启用了 `strict`、`noUnusedLocals`、`noUnusedParameters`）
  - `bun run build`（执行 `tsc -b && vite build`）：类型构建检查并生成生产包至 `dist/`
  - `bun run preview`：预览生产构建产物

> **宿主机执行环境备注**：在本工作区运行命令时，标准沙盒可能因 `.envrc` 路径校验返回 `sandbox configuration error: deny .envrc: non-absolute file path.`，遇到该提示时改用无沙盒模式执行单个命令即可。

---

## 2. 本项目源码结构索引

### 2.1 根配置、规则与入口

| 文件 | 职责 |
| :--- | :--- |
| [README.md](file:///home/yahvk/ss13-chem-sim/README.md) | 项目中文说明文档：核心特性、技术栈、快速开始命令、目录概览与 AGPL-3.0 协议说明 |
| [LICENSE](file:///home/yahvk/ss13-chem-sim/LICENSE) | GNU Affero General Public License v3.0（AGPL-3.0-or-later）全文 |
| [AGENTS.md](file:///home/yahvk/ss13-chem-sim/AGENTS.md) | Antigravity 工作区常驻规则：强制先读并同步维护 `DEV_INDEX.md`、禁止写入易变数据、汉化优先级与必跑校验 |
| [DEV_INDEX.md](file:///home/yahvk/ss13-chem-sim/DEV_INDEX.md) | 本项目开发索引、上游 `Tianguan13` 精确路径图谱、公式速查、试剂清单与开发日志 |
| [package.json](file:///home/yahvk/ss13-chem-sim/package.json) | 依赖版本与 `dev / build / preview / test / typecheck` 脚本 |
| [flake.nix](file:///home/yahvk/ss13-chem-sim/flake.nix) | Nix Flake 定义（`packages.default` 输出静态构建产物、`devShells.default` 提供 `bun` 与 `bun2nix`、`nixosModules.default` 提供 Nginx 托管模块 `services.ss13-chem-sim`） |
| [flake.lock](file:///home/yahvk/ss13-chem-sim/flake.lock) | Nix Flake 锁定文件 |
| [bun.nix](file:///home/yahvk/ss13-chem-sim/bun.nix) | `bun2nix` 生成的离线 npm 依赖声明（配合 `bun.lock` 使用） |
| [tsconfig.json](file:///home/yahvk/ss13-chem-sim/tsconfig.json) | `ES2022`、`react-jsx`、`strict: true`、`noUnusedLocals: true`、`noUnusedParameters: true` |
| [vite.config.ts](file:///home/yahvk/ss13-chem-sim/vite.config.ts) | Vite `base: './'` + `@vitejs/plugin-react` + Vitest `include: ['src/**/*.test.ts']` |
| [index.html](file:///home/yahvk/ss13-chem-sim/index.html) | 中文页面标题与 `#root` 挂载点 |
| [src/main.tsx](file:///home/yahvk/ss13-chem-sim/src/main.tsx) | React 入口，加载 `App` 与 `./styles/index.css` |
| [src/App.tsx](file:///home/yahvk/ss13-chem-sim/src/App.tsx) | 全局状态（URL Hash 初始化与同步、患者、给药方案、时长、RNG 模式/种子、基准对比、播放倍速、图鉴与分享弹窗）与三栏总装配 |
| [src/styles/index.css](file:///home/yahvk/ss13-chem-sim/src/styles/index.css) | 暗色医疗 HUD 主题、CSS 变量、响应式三栏网格（`1180px` 以下切为双栏+全宽底栏，卡片胶囊不折行） |

### 2.2 核心仿真引擎（`src/engine/`）

| 文件 | 核心导出与职责 |
| :--- | :--- |
| [src/engine/constants.ts](file:///home/yahvk/ss13-chem-sim/src/engine/constants.ts) | `SSMOBS_DT`、`REAGENTS_METABOLISM`、`REM`、`PATCH_TRANSFER_PER_TICK`、`PATCH_MAX_VOLUME`（40u）、`PILL_MAX_VOLUME`（50u）、胃吸收常量、生命阈值、血量分层、体温常数、`LIVER_PRESETS`（6 种肝脏配置）、`metabolizeFreeConstant`、`roundStep`、`clamp`、`getTempChangeAmount` |
| [src/engine/types.ts](file:///home/yahvk/ss13-chem-sim/src/engine/types.ts) | 全部引擎数据结构：`DeliveryMethod`、`ReagentCategory`、`MobStat`、`OrganSlot`、`ReagentDef`、`ReagentInstance`、`SimContext`、`DoseEvent`（含 `patchGroup`）、`ActiveTransferComponent`、`PatientConfig`（含 `allergies`、`chemicalAllergy`）、`SimMutableState`、`TickSnapshot`、`SimEvent`（含 `'allergy'`）、`SimSummary`（含 `triggeredDangerReactions`、`triggeredAllergies`）、`SimResult`、`SimScenario` |
| [src/engine/rng.ts](file:///home/yahvk/ss13-chem-sim/src/engine/rng.ts) | `createRng`（Mulberry32 确定性伪随机）、`sptProbRate`（对应 BYOND `SPT_PROB_RATE`: `1 - (1 - p)^dt`） |
| [src/engine/reactions.ts](file:///home/yahvk/ss13-chem-sim/src/engine/reactions.ts) | `runInBodyReactions(ctx)`：彭斯莱特+肾上腺素/阿托品体内爆炸清血、代谢因子+营养物→治疗肽、抑制因子+营养物→朊病毒肽 |
| [src/engine/reagents.ts](file:///home/yahvk/ss13-chem-sim/src/engine/reagents.ts) | 全部内置试剂定义与生命周期钩子、`REAGENT_LIST`、`REAGENTS`、`PURITY_DEPENDENT_EFFECT_IDS`、`ALLERGY_BLACKLIST_IDS`、`STOMACH_FOOD_IDS`、`EXTREME_ALLERGY_CANDIDATES`、`isPurityIndependentEffect`、`isExtremeAllergyCandidate`、`isChemicalAllergyTrigger`、`isNoAllergyReagent`、`rollRandomAllergies`、`MECHANISM_TRAITS`（含 `无过敏`、`纯度无关效果`）、`EFFECT_TRAITS`、`getReagentTraits`、`getDisplayColor`、`computeEffectiveOD` |
| [src/engine/simulator.ts](file:///home/yahvk/ss13-chem-sim/src/engine/simulator.ts) | `runSimulation(patient, doses, options)`：12 步 Tick 主循环（含复合贴片按比例共享 `0.75u/t` 缓释、极端药物过敏与肾上腺素阻断、呕吐排胃及 4b 化学过敏基因突变）、`addToHolder`、`computeStat`、`organStatusLabel`、`syncTraits` 及事件/汇总生成 |
| [src/engine/scenarioShare.ts](file:///home/yahvk/ss13-chem-sim/src/engine/scenarioShare.ts) | 患者构造与场景 URL Hash（`#s=`）紧凑二进制位图 Base64URL 编解码（含只追加稳定索引表 `REAGENT_SHARE_ORDER`、`patchGroup`）：`makeBasePatient`、`createBlankScenario`、`encodeScenarioPayload`、`decodeScenarioPayload`、`buildScenarioShareUrl`、`extractScenarioPayloadFromInput`、`parseScenarioFromUrlOrText`、`tryReadScenarioFromHash` |
| [src/engine/regimenStorage.ts](file:///home/yahvk/ss13-chem-sim/src/engine/regimenStorage.ts) | 给药方案存档、合片装箱、菜谱导出与默认剂量工具：`createDefaultDose`、`cloneRegimenDoses`、`sanitizeDoseEvent`、`createOrUpdateSavedRegimen`、`serializeRegimensJson`、`parseRegimensJson`、`areReagentsContainerIncompatible`、`autoPackPatchGroups`、`formatRegimenPlainText`、`loadSavedRegimensFromStorage`、`saveRegimensToStorage` |
| [src/engine/__tests__/simulator.test.ts](file:///home/yahvk/ss13-chem-sim/src/engine/__tests__/simulator.test.ts) | Vitest 核心机制回归测试套件 |

### 2.3 前端界面组件（`src/components/`）

| 文件 | 职责 |
| :--- | :--- |
| [src/components/HeaderBar.tsx](file:///home/yahvk/ss13-chem-sim/src/components/HeaderBar.tsx) | 顶部栏：模拟时长（60–600s）、期望/随机模式与种子、`固定对比基准`、`分享链接`、`导入链接`、`重置`、`药品图鉴`开关 |
| [src/components/PatientPanel.tsx](file:///home/yahvk/ss13-chem-sim/src/components/PatientPanel.tsx) | 患者初始状态：五维伤害滑块、一键伤势快捷填充、7 个器官损伤与 6 种肝脏型号、血量/出血/伤口等级、体温与环境（标准/低温仓/高温/真空）以及「药物过敏与免疫异常」（极端药物过敏多选/上游抽选 6 种 + 化学过敏基因突变开关） |
| [src/components/RegimenPanel.tsx](file:///home/yahvk/ss13-chem-sim/src/components/RegimenPanel.tsx) | 多药组合方案、可折叠方案存档管理区（两行窄栏排版、二次确认覆盖/删除/清空、复制当前/导出全部/导入 JSON）、导出纯文本菜谱抽屉（多行菜谱/单行紧凑切换、复制与下载 `.txt`）、贴片合装（`autoPackPatchGroups` 一键合片与单卡容器归组/分摊速率显示）、常用速添与药名自定义暗色悬浮提示、单卡折叠与纯度快切、过敏原高亮与配伍预检横幅 |
| [src/components/ScenarioShareModal.tsx](file:///home/yahvk/ss13-chem-sim/src/components/ScenarioShareModal.tsx) | 场景 URL 分享与导入弹窗：只读 `#s=...` 链接预览与复制、URL/编码串粘贴导入并替换当前场景 |
| [src/components/SummaryStrip.tsx](file:///home/yahvk/ss13-chem-sim/src/components/SummaryStrip.tsx) | 5 张 KPI 总结卡：终末 HP 与 `STAT_ZH` 徽章（含基准对比差值）、康复/死亡/危急累计耗时、四维净治疗量、峰值器官损伤、药理风险警报（含过敏触发统计） |
| [src/components/TimelineCharts.tsx](file:///home/yahvk/ss13-chem-sim/src/components/TimelineCharts.tsx) | 原生 SVG 多图联动看板（生命值+五维伤势演化、血液实线/胃部虚线浓度曲线、器官损伤%/体温血量切换）、倍速回放与时间轴拖拽 |
| [src/components/TickInspector.tsx](file:///home/yahvk/ss13-chem-sim/src/components/TickInspector.tsx) | 选中 Tick 的生理切片检视（HP 进度条、血量/体表温/核心温/伤口计数、7 器官状态条、`TRAIT_LABELS`、过敏发作/阻断状态、血液/胃内/缓释余量） |
| [src/components/EventLog.tsx](file:///home/yahvk/ss13-chem-sim/src/components/EventLog.tsx) | 按`全部 / 致命过量 / 警告以上 / 转化反应 / 药物过敏 / 给药记录`筛选，点击条目直接跳转对应 Tick |
| [src/components/HandbookModal.tsx](file:///home/yahvk/ss13-chem-sim/src/components/HandbookModal.tsx) | 统一的药品图鉴与选药库弹窗（顶部图鉴入口与「添加药品」共用）：吸顶检索与表头、机制安全（含 `无过敏`）+作用特征双组多选交集筛选、当前患者过敏标记、源码特性标签、可点击逆产物跳转、代谢/OD 排序、`+ 加入`（支持「加入后关闭」或连续添加）及 `Esc` 关闭 |
| [src/components/AboutModal.tsx](file:///home/yahvk/ss13-chem-sim/src/components/AboutModal.tsx) | 顶栏「关于」弹窗：展示模拟器核心功能说明、Tianguan13 源码与 TG13 中文 Wiki 机制来源、本项目 GitHub 源码链接及 AGPL-3.0 协议 |

---

## 3. 上游 `/home/yahvk/Tianguan13` 源码路径精确索引

> 以下所有路径均已在本地 `/home/yahvk/Tianguan13` 仓库验证存在。需要注意部分子目录（如 `atmospherics/`、`impure_reagents/`、`drinks/`、`food_and_drinks/`）与直观猜测不同，后续检索应直接以本节路径为准。

### 3.1 化学机制核心与宏定义

- [code/__DEFINES/reagents.dm](file:///home/yahvk/Tianguan13/code/__DEFINES/reagents.dm)：`REAGENTS_METABOLISM`、`REM`、`CHEMICAL_QUANTISATION_LEVEL`、`CHEMICAL_VOLUME_ROUNDING`、常见试剂性状/化学标记宏
- [code/__DEFINES/atmospherics/atmos_mob_interaction.dm](file:///home/yahvk/Tianguan13/code/__DEFINES/atmospherics/atmos_mob_interaction.dm)：`T0C`、`BODYTEMP_NORMAL`、`BODYTEMP_HEAT_DAMAGE_LIMIT`、`BODYTEMP_COLD_DAMAGE_LIMIT` 及冷热损伤层级常量
- [code/__DEFINES/blood.dm](file:///home/yahvk/Tianguan13/code/__DEFINES/blood.dm)：`BLOOD_VOLUME_NORMAL`（560u）及各百分比警戒阈值
- [code/modules/reagents/chemistry/holder/mob_life.dm](file:///home/yahvk/Tianguan13/code/modules/reagents/chemistry/holder/mob_life.dm)：`metabolize()`、肝脏毒素耐受跳过逻辑、毒素伤肝累加公式与上限、入体纯度反相（`process_mob_reagent_purity`）、静滞（Stasis）处理
- [code/modules/reagents/chemistry/holder/holder.dm](file:///home/yahvk/Tianguan13/code/modules/reagents/chemistry/holder/holder.dm)：`add_reagent`、`remove_reagent`、`trans_to`（加权纯度/pH 混合与口服路由进胃）
- [code/modules/reagents/chemistry/holder/reactions.dm](file:///home/yahvk/Tianguan13/code/modules/reagents/chemistry/holder/reactions.dm)：`handle_reactions`、`instant_react`
- [code/modules/reagents/chemistry/reagents.dm](file:///home/yahvk/Tianguan13/code/modules/reagents/chemistry/reagents.dm)：`/datum/reagent` 基类、纯度缩放过量阈值（`overdose_threshold` 随 `creation_purity - initial(purity)` 缩放）、`get_inverse_purity`
- [code/modules/reagents/reagent_containers/patch.dm](file:///home/yahvk/Tianguan13/code/modules/reagents/reagent_containers/patch.dm)：缓释贴片转移速率（`0.75u/tick`）

### 3.2 药物、毒素与杂质定义

- **核心药物与特殊试剂**：
  - [cat2_medicine_reagents.dm](file:///home/yahvk/Tianguan13/code/modules/reagents/chemistry/reagents/cat2_medicine_reagents.dm)（C2 核心医疗化学：利比特、赫比妥、益生泰尔、艾尤里、伦图里、赫丘利、格兰尼比塔卢里、合成肉、多功能解毒剂、赛维尔、木泰尔、穆西弗、特里莫尔、肯尔莫、彭斯莱特等）
  - [medicine_reagents.dm](file:///home/yahvk/Tianguan13/code/modules/reagents/chemistry/reagents/medicine_reagents.dm)（高阶/独特/特殊药物 + `/datum/reagent/medicine/New()` 中设定的 `REAGENT_REVERSE_METABOLISM`）
  - [impure_reagents.dm](file:///home/yahvk/Tianguan13/code/modules/reagents/chemistry/reagents/impure_reagents.dm)（逆试剂/杂质基类及通用杂质）
  - [impure_medicine_reagents.dm](file:///home/yahvk/Tianguan13/code/modules/reagents/chemistry/reagents/impure_reagents/impure_medicine_reagents.dm)（注意位于 `reagents/impure_reagents/` 子目录！含力比多油、赫尔之握、超级褪黑素等 20+ 种低纯度逆产物）
  - [food_reagents.dm](file:///home/yahvk/Tianguan13/code/modules/reagents/chemistry/reagents/food_reagents.dm)（营养物、治疗肽、蜂蜜、糖等）
  - [other_reagents.dm](file:///home/yahvk/Tianguan13/code/modules/reagents/chemistry/reagents/other_reagents.dm)（水、盐水/常规溶剂及杂项试剂）
  - [toxin_reagents.dm](file:///home/yahvk/Tianguan13/code/modules/reagents/chemistry/reagents/toxin_reagents.dm)（通用毒素、鹅膏毒肽、安纳西、莱克索林、组胺、碎心者毒素等）
  - [alcohol_reagents.dm](file:///home/yahvk/Tianguan13/code/modules/reagents/chemistry/reagents/drinks/alcohol_reagents.dm)（注意位于 `reagents/drinks/` 子目录！乙醇等饮品）
- **模块化扩展药物（Modular Skyrat）**：
  - [modular_skyrat/modules/modular_reagents/code/reagents/medicine.dm](file:///home/yahvk/Tianguan13/modular_skyrat/modules/modular_reagents/code/reagents/medicine.dm)（`lidocaine` 利多卡因、`lidopaine` 利多巴因）
  - [modular_skyrat/master_files/code/modules/reagents/medicine_reagents/medicine_reagents.dm](file:///home/yahvk/Tianguan13/modular_skyrat/master_files/code/modules/reagents/medicine_reagents/medicine_reagents.dm)
- **后续扩展待接入参考目录（同一目录已列出）**：
  - `code/modules/reagents/chemistry/reagents/` 下还有 `drug_reagents.dm`、`atmos_gas_reagents.dm`、`pyrotechnic_reagents.dm`、`catalyst_reagents.dm`、`reaction_agents_reagents.dm`、`unique/`

### 3.3 化学配方与体内即时反应

- [pyrotechnics.dm](file:///home/yahvk/Tianguan13/code/modules/reagents/chemistry/recipes/pyrotechnics.dm)：`彭斯莱特 + 肾上腺素` 与 `彭斯莱特 + 阿托品` 体内爆炸及清血反应
- [food_mixtures.dm](file:///home/yahvk/Tianguan13/code/modules/food_and_drinks/recipes/food_mixtures.dm)（注意不在 `chemistry/recipes/`，而在 `food_and_drinks/recipes/` 下！）：`有丝分裂素代谢因子 + 营养物 → 治疗肽` 与 `代谢抑制因子 + 营养物 → 朊病毒肽`
- 若后续需要新增「烧杯调配 pH / 温度合药」功能，合成配方位于 `/home/yahvk/Tianguan13/code/modules/reagents/chemistry/recipes/` 下的 `cat2_medicines.dm`、`medicine.dm`、`drugs.dm`、`toxins.dm`、`others.dm`、`special.dm`、`catalysts.dm`、`reaction_agents.dm`、`slime_extracts.dm`。

### 3.4 器官生理与人体损伤

- 器官基类与内脏：
  - [_organ.dm](file:///home/yahvk/Tianguan13/code/modules/surgery/organs/_organ.dm)（标准器官阈值与被动自愈 `STANDARD_ORGAN_HEALING = 50/100000`）
  - [_liver.dm](file:///home/yahvk/Tianguan13/code/modules/surgery/organs/internal/liver/_liver.dm)（有机肝/进化肝/赛博肝 T1–T3、`liver_failure` 阶段效果、无肝惩罚）
  - [_stomach.dm](file:///home/yahvk/Tianguan13/code/modules/surgery/organs/internal/stomach/_stomach.dm)（胃部吸收速率与消化逻辑）
  - [_heart.dm](file:///home/yahvk/Tianguan13/code/modules/surgery/organs/internal/heart/_heart.dm)（心脏衰竭与心停骤停触发）
  - [_lungs.dm](file:///home/yahvk/Tianguan13/code/modules/surgery/organs/internal/lungs/_lungs.dm)（肺损伤影响呼吸频率与窒息阈值）
- 碳基/人类生命循环：
  - [carbon/life.dm](file:///home/yahvk/Tianguan13/code/modules/mob/living/carbon/life.dm)、[carbon/carbon.dm](file:///home/yahvk/Tianguan13/code/modules/mob/living/carbon/carbon.dm)、[carbon/damage_procs.dm](file:///home/yahvk/Tianguan13/code/modules/mob/living/carbon/damage_procs.dm)、[living/damage_procs.dm](file:///home/yahvk/Tianguan13/code/modules/mob/living/damage_procs.dm)
  - [human/life.dm](file:///home/yahvk/Tianguan13/code/modules/mob/living/carbon/human/life.dm)、[human/_species.dm](file:///home/yahvk/Tianguan13/code/modules/mob/living/carbon/human/_species.dm)（体表/核心温传导与自动回温对数方程）
  - [living/blood.dm](file:///home/yahvk/Tianguan13/code/modules/mob/living/blood.dm)（注意位于 `living/` 下而非 `carbon/`！失血、造血、低血量缺氧计算）
  - [stamcrit.dm](file:///home/yahvk/Tianguan13/code/datums/status_effects/debuffs/stamcrit.dm)（耐力损耗 ≥100 触发倒地及 10 秒重置定时器）

### 3.5 官方汉化词表与译名优先级规则

- **译名采用优先级**：
  1. [glossary.zh-Hans.json](file:///home/yahvk/Tianguan13/tools/i18n/mt/glossary.zh-Hans.json)（最高权威术语表）
  2. [strings/i18n/zh-Hans/tgui.json](file:///home/yahvk/Tianguan13/strings/i18n/zh-Hans/tgui.json)、[strings/i18n/zh-Hans/datum.json](file:///home/yahvk/Tianguan13/strings/i18n/zh-Hans/datum.json)、[strings/i18n/health_scan_labels.json](file:///home/yahvk/Tianguan13/strings/i18n/health_scan_labels.json)
  3. TG13 中文 Wiki 常用叫法（保留在 `ReagentDef.aliases` 中以便检索）
- **关键已对齐权威译名示例**：
  - `Syriniver` → `木泰尔`、`Libital` → `利比特`、`Helbital` → `赫比妥`、`Probital` → `益生泰尔`
  - `Granibitaluri` → `格兰尼比塔卢里`、`Neurine` → `神经碱`、`Nanotrasen` → `纳米传讯`、`Stasis` → `静滞`
  - 器官健康扫描状态（来自 `health_scan_labels.json`）：`正常` / `轻微损伤` / `严重损伤` / `无功能`

### 3.6 制药容器、机器与成品获取（上游检索缓存）

- [patch.dm](file:///home/yahvk/Tianguan13/code/modules/reagents/reagent_containers/patch.dm)：`/obj/item/reagent_containers/applicator/patch`（上限 `40u`）默认挂载 `/datum/embedding/med_patch`（`transfer_per_second = 0.75`，每 tick `trans_to(owner, 0.75, PATCH)` 按容器内各组分含量比例同时缓释总计 `0.75u`，静滞暂停）；全库唯一绑定 `/datum/embedding/med_patch/instant` 即时一次性释放全部药量的物品是预制 `patch/synthflesh`（`20u` 100% 纯度合成肉）。
- [pill.dm](file:///home/yahvk/Tianguan13/code/modules/reagents/reagent_containers/pill.dm)：`/obj/item/reagent_containers/applicator/pill` 单颗上限 `volume = 50`（`50u`），口服进入胃部消化。
- [code/_globalvars/lists/reagents.dm](file:///home/yahvk/Tianguan13/code/_globalvars/lists/reagents.dm)：`GLOB.reagent_containers[CAT_PATCHES]` 仅包含 `/obj/item/reagent_containers/applicator/patch/style`（全部继承缓释基类），ChemMaster 与压药机均不能打印任意药物的即时贴片。
- [chem_master.dm](file:///home/yahvk/Tianguan13/code/modules/reagents/chemistry/machinery/chem_master.dm)：`ChemMaster 3000` 可将缓冲区药液分装打印为 `CAT_PATCHES`（缓释贴片）以及药丸、药瓶、针管等容器。
- [pill_press.dm](file:///home/yahvk/Tianguan13/code/modules/plumbing/plumbers/pill_press.dm)：`Chemical Press`（`/obj/machinery/plumbing/pill_press`）接入化学管道后，可设置单份容量并在 `CAT_PATCHES` 类别下自动批量压制缓释贴片。
- [medkit.dm](file:///home/yahvk/Tianguan13/code/game/objects/items/storage/medkit.dm) & [medical.dm](file:///home/yahvk/Tianguan13/code/modules/vending/medical.dm)：`/obj/item/storage/medkit/advanced`（高级急救箱，含 `3` 张预制合成肉即时贴片）可在 `NanoMed Plus` 的 `premium` 栏位购买。
- [lizard_gas.dm](file:///home/yahvk/Tianguan13/modular_zubbers/code/game/machinery/lizard_gas.dm) & [deforest_brand_bioregen_designs.dm](file:///home/yahvk/Tianguan13/modular_zubbers/code/modules/research/designs/deforest_brand_bioregen_designs.dm)：`DeForest Brand Bio-Regenerator`（`/obj/machinery/biogenerator/lizard_gas_medvendor`）可消耗 `500 biomass` 打印预制 `patch/synthflesh`。

### 3.7 药物过敏、呕吐与化学过敏突变（上游检索缓存）

- [allergic.dm](file:///home/yahvk/Tianguan13/code/datums/quirks/negative_quirks/allergic.dm) & [modular_zubbers/.../allergies.dm](file:///home/yahvk/Tianguan13/modular_zubbers/code/datums/quirks/negative_quirks/allergies.dm)：
  - `/datum/quirk/item_quirk/allergic`（极端药物过敏）：挂载 `COMSIG_MOB_REAGENT_TICK` 信号回调 `block_metab`，从 `/datum/reagent/medicine` 排除 `GLOB.allergy_reagent_blacklist` 后随机抽取 6 种过敏原（注意 `granibitaluri` 上游定义为 `/datum/reagent/medicine/granibitaluri`，不在 `/c2` 黑名单子树下）。
  - 若体内存在 `/datum/reagent/medicine/epinephrine`（肾上腺素），返回 `COMSIG_MOB_STOP_REAGENT_METABOLISM`（跳过过敏毒素/组胺与自身代谢消耗，但 `on_mob_life` 与过量判定照常执行）。
  - 若无肾上腺素：每 tick 追加 `3 * dt` 毒素（6 tox）并注入 `3 * dt` 组胺（6u `/datum/reagent/toxin/histamine`），同时有 `SPT_PROB(10, dt)`（约 19%/tick）触发 `vomit(VOMIT_CATEGORY_DEFAULT)` 及从 `list(ORGAN_SLOT_BRAIN, ORGAN_SLOT_APPENDIX, ORGAN_SLOT_LUNGS, ORGAN_SLOT_HEART, ORGAN_SLOT_LIVER, ORGAN_SLOT_STOMACH)` 6 选 1 造成 `+10` 器官损伤。
- [body.dm](file:///home/yahvk/Tianguan13/code/datums/mutations/body.dm)：
  - `/datum/mutation/chemical_allergy`（化学过敏基因突变）：在 `on_life` 中检测血液内是否存在属于 `medicine/drug` 且不在 `GLOB.allergy_reagent_blacklist` / `mannitol` / `mutadone`、且 `reagent.metabolizing && reagent.volume >= 1` 的危险试剂；满足时以 `SPT_PROB(80, dt)` 为总门控，独立判定 `33%`（disgust 上限 100 `+24`、tox `+pick(2,3,4)`）、`12%`（jitter/dizzy `+6`、blood_volume 按 `BLOOD_VOLUME_OKAY = 392u` 下限扣 `pick(12,16,20,24)`）、`6%`（confusion `+4`、`losebreath >= 4`），不受肾上腺素阻断。
- [carbon.dm](file:///home/yahvk/Tianguan13/code/modules/mob/living/carbon/carbon.dm)、[turf.dm](file:///home/yahvk/Tianguan13/code/game/turfs/turf.dm) & [mobs.dm](file:///home/yahvk/Tianguan13/code/__DEFINES/mobs.dm)：
  - `/mob/living/carbon/proc/vomit`（`VOMIT_CATEGORY_DEFAULT` 非空腹/非纯吐血路径）降低 `tox` `3` 点并调用 `/turf/proc/add_vomit_floor` → `clear_reagents_to_vomit_pool`，按 `purge_ratio = 0.1` 转出胃内 10% 溶液，并对非食物试剂额外移除至多 `10u`；`mobs.dm` 定义 `BLOOD_VOLUME_OKAY`（`560 * 0.7 = 392`）与 `DISGUST_LEVEL_VERYDISGUSTED = 100`。
- [toxin_reagents.dm](file:///home/yahvk/Tianguan13/code/modules/reagents/chemistry/reagents/toxin_reagents.dm)、[anaphylaxis.dm](file:///home/yahvk/Tianguan13/code/datums/diseases/anaphylaxis.dm)、[food_allergy.dm](file:///home/yahvk/Tianguan13/code/datums/quirks/negative_quirks/food_allergy.dm)、[health_analyzer.dm](file:///home/yahvk/Tianguan13/code/game/objects/items/devices/scanners/health_analyzer.dm) & [smartdarts.dm](file:///home/yahvk/Tianguan13/modular_skyrat/modules/medical/code/smartdarts.dm)：
  - `/datum/reagent/toxin/histamine` 组胺及 `/datum/reagent/toxin/mindbreaker` 路径；`/datum/disease/anaphylaxis` 属于食物过敏引发的 3 阶段疾病；医疗扫描仪 `health_analyzer` 与智能毒镖 `smartdarts` 读取 `quirk/allergic` 列表展示过敏警示。

---

## 4. 仿真引擎关键规则与公式速查

### 4.1 12 步 Tick 主循环（`dt = 2s`，见 [simulator.ts](file:///home/yahvk/ss13-chem-sim/src/engine/simulator.ts) 中 `runSimulation`）

1. **计划给药投递**：在 `startTime <= time` 时按方式入体（同 `patchGroup` 的复合贴片合入单个 `activeTransfers` 条目，连同独立 `PATCH` 共以每 tick `0.75u` 速率入血；`IV_DRIP` 按 `ivRate` 滴注；`INJECT / INGEST / TOUCH / VAPOR` 即时投递，其中 `INGEST` 进入胃部，接触/蒸气按防护率换算吸收）并运行体内反应。
   1b. **活跃缓释处理**：复合贴片按各组分当前余量比例分摊本 tick `0.75u` 释放总量后再运行体内反应；`PATCH` 在静滞模式下暂停；`IV_DRIP` 不受静滞暂停；余量 `< 0.01u` 移除。
2. **胃部排空至血液**（非静滞、未死亡、胃未衰竭时）：
   `amount = min((roundStep(0.05 * stomachVol, 0.05) + max(metabRate, 0.25)) * dt, stomachVol)`
   转入血液并立即触发体内化学反应（注意胃转血以 `creationPurity` 且 `isLivingHolder = false` 加入血液）。
3. **奇异试剂延迟复活判定**：尸体在满足外伤上限且未焦尸时倒计时 4 ticks 复活。
4. **血温平衡与试剂代谢**：
   - `chemTemp += (bodyTemp - chemTemp) * 0.25`
   - 静滞仅运行 `ignoreStasis` 试剂；死亡仅运行 `deadProcess` 试剂；
   - 活体下若毒素总存量 `<= toxTolerance * liverHealthPct * liverToleranceMultiplier` 则被肝脏安全清除不生效；
   - 毒素伤肝增量：`min(totalToxinLiverDmg * dt, 2 * dt)`（非机械肝时有效）；
   - 代谢速度：`REAGENTS_METABOLISM = 0.2 u/s`（基础 `0.4 u/tick`），`ratio = REM * metabolizedVol`（`REM = 2.5`）；药物通常设为 `reverseMetabolism = true`（代谢效率 `metabolismEfficiency` 越低，实际代谢量反而按 `/ efficiency` 升高）；
   - **极端药物过敏钩子**（位于 `liverless` 判断前，对应 `COMSIG_MOB_REAGENT_TICK`）：命中 `patient.allergies` 时，若血液含肾上腺素则暂停过敏伤害与消耗；否则每 tick `+3 * dt` 毒素、`+3 * dt` 组胺并按 `19%/tick` 模拟呕吐（`-3` 毒并排胃）与 6 内脏池随机 `+10` 伤（含未建模阑尾空掷）。
   - **粘滞过量**：达到缩放后过量阈值即标记 `overdosed = true`，后续即使浓度降到阈值以下仍持续执行 `overdoseProcess` 直至清除。
   - **Step 4b 化学过敏基因突变**：启用 `chemicalAllergy` 时，遍历体内正在代谢且存量 `>= 1u` 的非豁免药物（不受肾上腺素阻断），按 `80%` 总门控与 `33%/12%/6%` 概率施加毒素、失血（下限 `392u`）与失呼吸。
5. **冷冻/火场伤口计数器推进**：中度伤口阈值 `33`、重度 `66`、危重 `99`，达标后减少对应伤口腔数量并按比例降低出血流速。
6. **器官被动恢复与肝/心衰竭惩罚**：正常器官按 `0.0005 * maxHealth * dt` 自愈；无肝或肝衰竭（分 60/120/180/240s 阶梯）持续产生毒素与跨器官损伤（可用 `海加德` 提供的 `TRAIT_STABLELIVER` 抵消）；心脏衰竭且无 `TRAIT_STABLEHEART` 引发心脏骤停。
7. **呼吸周期与危急窒息**：基础每 4 ticks 呼吸 1 次（肺/心重伤各自缩短周期），`HARD_CRIT` / 肺衰竭 / 真空导致缺氧恶化，`STABLE` 每次正常呼吸恢复 `5` 窒息。
8. **血液生成与失血**：正常血量 `560u`，生存下限 `112u`（20%）；盐水葡萄糖溶液按 `1u → 5u` 提供有效代偿血量；有效血量不足会持续引起失血性窒息。
9. **体表温与核心温传导**：`cryo` 环境直接向环境温度平滑逼近而不产生冻伤；非冷冻状态下按对数温差方程传导，火焰层数同时升温并造成烧伤。
10. **辐射持续毒素**：开启辐射且无防护特性（碘化钾/喷替酸）时每 tick `+1.0 tox`。
11. **耐力 10 秒重置与 Stamcrit**：本 tick 未受耐力冲击时累计 `timeSinceStaminaDamage`，满 `10s` 清零耐力；未保护状态下耐力达 `100` 进入 `stamcrit` 并缓冲 `+30`（上限 `120`）。其余负状态按秒衰减。
12. **终末 HP 与状态评级判定**：`HP = 100 - brute - burn - tox - oxy`；`<= 0` 为 `SOFT_CRIT`，`<= -30` 为 `HARD_CRIT`，`<= -100` 或大脑伤害 `>= 200` 或有效血量 `<= 112` 为 `DEAD`。

### 4.2 入体纯度反相与过量缩放（见 [simulator.ts](file:///home/yahvk/ss13-chem-sim/src/engine/simulator.ts) 中 `addToHolder`、[reagents.ts](file:///home/yahvk/ss13-chem-sim/src/engine/reagents.ts) 中 `computeEffectiveOD`）

- 当 `isLivingHolder && purity < 1 && inverseChemVal > 0 && purity < inverseChemVal` 时，入体直接按 `invPurity = min(1 - inverseChemVal + purity + 0.01, 1)` 转化为对应 `inverseChemId`。
- 实际过量阈值：`max(0, overdoseThreshold + (purity - defaultPurity) * overdoseThreshold)`（因此 75% 基准药物提升到 100% 纯度时，实际 OD 阈值上浮 25%）。

---

## 5. 内置试剂总览（见 [reagents.ts](file:///home/yahvk/ss13-chem-sim/src/engine/reagents.ts)）

- **`c2` 核心治疗**：`libital(利比特)`, `helbital(赫比妥)`, `probital(益生泰尔)`, `aiuri(艾尤里)`, `lenturi(伦图里)`, `hercuri(赫丘利)`, `granibitaluri(格兰尼比塔卢里)`, `synthflesh(合成肉)`, `multiver(多功能解毒剂)`, `seiver(赛维尔)`, `syriniver(木泰尔)`, `musiver(穆西弗)`, `tirimol(特里莫尔)`, `convermol(肯尔莫)`, `penthrite(彭斯莱特)`
- **`superior` 高级治疗**：`sal_acid(水杨酸)`, `oxandrolone(奥沙雄龙)`, `salbutamol(沙丁胺醇)`, `albuterol(沙丁胺醇（吸入型）)`, `regen_jelly(再生果冻)`, `pen_acid(喷替酸)`, `atropine(阿托品)`, `calomel(甘汞)`, `ammoniated_mercury(氨化汞)`, `cryoxadone(冰晶沙酮)`, `pyroxadone(吡洛沙酮)`, `rezadone(瑞扎酮)`
- **`unique` 独特 / 器官 / 止血**：`mannitol(甘露醇)`, `neurine(神经碱)`, `mutadone(突变酮)`, `potass_iodide(碘化钾)`, `salglu_solution(盐水葡萄糖溶液)`, `ephedrine(麻黄碱)`, `diphenhydramine(苯海拉明)`, `oculine(明目素)`, `inacusiate(复聪剂)`, `epinephrine(肾上腺素)`, `antihol(安替霍尔)`, `insulin(胰岛素)`, `strange_reagent(奇异试剂)`, `synaptizine(突触嗪)`, `synaphydramine(双苯突触嗪)`, `spaceacillin(太空西林)`, `mine_salve(矿工药膏)`, `modafinil(莫达非尼)`, `morphine(吗啡)`, `haloperidol(氟哌啶醇)`, `leporazine(莱波拉嗪)`, `higadrite(海加德)`, `psicodine(赛可定)`, `coagulant(血石)`, `seraka_extract(塞拉卡提取物)`, `banana_peel(捣烂的香蕉皮)`, `determination(决心)`, `ondansetron(昂丹司琼)`, `naloxone(纳洛酮)`, `lidocaine(利多卡因)`, `sansufentanyl(三氟芬太尼)`, `inaprovaline(伊纳普罗瓦林)`
- **`special` 特殊 / 不可制作**：`omnizine(万灵素)`, `protozine(原质素)`, `godblood(神血)`, `honey(蜂蜜)`, `earthsblood(大地之血)`, `silibinin(水飞蓟宾)`, `polypyr(聚吡喃鎓低聚物)`, `metafactor(有丝分裂素代谢因子)`, `muscle_stimulant(肌肉兴奋剂)`, `cordiolis_hepatico(科迪奥利斯肝心素)`, `stimulants(兴奋剂)`, `syndicate_nanites(修复纳米机器人)`, `changelingadrenaline(变形怪肾上腺素)`, `changelinghaste(变形怪加速)`, `adminordrazine(阿德米诺德嗪)`
- **`inverse` 逆试剂 / 杂质**：`libitoil(力比多油)`, `helgrasp(赫尔之握)`, `aivime(艾维姆)`, `lentslurri(伦茨卢里)`, `herignis(赫里格尼斯)`, `monover(莫诺维尔)`, `technetium(锝99)`, `super_melatonin(超级褪黑素)`, `coveroli(可维罗利)`, `nooartrium(努阿特姆)`, `benzoic_acid(苯甲酸)`, `oxymetholone(羟甲烯龙)`, `bamethan(巴美坦)`, `pendetide(彭德泰德)`, `hyoscyamine(莨菪碱)`, `ammoniated_sludge(氨化污泥)`, `inreziniver(因雷齐尼韦)`, `neruwhine(内鲁瓦因)`, `corazargh(科拉扎尔格)`, `oculater(奥库莱特)`, `tinacusiate(蒂纳库西亚特)`, `prohol(普罗霍尔)`, `lidopaine(利多巴因)`, `sepsisillin(败血西林)`, `probital_failed(代谢抑制因子)`, `peptides_failed(朊病毒肽)`, `toxic_monomers(有毒单体)`
- **`helper` 对照毒素 / 食物 / 溶剂**：`nutriment(营养物)`, `peptides(肽)`, `toxin(毒素)`, `amatoxin(鹅膏毒肽)`, `anacea(安纳西)`, `lexorin(莱克索林)`, `histamine(组胺)`, `mindbreaker(碎心者毒素)`, `ethanol(乙醇)`, `sugar(糖)`, `water(水)`

---

## 6. 扩展指引、已知坑点与设计决策

- **新增一种试剂**：先在对应上游 `.dm` 文件与 [glossary.zh-Hans.json](file:///home/yahvk/Tianguan13/tools/i18n/mt/glossary.zh-Hans.json) 中核对参数与译名，然后在 [src/engine/reagents.ts](file:///home/yahvk/ss13-chem-sim/src/engine/reagents.ts) 中追加 `ReagentDef`（若含低纯度逆产物，需同步添加 `inverse` 类别条目并设定 `inverseChemVal` / `inverseChemId`），最后**仅在 [src/engine/scenarioShare.ts](file:///home/yahvk/ss13-chem-sim/src/engine/scenarioShare.ts) 的 `REAGENT_SHARE_ORDER` 末尾追加该试剂 ID**（保持既有槽位索引不变，以确保既有 `#s=` 分享链接永久有效）。新增后界面上的药理选择器（`REAGENT_LIST`）、图鉴、颜色映射和 URL 分享编解码会自动生效。
- **新增体内即时反应**：编辑 [src/engine/reactions.ts](file:///home/yahvk/ss13-chem-sim/src/engine/reactions.ts) 的 `runInBodyReactions(ctx)`；如果是危险爆炸/毒性反应，调用 `ctx.addEvent('danger', 'reaction', ...)` 即可被 [SummaryStrip.tsx](file:///home/yahvk/ss13-chem-sim/src/components/SummaryStrip.tsx) 的 KPI 警报卡自动统计。
- **坑点 1（`deadProcess` 与初始 `DEAD` 状态）**：缺乏 `REAGENT_DEAD_PROCESS` 的药物（如 `cryoxadone` 冰晶沙酮）在 `stat === 'DEAD'`（HP <= -100）时**不会代谢**。测试低温急救时初始总伤害需小于 `200`（保证处于活体危重状态），否则冷冻舱不会触发治疗与伤口计数推进。
- **坑点 2（有益反应 vs 危险反应警报区分）**：`SimSummary` 中用 `triggeredDangerReactions`（仅统计 `severity === 'danger'` 且 `category === 'reaction'`）与 `triggeredReactions` 区分，避免把益生泰尔催化生成治疗肽等正常生理转换误判为风险警报，同时确保彭斯莱特爆炸在 KPI 第 5 卡明确标红。
- **坑点 3（1280px 桌面视口三栏与状态胶囊）**：`src/styles/index.css` 中三栏采用 `320px minmax(420px, 1fr) 320px` 且媒体查询断点设在 `@media (max-width: 1180px)`，保证带纵向滚动条的 `1280×800` 浏览器不会意外把右栏挤到底部；`.stat-badge` 必须保留 `white-space: nowrap; flex-shrink: 0;` 防止中文徽章跨行截断。
- **坑点 4（严格 TS 编译约束）**：[tsconfig.json](file:///home/yahvk/ss13-chem-sim/tsconfig.json) 开启了 `noUnusedLocals` 与 `noUnusedParameters`，未使用的参数（如 `overdoseProcess` 中的 `dt`）必须前缀 `_`。
- **预留未来扩展方向（当前尚未纳入范围）**：烧杯加药合成 / pH 与反应热计算（对应 `chemistry/recipes/*.dm`）、传染病/病毒进度曲线、呼吸系统吸入气溶胶混合模拟（`atmos_gas_reagents.dm`）。

---

## 7. 开发日志（Devlog）

### 2026-11-23 — 迭代与核验记录
- **引擎构建**：对照 `~/Tianguan13` 实现 12 步 Tick 仿真引擎、体内即时反应（彭斯莱特爆炸、益生泰尔催化治疗肽）、肝脏毒素耐受与器官衰竭机制，并录入核心医疗与杂质试剂。
- **汉化对齐**：优先对齐 `glossary.zh-Hans.json`、`zh-Hans/tgui.json`、`zh-Hans/datum.json`、`health_scan_labels.json` 译名，并补充 TG13 Wiki 别名搜索。
- **结构规范与文档落地**：新增 [DEV_INDEX.md](file:///home/yahvk/ss13-chem-sim/DEV_INDEX.md) 汇总上游源码/汉化路径、引擎公式与试剂目录，并写入工作区 [AGENTS.md](file:///home/yahvk/ss13-chem-sim/AGENTS.md)。
- **验证基线（最新修改后均通过）**：
  - `bun run test`：全部测试用例通过
  - `bun run typecheck`：0 错误
  - `bun run build`：生产构建成功
  - 浏览器实机（`1440×900` 与 `1280×800`）：控制台 0 报错，加药搜索、SVG 图表交互与回放、事件日志跳转、药理图鉴及危险警报卡片均正常渲染。
- **贴片与上游缓存同步**：给药方式对齐 ChemMaster / 管道压药机行为（`PATCH` 速率 `0.75u/t`，合成肉默认 `TOUCH`），并补全贴片与制药机器的上游检索缓存至第 3.6 节。
- **给药组合方案存档功能**：新增 [regimenStorage.ts](file:///home/yahvk/ss13-chem-sim/src/engine/regimenStorage.ts) 并扩展 [RegimenPanel.tsx](file:///home/yahvk/ss13-chem-sim/src/components/RegimenPanel.tsx)，支持仅针对给药组合（`DoseEvent[]`）的 `localStorage` 本地存档（命名/自动命名保存、替换加载、追加合并、同名或指定覆盖、删除）以及剪贴板/文件 JSON 导入导出。
- **统一药品图鉴与选药库及特征筛选升级**：统一收敛全库 `targets` 为规范特征词表（`EFFECT_TRAITS` + `逆产物`），并在 [reagents.ts](file:///home/yahvk/ss13-chem-sim/src/engine/reagents.ts) 导出 `getReagentTraits` 自动派生机制安全特征（`治疗药物`、`无过量(无OD)`、`有过量(OD)`、`有逆反应`、`无肝可代`、`死后生效`、`毒素/有害`、`逆产物`）；顶栏「药品图鉴」、给药面板「添加药品」与药卡详参入口共用统一的 [HandbookModal.tsx](file:///home/yahvk/ss13-chem-sim/src/components/HandbookModal.tsx)，支持机制安全 + 作用特征多选交集筛选、逆产物直跳、代谢/OD 排序及 `+ 加入`（含「加入后关闭」开关与 `Esc` 关闭）。
- **药物过敏模拟与图鉴「无过敏」特征**：依据 `allergic.dm`、`body.dm`、`carbon.dm` 与 `turf.dm` 完整实现「极端药物过敏」（肾上腺素阻断并暂停消耗、停药恢复爆发、6 毒/6u 组胺/t、呕吐清 3 毒排胃及 6 内脏池 1/6 损伤期望/随机判定）与「化学过敏」基因突变；患者面板新增「药物过敏与免疫异常」折叠区（支持按上游合规池随机抽 6 种与全库沙盒自选），给药方案、切片检视、KPI 警报与事件日志全面联动告警；图鉴与选药库 `MECHANISM_TRAITS` 与特性标签同步加入 `无过敏` 筛选，并将 `/home/yahvk/Tianguan13` 新查路径缓存写回第 3.7 节。
- **场景 URL 分享/导入与纯文本配方导出**：应用默认以干净空白场景启动，新建 [scenarioShare.ts](file:///home/yahvk/ss13-chem-sim/src/engine/scenarioShare.ts) 与 [ScenarioShareModal.tsx](file:///home/yahvk/ss13-chem-sim/src/components/ScenarioShareModal.tsx) 实现 `#s=` 紧凑二进制位图 + 稳定试剂索引表 Base64URL 场景分享、自动加载及导入重置；并在 [regimenStorage.ts](file:///home/yahvk/ss13-chem-sim/src/engine/regimenStorage.ts) 与 [RegimenPanel.tsx](file:///home/yahvk/ss13-chem-sim/src/components/RegimenPanel.tsx) 新增「导出纯文本配方」抽屉及存档卡片快捷复制按钮（支持多行清单与单行紧凑格式切换及 `.txt` 下载）。
- **合并贴片仿真与菜谱式纯文本配方导出**：在 [constants.ts](file:///home/yahvk/ss13-chem-sim/src/engine/constants.ts)、[types.ts](file:///home/yahvk/ss13-chem-sim/src/engine/types.ts)、[simulator.ts](file:///home/yahvk/ss13-chem-sim/src/engine/simulator.ts)、[scenarioShare.ts](file:///home/yahvk/ss13-chem-sim/src/engine/scenarioShare.ts) 与 [RegimenPanel.tsx](file:///home/yahvk/ss13-chem-sim/src/components/RegimenPanel.tsx) 实现 `patchGroup` 合并贴片（同一贴片 ≤40u、避开彭斯莱特禁忌组合、按比例共享 `0.75u/tick` 释放及一键自动合片/分摊速率显示）；重构 `formatRegimenPlainText` 为直接面向容器配制与施药步骤的菜谱结构，自动合并同时间贴片（≤40u）与口服药丸（≤50u），单步骤省略时间并补全 [pill.dm](file:///home/yahvk/Tianguan13/code/modules/reagents/reagent_containers/pill.dm) 上游缓存至第 3.6 节。
- **文档与开源协议**：新增 [README.md](file:///home/yahvk/ss13-chem-sim/README.md) 并从 `/usr/share/licenses/spdx/AGPL-3.0-or-later.txt` 复制生成 [LICENSE](file:///home/yahvk/ss13-chem-sim/LICENSE)。
- **关于（About）弹窗**：新增 [AboutModal.tsx](file:///home/yahvk/ss13-chem-sim/src/components/AboutModal.tsx) 并在 [HeaderBar.tsx](file:///home/yahvk/ss13-chem-sim/src/components/HeaderBar.tsx) / [App.tsx](file:///home/yahvk/ss13-chem-sim/src/App.tsx) 接入「关于」入口，说明功能、上游 Tianguan13 来源并提供 GitHub 源码与 Wiki 链接。

### 2026-11-24 — Nix Flake 部署支持
- **Nix Flake 打包与开发环境**：新增 [flake.nix](file:///home/yahvk/ss13-chem-sim/flake.nix)、[flake.lock](file:///home/yahvk/ss13-chem-sim/flake.lock) 与 [bun.nix](file:///home/yahvk/ss13-chem-sim/bun.nix)（基于 `bun2nix` PR #110 固定 commit 支持 `lockfileVersion: 2`），提供 `packages.default`（直接输出 `dist/` 静态文件根目录供 Nginx 等托管）、`devShells.default`（包含 `bun` 与 `bun2nix`）与 `nixosModules.default`（声明式配置 `services.ss13-chem-sim` 挂载到 `services.nginx.virtualHosts`，支持根路径与子路径）。
- **锁文件源对齐**：使用默认源（`registry.npmjs.org`）刷新 [bun.lock](file:///home/yahvk/ss13-chem-sim/bun.lock) 并同步更新 [bun.nix](file:///home/yahvk/ss13-chem-sim/bun.nix)，确保 Nix 沙盒离线缓存命中；在 [.gitignore](file:///home/yahvk/ss13-chem-sim/.gitignore) 忽略 `result` / `result-*`。
- **验证**：`nix build`、`bun run test`、`bun run typecheck`、`bun run build` 均通过。

### 2026-11-25 — 图表稳定与纯度影响说明/标签
- **图 2 Y 轴悬停防跳变**：[TimelineCharts.tsx](file:///home/yahvk/ss13-chem-sim/src/components/TimelineCharts.tsx) 中 `maxReagentVol` 仅依据实际血液与胃内峰值定界，悬停高过量阈值药物时保持 Y 轴固定并在超限时于顶边提示 OD 值。
- **全库纯度影响说明与「纯度无关效果」标签**：在 [reagents.ts](file:///home/yahvk/ss13-chem-sim/src/engine/reagents.ts) 为所有纯度敏感试剂的 `mechanicsNoteZh` 补全纯度作用详情并修正满纯 OD 数值，清理描述中与表格列重复的静态数值和自身逆反应描述（保留定性的代谢快慢提示）；同时导出 `PURITY_DEPENDENT_EFFECT_IDS` 与 `isPurityIndependentEffect`，为全库效果不受自身纯度影响的试剂（81 种）打上 `纯度无关效果` 标签，接入 [HandbookModal.tsx](file:///home/yahvk/ss13-chem-sim/src/components/HandbookModal.tsx) 机制安全筛选与药卡标签及 [RegimenPanel.tsx](file:///home/yahvk/ss13-chem-sim/src/components/RegimenPanel.tsx) 悬浮提示。
- **验证**：`bun run test`、`bun run typecheck`、`bun run build` 均通过。
