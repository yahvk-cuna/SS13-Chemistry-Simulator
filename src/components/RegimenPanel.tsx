import {
  AlertTriangle,
  BookOpen,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Plus,
  Save,
  Syringe,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import {
  REAGENTS,
  computeEffectiveOD,
  getDisplayColor,
  isChemicalAllergyTrigger,
  isNoAllergyReagent,
} from '../engine/reagents';
import {
  cloneRegimenDoses,
  createDefaultDose,
  createOrUpdateSavedRegimen,
  loadSavedRegimensFromStorage,
  parseRegimensJson,
  saveRegimensToStorage,
  serializeRegimensJson,
} from '../engine/regimenStorage';
import type { DeliveryMethod, DoseEvent, ReagentDef, SavedRegimen } from '../engine/types';

interface RegimenPanelProps {
  doses: DoseEvent[];
  onChange: (next: DoseEvent[]) => void;
  patientAllergies: string[];
  hasChemicalAllergy: boolean;
  onOpenReagentLibrary: () => void;
  onInspectReagent?: (def: ReagentDef) => void;
}

const QUICK_ADD_IDS = [
  'libital',
  'lenturi',
  'sal_acid',
  'oxandrolone',
  'multiver',
  'syriniver',
  'salbutamol',
  'atropine',
];

const DELIVERY_OPTIONS: { value: DeliveryMethod; label: string; short: string }[] = [
  { value: 'INJECT', label: '注射 (INJECT)', short: '注射' },
  { value: 'INGEST', label: '口服/药丸 (INGEST)', short: '口服' },
  { value: 'PATCH', label: '贴片 (PATCH 0.75u/t)', short: '贴片' },
  { value: 'IV_DRIP', label: '静脉滴注 (IV_DRIP)', short: '静滴' },
  { value: 'TOUCH', label: '接触泼洒 (TOUCH)', short: '接触' },
  { value: 'VAPOR', label: '蒸气喷洒 (VAPOR)', short: '蒸气' },
];

export function RegimenPanel({
  doses,
  onChange,
  patientAllergies,
  hasChemicalAllergy,
  onOpenReagentLibrary,
  onInspectReagent,
}: RegimenPanelProps) {
  const patientAllergySet = useMemo(() => new Set(patientAllergies), [patientAllergies]);
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedRegimens, setSavedRegimens] = useState<SavedRegimen[]>(() => loadSavedRegimensFromStorage());
  const [schemeName, setSchemeName] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'good' | 'warn'; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmOverwriteId, setConfirmOverwriteId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({});
  const [hoveredInfo, setHoveredInfo] = useState<{ def: ReagentDef; x: number; y: number } | null>(null);

  const showHoverTooltip = (def: ReagentDef, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const x = Math.min(rect.right + 10, Math.max(12, window.innerWidth - 310));
    const y = Math.min(Math.max(12, rect.top - 8), Math.max(12, window.innerHeight - 200));
    setHoveredInfo({ def, x, y });
  };

  useEffect(() => {
    if (!feedbackMsg) return;
    const timer = window.setTimeout(() => setFeedbackMsg(null), 3500);
    return () => window.clearTimeout(timer);
  }, [feedbackMsg]);

  useEffect(() => {
    if (!confirmClear) return;
    const timer = window.setTimeout(() => setConfirmClear(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmClear]);

  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = window.setTimeout(() => setConfirmDeleteId(null), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmDeleteId]);

  useEffect(() => {
    if (!confirmOverwriteId) return;
    const timer = window.setTimeout(() => setConfirmOverwriteId(null), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmOverwriteId]);

  const updateSavedList = (next: SavedRegimen[]) => {
    setSavedRegimens(next);
    saveRegimensToStorage(next);
  };

  const matchedByName = useMemo(() => {
    const clean = schemeName.trim();
    return clean ? savedRegimens.some((item) => item.name.trim() === clean) : false;
  }, [savedRegimens, schemeName]);

  const handleSaveCurrent = () => {
    if (doses.length === 0) return;
    const { list, saved } = createOrUpdateSavedRegimen(savedRegimens, schemeName, doses);
    updateSavedList(list);
    setSchemeName(saved.name);
    setFeedbackMsg({ type: 'good', text: `已保存方案「${saved.name}」（共 ${saved.doses.length} 项）` });
  };

  const handleOverwriteRegimen = (item: SavedRegimen) => {
    if (doses.length === 0) return;
    if (confirmOverwriteId !== item.id) {
      setConfirmOverwriteId(item.id);
      return;
    }
    const { list, saved } = createOrUpdateSavedRegimen(savedRegimens, item.name, doses, item.id);
    updateSavedList(list);
    setConfirmOverwriteId(null);
    setFeedbackMsg({ type: 'good', text: `已用当前给药覆盖「${saved.name}」` });
  };

  const handleLoadRegimen = (item: SavedRegimen) => {
    onChange(cloneRegimenDoses(item.doses));
    setSchemeName(item.name);
    setFeedbackMsg({ type: 'good', text: `已加载方案「${item.name}」` });
  };

  const handleAppendRegimen = (item: SavedRegimen) => {
    onChange([...doses, ...cloneRegimenDoses(item.doses)]);
    setFeedbackMsg({ type: 'good', text: `已追加「${item.name}」的 ${item.doses.length} 项药品` });
  };

  const handleDeleteRegimen = (item: SavedRegimen) => {
    if (confirmDeleteId !== item.id) {
      setConfirmDeleteId(item.id);
      return;
    }
    const next = savedRegimens.filter((r) => r.id !== item.id);
    updateSavedList(next);
    setConfirmDeleteId(null);
    setFeedbackMsg({ type: 'warn', text: `已删除方案「${item.name}」` });
  };

  const copyJsonPayload = async (targets: SavedRegimen[], successLabel: string) => {
    const json = serializeRegimensJson(targets);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
        setFeedbackMsg({ type: 'good', text: successLabel });
        return;
      }
    } catch {
      // Fallback to import drawer textarea below
    }
    setSavedOpen(true);
    setImportOpen(true);
    setImportText(json);
    setFeedbackMsg({ type: 'good', text: '已在下方文本框生成 JSON，可手动复制' });
  };

  const handleCopyCurrentJson = () => {
    if (doses.length === 0) return;
    const currentItem = createOrUpdateSavedRegimen([], schemeName, doses).saved;
    void copyJsonPayload([currentItem], `已复制当前方案「${currentItem.name}」JSON`);
  };

  const handleDownloadAllJson = () => {
    if (savedRegimens.length === 0) return;
    const json = serializeRegimensJson(savedRegimens);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ss13-regimens.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setFeedbackMsg({ type: 'good', text: `已导出全部 ${savedRegimens.length} 套方案至 ss13-regimens.json` });
  };

  const applyImportedText = (rawText: string) => {
    try {
      const imported = parseRegimensJson(rawText);
      let nextList = [...savedRegimens];
      for (let i = imported.length - 1; i >= 0; i--) {
        const reg = imported[i];
        const res = createOrUpdateSavedRegimen(nextList, reg.name, reg.doses);
        nextList = res.list;
      }
      updateSavedList(nextList);
      if (imported.length === 1) {
        onChange(cloneRegimenDoses(imported[0].doses));
        setSchemeName(imported[0].name);
      }
      setImportText('');
      setImportOpen(false);
      setFeedbackMsg({
        type: 'good',
        text:
          imported.length === 1
            ? `已导入并加载方案「${imported[0].name}」`
            : `成功导入 ${imported.length} 套给药方案`,
      });
    } catch (err) {
      setFeedbackMsg({
        type: 'warn',
        text: err instanceof Error ? err.message : '导入 JSON 失败',
      });
    }
  };

  const handleFileImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        applyImportedText(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const addReagent = (def: ReagentDef) => {
    onChange([...doses, createDefaultDose(def)]);
  };

  const updateDose = (id: string, patch: Partial<DoseEvent>) => {
    onChange(doses.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const duplicateDose = (dose: DoseEvent) => {
    const copy: DoseEvent = {
      ...dose,
      id: `dose-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    onChange([...doses, copy]);
  };

  const removeDose = (id: string) => {
    onChange(doses.filter((d) => d.id !== id));
  };

  const handleClearDoses = () => {
    if (doses.length === 0) return;
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    onChange([]);
    setConfirmClear(false);
    setFeedbackMsg({ type: 'warn', text: '已清空当前给药方案' });
  };

  const preflightWarnings = useMemo(() => {
    const warnings: { level: 'danger' | 'warn' | 'info'; text: string }[] = [];
    const active = doses.filter((d) => d.enabled && d.volume > 0);
    const ids = new Set(active.map((d) => d.reagentId));

    if (ids.has('penthrite') && (ids.has('epinephrine') || ids.has('atropine'))) {
      warnings.push({
        level: 'danger',
        text: '配伍禁忌：彭斯莱特与肾上腺素/阿托品相遇会立即体内爆炸并清空所有血液试剂！',
      });
    }

    if (ids.has('epinephrine') && ids.has('lexorin')) {
      warnings.push({
        level: 'warn',
        text: '药理冲突：肾上腺素遇到莱克索林时将停止治疗并生成组胺。',
      });
    }

    for (const d of active) {
      const def = REAGENTS[d.reagentId];
      if (!def) continue;
      if (d.method !== 'IV_DRIP' && d.method !== 'PATCH') {
        const effOD = computeEffectiveOD(def, d.purity);
        if (effOD > 0 && d.volume >= effOD) {
          warnings.push({
            level: 'warn',
            text: `过量预警：${def.zhName} 单次 ${d.volume}u ≥ 有效过量阈值 ${effOD.toFixed(1)}u。`,
          });
        }
      }
      if (def.inverseChemVal > 0 && d.purity < def.inverseChemVal) {
        const invDef = def.inverseChemId ? REAGENTS[def.inverseChemId] : null;
        warnings.push({
          level: 'warn',
          text: `逆反应预警：${def.zhName} 纯度 ${(d.purity * 100).toFixed(0)}% < ${(def.inverseChemVal * 100).toFixed(0)}%，入体将转化为 ${invDef?.zhName ?? '逆产物'}。`,
        });
      }
      if (d.reagentId === 'synthflesh' && (d.method === 'INJECT' || d.method === 'INGEST')) {
        warnings.push({
          level: 'info',
          text: '给药方式提示：合成肉仅在 贴片/接触/蒸气 时生效，注射或口服无治疗效果。',
        });
      }
    }

    if ((ids.has('calomel') || ids.has('pen_acid')) && active.length > 1) {
      warnings.push({
        level: 'info',
        text: '清血药提示：甘汞与喷替酸会同时加速清除体内共存的其他有效治疗药物。',
      });
    }

    const extremeHits = Array.from(
      new Set(
        active
          .filter((d) => patientAllergySet.has(d.reagentId))
          .map((d) => REAGENTS[d.reagentId]?.zhName ?? d.reagentId),
      ),
    );
    if (extremeHits.length > 0) {
      const hasEpi = ids.has('epinephrine');
      warnings.push({
        level: 'danger',
        text: hasEpi
          ? `命中患者过敏原（${extremeHits.join(' / ')}）：方案含肾上腺素可阻断毒素与组胺，但过敏原消耗会被暂停，耗尽前需清血。`
          : `命中患者过敏原（${extremeHits.join(' / ')}）：每 tick 将产 +6 毒与 +6u 组胺并伴呕吐内脏伤！建议改用「无过敏」药物或配肾上腺素+苯海拉明。`,
      });
    }

    if (hasChemicalAllergy) {
      const chemHits = Array.from(
        new Set(
          active
            .filter((d) => {
              const def = REAGENTS[d.reagentId];
              return def && isChemicalAllergyTrigger(def);
            })
            .map((d) => REAGENTS[d.reagentId]?.zhName ?? d.reagentId),
        ),
      );
      if (chemHits.length > 0) {
        warnings.push({
          level: 'danger',
          text: `命中「化学过敏」突变（${chemHits.join(' / ')}）：存量 ≥1u 时诱发毒素、失血与呼吸抑制，且不受肾上腺素阻断。`,
        });
      }
    }

    return warnings;
  }, [doses, patientAllergySet, hasChemicalAllergy]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <Syringe size={15} style={{ color: 'var(--accent)' }} />
          给药组合方案 ({doses.filter((d) => d.enabled).length} 项启用)
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {doses.length > 0 && (
            <button
              type="button"
              className={`btn btn-sm ${confirmClear ? 'btn-danger' : ''}`}
              title="清空当前全部给药条目"
              onClick={handleClearDoses}
            >
              <Trash2 size={12} />
              {confirmClear ? '确认清空?' : '清空'}
            </button>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={onOpenReagentLibrary}>
            <Plus size={13} />
            添加药品
          </button>
        </div>
      </div>

      <div className="panel-body">
        <button type="button" className="collapse-btn" onClick={() => setSavedOpen((v) => !v)}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Bookmark size={13} style={{ color: 'var(--accent)' }} />
            <span>方案存档与导入导出 ({savedRegimens.length})</span>
          </span>
          {savedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {feedbackMsg && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6,
              padding: '5px 8px',
              borderRadius: 6,
              fontSize: 11,
              background: feedbackMsg.type === 'good' ? 'var(--good-dim)' : 'var(--warn-dim)',
              border: `1px solid ${feedbackMsg.type === 'good' ? 'rgba(34, 197, 94, 0.35)' : 'rgba(245, 158, 11, 0.4)'}`,
              color: feedbackMsg.type === 'good' ? '#86efac' : '#fde68a',
            }}
          >
            <span>{feedbackMsg.text}</span>
            <button
              type="button"
              style={{ background: 'transparent', border: 'none', padding: 0, display: 'inline-flex' }}
              onClick={() => setFeedbackMsg(null)}
              aria-label="关闭提示"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {savedOpen && (
          <div className="sub-box">
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                className="ui-input"
                style={{ flex: 1, minWidth: 0, fontSize: 12 }}
                placeholder="输入方案名称（留空则按药品自动命名）..."
                value={schemeName}
                onChange={(e) => setSchemeName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && doses.length > 0) {
                    handleSaveCurrent();
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={doses.length === 0}
                onClick={handleSaveCurrent}
              >
                <Save size={12} />
                {matchedByName ? '覆盖同名' : '保存当前'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-sm"
                disabled={doses.length === 0}
                title="仅复制当前正在编排的给药方案 JSON"
                onClick={handleCopyCurrentJson}
              >
                <Copy size={11} />
                复制当前 JSON
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={savedRegimens.length === 0}
                title="导出全部已保存方案为 JSON 文件"
                onClick={handleDownloadAllJson}
              >
                <Download size={11} />
                导出全部
              </button>
              <button
                type="button"
                className={`btn btn-sm ${importOpen ? 'btn-primary' : ''}`}
                onClick={() => setImportOpen((v) => !v)}
              >
                <Upload size={11} />
                导入 JSON
              </button>
            </div>

            {importOpen && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: 8,
                  borderRadius: 6,
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span className="control-label">读取 .json 文件或粘贴文本</span>
                  <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
                    <Upload size={11} />
                    选择文件
                    <input
                      type="file"
                      accept=".json,application/json"
                      style={{ display: 'none' }}
                      onChange={handleFileImport}
                    />
                  </label>
                </div>
                <textarea
                  className="ui-input mono"
                  rows={3}
                  style={{ width: '100%', resize: 'vertical', fontSize: 11 }}
                  placeholder='粘贴方案 JSON（支持 {"regimens":[...]} 或单方案对象）...'
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                  <button type="button" className="btn btn-sm" onClick={() => setImportOpen(false)}>
                    取消
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!importText.trim()}
                    onClick={() => applyImportedText(importText)}
                  >
                    确认导入
                  </button>
                </div>
              </div>
            )}

            {savedRegimens.length === 0 ? (
              <div className="dose-sub" style={{ textAlign: 'center', padding: '6px 0' }}>
                暂无本地存档，输入名称并点击「保存当前」即可存入浏览器本地。
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  maxHeight: 220,
                  overflowY: 'auto',
                }}
              >
                {savedRegimens.map((item) => {
                  const summaryParts = item.doses
                    .map((d) => {
                      const r = REAGENTS[d.reagentId];
                      return r ? `${r.zhName} ${d.volume}u` : d.reagentId;
                    })
                    .join(' / ');
                  const isConfirmDelete = confirmDeleteId === item.id;
                  const isConfirmOverwrite = confirmOverwriteId === item.id;
                  return (
                    <div key={item.id} className="saved-regimen-item">
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={item.name}
                        >
                          {item.name}
                        </div>
                        <div
                          className="dose-sub"
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={summaryParts}
                        >
                          {item.doses.length} 项 · {summaryParts}
                        </div>
                      </div>
                      <div className="saved-regimen-actions">
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            title="替换当前给药方案（保留患者当前伤势）"
                            onClick={() => handleLoadRegimen(item)}
                          >
                            加载
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            title="追加合并到当前给药方案末尾"
                            onClick={() => handleAppendRegimen(item)}
                          >
                            追加
                          </button>
                          <button
                            type="button"
                            className={`btn btn-sm ${isConfirmOverwrite ? 'btn-primary' : ''}`}
                            disabled={doses.length === 0}
                            title="用当前给药方案覆盖此存档内容（保留原存档名）"
                            onClick={() => handleOverwriteRegimen(item)}
                          >
                            {isConfirmOverwrite ? '确认覆盖?' : '覆盖'}
                          </button>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            type="button"
                            className="btn btn-icon"
                            title="复制此单套方案 JSON"
                            onClick={() => void copyJsonPayload([item], `已复制方案「${item.name}」JSON`)}
                          >
                            <Copy size={11} />
                          </button>
                          <button
                            type="button"
                            className={`btn btn-danger ${isConfirmDelete ? 'btn-sm' : 'btn-icon'}`}
                            title="删除此存档（需二次点击确认）"
                            onClick={() => handleDeleteRegimen(item)}
                          >
                            {isConfirmDelete ? '确认删?' : <Trash2 size={12} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div>
          <div className="control-label" style={{ marginBottom: 5 }}>
            常用速添
          </div>
          <div className="quick-chips">
            {QUICK_ADD_IDS.map((id) => {
              const r = REAGENTS[id];
              if (!r) return null;
              return (
                <button
                  key={id}
                  type="button"
                  className="quick-chip"
                  onClick={() => addReagent(r)}
                  onMouseEnter={(e) => showHoverTooltip(r, e.currentTarget)}
                  onMouseLeave={() => setHoveredInfo(null)}
                  onFocus={(e) => showHoverTooltip(r, e.currentTarget)}
                  onBlur={() => setHoveredInfo(null)}
                >
                  <span className="color-dot" style={{ background: getDisplayColor(r.color) }} />
                  <span>{r.zhName}</span>
                </button>
              );
            })}
          </div>
        </div>

        {preflightWarnings.map((w, idx) => (
          <div key={idx} className={`warning-banner ${w.level}`}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{w.text}</span>
            </div>
          </div>
        ))}

        {doses.length === 0 && (
          <div style={{ padding: 14, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            尚未添加任何药品，请点击「添加药品」或上方速添按钮。
          </div>
        )}

        {doses.map((dose) => {
          const def = REAGENTS[dose.reagentId];
          if (!def) return null;
          const effOD = computeEffectiveOD(def, dose.purity);
          const isCollapsed = Boolean(collapsedIds[dose.id]);
          const methodShort = DELIVERY_OPTIONS.find((m) => m.value === dose.method)?.short ?? dose.method;
          const purityPresets = def.defaultPurity === 0.5 ? [0.5, 0.75, 1] : [0.75, 1];
          const hitsExtremeAllergy = patientAllergySet.has(dose.reagentId);
          const hitsChemicalAllergy = hasChemicalAllergy && isChemicalAllergyTrigger(def);
          const isAllergyHit = dose.enabled && (hitsExtremeAllergy || hitsChemicalAllergy);
          return (
            <div key={dose.id} className={`dose-card ${dose.enabled ? '' : 'disabled'}${isAllergyHit ? ' allergy-hit' : ''}`}>
              <div className="dose-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, flex: 1 }}>
                  <button
                    type="button"
                    className="btn btn-icon"
                    style={{ width: 22, height: 22 }}
                    title={isCollapsed ? '展开参数' : '收起参数'}
                    onClick={() =>
                      setCollapsedIds((prev) => ({
                        ...prev,
                        [dose.id]: !prev[dose.id],
                      }))
                    }
                  >
                    {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  </button>
                  <label
                    className="dose-name"
                    style={{ cursor: 'pointer', flex: 1 }}
                    onMouseEnter={(e) => showHoverTooltip(def, e.currentTarget)}
                    onMouseLeave={() => setHoveredInfo(null)}
                  >
                    <input
                      type="checkbox"
                      checked={dose.enabled}
                      onChange={(e) => updateDose(dose.id, { enabled: e.target.checked })}
                    />
                    <span className="color-dot" style={{ background: getDisplayColor(def.color) }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {def.zhName}
                    </span>
                    <span className="dose-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {def.enName}
                    </span>
                    {hitsExtremeAllergy ? (
                      <span className="allergy-badge" style={{ flexShrink: 0 }}>
                        过敏原
                      </span>
                    ) : hitsChemicalAllergy ? (
                      <span className="allergy-badge" style={{ flexShrink: 0 }}>
                        化学过敏
                      </span>
                    ) : null}
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {onInspectReagent && (
                    <button
                      type="button"
                      className="btn btn-icon"
                      title="在药品图鉴中查看详参"
                      onClick={() => onInspectReagent(def)}
                    >
                      <BookOpen size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-icon"
                    title="复制一项"
                    onClick={() => duplicateDose(dose)}
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon btn-danger"
                    title="移除"
                    onClick={() => removeDose(dose.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {isCollapsed ? (
                <div className="dose-sub mono" style={{ paddingLeft: 27 }}>
                  {dose.volume}u · {methodShort} · t={dose.startTime}s · 纯度 {Math.round(dose.purity * 100)}%
                </div>
              ) : (
                <>
                  <div className="slider-row">
                    <span className="slider-label">剂量(u)</span>
                    <input
                      type="range"
                      min={0.5}
                      max={100}
                      step={0.5}
                      value={dose.volume}
                      onChange={(e) => updateDose(dose.id, { volume: Number(e.target.value) })}
                    />
                    <input
                      type="number"
                      className="num-input-sm"
                      min={0.1}
                      max={500}
                      step={0.5}
                      value={dose.volume}
                      onChange={(e) => updateDose(dose.id, { volume: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </div>

                  <div className="grid-2">
                    <div>
                      <div className="control-label" style={{ marginBottom: 3 }}>
                        给药方式
                      </div>
                      <select
                        className="ui-select"
                        style={{ width: '100%' }}
                        value={dose.method}
                        onChange={(e) => updateDose(dose.id, { method: e.target.value as DeliveryMethod })}
                      >
                        {DELIVERY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="control-label" style={{ marginBottom: 3 }}>
                        给药时间 (s)
                      </div>
                      <input
                        type="number"
                        className="ui-input mono"
                        style={{ width: '100%' }}
                        min={0}
                        max={600}
                        step={2}
                        value={dose.startTime}
                        onChange={(e) => updateDose(dose.id, { startTime: Math.max(0, Number(e.target.value) || 0) })}
                      />
                    </div>
                  </div>

                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 11,
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <span>
                          纯度 <strong className="mono">{Math.round(dose.purity * 100)}%</strong>
                          {def.inverseChemVal > 0 && ` (逆 <${Math.round(def.inverseChemVal * 100)}%)`}
                        </span>
                        <span className="purity-presets">
                          {purityPresets.map((p) => (
                            <button
                              key={p}
                              type="button"
                              className={`purity-pill mono ${Math.abs(dose.purity - p) < 0.001 ? 'active' : ''}`}
                              onClick={() => updateDose(dose.id, { purity: p })}
                            >
                              {Math.round(p * 100)}%
                            </button>
                          ))}
                        </span>
                      </span>
                      <span className="mono" style={{ whiteSpace: 'nowrap' }}>
                        {effOD > 0 ? `有效OD ${effOD.toFixed(1)}u` : '无OD'} · {(def.metabolizationRate * 2).toFixed(2)}u/t
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.05}
                      max={1}
                      step={0.05}
                      value={dose.purity}
                      onChange={(e) => updateDose(dose.id, { purity: Number(e.target.value) })}
                    />
                  </div>

                  {(dose.method === 'IV_DRIP' || dose.reagentId === 'seiver') && (
                    <div className="grid-2">
                      {dose.method === 'IV_DRIP' && (
                        <div>
                          <div className="control-label" style={{ marginBottom: 3 }}>
                            滴速 (u/tick)
                          </div>
                          <input
                            type="number"
                            className="ui-input mono"
                            style={{ width: '100%' }}
                            min={0.5}
                            max={20}
                            step={0.5}
                            value={dose.ivRate}
                            onChange={(e) => updateDose(dose.id, { ivRate: Math.max(0.5, Number(e.target.value) || 1) })}
                          />
                        </div>
                      )}
                      {dose.reagentId === 'seiver' && (
                        <div>
                          <div className="control-label" style={{ marginBottom: 3 }}>
                            药液温度 (K)
                          </div>
                          <input
                            type="number"
                            className="ui-input mono"
                            style={{ width: '100%' }}
                            min={5}
                            max={1200}
                            step={10}
                            value={dose.temp}
                            onChange={(e) => updateDose(dose.id, { temp: Math.max(5, Number(e.target.value) || 300) })}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {hoveredInfo && (
        <div
          className="reagent-hover-tooltip"
          style={{ left: hoveredInfo.x, top: hoveredInfo.y }}
          role="tooltip"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 12.5 }}>
              <span className="color-dot" style={{ background: getDisplayColor(hoveredInfo.def.color) }} />
              <span>{hoveredInfo.def.zhName}</span>
              <span className="dose-sub">{hoveredInfo.def.enName}</span>
            </div>
            <span className="tag-chip mono">pH {hoveredInfo.def.ph}</span>
          </div>

          <div className="quick-chips">
            {isNoAllergyReagent(hoveredInfo.def) && <span className="tag-chip good">无过敏</span>}
            {patientAllergySet.has(hoveredInfo.def.id) && <span className="tag-chip danger">患者过敏原</span>}
            {hasChemicalAllergy && isChemicalAllergyTrigger(hoveredInfo.def) && (
              <span className="tag-chip warn">触发化学过敏</span>
            )}
            {hoveredInfo.def.targets.map((t) => (
              <span key={t} className="tag-chip">
                {t}
              </span>
            ))}
          </div>

          <div className="mono" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', fontSize: 11 }}>
            <span>代谢 {(hoveredInfo.def.metabolizationRate * 2).toFixed(2)}u/t</span>
            <span style={{ color: hoveredInfo.def.overdoseThreshold > 0 ? 'var(--warn)' : 'var(--text-dim)' }}>
              {hoveredInfo.def.overdoseThreshold > 0
                ? `OD ${hoveredInfo.def.overdoseThreshold}u (基准${Math.round(hoveredInfo.def.defaultPurity * 100)}%)`
                : '无OD'}
            </span>
            {hoveredInfo.def.inverseChemVal > 0 && (
              <span style={{ color: 'var(--warn)' }}>
                逆 &lt;{Math.round(hoveredInfo.def.inverseChemVal * 100)}% →{' '}
                {REAGENTS[hoveredInfo.def.inverseChemId ?? '']?.zhName ?? '逆产物'}
              </span>
            )}
          </div>

          <div style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--text)' }}>
            {hoveredInfo.def.summaryZh}
          </div>
          {hoveredInfo.def.mechanicsNoteZh && (
            <div style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--text-muted)' }}>
              {hoveredInfo.def.mechanicsNoteZh}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
