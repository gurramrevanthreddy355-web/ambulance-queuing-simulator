"""
Streamlit Application: EMS Queuing Theory & Ambulance Placement Optimizer
Deployable directly to Streamlit Community Cloud (share.streamlit.io).
"""

import sys
import os
import math

# Add backend directory to module search path
backend_dir = os.path.join(os.path.dirname(__file__), "backend")
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

import streamlit as st
import numpy as np
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px

from queuing_theory import CityModel, JarvisHypercubeModel, erlang_c
from optimizer import get_queuing_placement, get_naive_placement
from simulation import AmbulanceSimulation

# Page configuration
st.set_page_config(
    page_title="EMS Queuing Optimizer | Ambulance Placement Simulator",
    page_icon="🚑",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for dark theme aesthetic
st.markdown("""
<style>
    .metric-card {
        background-color: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 10px;
        padding: 16px;
        margin-bottom: 10px;
    }
    .metric-value {
        font-size: 26px;
        font-weight: 700;
        font-family: monospace;
    }
    .metric-label {
        font-size: 12px;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
</style>
""", unsafe_allow_html=True)

# App Header
st.title("🚑 EMS Queuing Optimizer & Ambulance Placement Simulator")
st.caption("Operations Research & Queuing Theory to Position Ambulances for Minimum System-Wide Response Time")

# Sidebar Controls
st.sidebar.header("⚙️ Fleet & Queuing Parameters")

fleet_size = st.sidebar.slider("Fleet Size (c ambulances):", min_value=3, max_value=12, value=6, step=1)
demand_multiplier = st.sidebar.slider("Emergency Demand Multiplier (λ):", min_value=0.5, max_value=2.0, value=1.0, step=0.1,
                                     help="1.0x = Normal operations; 0.5x = Night shift; 1.8x = Peak rush-hour emergency surge.")
scene_time_min = st.sidebar.slider("Avg On-Scene Triage Time (min):", min_value=10, max_value=30, value=18, step=1)
hospital_transport_prob = st.sidebar.slider("Hospital Transport Probability:", min_value=0.3, max_value=0.9, value=0.6, step=0.05)
speed_kmh = st.sidebar.slider("Average Response Speed (km/h):", min_value=30, max_value=60, value=45, step=5)

st.sidebar.markdown("---")
strategy_option = st.sidebar.selectbox(
    "Ambulance Positioning Strategy:",
    ["Queuing-Theoretic (MEXCLP + Hypercube)", "Naive (Demand Clustering)"]
)

# Initialize City Model
city = CityModel(grid_size=5, scale_km=12.0)
for z in city.zones:
    z["lambda_rate"] = round(z["lambda_rate"] * demand_multiplier, 3)

# Calculate Placements
queuing_bases = get_queuing_placement(city, fleet_size)
naive_bases = get_naive_placement(city, fleet_size)

chosen_bases = queuing_bases if "Queuing" in strategy_option else naive_bases

# Solve Jarvis Hypercube Models
queuing_eval = JarvisHypercubeModel(
    city, queuing_bases,
    avg_scene_time_min=scene_time_min,
    hospital_transport_prob=hospital_transport_prob,
    avg_speed_kmh=speed_kmh
).solve()

naive_eval = JarvisHypercubeModel(
    city, naive_bases,
    avg_scene_time_min=scene_time_min,
    hospital_transport_prob=hospital_transport_prob,
    avg_speed_kmh=speed_kmh
).solve()

active_eval = queuing_eval if "Queuing" in strategy_option else naive_eval

# Key Metrics Row
col1, col2, col3, col4, col5 = st.columns(5)

with col1:
    st.metric(
        label="Avg Response Time",
        value=f"{active_eval['system_avg_response_min']} min",
        delta=f"-{round(naive_eval['system_avg_response_min'] - queuing_eval['system_avg_response_min'], 2)} min (queuing gain)" if "Queuing" in strategy_option else None,
        delta_color="inverse"
    )

with col2:
    st.metric(
        label="Queue Probability P(All Busy)",
        value=f"{round(active_eval['p_all_busy'] * 100, 1)}%",
        delta=f"-{round((naive_eval['p_all_busy'] - queuing_eval['p_all_busy']) * 100, 1)}%" if "Queuing" in strategy_option else None,
        delta_color="inverse"
    )

with col3:
    st.metric(
        label="8-Min NFPA Coverage",
        value=f"{active_eval['coverage_8min_pct']}%",
        delta=f"+{round(queuing_eval['coverage_8min_pct'] - naive_eval['coverage_8min_pct'], 1)}%" if "Queuing" in strategy_option else None
    )

with col4:
    st.metric(
        label="Fleet Utilization (ρ)",
        value=f"{round(active_eval['fleet_utilization'] * 100, 1)}%",
        help="System-wide server busy fraction"
    )

with col5:
    st.metric(
        label="Expected Queue Delay",
        value=f"{active_eval['expected_queue_wait_min']} min",
        help="Estimated wait in queue when all ambulances are busy"
    )

st.markdown("---")

# Main Content: Map & Comparison
tab1, tab2, tab3 = st.tabs(["🗺️ Spatial Dispatch Map", "📊 Strategy Comparison Benchmark", "🎲 SimPy Stochastic Simulator"])

with tab1:
    st.subheader(f"City Spatial Demand & Ambulance Stations ({strategy_option})")
    
    # Build Plotly spatial map
    fig = go.Figure()
    
    # 1. Demand Zones Heatmap / Scatter
    zone_df = pd.DataFrame(city.zones)
    fig.add_trace(go.Scatter(
        x=zone_df["x"],
        y=zone_df["y"],
        mode="markers+text",
        marker=dict(
            size=zone_df["lambda_rate"] * 65 + 10,
            color=zone_df["lambda_rate"],
            colorscale="Reds",
            showscale=True,
            colorbar=dict(title="Calls/hr (λ)"),
            opacity=0.7,
            line=dict(width=1, color="rgba(255,255,255,0.4)")
        ),
        text=zone_df["name"],
        textposition="top center",
        name="Demand Zones"
    ))
    
    # 2. Coverage Circles (8-minute threshold ~ 4.2 km)
    theta = np.linspace(0, 2*np.pi, 50)
    radius_km = 4.2
    for idx, (bx, by) in enumerate(chosen_bases):
        circle_x = bx + radius_km * np.cos(theta)
        circle_y = by + radius_km * np.sin(theta)
        fig.add_trace(go.Scatter(
            x=circle_x,
            y=circle_y,
            mode="lines",
            line=dict(color="rgba(14, 165, 233, 0.4)", dash="dot", width=1.5),
            showlegend=(idx == 0),
            name="8-min Coverage Radius (4.2km)"
        ))
    
    # 3. Ambulance Stations
    base_x = [b[0] for b in chosen_bases]
    base_y = [b[1] for b in chosen_bases]
    base_labels = [f"Base S{i+1}" for i in range(len(chosen_bases))]
    fig.add_trace(go.Scatter(
        x=base_x,
        y=base_y,
        mode="markers+text",
        marker=dict(size=14, color="#0284c7", symbol="square", line=dict(width=2, color="#ffffff")),
        text=base_labels,
        textposition="bottom center",
        name="Ambulance Bases"
    ))
    
    # 4. Hospital Trauma Centers
    hosp_df = pd.DataFrame(city.hospitals)
    fig.add_trace(go.Scatter(
        x=hosp_df["x"],
        y=hosp_df["y"],
        mode="markers+text",
        marker=dict(size=16, color="#ef4444", symbol="cross", line=dict(width=2, color="#ffffff")),
        text=hosp_df["name"],
        textposition="top center",
        name="Hospital Trauma Centers"
    ))
    
    fig.update_layout(
        height=580,
        template="plotly_dark",
        xaxis=dict(title="East-West Distance (km)", range=[-7, 7], zeroline=False),
        yaxis=dict(title="North-South Distance (km)", range=[-7, 7], zeroline=False),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
    )
    
    st.plotly_chart(fig, use_container_width=True)

with tab2:
    st.subheader("Strategy Benchmark: Queuing Theory vs. Naive Demand Clustering")
    
    comp_df = pd.DataFrame({
        "Metric": [
            "Expected Response Time (min)",
            "Queue Delay Probability P(Wait > 0)",
            "8-Minute Compliance Rate",
            "Expected Queue Delay (min)",
            "System Fleet Utilization"
        ],
        "Queuing-Theoretic Placement": [
            f"{queuing_eval['system_avg_response_min']} min",
            f"{round(queuing_eval['p_all_busy'] * 100, 1)}%",
            f"{queuing_eval['coverage_8min_pct']}%",
            f"{queuing_eval['expected_queue_wait_min']} min",
            f"{round(queuing_eval['fleet_utilization'] * 100, 1)}%"
        ],
        "Naive Demand Placement": [
            f"{naive_eval['system_avg_response_min']} min",
            f"{round(naive_eval['p_all_busy'] * 100, 1)}%",
            f"{naive_eval['coverage_8min_pct']}%",
            f"{naive_eval['expected_queue_wait_min']} min",
            f"{round(naive_eval['fleet_utilization'] * 100, 1)}%"
        ]
    })
    
    st.table(comp_df)
    
    st.info("""
    💡 **Why Queuing Theory Beats Naive Placement:**
    Naive placement packs units directly in the downtown core because that's where raw call frequency is highest. 
    However, when downtown units become busy (50–70% probability during peaks), calls spill over to outer units.
    Queuing theory (MEXCLP + Larson Hypercube) creates a perimeter buffer ring that absorbs suburban calls and prevents central cascading delays.
    """)

with tab3:
    st.subheader("SimPy Stochastic Event Simulator")
    st.markdown("Run a 48-hour continuous discrete-event simulation to observe real-world call arrival queues and ambulance state transitions.")
    
    sim_hours = st.slider("Simulation Duration (Hours):", min_value=12, max_value=72, value=48, step=12)
    
    if st.button("🚀 Run SimPy Simulation", type="primary"):
        with st.spinner("Simulating emergency calls, travel times, on-scene care, and hospital transfers..."):
            sim = AmbulanceSimulation(
                city, chosen_bases,
                sim_hours=float(sim_hours),
                avg_scene_time_min=scene_time_min,
                hospital_transport_prob=hospital_transport_prob,
                speed_kmh=speed_kmh
            )
            results = sim.run()
            
            st.success(f"Simulation completed! Processed {results['total_calls']} emergency calls over {results['sim_hours']} hours.")
            
            s1, s2, s3, s4 = st.columns(4)
            s1.metric("Simulated Avg Response", f"{results['avg_response_time_min']} min")
            s2.metric("90th Percentile (P90)", f"{results['p90_response_time_min']} min")
            s3.metric("8-Min NFPA Compliance", f"{results['compliance_8min_pct']}%")
            s4.metric("Calls Delayed in Queue", f"{results['calls_delayed_pct']}%")
            
            # Response time histogram
            if sim.response_times:
                resp_df = pd.DataFrame({"Response Time (min)": sim.response_times})
                hist_fig = px.histogram(
                    resp_df, x="Response Time (min)", nbins=25,
                    title="Distribution of Emergency Response Times",
                    template="plotly_dark",
                    color_discrete_sequence=["#38bdf8"]
                )
                hist_fig.add_vline(x=8.0, line_dash="dash", line_color="#10b981", annotation_text="8-min NFPA Goal")
                st.plotly_chart(hist_fig, use_container_width=True)

# Queuing Theory Derivation Expander
with st.expander("📚 Theoretical Derivation & Mathematical Models"):
    st.markdown("""
    ### 1. Erlang-C Congestion Formula ($M/M/c$)
    Offered load $a = \\Lambda / \\mu$, utilization $\\rho = a / c$:
    $$P(W > 0) = C(c, a) = \\frac{\\frac{a^c}{c!(1 - \\rho)}}{\\sum_{k=0}^{c-1} \\frac{a^k}{k!} + \\frac{a^c}{c!(1 - \\rho)}}$$
    $$W_q = \\frac{C(c, a)}{c\\mu - \\Lambda}$$

    ### 2. Jarvis's Hypercube Approximation Algorithm
    Estimates the steady-state probability $P_{ij}$ that unit $j$ handles a call from zone $i$:
    $$P_{ij} \\approx (1 - q_j) \\prod_{k \\in \\text{Closer}(i,j)} q_k$$
    Expected response time to zone $i$:
    $$\\mathbb{E}[R_i] = \\sum_{j=1}^c P_{ij} \\cdot T_{ji} + P(\\text{All Busy}) \\cdot (W_q + \\bar{T}_{\\text{delayed}})$$

    ### 3. MEXCLP Marginal Coverage Gain
    $$\\Delta \\text{Coverage}_i(k) = (1 - p) \\cdot p^{k-1}$$
    """)
