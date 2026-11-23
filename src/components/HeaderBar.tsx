import { BookOpen, Dices, Download, FlaskConical, Info, Link2, Pin, PinOff, RotateCcw } from 'lucide-react';
import { SCENARIO_DURATIONS } from '../engine/scenarioShare';
import type { RngMode } from '../engine/types';

interface HeaderBarProps {
  durationSeconds: number;
  onDurationChange: (sec: number) => void;
  rngMode: RngMode;
  onRngModeChange: (mode: RngMode) => void;
  seed: number;
  onSeedChange: (seed: number) => void;
  hasBaseline: boolean;
  onToggleBaseline: () => void;
  onShareUrl: () => void;
  onOpenImportUrl: () => void;
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
  onToggleBaseline,
  onShareUrl,
  onOpenImportUrl,
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
          <div className="seg-toggle">
            <button
              type="button"
              className={`seg-btn ${rngMode === 'expected' ? 'active' : ''}`}
              onClick={() => onRngModeChange('expected')}
            >
              期望曲线
            </button>
            <button
              type="button"
              className={`seg-btn ${rngMode === 'random' ? 'active' : ''}`}
              onClick={() => onRngModeChange('random')}
            >
              随机种子
            </button>
          </div>
          {rngMode === 'random' && (
            <>
              <input
                type="number"
                className="ui-input mono"
                style={{ width: 72 }}
                value={seed}
                onChange={(e) => onSeedChange(Number(e.target.value) || 1)}
                aria-label="随机种子"
              />
              <button
                type="button"
                className="btn btn-icon"
                title="随机新种子"
                onClick={() => onSeedChange(Math.floor(Math.random() * 99999) + 1)}
              >
                <Dices size={14} />
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          className={`btn ${hasBaseline ? 'btn-good' : ''}`}
          onClick={onToggleBaseline}
          title="固定当前生命曲线作为虚线对比基准，方便调整剂量后直观对比"
        >
          {hasBaseline ? <PinOff size={14} /> : <Pin size={14} />}
          {hasBaseline ? '清除基准对比' : '固定对比基准'}
        </button>

        <button
          type="button"
          className="btn"
          onClick={onShareUrl}
          title="将当前场景写入地址栏 #s=... 并复制分享链接"
        >
          <Link2 size={14} />
          分享链接
        </button>

        <button
          type="button"
          className="btn"
          onClick={onOpenImportUrl}
          title="粘贴他人分享的场景 URL 或编码并导入"
        >
          <Download size={14} />
          导入链接
        </button>

        <button
          type="button"
          className="btn"
          onClick={onResetScenario}
          title="重置为空白场景（0 伤健康患者与空给药方案）并清除 URL 参数"
        >
          <RotateCcw size={14} />
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
