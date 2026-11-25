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
import { NumericInput } from './NumericInput';

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
  const [openPanel, setOpenPanel] = useState(true);
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
    <section className="panel" aria-labelledby="patient-panel-heading">
      <div className={`panel-header ${openPanel ? '' : 'collapsed'}`}>
        <button
          type="button"
          className="panel-collapse-toggle"
          aria-expanded={openPanel}
          aria-controls="patient-panel-body"
          onClick={() => setOpenPanel((v) => !v)}
        >
          {openPanel ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
          <span className="panel-title" id="patient-panel-heading">
            <HeartPulse size={15} style={{ color: 'var(--c-brute)' }} aria-hidden="true" />
            患者初始伤势与生理状态
          </span>
        </button>
        <span
          className={`stat-badge stat-${initialStat}`}
          aria-label={`初始生命状态：HP ${initialHP.toFixed(0)}，${STAT_ZH[initialStat]}`}
        >
          HP {initialHP.toFixed(0)} · {STAT_ZH[initialStat]}
        </span>
      </div>

      {openPanel && (
      <div className="panel-body" id="patient-panel-body">
        <div className="quick-chips" role="group" aria-label="伤势快捷预设">
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

        <fieldset className="fieldset-group">
          <legend className="sr-only">初始伤害数值</legend>
          {DAMAGE_FIELDS.map((f) => (
            <div className="slider-row" key={f.key}>
              <label className="slider-label" htmlFor={`patient-dmg-${f.key}`}>
                <span className="color-dot" style={{ background: f.color }} aria-hidden="true" />
                <span>{f.label}</span>
              </label>
              <input
                id={`patient-dmg-${f.key}`}
                type="range"
                min={0}
                max={f.max}
                step={1}
                value={patient[f.key]}
                onChange={(e) => setField(f.key, Number(e.target.value))}
              />
              <NumericInput
                className="num-input-sm"
                min={0}
                max={400}
                fallback={0}
                ariaLabel={`${f.label}数值`}
                value={patient[f.key]}
                onCommit={(v) => setField(f.key, v)}
              />
            </div>
          ))}
        </fieldset>

        {/* Organs & Liver */}
        <button
          type="button"
          className="collapse-btn"
          aria-expanded={openOrgans}
          aria-controls="patient-organs-panel"
          onClick={() => setOpenOrgans((v) => !v)}
        >
          <span>器官损伤与肝脏型号 ({LIVER_PRESETS[patient.liverType].label.split(' ')[0]})</span>
          {openOrgans ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
        </button>
        {openOrgans && (
          <fieldset className="sub-box" id="patient-organs-panel">
            <legend className="sr-only">器官损伤与肝脏型号</legend>
            <div>
              <label className="control-label" htmlFor="patient-liver-type" style={{ marginBottom: 4, display: 'block' }}>
                肝脏类型
              </label>
              <select
                id="patient-liver-type"
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
                  <label className="slider-label" htmlFor={`patient-organ-${o.slot}`}>
                    {o.label}
                  </label>
                  <input
                    id={`patient-organ-${o.slot}`}
                    type="range"
                    min={0}
                    max={orgMax}
                    step={1}
                    disabled={o.slot === 'liver' && patient.liverType === 'none'}
                    value={patient.organs[o.slot]}
                    onChange={(e) => setOrgan(o.slot, Number(e.target.value))}
                  />
                  <NumericInput
                    className="num-input-sm"
                    min={0}
                    max={orgMax}
                    fallback={0}
                    ariaLabel={`${o.label}损伤数值`}
                    disabled={o.slot === 'liver' && patient.liverType === 'none'}
                    value={patient.organs[o.slot]}
                    onCommit={(v) => setOrgan(o.slot, v)}
                  />
                </div>
              );
            })}
          </fieldset>
        )}

        {/* Blood & Wounds */}
        <button
          type="button"
          className="collapse-btn"
          aria-expanded={openBlood}
          aria-controls="patient-blood-panel"
          onClick={() => setOpenBlood((v) => !v)}
        >
          <span>
            血液与伤口 ({((patient.bloodVolume / BLOOD_VOLUME_NORMAL) * 100).toFixed(0)}% 血量 · 伤口 {patient.woundCount})
          </span>
          {openBlood ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
        </button>
        {openBlood && (
          <fieldset className="sub-box" id="patient-blood-panel">
            <legend className="sr-only">血液与伤口</legend>
            <div className="slider-row">
              <label className="slider-label" htmlFor="patient-blood-volume">
                血量(u)
              </label>
              <input
                id="patient-blood-volume"
                type="range"
                min={0}
                max={BLOOD_VOLUME_NORMAL}
                step={10}
                value={patient.bloodVolume}
                onChange={(e) => setField('bloodVolume', Number(e.target.value))}
              />
              <NumericInput
                className="num-input-sm"
                min={0}
                max={BLOOD_VOLUME_NORMAL}
                fallback={0}
                ariaLabel="血量数值(u)"
                value={patient.bloodVolume}
                onCommit={(v) => setField('bloodVolume', v)}
              />
            </div>
            <div className="slider-row">
              <label className="slider-label" htmlFor="patient-bleed-flow">
                出血流速
              </label>
              <input
                id="patient-bleed-flow"
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={patient.bleedFlow}
                onChange={(e) => setField('bleedFlow', Number(e.target.value))}
              />
              <NumericInput
                className="num-input-sm"
                min={0}
                max={30}
                step={0.5}
                fallback={0}
                ariaLabel="出血流速数值"
                value={patient.bleedFlow}
                onCommit={(v) => setField('bleedFlow', v)}
              />
            </div>
            <div className="grid-2">
              <div>
                <label className="control-label" htmlFor="patient-wound-severity" style={{ marginBottom: 4, display: 'block' }}>
                  伤口严重度
                </label>
                <select
                  id="patient-wound-severity"
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
                <NumericInput
                  className="ui-input mono"
                  style={{ width: '100%' }}
                  min={0}
                  max={6}
                  integer
                  fallback={0}
                  ariaLabel="伤口数量"
                  disabled={patient.woundSeverity === 'none'}
                  value={patient.woundCount}
                  onCommit={(v) => setField('woundCount', v)}
                />
              </div>
            </div>
          </fieldset>
        )}

        {/* Temperature, Environment & Status */}
        <button
          type="button"
          className="collapse-btn"
          aria-expanded={openEnv}
          aria-controls="patient-env-panel"
          onClick={() => setOpenEnv((v) => !v)}
        >
          <span>
            体温、代谢效率与状态 ({patient.bodyTemp.toFixed(0)}K / {(patient.bodyTemp - 273.15).toFixed(0)}°C)
          </span>
          {openEnv ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
        </button>
        {openEnv && (
          <fieldset className="sub-box" id="patient-env-panel">
            <legend className="sr-only">体温、代谢效率与状态</legend>
            <div>
              <div className="control-label" id="patient-env-presets-label" style={{ marginBottom: 4 }}>
                环境预设
              </div>
              <div className="grid-2" role="group" aria-labelledby="patient-env-presets-label">
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
                    aria-pressed={patient.environment === id}
                    onClick={() => applyEnvironment(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="slider-row">
              <label className="slider-label" htmlFor="patient-body-temp">
                初始体温
              </label>
              <input
                id="patient-body-temp"
                type="range"
                min={100}
                max={500}
                step={5}
                value={patient.bodyTemp}
                onChange={(e) => setField('bodyTemp', Number(e.target.value))}
              />
              <NumericInput
                className="num-input-sm"
                min={50}
                max={1000}
                integer
                fallback={310}
                ariaLabel="初始体温数值(K)"
                value={Math.round(patient.bodyTemp)}
                onCommit={(v) => setField('bodyTemp', v)}
              />
            </div>

            <div className="grid-2">
              <div>
                <label className="control-label" htmlFor="patient-metab-eff" style={{ marginBottom: 4, display: 'block' }}>
                  饱食代谢效率
                </label>
                <select
                  id="patient-metab-eff"
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
                <NumericInput
                  className="ui-input mono"
                  style={{ width: '100%' }}
                  min={0}
                  max={100}
                  step={5}
                  integer
                  fallback={0}
                  ariaLabel="衣物生物防护百分比"
                  value={Math.round(patient.touchProtection * 100)}
                  onCommit={(v) => setField('touchProtection', v / 100)}
                />
              </div>
            </div>

            <div className="quick-chips" role="group" aria-label="生理与环境状态开关">
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
          </fieldset>
        )}

        {/* Medicine & Chemical Allergies */}
        <button
          type="button"
          className="collapse-btn"
          aria-expanded={openAllergy}
          aria-controls="patient-allergy-panel"
          onClick={() => setOpenAllergy((v) => !v)}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <ShieldAlert size={13} style={{ color: allergySummaryParts.length > 0 ? 'var(--danger)' : 'var(--text-muted)' }} aria-hidden="true" />
            <span>药物过敏与免疫异常 ({allergySummaryLabel})</span>
          </span>
          {openAllergy ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
        </button>
        {openAllergy && (
          <fieldset className="sub-box" id="patient-allergy-panel">
            <legend className="sr-only">药物过敏与免疫异常</legend>
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

            <div
              role="group"
              aria-labelledby="patient-extreme-allergy-label"
              style={{ borderTop: '1px solid var(--border)', paddingTop: 7, display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5, flexWrap: 'wrap' }}>
                <span className="control-label" id="patient-extreme-allergy-label">极端药物过敏 ({patient.allergies.length})</span>
                <div style={{ display: 'flex', gap: 5 }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    title="按上游 GLOB.allergy_reagent_blacklist 规则从合规药物池随机抽取 6 种过敏原"
                    onClick={() => setField('allergies', rollRandomAllergies(6))}
                  >
                    <Dices size={11} aria-hidden="true" />
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
                <div className="quick-chips" role="group" aria-label="已选过敏原">
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
                        aria-label={`移除过敏原 ${r.zhName}`}
                        onClick={() => toggleAllergyId(id)}
                      >
                        <span className="color-dot" style={{ background: getDisplayColor(r.color) }} aria-hidden="true" />
                        <span>
                          {r.zhName}
                          {!inPool ? ' (沙盒)' : ''}
                        </span>
                        <X size={10} aria-hidden="true" />
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
                  aria-label="搜索过敏原（中/英文/别名）"
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

              <div className="allergy-picker-list" role="group" aria-label="过敏原可选列表">
                {allergyPoolList.map((r) => {
                  const selected = patient.allergies.includes(r.id);
                  const inPool = isExtremeAllergyCandidate(r);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`allergy-picker-row ${selected ? 'selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() => toggleAllergyId(r.id)}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                        <span className="color-dot" style={{ background: getDisplayColor(r.color) }} aria-hidden="true" />
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
          </fieldset>
        )}
      </div>
      )}
    </section>
  );
}
