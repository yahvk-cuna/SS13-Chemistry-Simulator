import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATEGORY_LABELS, REAGENT_LIST, getDisplayColor } from '../engine/reagents';
import type { ReagentCategory, ReagentDef } from '../engine/types';

interface ReagentPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (reagent: ReagentDef) => void;
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

export function ReagentPickerModal({ open, onClose, onSelect }: ReagentPickerModalProps) {
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
        r.summaryZh.toLowerCase().includes(q)
      );
    });
  }, [search, category]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="panel-title">选择添加药品 / 试剂（共 {REAGENT_LIST.length} 种）</div>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="关闭">
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
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
                placeholder="搜索中文名、英文名、别名、治疗目标（如：钝伤、木泰尔、Syriniver、止血）..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
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

          <div className="picker-grid">
            {filtered.map((r) => (
              <button
                key={r.id}
                type="button"
                className="picker-card"
                onClick={() => {
                  onSelect(r);
                  onClose();
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                    <span className="color-dot" style={{ background: getDisplayColor(r.color) }} />
                    <span>{r.zhName}</span>
                    <span className="dose-sub">{r.enName}</span>
                  </div>
                  <span className="tag-chip mono">{(r.metabolizationRate * 2).toFixed(2)}u/t</span>
                </div>
                <div className="quick-chips">
                  {r.targets.map((t) => (
                    <span key={t} className="tag-chip">
                      {t}
                    </span>
                  ))}
                  {r.overdoseThreshold > 0 && (
                    <span className="tag-chip warn mono">OD {r.overdoseThreshold}u</span>
                  )}
                  {r.inverseChemVal > 0 && (
                    <span className="tag-chip mono">逆 &lt;{(r.inverseChemVal * 100).toFixed(0)}%</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{r.summaryZh}</div>
              </button>
            ))}
          </div>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
              没有找到匹配的试剂，请尝试更换搜索词或分类。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
