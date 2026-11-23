export interface Zone {
  id: number;
  name: string;
  x: number;
  y: number;
  lambda_rate: number; // calls per hour
  population: number;
}

export interface Hospital {
  id: number;
  name: string;
  x: number;
  y: number;
}

export interface AmbulanceBase {
  id: number;
  name: string;
  x: number;
  y: number;
}

export type AmbulanceStatus = 
  | 'IDLE'
  | 'DISPATCHED'
  | 'ON_SCENE'
  | 'TRANSPORTING'
  | 'AT_HOSPITAL'
  | 'RETURNING';

export interface ActiveAmbulance {
  id: number;
  baseId: number;
  baseX: number;
  baseY: number;
  currX: number;
  currY: number;
  targetX?: number;
  targetY?: number;
  status: AmbulanceStatus;
  currentCallId?: number;
  busyTime: number;
  totalCallsHandled: number;
}

export interface EmergencyCall {
  id: number;
  zoneId: number;
  x: number;
  y: number;
  timestamp: number;
  dispatchedAmbulanceId?: number;
  status: 'QUEUED' | 'RESPONDING' | 'TREATING' | 'TRANSPORTING' | 'RESOLVED';
  queueWaitMin: number;
  responseDurationMin: number;
}

export interface QueuingMetrics {
  systemAvgResponseMin: number;
  pAllBusy: number;
  fleetUtilization: number;
  coverage8MinPct: number;
  expectedQueueWaitMin: number;
  zoneResponseTimes: number[];
  serverBusyProbs: number[];
}

export interface SimulationStats {
  simMinutes: number;
  totalCalls: number;
  activeCalls: number;
  queuedCallsCount: number;
  avgResponseTimeMin: number;
  p90ResponseTimeMin: number;
  compliance8MinPct: number;
  callsDelayedPct: number;
  currentUtilization: number;
}

export type PlacementStrategy = 'QUEUING' | 'NAIVE' | 'CUSTOM';
