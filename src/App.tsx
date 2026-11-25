import { X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  tryReadScenarioFromHash,
} from './engine/scenarioShare';
import { loadScenarioFromStorage, saveScenarioToStorage } from './engine/scenarioStorage';
import { runSimulation } from './engine/simulator';
import type { DoseEvent, PatientConfig, ReagentDef, RngMode, SimResult, SimScenario } from './engine/types';

interface BannerNotice {
  type: 'good' | 'warn';
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

const BLANK_SCENARIO_PAYLOAD = encodeScenarioPayload(createBlankScenario());

function isNonBlankScenario(scenario: SimScenario): boolean {
  return encodeScenarioPayload(scenario) !== BLANK_SCENARIO_PAYLOAD;
}

function readInitialScenarioState(): {
  scenario: SimScenario;
  hashError: string | null;
  restoredFromStorage: boolean;
} {
  if (typeof window !== 'undefined') {
    const { scenario: hashScenario, error: hashError } = tryReadScenarioFromHash(window.location.hash);
    if (hashScenario) {
      return { scenario: hashScenario, hashError: null, restoredFromStorage: false };
    }
    const storedScenario = loadScenarioFromStorage();
    if (storedScenario) {
      return {
        scenario: storedScenario,
        hashError,
        restoredFromStorage: isNonBlankScenario(storedScenario),
      };
    }
    if (hashError) {
      return { scenario: createBlankScenario(), hashError, restoredFromStorage: false };
    }
  }
  return { scenario: createBlankScenario(), hashError: null, restoredFromStorage: false };
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
  const [bannerNotice, setBannerNotice] = useState<BannerNotice | null>(() => {
    if (initialBoot.hashError) {
      return { type: 'warn', text: initialBoot.hashError };
    }
    if (initialBoot.restoredFromStorage) {
      return { type: 'good', text: '已恢复上次编辑的场景。' };
    }
    return null;
  });

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

  const currentShareUrl = useMemo(() => buildScenarioShareUrl(currentScenario), [currentScenario]);

  const result = useMemo(
    () => runSimulation(patient, doses, { durationSeconds, rngMode, seed }),
    [patient, doses, durationSeconds, rngMode, seed],
  );

  // Debounced auto-save to localStorage on scenario changes
  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveScenarioToStorage(currentScenario);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [currentScenario]);

  // Flush latest scenario immediately when page hides
  useEffect(() => {
    const flushScenario = () => {
      saveScenarioToStorage(latestScenarioRef.current);
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
        setPatient(clonePatient(scenario.patient));
        setDoses(cloneDoses(scenario.doses));
        setDurationSeconds(scenario.durationSeconds);
        setRngMode(scenario.rngMode);
        setSeed(scenario.seed);
        setSelectedTime(0);
        setIsPlaying(false);
        setBaselineResult(null);
        setBannerNotice({ type: 'good', text: '已从 URL 链接自动还原场景。' });
      } else if (error) {
        setBannerNotice({ type: 'warn', text: error });
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Auto-dismiss transient good notices
  useEffect(() => {
    if (!bannerNotice || bannerNotice.type !== 'good') return;
    const timer = window.setTimeout(() => setBannerNotice(null), bannerNotice.durationMs ?? 3500);
    return () => window.clearTimeout(timer);
  }, [bannerNotice]);

  // Clamp selectedTime when duration shrinks
  useEffect(() => {
    if (selectedTime > durationSeconds) {
      setSelectedTime(durationSeconds);
    }
  }, [durationSeconds, selectedTime]);

  // Playback timer
  useEffect(() => {
    if (!isPlaying) return;
    const intervalMs = Math.max(40, Math.round(500 / playSpeed));
    const timer = window.setInterval(() => {
      setSelectedTime((prev) => {
        if (prev + 2 > durationSeconds) {
          setIsPlaying(false);
          return durationSeconds;
        }
        return prev + 2;
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, playSpeed, durationSeconds]);

  const applyScenario = (scenario: SimScenario) => {
    setPatient(clonePatient(scenario.patient));
    setDoses(cloneDoses(scenario.doses));
    setDurationSeconds(scenario.durationSeconds);
    setRngMode(scenario.rngMode);
    setSeed(scenario.seed);
    setSelectedTime(0);
    setIsPlaying(false);
    setBaselineResult(null);
  };

  const handleOpenShare = () => {
    const shareUrl = buildScenarioShareUrl(currentScenario);
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', shareUrl);
    }
    setShareModalOpen(true);
  };

  const replaceScenarioWithUndo = (
    nextScenario: SimScenario,
    options: {
      nextUrl: string;
      noticeText: string;
      undoNoticeText: string;
    },
  ) => {
    const snapshot = cloneScenario(currentScenario);
    const previousUrl =
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : '';

    applyScenario(nextScenario);
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', options.nextUrl);
    }

    setBannerNotice({
      type: 'good',
      text: options.noticeText,
      durationMs: 8000,
      action: {
        label: '撤销',
        onAction: () => {
          applyScenario(snapshot);
          if (typeof window !== 'undefined' && window.history?.replaceState) {
            window.history.replaceState(null, '', previousUrl);
          }
          setBannerNotice({ type: 'good', text: options.undoNoticeText });
        },
      },
    });
  };

  const handleImportScenario = (scenario: SimScenario) => {
    replaceScenarioWithUndo(scenario, {
      nextUrl: buildScenarioShareUrl(scenario),
      noticeText: `已从链接导入场景（${scenario.doses.length} 项给药，${scenario.durationSeconds}s）`,
      undoNoticeText: '已撤销导入。',
    });
  };

  const handleResetScenario = () => {
    const blank = createBlankScenario();
    const baseUrl =
      typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '';
    replaceScenarioWithUndo(blank, {
      nextUrl: baseUrl,
      noticeText: '已重置为空白场景。',
      undoNoticeText: '已撤销重置。',
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
      baselineResult.snapshots[baselineResult.snapshots.length - 1]?.time ?? durationSeconds;
    const statLabel = MOB_STAT_ZH[baselineResult.summary.finalStat];
    return `基准：HP ${baselineResult.summary.finalHealth.toFixed(1)} · ${statLabel} · ${baseDuration}s`;
  }, [baselineResult, durationSeconds]);

  return (
    <div className="app-shell">
      <HeaderBar
        durationSeconds={durationSeconds}
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
              if (!isPlaying && selectedTime >= durationSeconds) setSelectedTime(0);
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
        role={bannerNotice?.type === 'warn' ? 'alert' : 'status'}
        aria-live={bannerNotice?.type === 'warn' ? 'assertive' : 'polite'}
        aria-atomic="true"
      >
        {bannerNotice && (
          <div className={`warning-banner toast-banner ${bannerNotice.type === 'warn' ? 'warn' : 'good'}`}>
            <div className="toast-content">
              <span className="toast-text">{bannerNotice.text}</span>
              <div className="toast-actions">
                {bannerNotice.action && (
                  <button
                    type="button"
                    className="toast-action-btn"
                    onClick={() => {
                      const action = bannerNotice.action;
                      setBannerNotice(null);
                      action?.onAction();
                    }}
                  >
                    {bannerNotice.action.label}
                  </button>
                )}
                <button
                  type="button"
                  className="toast-close-btn"
                  onClick={() => setBannerNotice(null)}
                  aria-label="关闭通知"
                  title="关闭通知"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
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
