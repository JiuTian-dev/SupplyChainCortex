/**
 * Cascade Risk — SEIRS Epidemic Dynamics Model
 *
 * SEIRS hybrid propagation: combines BFS initial conditions with
 * epidemic-style S→E→I→R→S dynamics over time.
 *
 * The SEIRS extension adds the R→S (waning immunity) cycle, modeling:
 * - Chronic supply chain vulnerability: recovered nodes can become susceptible again
 * - Recurring disruptions: ports that recovered from a strike face renewed risk
 * - Endemic equilibrium: supply chains with R₀ > 1 may never fully recover
 *
 * Extracted from cascade-risk.propagation.ts for modularity.
 */
import type {
  CascadeNode, CascadeEdge, PropagationStep,
  SEIRSConfig, SEIRSState, SEIRSNodeState, SEIRSTimeline,
} from '../../cascade-risk.types';

// ═══════════════════════════════════════════════════════════════════════════════
// SEIRS Hybrid Propagation — Epidemic-style contagion dynamics with R→S cycle
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_SEIRS_CONFIG: SEIRSConfig = {
  beta: 0.30,       // transmission rate
  sigma: 0.50,      // incubation rate (E→I)
  gamma: 0.10,      // recovery rate (I→R)
  xi: 0.05,         // waning immunity rate (R→S) — SEIRS extension
  timeSteps: 30,    // simulate 30 days
  exposureThreshold: 15,    // S→E when risk > 15
  infectiousThreshold: 35,  // E→I when risk > 35
  recoveryThreshold: 5,     // I→R when risk < 5
  resusceptibilityThreshold: 8, // R→S when risk > 8 (chronic vulnerability)
};

/**
 * Compute the basic reproduction number R₀ for the SEIRS model.
 *
 * R₀ = (β / γ) × (σ / (σ + ξ))
 *
 * For SEIRS with waning immunity:
 *   - If R₀ > 1: epidemic spreads
 *   - If R₀ < 1: epidemic dies out
 *   - If R₀ ≈ 1: endemic equilibrium (chronic vulnerability)
 */
export function computeR0(config: { beta: number; sigma: number; gamma: number; xi: number }): number {
  const { beta, sigma, gamma, xi } = config;
  if (gamma === 0) return Infinity;
  return (beta / gamma) * (sigma / (sigma + xi));
}

/**
 * Compute the effective reproduction number Rₜ at a given time step.
 * Rₜ = R₀ × (S_t / N) where S_t is the susceptible fraction.
 */
export function computeRt(R0: number, susceptibleCount: number, totalPopulation: number): number {
  if (totalPopulation === 0) return 0;
  return R0 * (susceptibleCount / totalPopulation);
}

/**
 * SEIRS hybrid propagation: combines BFS initial conditions with
 * epidemic-style S→E→I→R→S dynamics over time.
 *
 * The SEIRS extension adds the R→S (waning immunity) cycle, modeling:
 * - Chronic supply chain vulnerability: recovered nodes can become susceptible again
 * - Recurring disruptions: ports that recovered from a strike face renewed risk
 * - Endemic equilibrium: supply chains with R₀ > 1 may never fully recover
 *
 * The BFS propagation result is used as day-0 initial conditions.
 * SEIRS dynamics then evolve the system forward.
 */
export function propagateSEIRS(
  nodes: Map<string, CascadeNode>,
  edges: CascadeEdge[],
  bfsResult: PropagationStep[],
  config: Partial<SEIRSConfig> = {},
): SEIRSTimeline {
  const cfg = { ...DEFAULT_SEIRS_CONFIG, ...config };

  // Build adjacency (both directions for undirected contagion)
  const adjacency = new Map<string, Array<{ neighbor: string; attenuation: number }>>();
  for (const e of edges) {
    const forwardList = adjacency.get(e.from) || [];
    forwardList.push({ neighbor: e.to, attenuation: e.attenuation });
    adjacency.set(e.from, forwardList);
    // Reverse edge for contagion spread
    const reverseList = adjacency.get(e.to) || [];
    reverseList.push({ neighbor: e.from, attenuation: e.attenuation * 0.5 });
    adjacency.set(e.to, reverseList);
  }

  // Initialize SEIRS states from BFS result
  const states = new Map<string, SEIRSNodeState>();
  for (const [nodeId, node] of nodes) {
    const bfsStep = bfsResult.find(p => p.nodeId === nodeId);
    const initialRisk = bfsStep?.riskScore ?? 0;

    let state: SEIRSState = 'susceptible';
    if (initialRisk >= cfg.infectiousThreshold) state = 'infectious';
    else if (initialRisk >= cfg.exposureThreshold) state = 'exposed';

    states.set(nodeId, {
      nodeId, label: node.label, type: node.type,
      state, risk: initialRisk,
      transitionDay: 0,
      riskHistory: [initialRisk],
      reinfectionCount: 0,
    });
  }

  // Compute R₀
  const R0 = computeR0(cfg);

  // Track aggregate metrics
  const days: SEIRSTimeline['days'] = [];
  let peakInfectious = 0;
  let peakDay = 0;
  let totalReinfections = 0;

  const today = new Date();

  for (let day = 1; day <= cfg.timeSteps; day++) {
    const date = new Date(today);
    date.setDate(date.getDate() + day);

    // Snapshot current states for atomic update
    const prevStates = new Map<string, SEIRSNodeState>();
    for (const [id, s] of states) prevStates.set(id, { ...s, riskHistory: [...s.riskHistory] });

    for (const [nodeId, nodeState] of states) {
      const prev = prevStates.get(nodeId)!;
      const neighbors = adjacency.get(nodeId) || [];

      switch (prev.state) {
        case 'susceptible': {
          // S→E: receive risk from infectious neighbors
          let incomingRisk = 0;
          for (const { neighbor, attenuation } of neighbors) {
            const nPrev = prevStates.get(neighbor);
            if (nPrev && nPrev.state === 'infectious') {
              incomingRisk += nPrev.risk * cfg.beta * attenuation;
            }
          }
          const newRisk = Math.min(incomingRisk, 100);
          nodeState.risk = newRisk;
          nodeState.riskHistory.push(newRisk);
          if (newRisk >= cfg.exposureThreshold) {
            nodeState.state = 'exposed';
            nodeState.transitionDay = day;
          }
          break;
        }

        case 'exposed': {
          // E→I: risk accumulates, transition when above infectious threshold
          let incomingRisk = 0;
          for (const { neighbor, attenuation } of neighbors) {
            const nPrev = prevStates.get(neighbor);
            if (nPrev && (nPrev.state === 'infectious' || nPrev.state === 'exposed')) {
              incomingRisk += nPrev.risk * cfg.beta * attenuation * 0.5;
            }
          }
          const newRisk = Math.min(prev.risk + incomingRisk * cfg.sigma, 100);
          nodeState.risk = newRisk;
          nodeState.riskHistory.push(newRisk);
          if (newRisk >= cfg.infectiousThreshold) {
            nodeState.state = 'infectious';
            nodeState.transitionDay = day;
          }
          break;
        }

        case 'infectious': {
          // I→R: recovery (risk decays naturally, faster if alternatives exist)
          const altPaths = neighbors.filter(({ neighbor }) => {
            const n = prevStates.get(neighbor);
            return n && n.state === 'susceptible' && n.risk < 10;
          }).length;
          const recoveryBoost = 1 + altPaths * 0.15;
          const decay = prev.risk * cfg.gamma * recoveryBoost;
          const newRisk = Math.max(prev.risk - decay, 0);
          nodeState.risk = newRisk;
          nodeState.riskHistory.push(newRisk);

          if (newRisk < cfg.recoveryThreshold) {
            nodeState.state = 'recovered';
            nodeState.transitionDay = day;
          }
          break;
        }

        case 'recovered': {
          // R→S: waning immunity (SEIRS extension)
          // Recovered nodes gradually lose immunity and become susceptible again
          // if they face renewed risk pressure from neighbors
          let renewedRisk = 0;
          for (const { neighbor, attenuation } of neighbors) {
            const nPrev = prevStates.get(neighbor);
            if (nPrev && nPrev.state === 'infectious') {
              renewedRisk += nPrev.risk * cfg.xi * attenuation;
            }
          }

          const residualRisk = prev.risk * 0.9; // Natural decay
          const totalRisk = Math.min(residualRisk + renewedRisk, 100);
          nodeState.risk = totalRisk;
          nodeState.riskHistory.push(totalRisk);

          // R→S transition: if risk exceeds resusceptibility threshold
          if (totalRisk >= cfg.resusceptibilityThreshold) {
            nodeState.state = 'susceptible';
            nodeState.transitionDay = day;
            nodeState.reinfectionCount++;
            totalReinfections++;
          }
          break;
        }
      }
    }

    // Count states
    let s = 0, e = 0, i = 0, r = 0, maxRisk = 0;
    for (const [, ns] of states) {
      if (ns.state === 'susceptible') s++;
      else if (ns.state === 'exposed') e++;
      else if (ns.state === 'infectious') i++;
      else r++;
      maxRisk = Math.max(maxRisk, ns.risk);
    }

    if (i > peakInfectious) {
      peakInfectious = i;
      peakDay = day;
    }

    days.push({
      day, date: date.toISOString().split('T')[0],
      susceptible: s, exposed: e, infectious: i, recovered: r,
      peakRisk: Math.round(maxRisk * 10) / 10,
    });
  }

  // Compute recovery horizon: first day when infectious = 0
  const recoveryDay = days.find(d => d.infectious === 0)?.day ?? cfg.timeSteps;

  // Compute final Rₜ
  const finalDay = days[days.length - 1];
  const N = nodes.size;
  const Rt = computeRt(R0, finalDay?.susceptible ?? 0, N);

  // Determine if system is chronically vulnerable
  const isChronic = totalReinfections > 0 || (R0 > 0.8 && R0 <= 1.5);

  return {
    days,
    finalStates: [...states.values()],
    peakDay,
    peakInfectious,
    recoveryHorizon: recoveryDay,
    R0: Math.round(R0 * 1000) / 1000,
    Rt: Math.round(Rt * 1000) / 1000,
    isChronic,
    reinfectionCount: totalReinfections,
  };
}

/**
 * @deprecated Use propagateSEIRS instead
 */
export function propagateSEIR(
  nodes: Map<string, CascadeNode>,
  edges: CascadeEdge[],
  bfsResult: PropagationStep[],
  config: Partial<SEIRSConfig> = {},
): SEIRSTimeline {
  // Map old SEIR config to SEIRS config with xi=0 (no waning immunity)
  const seirsConfig: Partial<SEIRSConfig> = {
    ...config,
    xi: 0,
    resusceptibilityThreshold: Infinity, // Never transition R→S
  };
  return propagateSEIRS(nodes, edges, bfsResult, seirsConfig);
}
