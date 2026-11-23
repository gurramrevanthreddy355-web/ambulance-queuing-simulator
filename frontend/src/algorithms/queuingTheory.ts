import { Zone, Hospital, AmbulanceBase, QueuingMetrics } from '../types';

export const DEFAULT_HOSPITALS: Hospital[] = [
  { id: 0, name: "General Trauma Center", x: -1.8, y: -0.6 },
  { id: 1, name: "Memorial Regional Hospital", x: 2.2, y: 1.6 }
];

export function generateCityZones(gridSize: number = 5, scaleKm: number = 12.0): Zone[] {
  const zoneNames = [
    "Downtown Metro", "Financial Dist.", "West End", "Riverfront", "North Hills",
    "Midtown Plaza", "Tech Corridor", "Civic Center", "Harbor South", "East End",
    "University Campus", "Medical Center", "Industrial Park", "Southgate", "Suburbs West",
    "Suburbs East", "Suburbs North", "Airport Blvd", "West Valley", "Greenwood",
    "Old Town", "Sports Arena", "Lakeview", "South Industrial", "Highland Park"
  ];

  const zones: Zone[] = [];
  const step = scaleKm / (gridSize - 1);
  const half = scaleKm / 2.0;

  let idx = 0;
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const x = Math.round((c * step - half) * 100) / 100;
      const y = Math.round((r * step - half) * 100) / 100;
      const distCenter = Math.sqrt(x * x + y * y);

      const downtownBonus = Math.max(0.0, 3.2 - 0.45 * distCenter);
      const baseLambda = Math.round((0.10 + downtownBonus * 0.12) * 1000) / 1000;
      const pop = Math.round(15000 + 35000 * Math.exp(-0.25 * distCenter));

      zones.push({
        id: idx,
        name: zoneNames[idx] || `Zone ${idx + 1}`,
        x,
        y,
        lambda_rate: baseLambda,
        population: pop
      });
      idx++;
    }
  }
  return zones;
}

export function travelTimeMinutes(
  x1: number, y1: number,
  x2: number, y2: number,
  speedKmh: number = 45.0
): number {
  const manhattanKm = Math.abs(x1 - x2) + Math.abs(y1 - y2);
  const travelMin = 1.0 + (manhattanKm / speedKmh) * 60.0;
  return travelMin;
}

export function calculateErlangC(
  servers: number,
  trafficIntensity: number
): { p0: number; pWait: number; wqMultiplier: number } {
  const c = servers;
  const a = trafficIntensity;
  const rho = a / c;

  if (rho >= 1.0) {
    return { p0: 0.0, pWait: 1.0, wqMultiplier: 25.0 };
  }

  let sumTerms = 0.0;
  let term = 1.0;
  for (let k = 0; k < c; k++) {
    sumTerms += term;
    term = term * a / (k + 1);
  }

  const cTerm = term;
  const p0 = 1.0 / (sumTerms + cTerm / (1.0 - rho));
  const pWait = (cTerm * p0) / (1.0 - rho);

  return {
    p0: Math.max(0, p0),
    pWait: Math.min(1.0, Math.max(0, pWait)),
    wqMultiplier: pWait / (1.0 - rho)
  };
}

export function solveJarvisHypercube(
  zones: Zone[],
  ambulanceBases: AmbulanceBase[],
  sceneTimeMin: number = 18.0,
  hospitalTimeMin: number = 20.0,
  transportProb: number = 0.60,
  speedKmh: number = 45.0
): QueuingMetrics {
  const K = ambulanceBases.length;
  const M = zones.length;

  if (K === 0 || M === 0) {
    return {
      systemAvgResponseMin: 0,
      pAllBusy: 0,
      fleetUtilization: 0,
      coverage8MinPct: 0,
      expectedQueueWaitMin: 0,
      zoneResponseTimes: [],
      serverBusyProbs: []
    };
  }

  // Travel matrix [K][M]
  const travelMatrix: number[][] = [];
  for (let k = 0; k < K; k++) {
    const row: number[] = [];
    for (let i = 0; i < M; i++) {
      row.push(travelTimeMinutes(ambulanceBases[k].x, ambulanceBases[k].y, zones[i].x, zones[i].y, speedKmh));
    }
    travelMatrix.push(row);
  }

  // Preference lists
  const prefOrder: number[][] = [];
  for (let i = 0; i < M; i++) {
    const indices = Array.from({ length: K }, (_, idx) => idx);
    indices.sort((a, b) => travelMatrix[a][i] - travelMatrix[b][i]);
    prefOrder.push(indices);
  }

  const totalLambda = zones.reduce((acc, z) => acc + z.lambda_rate, 0);
  const totalLambdaMin = totalLambda / 60.0;

  // Average travel time across city
  let sumTravel = 0;
  for (let k = 0; k < K; k++) {
    for (let i = 0; i < M; i++) {
      sumTravel += travelMatrix[k][i];
    }
  }
  const avgTravel = sumTravel / (K * M);
  const avgServiceTimeMin = avgTravel + sceneTimeMin + transportProb * (6.0 + hospitalTimeMin);
  const mu = 1.0 / avgServiceTimeMin;

  const rhoSystem = totalLambdaMin / (K * mu);
  let q: number[] = Array(K).fill(Math.min(0.95, Math.max(0.05, rhoSystem)));

  const erlang = calculateErlangC(K, totalLambdaMin / mu);
  const pAllBusy = erlang.pWait;

  // Fixed point iteration for Jarvis' algorithm
  for (let iter = 0; iter < 40; iter++) {
    const qOld = [...q];
    const P: number[][] = Array.from({ length: K }, () => Array(M).fill(0));

    for (let i = 0; i < M; i++) {
      const order = prefOrder[i];
      let probPriorBusy = 1.0;

      for (let r = 0; r < K; r++) {
        const k = order[r];
        const pDisp = (1.0 - q[k]) * probPriorBusy;
        P[k][i] = pDisp;
        probPriorBusy *= q[k];
      }

      let sumP = 0;
      for (let k = 0; k < K; k++) sumP += P[k][i];
      if (sumP > 0) {
        for (let k = 0; k < K; k++) {
          P[k][i] = (P[k][i] * (1.0 - pAllBusy)) / sumP;
        }
      }
    }

    const LambdaK: number[] = Array(K).fill(0);
    for (let k = 0; k < K; k++) {
      for (let i = 0; i < M; i++) {
        const zLambdaMin = zones[i].lambda_rate / 60.0;
        LambdaK[k] += zLambdaMin * P[k][i];
      }
    }

    for (let k = 0; k < K; k++) {
      let weightedTravel = avgTravel;
      if (LambdaK[k] > 0) {
        let wt = 0;
        for (let i = 0; i < M; i++) {
          wt += (zones[i].lambda_rate / 60.0) * P[k][i] * travelMatrix[k][i];
        }
        weightedTravel = wt / LambdaK[k];
      }
      const servTimeK = weightedTravel + sceneTimeMin + transportProb * (6.0 + hospitalTimeMin);
      const muK = 1.0 / servTimeK;
      q[k] = Math.min(0.98, Math.max(0.02, LambdaK[k] / muK));
    }

    let maxDiff = 0;
    for (let k = 0; k < K; k++) {
      maxDiff = Math.max(maxDiff, Math.abs(q[k] - qOld[k]));
    }
    if (maxDiff < 1e-4) break;
  }

  // Zone response times
  const denom = Math.max(0.01, K * mu - totalLambdaMin);
  const Wq = rhoSystem < 1.0 ? pAllBusy / denom : 25.0;

  const zoneResponseTimes: number[] = [];
  let systemWeightedResp = 0;
  let coverage8MinCount = 0;

  for (let i = 0; i < M; i++) {
    let primaryResp = 0;
    for (let k = 0; k < K; k++) {
      primaryResp += (1.0 - q[k]) * travelMatrix[k][i];
    }
    const norm = (1.0 - pAllBusy);
    const expectedResp = (primaryResp / Math.max(0.01, K)) + pAllBusy * (Wq + 8.5);

    zoneResponseTimes.push(Math.round(expectedResp * 100) / 100);
    systemWeightedResp += expectedResp * zones[i].lambda_rate;

    if (expectedResp <= 8.0) {
      coverage8MinCount++;
    }
  }

  const systemAvgResp = systemWeightedResp / totalLambda;
  const fleetUtil = q.reduce((a, b) => a + b, 0) / K;

  return {
    systemAvgResponseMin: Math.round(systemAvgResp * 100) / 100,
    pAllBusy: Math.round(pAllBusy * 1000) / 1000,
    fleetUtilization: Math.round(fleetUtil * 1000) / 1000,
    coverage8MinPct: Math.round((coverage8MinCount / M) * 1000) / 10,
    expectedQueueWaitMin: Math.round(Wq * 100) / 100,
    zoneResponseTimes,
    serverBusyProbs: q.map(val => Math.round(val * 100) / 100)
  };
}

export function getNaivePlacement(zones: Zone[], fleetSize: number): AmbulanceBase[] {
  const sorted = [...zones].sort((a, b) => b.lambda_rate - a.lambda_rate);
  const bases: AmbulanceBase[] = [];

  for (let k = 0; k < fleetSize; k++) {
    const z = sorted[k % sorted.length];
    const jitter = (Math.floor(k / sorted.length)) * 0.25;
    bases.push({
      id: k,
      name: `Naive Unit #${k + 1}`,
      x: Math.round((z.x + jitter) * 100) / 100,
      y: Math.round((z.y + jitter) * 100) / 100
    });
  }
  return bases;
}

export function getQueuingPlacement(zones: Zone[], fleetSize: number): AmbulanceBase[] {
  const totalLambda = zones.reduce((acc, z) => acc + z.lambda_rate, 0);
  const avgServiceHr = 0.65;
  const systemLoad = (totalLambda * avgServiceHr) / fleetSize;
  const busyProb = Math.min(0.85, Math.max(0.20, systemLoad));

  const candidates = zones.map(z => ({ x: z.x, y: z.y, id: z.id }));
  const selected: { x: number; y: number }[] = [];
  const coverageCounts = Array(zones.length).fill(0);
  const radiusKm = 4.2;

  for (let amb = 0; amb < fleetSize; amb++) {
    let bestCand = candidates[0];
    let bestGain = -Infinity;

    for (const cand of candidates) {
      let gain = 0;
      for (let i = 0; i < zones.length; i++) {
        const dist = Math.abs(cand.x - zones[i].x) + Math.abs(cand.y - zones[i].y);
        if (dist <= radiusKm) {
          const kCurr = coverageCounts[i];
          const marginalP = (1.0 - busyProb) * Math.pow(busyProb, kCurr);
          gain += zones[i].lambda_rate * marginalP;
        }
      }

      // Dispersion incentive to prevent severe backup clumping
      for (const sel of selected) {
        const dSel = Math.abs(cand.x - sel.x) + Math.abs(cand.y - sel.y);
        if (dSel < 2.5) {
          gain *= 0.70;
        }
      }

      if (gain > bestGain) {
        bestGain = gain;
        bestCand = cand;
      }
    }

    selected.push({ x: bestCand.x, y: bestCand.y });
    for (let i = 0; i < zones.length; i++) {
      const dist = Math.abs(bestCand.x - zones[i].x) + Math.abs(bestCand.y - zones[i].y);
      if (dist <= radiusKm) {
        coverageCounts[i]++;
      }
    }
  }

  return selected.map((s, idx) => ({
    id: idx,
    name: `Queuing Unit #${idx + 1}`,
    x: s.x,
    y: s.y
  }));
}
