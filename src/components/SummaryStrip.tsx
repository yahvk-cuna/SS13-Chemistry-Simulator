import { MOB_STAT_ZH } from '../engine/constants';
import type { SimSummary } from '../engine/types';

interface SummaryStripProps {
  summary: SimSummary;
  baselineSummary: SimSummary | null;
}

export function SummaryStrip({ summary, baselineSummary }: SummaryStripProps) {
  const hpDelta = summary.finalHealth - summary.initialHealth;
  const baselineDelta = baselineSummary ? summary.finalHealth - baselineSummary.finalHealth : null;
  const alertTotal =
    summary.triggeredODs.length +
    summary.triggeredInverses.length +
    summary.triggeredDangerReactions.length +
    summary.triggeredAllergies.length +
    (summary.worstOrgan.failing ? 1 : 0) +
    (summary.triggeredHeartAttack ? 1 : 0) +
    (summary.triggeredStamcrit ? 1 : 0);

  return (
    <section className="summary-strip" aria-label="仿真结果摘要">
      <div className="kpi-card" role="group" aria-labelledby="kpi-final-hp-label">
        <span className="kpi-label" id="kpi-final-hp-label">最终结局与生命值</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span
            className="kpi-val"
            style={{
              color:
                summary.finalStat === 'STABLE'
                  ? 'var(--good)'
                  : summary.finalStat === 'SOFT_CRIT'
                    ? 'var(--warn)'
                    : 'var(--danger)',
            }}
          >
            {summary.finalHealth.toFixed(1)}
          </span>
          <span
            className={`stat-badge stat-${summary.finalStat}`}
            aria-label={`终末状态：${MOB_STAT_ZH[summary.finalStat]}`}
          >
            {MOB_STAT_ZH[summary.finalStat]}
          </span>
        </div>
        <span className="kpi-sub mono">
          变化 {hpDelta >= 0 ? '+' : ''}
          {hpDelta.toFixed(1)} · 最低 {summary.minHealth.toFixed(1)}
          {baselineDelta !== null && (
            <span style={{ color: baselineDelta >= 0 ? 'var(--good)' : 'var(--danger)' }}>
              {' '}
              (较基准 {baselineDelta >= 0 ? '+' : ''}
              {baselineDelta.toFixed(1)})
            </span>
          )}
        </span>
      </div>

      <div className="kpi-card" role="group" aria-labelledby="kpi-recovery-label">
        <span className="kpi-label" id="kpi-recovery-label">完全康复 / 危急耗时</span>
        <span className="kpi-val" style={{ color: summary.deathTime !== null ? 'var(--danger)' : 'var(--accent)' }}>
          {summary.deathTime !== null
            ? `${summary.deathTime}s 死亡`
            : summary.fullHealTime !== null
              ? `${summary.fullHealTime}s 痊愈`
              : '未全愈'}
        </span>
        <span className="kpi-sub mono">危急累计 {summary.critDuration}s</span>
      </div>

      <div className="kpi-card" role="group" aria-labelledby="kpi-healed-label">
        <span className="kpi-label" id="kpi-healed-label">各伤害净治疗量 (+为治愈)</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, fontSize: 11.5 }} className="mono">
          <span
            style={{ color: 'var(--c-brute)' }}
            aria-label={`钝伤净治疗量 ${summary.healedBrute >= 0 ? '+' : ''}${summary.healedBrute.toFixed(1)}`}
          >
            钝 {summary.healedBrute >= 0 ? '+' : ''}
            {summary.healedBrute.toFixed(1)}
          </span>
          <span
            style={{ color: 'var(--c-burn)' }}
            aria-label={`烧伤净治疗量 ${summary.healedBurn >= 0 ? '+' : ''}${summary.healedBurn.toFixed(1)}`}
          >
            烧 {summary.healedBurn >= 0 ? '+' : ''}
            {summary.healedBurn.toFixed(1)}
          </span>
          <span
            style={{ color: 'var(--c-tox)' }}
            aria-label={`毒素净治疗量 ${summary.healedTox >= 0 ? '+' : ''}${summary.healedTox.toFixed(1)}`}
          >
            毒 {summary.healedTox >= 0 ? '+' : ''}
            {summary.healedTox.toFixed(1)}
          </span>
          <span
            style={{ color: 'var(--c-oxy)' }}
            aria-label={`窒息净治疗量 ${summary.healedOxy >= 0 ? '+' : ''}${summary.healedOxy.toFixed(1)}`}
          >
            窒 {summary.healedOxy >= 0 ? '+' : ''}
            {summary.healedOxy.toFixed(1)}
          </span>
        </div>
      </div>

      <div className="kpi-card" role="group" aria-labelledby="kpi-organ-label">
        <span className="kpi-label" id="kpi-organ-label">峰值器官损伤</span>
        <span
          className="kpi-val"
          style={{
            color: summary.worstOrgan.failing
              ? 'var(--danger)'
              : summary.worstOrgan.damage > summary.worstOrgan.maxHealth * 0.45
                ? 'var(--warn)'
                : 'var(--text)',
          }}
        >
          {summary.worstOrgan.label} {summary.worstOrgan.damage.toFixed(1)}
        </span>
        <span className="kpi-sub mono">
          上限 {summary.worstOrgan.maxHealth} {summary.worstOrgan.failing ? '· 已衰竭！' : ''}
        </span>
      </div>

      <div className="kpi-card" role="group" aria-labelledby="kpi-alerts-label">
        <span className="kpi-label" id="kpi-alerts-label">药理风险警报</span>
        <span className="kpi-val" style={{ color: alertTotal > 0 ? 'var(--danger)' : 'var(--good)' }}>
          {alertTotal > 0 ? `${alertTotal} 项异常` : '安全无警报'}
        </span>
        <span className="kpi-sub">
          {summary.triggeredAllergies.length > 0 && `过敏:${summary.triggeredAllergies.join('/')} `}
          {summary.triggeredDangerReactions.length > 0 && `${summary.triggeredDangerReactions.join(' / ')} `}
          {summary.triggeredODs.length > 0 && `OD:${summary.triggeredODs.join('/')} `}
          {summary.triggeredInverses.length > 0 && `逆:${summary.triggeredInverses.length} `}
          {summary.worstOrgan.failing && `${summary.worstOrgan.label}衰竭 `}
          {summary.triggeredHeartAttack && '心停 '}
          {summary.triggeredStamcrit && '耐力倒地 '}
          {summary.triggeredSleep && '昏睡'}
          {alertTotal === 0 && !summary.triggeredSleep && '无过量 / 无逆转 / 无禁忌爆炸 / 无过敏'}
        </span>
      </div>
    </section>
  );
}
