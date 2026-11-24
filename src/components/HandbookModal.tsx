import { ArrowDown, ArrowUp, ArrowUpDown, Plus, RotateCcw, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EFFECT_TRAITS,
  MECHANISM_TRAITS,
  REAGENTS,
  REAGENT_LIST,
  getDisplayColor,
  getReagentTraits,
  isChemicalAllergyTrigger,
  isNoAllergyReagent,
  isPurityIndependentEffect,
} from '../engine/reagents';
import type { ReagentDef } from '../engine/types';

interface HandbookModalProps {
  open: boolean;
  onClose: () => void;
  onAddReagent?: (reagent: ReagentDef) => void;
  addedCounts?: Record<string, number>;
  initialQuery?: string;
  patientAllergies?: string[];
  hasChemicalAllergy?: boolean;
}

type SortKey = 'default' | 'rate_asc' | 'rate_desc' | 'od_asc' | 'od_desc';

export function HandbookModal({
  open,
  onClose,
  onAddReagent,
  addedCounts = {},
  initialQuery,
  patientAllergies = [],
  hasChemicalAllergy = false,
}: HandbookModalProps) {
  const [search, setSearch] = useState('');
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>('default');
  const [closeOnAdd, setCloseOnAdd] = useState(false);
  const [justAddedName, setJustAddedName] = useState<string | null>(null);
  const wasOpenRef = useRef(false);
  const patientAllergySet = useMemo(() => new Set(patientAllergies), [patientAllergies]);

  useEffect(() => {
    if (open && !wasOpenRef.current && initialQuery !== undefined) {
      setSearch(initialQuery);
      if (initialQuery) {
        setSelectedTraits([]);
      }
    }
    wasOpenRef.current = open;
  }, [open, initialQuery]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!justAddedName) return;
    const timer = window.setTimeout(() => setJustAddedName(null), 2200);
    return () => window.clearTimeout(timer);
  }, [justAddedName]);

  const traitsById = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const r of REAGENT_LIST) {
      map[r.id] = getReagentTraits(r);
    }
    return map;
  }, []);

  const searchMatched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return REAGENT_LIST;
    return REAGENT_LIST.filter((r) => {
      const traits = traitsById[r.id] ?? r.targets;
      return (
        r.zhName.toLowerCase().includes(q) ||
        r.enName.toLowerCase().includes(q) ||
        (r.aliases ?? []).some((a) => a.toLowerCase().includes(q)) ||
        traits.some((t) => t.toLowerCase().includes(q)) ||
        r.summaryZh.toLowerCase().includes(q) ||
        r.mechanicsNoteZh.toLowerCase().includes(q)
      );
    });
  }, [search, traitsById]);

  const filtered = useMemo(() => {
    const list =
      selectedTraits.length === 0
        ? searchMatched
        : searchMatched.filter((r) => {
            const traits = traitsById[r.id] ?? r.targets;
            return selectedTraits.every((t) => traits.includes(t));
          });

    if (sortBy === 'default') return list;

    return [...list].sort((a, b) => {
      if (sortBy === 'rate_asc') return a.metabolizationRate - b.metabolizationRate;
      if (sortBy === 'rate_desc') return b.metabolizationRate - a.metabolizationRate;
      const aOd = a.overdoseThreshold > 0 ? a.overdoseThreshold : Number.POSITIVE_INFINITY;
      const bOd = b.overdoseThreshold > 0 ? b.overdoseThreshold : Number.POSITIVE_INFINITY;
      if (sortBy === 'od_asc') return aOd - bOd;
      const aOdDesc = a.overdoseThreshold > 0 ? a.overdoseThreshold : -1;
      const bOdDesc = b.overdoseThreshold > 0 ? b.overdoseThreshold : -1;
      return bOdDesc - aOdDesc;
    });
  }, [searchMatched, selectedTraits, traitsById, sortBy]);

  const traitHitCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of filtered) {
      for (const t of traitsById[r.id] ?? []) {
        counts[t] = (counts[t] ?? 0) + 1;
      }
    }
    return counts;
  }, [filtered, traitsById]);

  if (!open) return null;

  const hasFilters = Boolean(search.trim() || selectedTraits.length > 0 || sortBy !== 'default');

  const toggleTrait = (trait: string) => {
    setSelectedTraits((prev) => (prev.includes(trait) ? prev.filter((t) => t !== trait) : [...prev, trait]));
  };

  const resetFilters = () => {
    setSearch('');
    setSelectedTraits([]);
    setSortBy('default');
  };

  const toggleRateSort = () => {
    setSortBy((prev) => (prev === 'rate_desc' ? 'rate_asc' : prev === 'rate_asc' ? 'default' : 'rate_desc'));
  };

  const toggleOdSort = () => {
    setSortBy((prev) => (prev === 'od_asc' ? 'od_desc' : prev === 'od_desc' ? 'default' : 'od_asc'));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ width: 'min(1140px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="panel-title">天关13 药品图鉴与选药库（源码精确参数）</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {justAddedName && <span className="tag-chip good">已加入方案：{justAddedName}</span>}
            {onAddReagent && (
              <label
                className={`checkbox-pill ${closeOnAdd ? 'checked' : ''}`}
                title="勾选后每次点击「加入」会自动关闭图鉴，适合单次快速挑药"
              >
                <input type="checkbox" checked={closeOnAdd} onChange={(e) => setCloseOnAdd(e.target.checked)} />
                <span>加入后关闭</span>
              </label>
            )}
            <button type="button" className="btn btn-sm" onClick={onClose}>
              完成
            </button>
            <button type="button" className="btn btn-icon" onClick={onClose} aria-label="关闭图鉴">
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="modal-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div className="search-wrap" style={{ minWidth: 240 }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: 10,
                  color: 'var(--text-muted)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                autoFocus
                className="ui-input"
                style={{ width: '100%', paddingLeft: 30, paddingRight: search ? 28 : 8 }}
                placeholder="搜索药品名、英文名、Wiki别名、特征或药理机制..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="search-clear-btn"
                  aria-label="清空搜索"
                  onClick={() => setSearch('')}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <span className="dose-sub mono">
              显示 {filtered.length} / {REAGENT_LIST.length} 种
            </span>

            {hasFilters && (
              <button type="button" className="btn btn-sm" onClick={resetFilters}>
                <RotateCcw size={11} />
                清空筛选
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <span className="control-label" style={{ paddingTop: 3, minWidth: 56 }}>
                机制安全
              </span>
              <div className="quick-chips">
                {MECHANISM_TRAITS.map((trait) => {
                  const active = selectedTraits.includes(trait);
                  const count = traitHitCounts[trait] ?? 0;
                  return (
                    <button
                      key={trait}
                      type="button"
                      className={`tag-chip-btn ${active ? 'active' : ''}`}
                      style={{ opacity: !active && count === 0 ? 0.38 : 1 }}
                      onClick={() => toggleTrait(trait)}
                    >
                      <span>{trait}</span>
                      <span className="mono" style={{ fontSize: 10, opacity: 0.75 }}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <span className="control-label" style={{ paddingTop: 3, minWidth: 56 }}>
                作用特征
              </span>
              <div className="quick-chips">
                {EFFECT_TRAITS.map((trait) => {
                  const active = selectedTraits.includes(trait);
                  const count = traitHitCounts[trait] ?? 0;
                  return (
                    <button
                      key={trait}
                      type="button"
                      className={`tag-chip-btn ${active ? 'active' : ''}`}
                      style={{ opacity: !active && count === 0 ? 0.38 : 1 }}
                      onClick={() => toggleTrait(trait)}
                    >
                      <span>{trait}</span>
                      <span className="mono" style={{ fontSize: 10, opacity: 0.75 }}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-scroll-flush">
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 36, color: 'var(--text-muted)' }}>
              <div style={{ marginBottom: 12 }}>当前多选特征交集下没有匹配的药品或试剂。</div>
              <button type="button" className="btn btn-primary btn-sm" onClick={resetFilters}>
                清空全部筛选条件
              </button>
            </div>
          ) : (
            <table className="handbook-table">
              <thead>
                <tr>
                  <th style={{ width: 195 }}>药品名称与源码特性</th>
                  <th style={{ width: 138 }}>特征标签（点击筛选）</th>
                  <th style={{ width: 112 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        className={`sort-th-btn ${sortBy === 'rate_asc' || sortBy === 'rate_desc' ? 'active' : ''}`}
                        title="按代谢速率排序"
                        onClick={toggleRateSort}
                      >
                        <span>代谢</span>
                        {sortBy === 'rate_desc' ? (
                          <ArrowDown size={11} />
                        ) : sortBy === 'rate_asc' ? (
                          <ArrowUp size={11} />
                        ) : (
                          <ArrowUpDown size={11} />
                        )}
                      </button>
                      <span>/</span>
                      <button
                        type="button"
                        className={`sort-th-btn ${sortBy === 'od_asc' || sortBy === 'od_desc' ? 'active' : ''}`}
                        title="按过量阈值排序"
                        onClick={toggleOdSort}
                      >
                        <span>OD</span>
                        {sortBy === 'od_desc' ? (
                          <ArrowDown size={11} />
                        ) : sortBy === 'od_asc' ? (
                          <ArrowUp size={11} />
                        ) : (
                          <ArrowUpDown size={11} />
                        )}
                      </button>
                    </div>
                  </th>
                  <th style={{ width: 145 }}>纯度与逆反应</th>
                  <th>Tianguan13 药理与源码细节</th>
                  {onAddReagent && <th style={{ width: 88, textAlign: 'right' }}>加入方案</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const inv = r.inverseChemId ? REAGENTS[r.inverseChemId] : null;
                  const count = addedCounts[r.id] ?? 0;
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
                        <div className="quick-chips" style={{ marginTop: 5 }}>
                          <span className="tag-chip mono">pH {r.ph}</span>
                          {isNoAllergyReagent(r) && (
                            <span
                              className="tag-chip good"
                              title="位于上游过敏黑名单或非 /medicine 安全路径，不触发极端药物过敏与化学过敏突变"
                            >
                              无过敏
                            </span>
                          )}
                          {isPurityIndependentEffect(r) && (
                            <span
                              className="tag-chip"
                              title="单 tick 主效不随纯度缩放；若存在过量阈值或逆反应，仍按纯度判定"
                            >
                              纯度无关效果
                            </span>
                          )}
                          {patientAllergySet.has(r.id) && <span className="tag-chip danger">患者过敏原</span>}
                          {hasChemicalAllergy && isChemicalAllergyTrigger(r) && (
                            <span className="tag-chip warn">触发化学过敏</span>
                          )}
                          {r.ignoreStasis && <span className="tag-chip good">静滞有效</span>}
                          {r.deadProcess && <span className="tag-chip good">死后生效</span>}
                          {r.selfConsuming && <span className="tag-chip">无肝可代</span>}
                          {r.penetratesSkin === 'TOUCH_VAPOR' && <span className="tag-chip">经皮吸收</span>}
                          {r.isToxin && <span className="tag-chip danger">毒素</span>}
                        </div>
                      </td>
                      <td>
                        <div className="quick-chips">
                          {r.targets.map((t) => (
                            <button
                              key={t}
                              type="button"
                              className={`tag-chip-btn ${selectedTraits.includes(t) ? 'active' : ''}`}
                              title={`勾选/取消「${t}」特征筛选`}
                              onClick={() => toggleTrait(t)}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="mono" style={{ fontSize: 11.5 }}>
                        <div>{(r.metabolizationRate * 2).toFixed(2)}u/tick</div>
                        <div style={{ color: r.overdoseThreshold > 0 ? 'var(--warn)' : 'var(--text-dim)', marginTop: 2 }}>
                          {r.overdoseThreshold > 0 ? `OD ${r.overdoseThreshold}u` : '无OD'}
                        </div>
                      </td>
                      <td className="mono" style={{ fontSize: 11.5 }}>
                        <div>默认 {(r.defaultPurity * 100).toFixed(0)}%</div>
                        {r.inverseChemVal > 0 ? (
                          <div style={{ marginTop: 2 }}>
                            {inv ? (
                              <button
                                type="button"
                                className="inline-link-btn"
                                title={`点击查看逆产物「${inv.zhName}」`}
                                onClick={() => {
                                  setSelectedTraits([]);
                                  setSearch(inv.zhName);
                                }}
                              >
                                &lt;{(r.inverseChemVal * 100).toFixed(0)}% → {inv.zhName}
                              </button>
                            ) : (
                              <span style={{ color: 'var(--warn)' }}>
                                &lt;{(r.inverseChemVal * 100).toFixed(0)}% → 逆产物
                              </span>
                            )}
                          </div>
                        ) : (
                          <div style={{ color: 'var(--text-dim)', marginTop: 2 }}>无逆产物</div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: 12.5 }}>{r.summaryZh}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>
                          {r.mechanicsNoteZh}
                        </div>
                      </td>
                      {onAddReagent && (
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => {
                                onAddReagent(r);
                                if (closeOnAdd) {
                                  onClose();
                                } else {
                                  setJustAddedName(r.zhName);
                                }
                              }}
                            >
                              <Plus size={11} />
                              加入
                            </button>
                            {count > 0 && <span className="tag-chip good mono">已添 ×{count}</span>}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
