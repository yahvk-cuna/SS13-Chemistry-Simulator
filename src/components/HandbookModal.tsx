import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATEGORY_LABELS, REAGENTS, REAGENT_LIST, getDisplayColor } from '../engine/reagents';
import type { ReagentCategory } from '../engine/types';

interface HandbookModalProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORIES: ('all' | ReagentCategory)[] = [
  'all',
  'c2',
  'superior',
  'unique',
  'special',
  'inverse',
  'helper',
];

export function HandbookModal({ open, onClose }: HandbookModalProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | ReagentCategory>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return REAGENT_LIST.filter((r) => {
      if (category !== 'all' && r.category !== category) return false;
      if (!q) return true;
      return (
        r.zhName.toLowerCase().includes(q) ||
        r.enName.toLowerCase().includes(q) ||
        (r.aliases ?? []).some((a) => a.toLowerCase().includes(q)) ||
        r.targets.some((t) => t.toLowerCase().includes(q)) ||
        r.summaryZh.toLowerCase().includes(q) ||
        r.mechanicsNoteZh.toLowerCase().includes(q)
      );
    });
  }, [search, category]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ width: 'min(1100px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="panel-title">天关13 药物与试剂百科图鉴（源码精确参数）</div>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="关闭图鉴">
            <X size={15} />
          </button>
        </div>

        <div className="modal-body">
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              autoFocus
              className="ui-input"
              style={{ width: '100%', paddingLeft: 30 }}
              placeholder="搜索药品名、英文名、Wiki别名或效果..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="quick-chips">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`btn btn-sm ${category === cat ? 'btn-primary' : ''}`}
                onClick={() => setCategory(cat)}
              >
                {cat === 'all' ? '全部' : CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="reagent-table">
              <thead>
                <tr>
                  <th style={{ width: 170 }}>药品名称</th>
                  <th style={{ width: 120 }}>靶向</th>
                  <th style={{ width: 95 }}>代谢 / OD</th>
                  <th style={{ width: 135 }}>纯度与逆反应</th>
                  <th>Tianguan13 药理与源码细节</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const inv = r.inverseChemId ? REAGENTS[r.inverseChemId] : null;
                  return (
                    <tr key={r.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                          <span className="color-dot" style={{ background: getDisplayColor(r.color) }} />
                          <span>{r.zhName}</span>
                        </div>
                        <div className="dose-sub">
                          {r.enName}
                          {r.aliases?.length ? ` (${r.aliases.join(' / ')})` : ''}
                        </div>
                      </td>
                      <td>
                        <div className="quick-chips">
                          {r.targets.map((t) => (
                            <span key={t} className="tag-chip">
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>
                        <div>{(r.metabolizationRate * 2).toFixed(2)}u/tick</div>
                        <div style={{ color: r.overdoseThreshold > 0 ? 'var(--warn)' : 'var(--text-dim)' }}>
                          {r.overdoseThreshold > 0 ? `OD ${r.overdoseThreshold}u` : '无OD'}
                        </div>
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>
                        <div>默认 {(r.defaultPurity * 100).toFixed(0)}%</div>
                        {r.inverseChemVal > 0 ? (
                          <div style={{ color: 'var(--warn)' }}>
                            &lt;{(r.inverseChemVal * 100).toFixed(0)}% → {inv?.zhName ?? '逆产物'}
                          </div>
                        ) : (
                          <div style={{ color: 'var(--text-dim)' }}>无逆产物</div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: 12 }}>{r.summaryZh}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{r.mechanicsNoteZh}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
