import { BookOpen, Dices, FlaskConical, Info, Link2, Pin, PinOff, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DEFAULT_FIXED_DURATION_SECONDS,
  MAX_DURATION_SECONDS,
  MIN_FIXED_DURATION_SECONDS,
} from '../engine/constants';
import type { RngMode, SimStopReason } from '../engine/types';
import { NumericInput } from './NumericInput';

interface HeaderBarProps {
  durationSeconds: number;
  actualDurationSeconds: number;
  stopReason: SimStopReason;
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
  actualDurationSeconds,
  stopReason,
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
  const isAuto = durationSeconds <= 0;
  const [lastFixedDuration, setLastFixedDuration] = useState<number>(
    durationSeconds > 0 ? durationSeconds : DEFAULT_FIXED_DURATION_SECONDS,
  );

  useEffect(() => {
    if (durationSeconds > 0) {
      setLastFixedDuration(durationSeconds);
    }
  }, [durationSeconds]);

  const stopLabel =
    stopReason === 'dead' ? '死亡终止' : stopReason === 'max_cap' ? '达上限' : '已稳定';
  const stopTagClass =
    stopReason === 'dead'
      ? 'duration-status-tag danger mono'
      : stopReason === 'max_cap'
        ? 'duration-status-tag warn mono'
        : 'duration-status-tag mono';
  const stopTitle =
    stopReason === 'dead'
      ? `自动模拟于 ${actualDurationSeconds}s 确认患者死亡并终止`
      : stopReason === 'max_cap'
        ? `自动模拟已达到 ${MAX_DURATION_SECONDS}s 安全上限（仍未完全稳定）`
        : `自动模拟于 ${actualDurationSeconds}s 达到生理稳态并结束`;

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
          <div className="seg-toggle" role="group" aria-label="模拟时长模式">
            <button
              type="button"
              className={`seg-btn ${isAuto ? 'active' : ''}`}
              aria-pressed={isAuto}
              title="自动运行至药物耗尽且生理稳态（或死亡），最长 1800s"
              onClick={() => {
                if (!isAuto) onDurationChange(0);
              }}
            >
              自动
            </button>
            <button
              type="button"
              className={`seg-btn ${!isAuto ? 'active' : ''}`}
              aria-pressed={!isAuto}
              title={`固定模拟时长（${MIN_FIXED_DURATION_SECONDS}–${MAX_DURATION_SECONDS}s）`}
              onClick={() => {
                if (isAuto) onDurationChange(lastFixedDuration);
              }}
            >
              固定
            </button>
          </div>
          {isAuto ? (
            <span className={stopTagClass} title={stopTitle} aria-live="polite" aria-atomic="true">
              {actualDurationSeconds}s · {stopLabel}
            </span>
          ) : (
            <>
              <NumericInput
                className="ui-input mono"
                style={{ width: 68 }}
                min={MIN_FIXED_DURATION_SECONDS}
                max={MAX_DURATION_SECONDS}
                step={2}
                integer
                fallback={DEFAULT_FIXED_DURATION_SECONDS}
                value={durationSeconds}
                onCommit={(v) =>
                  onDurationChange(
                    Math.min(
                      MAX_DURATION_SECONDS,
                      Math.max(MIN_FIXED_DURATION_SECONDS, Math.round(v / 2) * 2),
                    ),
                  )
                }
                ariaLabel="固定模拟时长（秒）"
                title={`固定模拟时长（${MIN_FIXED_DURATION_SECONDS}–${MAX_DURATION_SECONDS}s，步进 2s）`}
              />
              <span className="control-label mono">s</span>
            </>
          )}
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
