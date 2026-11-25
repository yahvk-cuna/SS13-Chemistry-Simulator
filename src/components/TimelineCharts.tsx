import { Pause, Play, RotateCcw } from 'lucide-react';
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { REAGENTS, getDisplayColor } from '../engine/reagents';
import type { OrganSlot, SimResult, TickSnapshot } from '../engine/types';

interface TimelineChartsProps {
  result: SimResult;
  baselineResult: SimResult | null;
  selectedTime: number;
  onSelectTime: (time: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  playSpeed: number;
  onPlaySpeedChange: (speed: number) => void;
  onResetPlay: () => void;
}

const W = 820;
const PAD_L = 44;
const PAD_R = 56;
const PAD_T = 14;
const PAD_B = 26;
const PLOT_W = W - PAD_L - PAD_R;

type ChartId = 'health' | 'reagents' | 'vitals';

interface HoverState {
  time: number;
  chart: ChartId;
  clientX: number;
  clientY: number;
  relX: number;
  rectTop: number;
  rectBottom: number;
  rectLeft: number;
  rectRight: number;
}

type HealthSeriesKey = 'health' | 'brute' | 'burn' | 'tox' | 'oxy' | 'stamina';

const HEALTH_SERIES: { key: HealthSeriesKey; label: string; color: string }[] = [
  { key: 'health', label: '生命值 (HP)', color: '#f8fafc' },
  { key: 'brute', label: '钝伤', color: '#ef4444' },
  { key: 'burn', label: '烧伤', color: '#f59e0b' },
  { key: 'tox', label: '毒素', color: '#22c55e' },
  { key: 'oxy', label: '窒息', color: '#38bdf8' },
  { key: 'stamina', label: '耐力损耗', color: '#a78bfa' },
];

const ORGAN_SERIES: { slot: OrganSlot; label: string; color: string; dash?: string }[] = [
  { slot: 'liver', label: '肝脏', color: '#f59e0b' },
  { slot: 'heart', label: '心脏', color: '#ef4444', dash: '8 3' },
  { slot: 'lungs', label: '肺', color: '#38bdf8', dash: '3 3' },
  { slot: 'stomach', label: '胃', color: '#84cc16', dash: '8 3 2 3' },
  { slot: 'brain', label: '大脑', color: '#ec4899', dash: '2 3' },
  { slot: 'eyes', label: '眼睛', color: '#a78bfa', dash: '12 3 3 3' },
  { slot: 'ears', label: '耳朵', color: '#14b8a6', dash: '5 2 2 2 2 2' },
];

const BLOOD_TICKS = [0, 112, 280, 420, 560] as const;

function buildPolyline(points: [number, number][]): string {
  return points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

function nearestSnap(snapshots: TickSnapshot[], time: number): TickSnapshot {
  if (snapshots.length === 0) throw new Error('No snapshots');
  const idx = Math.min(snapshots.length - 1, Math.max(0, Math.round(time / 2)));
  return snapshots[idx];
}

function isFocusVisible(el: HTMLElement): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}

function computeTooltipStyle(hover: HoverState): CSSProperties {
  const winW = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const winH = typeof window !== 'undefined' ? window.innerHeight : 800;

  // Prefer placing tooltip completely outside the SVG plot area (above if room, else below)
  const verticalStyle: CSSProperties =
    hover.rectTop >= 175
      ? { bottom: Math.max(8, winH - hover.rectTop + 6), top: 'auto' }
      : winH - hover.rectBottom >= 140
        ? { top: hover.rectBottom + 6, bottom: 'auto' }
        : hover.clientY - hover.rectTop < (hover.rectBottom - hover.rectTop) / 2
          ? { top: hover.rectBottom - 4, bottom: 'auto' }
          : { bottom: Math.max(8, winH - hover.rectTop - 4), top: 'auto' };

  const horizontalStyle: CSSProperties =
    hover.relX <= 0.55
      ? {
          left: Math.min(Math.max(8, hover.clientX + 14), Math.max(8, winW - 220)),
          right: 'auto',
        }
      : {
          right: Math.min(Math.max(8, winW - hover.clientX + 14), Math.max(8, winW - 220)),
          left: 'auto',
        };

  return {
    position: 'fixed',
    ...verticalStyle,
    ...horizontalStyle,
  };
}

export function TimelineCharts({
  result,
  baselineResult,
  selectedTime,
  onSelectTime,
  isPlaying,
  onTogglePlay,
  playSpeed,
  onPlaySpeedChange,
  onResetPlay,
}: TimelineChartsProps) {
  const { snapshots, events, reagentsSeen, summary } = result;
  const maxTime = snapshots[snapshots.length - 1]?.time || 120;
  const baseId = useId();
  const chart1SummaryId = `${baseId}-c1-summary`;
  const chart2SummaryId = `${baseId}-c2-summary`;
  const chart3SummaryId = `${baseId}-c3-summary`;

  const [visibleHealth, setVisibleHealth] = useState<Record<HealthSeriesKey, boolean>>({
    health: true,
    brute: true,
    burn: true,
    tox: true,
    oxy: true,
    stamina: false,
  });

  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const [hoveredReagent, setHoveredReagent] = useState<string | null>(null);
  const [focusedReagent, setFocusedReagent] = useState<string | null>(null);
  const [pinnedReagent, setPinnedReagent] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<'organs' | 'vitals'>('organs');

  const displayTime = hoverState?.time ?? selectedTime;
  const displaySnap = nearestSnap(snapshots, displayTime);

  const xOf = (t: number) => PAD_L + (t / maxTime) * PLOT_W;

  const handleSvgPointer = (e: PointerEvent<SVGSVGElement>, chart: ChartId, commit: boolean) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const relX = Math.min(1, Math.max(0, (svgX - PAD_L) / PLOT_W));
    const t = relX * maxTime;
    const snapped = Math.round(t / 2) * 2;
    setHoverState({
      time: snapped,
      chart,
      clientX: e.clientX,
      clientY: e.clientY,
      relX,
      rectTop: rect.top,
      rectBottom: rect.bottom,
      rectLeft: rect.left,
      rectRight: rect.right,
    });
    if (commit) onSelectTime(snapped);
  };

  const handleSvgPointerDown = (e: PointerEvent<SVGSVGElement>, chart: ChartId) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic/unsupported pointer capture errors
    }
    handleSvgPointer(e, chart, true);
  };

  const handleSvgPointerEnd = (e: PointerEvent<SVGSVGElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore release errors
    }
    if (e.pointerType === 'touch' || e.type === 'pointercancel') {
      setHoverState(null);
    }
  };

  useEffect(() => {
    if (!hoverState) return;
    const onScroll = () => setHoverState(null);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [hoverState]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          Boolean(
            target.closest(
              'input, textarea, select, [contenteditable="true"], [contenteditable=""]',
            ),
          ))
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"]')) return;

      if (e.code === 'Space') {
        if (
          target?.closest(
            'button, a[href], summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"]',
          )
        ) {
          return;
        }
        e.preventDefault();
        onTogglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onSelectTime(Math.max(0, selectedTime - 2));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onSelectTime(Math.min(maxTime, selectedTime + 2));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [maxTime, onSelectTime, onTogglePlay, selectedTime]);

  // ==================== Chart 1: Health & Damage ====================
  const H1 = 235;
  const P1_H = H1 - PAD_T - PAD_B;
  const y1Bounds = useMemo(() => {
    let min = -100;
    let max = 110;
    for (const s of snapshots) {
      if (visibleHealth.health) {
        min = Math.min(min, s.health - 5);
        max = Math.max(max, s.health + 5);
      }
      for (const k of ['brute', 'burn', 'tox', 'oxy', 'stamina'] as const) {
        if (visibleHealth[k]) max = Math.max(max, s[k] + 8);
      }
    }
    return {
      min: Math.min(-100, Math.floor(min / 20) * 20),
      max: Math.max(110, Math.ceil(max / 20) * 20),
    };
  }, [snapshots, visibleHealth]);

  const y1Of = (v: number) => PAD_T + ((y1Bounds.max - v) / (y1Bounds.max - y1Bounds.min)) * P1_H;

  const chart1SummaryText = useMemo(() => {
    let peakBrute = 0;
    let peakBurn = 0;
    let peakTox = 0;
    let peakOxy = 0;
    let peakStamina = 0;
    for (const s of snapshots) {
      peakBrute = Math.max(peakBrute, s.brute);
      peakBurn = Math.max(peakBurn, s.burn);
      peakTox = Math.max(peakTox, s.tox);
      peakOxy = Math.max(peakOxy, s.oxy);
      peakStamina = Math.max(peakStamina, s.stamina);
    }
    const basePart = baselineResult
      ? `；对比基准终末 HP ${baselineResult.summary.finalHealth.toFixed(1)}`
      : '';
    return `初始 HP ${summary.initialHealth.toFixed(1)}，终末 HP ${summary.finalHealth.toFixed(1)}（${summary.finalStat}），最低 HP ${summary.minHealth.toFixed(1)}，最高 HP ${summary.maxHealth.toFixed(1)}；峰值伤势：钝伤 ${peakBrute.toFixed(1)}、烧伤 ${peakBurn.toFixed(1)}、毒素 ${peakTox.toFixed(1)}、窒息 ${peakOxy.toFixed(1)}、耐力损耗 ${peakStamina.toFixed(1)}${basePart}。`;
  }, [baselineResult, snapshots, summary]);

  // ==================== Chart 2: Reagents ====================
  const H2 = 215;
  const P2_H = H2 - PAD_T - PAD_B;
  const allReagentIds = useMemo(() => {
    const set = new Set<string>(reagentsSeen);
    for (const s of snapshots) {
      for (const r of s.stomachReagents) set.add(r.id);
    }
    return Array.from(set);
  }, [reagentsSeen, snapshots]);

  const validPinnedReagent =
    pinnedReagent && allReagentIds.includes(pinnedReagent) ? pinnedReagent : null;
  const validHoveredReagent =
    hoveredReagent && allReagentIds.includes(hoveredReagent) ? hoveredReagent : null;
  const validFocusedReagent =
    focusedReagent && allReagentIds.includes(focusedReagent) ? focusedReagent : null;
  const activeReagent = validHoveredReagent ?? validFocusedReagent ?? validPinnedReagent;

  const maxReagentVol = useMemo(() => {
    let m = 10;
    for (const s of snapshots) {
      for (const r of s.bloodReagents) m = Math.max(m, r.volume);
      for (const r of s.stomachReagents) m = Math.max(m, r.volume);
    }
    return Math.ceil(m / 5) * 5;
  }, [snapshots]);

  const y2Of = (v: number) => PAD_T + ((maxReagentVol - v) / maxReagentVol) * P2_H;

  const chart2SummaryText = useMemo(() => {
    if (allReagentIds.length === 0) {
      return '当前模拟时长内血液与胃部均未出现试剂。';
    }
    const peaks = new Map<string, { blood: number; stomach: number }>();
    for (const id of allReagentIds) peaks.set(id, { blood: 0, stomach: 0 });
    for (const s of snapshots) {
      for (const r of s.bloodReagents) {
        const entry = peaks.get(r.id);
        if (entry) entry.blood = Math.max(entry.blood, r.volume);
      }
      for (const r of s.stomachReagents) {
        const entry = peaks.get(r.id);
        if (entry) entry.stomach = Math.max(entry.stomach, r.volume);
      }
    }
    const items = allReagentIds.map((id) => {
      const def = REAGENTS[id];
      const p = peaks.get(id) ?? { blood: 0, stomach: 0 };
      const name = def?.zhName ?? id;
      return p.stomach > 0.05
        ? `${name}（血液峰值 ${p.blood.toFixed(1)}u，胃部峰值 ${p.stomach.toFixed(1)}u）`
        : `${name}（血液峰值 ${p.blood.toFixed(1)}u）`;
    });
    const odNote =
      summary.triggeredODs.length > 0 ? `；触发过量：${summary.triggeredODs.join('、')}` : '';
    return `共监测 ${allReagentIds.length} 种试剂：${items.join('，')}${odNote}。`;
  }, [allReagentIds, snapshots, summary.triggeredODs]);

  // ==================== Chart 3: Organs / Vitals ====================
  const H3 = 195;
  const P3_H = H3 - PAD_T - PAD_B;
  const maxOrganPct = useMemo(() => {
    let m = 100;
    for (const s of snapshots) {
      for (const { slot } of ORGAN_SERIES) {
        const o = s.organs[slot];
        if (o.maxHealth > 0) m = Math.max(m, (o.damage / o.maxHealth) * 100);
      }
    }
    return Math.min(105, Math.max(50, Math.ceil(m / 10) * 10));
  }, [snapshots]);
  const y3OrganOf = (pct: number) => PAD_T + ((maxOrganPct - pct) / maxOrganPct) * P3_H;

  const organEndLabels = useMemo(() => {
    const lastSnap = snapshots[snapshots.length - 1];
    if (!lastSnap) return [];
    const minGap = 11;
    const topLimit = PAD_T + 7;
    const bottomLimit = H3 - PAD_B - 3;

    const items = ORGAN_SERIES.map((o, idx) => {
      const org = lastSnap.organs[o.slot];
      const finalPct = org.maxHealth > 0 ? (org.damage / org.maxHealth) * 100 : 100;
      const endY = y3OrganOf(finalPct);
      return {
        ...o,
        idx,
        finalPct,
        endY,
        labelY: endY,
      };
    });

    items.sort((a, b) => a.endY - b.endY || a.idx - b.idx);
    for (let i = 0; i < items.length; i++) {
      const prevY = i > 0 ? items[i - 1].labelY + minGap : topLimit;
      items[i].labelY = Math.max(items[i].labelY, prevY, topLimit);
    }
    if (items.length > 0 && items[items.length - 1].labelY > bottomLimit) {
      items[items.length - 1].labelY = bottomLimit;
      for (let i = items.length - 2; i >= 0; i--) {
        if (items[i].labelY > items[i + 1].labelY - minGap) {
          items[i].labelY = items[i + 1].labelY - minGap;
        }
      }
    }
    return items;
  }, [maxOrganPct, snapshots]);

  const tempBounds = useMemo(() => {
    let min = 260;
    let max = 360;
    for (const s of snapshots) {
      min = Math.min(min, s.bodyTemp - 10, s.coreTemp - 10);
      max = Math.max(max, s.bodyTemp + 10, s.coreTemp + 10);
    }
    return { min: Math.floor(min / 20) * 20, max: Math.ceil(max / 20) * 20 };
  }, [snapshots]);
  const y3TempOf = (k: number) =>
    PAD_T + ((tempBounds.max - k) / (tempBounds.max - tempBounds.min)) * P3_H;
  const y3BloodOf = (b: number) => PAD_T + ((560 - b) / 560) * P3_H;

  const chart3SummaryText = useMemo(() => {
    const lastSnap = snapshots[snapshots.length - 1];
    if (!lastSnap) return '';
    if (bottomTab === 'organs') {
      const details = ORGAN_SERIES.map((o) => {
        let peakPct = 0;
        for (const s of snapshots) {
          const org = s.organs[o.slot];
          const pct = org.maxHealth > 0 ? (org.damage / org.maxHealth) * 100 : 100;
          peakPct = Math.max(peakPct, pct);
        }
        const finalOrg = lastSnap.organs[o.slot];
        const finalPct =
          finalOrg.maxHealth > 0 ? (finalOrg.damage / finalOrg.maxHealth) * 100 : 100;
        return `${o.label} 峰值 ${peakPct.toFixed(0)}%/终末 ${finalPct.toFixed(0)}%`;
      });
      const worstPct =
        summary.worstOrgan.maxHealth > 0
          ? (summary.worstOrgan.damage / summary.worstOrgan.maxHealth) * 100
          : 100;
      return `最严重器官为 ${summary.worstOrgan.label}（${worstPct.toFixed(0)}%）；各器官损伤：${details.join('，')}。`;
    }
    let minBody = lastSnap.bodyTemp;
    let maxBody = lastSnap.bodyTemp;
    let minCore = lastSnap.coreTemp;
    let maxCore = lastSnap.coreTemp;
    let minBlood = lastSnap.effectiveBloodVolume;
    for (const s of snapshots) {
      minBody = Math.min(minBody, s.bodyTemp);
      maxBody = Math.max(maxBody, s.bodyTemp);
      minCore = Math.min(minCore, s.coreTemp);
      maxCore = Math.max(maxCore, s.coreTemp);
      minBlood = Math.min(minBlood, s.effectiveBloodVolume);
    }
    return `终末体表温度 ${lastSnap.bodyTemp.toFixed(1)}K（范围 ${minBody.toFixed(1)}–${maxBody.toFixed(1)}K），核心体温 ${lastSnap.coreTemp.toFixed(1)}K（范围 ${minCore.toFixed(1)}–${maxCore.toFixed(1)}K），有效血量 ${lastSnap.effectiveBloodVolume.toFixed(0)}u（最低 ${minBlood.toFixed(0)}u）。`;
  }, [bottomTab, snapshots, summary.worstOrgan]);

  const timeTicks = useMemo(() => {
    const step = maxTime <= 90 ? 10 : maxTime <= 240 ? 30 : 60;
    const arr: number[] = [];
    for (let t = 0; t <= maxTime; t += step) arr.push(t);
    return arr;
  }, [maxTime]);

  const significantEvents = useMemo(
    () =>
      events.filter(
        (ev) => ev.severity === 'danger' || ev.severity === 'warn' || ev.category === 'reaction',
      ),
    [events],
  );

  const tooltipStyle = hoverState ? computeTooltipStyle(hoverState) : undefined;

  return (
    <div className="col-stack">
      {/* Playback & Time Scrubber */}
      <div className="panel" style={{ padding: '8px 12px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onTogglePlay}
            title="播放/暂停 (快捷键: Space，非输入状态可用)"
            aria-keyshortcuts="Space"
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
            {isPlaying ? '暂停' : '播放'}
          </button>
          <button type="button" className="btn btn-sm" onClick={onResetPlay} title="回到 t=0">
            <RotateCcw size={13} />
          </button>
          <div className="seg-toggle">
            {[1, 4, 10].map((spd) => (
              <button
                key={spd}
                type="button"
                className={`seg-btn mono ${playSpeed === spd ? 'active' : ''}`}
                onClick={() => onPlaySpeedChange(spd)}
              >
                {spd}x
              </button>
            ))}
          </div>
          <input
            type="range"
            aria-label="模拟时间轴"
            aria-keyshortcuts="ArrowLeft ArrowRight"
            title="拖拽时间轴，或使用 ←/→ 键步进 2s"
            style={{ flex: 1, minWidth: 140 }}
            min={0}
            max={maxTime}
            step={2}
            value={selectedTime}
            onChange={(e) => onSelectTime(Number(e.target.value))}
          />
          <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
            t = {selectedTime}s <span style={{ color: 'var(--text-muted)' }}>(Tick {selectedTime / 2})</span>
          </span>
          <span
            className="dose-sub chart-shortcuts-hint"
            title="在非输入框/弹窗状态下支持全局键盘快捷键"
          >
            快捷键: <kbd className="kbd-key">Space</kbd> 播放/暂停 ·{' '}
            <kbd className="kbd-key">←</kbd>/<kbd className="kbd-key">→</kbd> 步进 2s
          </span>
        </div>
      </div>

      {/* Chart 1: Health & Damage */}
      <section className="panel">
        <div className="chart-toolbar">
          <div className="panel-title">生命值与五维伤势演化曲线</div>
          <div className="legend-row">
            {HEALTH_SERIES.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={visibleHealth[s.key]}
                className={`legend-pill ${visibleHealth[s.key] ? 'active' : 'muted'}`}
                onClick={() => setVisibleHealth((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
              >
                <span className="color-dot" style={{ background: s.color }} />
                <span>{s.label}</span>
              </button>
            ))}
            {baselineResult && (
              <span className="tag-chip">
                <svg width="20" height="8" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <line
                    x1="0"
                    y1="4"
                    x2="20"
                    y2="4"
                    stroke="#94a3b8"
                    strokeWidth="1.8"
                    strokeDasharray="5 4"
                  />
                </svg>
                虚线 = 固定基准
              </span>
            )}
          </div>
        </div>

        <p id={chart1SummaryId} className="sr-only">
          {chart1SummaryText}
        </p>

        <div className="chart-wrap">
          <svg
            role="img"
            aria-label={`生命值与五维伤势演化曲线图表：终末 HP ${summary.finalHealth.toFixed(1)}，状态 ${summary.finalStat}`}
            aria-describedby={chart1SummaryId}
            viewBox={`0 0 ${W} ${H1}`}
            className="chart-svg"
            style={{ touchAction: 'none' }}
            onPointerMove={(e) =>
              handleSvgPointer(e, 'health', e.buttons === 1 || e.pointerType === 'touch')
            }
            onPointerDown={(e) => handleSvgPointerDown(e, 'health')}
            onPointerUp={handleSvgPointerEnd}
            onPointerCancel={handleSvgPointerEnd}
            onPointerLeave={() => setHoverState(null)}
          >
            {/* Soft Crit (0..-30) & Hard Crit (-30..-100) bands */}
            <rect
              x={PAD_L}
              y={y1Of(0)}
              width={PLOT_W}
              height={Math.max(0, y1Of(-30) - y1Of(0))}
              fill="rgba(245, 158, 11, 0.08)"
            />
            <rect
              x={PAD_L}
              y={y1Of(-30)}
              width={PLOT_W}
              height={Math.max(0, y1Of(-100) - y1Of(-30))}
              fill="rgba(239, 68, 68, 0.1)"
            />

            {/* Grid & Y labels */}
            {[-100, -30, 0, 50, 100, 150, 200]
              .filter((v) => v >= y1Bounds.min && v <= y1Bounds.max)
              .map((v) => (
                <g key={v}>
                  <line
                    x1={PAD_L}
                    x2={W - PAD_R}
                    y1={y1Of(v)}
                    y2={y1Of(v)}
                    stroke={v === 0 ? 'rgba(245,158,11,0.4)' : v === -30 ? 'rgba(239,68,68,0.4)' : 'rgba(148,163,184,0.12)'}
                    strokeDasharray={v === 0 || v === -30 ? '4 3' : undefined}
                  />
                  <text x={PAD_L - 6} y={y1Of(v) + 4} textAnchor="end" fontSize="10" fill="#8b9cb3">
                    {v}
                  </text>
                </g>
              ))}

            {/* X grid & labels */}
            {timeTicks.map((t) => (
              <g key={t}>
                <line x1={xOf(t)} x2={xOf(t)} y1={PAD_T} y2={H1 - PAD_B} stroke="rgba(148,163,184,0.1)" />
                <text x={xOf(t)} y={H1 - 8} textAnchor="middle" fontSize="10" fill="#8b9cb3">
                  {t}s
                </text>
              </g>
            ))}

            {/* Event markers */}
            {significantEvents.map((ev, i) => (
              <line
                key={i}
                x1={xOf(ev.time)}
                x2={xOf(ev.time)}
                y1={PAD_T}
                y2={H1 - PAD_B}
                stroke={ev.severity === 'danger' ? 'rgba(239,68,68,0.45)' : 'rgba(245,158,11,0.35)'}
                strokeDasharray="2 3"
              />
            ))}

            {/* Baseline HP ghost curve */}
            {baselineResult && (
              <polyline
                fill="none"
                stroke="#94a3b8"
                strokeWidth="1.8"
                strokeDasharray="5 4"
                points={buildPolyline(
                  baselineResult.snapshots.map((s) => [xOf(s.time), y1Of(s.health)]),
                )}
              />
            )}

            {/* Active Health/Damage lines */}
            {HEALTH_SERIES.filter((s) => visibleHealth[s.key]).map((s) => (
              <polyline
                key={s.key}
                fill="none"
                stroke={s.color}
                strokeWidth={s.key === 'health' ? 2.4 : 1.7}
                points={buildPolyline(snapshots.map((snap) => [xOf(snap.time), y1Of(snap[s.key])]))}
              />
            ))}

            {/* Scrubber & Hover cursor */}
            <line
              x1={xOf(selectedTime)}
              x2={xOf(selectedTime)}
              y1={PAD_T}
              y2={H1 - PAD_B}
              stroke="#38bdf8"
              strokeWidth="1.6"
            />
            {hoverState && hoverState.time !== selectedTime && (
              <line
                x1={xOf(hoverState.time)}
                x2={xOf(hoverState.time)}
                y1={PAD_T}
                y2={H1 - PAD_B}
                stroke="rgba(255,255,255,0.35)"
                strokeDasharray="3 3"
              />
            )}
          </svg>

          {hoverState?.chart === 'health' && (
            <div className="chart-tooltip mono" style={tooltipStyle}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                t = {displaySnap.time}s · {displaySnap.stat}
              </div>
              <div className="chart-tooltip-grid">
                <div>HP: {displaySnap.health.toFixed(1)}</div>
                <div style={{ color: 'var(--c-brute)' }}>钝伤: {displaySnap.brute.toFixed(1)}</div>
                <div style={{ color: 'var(--c-burn)' }}>烧伤: {displaySnap.burn.toFixed(1)}</div>
                <div style={{ color: 'var(--c-tox)' }}>毒素: {displaySnap.tox.toFixed(1)}</div>
                <div style={{ color: 'var(--c-oxy)' }}>窒息: {displaySnap.oxy.toFixed(1)}</div>
                <div style={{ color: 'var(--c-stamina)' }}>耐力: {displaySnap.stamina.toFixed(1)}</div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Chart 2: Blood & Stomach Reagent Concentrations */}
      <section className="panel">
        <div className="chart-toolbar">
          <div className="panel-title">体内药液浓度曲线 (实线=血液 · 虚线=胃部)</div>
          <div className="legend-row">
            {allReagentIds.map((id) => {
              const def = REAGENTS[id];
              if (!def) return null;
              const col = getDisplayColor(def.color);
              const isPinned = validPinnedReagent === id;
              const isActive = activeReagent === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={isPinned}
                  title={
                    def.overdoseThreshold > 0
                      ? `点击固定高亮并锁定过量参考线（基础 OD: ${def.overdoseThreshold}u）；悬停或聚焦可预览`
                      : '点击固定高亮曲线；悬停或聚焦可预览'
                  }
                  className={`legend-pill ${isActive ? 'active' : ''} ${isPinned ? 'pinned' : ''}`}
                  onPointerEnter={(e) => {
                    if (e.pointerType !== 'touch') setHoveredReagent(id);
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType !== 'touch') {
                      setHoveredReagent((prev) => (prev === id ? null : prev));
                    }
                  }}
                  onFocus={(e) => {
                    if (isFocusVisible(e.currentTarget)) setFocusedReagent(id);
                  }}
                  onBlur={() => setFocusedReagent((prev) => (prev === id ? null : prev))}
                  onClick={() => {
                    setPinnedReagent((prev) => {
                      const next = prev === id ? null : id;
                      if (next === null) setFocusedReagent((f) => (f === id ? null : f));
                      return next;
                    });
                  }}
                >
                  <span className="color-dot" style={{ background: col }} />
                  <span>{def.zhName}</span>
                </button>
              );
            })}
            {allReagentIds.length === 0 && <span className="dose-sub">暂无体内试剂</span>}
          </div>
        </div>

        <p id={chart2SummaryId} className="sr-only">
          {chart2SummaryText}
        </p>

        <div className="chart-wrap">
          <svg
            role="img"
            aria-label={`体内药液浓度曲线图表：共 ${allReagentIds.length} 种试剂`}
            aria-describedby={chart2SummaryId}
            viewBox={`0 0 ${W} ${H2}`}
            className="chart-svg"
            style={{ touchAction: 'none' }}
            onPointerMove={(e) =>
              handleSvgPointer(e, 'reagents', e.buttons === 1 || e.pointerType === 'touch')
            }
            onPointerDown={(e) => handleSvgPointerDown(e, 'reagents')}
            onPointerUp={handleSvgPointerEnd}
            onPointerCancel={handleSvgPointerEnd}
            onPointerLeave={() => setHoverState(null)}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((f) => {
              const v = maxReagentVol * f;
              return (
                <g key={f}>
                  <line x1={PAD_L} x2={W - PAD_R} y1={y2Of(v)} y2={y2Of(v)} stroke="rgba(148,163,184,0.12)" />
                  <text x={PAD_L - 6} y={y2Of(v) + 4} textAnchor="end" fontSize="10" fill="#8b9cb3">
                    {v.toFixed(0)}u
                  </text>
                </g>
              );
            })}

            {timeTicks.map((t) => (
              <g key={t}>
                <line x1={xOf(t)} x2={xOf(t)} y1={PAD_T} y2={H2 - PAD_B} stroke="rgba(148,163,184,0.1)" />
                <text x={xOf(t)} y={H2 - 8} textAnchor="middle" fontSize="10" fill="#8b9cb3">
                  {t}s
                </text>
              </g>
            ))}

            {/* Hover/Focus/Pinned OD threshold reference line */}
            {activeReagent &&
              REAGENTS[activeReagent]?.overdoseThreshold > 0 &&
              (() => {
                const def = REAGENTS[activeReagent];
                const od = def.overdoseThreshold;
                const aboveRange = od > maxReagentVol;
                const lineY = aboveRange ? PAD_T : y2Of(od);
                const labelY = aboveRange ? PAD_T + 12 : lineY - 4 < PAD_T + 10 ? lineY + 12 : lineY - 4;
                return (
                  <g>
                    <line
                      x1={PAD_L}
                      x2={W - PAD_R}
                      y1={lineY}
                      y2={lineY}
                      stroke={aboveRange ? 'rgba(239,68,68,0.55)' : '#ef4444'}
                      strokeDasharray="4 3"
                    />
                    <text x={W - PAD_R - 4} y={labelY} textAnchor="end" fontSize="10" fill="#fca5a5">
                      {aboveRange
                        ? `↑ ${def.zhName} 基础OD: ${od}u（高于当前坐标上限）`
                        : `${def.zhName} 基础OD: ${od}u`}
                    </text>
                  </g>
                );
              })()}

            {allReagentIds.map((id) => {
              const def = REAGENTS[id];
              if (!def) return null;
              const col = getDisplayColor(def.color);
              const dimmed = activeReagent !== null && activeReagent !== id;
              const bloodPts: [number, number][] = snapshots.map((s) => [
                xOf(s.time),
                y2Of(s.bloodReagents.find((r) => r.id === id)?.volume ?? 0),
              ]);
              const stomPts: [number, number][] = snapshots.map((s) => [
                xOf(s.time),
                y2Of(s.stomachReagents.find((r) => r.id === id)?.volume ?? 0),
              ]);
              const hasStom = stomPts.some((p) => p[1] < y2Of(0.01));
              return (
                <g key={id} opacity={dimmed ? 0.22 : 1}>
                  <polyline fill="none" stroke={col} strokeWidth="2" points={buildPolyline(bloodPts)} />
                  {hasStom && (
                    <polyline
                      fill="none"
                      stroke={col}
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                      points={buildPolyline(stomPts)}
                    />
                  )}
                </g>
              );
            })}

            <line
              x1={xOf(selectedTime)}
              x2={xOf(selectedTime)}
              y1={PAD_T}
              y2={H2 - PAD_B}
              stroke="#38bdf8"
              strokeWidth="1.6"
            />
            {hoverState && hoverState.time !== selectedTime && (
              <line
                x1={xOf(hoverState.time)}
                x2={xOf(hoverState.time)}
                y1={PAD_T}
                y2={H2 - PAD_B}
                stroke="rgba(255,255,255,0.35)"
                strokeDasharray="3 3"
              />
            )}
          </svg>

          {hoverState?.chart === 'reagents' &&
            (displaySnap.bloodReagents.length > 0 || displaySnap.stomachReagents.length > 0) && (
              <div className="chart-tooltip mono" style={tooltipStyle}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  体内药液 t = {displaySnap.time}s
                </div>
                {displaySnap.bloodReagents.map((r) => (
                  <div
                    key={r.id}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}
                  >
                    <span style={{ color: getDisplayColor(r.color) }}>{r.zhName}</span>
                    <span>
                      {r.volume.toFixed(2)}u {r.overdosed ? 'OD!' : ''}
                    </span>
                  </div>
                ))}
                {displaySnap.stomachReagents.length > 0 && (
                  <div
                    style={{
                      marginTop: displaySnap.bloodReagents.length > 0 ? 4 : 0,
                      paddingTop: displaySnap.bloodReagents.length > 0 ? 4 : 0,
                      borderTop:
                        displaySnap.bloodReagents.length > 0
                          ? '1px solid rgba(148,163,184,0.2)'
                          : undefined,
                      color: 'var(--text-muted)',
                    }}
                  >
                    {displaySnap.stomachReagents.map((r) => (
                      <div
                        key={`st-${r.id}`}
                        style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}
                      >
                        <span style={{ color: getDisplayColor(r.color) }}>胃·{r.zhName}</span>
                        <span>{r.volume.toFixed(2)}u</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
        </div>
      </section>

      {/* Chart 3: Organ Damage or Vitals */}
      <section className="panel">
        <div className="chart-toolbar">
          <div className="seg-toggle">
            <button
              type="button"
              className={`seg-btn ${bottomTab === 'organs' ? 'active' : ''}`}
              onClick={() => setBottomTab('organs')}
            >
              器官损伤百分比 (%)
            </button>
            <button
              type="button"
              className={`seg-btn ${bottomTab === 'vitals' ? 'active' : ''}`}
              onClick={() => setBottomTab('vitals')}
            >
              体温 (K) 与血量 (u)
            </button>
          </div>
          <div className="legend-row">
            {bottomTab === 'organs' ? (
              ORGAN_SERIES.map((o) => (
                <span key={o.slot} className="tag-chip">
                  <svg width="20" height="8" aria-hidden="true" style={{ flexShrink: 0 }}>
                    <line
                      x1="0"
                      y1="4"
                      x2="20"
                      y2="4"
                      stroke={o.color}
                      strokeWidth="2"
                      strokeDasharray={o.dash}
                    />
                  </svg>
                  {o.label}
                </span>
              ))
            ) : (
              <>
                <span className="tag-chip">
                  <svg width="18" height="8" aria-hidden="true" style={{ flexShrink: 0 }}>
                    <line x1="0" y1="4" x2="18" y2="4" stroke="var(--c-temp)" strokeWidth="2" />
                  </svg>
                  体表温度 (左轴 K)
                </span>
                <span className="tag-chip">
                  <svg width="18" height="8" aria-hidden="true" style={{ flexShrink: 0 }}>
                    <line
                      x1="0"
                      y1="4"
                      x2="18"
                      y2="4"
                      stroke="#fbbf24"
                      strokeWidth="1.8"
                      strokeDasharray="4 3"
                    />
                  </svg>
                  核心体温 (左轴 K)
                </span>
                <span className="tag-chip">
                  <svg width="18" height="8" aria-hidden="true" style={{ flexShrink: 0 }}>
                    <line x1="0" y1="4" x2="18" y2="4" stroke="var(--c-blood)" strokeWidth="2" />
                  </svg>
                  有效血量 (右轴 u)
                </span>
              </>
            )}
          </div>
        </div>

        <p id={chart3SummaryId} className="sr-only">
          {chart3SummaryText}
        </p>

        <div className="chart-wrap">
          <svg
            role="img"
            aria-label={
              bottomTab === 'organs'
                ? `器官损伤百分比曲线图表：最严重器官 ${summary.worstOrgan.label}`
                : '体温与有效血量演化曲线图表'
            }
            aria-describedby={chart3SummaryId}
            viewBox={`0 0 ${W} ${H3}`}
            className="chart-svg"
            style={{ touchAction: 'none' }}
            onPointerMove={(e) =>
              handleSvgPointer(e, 'vitals', e.buttons === 1 || e.pointerType === 'touch')
            }
            onPointerDown={(e) => handleSvgPointerDown(e, 'vitals')}
            onPointerUp={handleSvgPointerEnd}
            onPointerCancel={handleSvgPointerEnd}
            onPointerLeave={() => setHoverState(null)}
          >
            {timeTicks.map((t) => (
              <g key={t}>
                <line x1={xOf(t)} x2={xOf(t)} y1={PAD_T} y2={H3 - PAD_B} stroke="rgba(148,163,184,0.1)" />
                <text x={xOf(t)} y={H3 - 8} textAnchor="middle" fontSize="10" fill="#8b9cb3">
                  {t}s
                </text>
              </g>
            ))}

            {bottomTab === 'organs' ? (
              <>
                {[0, 10, 45, 100]
                  .filter((p) => p <= maxOrganPct)
                  .map((p) => (
                    <g key={p}>
                      <line
                        x1={PAD_L}
                        x2={W - PAD_R}
                        y1={y3OrganOf(p)}
                        y2={y3OrganOf(p)}
                        stroke={p === 45 ? 'rgba(245,158,11,0.35)' : p === 100 ? 'rgba(239,68,68,0.4)' : 'rgba(148,163,184,0.12)'}
                        strokeDasharray={p === 10 || p === 45 || p === 100 ? '4 3' : undefined}
                      />
                      <text x={PAD_L - 6} y={y3OrganOf(p) + 4} textAnchor="end" fontSize="10" fill="#8b9cb3">
                        {p}%
                      </text>
                    </g>
                  ))}
                {ORGAN_SERIES.map((o) => (
                  <polyline
                    key={o.slot}
                    fill="none"
                    stroke={o.color}
                    strokeWidth="1.8"
                    strokeDasharray={o.dash}
                    points={buildPolyline(
                      snapshots.map((s) => {
                        const org = s.organs[o.slot];
                        const pct = org.maxHealth > 0 ? (org.damage / org.maxHealth) * 100 : 100;
                        return [xOf(s.time), y3OrganOf(pct)];
                      }),
                    )}
                  />
                ))}
                {/* Direct end-of-line labels for colorblind accessibility */}
                {organEndLabels.map((o) => {
                  const endX = xOf(maxTime);
                  const label =
                    o.finalPct >= 0.5 ? `${o.label} ${Math.round(o.finalPct)}%` : o.label;
                  return (
                    <g key={`lbl-${o.slot}`}>
                      <line
                        x1={endX}
                        y1={o.endY}
                        x2={endX + 4}
                        y2={o.labelY}
                        stroke={o.color}
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <text
                        x={endX + 6}
                        y={o.labelY + 3.2}
                        textAnchor="start"
                        fontSize="9.5"
                        fill={o.color}
                      >
                        {label}
                      </text>
                    </g>
                  );
                })}
              </>
            ) : (
              <>
                {[tempBounds.min, 270.15, 310.15, 340.15, tempBounds.max]
                  .filter((v, i, arr) => v >= tempBounds.min && v <= tempBounds.max && arr.indexOf(v) === i)
                  .map((v) => (
                    <g key={v}>
                      <line
                        x1={PAD_L}
                        x2={W - PAD_R}
                        y1={y3TempOf(v)}
                        y2={y3TempOf(v)}
                        stroke={v === 310.15 ? 'rgba(34,197,94,0.35)' : 'rgba(148,163,184,0.12)'}
                        strokeDasharray="3 3"
                      />
                      <text x={PAD_L - 6} y={y3TempOf(v) + 4} textAnchor="end" fontSize="10" fill="#8b9cb3">
                        {v.toFixed(0)}K
                      </text>
                    </g>
                  ))}

                {/* Right Y-axis for effective blood volume (u) */}
                <line
                  x1={W - PAD_R}
                  x2={W - PAD_R}
                  y1={PAD_T}
                  y2={H3 - PAD_B}
                  stroke="rgba(248, 113, 113, 0.35)"
                />
                {BLOOD_TICKS.map((b) => (
                  <g key={`blood-${b}`}>
                    {b === 112 && (
                      <line
                        x1={PAD_L}
                        x2={W - PAD_R}
                        y1={y3BloodOf(b)}
                        y2={y3BloodOf(b)}
                        stroke="rgba(220, 38, 38, 0.28)"
                        strokeDasharray="2 3"
                      />
                    )}
                    <line
                      x1={W - PAD_R}
                      x2={W - PAD_R + 4}
                      y1={y3BloodOf(b)}
                      y2={y3BloodOf(b)}
                      stroke="rgba(248, 113, 113, 0.55)"
                    />
                    <text
                      x={W - PAD_R + 6}
                      y={y3BloodOf(b) + 3.5}
                      textAnchor="start"
                      fontSize="10"
                      fill="#fca5a5"
                    >
                      {b}u
                    </text>
                  </g>
                ))}

                <polyline
                  fill="none"
                  stroke="#fb923c"
                  strokeWidth="2"
                  points={buildPolyline(snapshots.map((s) => [xOf(s.time), y3TempOf(s.bodyTemp)]))}
                />
                <polyline
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="1.6"
                  strokeDasharray="4 3"
                  points={buildPolyline(snapshots.map((s) => [xOf(s.time), y3TempOf(s.coreTemp)]))}
                />
                <polyline
                  fill="none"
                  stroke="#dc2626"
                  strokeWidth="2"
                  points={buildPolyline(snapshots.map((s) => [xOf(s.time), y3BloodOf(s.effectiveBloodVolume)]))}
                />
              </>
            )}

            <line
              x1={xOf(selectedTime)}
              x2={xOf(selectedTime)}
              y1={PAD_T}
              y2={H3 - PAD_B}
              stroke="#38bdf8"
              strokeWidth="1.6"
            />
            {hoverState && hoverState.time !== selectedTime && (
              <line
                x1={xOf(hoverState.time)}
                x2={xOf(hoverState.time)}
                y1={PAD_T}
                y2={H3 - PAD_B}
                stroke="rgba(255,255,255,0.35)"
                strokeDasharray="3 3"
              />
            )}
          </svg>

          {hoverState?.chart === 'vitals' && (
            <div className="chart-tooltip mono" style={tooltipStyle}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {bottomTab === 'organs' ? '器官损伤' : '体温与血量'} t = {displaySnap.time}s
              </div>
              {bottomTab === 'organs' ? (
                <div className="chart-tooltip-grid">
                  {ORGAN_SERIES.map((o) => {
                    const org = displaySnap.organs[o.slot];
                    const pct = org.maxHealth > 0 ? (org.damage / org.maxHealth) * 100 : 100;
                    return (
                      <div key={o.slot} style={{ color: o.color }}>
                        {o.label}: {pct.toFixed(0)}%
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div style={{ color: 'var(--c-temp)' }}>
                    体表温: {displaySnap.bodyTemp.toFixed(1)} K
                  </div>
                  <div style={{ color: '#fbbf24' }}>
                    核心温: {displaySnap.coreTemp.toFixed(1)} K
                  </div>
                  <div style={{ color: '#fca5a5' }}>
                    有效血量: {displaySnap.effectiveBloodVolume.toFixed(0)} u
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
