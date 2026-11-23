"""
SimPy Discrete-Event Simulation for Emergency Medical Services.
Validates analytical queuing theory models against stochastic real-world call processes.
"""

import random
import simpy
import numpy as np
from typing import List, Tuple, Dict
from queuing_theory import CityModel

class AmbulanceSimulation:
    def __init__(self, city: CityModel, ambulance_positions: List[Tuple[float, float]],
                 sim_hours: float = 72.0,
                 avg_scene_time_min: float = 18.0,
                 avg_hospital_time_min: float = 20.0,
                 hospital_transport_prob: float = 0.60,
                 speed_kmh: float = 45.0,
                 seed: int = 42):
        self.city = city
        self.ambulance_positions = ambulance_positions
        self.K = len(ambulance_positions)
        self.sim_hours = sim_hours
        self.scene_time = avg_scene_time_min
        self.hospital_time = avg_hospital_time_min
        self.transport_prob = hospital_transport_prob
        self.speed_kmh = speed_kmh
        self.seed = seed
        
        # Telemetry
        self.call_logs = []
        self.queue_times = []
        self.response_times = []
        
    def run(self) -> Dict:
        random.seed(self.seed)
        np.random.seed(self.seed)
        
        env = simpy.Environment()
        
        # Priority / Central dispatch queue
        # Each ambulance is tracked by its state
        ambulances = []
        for i in range(self.K):
            ambulances.append({
                "id": i,
                "base_x": self.ambulance_positions[i][0],
                "base_y": self.ambulance_positions[i][1],
                "curr_x": self.ambulance_positions[i][0],
                "curr_y": self.ambulance_positions[i][1],
                "is_busy": False,
                "total_busy_time": 0.0
            })
            
        call_queue = []
        
        # Start processes
        env.process(self._call_generator(env, ambulances, call_queue))
        env.process(self._dispatcher_loop(env, ambulances, call_queue))
        
        sim_duration_minutes = self.sim_hours * 60.0
        env.run(until=sim_duration_minutes)
        
        # Statistics
        resp_times = np.array(self.response_times) if self.response_times else np.array([0.0])
        q_times = np.array(self.queue_times) if self.queue_times else np.array([0.0])
        
        avg_resp = float(np.mean(resp_times))
        p90_resp = float(np.percentile(resp_times, 90))
        pct_under_8min = float(np.mean(resp_times <= 8.0) * 100.0)
        pct_delayed = float(np.mean(q_times > 0.05) * 100.0)
        avg_q_wait = float(np.mean(q_times))
        
        utilizations = [a["total_busy_time"] / sim_duration_minutes for a in ambulances]
        fleet_util = float(np.mean(utilizations))
        
        return {
            "total_calls": len(self.call_logs),
            "sim_hours": self.sim_hours,
            "avg_response_time_min": round(avg_resp, 2),
            "p90_response_time_min": round(p90_resp, 2),
            "compliance_8min_pct": round(pct_under_8min, 1),
            "calls_delayed_pct": round(pct_delayed, 1),
            "avg_queue_wait_min": round(avg_q_wait, 2),
            "fleet_utilization": round(fleet_util, 3),
            "ambulance_utilizations": [round(u, 3) for u in utilizations]
        }

    def _call_generator(self, env: simpy.Environment, ambulances: List[Dict], call_queue: List[Dict]):
        total_lambda_hr = sum(z["lambda_rate"] for z in self.city.zones)
        total_lambda_min = total_lambda_hr / 60.0
        
        zone_probs = np.array([z["lambda_rate"] for z in self.city.zones])
        zone_probs = zone_probs / np.sum(zone_probs)
        
        call_id = 0
        while True:
            dt = random.expovariate(total_lambda_min)
            yield env.timeout(dt)
            
            zone_idx = np.random.choice(len(self.city.zones), p=zone_probs)
            zone = self.city.zones[zone_idx]
            call_id += 1
            
            call_queue.append({
                "id": call_id,
                "arrival_time": env.now,
                "zone": zone
            })

    def _dispatcher_loop(self, env: simpy.Environment, ambulances: List[Dict], call_queue: List[Dict]):
        """
        Continuous dispatch manager: checks queue and assigns closest available unit.
        """
        while True:
            if call_queue:
                idle_ambs = [a for a in ambulances if not a["is_busy"]]
                if idle_ambs:
                    call = call_queue.pop(0)
                    zone = call["zone"]
                    # Sort idle ambulances by travel time to call zone
                    idle_ambs.sort(key=lambda a: self.city.travel_time_minutes(a["curr_x"], a["curr_y"], zone["x"], zone["y"], self.speed_kmh))
                    chosen_amb = idle_ambs[0]
                    chosen_amb["is_busy"] = True
                    env.process(self._service_process(env, call, chosen_amb))
            yield env.timeout(0.1) # Check dispatch every 6 seconds

    def _service_process(self, env: simpy.Environment, call: Dict, amb: Dict):
        zone = call["zone"]
        queue_wait = env.now - call["arrival_time"]
        service_start = env.now
        
        # Travel to scene
        travel_time = self.city.travel_time_minutes(amb["curr_x"], amb["curr_y"], zone["x"], zone["y"], self.speed_kmh)
        yield env.timeout(travel_time)
        
        scene_arrival_time = env.now
        total_response = scene_arrival_time - call["arrival_time"]
        
        self.response_times.append(total_response)
        self.queue_times.append(queue_wait)
        
        # Update ambulance position to scene
        amb["curr_x"] = zone["x"]
        amb["curr_y"] = zone["y"]
        
        # On-scene triage
        on_scene = random.expovariate(1.0 / self.scene_time)
        yield env.timeout(on_scene)
        
        # Transport to hospital?
        if random.random() < self.transport_prob:
            closest_hosp = min(self.city.hospitals, key=lambda h: self.city.travel_time_minutes(zone["x"], zone["y"], h["x"], h["y"], self.speed_kmh))
            hosp_travel = self.city.travel_time_minutes(zone["x"], zone["y"], closest_hosp["x"], closest_hosp["y"], self.speed_kmh)
            yield env.timeout(hosp_travel)
            
            amb["curr_x"] = closest_hosp["x"]
            amb["curr_y"] = closest_hosp["y"]
            
            hosp_time = random.expovariate(1.0 / self.hospital_time)
            yield env.timeout(hosp_time)
            
        # Return to base
        amb["curr_x"] = amb["base_x"]
        amb["curr_y"] = amb["base_y"]
        amb["total_busy_time"] += (env.now - service_start)
        amb["is_busy"] = False
        
        self.call_logs.append({
            "call_id": call["id"],
            "response_time": total_response,
            "queue_wait": queue_wait,
            "amb_id": amb["id"],
            "zone_id": zone["id"]
        })
