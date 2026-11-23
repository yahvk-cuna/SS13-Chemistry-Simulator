import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EventLog } from './components/EventLog';
import { HandbookModal } from './components/HandbookModal';
import { HeaderBar } from './components/HeaderBar';
import { PatientPanel } from './components/PatientPanel';
import { RegimenPanel } from './components/RegimenPanel';
import { ScenarioShareModal } from './components/ScenarioShareModal';
import { SummaryStrip } from './components/SummaryStrip';
import { TickInspector } from './components/TickInspector';
import { TimelineCharts } from './components/TimelineCharts';
import { createDefaultDose } from './engine/regimenStorage';
import { buildScenarioShareUrl, createBlankScenario, tryReadScenarioFromHash } from './engine/scenarioShare';
import { runSimulation } from './engine/simulator';
import type { DoseEvent, PatientConfig, ReagentDef, RngMode, SimResult, SimScenario } from './engine/types';

function clonePatient(p: PatientConfig): PatientConfig {
  return { ...p, organs: { ...p.organs }, allergies: [...(p.allergies ?? [])] };
}

function cloneDoses(doses: DoseEvent[]): DoseEvent[] {
  return doses.map((d) => ({ ...d }));
}

function readInitialScenarioState(): { scenario: SimScenario; hashError: string | null } {
  if (typeof window !== 'undefined') {
    const { scenario, error } = tryReadScenarioFromHash(window.location.hash);
    if (scenario) return { scenario, hashError: null };
    if (error) return { scenario: createBlankScenario(), hashError: error };
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
  const [shareModalNotice, setShareModalNotice] = useState<string | null>(null);
  const [bannerNotice, setBannerNotice] = useState<{ type: 'good' | 'warn'; text: string } | null>(() =>
    initialBoot.hashError ? { type: 'warn', text: initialBoot.hashError } : null,
  );

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

  const currentShareUrl = useMemo(() => buildScenarioShareUrl(currentScenario), [currentScenario]);

  const result = useMemo(
    () => runSimulation(patient, doses, { durationSeconds, rngMode, seed }),
    [patient, doses, durationSeconds, rngMode, seed],
  );

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
    const timer = window.setTimeout(() => setBannerNotice(null), 3500);
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

  const handleShareUrl = async () => {
    const shareUrl = buildScenarioShareUrl(currentScenario);
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', shareUrl);
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setBannerNotice({ type: 'good', text: `已同步地址栏并复制分享链接（${shareUrl.length} 字符）` });
        return;
      }
    } catch {
      // Fallback to share modal below
    }
    setShareModalNotice('未能直接访问剪贴板，可在下方文本框手动复制场景 URL。');
    setShareModalOpen(true);
  };

  const handleImportScenario = (scenario: SimScenario) => {
    applyScenario(scenario);
    const shareUrl = buildScenarioShareUrl(scenario);
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', shareUrl);
    }
    setBannerNotice({ type: 'good', text: `已从链接导入场景（${scenario.doses.length} 项给药，${scenario.durationSeconds}s）` });
  };

  const handleResetScenario = () => {
    const blank = createBlankScenario();
    applyScenario(blank);
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    setBannerNotice({ type: 'good', text: '已重置为空白场景。' });
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
        onToggleBaseline={() => setBaselineResult((prev) => (prev ? null : result))}
        onShareUrl={() => void handleShareUrl()}
        onOpenImportUrl={() => {
          setShareModalNotice(null);
          setShareModalOpen(true);
        }}
        onResetScenario={handleResetScenario}
        onOpenHandbook={() => {
          setHandbookQuery('');
          setHandbookOpen(true);
        }}
      />

      <main className="workspace-grid">
        {/* Left Column: Patient & Regimen Controls */}
        <div className="col-stack">
          {bannerNotice && (
            <div className={`warning-banner ${bannerNotice.type === 'warn' ? 'warn' : 'info'}`} style={{ fontSize: 11.5 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                <span>{bannerNotice.text}</span>
                <button
                  type="button"
                  style={{ background: 'transparent', border: 'none', padding: 0, display: 'inline-flex', flexShrink: 0 }}
                  onClick={() => setBannerNotice(null)}
                  aria-label="关闭通知"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}
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
        <div className="col-stack">
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
        initialNotice={shareModalNotice}
      />
    </div>
  );
}

export default App;
