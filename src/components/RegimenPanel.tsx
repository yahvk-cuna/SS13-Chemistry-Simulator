import { AlertTriangle, Copy, Plus, Syringe, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { REAGENTS, computeEffectiveOD, getDisplayColor } from '../engine/reagents';
import type { DeliveryMethod, DoseEvent, ReagentDef } from '../engine/types';
import { ReagentPickerModal } from './ReagentPickerModal';

interface RegimenPanelProps {
  doses: DoseEvent[];
  onChange: (next: DoseEvent[]) => void;
}

const QUICK_ADD_IDS = [
  'libital',
  'lenturi',
  'sal_acid',
  'oxandrolone',
  'multiver',
  'syriniver',
  'salbutamol',
  'atropine',
];

const DELIVERY_OPTIONS: { value: DeliveryMethod; label: string }[] = [
  { value: 'INJECT', label: '注射 (INJECT)' },
  { value: 'INGEST', label: '口服/药丸 (INGEST)' },
  { value: 'PATCH', label: '缓释贴片 (PATCH 0.75u/t)' },
  { value: 'PATCH_INSTANT', label: '即时贴片 (PATCH_INSTANT)' },
  { value: 'IV_DRIP', label: '静脉滴注 (IV_DRIP)' },
  { value: 'TOUCH', label: '接触泼洒 (TOUCH)' },
  { value: 'VAPOR', label: '蒸气喷洒 (VAPOR)' },
];

export function RegimenPanel({ doses, onChange }: RegimenPanelProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const addReagent = (def: ReagentDef) => {
    const defaultMethod: DeliveryMethod =
      def.id === 'synthflesh' ? 'PATCH_INSTANT' : def.id === 'probital' ? 'INGEST' : 'INJECT';
    const next: DoseEvent = {
      id: `dose-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      reagentId: def.id,
      volume: def.id === 'syriniver' ? 5 : 15,
      method: defaultMethod,
      startTime: 0,
      purity: def.defaultPurity,
      temp: 300,
      ivRate: 5,
      enabled: true,
    };
    onChange([...doses, next]);
  };

  const updateDose = (id: string, patch: Partial<DoseEvent>) => {
    onChange(doses.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const duplicateDose = (dose: DoseEvent) => {
    const copy: DoseEvent = {
      ...dose,
      id: `dose-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    onChange([...doses, copy]);
  };

  const removeDose = (id: string) => {
    onChange(doses.filter((d) => d.id !== id));
  };

  const preflightWarnings = useMemo(() => {
    const warnings: { level: 'danger' | 'warn' | 'info'; text: string }[] = [];
    const active = doses.filter((d) => d.enabled && d.volume > 0);
    const ids = new Set(active.map((d) => d.reagentId));

    if (ids.has('penthrite') && (ids.has('epinephrine') || ids.has('atropine'))) {
      warnings.push({
        level: 'danger',
        text: '配伍禁忌：彭斯莱特与肾上腺素/阿托品相遇会立即体内爆炸并清空所有血液试剂！',
      });
    }

    if (ids.has('epinephrine') && ids.has('lexorin')) {
      warnings.push({
        level: 'warn',
        text: '药理冲突：肾上腺素遇到莱克索林时将停止治疗并生成组胺。',
      });
    }

    for (const d of active) {
      const def = REAGENTS[d.reagentId];
      if (!def) continue;
      if (d.method !== 'IV_DRIP' && d.method !== 'PATCH') {
        const effOD = computeEffectiveOD(def, d.purity);
        if (effOD > 0 && d.volume >= effOD) {
          warnings.push({
            level: 'warn',
            text: `过量预警：${def.zhName} 单次 ${d.volume}u ≥ 有效过量阈值 ${effOD.toFixed(1)}u。`,
          });
        }
      }
      if (def.inverseChemVal > 0 && d.purity < def.inverseChemVal) {
        const invDef = def.inverseChemId ? REAGENTS[def.inverseChemId] : null;
        warnings.push({
          level: 'warn',
          text: `逆反应预警：${def.zhName} 纯度 ${(d.purity * 100).toFixed(0)}% < ${(def.inverseChemVal * 100).toFixed(0)}%，入体将转化为 ${invDef?.zhName ?? '逆产物'}。`,
        });
      }
      if (d.reagentId === 'synthflesh' && (d.method === 'INJECT' || d.method === 'INGEST')) {
        warnings.push({
          level: 'info',
          text: '给药方式提示：合成肉仅在 贴片/接触/蒸气 时瞬间生效，注射或口服无治疗效果。',
        });
      }
    }

    if ((ids.has('calomel') || ids.has('pen_acid')) && active.length > 1) {
      warnings.push({
        level: 'info',
        text: '清血药提示：甘汞与喷替酸会同时加速清除体内共存的其他有效治疗药物。',
      });
    }

    return warnings;
  }, [doses]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <Syringe size={15} style={{ color: 'var(--accent)' }} />
          给药组合方案 ({doses.filter((d) => d.enabled).length} 项启用)
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setPickerOpen(true)}>
          <Plus size={13} />
          添加药品
        </button>
      </div>

      <div className="panel-body">
        <div>
          <div className="control-label" style={{ marginBottom: 5 }}>
            常用速添
          </div>
          <div className="quick-chips">
            {QUICK_ADD_IDS.map((id) => {
              const r = REAGENTS[id];
              if (!r) return null;
              return (
                <button key={id} type="button" className="quick-chip" onClick={() => addReagent(r)}>
                  <span className="color-dot" style={{ background: getDisplayColor(r.color) }} />
                  <span>{r.zhName}</span>
                </button>
              );
            })}
          </div>
        </div>

        {preflightWarnings.map((w, idx) => (
          <div key={idx} className={`warning-banner ${w.level}`}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{w.text}</span>
            </div>
          </div>
        ))}

        {doses.length === 0 && (
          <div style={{ padding: 14, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            尚未添加任何药品，请点击「添加药品」或上方速添按钮。
          </div>
        )}

        {doses.map((dose) => {
          const def = REAGENTS[dose.reagentId];
          if (!def) return null;
          const effOD = computeEffectiveOD(def, dose.purity);
          return (
            <div key={dose.id} className={`dose-card ${dose.enabled ? '' : 'disabled'}`}>
              <div className="dose-head">
                <label className="dose-name" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={dose.enabled}
                    onChange={(e) => updateDose(dose.id, { enabled: e.target.checked })}
                  />
                  <span className="color-dot" style={{ background: getDisplayColor(def.color) }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {def.zhName}
                  </span>
                  <span className="dose-sub">{def.enName}</span>
                </label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    className="btn btn-icon"
                    title="复制一项"
                    onClick={() => duplicateDose(dose)}
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon btn-danger"
                    title="移除"
                    onClick={() => removeDose(dose.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              <div className="slider-row">
                <span className="slider-label">剂量(u)</span>
                <input
                  type="range"
                  min={0.5}
                  max={100}
                  step={0.5}
                  value={dose.volume}
                  onChange={(e) => updateDose(dose.id, { volume: Number(e.target.value) })}
                />
                <input
                  type="number"
                  className="num-input-sm"
                  min={0.1}
                  max={500}
                  step={0.5}
                  value={dose.volume}
                  onChange={(e) => updateDose(dose.id, { volume: Math.max(0, Number(e.target.value) || 0) })}
                />
              </div>

              <div className="grid-2">
                <div>
                  <div className="control-label" style={{ marginBottom: 3 }}>
                    给药方式
                  </div>
                  <select
                    className="ui-select"
                    style={{ width: '100%' }}
                    value={dose.method}
                    onChange={(e) => updateDose(dose.id, { method: e.target.value as DeliveryMethod })}
                  >
                    {DELIVERY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="control-label" style={{ marginBottom: 3 }}>
                    给药时间 (s)
                  </div>
                  <input
                    type="number"
                    className="ui-input mono"
                    style={{ width: '100%' }}
                    min={0}
                    max={600}
                    step={2}
                    value={dose.startTime}
                    onChange={(e) => updateDose(dose.id, { startTime: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
                  <span>
                    纯度 <strong className="mono">{Math.round(dose.purity * 100)}%</strong>
                    {def.inverseChemVal > 0 && ` (逆 <${Math.round(def.inverseChemVal * 100)}%)`}
                  </span>
                  <span className="mono">
                    {effOD > 0 ? `有效OD ${effOD.toFixed(1)}u` : '无OD'} · {(def.metabolizationRate * 2).toFixed(2)}u/t
                  </span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={dose.purity}
                  onChange={(e) => updateDose(dose.id, { purity: Number(e.target.value) })}
                />
              </div>

              {(dose.method === 'IV_DRIP' || dose.reagentId === 'seiver') && (
                <div className="grid-2">
                  {dose.method === 'IV_DRIP' && (
                    <div>
                      <div className="control-label" style={{ marginBottom: 3 }}>
                        滴速 (u/tick)
                      </div>
                      <input
                        type="number"
                        className="ui-input mono"
                        style={{ width: '100%' }}
                        min={0.5}
                        max={20}
                        step={0.5}
                        value={dose.ivRate}
                        onChange={(e) => updateDose(dose.id, { ivRate: Math.max(0.5, Number(e.target.value) || 1) })}
                      />
                    </div>
                  )}
                  {dose.reagentId === 'seiver' && (
                    <div>
                      <div className="control-label" style={{ marginBottom: 3 }}>
                        药液温度 (K)
                      </div>
                      <input
                        type="number"
                        className="ui-input mono"
                        style={{ width: '100%' }}
                        min={5}
                        max={1200}
                        step={10}
                        value={dose.temp}
                        onChange={(e) => updateDose(dose.id, { temp: Math.max(5, Number(e.target.value) || 300) })}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ReagentPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={addReagent} />
    </section>
  );
}
