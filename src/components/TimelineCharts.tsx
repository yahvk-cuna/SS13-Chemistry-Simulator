import { Pause, Play, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
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
const PAD_R = 16;
const PAD_T = 14;
const PAD_B = 26;
const PLOT_W = W - PAD_L - PAD_R;

type HealthSeriesKey = 'health' | 'brute' | 'burn' | 'tox' | 'oxy' | 'stamina';

const HEALTH_SERIES: { key: HealthSeriesKey; label: string; color: string }[] = [
  { key: 'health', label: '生命值 (HP)', color: '#f8fafc' },
  { key: 'brute', label: '钝伤', color: '#ef4444' },
  { key: 'burn', label: '烧伤', color: '#f59e0b' },
  { key: 'tox', label: '毒素', color: '#22c55e' },
  { key: 'oxy', label: '窒息', color: '#38bdf8' },
  { key: 'stamina', label: '耐力损耗', color: '#a78bfa' },
];

const ORGAN_SERIES: { slot: OrganSlot; label: string; color: string }[] = [
  { slot: 'liver', label: '肝脏', color: '#f59e0b' },
  { slot: 'heart', label: '心脏', color: '#ef4444' },
  { slot: 'lungs', label: '肺', color: '#38bdf8' },
  { slot: 'stomach', label: '胃', color: '#84cc16' },
  { slot: 'brain', label: '大脑', color: '#ec4899' },
  { slot: 'eyes', label: '眼睛', color: '#a78bfa' },
  { slot: 'ears', label: '耳朵', color: '#14b8a6' },
];

function buildPolyline(points: [number, number][]): string {
  return points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

function nearestSnap(snapshots: TickSnapshot[], time: number): TickSnapshot {
  if (snapshots.length === 0) throw new Error('No snapshots');
  const idx = Math.min(snapshots.length - 1, Math.max(0, Math.round(time / 2)));
  return snapshots[idx];
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
  const { snapshots, events, reagentsSeen } = result;
  const maxTime = snapshots[snapshots.length - 1]?.time || 120;

  const [visibleHealth, setVisibleHealth] = useState<Record<HealthSeriesKey, boolean>>({
    health: true,
    brute: true,
    burn: true,
    tox: true,
    oxy: true,
    stamina: false,
  });

  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [hoveredReagent, setHoveredReagent] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<'organs' | 'vitals'>('organs');

  const displayTime = hoveredTime ?? selectedTime;
  const displaySnap = nearestSnap(snapshots, displayTime);

  const xOf = (t: number) => PAD_L + (t / maxTime) * PLOT_W;

  const handleSvgPointer = (e: React.MouseEvent<SVGSVGElement>, commit: boolean) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const t = Math.min(maxTime, Math.max(0, ((relX - PAD_L) / PLOT_W) * maxTime));
    const snapped = Math.round(t / 2) * 2;
    setHoveredTime(snapped);
    if (commit) onSelectTime(snapped);
  };

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
    return { min: Math.min(-100, Math.floor(min / 20) * 20), max: Math.max(110, Math.ceil(max / 20) * 20) };
  }, [snapshots, visibleHealth]);

  const y1Of = (v: number) => PAD_T + ((y1Bounds.max - v) / (y1Bounds.max - y1Bounds.min)) * P1_H;

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

  const maxReagentVol = useMemo(() => {
    let m = 10;
    for (const s of snapshots) {
      for (const r of s.bloodReagents) m = Math.max(m, r.volume);
      for (const r of s.stomachReagents) m = Math.max(m, r.volume);
    }
    if (hoveredReagent && REAGENTS[hoveredReagent]?.overdoseThreshold) {
      m = Math.max(m, REAGENTS[hoveredReagent].overdoseThreshold * 1.15);
    }
    return Math.ceil(m / 5) * 5;
  }, [snapshots, hoveredReagent]);

  const y2Of = (v: number) => PAD_T + ((maxReagentVol - v) / maxReagentVol) * P2_H;

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

  const tempBounds = useMemo(() => {
    let min = 260;
    let max = 360;
    for (const s of snapshots) {
      min = Math.min(min, s.bodyTemp - 10, s.coreTemp - 10);
      max = Math.max(max, s.bodyTemp + 10, s.coreTemp + 10);
    }
    return { min: Math.floor(min / 20) * 20, max: Math.ceil(max / 20) * 20 };
  }, [snapshots]);
  const y3TempOf = (k: number) => PAD_T + ((tempBounds.max - k) / (tempBounds.max - tempBounds.min)) * P3_H;
  const y3BloodOf = (b: number) => PAD_T + ((560 - b) / 560) * P3_H;

  const timeTicks = useMemo(() => {
    const step = maxTime <= 90 ? 10 : maxTime <= 240 ? 30 : 60;
    const arr: number[] = [];
    for (let t = 0; t <= maxTime; t += step) arr.push(t);
    return arr;
  }, [maxTime]);

  const significantEvents = useMemo(
    () => events.filter((ev) => ev.severity === 'danger' || ev.severity === 'warn' || ev.category === 'reaction'),
    [events],
  );

  return (
    <div className="col-stack">
      {/* Playback & Time Scrubber */}
      <div className="panel" style={{ padding: '8px 12px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={onTogglePlay}>
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
                className={`legend-pill ${visibleHealth[s.key] ? 'active' : 'muted'}`}
                onClick={() => setVisibleHealth((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
              >
                <span className="color-dot" style={{ background: s.color }} />
                <span>{s.label}</span>
              </button>
            ))}
            {baselineResult && (
              <span className="tag-chip mono">虚线: 对比基准 HP</span>
            )}
          </div>
        </div>

        <div className="chart-wrap">
          <svg
            viewBox={`0 0 ${W} ${H1}`}
            className="chart-svg"
            onMouseMove={(e) => handleSvgPointer(e, false)}
            onMouseLeave={() => setHoveredTime(null)}
            onClick={(e) => handleSvgPointer(e, true)}
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
            {hoveredTime !== null && hoveredTime !== selectedTime && (
              <line
                x1={xOf(hoveredTime)}
                x2={xOf(hoveredTime)}
                y1={PAD_T}
                y2={H1 - PAD_B}
                stroke="rgba(255,255,255,0.35)"
                strokeDasharray="3 3"
              />
            )}
          </svg>

          {hoveredTime !== null && (
            <div
              className="chart-tooltip mono"
              style={{
                top: 12,
                left: displayTime > maxTime * 0.65 ? 54 : undefined,
                right: displayTime <= maxTime * 0.65 ? 24 : undefined,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                t = {displaySnap.time}s · {displaySnap.stat}
              </div>
              <div>HP: {displaySnap.health.toFixed(1)}</div>
              <div style={{ color: 'var(--c-brute)' }}>钝伤: {displaySnap.brute.toFixed(1)}</div>
              <div style={{ color: 'var(--c-burn)' }}>烧伤: {displaySnap.burn.toFixed(1)}</div>
              <div style={{ color: 'var(--c-tox)' }}>毒素: {displaySnap.tox.toFixed(1)}</div>
              <div style={{ color: 'var(--c-oxy)' }}>窒息: {displaySnap.oxy.toFixed(1)}</div>
              <div style={{ color: 'var(--c-stamina)' }}>耐力: {displaySnap.stamina.toFixed(1)}</div>
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
              return (
                <button
                  key={id}
                  type="button"
                  className={`legend-pill ${hoveredReagent === id ? 'active' : ''}`}
                  onMouseEnter={() => setHoveredReagent(id)}
                  onMouseLeave={() => setHoveredReagent(null)}
                >
                  <span className="color-dot" style={{ background: col }} />
                  <span>{def.zhName}</span>
                </button>
              );
            })}
            {allReagentIds.length === 0 && <span className="dose-sub">暂无体内试剂</span>}
          </div>
        </div>

        <div className="chart-wrap">
          <svg
            viewBox={`0 0 ${W} ${H2}`}
            className="chart-svg"
            onMouseMove={(e) => handleSvgPointer(e, false)}
            onMouseLeave={() => setHoveredTime(null)}
            onClick={(e) => handleSvgPointer(e, true)}
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

            {/* Hover OD threshold reference line */}
            {hoveredReagent && REAGENTS[hoveredReagent]?.overdoseThreshold > 0 && (
              <g>
                <line
                  x1={PAD_L}
                  x2={W - PAD_R}
                  y1={y2Of(REAGENTS[hoveredReagent].overdoseThreshold)}
                  y2={y2Of(REAGENTS[hoveredReagent].overdoseThreshold)}
                  stroke="#ef4444"
                  strokeDasharray="4 3"
                />
                <text
                  x={W - PAD_R - 4}
                  y={y2Of(REAGENTS[hoveredReagent].overdoseThreshold) - 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="#fca5a5"
                >
                  {REAGENTS[hoveredReagent].zhName} 基础OD: {REAGENTS[hoveredReagent].overdoseThreshold}u
                </text>
              </g>
            )}

            {allReagentIds.map((id) => {
              const def = REAGENTS[id];
              if (!def) return null;
              const col = getDisplayColor(def.color);
              const dimmed = hoveredReagent !== null && hoveredReagent !== id;
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
          </svg>

          {hoveredTime !== null && displaySnap.bloodReagents.length > 0 && (
            <div
              className="chart-tooltip mono"
              style={{
                top: 12,
                left: displayTime > maxTime * 0.65 ? 54 : undefined,
                right: displayTime <= maxTime * 0.65 ? 24 : undefined,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4 }}>血液浓度 t = {displaySnap.time}s</div>
              {displaySnap.bloodReagents.map((r) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ color: getDisplayColor(r.color) }}>{r.zhName}</span>
                  <span>
                    {r.volume.toFixed(2)}u {r.overdosed ? 'OD!' : ''}
                  </span>
                </div>
              ))}
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
                  <span className="color-dot" style={{ background: o.color }} />
                  {o.label}
                </span>
              ))
            ) : (
              <>
                <span className="tag-chip">
                  <span className="color-dot" style={{ background: 'var(--c-temp)' }} />
                  体表温度 (K)
                </span>
                <span className="tag-chip">
                  <span className="color-dot" style={{ background: '#fbbf24' }} />
                  核心体温 (K)
                </span>
                <span className="tag-chip">
                  <span className="color-dot" style={{ background: 'var(--c-blood)' }} />
                  有效血量 (右轴 u)
                </span>
              </>
            )}
          </div>
        </div>

        <div className="chart-wrap">
          <svg
            viewBox={`0 0 ${W} ${H3}`}
            className="chart-svg"
            onMouseMove={(e) => handleSvgPointer(e, false)}
            onMouseLeave={() => setHoveredTime(null)}
            onClick={(e) => handleSvgPointer(e, true)}
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
                    points={buildPolyline(
                      snapshots.map((s) => {
                        const org = s.organs[o.slot];
                        const pct = org.maxHealth > 0 ? (org.damage / org.maxHealth) * 100 : 100;
                        return [xOf(s.time), y3OrganOf(pct)];
                      }),
                    )}
                  />
                ))}
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
          </svg>
        </div>
      </section>
    </div>
  );
}
