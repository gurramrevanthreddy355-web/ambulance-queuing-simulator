import { Zone, Hospital, AmbulanceBase, ActiveAmbulance, EmergencyCall, SimulationStats } from '../types';
import { travelTimeMinutes } from './queuingTheory';

export class LiveSimulationEngine {
  public zones: Zone[];
  public hospitals: Hospital[];
  public ambulances: ActiveAmbulance[];
  public calls: EmergencyCall[] = [];
  public callQueue: EmergencyCall[] = [];
  public completedCalls: EmergencyCall[] = [];
  
  public simMinutes: number = 0;
  public totalCallsSpawned: number = 0;
  private callCounter: number = 0;
  public speedKmh: number = 45.0;
  public sceneTimeMin: number = 18.0;
  public hospitalTimeMin: number = 20.0;
  public transportProb: number = 0.60;

  constructor(zones: Zone[], hospitals: Hospital[], bases: AmbulanceBase[]) {
    this.zones = zones;
    this.hospitals = hospitals;
    this.ambulances = bases.map((b, idx) => ({
      id: idx,
      baseId: b.id,
      baseX: b.x,
      baseY: b.y,
      currX: b.x,
      currY: b.y,
      status: 'IDLE',
      busyTime: 0,
      totalCallsHandled: 0
    }));
  }

  public reset(bases: AmbulanceBase[]) {
    this.simMinutes = 0;
    this.totalCallsSpawned = 0;
    this.callCounter = 0;
    this.calls = [];
    this.callQueue = [];
    this.completedCalls = [];
    this.ambulances = bases.map((b, idx) => ({
      id: idx,
      baseId: b.id,
      baseX: b.x,
      baseY: b.y,
      currX: b.x,
      currY: b.y,
      status: 'IDLE',
      busyTime: 0,
      totalCallsHandled: 0
    }));
  }

  public tick(deltaMinutes: number) {
    this.simMinutes += deltaMinutes;

    // 1. Stochastic Call Generation (Poisson Process)
    const totalLambdaHr = this.zones.reduce((sum, z) => sum + z.lambda_rate, 0);
    const expectedArrivalsInDelta = (totalLambdaHr / 60.0) * deltaMinutes;

    // Poisson approximation for small time step:
    // With small delta, probability of 1 arrival ~ expectedArrivals
    if (Math.random() < expectedArrivalsInDelta) {
      this.spawnCall();
    }

    // 2. Dispatch Manager: Match queued calls to idle ambulances
    if (this.callQueue.length > 0) {
      const idleAmbs = this.ambulances.filter(a => a.status === 'IDLE');
      if (idleAmbs.length > 0) {
        const nextCall = this.callQueue.shift()!;
        // Pick closest available ambulance
        idleAmbs.sort((a, b) => {
          const tA = travelTimeMinutes(a.currX, a.currY, nextCall.x, nextCall.y, this.speedKmh);
          const tB = travelTimeMinutes(b.currX, b.currY, nextCall.x, nextCall.y, this.speedKmh);
          return tA - tB;
        });

        const chosen = idleAmbs[0];
        chosen.status = 'DISPATCHED';
        chosen.targetX = nextCall.x;
        chosen.targetY = nextCall.y;
        chosen.currentCallId = nextCall.id;
        chosen.totalCallsHandled++;

        nextCall.status = 'RESPONDING';
        nextCall.dispatchedAmbulanceId = chosen.id;
        nextCall.queueWaitMin = this.simMinutes - nextCall.timestamp;
      }
    }

    // 3. Step individual ambulance state machines
    for (const amb of this.ambulances) {
      if (amb.status !== 'IDLE') {
        amb.busyTime += deltaMinutes;
      }

      const moveStep = (this.speedKmh / 60.0) * deltaMinutes; // distance in km

      switch (amb.status) {
        case 'DISPATCHED': {
          if (amb.targetX !== undefined && amb.targetY !== undefined) {
            const dist = Math.hypot(amb.targetX - amb.currX, amb.targetY - amb.currY);
            if (dist <= moveStep) {
              // Arrived on scene
              amb.currX = amb.targetX;
              amb.currY = amb.targetY;
              amb.status = 'ON_SCENE';

              const call = this.calls.find(c => c.id === amb.currentCallId);
              if (call) {
                call.status = 'TREATING';
                call.responseDurationMin = this.simMinutes - call.timestamp;
              }
            } else {
              const angle = Math.atan2(amb.targetY - amb.currY, amb.targetX - amb.currX);
              amb.currX += Math.cos(angle) * moveStep;
              amb.currY += Math.sin(angle) * moveStep;
            }
          }
          break;
        }

        case 'ON_SCENE': {
          // On-scene time completion check
          const finishProb = deltaMinutes / this.sceneTimeMin;
          if (Math.random() < finishProb) {
            const needsTransport = Math.random() < this.transportProb;
            if (needsTransport && this.hospitals.length > 0) {
              // Pick closest hospital
              const hosp = [...this.hospitals].sort((h1, h2) => {
                const d1 = Math.hypot(h1.x - amb.currX, h1.y - amb.currY);
                const d2 = Math.hypot(h2.x - amb.currX, h2.y - amb.currY);
                return d1 - d2;
              })[0];

              amb.status = 'TRANSPORTING';
              amb.targetX = hosp.x;
              amb.targetY = hosp.y;

              const call = this.calls.find(c => c.id === amb.currentCallId);
              if (call) call.status = 'TRANSPORTING';
            } else {
              // Patient treated on scene, return to base
              this.resolveCall(amb);
            }
          }
          break;
        }

        case 'TRANSPORTING': {
          if (amb.targetX !== undefined && amb.targetY !== undefined) {
            const dist = Math.hypot(amb.targetX - amb.currX, amb.targetY - amb.currY);
            if (dist <= moveStep) {
              amb.currX = amb.targetX;
              amb.currY = amb.targetY;
              amb.status = 'AT_HOSPITAL';
            } else {
              const angle = Math.atan2(amb.targetY - amb.currY, amb.targetX - amb.currX);
              amb.currX += Math.cos(angle) * moveStep;
              amb.currY += Math.sin(angle) * moveStep;
            }
          }
          break;
        }

        case 'AT_HOSPITAL': {
          const handoffProb = deltaMinutes / this.hospitalTimeMin;
          if (Math.random() < handoffProb) {
            this.resolveCall(amb);
          }
          break;
        }

        case 'RETURNING': {
          const dist = Math.hypot(amb.baseX - amb.currX, amb.baseY - amb.currY);
          if (dist <= moveStep) {
            amb.currX = amb.baseX;
            amb.currY = amb.baseY;
            amb.status = 'IDLE';
            amb.targetX = undefined;
            amb.targetY = undefined;
          } else {
            const angle = Math.atan2(amb.baseY - amb.currY, amb.baseX - amb.currX);
            amb.currX += Math.cos(angle) * moveStep;
            amb.currY += Math.sin(angle) * moveStep;
          }
          break;
        }

        case 'IDLE':
        default:
          break;
      }
    }
  }

  private spawnCall() {
    // Weighted sample zone
    const totalLambda = this.zones.reduce((s, z) => s + z.lambda_rate, 0);
    let rand = Math.random() * totalLambda;
    let chosenZone = this.zones[0];
    for (const z of this.zones) {
      rand -= z.lambda_rate;
      if (rand <= 0) {
        chosenZone = z;
        break;
      }
    }

    // Jitter around zone center
    const jitterX = (Math.random() - 0.5) * 1.2;
    const jitterY = (Math.random() - 0.5) * 1.2;

    this.callCounter++;
    this.totalCallsSpawned++;

    const newCall: EmergencyCall = {
      id: this.callCounter,
      zoneId: chosenZone.id,
      x: chosenZone.x + jitterX,
      y: chosenZone.y + jitterY,
      timestamp: this.simMinutes,
      status: 'QUEUED',
      queueWaitMin: 0,
      responseDurationMin: 0
    };

    this.calls.push(newCall);
    this.callQueue.push(newCall);
  }

  private resolveCall(amb: ActiveAmbulance) {
    const call = this.calls.find(c => c.id === amb.currentCallId);
    if (call) {
      call.status = 'RESOLVED';
      this.completedCalls.push(call);
      this.calls = this.calls.filter(c => c.id !== call.id);
    }
    amb.currentCallId = undefined;
    amb.status = 'RETURNING';
    amb.targetX = amb.baseX;
    amb.targetY = amb.baseY;
  }

  public getStats(): SimulationStats {
    const respTimes = this.completedCalls.map(c => c.responseDurationMin).filter(t => t > 0);
    const queueTimes = this.completedCalls.map(c => c.queueWaitMin);

    respTimes.sort((a, b) => a - b);
    const avgResp = respTimes.length > 0 ? respTimes.reduce((a, b) => a + b, 0) / respTimes.length : 0;
    const p90Idx = Math.floor(respTimes.length * 0.90);
    const p90Resp = respTimes.length > 0 ? respTimes[p90Idx] : 0;

    const under8MinCount = respTimes.filter(t => t <= 8.0).length;
    const compliance = respTimes.length > 0 ? (under8MinCount / respTimes.length) * 100 : 0;
    const delayedCount = queueTimes.filter(q => q > 0.1).length;
    const delayedPct = queueTimes.length > 0 ? (delayedCount / queueTimes.length) * 100 : 0;

    const busyAmbs = this.ambulances.filter(a => a.status !== 'IDLE').length;
    const currentUtil = this.ambulances.length > 0 ? (busyAmbs / this.ambulances.length) * 100 : 0;

    return {
      simMinutes: Math.round(this.simMinutes * 10) / 10,
      totalCalls: this.totalCallsSpawned,
      activeCalls: this.calls.length,
      queuedCallsCount: this.callQueue.length,
      avgResponseTimeMin: Math.round(avgResp * 10) / 10,
      p90ResponseTimeMin: Math.round(p90Resp * 10) / 10,
      compliance8MinPct: Math.round(compliance * 10) / 10,
      callsDelayedPct: Math.round(delayedPct * 10) / 10,
      currentUtilization: Math.round(currentUtil)
    };
  }
}
