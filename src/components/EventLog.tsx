import { ScrollText } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SimEvent } from '../engine/types';

interface EventLogProps {
  events: SimEvent[];
  selectedTime: number;
  onJumpToTime: (time: number) => void;
  embedded?: boolean;
}

export function EventLog({ events, selectedTime, onJumpToTime, embedded = false }: EventLogProps) {
  const [filter, setFilter] = useState<'all' | 'danger' | 'warn' | 'reaction' | 'allergy' | 'dose'>('all');
  const listRef = useRef<HTMLDivElement | null>(null);
  const activeBoxRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (filter === 'all') return true;
      if (filter === 'danger') return e.severity === 'danger';
      if (filter === 'warn') return e.severity === 'warn' || e.severity === 'danger';
      if (filter === 'reaction') return e.category === 'reaction';
      if (filter === 'allergy') return e.category === 'allergy';
      return e.category === 'dose';
    });
  }, [events, filter]);

  const { beforeEvents, currentEvents, afterEvents } = useMemo(() => {
    const before: SimEvent[] = [];
    const current: SimEvent[] = [];
    const after: SimEvent[] = [];
    for (const ev of filtered) {
      if (ev.time < selectedTime) before.push(ev);
      else if (ev.time === selectedTime) current.push(ev);
      else after.push(ev);
    }
    return { beforeEvents: before, currentEvents: current, afterEvents: after };
  }, [filtered, selectedTime]);

  useEffect(() => {
    const list = listRef.current;
    const box = activeBoxRef.current;
    if (!list || !box) return;

    const listRect = list.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    if (listRect.height <= 0) return;

    const boxTop = boxRect.top - listRect.top + list.scrollTop;
    const boxBottom = boxTop + boxRect.height;

    if (boxRect.height >= list.clientHeight - 16) {
      if (boxTop < list.scrollTop + 4 || boxTop > list.scrollTop + list.clientHeight * 0.4) {
        list.scrollTo({ top: Math.max(0, boxTop - 6), behavior: 'auto' });
      }
      return;
    }

    const viewTop = list.scrollTop + 8;
    const viewBottom = list.scrollTop + list.clientHeight - 8;
    if (boxTop < viewTop || boxBottom > viewBottom) {
      const centeredTop = Math.max(0, boxTop - (list.clientHeight - boxRect.height) / 2);
      list.scrollTo({ top: centeredTop, behavior: 'auto' });
    }
  }, [selectedTime, filter, filtered]);

  const renderEventButton = (ev: SimEvent, idx: number, variant: 'past' | 'current' | 'future') => {
    const isCurrent = variant === 'current';
    const isFuture = variant === 'future' && selectedTime > 0;
    return (
      <button
        key={`${variant}-${ev.tick}-${ev.category}-${idx}`}
        type="button"
        className={`event-item sev-${ev.severity}${isCurrent ? ' is-current' : ''}${isFuture ? ' is-future' : ''}`}
        aria-current={isCurrent ? 'true' : undefined}
        aria-label={`跳转到 ${ev.time} 秒：${ev.title}，${ev.detail}`}
        onClick={() => onJumpToTime(ev.time)}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 8 }}>
          <strong className="event-item-title">{ev.title}</strong>
          <span className="event-item-time mono">{ev.time}s</span>
        </div>
        <div className="event-item-detail">{ev.detail}</div>
      </button>
    );
  };

  const bodyContent = (
    <div className="panel-body">
      <div className="quick-chips" role="group" aria-label="事件类型筛选">
        {(
          [
            ['all', '全部'],
            ['danger', '致命/过量'],
            ['warn', '警告以上'],
            ['reaction', '转化/反应'],
            ['allergy', '药物过敏'],
            ['dose', '给药记录'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`btn btn-sm ${filter === id ? 'btn-primary' : ''}`}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div ref={listRef} className="event-list" role="region" aria-label={`事件列表（${filtered.length} 条）`}>
        {filtered.length === 0 ? (
          <div className="dose-sub" style={{ textAlign: 'center', padding: 14 }}>
            当前筛选下无事件记录。
          </div>
        ) : (
          <>
            {beforeEvents.map((ev, idx) => renderEventButton(ev, idx, 'past'))}

            <div
              ref={activeBoxRef}
              className={`event-current-box${currentEvents.length === 0 ? ' is-empty' : ''}`}
            >
              <div className="event-current-box-header mono">
                <span className="event-current-label">
                  <span className="event-current-dot" aria-hidden="true" />
                  <span>
                    当前 · t = {selectedTime}s (Tick {Math.round(selectedTime / 2)})
                  </span>
                </span>
                {currentEvents.length === 0 ? (
                  <span className="event-current-meta">无事件</span>
                ) : currentEvents.length > 1 ? (
                  <span className="event-current-meta">{currentEvents.length} 条</span>
                ) : null}
              </div>
              {currentEvents.map((ev, idx) => renderEventButton(ev, idx, 'current'))}
            </div>

            {afterEvents.map((ev, idx) => renderEventButton(ev, idx, 'future'))}
          </>
        )}
      </div>
    </div>
  );

  if (embedded) {
    return bodyContent;
  }

  return (
    <section className="panel" aria-labelledby="event-log-heading">
      <div className="panel-header">
        <div className="panel-title" id="event-log-heading">
          <ScrollText size={15} style={{ color: 'var(--warn)' }} aria-hidden="true" />
          生理与药理事件日志 ({filtered.length})
        </div>
      </div>
      {bodyContent}
    </section>
  );
}
