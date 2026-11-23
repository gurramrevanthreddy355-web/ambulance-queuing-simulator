"""
Ambulance Base Placement Optimizer.
Compares:
1. Naive Placement (greedy top-demand cluster placement).
2. Queuing-Theoretic Placement (MEXCLP + Jarvis Hypercube expected response time minimization).
"""

from typing import List, Tuple
import numpy as np
from queuing_theory import CityModel, JarvisHypercubeModel, erlang_c

def get_naive_placement(city: CityModel, fleet_size: int) -> List[Tuple[float, float]]:
    """
    Naive strategy: Place ambulances at the zones with highest raw call demand.
    When multiple ambulances are added, it stacks them in the highest density areas,
    ignoring suburban queuing cascades.
    """
    sorted_zones = sorted(city.zones, key=lambda z: z["lambda_rate"], reverse=True)
    positions = []
    for k in range(fleet_size):
        # Pick top zones cycling if fleet > zones
        z = sorted_zones[k % len(sorted_zones)]
        # Add slight jitter if multiple units at same zone
        jitter_x = (k // len(sorted_zones)) * 0.2
        jitter_y = (k // len(sorted_zones)) * 0.2
        positions.append((round(z["x"] + jitter_x, 2), round(z["y"] + jitter_y, 2)))
    return positions

def get_queuing_placement(city: CityModel, fleet_size: int) -> List[Tuple[float, float]]:
    """
    Queuing-Theoretic Strategy (MEXCLP-inspired spatial dispatch optimization):
    Accounts for ambulance busy fraction p. Rather than bunching ambulances all
    in downtown (where one unit becomes busy and the backup is already redundant),
    this strategy creates an outer coverage ring with strategic suburban outposts
    that absorb demand overflow and prevent severe tail-latency (P90) spikes.
    """
    total_lambda = sum(z["lambda_rate"] for z in city.zones)
    # Estimate system busy probability
    avg_service_hr = 0.75 # 45 minutes
    system_load = (total_lambda * avg_service_hr) / fleet_size
    busy_prob = min(0.85, max(0.15, system_load))
    
    # Candidate base coordinates (all zone centers)
    candidates = [(z["x"], z["y"]) for z in city.zones]
    
    # Greedy marginal coverage with backup discounting:
    # Marginal benefit of placing k-th unit covering zone i is lambda_i * (1 - p) * p^(k-1)
    selected_bases = []
    coverage_counts = [0] * len(city.zones)
    
    # Target response time threshold (8 min ~ 5.25 km at 45km/h)
    radius_km = 4.5
    
    for amb_idx in range(fleet_size):
        best_cand = None
        best_marginal_gain = -1.0
        
        for cand in candidates:
            gain = 0.0
            cx, cy = cand
            for i, z in enumerate(city.zones):
                dist = abs(cx - z["x"]) + abs(cy - z["y"])
                if dist <= radius_km:
                    k_curr = coverage_counts[i]
                    # Marginal contribution accounting for busy probability p
                    marginal_p = (1.0 - busy_prob) * (busy_prob ** k_curr)
                    gain += z["lambda_rate"] * marginal_p
            
            # Penalize candidate being too close to already selected bases to enforce dispersion
            for sb in selected_bases:
                sb_dist = abs(cx - sb[0]) + abs(cy - sb[1])
                if sb_dist < 2.0:
                    gain *= 0.75
                    
            if gain > best_marginal_gain:
                best_marginal_gain = gain
                best_cand = cand
                
        selected_bases.append(best_cand)
        # Update coverage counts
        for i, z in enumerate(city.zones):
            dist = abs(best_cand[0] - z["x"]) + abs(best_cand[1] - z["y"])
            if dist <= radius_km:
                coverage_counts[i] += 1
                
    return selected_bases

if __name__ == "__main__":
    city = CityModel(grid_size=5)
    fleet = 6
    naive_bases = get_naive_placement(city, fleet)
    queuing_bases = get_queuing_placement(city, fleet)
    
    print(f"--- Evaluating {fleet} Ambulances ---")
    naive_eval = JarvisHypercubeModel(city, naive_bases).solve()
    print("Naive Placement:", naive_eval["system_avg_response_min"], "min | 8-min coverage:", naive_eval["coverage_8min_pct"], "%")
    
    queuing_eval = JarvisHypercubeModel(city, queuing_bases).solve()
    print("Queuing-Theoretic Placement:", queuing_eval["system_avg_response_min"], "min | 8-min coverage:", queuing_eval["coverage_8min_pct"], "%")
