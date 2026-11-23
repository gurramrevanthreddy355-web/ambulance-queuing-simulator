import React from 'react';
import { QueuingMetrics, SimulationStats } from '../types';
import { Clock, ShieldAlert, Activity, CheckCircle2, AlertTriangle } from 'lucide-react';

interface MetricCardsProps {
  metrics: QueuingMetrics;
  stats: SimulationStats;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ metrics, stats }) => {
  const isHealthy = metrics.systemAvgResponseMin <= 8.0;
  const isCongested = metrics.pAllBusy > 0.35 || stats.queuedCallsCount > 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
      {/* 1. Average Response Time */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 relative overflow-hidden backdrop-blur">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-xs font-medium uppercase tracking-wider">Avg Response Time</span>
          <Clock className={`w-4 h-4 ${isHealthy ? 'text-emerald-400' : 'text-amber-400'}`} />
        </div>
        <div className="flex items-baseline space-x-2">
          <span className={`text-2xl font-bold font-mono ${isHealthy ? 'text-emerald-400' : 'text-amber-400'}`}>
            {metrics.systemAvgResponseMin}m
          </span>
          <span className="text-xs text-slate-400">target &lt; 8.0m</span>
        </div>
        <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
          <span>Simulated actual:</span>
          <span className="font-mono text-slate-200 font-semibold">{stats.avgResponseTimeMin || '—'}m</span>
        </div>
      </div>

      {/* 2. P90 Tail Latency */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 relative overflow-hidden backdrop-blur">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-xs font-medium uppercase tracking-wider">90th Percentile (P90)</span>
          <ShieldAlert className="w-4 h-4 text-rose-400" />
        </div>
        <div className="flex items-baseline space-x-2">
          <span className="text-2xl font-bold font-mono text-rose-400">
            {stats.p90ResponseTimeMin || '—'}m
          </span>
          <span className="text-xs text-slate-400">tail delay</span>
        </div>
        <div className="mt-2 text-[11px] text-slate-400">
          Max wait for 90% of emergencies
        </div>
      </div>

      {/* 3. Erlang-C Congestion Probability */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 relative overflow-hidden backdrop-blur">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-xs font-medium uppercase tracking-wider">Queue Probability</span>
          <Activity className={`w-4 h-4 ${isCongested ? 'text-rose-400' : 'text-sky-400'}`} />
        </div>
        <div className="flex items-baseline space-x-2">
          <span className={`text-2xl font-bold font-mono ${isCongested ? 'text-rose-400' : 'text-sky-400'}`}>
            {(metrics.pAllBusy * 100).toFixed(1)}%
          </span>
          <span className="text-xs text-slate-400">P(All Busy)</span>
        </div>
        <div className="mt-2 text-[11px] text-slate-400">
          Erlang-C wait: <span className="font-mono text-slate-300">~{metrics.expectedQueueWaitMin}m</span>
        </div>
      </div>

      {/* 4. NFPA Standard 8-Minute Compliance */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 relative overflow-hidden backdrop-blur">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-xs font-medium uppercase tracking-wider">8-Min Compliance</span>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex items-baseline space-x-2">
          <span className="text-2xl font-bold font-mono text-emerald-400">
            {stats.compliance8MinPct || metrics.coverage8MinPct}%
          </span>
          <span className="text-xs text-slate-400">NFPA 1710</span>
        </div>
        <div className="mt-2 text-[11px] text-slate-400">
          Calls reached within 8 mins
        </div>
      </div>

      {/* 5. Live Fleet & Queue Status */}
      <div className="col-span-2 lg:col-span-1 bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 relative overflow-hidden backdrop-blur">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-xs font-medium uppercase tracking-wider">Active Queue</span>
          {stats.queuedCallsCount > 0 ? (
            <AlertTriangle className="w-4 h-4 text-rose-400 animate-pulse" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          )}
        </div>
        <div className="flex items-baseline space-x-2">
          <span className={`text-2xl font-bold font-mono ${stats.queuedCallsCount > 0 ? 'text-rose-400 font-extrabold' : 'text-slate-100'}`}>
            {stats.queuedCallsCount}
          </span>
          <span className="text-xs text-slate-400">calls waiting</span>
        </div>
        <div className="mt-2 text-[11px] text-slate-400">
          Fleet Util: <span className="font-mono text-slate-200 font-semibold">{stats.currentUtilization}%</span>
        </div>
      </div>
    </div>
  );
};
