# EMS Queuing Optimizer | Ambulance Placement Simulator

> **Operations Research & Queuing Theory to Position Ambulances for Minimum System-Wide Response Time**

This project demonstrates how queuing theory (specifically **Larson’s Hypercube Queueing Model**, **Jarvis’s Hypercube Approximation**, and **Daskin’s Maximum Expected Covering Location Problem / MEXCLP**) solves the critical flaw of naive emergency vehicle placement: **the nearest-station trap**.

---

## The Core Problem: The Nearest-Station Trap

Standard facility location algorithms assume that when a 911/108 call occurs, the physically closest ambulance responds. 

**Why that fails in reality:**
In active urban EMS systems, ambulance utilization is typically 55%–75%. If ambulances are clustered purely at the downtown demand peak:
1. A sudden surge in downtown calls saturates all central units.
2. Subsequent central emergencies pull backup ambulances from distant suburbs.
3. This creates a **domino saturation effect**, leaving outer districts unprotected and driving 90th percentile response times ($T_{90}$) past 20+ minutes.

### The Queuing Theory Solution
By calculating individual server busy probabilities $q_k$ and evaluating marginal backup coverage $\Delta C(k) = (1 - p) p^{k-1}$, queuing theory positions secondary and tertiary ambulances along outer arterial perimeters to act as shock absorbers, protecting tail latency under congestion.

---

## Project Structure

```
ambulance-queuing-simulator/
├── frontend/                     # Interactive React + Vite + Tailwind Web Application
│   ├── src/
│   │   ├── algorithms/
│   │   │   ├── queuingTheory.ts  # Erlang-C, Jarvis Hypercube, MEXCLP
│   │   │   └── simulationEngine.ts # 60-FPS Discrete-event simulation
│   │   ├── components/
│   │   │   ├── CityMap.tsx       # Live 12x12 km canvas dispatch map & heatmaps
│   │   │   ├── MetricCards.tsx   # Average, P90, Erlang-C queue wait, compliance
│   │   │   ├── ComparisonPanel.tsx # Side-by-side strategy benchmark
│   │   │   └── QueuingExplainerModal.tsx # LaTeX & theoretical derivation
│   │   ├── App.tsx               # Main Dashboard & Controls
│   │   └── types.ts
│   └── package.json
│
├── backend/                      # Python Analytical & Simulation Engine
│   ├── queuing_theory.py         # Erlang-C & Jarvis Hypercube solver (NumPy/SciPy)
│   ├── simulation.py             # SimPy stochastic discrete-event simulator
│   └── optimizer.py              # MEXCLP vs Naive placement benchmarking
│
└── README.md
```

---

## Mathematical Formulations

### 1. Erlang-C Congestion Model ($M/M/c$)
Given total arrival rate $\Lambda = \sum \lambda_i$ and service rate $\mu = 1 / \bar{T}_{\text{service}}$:
$$\rho = \frac{\Lambda}{c \cdot \mu}$$
$$P(W > 0) = C(c, a) = \frac{\frac{a^c}{c!(1 - \rho)}}{\sum_{k=0}^{c-1} \frac{a^k}{k!} + \frac{a^c}{c!(1 - \rho)}}$$
$$W_q = \frac{C(c, a)}{c\mu - \Lambda}$$

### 2. Jarvis’s Hypercube Approximation Algorithm
Calculates the steady-state probability $P_{ij}$ that ambulance $j$ is dispatched to demand zone $i$:
$$P_{ij} \approx (1 - q_j) \prod_{k \in \text{Closer}(i, j)} q_k$$
Zone-by-zone expected response time:
$$\mathbb{E}[R_i] = \sum_{j=1}^c P_{ij} \cdot T_{ji} + P(\text{All Busy}) \cdot \left( W_q + \bar{T}_{\text{delayed}} \right)$$

### 3. MEXCLP Marginal Coverage Gain
$$\Delta \text{Coverage}_i(k) = (1 - p) \cdot p^{k-1}$$

---

## Getting Started

### 1. Launching the Interactive Website
From the `frontend` folder:
```bash
cd frontend
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Running the Python SimPy Benchmarks
From the root folder using the virtual environment:
```bash
cd backend
python optimizer.py
```
To run the SimPy 72-hour stochastic event simulation:
```bash
python -c "from queuing_theory import CityModel; from optimizer import get_queuing_placement; from simulation import AmbulanceSimulation; c = CityModel(); b = get_queuing_placement(c, 6); print(AmbulanceSimulation(c, b, sim_hours=72).run())"
```
