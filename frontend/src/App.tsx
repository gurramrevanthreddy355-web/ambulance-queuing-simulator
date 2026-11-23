import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  generateCityZones,
  DEFAULT_HOSPITALS,
  getQueuingPlacement,
  getNaivePlacement,
  solveJarvisHypercube
} from './algorithms/queuingTheory';
import { LiveSimulationEngine } from './algorithms/simulationEngine';
import { CityMap } from './components/CityMap';
import { MetricCards } from './components/MetricCards';
import { ComparisonPanel } from './components/ComparisonPanel';
import { QueuingExplainerModal } from './components/QueuingExplainerModal';
import { AmbulanceBase, PlacementStrategy, QueuingMetrics } from './types';
import {
  Play,
  Pause,
  RotateCcw,
  Sliders,
  HelpCircle,
  Activity,
  Ambulance,
  PhoneCall,
  Clock,
  Sparkles
} from 'lucide-react';

export const App: React.FC = () => {
  // 1. Simulation Parameters
  const [fleetSize, setFleetSize] = useState<number>(6);
  const [demandMultiplier, setDemandMultiplier] = useState<number>(1.0);
  const [sceneTimeMin, setSceneTimeMin] = useState<number>(18.0);
  const [hospitalTimeMin, setHospitalTimeMin] = useState<number>(20.0);
  const [transportProb, setTransportProb] = useState<number>(0.60);
  const [speedKmh, setSpeedKmh] = useState<number>(45.0);

  // Strategy
  const [strategy, setStrategy] = useState<PlacementStrategy>('QUEUING');

  // Interactive controls
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [simSpeed, setSimSpeed] = useState<number>(10); // multiplier
  const [isExplainerOpen, setIsExplainerOpen] = useState<boolean>(false);

  // 2. City and Base Setup
  const zones = useMemo(() => {
    const baseZones = generateCityZones();
    return baseZones.map(z => ({
      ...z,
      lambda_rate: Math.round(z.lambda_rate * demandMultiplier * 1000) / 1000
    }));
  }, [demandMultiplier]);

  const hospitals = useMemo(() => DEFAULT_HOSPITALS, []);

  // Precomputed placements
  const queuingBases = useMemo(() => getQueuingPlacement(zones, fleetSize), [zones, fleetSize]);
  const naiveBases = useMemo(() => getNaivePlacement(zones, fleetSize), [zones, fleetSize]);
  const [customBases, setCustomBases] = useState<AmbulanceBase[]>(() => queuingBases);

  // Sync custom bases when fleet size changes
  useEffect(() => {
    setCustomBases(queuingBases);
  }, [fleetSize]);

  // Active base selection
  const activeBases = useMemo(() => {
    if (strategy === 'QUEUING') return queuingBases;
    if (strategy === 'NAIVE') return naiveBases;
    return customBases;
  }, [strategy, queuingBases, naiveBases, customBases]);

  // 3. Analytical Queuing Metrics
  const queuingMetrics = useMemo<QueuingMetrics>(() => {
    return solveJarvisHypercube(zones, queuingBases, sceneTimeMin, hospitalTimeMin, transportProb, speedKmh);
  }, [zones, queuingBases, sceneTimeMin, hospitalTimeMin, transportProb, speedKmh]);

  const naiveMetrics = useMemo<QueuingMetrics>(() => {
    return solveJarvisHypercube(zones, naiveBases, sceneTimeMin, hospitalTimeMin, transportProb, speedKmh);
  }, [zones, naiveBases, sceneTimeMin, hospitalTimeMin, transportProb, speedKmh]);

  const customMetrics = useMemo<QueuingMetrics>(() => {
    return solveJarvisHypercube(zones, customBases, sceneTimeMin, hospitalTimeMin, transportProb, speedKmh);
  }, [zones, customBases, sceneTimeMin, hospitalTimeMin, transportProb, speedKmh]);

  const activeMetrics = useMemo(() => {
    if (strategy === 'QUEUING') return queuingMetrics;
    if (strategy === 'NAIVE') return naiveMetrics;
    return customMetrics;
  }, [strategy, queuingMetrics, naiveMetrics, customMetrics]);

  // 4. Live Simulation Engine instance
  const engineRef = useRef<LiveSimulationEngine | null>(null);
  const [tickCount, setTickCount] = useState<number>(0);

  // Initialize engine
  useEffect(() => {
    engineRef.current = new LiveSimulationEngine(zones, hospitals, activeBases);
    engineRef.current.speedKmh = speedKmh;
    engineRef.current.sceneTimeMin = sceneTimeMin;
    engineRef.current.hospitalTimeMin = hospitalTimeMin;
    engineRef.current.transportProb = transportProb;
  }, [zones, hospitals, activeBases]);

  // Update engine params
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.speedKmh = speedKmh;
      engineRef.current.sceneTimeMin = sceneTimeMin;
      engineRef.current.hospitalTimeMin = hospitalTimeMin;
      engineRef.current.transportProb = transportProb;
    }
  }, [speedKmh, sceneTimeMin, hospitalTimeMin, transportProb]);

  // Main Simulation Loop
  useEffect(() => {
    let lastTime = performance.now();
    let animId: number;

    const loop = (currentTime: number) => {
      const deltaSec = (currentTime - lastTime) / 1000.0;
      lastTime = currentTime;

      if (isPlaying && engineRef.current) {
        // Delta minutes scaled by simSpeed
        const deltaMinutes = (deltaSec * simSpeed) / 60.0;
        // Cap step to prevent huge physics jumps
        const step = Math.min(deltaMinutes, 0.2);
        engineRef.current.tick(step);
        setTickCount(c => c + 1);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, simSpeed]);

  const handleResetSimulation = () => {
    if (engineRef.current) {
      engineRef.current.reset(activeBases);
      setTickCount(c => c + 1);
    }
  };

  const handleBaseMove = (baseId: number, newX: number, newY: number) => {
    setCustomBases(prev =>
      prev.map(b => (b.id === baseId ? { ...b, x: newX, y: newY } : b))
    );
  };

  const simStats = engineRef.current ? engineRef.current.getStats() : {
    simMinutes: 0,
    totalCalls: 0,
    activeCalls: 0,
    queuedCallsCount: 0,
    avgResponseTimeMin: 0,
    p90ResponseTimeMin: 0,
    compliance8MinPct: 0,
    callsDelayedPct: 0,
    currentUtilization: 0
  };

  const activeAmbulances = engineRef.current ? engineRef.current.ambulances : [];
  const activeCalls = engineRef.current ? engineRef.current.calls : [];
  const completedCalls = engineRef.current ? engineRef.current.completedCalls.slice(-8).reverse() : [];

  const hours = Math.floor(simStats.simMinutes / 60);
  const minutes = Math.floor(simStats.simMinutes % 60);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500">
            <Ambulance className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-tight">
                Prayagraj (Allahabad) EMS Optimizer
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-500/10 border border-sky-500/30 text-sky-400 font-semibold">
                Larson Hypercube &bull; MEXCLP
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Queuing Theory & Spatial 108 Dispatch across Civil Lines, Sangam, Naini, & Jhusi
            </p>
          </div>
        </div>

        {/* Live Simulation Controls */}
        <div className="flex items-center space-x-3">
          <div className="hidden sm:flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-mono">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Sim Clock:</span>
            <span className="text-emerald-400 font-bold">
              {String(hours).padStart(2, '0')}h {String(minutes).padStart(2, '0')}m
            </span>
          </div>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold text-xs transition ${
              isPlaying
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20'
            }`}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{isPlaying ? 'Pause' : 'Resume'}</span>
          </button>

          <button
            onClick={handleResetSimulation}
            title="Reset Simulation Clock"
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsExplainerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-lg text-xs font-medium transition"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Theory Guide</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 flex flex-col lg:flex-row p-4 lg:p-6 gap-6 max-w-[1720px] mx-auto w-full">
        {/* Left Column: Interactive Parameters Sidebar */}
        <aside className="w-full lg:w-80 flex-shrink-0 space-y-5">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-200">
              <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-sky-400" />
                Fleet & Queuing Controls
              </span>
            </div>

            {/* Fleet Size */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Ambulance Fleet (c):</span>
                <span className="font-mono font-bold text-sky-400">{fleetSize} units</span>
              </div>
              <input
                type="range"
                min="3"
                max="12"
                step="1"
                value={fleetSize}
                onChange={e => setFleetSize(parseInt(e.target.value))}
                className="w-full accent-sky-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>3 units</span>
                <span>8 units</span>
                <span>12 units</span>
              </div>
            </div>

            {/* Call Arrival Intensity Multiplier */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Emergency Call Load (λ):</span>
                <span className="font-mono font-bold text-rose-400">{demandMultiplier}x Rate</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.2"
                step="0.1"
                value={demandMultiplier}
                onChange={e => setDemandMultiplier(parseFloat(e.target.value))}
                className="w-full accent-rose-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Night Shift (0.5x)</span>
                <span>Peak Surge (2.2x)</span>
              </div>
            </div>

            {/* Average On-Scene Time */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Avg On-Scene Care:</span>
                <span className="font-mono font-bold text-slate-200">{sceneTimeMin} mins</span>
              </div>
              <input
                type="range"
                min="10"
                max="30"
                step="1"
                value={sceneTimeMin}
                onChange={e => setSceneTimeMin(parseInt(e.target.value))}
                className="w-full accent-slate-400 cursor-pointer"
              />
            </div>

            {/* Hospital Transport Probability */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Hospital Transport Rate:</span>
                <span className="font-mono font-bold text-slate-200">{(transportProb * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.30"
                max="0.90"
                step="0.05"
                value={transportProb}
                onChange={e => setTransportProb(parseFloat(e.target.value))}
                className="w-full accent-slate-400 cursor-pointer"
              />
            </div>

            {/* Sim Speed */}
            <div className="space-y-1.5 pt-2 border-t border-slate-800">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Simulation Warp Speed:</span>
                <span className="font-mono font-bold text-amber-400">{simSpeed}x</span>
              </div>
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={simSpeed}
                onChange={e => setSimSpeed(parseInt(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>1x (Real)</span>
                <span>15x</span>
                <span>30x (Fast)</span>
              </div>
            </div>
          </div>

          {/* Quick Mathematical Summary */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-xs space-y-2.5">
            <h4 className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              Offered Load & Utilization
            </h4>
            <div className="space-y-1.5 text-slate-400 font-mono text-[11px]">
              <div className="flex justify-between">
                <span>Total Demand (Λ):</span>
                <span className="text-slate-200 font-bold">
                  {(zones.reduce((s, z) => s + z.lambda_rate, 0)).toFixed(2)} calls/h
                </span>
              </div>
              <div className="flex justify-between">
                <span>Service Rate (μ):</span>
                <span className="text-slate-200">
                  ~{(60.0 / (sceneTimeMin + transportProb * (6.0 + hospitalTimeMin) + 7.5)).toFixed(2)} calls/h/unit
                </span>
              </div>
              <div className="flex justify-between">
                <span>Erlang Traffic (a):</span>
                <span className="text-sky-300 font-bold">
                  {(
                    zones.reduce((s, z) => s + z.lambda_rate, 0) /
                    (60.0 / (sceneTimeMin + transportProb * (6.0 + hospitalTimeMin) + 7.5))
                  ).toFixed(2)} units
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-800">
                <span>System Utilization (ρ):</span>
                <span className={`font-bold ${activeMetrics.fleetUtilization > 0.75 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {(activeMetrics.fleetUtilization * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* Center / Right Column: Main Dashboard */}
        <main className="flex-1 space-y-5">
          {/* Top Metric Cards */}
          <MetricCards metrics={activeMetrics} stats={simStats} />

          {/* City Dispatch Map */}
          <CityMap
            zones={zones}
            hospitals={hospitals}
            ambulanceBases={activeBases}
            activeAmbulances={activeAmbulances}
            activeCalls={activeCalls}
            zoneResponseTimes={activeMetrics.zoneResponseTimes}
            onBaseMove={handleBaseMove}
            isCustomMode={strategy === 'CUSTOM'}
            scaleKm={18.0}
          />

          {/* Strategy Benchmark & Comparison Panel */}
          <ComparisonPanel
            queuingMetrics={queuingMetrics}
            naiveMetrics={naiveMetrics}
            customMetrics={customMetrics}
            currentStrategy={strategy}
            onSelectStrategy={setStrategy}
          />

          {/* Live Call Logs & Fleet State */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Live Dispatch Feed */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <PhoneCall className="w-3.5 h-3.5 text-rose-400" />
                  Recent Emergency Dispatch Logs
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {simStats.totalCalls} total calls logged
                </span>
              </div>

              {completedCalls.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 italic">
                  Running simulation... calls will appear here as they are resolved.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {completedCalls.map(call => {
                    const isFast = call.responseDurationMin <= 8.0;
                    const zone = zones.find(z => z.id === call.zoneId);

                    return (
                      <div
                        key={call.id}
                        className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-950/60 border border-slate-850"
                      >
                        <div className="flex items-center space-x-2">
                          <span className={`w-2 h-2 rounded-full ${isFast ? 'bg-emerald-400' : 'bg-rose-500'}`}></span>
                          <span className="font-mono text-slate-300 font-semibold">911 #{call.id}</span>
                          <span className="text-slate-400 truncate max-w-[120px]">{zone?.name || 'Zone'}</span>
                        </div>
                        <div className="flex items-center space-x-3 font-mono">
                          {call.queueWaitMin > 0.1 && (
                            <span className="text-[10px] text-amber-400">
                              +{call.queueWaitMin.toFixed(1)}m queue
                            </span>
                          )}
                          <span className={`font-bold ${isFast ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {call.responseDurationMin.toFixed(1)}m
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Individual Ambulance Fleet Busy State */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-sky-400" />
                  Fleet Workload Distribution (Hypercube q_k)
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Avg Util: {(activeMetrics.fleetUtilization * 100).toFixed(0)}%
                </span>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {activeAmbulances.map(amb => {
                  const busyFraction = activeMetrics.serverBusyProbs[amb.id] || 0.5;
                  const isBusyNow = amb.status !== 'IDLE';

                  return (
                    <div
                      key={amb.id}
                      className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-950/60 border border-slate-850"
                    >
                      <div className="flex items-center space-x-2.5">
                        <span className={`w-2 h-2 rounded-full ${isBusyNow ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`}></span>
                        <span className="font-mono font-bold text-slate-200">Unit #{amb.id + 1}</span>
                        <span className="text-[11px] text-slate-400">{amb.status}</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="w-24 bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${busyFraction > 0.70 ? 'bg-rose-500' : 'bg-sky-500'}`}
                            style={{ width: `${Math.min(100, busyFraction * 100)}%` }}
                          />
                        </div>
                        <span className="font-mono text-slate-300 w-10 text-right">
                          {(busyFraction * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Queuing Theory Explainer Modal */}
      <QueuingExplainerModal
        isOpen={isExplainerOpen}
        onClose={() => setIsExplainerOpen(false)}
      />
    </div>
  );
};

export default App;
