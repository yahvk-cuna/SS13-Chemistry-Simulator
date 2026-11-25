import { BookOpen, Dices, FlaskConical, Info, Link2, Pin, PinOff, RotateCcw } from 'lucide-react';
import { SCENARIO_DURATIONS } from '../engine/scenarioShare';
import type { RngMode } from '../engine/types';
import { NumericInput } from './NumericInput';

interface HeaderBarProps {
  durationSeconds: number;
  onDurationChange: (sec: number) => void;
  rngMode: RngMode;
  onRngModeChange: (mode: RngMode) => void;
  seed: number;
  onSeedChange: (seed: number) => void;
  hasBaseline: boolean;
  baselineLabel: string | null;
  onToggleBaseline: () => void;
  onOpenShare: () => void;
  onResetScenario: () => void;
  onOpenHandbook: () => void;
  onOpenAbout: () => void;
}

export function HeaderBar({
  durationSeconds,
  onDurationChange,
  rngMode,
  onRngModeChange,
  seed,
  onSeedChange,
  hasBaseline,
  baselineLabel,
  onToggleBaseline,
  onOpenShare,
  onResetScenario,
  onOpenHandbook,
  onOpenAbout,
}: HeaderBarProps) {
  const durationOptions = SCENARIO_DURATIONS.includes(durationSeconds as (typeof SCENARIO_DURATIONS)[number])
    ? [...SCENARIO_DURATIONS]
    : [...SCENARIO_DURATIONS, durationSeconds].sort((a, b) => a - b);

  return (
    <header className="header-bar">
      <div className="brand-group">
        <div className="brand-badge">
          <FlaskConical size={18} />
        </div>
        <div>
          <div className="brand-title">纳米传讯医疗部 · 天关13 药物代谢与伤势模拟器</div>
          <div className="brand-sub">
            基于 Tianguan13 源码 & TG 中文 Wiki 药理机制（2s / tick · 多药联用 / 纯度逆反应 / 过量 / 器官损伤）
          </div>
        </div>
      </div>

      <div className="header-controls">
        <div className="control-group">
          <span className="control-label">模拟时长</span>
          <select
            className="ui-select mono"
            value={durationSeconds}
            onChange={(e) => onDurationChange(Number(e.target.value))}
            aria-label="模拟时长"
          >
            {durationOptions.map((d) => (
              <option key={d} value={d}>
                {d}s ({d / 2} ticks)
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <span className="control-label">随机模式</span>
          <div className="seg-toggle" role="group" aria-label="随机模式">
            <button
              type="button"
              className={`seg-btn ${rngMode === 'expected' ? 'active' : ''}`}
              aria-pressed={rngMode === 'expected'}
              onClick={() => onRngModeChange('expected')}
            >
              期望曲线
            </button>
            <button
              type="button"
              className={`seg-btn ${rngMode === 'random' ? 'active' : ''}`}
              aria-pressed={rngMode === 'random'}
              onClick={() => onRngModeChange('random')}
            >
              随机种子
            </button>
          </div>
          {rngMode === 'random' && (
            <>
              <NumericInput
                className="ui-input mono"
                style={{ width: 72 }}
                min={1}
                max={9999999}
                integer
                fallback={1}
                value={seed}
                onCommit={onSeedChange}
                ariaLabel="随机种子"
              />
              <button
                type="button"
                className="btn btn-icon"
                style={{ minWidth: 32, minHeight: 32 }}
                title="随机新种子"
                aria-label="随机新种子"
                onClick={() => onSeedChange(Math.floor(Math.random() * 99999) + 1)}
              >
                <Dices size={14} aria-hidden="true" />
              </button>
            </>
          )}
        </div>

        <div className="baseline-group">
          <button
            type="button"
            className={`btn ${hasBaseline ? 'btn-good' : ''}`}
            onClick={onToggleBaseline}
            title="固定当前生命曲线作为虚线对比基准，方便调整剂量后直观对比"
          >
            {hasBaseline ? <PinOff size={14} /> : <Pin size={14} />}
            {hasBaseline ? '清除基准对比' : '固定对比基准'}
          </button>
          {baselineLabel && (
            <span className="baseline-tag mono" aria-live="polite" aria-atomic="true">
              {baselineLabel}
            </span>
          )}
        </div>

        <button
          type="button"
          className="btn"
          onClick={onOpenShare}
          title="打开场景分享与导入弹窗（地址栏 #s=... 随编辑自动同步）"
        >
          <Link2 size={14} aria-hidden="true" />
          分享 / 导入
        </button>

        <button
          type="button"
          className="btn"
          onClick={onResetScenario}
          title="重置为空白场景（0 伤健康患者与空给药方案，支持在提示中撤销）"
        >
          <RotateCcw size={14} aria-hidden="true" />
          重置
        </button>

        <button type="button" className="btn btn-primary" onClick={onOpenHandbook}>
          <BookOpen size={14} />
          药品图鉴
        </button>

        <button type="button" className="btn" onClick={onOpenAbout} title="关于本模拟器、数据来源与源码链接">
          <Info size={14} />
          关于
        </button>
      </div>
    </header>
  );
}
