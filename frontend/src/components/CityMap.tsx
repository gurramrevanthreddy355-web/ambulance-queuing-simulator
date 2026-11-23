import React, { useRef, useEffect } from 'react';
import { Zone, Hospital, AmbulanceBase, ActiveAmbulance, EmergencyCall } from '../types';

interface CityMapProps {
  zones: Zone[];
  hospitals: Hospital[];
  ambulanceBases: AmbulanceBase[];
  activeAmbulances: ActiveAmbulance[];
  activeCalls: EmergencyCall[];
  zoneResponseTimes?: number[];
  onBaseMove?: (baseId: number, newX: number, newY: number) => void;
  isCustomMode: boolean;
  scaleKm?: number;
}

export const CityMap: React.FC<CityMapProps> = ({
  zones,
  hospitals,
  ambulanceBases,
  activeAmbulances,
  activeCalls,
  zoneResponseTimes,
  onBaseMove,
  isCustomMode,
  scaleKm = 14.0
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingBaseId = useRef<number | null>(null);

  // Coordinate transformation: [-scaleKm/2, scaleKm/2] -> [padding, width - padding]
  const toCanvasCoords = (x: number, y: number, width: number, height: number) => {
    const pad = 40;
    const drawWidth = width - pad * 2;
    const drawHeight = height - pad * 2;

    const cx = pad + ((x + scaleKm / 2) / scaleKm) * drawWidth;
    const cy = height - (pad + ((y + scaleKm / 2) / scaleKm) * drawHeight); // Flip Y so +y is North
    return { cx, cy };
  };

  const toWorldCoords = (cx: number, cy: number, width: number, height: number) => {
    const pad = 40;
    const drawWidth = width - pad * 2;
    const drawHeight = height - pad * 2;

    const x = ((cx - pad) / drawWidth) * scaleKm - scaleKm / 2;
    const y = ((height - cy - pad) / drawHeight) * scaleKm - scaleKm / 2;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      // Dark background
      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, width, height);

      // 1. Draw subtle road grid
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      const gridLines = 14;
      for (let i = 0; i <= gridLines; i++) {
        const frac = i / gridLines;
        const xPos = 40 + frac * (width - 80);
        const yPos = 40 + frac * (height - 80);

        ctx.beginPath();
        ctx.moveTo(xPos, 40);
        ctx.lineTo(xPos, height - 40);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(40, yPos);
        ctx.lineTo(width - 40, yPos);
        ctx.stroke();
      }

      // 2. Draw Demand Zones (Heatmap cells & borders)
      zones.forEach((zone, i) => {
        const { cx, cy } = toCanvasCoords(zone.x, zone.y, width, height);
        const cellSize = (width - 80) / 5.2;

        // Lambda density coloring: low (emerald/blue) -> mid (amber) -> high (rose/red)
        const intensity = Math.min(1.0, (zone.lambda_rate - 0.10) / 0.40);
        const alpha = 0.15 + intensity * 0.45;

        // Fill background
        ctx.fillStyle = `rgba(244, 63, 94, ${alpha})`;
        ctx.beginPath();
        ctx.roundRect(cx - cellSize / 2, cy - cellSize / 2, cellSize, cellSize, 8);
        ctx.fill();

        ctx.strokeStyle = 'rgba(51, 65, 85, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Zone labels & response time
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(zone.name, cx, cy - 12);

        ctx.fillStyle = '#f87171';
        ctx.font = 'bold 10px JetBrains Mono, monospace';
        ctx.fillText(`${zone.lambda_rate} λ/h`, cx, cy + 2);

        if (zoneResponseTimes && zoneResponseTimes[i] !== undefined) {
          const resp = zoneResponseTimes[i];
          const respColor = resp <= 8.0 ? '#10b981' : resp <= 12.0 ? '#f59e0b' : '#ef4444';
          ctx.fillStyle = respColor;
          ctx.font = 'bold 9px JetBrains Mono, monospace';
          ctx.fillText(`~${resp}m`, cx, cy + 15);
        }
      });

      // 3. Draw Coverage Radii for Ambulance Bases (8-min golden radius ~ 4.2 km)
      ambulanceBases.forEach((base, idx) => {
        const { cx, cy } = toCanvasCoords(base.x, base.y, width, height);
        const radiusCanvas = ((4.2 / scaleKm) * (width - 80));

        ctx.beginPath();
        ctx.arc(cx, cy, radiusCanvas, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(14, 165, 233, 0.07)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.35)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // 4. Draw Hospitals
      hospitals.forEach(h => {
        const { cx, cy } = toCanvasCoords(h.x, h.y, width, height);

        // Hospital pin
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.roundRect(cx - 14, cy - 14, 28, 28, 6);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // White Cross
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx - 3, cy - 9, 6, 18);
        ctx.fillRect(cx - 9, cy - 3, 18, 6);

        // Label
        ctx.fillStyle = '#fca5a5';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(h.name, cx, cy + 26);
      });

      // 5. Draw Ambulance Station Markers
      ambulanceBases.forEach((base, idx) => {
        const { cx, cy } = toCanvasCoords(base.x, base.y, width, height);

        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`S${idx + 1}`, cx, cy);
      });

      // 6. Draw Active Calls & Dispatch Lines
      activeCalls.forEach(call => {
        const { cx, cy } = toCanvasCoords(call.x, call.y, width, height);

        // Pulsing circle
        const pulse = (Date.now() / 300) % 3;
        ctx.beginPath();
        ctx.arc(cx, cy, 8 + pulse * 4, 0, Math.PI * 2);
        ctx.fillStyle = call.status === 'QUEUED' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.4)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fillStyle = call.status === 'QUEUED' ? '#ef4444' : '#f59e0b';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Trajectory line if ambulance is responding
        if (call.dispatchedAmbulanceId !== undefined) {
          const amb = activeAmbulances.find(a => a.id === call.dispatchedAmbulanceId);
          if (amb) {
            const ambCoords = toCanvasCoords(amb.currX, amb.currY, width, height);
            ctx.beginPath();
            ctx.moveTo(ambCoords.cx, ambCoords.cy);
            ctx.lineTo(cx, cy);
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      });

      // 7. Draw Moving Ambulances
      activeAmbulances.forEach(amb => {
        const { cx, cy } = toCanvasCoords(amb.currX, amb.currY, width, height);

        let statusColor = '#10b981'; // IDLE
        let statusBadge = 'IDLE';

        if (amb.status === 'DISPATCHED') {
          statusColor = '#f59e0b'; // Responding
          statusBadge = 'EN-ROUTE';
        } else if (amb.status === 'ON_SCENE') {
          statusColor = '#ec4899'; // CPR / scene
          statusBadge = 'ON SCENE';
        } else if (amb.status === 'TRANSPORTING') {
          statusColor = '#a855f7'; // Hospital
          statusBadge = 'TRANS';
        } else if (amb.status === 'AT_HOSPITAL') {
          statusColor = '#6366f1';
          statusBadge = 'HOSP';
        } else if (amb.status === 'RETURNING') {
          statusColor = '#06b6d4';
          statusBadge = 'RETURN';
        }

        // Vehicle halo
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fill();
        ctx.strokeStyle = statusColor;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Vehicle icon / ID
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`A${amb.id + 1}`, cx, cy);

        // Status badge tooltip
        ctx.fillStyle = statusColor;
        ctx.font = '8px Inter, sans-serif';
        ctx.fillText(statusBadge, cx, cy - 16);
      });

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [zones, hospitals, ambulanceBases, activeAmbulances, activeCalls, zoneResponseTimes, scaleKm]);

  // Handle Dragging in Custom Mode
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isCustomMode || !onBaseMove) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Check if clicked close to an ambulance base
    for (const base of ambulanceBases) {
      const { cx, cy } = toCanvasCoords(base.x, base.y, canvas.width, canvas.height);
      const dist = Math.hypot(mouseX - cx, mouseY - cy);
      if (dist <= 18) {
        draggingBaseId.current = base.id;
        break;
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingBaseId.current === null || !onBaseMove) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const { x, y } = toWorldCoords(mouseX, mouseY, canvas.width, canvas.height);
    onBaseMove(draggingBaseId.current, x, y);
  };

  const handleMouseUp = () => {
    draggingBaseId.current = null;
  };

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl">
      <div className="absolute top-3 left-4 z-10 flex items-center space-x-3 pointer-events-none">
        <div className="px-2.5 py-1 bg-slate-900/90 backdrop-blur border border-slate-700/60 rounded-md text-xs font-mono text-slate-300 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Prayagraj (Allahabad) Spatial Map (18km x 18km)
        </div>
        {isCustomMode && (
          <div className="px-2.5 py-1 bg-amber-500/20 border border-amber-500/40 rounded-md text-xs font-medium text-amber-300">
            Interactive: Click & Drag Stations (S1–Sn)
          </div>
        )}
      </div>

      <canvas
        ref={canvasRef}
        width={760}
        height={560}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className={`w-full h-auto block select-none ${isCustomMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
      />

      {/* Legend Footer */}
      <div className="px-4 py-2.5 bg-slate-900/90 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-y-2">
        <div className="flex items-center space-x-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
            <span>Ambulance Base</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500"></span>
            <span>Hospital Trauma Center</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <span>Idle Unit</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
            <span>Responding / Active Call</span>
          </div>
        </div>
        <div className="text-[11px] text-slate-400 font-mono">
          Dashed Rings = 8-min Response Horizon
        </div>
      </div>
    </div>
  );
};
