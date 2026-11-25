import { AlertCircle, AlertTriangle, CheckCircle2, Info, Undo2, X } from 'lucide-react';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AboutModal } from './components/AboutModal';
import { EventLog } from './components/EventLog';
import { HandbookModal } from './components/HandbookModal';
import { HeaderBar } from './components/HeaderBar';
import { PatientPanel } from './components/PatientPanel';
import { RegimenPanel } from './components/RegimenPanel';
import { ResultJumpButton } from './components/ResultJumpButton';
import { ScenarioShareModal } from './components/ScenarioShareModal';
import { SummaryStrip } from './components/SummaryStrip';
import { TickInspector } from './components/TickInspector';
import { TimelineCharts } from './components/TimelineCharts';
import { MOB_STAT_ZH } from './engine/constants';
import { createDefaultDose } from './engine/regimenStorage';
import {
  buildScenarioShareUrl,
  createBlankScenario,
  encodeScenarioPayload,
  getScenarioHistoryUrl,
  tryReadScenarioFromHash,
} from './engine/scenarioShare';
import { loadScenarioFromStorage, saveScenarioToStorage } from './engine/scenarioStorage';
import { runSimulation } from './engine/simulator';
import type { DoseEvent, PatientConfig, ReagentDef, RngMode, SimResult, SimScenario } from './engine/types';

export interface BannerNotice {
  type: 'neutral' | 'good' | 'warn' | 'danger';
  text: string;
  action?: {
    label: string;
    onAction: () => void;
  };
  durationMs?: number;
}

function clonePatient(p: PatientConfig): PatientConfig {
  return { ...p, organs: { ...p.organs }, allergies: [...(p.allergies ?? [])] };
}

function cloneDoses(doses: DoseEvent[]): DoseEvent[] {
  return doses.map((d) => ({ ...d }));
}

function cloneScenario(scenario: SimScenario): SimScenario {
  return {
    patient: clonePatient(scenario.patient),
    doses: cloneDoses(scenario.doses),
    durationSeconds: scenario.durationSeconds,
    rngMode: scenario.rngMode,
    seed: scenario.seed,
  };
}

const DEFAULT_TOAST_DURATION_MS = 5000;
const UNDO_TOAST_DURATION_MS = 12000;

function replaceHistoryUrlSafely(url: string): void {
  if (typeof window === 'undefined' || typeof window.history?.replaceState !== 'function') {
    return;
  }
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (currentUrl === url) return;
  try {
    window.history.replaceState(null, '', url);
  } catch {
    // Ignore Safari replaceState rate-limit or restricted history errors
  }
}

function readInitialScenarioState(): {
  scenario: SimScenario;
  hashError: string | null;
} {
  if (typeof window !== 'undefined') {
    const { scenario: hashScenario, error: hashError } = tryReadScenarioFromHash(window.location.hash);
    if (hashScenario) {
      return { scenario: hashScenario, hashError: null };
    }
    const storedScenario = loadScenarioFromStorage();
    if (storedScenario) {
      return {
        scenario: storedScenario,
        hashError,
      };
    }
    if (hashError) {
      return { scenario: createBlankScenario(), hashError };
    }
  }
  return { scenario: createBlankScenario(), hashError: null };
}

export function App() {
  const [initialBoot] = useState(readInitialScenarioState);

  const [patient, setPatient] = useState<PatientConfig>(() => clonePatient(initialBoot.scenario.patient));
  const [doses, setDoses] = useState<DoseEvent[]>(() => cloneDoses(initialBoot.scenario.doses));
  const [durationSeconds, setDurationSeconds] = useState<number>(initialBoot.scenario.durationSeconds);
  const [rngMode, setRngMode] = useState<RngMode>(initialBoot.scenario.rngMode);
  const [seed, setSeed] = useState<number>(initialBoot.scenario.seed);

  const [baselineResult, setBaselineResult] = useState<SimResult | null>(null);
  const [selectedTime, setSelectedTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playSpeed, setPlaySpeed] = useState<number>(4);
  const [handbookOpen, setHandbookOpen] = useState<boolean>(false);
  const [handbookQuery, setHandbookQuery] = useState<string>('');
  const [shareModalOpen, setShareModalOpen] = useState<boolean>(false);
  const [aboutOpen, setAboutOpen] = useState<boolean>(false);
  const [scenarioVersion, setScenarioVersion] = useState<number>(0);
  const toastSeqRef = useRef<number>(0);
  const toastRemainingRef = useRef<number>(DEFAULT_TOAST_DURATION_MS);
  const [toastPaused, setToastPaused] = useState<boolean>(false);
  const [toastState, setToastState] = useState<{ id: number; notice: BannerNotice } | null>(() => {
    if (!initialBoot.hashError) return null;
    const notice: BannerNotice = { type: 'warn', text: initialBoot.hashError };
    toastRemainingRef.current = DEFAULT_TOAST_DURATION_MS;
    return { id: ++toastSeqRef.current, notice };
  });

  const setBannerNotice = useCallback((notice: BannerNotice | null) => {
    setToastPaused(false);
    toastRemainingRef.current = notice ? (notice.durationMs ?? DEFAULT_TOAST_DURATION_MS) : 0;
    setToastState(notice ? { id: ++toastSeqRef.current, notice } : null);
  }, []);

  const doseCountsByReagent = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of doses) {
      counts[d.reagentId] = (counts[d.reagentId] ?? 0) + 1;
    }
    return counts;
  }, [doses]);

  const currentScenario = useMemo<SimScenario>(
    () => ({ patient, doses, durationSeconds, rngMode, seed }),
    [patient, doses, durationSeconds, rngMode, seed],
  );
  const latestScenarioRef = useRef<SimScenario>(currentScenario);
  latestScenarioRef.current = currentScenario;
  const initialBootPayloadRef = useRef<string>(encodeScenarioPayload(initialBoot.scenario));
  const preserveBrokenHashRef = useRef<boolean>(Boolean(initialBoot.hashError));

  const syncUrlForScenario = (scenario: SimScenario, force = false) => {
    if (typeof window === 'undefined') return;
    if (!force && preserveBrokenHashRef.current) {
      if (encodeScenarioPayload(scenario) === initialBootPayloadRef.current) {
        return;
      }
      preserveBrokenHashRef.current = false;
    }
    replaceHistoryUrlSafely(getScenarioHistoryUrl(scenario, window.location));
  };

  const currentShareUrl = useMemo(() => buildScenarioShareUrl(currentScenario), [currentScenario]);

  const result = useMemo(
    () => runSimulation(patient, doses, { durationSeconds, rngMode, seed }),
    [patient, doses, durationSeconds, rngMode, seed],
  );
  const actualDurationSeconds = result.summary.actualDurationSeconds;

  // Debounced auto-save to localStorage and URL hash sync on scenario changes
  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveScenarioToStorage(currentScenario);
      syncUrlForScenario(currentScenario);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [currentScenario]);

  // Flush latest scenario to localStorage and URL hash immediately when page hides
  useEffect(() => {
    const flushScenario = () => {
      saveScenarioToStorage(latestScenarioRef.current);
      syncUrlForScenario(latestScenarioRef.current);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushScenario();
      }
    };
    window.addEventListener('pagehide', flushScenario);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flushScenario);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // Sync state when browser URL hash changes externally
  useEffect(() => {
    const onHashChange = () => {
      const { scenario, error } = tryReadScenarioFromHash(window.location.hash);
      if (scenario) {
        preserveBrokenHashRef.current = false;
        setPatient(clonePatient(scenario.patient));
        setDoses(cloneDoses(scenario.doses));
        setDurationSeconds(scenario.durationSeconds);
        setRngMode(scenario.rngMode);
        setSeed(scenario.seed);
        setSelectedTime(0);
        setIsPlaying(false);
        setBaselineResult(null);
        setScenarioVersion((v) => v + 1);
        setBannerNotice({ type: 'good', text: '已从 URL 链接自动还原场景。' });
      } else if (error) {
        preserveBrokenHashRef.current = true;
        initialBootPayloadRef.current = encodeScenarioPayload(latestScenarioRef.current);
        setBannerNotice({ type: 'warn', text: error });
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Auto-dismiss transient notices (warn stays until dismissed)
  useEffect(() => {
    if (!toastState || toastState.notice.type === 'warn' || toastPaused) return;
    const remaining = Math.max(0, toastRemainingRef.current);
    const startedAt = Date.now();
    const timer = window.setTimeout(() => setToastState(null), remaining);
    return () => {
      window.clearTimeout(timer);
      toastRemainingRef.current = Math.max(0, remaining - (Date.now() - startedAt));
    };
  }, [toastState, toastPaused]);

  // Clamp selectedTime when duration shrinks
  useEffect(() => {
    if (selectedTime > actualDurationSeconds) {
      setSelectedTime(actualDurationSeconds);
    }
  }, [actualDurationSeconds, selectedTime]);

  // Playback timer
  useEffect(() => {
    if (!isPlaying) return;
    const intervalMs = Math.max(40, Math.round(500 / playSpeed));
    const timer = window.setInterval(() => {
      setSelectedTime((prev) => {
        if (prev + 2 > actualDurationSeconds) {
          setIsPlaying(false);
          return actualDurationSeconds;
        }
        return prev + 2;
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, playSpeed, actualDurationSeconds]);

  const applyScenario = (scenario: SimScenario) => {
    setPatient(clonePatient(scenario.patient));
    setDoses(cloneDoses(scenario.doses));
    setDurationSeconds(scenario.durationSeconds);
    setRngMode(scenario.rngMode);
    setSeed(scenario.seed);
    setSelectedTime(0);
    setIsPlaying(false);
    setBaselineResult(null);
    setScenarioVersion((v) => v + 1);
  };

  const handleOpenShare = () => {
    preserveBrokenHashRef.current = false;
    syncUrlForScenario(currentScenario, true);
    setShareModalOpen(true);
  };

  const replaceScenarioWithUndo = (
    nextScenario: SimScenario,
    options: {
      nextUrl: string;
      noticeText: string;
      noticeType?: BannerNotice['type'];
    },
  ) => {
    const snapshot = cloneScenario(currentScenario);
    const previousUrl =
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : '';

    preserveBrokenHashRef.current = false;
    applyScenario(nextScenario);
    replaceHistoryUrlSafely(options.nextUrl);

    setBannerNotice({
      type: options.noticeType ?? 'neutral',
      text: options.noticeText,
      durationMs: UNDO_TOAST_DURATION_MS,
      action: {
        label: '撤销',
        onAction: () => {
          preserveBrokenHashRef.current = false;
          applyScenario(snapshot);
          replaceHistoryUrlSafely(previousUrl);
        },
      },
    });
  };

  const handleImportScenario = (scenario: SimScenario) => {
    const nextUrl =
      typeof window !== 'undefined' ? getScenarioHistoryUrl(scenario, window.location) : '';
    replaceScenarioWithUndo(scenario, {
      nextUrl,
      noticeType: 'neutral',
      noticeText: `已从链接导入场景（${scenario.doses.length} 项给药，${scenario.durationSeconds <= 0 ? '自动' : `${scenario.durationSeconds}s`}）`,
    });
  };

  const handleResetScenario = () => {
    const blank = createBlankScenario();
    const nextUrl =
      typeof window !== 'undefined' ? getScenarioHistoryUrl(blank, window.location) : '';
    replaceScenarioWithUndo(blank, {
      nextUrl,
      noticeType: 'danger',
      noticeText: '已重置为空白场景。',
    });
  };

  const handlePatientChange = (next: PatientConfig) => {
    setPatient(next);
  };

  const handleDosesChange = (next: DoseEvent[]) => {
    setDoses(next);
  };

  const handleAddReagent = (def: ReagentDef) => {
    setDoses((prev) => [...prev, createDefaultDose(def)]);
  };

  const currentSnap =
    result.snapshots[Math.min(result.snapshots.length - 1, Math.max(0, Math.round(selectedTime / 2)))] ??
    result.snapshots[0];

  const baselineLabel = useMemo(() => {
    if (!baselineResult) return null;
    const baseDuration =
      baselineResult.snapshots[baselineResult.snapshots.length - 1]?.time ?? actualDurationSeconds;
    const statLabel = MOB_STAT_ZH[baselineResult.summary.finalStat];
    return `基准：HP ${baselineResult.summary.finalHealth.toFixed(1)} · ${statLabel} · ${baseDuration}s`;
  }, [baselineResult, actualDurationSeconds]);

  return (
    <div className="app-shell">
      <HeaderBar
        durationSeconds={durationSeconds}
        actualDurationSeconds={actualDurationSeconds}
        stopReason={result.summary.stopReason}
        onDurationChange={setDurationSeconds}
        rngMode={rngMode}
        onRngModeChange={setRngMode}
        seed={seed}
        onSeedChange={setSeed}
        hasBaseline={baselineResult !== null}
        baselineLabel={baselineLabel}
        onToggleBaseline={() => setBaselineResult((prev) => (prev ? null : result))}
        onOpenShare={handleOpenShare}
        onResetScenario={handleResetScenario}
        onOpenHandbook={() => {
          setHandbookQuery('');
          setHandbookOpen(true);
        }}
        onOpenAbout={() => setAboutOpen(true)}
      />

      <main className="workspace-grid">
        {/* Left Column: Patient & Regimen Controls */}
        <div className="col-stack col-left">
          <PatientPanel patient={patient} onChange={handlePatientChange} />
          <RegimenPanel
            doses={doses}
            onChange={handleDosesChange}
            patientAllergies={patient.allergies}
            hasChemicalAllergy={patient.chemicalAllergy}
            scenarioVersion={scenarioVersion}
            onNotify={setBannerNotice}
            onOpenReagentLibrary={() => {
              setHandbookQuery('');
              setHandbookOpen(true);
            }}
            onInspectReagent={(def) => {
              setHandbookQuery(def.zhName);
              setHandbookOpen(true);
            }}
          />
        </div>

        {/* Center Column: Summary KPIs & Synchronized Interactive Charts */}
        <div id="result-section" className="col-stack col-center">
          <SummaryStrip
            summary={result.summary}
            baselineSummary={baselineResult ? baselineResult.summary : null}
          />
          <TimelineCharts
            result={result}
            baselineResult={baselineResult}
            selectedTime={selectedTime}
            onSelectTime={(t) => {
              setIsPlaying(false);
              setSelectedTime(t);
            }}
            isPlaying={isPlaying}
            onTogglePlay={() => {
              if (!isPlaying && selectedTime >= actualDurationSeconds) setSelectedTime(0);
              setIsPlaying((v) => !v);
            }}
            playSpeed={playSpeed}
            onPlaySpeedChange={setPlaySpeed}
            onResetPlay={() => {
              setIsPlaying(false);
              setSelectedTime(0);
            }}
          />
        </div>

        {/* Right Column: Tick Inspector & Event Log */}
        <div className="col-stack col-right">
          <TickInspector snapshot={currentSnap} />
          <EventLog
            events={result.events}
            onJumpToTime={(t) => {
              setIsPlaying(false);
              setSelectedTime(t);
            }}
          />
        </div>
      </main>

      <ResultJumpButton summary={result.summary} targetId="result-section" />

      <div
        className="toast-container"
        role={toastState?.notice.type === 'warn' ? 'alert' : 'status'}
        aria-live={toastState?.notice.type === 'warn' ? 'assertive' : 'polite'}
        aria-atomic="true"
      >
        {toastState && (
          <div
            key={toastState.id}
            className={`toast-banner ${toastState.notice.type}${toastPaused ? ' paused' : ''}`}
            style={{ '--toast-duration': `${toastState.notice.durationMs ?? DEFAULT_TOAST_DURATION_MS}ms` } as CSSProperties}
            onMouseEnter={() => setToastPaused(true)}
            onMouseLeave={() => setToastPaused(false)}
            onFocus={() => setToastPaused(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setToastPaused(false);
              }
            }}
          >
            <div className="toast-content">
              <span className="toast-icon" aria-hidden="true">
                {toastState.notice.type === 'warn' ? (
                  <AlertTriangle size={17} />
                ) : toastState.notice.type === 'danger' ? (
                  <AlertCircle size={17} />
                ) : toastState.notice.type === 'good' ? (
                  <CheckCircle2 size={17} />
                ) : (
                  <Info size={17} />
                )}
              </span>
              <span className="toast-text">{toastState.notice.text}</span>
              <div className="toast-actions">
                {toastState.notice.action && (
                  <button
                    type="button"
                    className="toast-action-btn"
                    onClick={() => {
                      const action = toastState.notice.action;
                      setToastState(null);
                      action?.onAction();
                    }}
                  >
                    <Undo2 size={13} aria-hidden="true" />
                    {toastState.notice.action.label}
                  </button>
                )}
                <button
                  type="button"
                  className="toast-close-btn"
                  onClick={() => setToastState(null)}
                  aria-label="关闭通知"
                  title="关闭通知"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
            {toastState.notice.type !== 'warn' && <div className="toast-progress" aria-hidden="true" />}
          </div>
        )}
      </div>

      <HandbookModal
        open={handbookOpen}
        onClose={() => setHandbookOpen(false)}
        initialQuery={handbookQuery}
        onAddReagent={handleAddReagent}
        addedCounts={doseCountsByReagent}
        patientAllergies={patient.allergies}
        hasChemicalAllergy={patient.chemicalAllergy}
      />

      <ScenarioShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        shareUrl={currentShareUrl}
        onImportScenario={handleImportScenario}
      />

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}

export default App;
