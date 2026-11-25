import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const MARGIN = 12;
const GAP = 10;
const NARROW_VIEWPORT = 900;

interface FloatPosition {
  x: number;
  y: number;
}

function computeFloatPosition(rect: DOMRect, width: number, height: number, vw: number, vh: number): FloatPosition {
  let x: number;
  let rawY: number;

  if (vw <= NARROW_VIEWPORT) {
    x = Math.min(Math.max(MARGIN, rect.left), Math.max(MARGIN, vw - width - MARGIN));
    rawY = rect.bottom + 6;
  } else {
    const rightX = rect.right + GAP;
    if (rightX + width <= vw - MARGIN) {
      x = rightX;
    } else {
      const leftX = rect.left - width - GAP;
      x = Math.min(Math.max(MARGIN, leftX), Math.max(MARGIN, vw - width - MARGIN));
    }
    rawY = rect.top - 8;
  }

  const maxY = Math.max(MARGIN, vh - height - MARGIN);
  const y = Math.min(Math.max(MARGIN, rawY), maxY);
  return { x, y };
}

function isAnchorOutOfView(anchor: HTMLElement, rect: DOMRect, vw: number, vh: number): boolean {
  if (!anchor.isConnected) return true;
  let clipTop = 0;
  let clipBottom = vh;
  let clipLeft = 0;
  let clipRight = vw;

  const scrollCol = anchor.closest('.col-left, .col-center, .col-right, .col-results-group');
  if (scrollCol) {
    const colRect = scrollCol.getBoundingClientRect();
    clipTop = Math.max(clipTop, colRect.top);
    clipBottom = Math.min(clipBottom, colRect.bottom);
    clipLeft = Math.max(clipLeft, colRect.left);
    clipRight = Math.min(clipRight, colRect.right);
  }

  return (
    rect.bottom <= clipTop ||
    rect.top >= clipBottom ||
    rect.right <= clipLeft ||
    rect.left >= clipRight
  );
}

interface ReagentFloatProps {
  anchorEl: HTMLElement | null;
  /** 为 true 时可交互（可选中文字、可聚焦）；为 false 时为不拦截指针的纯提示。 */
  interactive: boolean;
  /** 锚点离开视口或被移除时调用。 */
  onAnchorLost: () => void;
  containerRef?: (node: HTMLDivElement | null) => void;
  zIndex?: number;
  id?: string;
  role: 'tooltip' | 'dialog';
  ariaLabel?: string;
  children: ReactNode;
}

/** 药品详情浮层：悬停提示与点击固定悬浮窗共用，均跟随锚点元素并夹取在视口内。 */
export function ReagentFloat({
  anchorEl,
  interactive,
  onAnchorLost,
  containerRef,
  zIndex,
  id,
  role,
  ariaLabel,
  children,
}: ReagentFloatProps) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const anchorLostRef = useRef(onAnchorLost);
  anchorLostRef.current = onAnchorLost;
  const containerRefCallback = useRef(containerRef);
  containerRefCallback.current = containerRef;
  const [pos, setPos] = useState<FloatPosition>({ x: MARGIN, y: MARGIN });

  const setRefs = useCallback((node: HTMLDivElement | null) => {
    innerRef.current = node;
    containerRefCallback.current?.(node);
  }, []);

  const update = useCallback(() => {
    const el = innerRef.current;
    if (!anchorEl || !el) return;
    const rect = anchorEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (isAnchorOutOfView(anchorEl, rect, vw, vh)) {
      anchorLostRef.current();
      return;
    }
    const next = computeFloatPosition(rect, el.offsetWidth, el.offsetHeight, vw, vh);
    setPos((prev) => (prev.x === next.x && prev.y === next.y ? prev : next));
  }, [anchorEl]);

  // 内容或锚点变化后同步重新定位（位置未变时不触发重渲染）。
  useLayoutEffect(() => {
    update();
  });

  useEffect(() => {
    let rafId: number | null = null;
    const schedule = (e?: Event) => {
      if (e && e.target === innerRef.current) return;
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        update();
      });
    };
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
    };
  }, [update]);

  return (
    <div
      ref={setRefs}
      id={id}
      className={`reagent-float ${interactive ? 'interactive' : 'passive'}`}
      style={{ left: pos.x, top: pos.y, zIndex }}
      role={role}
      aria-label={ariaLabel}
      tabIndex={interactive ? -1 : undefined}
    >
      {children}
    </div>
  );
}
