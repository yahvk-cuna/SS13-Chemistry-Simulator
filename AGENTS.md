# Tianguan13 / SS13 药物代谢与伤势模拟器 — Agent 工作区规则

本文件由工作区根目录自动加载，适用于 `/home/yahvk/ss13-chem-sim` 下所有对话与子代理。

## 1. 先对齐方案再动手（人类主导决策）

- **方案未确认前禁止直接开写**：无论是新建功能/页面/模块还是较大范围修改，只要涉及以下任一未由用户明确指定的决策点，**必须先提出关键决策点、可选方案与权衡取舍，等待用户明确确认后再开始编写代码**：
  1. 技术栈、第三方依赖引入或构建方式变更；
  2. 模块架构拆分与核心数据模型调整；
  3. 药理模拟范围、精度粒度或简化取舍（如是否包含烧杯合成、病毒、气体吸入、某类试剂收录范围等）；
  4. 显著的 UI 布局、交互流程或视觉形态改动。
- **不要因用户使用祈使句就擅自全盘拍板**：当需求描述仍较宽泛时，先提问/汇报计划并等用户拍板，再进入编码实现。仅当细节已由用户明确指定、或属于既定方案内的小范围修补时，才直接修改代码。

## 2. 上手必读开发索引与缓存（禁止盲目全库搜索）

- **第一步先读 [DEV_INDEX.md](file:///home/yahvk/ss13-chem-sim/DEV_INDEX.md)**：在阅读代码、修改药理逻辑或查询 `/home/yahvk/Tianguan13` 上游源码前，必须先读取 `DEV_INDEX.md`。该文件同时承担 **上游仓库 `/home/yahvk/Tianguan13` 的持久化检索缓存** 角色。
- `DEV_INDEX.md` 已记录本项目的模块目录、上游 `/home/yahvk/Tianguan13` 中已验证存在的 `.dm` / `.json` 精确路径（包含 `atmospherics/`、`impure_reagents/`、`drinks/`、`food_and_drinks/`、`living/blood.dm` 等非直观子目录）、12 步 Tick 主循环顺序、内置试剂 ID 以及已知坑点。
- 查询上游机制、容器/机器规则或添加新药物时，优先依据 `DEV_INDEX.md` 第 3 节列出的精确路径与符号定范围读取；命中缓存则不再对 `~/Tianguan13` 做全仓库扫描。

## 3. 持续维护与缓存写回 `DEV_INDEX.md`

在完成功能开发、Bug 修复、药理参数调整，以及**任何触发了上游仓库新搜索的对话**收尾阶段，务必按以下清单同步更新 [DEV_INDEX.md](file:///home/yahvk/ss13-chem-sim/DEV_INDEX.md)：

1. **上游仓库搜索结果即查即缓存（命中即写回，问答与编码均适用）**：无论是修改代码还是纯技术问答，只要 `DEV_INDEX.md` 未覆盖某主题而导致你不得不去 `/home/yahvk/Tianguan13` 搜索（如 `grep` / `find` 查找 `.dm` 定义、机器、容器、配方、系统机制等），都必须在完成查阅后，**主动将新验证的文件路径、关键类型/proc 符号与核心结论写入 `DEV_INDEX.md`（优先补入第 3 节）作为永久缓存**，让后续对话直接命中（例外：仅当当前上下文明确禁止写文件且用户未要求更新时延后或先征询确认）。
2. **目录与文件变更**：新增、删除或重命名源码文件（或显著改动核心导出符号）时，更新 **第 2 节** 目录索引（通过文件路径与导出符号定位，**不要写具体行数或 `#L` 行号锚点**）。
3. **药理与数据变更**：新增、删除或调整试剂、体内反应、核心公式或 Tick 顺序时，更新 **第 4 节**（引擎规则）与 **第 5 节**（试剂分类列表）。
4. **上游基准提交更新**：若依据更新后的 `~/Tianguan13` 提交同步参数，同步更新 **第 1 节** 的基准 commit hash。
5. **坑点与开发日志**：遇到新的隐含约束或定位到边界问题（如 `deadProcess`、响应式断点、KPI 统计口径等），写入 **第 6 节**；每次实质性改动后，在 **第 7 节（Devlog）** 按日期追加变更摘要与通过情况。
6. **禁止写入高易变数据**：不要向 `DEV_INDEX.md` 写入文件行数、源码行号锚点（`#L...`）、测试/构建耗时、打包模块数或依赖补丁版本号等高频变动信息，避免每次小改都失真。

## 4. 项目规范与验证要求

- **中文术语优先级**（严格遵循）：
  1. `/home/yahvk/Tianguan13/tools/i18n/mt/glossary.zh-Hans.json`
  2. `/home/yahvk/Tianguan13/strings/i18n/zh-Hans/tgui.json`、`/home/yahvk/Tianguan13/strings/i18n/zh-Hans/datum.json`、`/home/yahvk/Tianguan13/strings/i18n/health_scan_labels.json`
  3. TG13 中文 Wiki 常用译名（将其余别名放入 `ReagentDef.aliases` 以保持检索可达）。
- **统一包管理器与运行器**：本项目的依赖安装、脚本运行与一次性 CLI 执行统一使用 `bun` / `bunx`。
- **删除内容不留痕**：已从项目中删除的功能、选项、工具或命令必须清理干净，不要在代码注释、规则或文档中用“禁止使用 X / 已移除 X / 原先为 X”等方式留下历史痕迹，始终只正面描述现行方案。
- **TypeScript 严格检查**：[tsconfig.json](file:///home/yahvk/ss13-chem-sim/tsconfig.json) 开启了 `strict`、`noUnusedLocals`、`noUnusedParameters`，未使用的回调参数需加 `_` 前缀。
- **修改后必跑验证**：完成代码修改后运行以下三项并确认全部通过：
  - `bun run test`（运行 `vitest run`；注意使用 `bun run test` 而非 `bun test`）
  - `bun run typecheck`（`tsc --noEmit`）
  - `bun run build`（`tsc -b && vite build`）
