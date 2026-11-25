import { ScrollText } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { SimEvent } from '../engine/types';

interface EventLogProps {
  events: SimEvent[];
  onJumpToTime: (time: number) => void;
}

export function EventLog({ events, onJumpToTime }: EventLogProps) {
  const [filter, setFilter] = useState<'all' | 'danger' | 'warn' | 'reaction' | 'allergy' | 'dose'>('all');

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

  return (
    <section className="panel" aria-labelledby="event-log-heading">
      <div className="panel-header">
        <div className="panel-title" id="event-log-heading">
          <ScrollText size={15} style={{ color: 'var(--warn)' }} aria-hidden="true" />
          生理与药理事件日志 ({filtered.length})
        </div>
      </div>
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

        <div className="event-list" role="region" aria-label={`事件列表（${filtered.length} 条）`}>
          {filtered.length === 0 ? (
            <div className="dose-sub" style={{ textAlign: 'center', padding: 14 }}>
              当前筛选下无事件记录。
            </div>
          ) : (
            filtered.map((ev, idx) => (
              <button
                key={idx}
                type="button"
                className={`event-item sev-${ev.severity}`}
                aria-label={`跳转到 ${ev.time} 秒：${ev.title}，${ev.detail}`}
                onClick={() => onJumpToTime(ev.time)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 8 }}>
                  <strong style={{ fontSize: 12 }}>{ev.title}</strong>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {ev.time}s
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ev.detail}</div>
              </button>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
