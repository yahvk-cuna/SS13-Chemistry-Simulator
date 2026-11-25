import { useEffect, useState } from 'react';
import { MOB_STAT_ZH } from '../engine/constants';
import type { SimSummary } from '../engine/types';

interface ResultJumpButtonProps {
  summary: SimSummary;
  targetId?: string;
}

export function ResultJumpButton({
  summary,
  targetId = 'result-section',
}: ResultJumpButtonProps) {
  const [isResultInView, setIsResultInView] = useState<boolean>(true);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const target = document.getElementById(targetId);
    if (!target) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const initialInView = rect.bottom > 0 && rect.top < window.innerHeight;
    setIsResultInView(initialInView);

    if (typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsResultInView(entry.isIntersecting);
        }
      },
      { threshold: 0 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  if (isResultInView) {
    return null;
  }

  const statText = MOB_STAT_ZH[summary.finalStat];
  const hpText = summary.finalHealth.toFixed(1);
  const dotColor =
    summary.finalStat === 'STABLE'
      ? 'var(--good)'
      : summary.finalStat === 'SOFT_CRIT'
        ? 'var(--warn)'
        : 'var(--danger)';

  const handleJump = () => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  return (
    <button
      type="button"
      className="result-jump-btn mono"
      onClick={handleJump}
      aria-label={`跳转到结果图表区域（当前终末 HP ${hpText}，状态 ${statText}）`}
    >
      <span className="color-dot" style={{ background: dotColor }} aria-hidden="true" />
      <span>
        查看结果 · HP {hpText} · {statText}
      </span>
    </button>
  );
}
