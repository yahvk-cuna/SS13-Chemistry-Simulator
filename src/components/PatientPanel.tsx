import { ChevronDown, ChevronRight, Dices, HeartPulse, ShieldAlert, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BLOOD_VOLUME_NORMAL, BODYTEMP_NORMAL, LIVER_PRESETS, MAX_HEALTH } from '../engine/constants';
import {
  EXTREME_ALLERGY_CANDIDATES,
  REAGENTS,
  REAGENT_LIST,
  getDisplayColor,
  isExtremeAllergyCandidate,
  rollRandomAllergies,
} from '../engine/reagents';
import type { EnvironmentPreset, LiverTypeId, OrganSlot, PatientConfig, WoundSeverity } from '../engine/types';

interface PatientPanelProps {
  patient: PatientConfig;
  onChange: (next: PatientConfig) => void;
}

const DAMAGE_FIELDS: { key: 'brute' | 'burn' | 'tox' | 'oxy' | 'stamina'; label: string; color: string; max: number }[] = [
  { key: 'brute', label: '钝伤', color: 'var(--c-brute)', max: 200 },
  { key: 'burn', label: '烧伤', color: 'var(--c-burn)', max: 200 },
  { key: 'tox', label: '毒素', color: 'var(--c-tox)', max: 200 },
  { key: 'oxy', label: '窒息', color: 'var(--c-oxy)', max: 200 },
  { key: 'stamina', label: '耐力', color: 'var(--c-stamina)', max: 120 },
];

const ORGAN_LABELS: { slot: OrganSlot; label: string; max: number }[] = [
  { slot: 'liver', label: '肝脏', max: 100 },
  { slot: 'heart', label: '心脏', max: 100 },
  { slot: 'lungs', label: '肺', max: 100 },
  { slot: 'stomach', label: '胃', max: 100 },
  { slot: 'brain', label: '大脑', max: 200 },
  { slot: 'eyes', label: '眼睛', max: 50 },
  { slot: 'ears', label: '耳朵', max: 100 },
];

function computeInitialStat(hp: number, brain: number, blood: number) {
  if (hp <= -100 || brain >= 200 || blood <= 112) return 'DEAD' as const;
  if (hp <= -30) return 'HARD_CRIT' as const;
  if (hp <= 0) return 'SOFT_CRIT' as const;
  return 'STABLE' as const;
}

const STAT_ZH = {
  STABLE: '稳定 (Stable)',
  SOFT_CRIT: '轻危 (Soft Crit)',
  HARD_CRIT: '重危 (Hard Crit)',
  DEAD: '死亡 (Dead)',
};

export function PatientPanel({ patient, onChange }: PatientPanelProps) {
  const [openOrgans, setOpenOrgans] = useState(false);
  const [openBlood, setOpenBlood] = useState(false);
  const [openEnv, setOpenEnv] = useState(false);
  const [openAllergy, setOpenAllergy] = useState(false);
  const [allergyQuery, setAllergyQuery] = useState('');
  const [allergyPoolOnly, setAllergyPoolOnly] = useState(true);

  const allergyPoolList = useMemo(() => {
    const base = allergyPoolOnly ? EXTREME_ALLERGY_CANDIDATES : REAGENT_LIST;
    const q = allergyQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (r) =>
        r.zhName.toLowerCase().includes(q) ||
        r.enName.toLowerCase().includes(q) ||
        (r.aliases ?? []).some((a) => a.toLowerCase().includes(q)),
    );
  }, [allergyPoolOnly, allergyQuery]);

  const toggleAllergyId = (reagentId: string) => {
    const exists = patient.allergies.includes(reagentId);
    const next = exists ? patient.allergies.filter((id) => id !== reagentId) : [...patient.allergies, reagentId];
    setField('allergies', next);
  };

  const allergySummaryParts: string[] = [];
  if (patient.allergies.length > 0) allergySummaryParts.push(`${patient.allergies.length} 种过敏原`);
  if (patient.chemicalAllergy) allergySummaryParts.push('化学过敏');
  const allergySummaryLabel = allergySummaryParts.length > 0 ? allergySummaryParts.join(' · ') : '无';

  const initialHP = MAX_HEALTH - patient.brute - patient.burn - patient.tox - patient.oxy;
  const initialStat = computeInitialStat(initialHP, patient.organs.brain, patient.bloodVolume);

  const setField = <K extends keyof PatientConfig>(key: K, value: PatientConfig[K]) => {
    onChange({ ...patient, [key]: value });
  };

  const setOrgan = (slot: OrganSlot, value: number) => {
    onChange({
      ...patient,
      organs: { ...patient.organs, [slot]: Math.max(0, value) },
    });
  };

  const applyEnvironment = (env: EnvironmentPreset) => {
    if (env === 'normal') {
      onChange({ ...patient, environment: 'normal', ambientTemp: 293.15, bodyTemp: BODYTEMP_NORMAL });
    } else if (env === 'cryo') {
      onChange({ ...patient, environment: 'cryo', ambientTemp: 170, bodyTemp: 220, unconscious: true });
    } else if (env === 'hot') {
      onChange({ ...patient, environment: 'hot', ambientTemp: 420, bodyTemp: 390 });
    } else {
      onChange({ ...patient, environment: 'vacuum', ambientTemp: 2.7 });
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <HeartPulse size={15} style={{ color: 'var(--c-brute)' }} />
          患者初始伤势与生理状态
        </div>
        <span className={`stat-badge stat-${initialStat}`}>
          HP {initialHP.toFixed(0)} · {STAT_ZH[initialStat]}
        </span>
      </div>

      <div className="panel-body">
        <div className="quick-chips">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onChange({ ...patient, brute: 0, burn: 0, tox: 0, oxy: 0, stamina: 0 })}
          >
            清空伤势
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onChange({ ...patient, brute: 55, burn: 45, tox: 20, oxy: 15, stamina: 0 })}
          >
            中度外伤
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onChange({ ...patient, brute: 85, burn: 30, tox: 15, oxy: 45, stamina: 0 })}
          >
            重危濒死 (-75HP)
          </button>
        </div>

        {DAMAGE_FIELDS.map((f) => (
          <div className="slider-row" key={f.key}>
            <div className="slider-label">
              <span className="color-dot" style={{ background: f.color }} />
              <span>{f.label}</span>
            </div>
            <input
              type="range"
              min={0}
              max={f.max}
              step={1}
              value={patient[f.key]}
              onChange={(e) => setField(f.key, Number(e.target.value))}
            />
            <input
              type="number"
              className="num-input-sm"
              min={0}
              max={400}
              value={patient[f.key]}
              onChange={(e) => setField(f.key, Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        ))}

        {/* Organs & Liver */}
        <button type="button" className="collapse-btn" onClick={() => setOpenOrgans((v) => !v)}>
          <span>器官损伤与肝脏型号 ({LIVER_PRESETS[patient.liverType].label.split(' ')[0]})</span>
          {openOrgans ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {openOrgans && (
          <div className="sub-box">
            <div>
              <div className="control-label" style={{ marginBottom: 4 }}>
                肝脏类型
              </div>
              <select
                className="ui-select"
                style={{ width: '100%' }}
                value={patient.liverType}
                onChange={(e) => setField('liverType', e.target.value as LiverTypeId)}
              >
                {Object.values(LIVER_PRESETS).map((lp) => (
                  <option key={lp.id} value={lp.id}>
                    {lp.label}
                  </option>
                ))}
              </select>
            </div>
            {ORGAN_LABELS.map((o) => {
              const orgMax =
                o.slot === 'liver'
                  ? LIVER_PRESETS[patient.liverType].maxHealth || 100
                  : o.max;
              return (
                <div className="slider-row" key={o.slot}>
                  <span className="slider-label">{o.label}</span>
                  <input
                    type="range"
                    min={0}
                    max={orgMax}
                    step={1}
                    disabled={o.slot === 'liver' && patient.liverType === 'none'}
                    value={patient.organs[o.slot]}
                    onChange={(e) => setOrgan(o.slot, Number(e.target.value))}
                  />
                  <input
                    type="number"
                    className="num-input-sm"
                    min={0}
                    max={orgMax}
                    disabled={o.slot === 'liver' && patient.liverType === 'none'}
                    value={patient.organs[o.slot]}
                    onChange={(e) => setOrgan(o.slot, Number(e.target.value) || 0)}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Blood & Wounds */}
        <button type="button" className="collapse-btn" onClick={() => setOpenBlood((v) => !v)}>
          <span>
            血液与伤口 ({((patient.bloodVolume / BLOOD_VOLUME_NORMAL) * 100).toFixed(0)}% 血量 · 伤口 {patient.woundCount})
          </span>
          {openBlood ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {openBlood && (
          <div className="sub-box">
            <div className="slider-row">
              <span className="slider-label">血量(u)</span>
              <input
                type="range"
                min={0}
                max={BLOOD_VOLUME_NORMAL}
                step={10}
                value={patient.bloodVolume}
                onChange={(e) => setField('bloodVolume', Number(e.target.value))}
              />
              <input
                type="number"
                className="num-input-sm"
                min={0}
                max={BLOOD_VOLUME_NORMAL}
                value={patient.bloodVolume}
                onChange={(e) => setField('bloodVolume', Number(e.target.value) || 0)}
              />
            </div>
            <div className="slider-row">
              <span className="slider-label">出血流速</span>
              <input
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={patient.bleedFlow}
                onChange={(e) => setField('bleedFlow', Number(e.target.value))}
              />
              <input
                type="number"
                className="num-input-sm"
                min={0}
                max={30}
                step={0.5}
                value={patient.bleedFlow}
                onChange={(e) => setField('bleedFlow', Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div className="grid-2">
              <div>
                <div className="control-label" style={{ marginBottom: 4 }}>
                  伤口严重度
                </div>
                <select
                  className="ui-select"
                  style={{ width: '100%' }}
                  value={patient.woundSeverity}
                  onChange={(e) => {
                    const sev = e.target.value as WoundSeverity;
                    onChange({
                      ...patient,
                      woundSeverity: sev,
                      woundCount: sev === 'none' ? 0 : Math.max(1, patient.woundCount),
                    });
                  }}
                >
                  <option value="none">无严重伤口</option>
                  <option value="moderate">中度 (33点)</option>
                  <option value="severe">重度 (66点)</option>
                  <option value="critical">危重 (99点)</option>
                </select>
              </div>
              <div>
                <div className="control-label" style={{ marginBottom: 4 }}>
                  伤口数量
                </div>
                <input
                  type="number"
                  className="ui-input mono"
                  style={{ width: '100%' }}
                  min={0}
                  max={6}
                  disabled={patient.woundSeverity === 'none'}
                  value={patient.woundCount}
                  onChange={(e) => setField('woundCount', Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>
          </div>
        )}

        {/* Temperature, Environment & Status */}
        <button type="button" className="collapse-btn" onClick={() => setOpenEnv((v) => !v)}>
          <span>
            体温、代谢效率与状态 ({patient.bodyTemp.toFixed(0)}K / {(patient.bodyTemp - 273.15).toFixed(0)}°C)
          </span>
          {openEnv ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {openEnv && (
          <div className="sub-box">
            <div>
              <div className="control-label" style={{ marginBottom: 4 }}>
                环境预设
              </div>
              <div className="grid-2">
                {(
                  [
                    ['normal', '常温气室 (293K)'],
                    ['cryo', '低温冷冻仓 (170K)'],
                    ['hot', '高温火场 (420K)'],
                    ['vacuum', '真空失压 (2.7K)'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`btn btn-sm ${patient.environment === id ? 'btn-primary' : ''}`}
                    onClick={() => applyEnvironment(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="slider-row">
              <span className="slider-label">初始体温</span>
              <input
                type="range"
                min={100}
                max={500}
                step={5}
                value={patient.bodyTemp}
                onChange={(e) => setField('bodyTemp', Number(e.target.value))}
              />
              <input
                type="number"
                className="num-input-sm"
                min={50}
                max={1000}
                value={Math.round(patient.bodyTemp)}
                onChange={(e) => setField('bodyTemp', Math.max(50, Number(e.target.value) || 310))}
              />
            </div>

            <div className="grid-2">
              <div>
                <div className="control-label" style={{ marginBottom: 4 }}>
                  饱食代谢效率
                </div>
                <select
                  className="ui-select mono"
                  style={{ width: '100%' }}
                  value={patient.metabolismEfficiency}
                  onChange={(e) => setField('metabolismEfficiency', Number(e.target.value))}
                >
                  <option value={0.8}>0.8x (饥饿)</option>
                  <option value={1.0}>1.0x (正常)</option>
                  <option value={1.25}>1.25x (饱足)</option>
                </select>
              </div>
              <div>
                <div className="control-label" style={{ marginBottom: 4 }}>
                  衣物生物防护
                </div>
                <input
                  type="number"
                  className="ui-input mono"
                  style={{ width: '100%' }}
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(patient.touchProtection * 100)}
                  onChange={(e) => setField('touchProtection', Math.min(1, Math.max(0, (Number(e.target.value) || 0) / 100)))}
                />
              </div>
            </div>

            <div className="quick-chips">
              <label className={`checkbox-pill ${patient.onFire ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={patient.onFire}
                  onChange={(e) =>
                    onChange({ ...patient, onFire: e.target.checked, fireStacks: e.target.checked ? 10 : 0 })
                  }
                />
                着火中
              </label>
              <label className={`checkbox-pill ${patient.irradiated ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={patient.irradiated}
                  onChange={(e) => setField('irradiated', e.target.checked)}
                />
                受辐射
              </label>
              <label className={`checkbox-pill ${patient.unconscious ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={patient.unconscious}
                  onChange={(e) => setField('unconscious', e.target.checked)}
                />
                昏迷/睡眠
              </label>
              <label className={`checkbox-pill ${patient.inStasis ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={patient.inStasis}
                  onChange={(e) => setField('inStasis', e.target.checked)}
                />
                静滞床
              </label>
              <label className={`checkbox-pill ${patient.husked ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={patient.husked}
                  onChange={(e) => setField('husked', e.target.checked)}
                />
                焦尸化
              </label>
            </div>
          </div>
        )}

        {/* Medicine & Chemical Allergies */}
        <button type="button" className="collapse-btn" onClick={() => setOpenAllergy((v) => !v)}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <ShieldAlert size={13} style={{ color: allergySummaryParts.length > 0 ? 'var(--danger)' : 'var(--text-muted)' }} />
            <span>药物过敏与免疫异常 ({allergySummaryLabel})</span>
          </span>
          {openAllergy ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {openAllergy && (
          <div className="sub-box">
            <label
              className={`checkbox-pill ${patient.chemicalAllergy ? 'checked' : ''}`}
              style={{ justifyContent: 'space-between', width: '100%' }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <input
                  type="checkbox"
                  checked={patient.chemicalAllergy}
                  onChange={(e) => setField('chemicalAllergy', e.target.checked)}
                />
                <span>启用「化学过敏」基因突变 (Chemical Allergy)</span>
              </span>
            </label>
            <div className="dose-sub" style={{ lineHeight: 1.4 }}>
              代谢存量 ≥1u 的非豁免药物时按概率引起毒素、失血（下限 70%）与呼吸受阻；豁免所有「无过敏」药物及甘露醇、突变酮，<strong>不受肾上腺素阻断</strong>。
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 7, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5, flexWrap: 'wrap' }}>
                <span className="control-label">极端药物过敏 ({patient.allergies.length})</span>
                <div style={{ display: 'flex', gap: 5 }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    title="按上游 GLOB.allergy_reagent_blacklist 规则从合规药物池随机抽取 6 种过敏原"
                    onClick={() => setField('allergies', rollRandomAllergies(6))}
                  >
                    <Dices size={11} />
                    按上游随机抽 6 种
                  </button>
                  {patient.allergies.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setField('allergies', [])}
                    >
                      清空
                    </button>
                  )}
                </div>
              </div>

              {patient.allergies.length > 0 && (
                <div className="quick-chips">
                  {patient.allergies.map((id) => {
                    const r = REAGENTS[id];
                    if (!r) return null;
                    const inPool = isExtremeAllergyCandidate(r);
                    return (
                      <button
                        key={id}
                        type="button"
                        className="tag-chip danger"
                        style={{ cursor: 'pointer' }}
                        title="点击移除此过敏原"
                        onClick={() => toggleAllergyId(id)}
                      >
                        <span className="color-dot" style={{ background: getDisplayColor(r.color) }} />
                        <span>
                          {r.zhName}
                          {!inPool ? ' (沙盒)' : ''}
                        </span>
                        <X size={10} />
                      </button>
                    );
                  })}
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="text"
                  className="ui-input"
                  style={{ flex: 1, minWidth: 0, fontSize: 11.5 }}
                  placeholder="搜索过敏原（中/英文/别名）..."
                  value={allergyQuery}
                  onChange={(e) => setAllergyQuery(e.target.value)}
                />
                <label className={`checkbox-pill ${allergyPoolOnly ? 'checked' : ''}`} style={{ whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    checked={allergyPoolOnly}
                    onChange={(e) => setAllergyPoolOnly(e.target.checked)}
                  />
                  <span>仅合规池 ({EXTREME_ALLERGY_CANDIDATES.length})</span>
                </label>
              </div>

              <div className="allergy-picker-list">
                {allergyPoolList.map((r) => {
                  const selected = patient.allergies.includes(r.id);
                  const inPool = isExtremeAllergyCandidate(r);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`allergy-picker-row ${selected ? 'selected' : ''}`}
                      onClick={() => toggleAllergyId(r.id)}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                        <span className="color-dot" style={{ background: getDisplayColor(r.color) }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.zhName}
                        </span>
                        <span className="dose-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.enName}
                        </span>
                      </span>
                      <span className="dose-sub mono" style={{ flexShrink: 0, color: selected ? '#fca5a5' : undefined }}>
                        {selected ? '已选' : inPool ? '上游合规' : '沙盒'}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="dose-sub" style={{ lineHeight: 1.4 }}>
                无肾上腺素时每 tick +6 毒 / +6u 组胺并有 19% 概率呕吐与随机内脏伤；肾上腺素可阻断但暂停过敏原消耗，需苯海拉明清组胺并清血。
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
