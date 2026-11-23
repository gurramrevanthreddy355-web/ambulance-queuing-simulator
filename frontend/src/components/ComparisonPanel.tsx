import React from 'react';
import { QueuingMetrics, PlacementStrategy } from '../types';
import { Award, Zap, Compass, ArrowRight } from 'lucide-react';

interface ComparisonPanelProps {
  queuingMetrics: QueuingMetrics;
  naiveMetrics: QueuingMetrics;
  customMetrics?: QueuingMetrics;
  currentStrategy: PlacementStrategy;
  onSelectStrategy: (strat: PlacementStrategy) => void;
}

export const ComparisonPanel: React.FC<ComparisonPanelProps> = ({
  queuingMetrics,
  naiveMetrics,
  customMetrics,
  currentStrategy,
  onSelectStrategy
}) => {
  const respSaved = Math.max(0, naiveMetrics.systemAvgResponseMin - queuingMetrics.systemAvgResponseMin);
  const queueReduced = Math.max(0, (naiveMetrics.pAllBusy - queuingMetrics.pAllBusy) * 100);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">
            Strategy Benchmark & Queuing Theory Advantage
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Compare analytical queuing performance across ambulance positioning models
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs font-semibold">
          <Award className="w-3.5 h-3.5" />
          <span>Queuing Theory saves ~{respSaved.toFixed(1)} mins/call</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 1. Queuing Theoretic */}
        <div
          onClick={() => onSelectStrategy('QUEUING')}
          className={`cursor-pointer rounded-lg p-3.5 border transition-all duration-200 ${
            currentStrategy === 'QUEUING'
              ? 'bg-sky-950/40 border-sky-500/80 ring-1 ring-sky-500/50 shadow-lg shadow-sky-950/50'
              : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              Queuing Theoretic (MEXCLP)
            </span>
            {currentStrategy === 'QUEUING' && (
              <span className="text-[10px] bg-sky-500 text-slate-950 px-2 py-0.5 rounded font-bold">
                ACTIVE
              </span>
            )}
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-800/80">
              <span className="text-slate-400">Expected Response:</span>
              <span className="font-mono font-bold text-emerald-400">{queuingMetrics.systemAvgResponseMin}m</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/80">
              <span className="text-slate-400">Queue Probability:</span>
              <span className="font-mono text-slate-200">{(queuingMetrics.pAllBusy * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/80">
              <span className="text-slate-400">8-Min Coverage:</span>
              <span className="font-mono text-slate-200">{queuingMetrics.coverage8MinPct}%</span>
            </div>
            <div className="flex justify-between pt-1">
              <span className="text-slate-400">Congestion Strategy:</span>
              <span className="text-sky-300 text-[11px] font-medium">Backup Ring Dispersion</span>
            </div>
          </div>
        </div>

        {/* 2. Naive Demand Placement */}
        <div
          onClick={() => onSelectStrategy('NAIVE')}
          className={`cursor-pointer rounded-lg p-3.5 border transition-all duration-200 ${
            currentStrategy === 'NAIVE'
              ? 'bg-rose-950/40 border-rose-500/80 ring-1 ring-rose-500/50 shadow-lg shadow-rose-950/50'
              : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5" />
              Naive (Demand Clustering)
            </span>
            {currentStrategy === 'NAIVE' && (
              <span className="text-[10px] bg-rose-500 text-white px-2 py-0.5 rounded font-bold">
                ACTIVE
              </span>
            )}
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-800/80">
              <span className="text-slate-400">Expected Response:</span>
              <span className="font-mono font-bold text-rose-400">{naiveMetrics.systemAvgResponseMin}m</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/80">
              <span className="text-slate-400">Queue Probability:</span>
              <span className="font-mono text-slate-200">{(naiveMetrics.pAllBusy * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/80">
              <span className="text-slate-400">8-Min Coverage:</span>
              <span className="font-mono text-slate-200">{naiveMetrics.coverage8MinPct}%</span>
            </div>
            <div className="flex justify-between pt-1">
              <span className="text-slate-400">Congestion Strategy:</span>
              <span className="text-rose-300 text-[11px] font-medium">Downtown Overclustering</span>
            </div>
          </div>
        </div>

        {/* 3. Custom Drag & Drop Mode */}
        <div
          onClick={() => onSelectStrategy('CUSTOM')}
          className={`cursor-pointer rounded-lg p-3.5 border transition-all duration-200 ${
            currentStrategy === 'CUSTOM'
              ? 'bg-amber-950/40 border-amber-500/80 ring-1 ring-amber-500/50 shadow-lg shadow-amber-950/50'
              : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5" />
              Custom Interactive Base Setup
            </span>
            {currentStrategy === 'CUSTOM' && (
              <span className="text-[10px] bg-amber-500 text-slate-950 px-2 py-0.5 rounded font-bold">
                ACTIVE
              </span>
            )}
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-800/80">
              <span className="text-slate-400">Expected Response:</span>
              <span className="font-mono font-bold text-amber-300">
                {customMetrics ? `${customMetrics.systemAvgResponseMin}m` : '—'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/80">
              <span className="text-slate-400">Queue Probability:</span>
              <span className="font-mono text-slate-200">
                {customMetrics ? `${(customMetrics.pAllBusy * 100).toFixed(1)}%` : '—'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/80">
              <span className="text-slate-400">8-Min Coverage:</span>
              <span className="font-mono text-slate-200">
                {customMetrics ? `${customMetrics.coverage8MinPct}%` : '—'}
              </span>
            </div>
            <div className="flex justify-between pt-1">
              <span className="text-slate-400">Interaction:</span>
              <span className="text-amber-300 text-[11px] font-medium">Drag stations on map</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
