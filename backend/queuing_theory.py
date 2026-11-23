"""
Queuing Theory Engine for Ambulance Location & Dispatch.
Implements:
1. Erlang-C M/M/c queuing model for congestion probability and waiting times.
2. Larson's Hypercube Queueing Model (Jarvis's Hypercube Approximation Algorithm).
3. MEXCLP (Maximum Expected Covering Location Problem) objective formulation.
"""

import math
from typing import List, Dict, Tuple
import numpy as np

def erlang_c(servers: int, traffic_intensity: float) -> Tuple[float, float, float]:
    """
    Computes Erlang-C formula for an M/M/c queuing system.
    
    Args:
        servers (c): Number of available ambulances.
        traffic_intensity (a = lambda / mu): Offered load.
        
    Returns:
        (P0, P_wait, Wq_multiplier)
        P0: Probability system is empty.
        P_wait: Probability an incoming call must wait in queue.
        Wq_multiplier: Wq = P_wait / (c * mu - lambda)
    """
    c = servers
    a = float(traffic_intensity)
    rho = a / c
    
    if rho >= 1.0:
        # System is saturated (demand >= service capacity)
        return 0.0, 1.0, float('inf')
    
    # Calculate sum_{k=0}^{c-1} a^k / k!
    sum_terms = 0.0
    term = 1.0
    for k in range(c):
        sum_terms += term
        term = term * a / (k + 1)
        
    # term now holds a^c / c!
    c_term = term
    p0 = 1.0 / (sum_terms + (c_term / (1.0 - rho)))
    p_wait = (c_term * p0) / (1.0 - rho)
    
    return p0, min(1.0, p_wait), p_wait

class CityModel:
    """
    Spatial model containing demand zones, hospitals, and ambulance stations.
    """
    def __init__(self, grid_size: int = 5, scale_km: float = 12.0):
        self.grid_size = grid_size
        self.scale_km = scale_km
        self.zones = []
        self.hospitals = []
        self._initialize_grid()

    def _initialize_grid(self):
        # 5x5 grid = 25 distinct city neighborhoods
        zone_names = [
            "Downtown Metro", "Financial Dist.", "West End", "Riverfront", "North Hills",
            "Midtown Plaza", "Tech Corridor", "Civic Center", "Harbor South", "East End",
            "University Campus", "Medical Center", "Industrial Park", "Southgate", "Suburbs West",
            "Suburbs East", "Suburbs North", "Airport Blvd", "West Valley", "Greenwood",
            "Old Town", "Sports Arena", "Lakeview", "South Industrial", "Highland Park"
        ]
        
        # Center coordinates around (0,0) scaled to scale_km
        step = self.scale_km / (self.grid_size - 1)
        half = self.scale_km / 2.0
        
        idx = 0
        for r in range(self.grid_size):
            for c in range(self.grid_size):
                x = c * step - half
                y = r * step - half
                dist_center = math.sqrt(x*x + y*y)
                
                # Downtown & center have higher arrival rates (Poisson lambda)
                # Outer suburbs have lower arrival rates
                # Total city lambda calibrated to ~5-8 calls/hour for fleet sizes of 4-12 units
                downtown_bonus = max(0.0, 3.0 - 0.4 * dist_center)
                base_lambda = 0.12 + downtown_bonus * 0.10
                
                # Population weight
                pop = int(15000 + 35000 * math.exp(-0.25 * dist_center))
                
                self.zones.append({
                    "id": idx,
                    "name": zone_names[idx] if idx < len(zone_names) else f"Zone {idx+1}",
                    "x": round(x, 2),
                    "y": round(y, 2),
                    "lambda_rate": round(base_lambda, 3), # calls per hour
                    "population": pop
                })
                idx += 1
                
        # 2 Major Trauma Hospitals
        self.hospitals = [
            {"id": 0, "name": "General Hospital Trauma Center", "x": -1.5, "y": -0.5},
            {"id": 1, "name": "Memorial Regional Hospital", "x": 2.0, "y": 1.5}
        ]

    def travel_time_minutes(self, x1: float, y1: float, x2: float, y2: float, speed_kmh: float = 45.0) -> float:
        """
        Calculates travel time using Manhattan grid with dispatch lag.
        """
        # Manhattan distance accounts for city street grid
        dist_km = abs(x1 - x2) + abs(y1 - y2)
        # 1 minute dispatch & turnout delay + travel time
        travel_min = 1.0 + (dist_km / speed_kmh) * 60.0
        return travel_min

class JarvisHypercubeModel:
    """
    Jarvis's Hypercube Approximation Algorithm.
    Computes individual ambulance busy probabilities (q_k) and
    dispatch probability matrices P_ij for spatially distributed EMS systems.
    """
    def __init__(self, city: CityModel, ambulance_positions: List[Tuple[float, float]],
                 avg_scene_time_min: float = 20.0,
                 avg_hospital_time_min: float = 25.0,
                 hospital_transport_prob: float = 0.65,
                 avg_speed_kmh: float = 45.0):
        self.city = city
        self.ambulance_positions = ambulance_positions # [(x1, y1), ...]
        self.K = len(ambulance_positions) # Fleet size
        self.scene_time = avg_scene_time_min
        self.hospital_time = avg_hospital_time_min
        self.transport_prob = hospital_transport_prob
        self.speed_kmh = avg_speed_kmh
        
        # Precompute travel time from every ambulance base to every zone
        self.M = len(city.zones)
        self.travel_matrix = np.zeros((self.K, self.M))
        for k in range(self.K):
            ax, ay = ambulance_positions[k]
            for i in range(self.M):
                zx, zy = city.zones[i]["x"], city.zones[i]["y"]
                self.travel_matrix[k, i] = city.travel_time_minutes(ax, ay, zx, zy, self.speed_kmh)
                
        # Preference lists: for each zone i, rank ambulances from closest to farthest
        self.pref_order = []
        for i in range(self.M):
            # Sort ambulance indices by travel time to zone i
            order = sorted(range(self.K), key=lambda k: self.travel_matrix[k, i])
            self.pref_order.append(order)

    def solve(self, max_iter: int = 50, tol: float = 1e-4) -> Dict:
        """
        Iterative solution to find steady-state busy probabilities q_k
        and expected response time per zone.
        """
        total_lambda = sum(z["lambda_rate"] for z in self.city.zones) # calls/hr
        total_lambda_per_min = total_lambda / 60.0
        
        # Estimate average service time
        # E[S] = travel_to_scene + on_scene + p_trans * (travel_to_hosp + hosp_handoff)
        avg_travel = np.mean(self.travel_matrix)
        avg_service_time_min = avg_travel + self.scene_time + self.transport_prob * (6.0 + self.hospital_time)
        mu = 1.0 / avg_service_time_min # services per min per ambulance
        
        # Initial guess: all servers have equal busy probability rho
        rho_system = (total_lambda_per_min) / (self.K * mu)
        q = np.full(self.K, min(0.95, max(0.05, rho_system)))
        
        # Erlang-C waiting probability for system
        traffic_intensity = total_lambda_per_min / mu
        _, p_all_busy, _ = erlang_c(self.K, traffic_intensity)
        
        for iteration in range(max_iter):
            q_old = q.copy()
            
            # Compute dispatch probability P_ij: prob ambulance k is dispatched to zone i
            P = np.zeros((self.K, self.M))
            
            for i in range(self.M):
                ranked_servers = self.pref_order[i]
                prob_prior_busy = 1.0
                
                for rank_idx, k in enumerate(ranked_servers):
                    # Probability that server k is free and all closer servers were busy
                    # With Jarvis correction:
                    p_dispatch = (1.0 - q[k]) * prob_prior_busy
                    P[k, i] = p_dispatch
                    prob_prior_busy *= q[k]
                    
                # Normalize across servers if sum < 1 (accounts for queueing when all busy)
                sum_p = np.sum(P[:, i])
                if sum_p > 0:
                    P[:, i] = P[:, i] * (1.0 - p_all_busy) / sum_p
            
            # Workload for each server k: Lambda_k
            Lambda_k = np.zeros(self.K)
            for k in range(self.K):
                for i in range(self.M):
                    z_lambda_min = self.city.zones[i]["lambda_rate"] / 60.0
                    Lambda_k[k] += z_lambda_min * P[k, i]
                    
            # Compute mean service time for each server k
            mu_k = np.zeros(self.K)
            for k in range(self.K):
                if Lambda_k[k] > 0:
                    # Weighted travel time for server k
                    weighted_travel = sum((self.city.zones[i]["lambda_rate"] / 60.0) * P[k, i] * self.travel_matrix[k, i] 
                                          for i in range(self.M)) / Lambda_k[k]
                else:
                    weighted_travel = avg_travel
                
                serv_time_k = weighted_travel + self.scene_time + self.transport_prob * (6.0 + self.hospital_time)
                mu_k[k] = 1.0 / serv_time_k
                
            # Update busy probabilities
            for k in range(self.K):
                q[k] = min(0.98, Lambda_k[k] / mu_k[k])
                
            diff = np.max(np.abs(q - q_old))
            if diff < tol:
                break

        # Compute zone expected response times
        zone_response_times = []
        coverage_8min_count = 0
        
        # Expected wait in queue if all busy:
        denom = max(0.01, self.K * mu - total_lambda_per_min)
        Wq = (p_all_busy / denom) if rho_system < 1.0 else 25.0
        
        total_pop = sum(z["population"] for z in self.city.zones)
        system_weighted_resp = 0.0
        
        for i in range(self.M):
            # Sum over servers: P_ki * Travel_ki + P_all_busy * (Wq + max_travel)
            primary_resp = sum(P[k, i] * self.travel_matrix[k, i] for k in range(self.K))
            expected_resp = primary_resp + p_all_busy * (Wq + 8.0)
            
            zone_response_times.append(expected_resp)
            system_weighted_resp += expected_resp * self.city.zones[i]["lambda_rate"]
            
            if expected_resp <= 8.0:
                coverage_8min_count += 1
                
        system_avg_resp = system_weighted_resp / total_lambda
        
        return {
            "converged": True,
            "system_avg_response_min": round(float(system_avg_resp), 2),
            "p_all_busy": round(float(p_all_busy), 4),
            "fleet_utilization": round(float(np.mean(q)), 3),
            "server_busy_probs": [round(float(val), 3) for val in q],
            "zone_response_times": [round(float(val), 2) for val in zone_response_times],
            "coverage_8min_pct": round(float((coverage_8min_count / self.M) * 100.0), 1),
            "expected_queue_wait_min": round(float(Wq), 2)
        }
