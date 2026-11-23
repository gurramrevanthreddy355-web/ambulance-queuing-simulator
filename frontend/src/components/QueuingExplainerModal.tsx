import React from 'react';
import { X, BookOpen, Layers, GitBranch, AlertCircle, CheckCircle } from 'lucide-react';

interface QueuingExplainerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QueuingExplainerModal: React.FC<QueuingExplainerModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl text-slate-200">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-5 border-b border-slate-800 pb-4">
          <div className="p-2.5 bg-sky-500/10 border border-sky-500/20 rounded-xl text-sky-400">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">
              Queuing Theory in Emergency Medical Services (EMS)
            </h2>
            <p className="text-xs text-slate-400">
              Why static distance minimization fails when ambulances get busy
            </p>
          </div>
        </div>

        <div className="space-y-6 text-sm">
          {/* 1. The Core Problem: The Nearest-Station Trap */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-rose-400 flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4" />
              1. The Failure of Naive Placement (Nearest-Station Fallacy)
            </h3>
            <p className="text-slate-300 text-xs leading-relaxed">
              Standard facility location models assume that whenever a 911 emergency occurs in zone <code className="text-rose-300">i</code>,
              the physically closest ambulance will respond.
              <br /><br />
              <strong>In reality:</strong> If ambulance utilization is 60–75%, the closest unit is unavailable over half the time!
              When you bunch ambulances in the downtown center, a sudden surge in central calls saturates all central units.
              Subsequent emergencies must then pull ambulances from distant suburbs, causing a catastrophic cascade of delayed responses.
            </p>
          </div>

          {/* 2. Larson's Hypercube Model & Jarvis Approximation */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-sky-400 flex items-center gap-2 mb-2">
              <Layers className="w-4 h-4" />
              2. Larson's Hypercube Queueing Model
            </h3>
            <p className="text-slate-300 text-xs leading-relaxed mb-3">
              Developed by Richard C. Larson (MIT), the Hypercube model describes a fleet of <code className="text-sky-300">K</code> ambulances
              as a spatial Markov process with <code className="text-sky-300">2^K</code> states.
            </p>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-300 space-y-1">
              <div>P_dispatch(Unit j to Zone i) ≈ (1 - q_j) · ∏ (q_k for k closer than j)</div>
              <div>E[Response_i] = ∑_j P_ij · Travel_ji + P(All Busy) · [W_q + T_delayed]</div>
            </div>
            <p className="text-slate-400 text-[11px] mt-2">
              Jarvis's fixed-point iteration allows solving this system in milliseconds by estimating individual server busy probabilities <code className="text-slate-200">q_j</code>.
            </p>
          </div>

          {/* 3. MEXCLP Formulation */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-2 mb-2">
              <GitBranch className="w-4 h-4" />
              3. MEXCLP: Maximum Expected Covering Location Problem
            </h3>
            <p className="text-slate-300 text-xs leading-relaxed mb-2">
              Introduced by Mark Daskin, MEXCLP accounts for server busy fraction <code className="text-emerald-300">p = λ / (c · μ)</code>.
              The marginal contribution of assigning the <code className="text-emerald-300">k-th</code> backup ambulance within the 8-minute radius of zone <code className="text-emerald-300">i</code> is:
            </p>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 font-mono text-xs text-emerald-400 text-center font-bold">
              ΔCoverage_i(k) = (1 - p) · p^(k - 1)
            </div>
            <p className="text-slate-300 text-xs leading-relaxed mt-2">
              Instead of clustering all units in high-demand zones where backup gains diminish exponentially,
              queuing theory positions secondary units along high-traffic arterial perimeters to act as shock absorbers.
            </p>
          </div>

          {/* 4. Erlang-C Queuing Delay */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-purple-400 flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4" />
              4. Erlang-C Congestion Formula
            </h3>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 font-mono text-xs text-purple-300 text-center font-bold">
              P(Wait &gt; 0) = C(c, a) = [a^c / (c! · (1 - ρ))] / [ ∑ (a^k / k!) + a^c / (c! · (1 - ρ)) ]
            </div>
            <p className="text-slate-400 text-xs mt-2">
              When utilization <code className="text-purple-300">ρ &gt; 0.70</code>, queuing delays grow non-linearly.
              Strategic queuing placement keeps peak travel times low enough that ambulances return to service faster, stabilizing <code className="text-purple-300">μ</code> and preventing queue explosions.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded-lg text-xs transition"
          >
            Close & Return to Simulator
          </button>
        </div>
      </div>
    </div>
  );
};
