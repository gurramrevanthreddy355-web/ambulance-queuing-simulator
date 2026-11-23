import { Zone, Hospital, AmbulanceBase, QueuingMetrics } from '../types';

export const PRAYAGRAJ_HOSPITALS: Hospital[] = [
  { id: 0, name: "SRN Hospital & MLN Med. College", x: 0.8, y: -0.5 },
  { id: 1, name: "TB Sapru (Beli) Hospital", x: -1.2, y: 1.3 },
  { id: 2, name: "Kamla Nehru Memorial Hospital (KNMH)", x: 1.7, y: -1.0 }
];

export const DEFAULT_HOSPITALS = PRAYAGRAJ_HOSPITALS;

export function generateCityZones(): Zone[] {
  const prayagrajZones = [
    { id: 0, name: "Civil Lines (Core Hub)", x: 0.0, y: 0.2, lambda_rate: 0.38, population: 55000 },
    { id: 1, name: "Chowk & Clock Tower", x: -0.8, y: -1.8, lambda_rate: 0.44, population: 85000 },
    { id: 2, name: "Old Katra Commercial", x: 0.2, y: 0.9, lambda_rate: 0.34, population: 48000 },
    { id: 3, name: "Allahabad University", x: 0.8, y: 1.3, lambda_rate: 0.28, population: 35000 },
    { id: 4, name: "Daraganj (Sangam Ghats)", x: 3.2, y: -1.2, lambda_rate: 0.39, population: 62000 },
    { id: 5, name: "Triveni Sangam Nose", x: 3.8, y: -2.4, lambda_rate: 0.32, population: 28000 },
    { id: 6, name: "George Town", x: 1.1, y: -0.4, lambda_rate: 0.30, population: 42000 },
    { id: 7, name: "Tagoretown & Baihrana", x: 1.6, y: -1.2, lambda_rate: 0.33, population: 49000 },
    { id: 8, name: "Alopibagh (Alopi Devi)", x: 2.5, y: -0.6, lambda_rate: 0.31, population: 38000 },
    { id: 9, name: "Mumfordganj", x: -0.5, y: 1.8, lambda_rate: 0.27, population: 34000 },
    { id: 10, name: "Teliyarganj & MNNIT", x: -0.2, y: 3.8, lambda_rate: 0.29, population: 41000 },
    { id: 11, name: "Rajapur (Beli Area)", x: -1.2, y: 1.2, lambda_rate: 0.32, population: 39000 },
    { id: 12, name: "Subedarganj Junction", x: -3.8, y: 0.4, lambda_rate: 0.34, population: 52000 },
    { id: 13, name: "Dhoomanganj", x: -4.6, y: 0.8, lambda_rate: 0.31, population: 46000 },
    { id: 14, name: "Sulem Sarai", x: -5.4, y: 0.6, lambda_rate: 0.26, population: 36000 },
    { id: 15, name: "Bamrauli (Airport)", x: -7.2, y: 0.2, lambda_rate: 0.21, population: 28000 },
    { id: 16, name: "Jhalwa (IIIT-A)", x: -5.8, y: -2.0, lambda_rate: 0.24, population: 32000 },
    { id: 17, name: "Kareli & Atala", x: -1.8, y: -3.2, lambda_rate: 0.37, population: 72000 },
    { id: 18, name: "Muthiganj (Anaj Mandi)", x: -0.4, y: -2.6, lambda_rate: 0.35, population: 58000 },
    { id: 19, name: "Kydganj", x: 1.0, y: -2.5, lambda_rate: 0.30, population: 44000 },
    { id: 20, name: "Naini Central (Trans-Yamuna)", x: 1.5, y: -6.5, lambda_rate: 0.36, population: 68000 },
    { id: 21, name: "Naini ADA Colony", x: 2.8, y: -7.5, lambda_rate: 0.25, population: 45000 },
    { id: 22, name: "Jhusi (Trans-Ganga East)", x: 5.5, y: 0.8, lambda_rate: 0.28, population: 48000 },
    { id: 23, name: "Phaphamau (Trans-Ganga North)", x: -0.8, y: 6.2, lambda_rate: 0.26, population: 39000 },
    { id: 24, name: "New Cantonment", x: -2.2, y: -0.6, lambda_rate: 0.16, population: 22000 }
  ];

  return prayagrajZones;
}

export function travelTimeMinutes(
  x1: number, y1: number,
  x2: number, y2: number,
  speedKmh: number = 40.0
): number {
  const distKm = Math.abs(x1 - x2) + Math.abs(y1 - y2);

  // Realistic Bridge bottlenecks across Ganga and Yamuna:
  let bridgeDelay = 0;
  // Cross Yamuna (Naini y < -4.5)
  if ((y1 < -4.5 && y2 > -4.5) || (y2 < -4.5 && y1 > -4.5)) {
    bridgeDelay += 3.5;
  }
  // Cross Ganga East (Jhusi x > 4.0)
  if ((x1 > 4.0 && x2 < 4.0) || (x2 > 4.0 && x1 < 4.0)) {
    bridgeDelay += 3.0;
  }
  // Cross Ganga North (Phaphamau y > 5.0)
  if ((y1 > 5.0 && y2 < 5.0) || (y2 > 5.0 && y1 < 5.0)) {
    bridgeDelay += 3.0;
  }

  const travelMin = 1.0 + (distKm / speedKmh) * 60.0 + bridgeDelay;
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
  speedKmh: number = 40.0
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

  const travelMatrix: number[][] = [];
  for (let k = 0; k < K; k++) {
    const row: number[] = [];
    for (let i = 0; i < M; i++) {
      row.push(travelTimeMinutes(ambulanceBases[k].x, ambulanceBases[k].y, zones[i].x, zones[i].y, speedKmh));
    }
    travelMatrix.push(row);
  }

  const prefOrder: number[][] = [];
  for (let i = 0; i < M; i++) {
    const indices = Array.from({ length: K }, (_, idx) => idx);
    indices.sort((a, b) => travelMatrix[a][i] - travelMatrix[b][i]);
    prefOrder.push(indices);
  }

  const totalLambda = zones.reduce((acc, z) => acc + z.lambda_rate, 0);
  const totalLambdaMin = totalLambda / 60.0;

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
  // Naive strategy: Pours ambulances into the highest demand spots (Civil Lines, Chowk, Daraganj)
  // Ignoring that Naini, Jhusi, and Phaphamau are across bottleneck bridges!
  const sorted = [...zones].sort((a, b) => b.lambda_rate - a.lambda_rate);
  const bases: AmbulanceBase[] = [];

  for (let k = 0; k < fleetSize; k++) {
    const z = sorted[k % sorted.length];
    const jitter = (Math.floor(k / sorted.length)) * 0.35;
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
  // Queuing Theory strategy (MEXCLP with bridge barrier penalty):
  // Ensures backup units are positioned across natural bridge bottlenecks (Naini, Jhusi, Subedarganj)
  // to prevent tail-latency blowout when bridges get congested!
  const totalLambda = zones.reduce((acc, z) => acc + z.lambda_rate, 0);
  const avgServiceHr = 0.65;
  const systemLoad = (totalLambda * avgServiceHr) / fleetSize;
  const busyProb = Math.min(0.85, Math.max(0.20, systemLoad));

  const candidates = zones.map(z => ({ x: z.x, y: z.y, id: z.id }));
  const selected: { x: number; y: number }[] = [];
  const coverageCounts = Array(zones.length).fill(0);
  const radiusKm = 4.5;

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

      for (const sel of selected) {
        const dSel = Math.abs(cand.x - sel.x) + Math.abs(cand.y - sel.y);
        if (dSel < 2.6) {
          gain *= 0.65;
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
    name: `Queuing Base S${idx + 1}`,
    x: s.x,
    y: s.y
  }));
}
