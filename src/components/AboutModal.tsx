import { ExternalLink, FlaskConical, Info, X } from 'lucide-react';
import { useModalA11y } from './useModalA11y';

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

const PROJECT_REPO_URL = 'https://github.com/yahvk-cuna/SS13-Chemistry-Simulator';
const UPSTREAM_REPO_URL = 'https://github.com/TianguanStation/Tianguan13';
const WIKI_URL = 'https://tgwiki.spacestation14cn.com/index.php?title=Guide_to_chemistry#%E8%8D%AF%E7%89%A9_2';

export function AboutModal({ open, onClose }: AboutModalProps) {
  const { dialogRef, backdropProps } = useModalA11y({ open, onClose });

  if (!open) return null;

  return (
    <div className="modal-backdrop" {...backdropProps}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-modal-title"
        style={{ width: 'min(580px, 100%)' }}
      >
        <div className="modal-header">
          <h2 id="about-modal-title" className="panel-title" style={{ margin: 0 }}>
            <Info size={15} style={{ color: 'var(--accent)' }} aria-hidden="true" />
            关于 · 天关13 药物代谢与伤势模拟器
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

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13, lineHeight: 1.65 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="brand-badge">
              <FlaskConical size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                天关13（Tianguan13 / SS13）药物代谢与伤势模拟器
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                面向医疗与化学玩家的交互式试药台 · GNU AGPL-3.0-or-later
              </div>
            </div>
          </div>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontWeight: 600, color: 'var(--text)' }}>功能说明</div>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              无需进服即可在浏览器中推演多药配伍的疗效、血药与胃药浓度曲线、过量（OD）阈值、低纯度逆产物、体内禁忌反应、器官损伤与肝脏耐受，以及极端药物过敏与化学过敏体质的发作与肾上腺素阻断。
            </p>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              支持固定基准方案对比、药品图鉴多维筛选、本地给药方案存档以及 URL 链接分享场景。
            </p>
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontWeight: 600, color: 'var(--text)' }}>机制与译名来源</div>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              仿真公式（2s / tick 主循环、代谢与纯度反相、器官生理、过敏与体内反应等）与官方中文术语均参考上游游戏仓库{' '}
              <strong>Tianguan13</strong> 源码，并结合 TG13 中文 Wiki 常用别名以方便检索。
            </p>
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontWeight: 600, color: 'var(--text)' }}>源码与参考链接</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <a
                href={PROJECT_REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
                style={{ textDecoration: 'none' }}
              >
                <ExternalLink size={14} />
                本项目源码（GitHub）
              </a>
              <a
                href={UPSTREAM_REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="btn"
                style={{ textDecoration: 'none' }}
              >
                <ExternalLink size={14} />
                上游仓库 Tianguan13
              </a>
              <a
                href={WIKI_URL}
                target="_blank"
                rel="noreferrer"
                className="btn"
                style={{ textDecoration: 'none' }}
              >
                <ExternalLink size={14} />
                TG13 中文 Wiki
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
