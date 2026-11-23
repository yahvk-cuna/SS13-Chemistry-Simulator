import { useEffect, useMemo, useState } from 'react';
import { EventLog } from './components/EventLog';
import { HandbookModal } from './components/HandbookModal';
import { HeaderBar } from './components/HeaderBar';
import { PatientPanel } from './components/PatientPanel';
import { RegimenPanel } from './components/RegimenPanel';
import { SummaryStrip } from './components/SummaryStrip';
import { TickInspector } from './components/TickInspector';
import { TimelineCharts } from './components/TimelineCharts';
import { SIM_PRESETS } from './engine/presets';
import { createDefaultDose } from './engine/regimenStorage';
import { runSimulation } from './engine/simulator';
import type { DoseEvent, PatientConfig, ReagentDef, RngMode, SimResult } from './engine/types';

function clonePatient(p: PatientConfig): PatientConfig {
  return { ...p, organs: { ...p.organs }, allergies: [...(p.allergies ?? [])] };
}

function cloneDoses(doses: DoseEvent[]): DoseEvent[] {
  return doses.map((d) => ({ ...d }));
}

export function App() {
  const initialPreset = SIM_PRESETS[0];

  const [activePresetId, setActivePresetId] = useState<string>(initialPreset.id);
  const [patient, setPatient] = useState<PatientConfig>(() => clonePatient(initialPreset.patient));
  const [doses, setDoses] = useState<DoseEvent[]>(() => cloneDoses(initialPreset.doses));
  const [durationSeconds, setDurationSeconds] = useState<number>(initialPreset.durationSeconds);
  const [rngMode, setRngMode] = useState<RngMode>('expected');
  const [seed, setSeed] = useState<number>(42);

  const [baselineResult, setBaselineResult] = useState<SimResult | null>(null);
  const [selectedTime, setSelectedTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playSpeed, setPlaySpeed] = useState<number>(4);
  const [handbookOpen, setHandbookOpen] = useState<boolean>(false);
  const [handbookQuery, setHandbookQuery] = useState<string>('');

  const doseCountsByReagent = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of doses) {
      counts[d.reagentId] = (counts[d.reagentId] ?? 0) + 1;
    }
    return counts;
  }, [doses]);

  const result = useMemo(
    () => runSimulation(patient, doses, { durationSeconds, rngMode, seed }),
    [patient, doses, durationSeconds, rngMode, seed],
  );

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

  const handleSelectPreset = (id: string) => {
    const preset = SIM_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setActivePresetId(preset.id);
    setPatient(clonePatient(preset.patient));
    setDoses(cloneDoses(preset.doses));
    setDurationSeconds(preset.durationSeconds);
    setSelectedTime(0);
    setIsPlaying(false);
  };

  const handlePatientChange = (next: PatientConfig) => {
    setActivePresetId('custom');
    setPatient(next);
  };

  const handleDosesChange = (next: DoseEvent[]) => {
    setActivePresetId('custom');
    setDoses(next);
  };

  const handleAddReagent = (def: ReagentDef) => {
    setActivePresetId('custom');
    setDoses((prev) => [...prev, createDefaultDose(def)]);
  };

  const activePreset = SIM_PRESETS.find((p) => p.id === activePresetId);
  const currentSnap =
    result.snapshots[Math.min(result.snapshots.length - 1, Math.max(0, Math.round(selectedTime / 2)))] ??
    result.snapshots[0];

  return (
    <div className="app-shell">
      <HeaderBar
        presets={SIM_PRESETS}
        activePresetId={activePresetId}
        onSelectPreset={handleSelectPreset}
        durationSeconds={durationSeconds}
        onDurationChange={setDurationSeconds}
        rngMode={rngMode}
        onRngModeChange={setRngMode}
        seed={seed}
        onSeedChange={setSeed}
        hasBaseline={baselineResult !== null}
        onToggleBaseline={() => setBaselineResult((prev) => (prev ? null : result))}
        onOpenHandbook={() => {
          setHandbookQuery('');
          setHandbookOpen(true);
        }}
      />

      <main className="workspace-grid">
        {/* Left Column: Patient & Regimen Controls */}
        <div className="col-stack">
          {activePreset && (
            <div className="warning-banner info" style={{ fontSize: 11.5 }}>
              <strong>{activePreset.name}</strong>
              <span>{activePreset.description}</span>
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
    </div>
  );
}

export default App;
