import { Check, Copy, Link2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { parseScenarioFromUrlOrText } from '../engine/scenarioShare';
import type { SimScenario } from '../engine/types';
import { useModalA11y } from './useModalA11y';

interface ScenarioShareModalProps {
  open: boolean;
  onClose: () => void;
  shareUrl: string;
  onImportScenario: (scenario: SimScenario) => void;
}

export function ScenarioShareModal({
  open,
  onClose,
  shareUrl,
  onImportScenario,
}: ScenarioShareModalProps) {
  const [importInput, setImportInput] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const shareTextareaRef = useRef<HTMLTextAreaElement>(null);
  const { dialogRef, backdropProps } = useModalA11y({
    open,
    onClose,
    initialFocusRef: shareTextareaRef,
  });

  useEffect(() => {
    if (!open) return;
    setImportError(null);
    setCopied(false);
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!open) return null;

  const handleCopyUrl = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        return;
      }
    } catch {
      // Fallback below: user can select text directly from the readonly textarea
    }
    setCopied(false);
  };

  const handleSubmitImport = () => {
    try {
      const scenario = parseScenarioFromUrlOrText(importInput);
      setImportError(null);
      setImportInput('');
      onImportScenario(scenario);
      onClose();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '导入失败，请检查链接是否完整。');
    }
  };

  return (
    <div className="modal-backdrop" {...backdropProps}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        style={{ width: 'min(640px, 100%)' }}
      >
        <div className="modal-header">
          <h2 id="share-modal-title" className="panel-title" style={{ margin: 0 }}>
            <Link2 size={15} style={{ color: 'var(--accent)' }} aria-hidden="true" />
            场景 URL 分享与导入
          </h2>
          <button
            type="button"
            className="btn btn-icon"
            style={{ minWidth: 32, minHeight: 32 }}
            onClick={onClose}
            aria-label="关闭弹窗"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body">
          <div className="sub-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span className="control-label" style={{ fontWeight: 600, color: 'var(--text)' }}>
                分享当前场景 URL（患者状态 + 给药方案 + 时长与种子）
              </span>
              <span className="dose-sub mono">{shareUrl.length} 字符</span>
            </div>
            <textarea
              ref={shareTextareaRef}
              readOnly
              className="ui-input mono"
              rows={3}
              style={{ width: '100%', resize: 'vertical', fontSize: 11.5 }}
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="当前场景分享链接"
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span className="dose-sub">包含完整患者伤势、过敏设置、给药组合及模拟参数；他人打开链接即可自动复现。</span>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleCopyUrl()}>
                {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                {copied ? '已复制链接' : '复制链接'}
              </button>
            </div>
          </div>

          <div className="sub-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span className="control-label" style={{ fontWeight: 600, color: 'var(--text)' }}>
                通过 URL 或编码串导入场景
              </span>
            </div>
            <textarea
              className="ui-input mono"
              rows={3}
              style={{ width: '100%', resize: 'vertical', fontSize: 11.5 }}
              placeholder="粘贴完整分享 URL、#s=... 片段或分享编码串..."
              aria-label="通过 URL 或编码串导入场景"
              value={importInput}
              onChange={(e) => {
                setImportInput(e.target.value);
                if (importError) setImportError(null);
              }}
            />
            {importError && (
              <div className="warning-banner danger" role="alert">
                <span>{importError}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-sm" onClick={onClose}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!importInput.trim()}
                onClick={handleSubmitImport}
              >
                <Upload size={12} />
                导入并替换当前场景
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
