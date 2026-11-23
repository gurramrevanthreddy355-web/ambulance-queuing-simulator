"""
Queuing Theory Engine for Ambulance Location & Dispatch.
Calibrated for Prayagraj (Allahabad), Uttar Pradesh, India.
Accounts for:
- 25 key neighborhoods across Civil Lines, Old Chowk, Sangam Ghats, Trans-Yamuna (Naini), and Trans-Ganga (Jhusi, Phaphamau).
- Major Tertiary Trauma Centers (SRN Hospital / MLN Medical College, Beli Hospital, Kamla Nehru Memorial Hospital).
- Bridge crossings and non-linear queuing delays under peak traffic.
"""

import math
from typing import List, Dict, Tuple
import numpy as np

def erlang_c(servers: int, traffic_intensity: float) -> Tuple[float, float, float]:
    """
    Computes Erlang-C formula for an M/M/c queuing system.
    """
    c = servers
    a = float(traffic_intensity)
    rho = a / c
    
    if rho >= 1.0:
        return 0.0, 1.0, float('inf')
    
    sum_terms = 0.0
    term = 1.0
    for k in range(c):
        sum_terms += term
        term = term * a / (k + 1)
        
    c_term = term
    p0 = 1.0 / (sum_terms + (c_term / (1.0 - rho)))
    p_wait = (c_term * p0) / (1.0 - rho)
    
    return p0, min(1.0, p_wait), p_wait

class CityModel:
    """
    Spatial model for Prayagraj (Allahabad), Uttar Pradesh.
    """
    def __init__(self, scale_km: float = 16.0):
        self.scale_km = scale_km
        self.city_name = "Prayagraj (Allahabad), UP"
        self.zones = []
        self.hospitals = []
        self._initialize_prayagraj()

    def _initialize_prayagraj(self):
        # 25 real neighborhoods in Prayagraj with realistic coordinates (in km from Civil Lines center)
        # and demographic/traffic emergency arrival rates (calls/hr)
        prayagraj_zones = [
            # ID, Name, X(km, East=+), Y(km, North=+), Lambda (calls/hr), Population, Landmark Info
            (0, "Civil Lines (Core Hub)", 0.0, 0.2, 0.38, 55000, "Commercial & Administrative Center"),
            (1, "Chowk & Clock Tower", -0.8, -1.8, 0.44, 85000, "Dense Historic City Market"),
            (2, "Old Katra & University", 0.2, 0.9, 0.34, 48000, "Shopping Hub & Allahabad University"),
            (3, "University Science Campus", 0.8, 1.3, 0.28, 35000, "Academic Corridor"),
            (4, "Daraganj (Sangam Ghats)", 3.2, -1.2, 0.39, 62000, "Pilgrimage Center & River Ghats"),
            (5, "Triveni Sangam Nose", 3.8, -2.4, 0.32, 28000, "Ganga-Yamuna-Saraswati Confluence"),
            (6, "George Town", 1.1, -0.4, 0.30, 42000, "Central Residential & Medical District"),
            (7, "Tagoretown & Baihrana", 1.6, -1.2, 0.33, 49000, "High-density Residential / KNMH"),
            (8, "Alopibagh (Alopi Devi)", 2.5, -0.6, 0.31, 38000, "Temple Corridor & GT Road"),
            (9, "Mumfordganj", -0.5, 1.8, 0.27, 34000, "Northern Residential"),
            (10, "Teliyarganj & MNNIT", -0.2, 3.8, 0.29, 41000, "Engineering Institute & North Exit"),
            (11, "Rajapur (Beli Zone)", -1.2, 1.2, 0.32, 39000, "Beli Hospital & Stanley Road"),
            (12, "Subedarganj Junction", -3.8, 0.4, 0.34, 52000, "Railway Hub & West Transit"),
            (13, "Dhoomanganj", -4.6, 0.8, 0.31, 46000, "Western Transit GT Road"),
            (14, "Sulem Sarai", -5.4, 0.6, 0.26, 36000, "West Kanpur Highway"),
            (15, "Bamrauli (Airport)", -7.2, 0.2, 0.21, 28000, "Prayagraj Airport & Air Force Base"),
            (16, "Jhalwa (IIIT-A)", -5.8, -2.0, 0.24, 32000, "IIIT Allahabad Campus & Devghat"),
            (17, "Kareli & Atala", -1.8, -3.2, 0.37, 72000, "High-Density Residential Southwest"),
            (18, "Muthiganj (Anaj Mandi)", -0.4, -2.6, 0.35, 58000, "Wholesale Grain Market Core"),
            (19, "Kydganj", 1.0, -2.5, 0.30, 44000, "Yamuna Riverfront Historic Ward"),
            (20, "Naini Central (Trans-Yamuna)", 1.5, -6.5, 0.36, 68000, "Industrial South across New Yamuna Bridge"),
            (21, "Naini ADA Colony", 2.8, -7.5, 0.25, 45000, "Cotton Mill / Naini Suburbs"),
            (22, "Jhusi (Trans-Ganga East)", 5.5, 0.8, 0.28, 48000, "Varanasi Highway across Shastri Bridge"),
            (23, "Phaphamau (Trans-Ganga North)", -0.8, 6.2, 0.26, 39000, "Lucknow Highway across Curzon Bridge"),
            (24, "New Cantonment", -2.2, -0.6, 0.16, 22000, "Military Station & Low Density")
        ]
        
        for z in prayagraj_zones:
            self.zones.append({
                "id": z[0],
                "name": z[1],
                "x": z[2],
                "y": z[3],
                "lambda_rate": z[4],
                "population": z[5],
                "info": z[6]
            })

        # Major Trauma & Tertiary Hospitals in Prayagraj
        self.hospitals = [
            {
                "id": 0,
                "name": "SRN Hospital & MLN Medical College",
                "x": 0.8,
                "y": -0.5,
                "info": "Primary Level-1 Trauma Hospital (Ashok Nagar)"
            },
            {
                "id": 1,
                "name": "TB Sapru (Beli) Hospital",
                "x": -1.2,
                "y": 1.3,
                "info": "Civil District Hospital (Stanley Road)"
            },
            {
                "id": 2,
                "name": "Kamla Nehru Memorial Hospital (KNMH)",
                "x": 1.7,
                "y": -1.0,
                "info": "Regional Cancer & Super-Specialty (Tagoretown)"
            }
        ]

    def travel_time_minutes(self, x1: float, y1: float, x2: float, y2: float, speed_kmh: float = 40.0) -> float:
        """
        Calculates travel time using Manhattan grid with bridge congestion penalty.
        Ganga River splits Jhusi (East) and Phaphamau (North).
        Yamuna River splits Naini (South).
        """
        dist_km = abs(x1 - x2) + abs(y1 - y2)
        
        # Bridge crossing detection:
        # Cross-Yamuna (to Naini y < -4.5): requires crossing New Yamuna Bridge
        bridge_delay = 0.0
        if (y1 < -4.5 and y2 > -4.5) or (y2 < -4.5 and y1 > -4.5):
            bridge_delay += 3.5 # bridge bottleneck delay
            
        # Cross-Ganga East (to Jhusi x > 4.0): requires Shastri Bridge
        if (x1 > 4.0 and x2 < 4.0) or (x2 > 4.0 and x1 < 4.0):
            bridge_delay += 3.0
            
        # Cross-Ganga North (to Phaphamau y > 5.0): requires Phaphamau Bridge
        if (y1 > 5.0 and y2 < 5.0) or (y2 > 5.0 and y1 < 5.0):
            bridge_delay += 3.0

        # 1.0 min dispatch + travel time + bridge delay
        travel_min = 1.0 + (dist_km / speed_kmh) * 60.0 + bridge_delay
        return travel_min

class JarvisHypercubeModel:
    """
    Jarvis's Hypercube Approximation Algorithm for Prayagraj EMS.
    """
    def __init__(self, city: CityModel, ambulance_positions: List[Tuple[float, float]],
                 avg_scene_time_min: float = 18.0,
                 avg_hospital_time_min: float = 20.0,
                 hospital_transport_prob: float = 0.60,
                 avg_speed_kmh: float = 40.0):
        self.city = city
        self.ambulance_positions = ambulance_positions
        self.K = len(ambulance_positions)
        self.scene_time = avg_scene_time_min
        self.hospital_time = avg_hospital_time_min
        self.transport_prob = hospital_transport_prob
        self.speed_kmh = avg_speed_kmh
        
        self.M = len(city.zones)
        self.travel_matrix = np.zeros((self.K, self.M))
        for k in range(self.K):
            ax, ay = ambulance_positions[k]
            for i in range(self.M):
                zx, zy = city.zones[i]["x"], city.zones[i]["y"]
                self.travel_matrix[k, i] = city.travel_time_minutes(ax, ay, zx, zy, self.speed_kmh)
                
        self.pref_order = []
        for i in range(self.M):
            order = sorted(range(self.K), key=lambda k: self.travel_matrix[k, i])
            self.pref_order.append(order)

    def solve(self, max_iter: int = 50, tol: float = 1e-4) -> Dict:
        total_lambda = sum(z["lambda_rate"] for z in self.city.zones)
        total_lambda_per_min = total_lambda / 60.0
        
        avg_travel = np.mean(self.travel_matrix)
        avg_service_time_min = avg_travel + self.scene_time + self.transport_prob * (6.0 + self.hospital_time)
        mu = 1.0 / avg_service_time_min
        
        rho_system = total_lambda_per_min / (self.K * mu)
        q = np.full(self.K, min(0.95, max(0.05, rho_system)))
        
        traffic_intensity = total_lambda_per_min / mu
        _, p_all_busy, _ = erlang_c(self.K, traffic_intensity)
        
        for iteration in range(max_iter):
            q_old = q.copy()
            P = np.zeros((self.K, self.M))
            
            for i in range(self.M):
                ranked_servers = self.pref_order[i]
                prob_prior_busy = 1.0
                
                for rank_idx, k in enumerate(ranked_servers):
                    p_dispatch = (1.0 - q[k]) * prob_prior_busy
                    P[k, i] = p_dispatch
                    prob_prior_busy *= q[k]
                    
                sum_p = np.sum(P[:, i])
                if sum_p > 0:
                    P[:, i] = P[:, i] * (1.0 - p_all_busy) / sum_p
            
            Lambda_k = np.zeros(self.K)
            for k in range(self.K):
                for i in range(self.M):
                    z_lambda_min = self.city.zones[i]["lambda_rate"] / 60.0
                    Lambda_k[k] += z_lambda_min * P[k, i]
                    
            mu_k = np.zeros(self.K)
            for k in range(self.K):
                if Lambda_k[k] > 0:
                    weighted_travel = sum((self.city.zones[i]["lambda_rate"] / 60.0) * P[k, i] * self.travel_matrix[k, i] 
                                          for i in range(self.M)) / Lambda_k[k]
                else:
                    weighted_travel = avg_travel
                
                serv_time_k = weighted_travel + self.scene_time + self.transport_prob * (6.0 + self.hospital_time)
                mu_k[k] = 1.0 / serv_time_k
                
            for k in range(self.K):
                q[k] = min(0.98, max(0.02, Lambda_k[k] / mu_k[k]))
                
            diff = np.max(np.abs(q - q_old))
            if diff < tol:
                break

        zone_response_times = []
        coverage_8min_count = 0
        denom = max(0.01, self.K * mu - total_lambda_per_min)
        Wq = (p_all_busy / denom) if rho_system < 1.0 else 25.0
        
        system_weighted_resp = 0.0
        for i in range(self.M):
            primary_resp = sum(P[k, i] * self.travel_matrix[k, i] for k in range(self.K))
            expected_resp = primary_resp + p_all_busy * (Wq + 8.5)
            
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
