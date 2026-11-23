# Tianguan13 / SS13 药物代谢与伤势模拟器 — Agent 工作区规则

本文件由工作区根目录自动加载，适用于 `/home/yahvk/ss13-chem-sim` 下所有对话与子代理。

## 1. 先对齐方案再动手（人类主导决策）

- **方案未确认前禁止直接开写**：无论是新建功能/页面/模块还是较大范围修改，只要涉及以下任一未由用户明确指定的决策点，**必须先提出关键决策点、可选方案与权衡取舍，等待用户明确确认后再开始编写代码**：
  1. 技术栈、第三方依赖引入或构建方式变更；
  2. 模块架构拆分与核心数据模型调整；
  3. 药理模拟范围、精度粒度或简化取舍（如是否包含烧杯合成、病毒、气体吸入、某类试剂收录范围等）；
  4. 显著的 UI 布局、交互流程或视觉形态改动。
- **不要因用户使用祈使句就擅自全盘拍板**：当需求描述仍较宽泛时，先提问/汇报计划并等用户拍板，再进入编码实现。仅当细节已由用户明确指定、或属于既定方案内的小范围修补时，才直接修改代码。

## 2. 上手必读开发索引（禁止盲目全库搜索）

- **第一步先读 [DEV_INDEX.md](file:///home/yahvk/ss13-chem-sim/DEV_INDEX.md)**：在阅读代码、修改药理逻辑或查询 `/home/yahvk/Tianguan13` 上游源码前，必须先读取 `DEV_INDEX.md`。
- `DEV_INDEX.md` 已记录本项目的模块目录、上游 `/home/yahvk/Tianguan13` 中已验证存在的 `.dm` / `.json` 精确路径（包含 `atmospherics/`、`impure_reagents/`、`drinks/`、`food_and_drinks/`、`living/blood.dm` 等非直观子目录）、12 步 Tick 主循环顺序、内置试剂 ID、预设场景以及已知坑点。
- 查询上游机制或添加新药物时，直接依据 `DEV_INDEX.md` 第 3 节列出的精确路径定范围读取，避免对 `~/Tianguan13` 发起大规模全仓库扫描。

## 3. 变更后同步维护 `DEV_INDEX.md`

在完成功能开发、Bug 修复或药理参数调整的收尾阶段，务必按以下清单同步更新 [DEV_INDEX.md](file:///home/yahvk/ss13-chem-sim/DEV_INDEX.md)：

1. **目录与文件变更**：新增、删除或重命名源码文件（或显著改动核心导出符号）时，更新 **第 2 节** 目录索引（通过文件路径与导出符号定位，**不要写具体行数或 `#L` 行号锚点**）。
2. **药理与数据变更**：新增、删除或调整试剂、体内反应、预设场景、核心公式或 Tick 顺序时，更新 **第 4 节**（引擎规则）与 **第 5 节**（试剂分类列表 / 预设列表）。
3. **上游路径与基准更新**：新引用到未收录的 `~/Tianguan13` 文件时，将其精确路径补入 **第 3 节**；若依据更新后的 `~/Tianguan13` 提交同步参数，同步更新 **第 1 节** 的基准 commit hash。
4. **坑点与开发日志**：遇到新的隐含约束或定位到边界问题（如 `deadProcess`、响应式断点、KPI 统计口径等），写入 **第 6 节**；每次实质性改动后，在 **第 7 节（Devlog）** 按日期追加变更摘要与通过情况。
5. **禁止写入高易变数据**：不要向 `DEV_INDEX.md` 写入文件行数、源码行号锚点（`#L...`）、测试/构建耗时、打包模块数或依赖补丁版本号等高频变动信息，避免每次小改都失真。

## 4. 项目规范与验证要求

- **中文术语优先级**（严格遵循）：
  1. `/home/yahvk/Tianguan13/tools/i18n/mt/glossary.zh-Hans.json`
  2. `/home/yahvk/Tianguan13/strings/i18n/zh-Hans/tgui.json`、`/home/yahvk/Tianguan13/strings/i18n/zh-Hans/datum.json`、`/home/yahvk/Tianguan13/strings/i18n/health_scan_labels.json`
  3. TG13 中文 Wiki 常用译名（将其余别名放入 `ReagentDef.aliases` 以保持检索可达）。
- **TypeScript 严格检查**：[tsconfig.json](file:///home/yahvk/ss13-chem-sim/tsconfig.json) 开启了 `strict`、`noUnusedLocals`、`noUnusedParameters`，未使用的回调参数需加 `_` 前缀。
- **修改后必跑验证**：完成代码修改后运行以下三项并确认全部通过：
  - `npm run test`（`vitest run`）
  - `npm run typecheck`（`tsc --noEmit`）
  - `npm run build`（`tsc -b && vite build`）
