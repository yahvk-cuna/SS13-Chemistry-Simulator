import { Activity } from 'lucide-react';
import { BLOOD_VOLUME_NORMAL, MOB_STAT_ZH, clamp } from '../engine/constants';
import { getDisplayColor } from '../engine/reagents';
import type { OrganSlot, TickSnapshot } from '../engine/types';

interface TickInspectorProps {
  snapshot: TickSnapshot;
}

const ORGAN_ORDER: { slot: OrganSlot; label: string }[] = [
  { slot: 'liver', label: '肝脏' },
  { slot: 'heart', label: '心脏' },
  { slot: 'lungs', label: '肺' },
  { slot: 'stomach', label: '胃' },
  { slot: 'brain', label: '大脑' },
  { slot: 'eyes', label: '眼睛' },
  { slot: 'ears', label: '耳朵' },
];

const TRAIT_LABELS: Record<string, string> = {
  TRAIT_ANALGESIA: '无痛觉(止痛)',
  TRAIT_STABLEHEART: '心脏稳态',
  TRAIT_STABLELIVER: '肝脏稳态',
  TRAIT_NOCRITDAMAGE: '免危急恶化',
  TRAIT_NOHARDCRIT: '免重危',
  TRAIT_NOSOFTCRIT: '免轻危',
  TRAIT_NODEATH: '免疫死亡',
  TRAIT_HALT_RADIATION_EFFECTS: '免疫辐射伤害',
  TRAIT_VIRUS_RESISTANCE: '抗病毒感染',
  TRAIT_BATON_RESISTANCE: '抗电棍击倒',
  TRAIT_SLEEPIMMUNE: '免疫睡眠',
  TRAIT_COAGULATING: '凝血止血中',
  TRAIT_EASYBLEED: '易出血体质',
  TRAIT_IMMUNODEFICIENCY: '免疫缺陷',
  TRAIT_PACIFISM: '和平主义',
  TRAIT_FEARLESS: '无畏镇定',
};

export function TickInspector({ snapshot }: TickInspectorProps) {
  const hpPct = clamp((snapshot.health + 100) / 200, 0, 1) * 100;
  const hpBarColor =
    snapshot.stat === 'STABLE'
      ? 'var(--good)'
      : snapshot.stat === 'SOFT_CRIT'
        ? 'var(--warn)'
        : snapshot.stat === 'HARD_CRIT'
          ? 'var(--danger)'
          : '#64748b';

  return (
    <section className="panel" aria-labelledby="tick-inspector-heading">
      <div className="panel-header">
        <div className="panel-title" id="tick-inspector-heading">
          <Activity size={15} style={{ color: 'var(--good)' }} aria-hidden="true" />
          生理切片检视 · <span className="mono">{snapshot.time}s</span>
        </div>
        <span
          className={`stat-badge stat-${snapshot.stat}`}
          aria-label={`生理状态：${MOB_STAT_ZH[snapshot.stat]}`}
        >
          {MOB_STAT_ZH[snapshot.stat]}
        </span>
      </div>

      <div className="panel-body">
        {/* HP bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
            <span id="tick-hp-label">生命值 (HP)</span>
            <strong className="mono" style={{ color: hpBarColor }}>
              {snapshot.health.toFixed(1)} / 100
            </strong>
          </div>
          <div
            className="health-bar-track"
            role="progressbar"
            aria-labelledby="tick-hp-label"
            aria-valuemin={-100}
            aria-valuemax={100}
            aria-valuenow={Number(clamp(snapshot.health, -100, 100).toFixed(1))}
            aria-valuetext={`${snapshot.health.toFixed(1)} / 100（${MOB_STAT_ZH[snapshot.stat]}）`}
          >
            <div className="health-bar-fill" style={{ width: `${hpPct}%`, background: hpBarColor }} />
          </div>
        </div>

        {/* 5 Damage metrics */}
        <div className="grid-3" style={{ textAlign: 'center' }} role="group" aria-label="当前伤害与有效血量">
          <div className="sub-box" style={{ padding: '5px 4px', gap: 2 }}>
            <span className="control-label">钝伤</span>
            <strong className="mono" style={{ color: 'var(--c-brute)' }}>
              {snapshot.brute.toFixed(1)}
            </strong>
          </div>
          <div className="sub-box" style={{ padding: '5px 4px', gap: 2 }}>
            <span className="control-label">烧伤</span>
            <strong className="mono" style={{ color: 'var(--c-burn)' }}>
              {snapshot.burn.toFixed(1)}
            </strong>
          </div>
          <div className="sub-box" style={{ padding: '5px 4px', gap: 2 }}>
            <span className="control-label">毒素</span>
            <strong className="mono" style={{ color: 'var(--c-tox)' }}>
              {snapshot.tox.toFixed(1)}
            </strong>
          </div>
          <div className="sub-box" style={{ padding: '5px 4px', gap: 2 }}>
            <span className="control-label">窒息</span>
            <strong className="mono" style={{ color: 'var(--c-oxy)' }}>
              {snapshot.oxy.toFixed(1)}
            </strong>
          </div>
          <div className="sub-box" style={{ padding: '5px 4px', gap: 2 }}>
            <span className="control-label">耐力损耗</span>
            <strong className="mono" style={{ color: 'var(--c-stamina)' }}>
              {snapshot.stamina.toFixed(1)}
            </strong>
          </div>
          <div className="sub-box" style={{ padding: '5px 4px', gap: 2 }}>
            <span className="control-label">有效血量</span>
            <strong className="mono" style={{ color: 'var(--c-blood)' }}>
              {((snapshot.effectiveBloodVolume / BLOOD_VOLUME_NORMAL) * 100).toFixed(0)}%
            </strong>
          </div>
        </div>

        {/* Vitals row */}
        <div className="grid-2" style={{ fontSize: 11.5 }} role="group" aria-label="当前体温、血量与伤口">
          <div className="sub-box" style={{ gap: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="control-label">体表/核心温</span>
              <span className="mono">
                {snapshot.bodyTemp.toFixed(0)}K / {snapshot.coreTemp.toFixed(0)}K
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="control-label">血量 / 出血</span>
              <span className="mono">
                {snapshot.bloodVolume.toFixed(0)}u / {snapshot.bleedFlow.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="sub-box" style={{ gap: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="control-label">失呼吸层数</span>
              <span className="mono">{snapshot.losebreath.toFixed(1)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="control-label">伤口 / 愈合计数</span>
              <span className="mono">
                {snapshot.woundsRemaining} 处 / {snapshot.woundCounter.toFixed(0)}
              </span>
            </div>
          </div>
        </div>

        {/* Organs */}
        <div>
          <div className="control-label" id="tick-organs-label" style={{ marginBottom: 5 }}>
            器官状态
          </div>
          <div className="organ-grid" role="group" aria-labelledby="tick-organs-label">
            {ORGAN_ORDER.map(({ slot, label }) => {
              const o = snapshot.organs[slot];
              const pct = o.maxHealth > 0 ? clamp((o.damage / o.maxHealth) * 100, 0, 100) : 100;
              const col =
                o.statusZh === '无功能'
                  ? 'var(--danger)'
                  : o.statusZh === '严重损伤'
                    ? 'var(--warn)'
                    : o.statusZh === '轻微损伤'
                      ? '#eab308'
                      : 'var(--good)';
              return (
                <div className="organ-row" key={slot}>
                  <span id={`tick-organ-${slot}-label`}>{label}</span>
                  <div
                    className="health-bar-track"
                    style={{ height: 6 }}
                    role="progressbar"
                    aria-labelledby={`tick-organ-${slot}-label`}
                    aria-valuemin={0}
                    aria-valuemax={o.maxHealth > 0 ? o.maxHealth : 100}
                    aria-valuenow={o.maxHealth > 0 ? Number(clamp(o.damage, 0, o.maxHealth).toFixed(1)) : 100}
                    aria-valuetext={o.maxHealth > 0 ? `损伤 ${o.damage.toFixed(1)} / ${o.maxHealth}，${o.statusZh}` : '缺失'}
                  >
                    <div className="health-bar-fill" style={{ width: `${pct}%`, background: col }} />
                  </div>
                  <span className="mono" style={{ textAlign: 'right', color: col, fontSize: 11 }}>
                    {o.maxHealth > 0 ? `${o.damage.toFixed(1)} ${o.statusZh}` : '缺失'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Traits & Debuffs */}
        {(snapshot.traits.length > 0 ||
          snapshot.activeAllergens.length > 0 ||
          snapshot.blockedAllergens.length > 0 ||
          snapshot.heartAttack ||
          snapshot.stamcrit ||
          snapshot.sleeping > 0 ||
          snapshot.drowsiness > 0 ||
          snapshot.dizzy > 0 ||
          snapshot.jitter > 0 ||
          snapshot.disgust > 5) && (
          <div className="quick-chips" role="group" aria-label="生理状态效果与免疫特性">
            {snapshot.activeAllergens.length > 0 && (
              <span className="tag-chip danger">过敏发作: {snapshot.activeAllergens.join(' / ')}</span>
            )}
            {snapshot.blockedAllergens.length > 0 && (
              <span className="tag-chip warn">肾上腺素阻断: {snapshot.blockedAllergens.join(' / ')}</span>
            )}
            {snapshot.heartAttack && <span className="tag-chip danger">心脏骤停!</span>}
            {snapshot.stamcrit && <span className="tag-chip warn">耐力倒地!</span>}
            {snapshot.sleeping > 0 && <span className="tag-chip warn mono">睡眠 {snapshot.sleeping.toFixed(0)}s</span>}
            {snapshot.drowsiness > 0 && <span className="tag-chip mono">困倦 {snapshot.drowsiness.toFixed(0)}s</span>}
            {snapshot.dizzy > 0 && <span className="tag-chip mono">眩晕 {snapshot.dizzy.toFixed(0)}s</span>}
            {snapshot.jitter > 0 && <span className="tag-chip mono">颤抖 {snapshot.jitter.toFixed(0)}s</span>}
            {snapshot.disgust > 5 && <span className="tag-chip mono">厌恶 {snapshot.disgust.toFixed(0)}</span>}
            {snapshot.traits.map((t) => (
              <span key={t} className="tag-chip good">
                {TRAIT_LABELS[t] ?? t}
              </span>
            ))}
          </div>
        )}

        {/* Active Blood Reagents */}
        <div role="region" aria-labelledby="tick-blood-reagents-label">
          <div className="control-label" id="tick-blood-reagents-label" style={{ marginBottom: 4 }}>
            血液中试剂 ({snapshot.bloodReagents.length})
          </div>
          {snapshot.bloodReagents.length === 0 ? (
            <div className="dose-sub">血液中无残留试剂</div>
          ) : (
            <table className="reagent-table mono" aria-labelledby="tick-blood-reagents-label">
              <thead>
                <tr>
                  <th scope="col">试剂</th>
                  <th scope="col">残留</th>
                  <th scope="col">纯度</th>
                  <th scope="col">周期 / OD</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.bloodReagents.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'var(--font-sans)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span className="color-dot" style={{ background: getDisplayColor(r.color) }} aria-hidden="true" />
                        <span>{r.zhName}</span>
                      </span>
                    </td>
                    <td>{r.volume.toFixed(2)}u</td>
                    <td>{(r.purity * 100).toFixed(0)}%</td>
                    <td>
                      #{r.currentCycle}{' '}
                      {r.overdosed ? (
                        <span className="od-badge">OD!</span>
                      ) : r.overdoseThreshold > 0 ? (
                        <span style={{ color: 'var(--text-muted)' }}>/{r.overdoseThreshold.toFixed(0)}u</span>
                      ) : null}
                      {r.allergyState === 'active' && (
                        <>
                          {' '}
                          <span className="allergy-badge">过敏!</span>
                        </>
                      )}
                      {r.allergyState === 'blocked' && (
                        <>
                          {' '}
                          <span className="block-badge">阻断</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Stomach & Active Transfers */}
        {(snapshot.stomachReagents.length > 0 || snapshot.activeTransfers.length > 0) && (
          <div className="sub-box" style={{ gap: 4 }} role="region" aria-label="胃内待吸收与持续输注">
            {snapshot.stomachReagents.length > 0 && (
              <>
                <div className="control-label">胃内待吸收 ({snapshot.stomachReagents.length})</div>
                {snapshot.stomachReagents.map((r) => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                    <span>{r.zhName}</span>
                    <span className="mono">{r.volume.toFixed(2)}u</span>
                  </div>
                ))}
              </>
            )}
            {snapshot.activeTransfers.length > 0 && (
              <>
                <div className="control-label">持续输注 / 贴片余量</div>
                {snapshot.activeTransfers.map((tr, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                    <span>{tr.label}</span>
                    <span className="mono">{tr.remaining.toFixed(2)}u</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
