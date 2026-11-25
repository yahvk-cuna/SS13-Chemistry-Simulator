import { useEffect, useState } from 'react';
import { MOB_STAT_ZH } from '../engine/constants';
import type { SimSummary } from '../engine/types';

interface ResultJumpButtonProps {
  summary: SimSummary;
  targetId?: string;
}

const COMPACT_MEDIA_QUERY = '(max-width: 1180px)';

export function ResultJumpButton({
  summary,
  targetId = 'result-section',
}: ResultJumpButtonProps) {
  const [isCompactViewport, setIsCompactViewport] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(COMPACT_MEDIA_QUERY).matches;
  });
  const [isResultInView, setIsResultInView] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(COMPACT_MEDIA_QUERY);
    const updateMatch = () => setIsCompactViewport(mql.matches);
    updateMatch();

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', updateMatch);
      return () => mql.removeEventListener('change', updateMatch);
    }
    mql.addListener(updateMatch);
    return () => mql.removeListener(updateMatch);
  }, []);

  useEffect(() => {
    if (!isCompactViewport || typeof document === 'undefined') {
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
  }, [isCompactViewport, targetId]);

  if (!isCompactViewport || isResultInView) {
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
