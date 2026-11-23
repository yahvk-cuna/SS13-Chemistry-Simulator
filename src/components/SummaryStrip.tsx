import type { SimSummary } from '../engine/types';

interface SummaryStripProps {
  summary: SimSummary;
  baselineSummary: SimSummary | null;
}

const STAT_ZH: Record<SimSummary['finalStat'], string> = {
  STABLE: '稳定存活',
  SOFT_CRIT: '轻度危急',
  HARD_CRIT: '重度危急',
  DEAD: '死亡',
};

export function SummaryStrip({ summary, baselineSummary }: SummaryStripProps) {
  const hpDelta = summary.finalHealth - summary.initialHealth;
  const baselineDelta = baselineSummary ? summary.finalHealth - baselineSummary.finalHealth : null;
  const alertTotal =
    summary.triggeredODs.length +
    summary.triggeredInverses.length +
    summary.triggeredDangerReactions.length +
    (summary.worstOrgan.failing ? 1 : 0) +
    (summary.triggeredHeartAttack ? 1 : 0) +
    (summary.triggeredStamcrit ? 1 : 0);

  return (
    <div className="summary-strip">
      <div className="kpi-card">
        <span className="kpi-label">最终结局与生命值</span>
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
          <span className={`stat-badge stat-${summary.finalStat}`}>{STAT_ZH[summary.finalStat]}</span>
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

      <div className="kpi-card">
        <span className="kpi-label">完全康复 / 危急耗时</span>
        <span className="kpi-val" style={{ color: summary.deathTime !== null ? 'var(--danger)' : 'var(--accent)' }}>
          {summary.deathTime !== null
            ? `${summary.deathTime}s 死亡`
            : summary.fullHealTime !== null
              ? `${summary.fullHealTime}s 痊愈`
              : '未全愈'}
        </span>
        <span className="kpi-sub mono">危急累计 {summary.critDuration}s</span>
      </div>

      <div className="kpi-card">
        <span className="kpi-label">各伤害净治疗量 (+为治愈)</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, fontSize: 11.5 }} className="mono">
          <span style={{ color: 'var(--c-brute)' }}>
            钝 {summary.healedBrute >= 0 ? '+' : ''}
            {summary.healedBrute.toFixed(1)}
          </span>
          <span style={{ color: 'var(--c-burn)' }}>
            烧 {summary.healedBurn >= 0 ? '+' : ''}
            {summary.healedBurn.toFixed(1)}
          </span>
          <span style={{ color: 'var(--c-tox)' }}>
            毒 {summary.healedTox >= 0 ? '+' : ''}
            {summary.healedTox.toFixed(1)}
          </span>
          <span style={{ color: 'var(--c-oxy)' }}>
            窒 {summary.healedOxy >= 0 ? '+' : ''}
            {summary.healedOxy.toFixed(1)}
          </span>
        </div>
      </div>

      <div className="kpi-card">
        <span className="kpi-label">峰值器官损伤</span>
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

      <div className="kpi-card">
        <span className="kpi-label">药理风险警报</span>
        <span className="kpi-val" style={{ color: alertTotal > 0 ? 'var(--danger)' : 'var(--good)' }}>
          {alertTotal > 0 ? `${alertTotal} 项异常` : '安全无警报'}
        </span>
        <span className="kpi-sub">
          {summary.triggeredDangerReactions.length > 0 && `${summary.triggeredDangerReactions.join(' / ')} `}
          {summary.triggeredODs.length > 0 && `OD:${summary.triggeredODs.join('/')} `}
          {summary.triggeredInverses.length > 0 && `逆:${summary.triggeredInverses.length} `}
          {summary.worstOrgan.failing && `${summary.worstOrgan.label}衰竭 `}
          {summary.triggeredHeartAttack && '心停 '}
          {summary.triggeredStamcrit && '耐力倒地 '}
          {summary.triggeredSleep && '昏睡'}
          {alertTotal === 0 && !summary.triggeredSleep && '无过量 / 无逆转 / 无禁忌爆炸'}
        </span>
      </div>
    </div>
  );
}
