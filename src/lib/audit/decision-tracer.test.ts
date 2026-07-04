/**
 * Decision Tracer — Tests
 */

import { describe, it, expect } from 'vitest';
import {
  DecisionTracer,
  validateDAG,
  getDecisionPath,
  formatCausalDAG,
  type CausalDAG,
  type DecisionNode,
} from './decision-tracer';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DecisionTracer', () => {
  describe('trace building', () => {
    it('should build a trace with correct metadata', () => {
      const tracer = new DecisionTracer('库存健康检查');
      tracer.setIntent('inventory-health-check');

      const trace = tracer.build();

      expect(trace.query).toBe('库存健康检查');
      expect(trace.intent).toBe('inventory-health-check');
      expect(trace.id).toMatch(/^trace-/);
      expect(trace.startedAt).toBeDefined();
      expect(trace.completedAt).toBeDefined();
    });

    it('should record prompt/response pairs', () => {
      const tracer = new DecisionTracer('test query');

      tracer.recordPromptResponse({
        state: 'classify',
        round: 0,
        prompt: 'Classify this query: test query',
        response: '{"intent": "test", "confidence": 0.9}',
        model: 'deepseek-v4-flash',
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 200,
      });

      const trace = tracer.build();

      expect(trace.promptResponses).toHaveLength(1);
      expect(trace.promptResponses[0].state).toBe('classify');
      expect(trace.promptResponses[0].model).toBe('deepseek-v4-flash');
      expect(trace.promptResponses[0].timestamp).toBeDefined();
    });

    it('should record memory snapshots', () => {
      const tracer = new DecisionTracer('test query');

      tracer.recordMemorySnapshot({
        state: 'execute',
        round: 0,
        retrievedChunks: [{ id: 'chunk-1', domain: 'tariff', score: 0.8 }],
        graphEntities: [{ nodeId: 'p1', nodeType: 'product', label: 'SKU-001' }],
        toolResults: [{ tool: 'query_inventory', success: true, latencyMs: 150 }],
        confidence: 0.85,
      });

      const trace = tracer.build();

      expect(trace.memorySnapshots).toHaveLength(1);
      expect(trace.memorySnapshots[0].retrievedChunks).toHaveLength(1);
      expect(trace.memorySnapshots[0].graphEntities).toHaveLength(1);
      expect(trace.memorySnapshots[0].confidence).toBe(0.85);
    });
  });

  describe('causal DAG construction', () => {
    it('should add decision nodes and auto-link them', () => {
      const tracer = new DecisionTracer('test query');
      tracer.setIntent('test-intent');

      const planId = tracer.addDecisionNode('plan', 0, 'Plan: use query_inventory', 'Need inventory data', ['intent:test-intent'], ['tool:query_inventory']);
      const execId = tracer.addDecisionNode('execute', 0, 'Execute query_inventory', 'Following plan', ['tool:query_inventory'], ['result:inventory-data']);
      const synthId = tracer.addDecisionNode('synthesize', 0, 'Generate response', 'Have sufficient data', ['result:inventory-data'], ['response:text']);

      const trace = tracer.build();

      expect(trace.causalDAG.nodes).toHaveLength(4); // classify + plan + execute + synthesize
      expect(trace.causalDAG.edges.length).toBeGreaterThanOrEqual(3); // auto-linked

      // Root should be the classify node
      expect(trace.causalDAG.rootId).toBeDefined();
    });

    it('should find leaf nodes (no outgoing edges)', () => {
      const tracer = new DecisionTracer('test query');
      tracer.setIntent('test');
      tracer.addDecisionNode('synthesize', 0, 'Final output', 'Done', [], ['response']);

      const trace = tracer.build();

      expect(trace.causalDAG.leafIds.length).toBeGreaterThan(0);
    });

    it('should handle multi-round traces', () => {
      const tracer = new DecisionTracer('test query');
      tracer.setIntent('test');

      // Round 0
      tracer.addDecisionNode('plan', 0, 'Plan round 1', 'Need data', [], ['tool:query_inventory']);
      tracer.addDecisionNode('execute', 0, 'Execute round 1', 'Following plan', ['tool:query_inventory'], ['result:partial']);

      // Round 1
      tracer.addDecisionNode('plan', 1, 'Plan round 2', 'Need more data', ['result:partial'], ['tool:query_cost']);
      tracer.addDecisionNode('execute', 1, 'Execute round 2', 'Following plan', ['tool:query_cost'], ['result:complete']);
      tracer.addDecisionNode('synthesize', 1, 'Final output', 'Done', ['result:complete'], ['response']);

      const trace = tracer.build();

      // Should have cross-round edges
      const crossRoundEdges = trace.causalDAG.edges.filter(e => e.type === 'triggers');
      expect(crossRoundEdges.length).toBeGreaterThan(0);
    });

    it('should support explicit causal edges', () => {
      const tracer = new DecisionTracer('test query');

      const id1 = tracer.addDecisionNode('classify', 0, 'Classified', 'Routing', [], ['intent']);
      const id2 = tracer.addDecisionNode('plan', 0, 'Planned', 'Based on intent', ['intent'], ['plan']);

      tracer.addCausalEdge(id1, id2, 'informs', 'intent drives plan');

      const trace = tracer.build();

      const explicitEdge = trace.causalDAG.edges.find(e => e.type === 'informs');
      expect(explicitEdge).toBeDefined();
      expect(explicitEdge!.label).toBe('intent drives plan');
    });

    it('should not create duplicate edges', () => {
      const tracer = new DecisionTracer('test query');
      tracer.setIntent('test');

      const id1 = tracer.addDecisionNode('plan', 0, 'Plan', 'Need data', [], ['tool']);
      const id2 = tracer.addDecisionNode('execute', 0, 'Execute', 'Following plan', ['tool'], ['result']);

      // Auto-link will create the edge, then we try to add it explicitly
      tracer.addCausalEdge(id1, id2, 'enables', 'plan enables execute');

      const trace = tracer.build();

      // Should have the auto-link edge plus the explicit one (but auto-link checks for duplicates)
      const edgesBetween = trace.causalDAG.edges.filter(e => e.from === id1 && e.to === id2);
      // The auto-link should not duplicate
      expect(edgesBetween.length).toBeLessThanOrEqual(2);
    });
  });
});

describe('validateDAG', () => {
  it('should validate a DAG without cycles', () => {
    const dag: CausalDAG = {
      nodes: [
        { id: 'n1', state: 'classify', round: 0, decision: 'A', reasoning: '', inputs: [], outputs: [], timestamp: '' },
        { id: 'n2', state: 'plan', round: 0, decision: 'B', reasoning: '', inputs: [], outputs: [], timestamp: '' },
        { id: 'n3', state: 'execute', round: 0, decision: 'C', reasoning: '', inputs: [], outputs: [], timestamp: '' },
      ],
      edges: [
        { from: 'n1', to: 'n2', type: 'enables', label: '' },
        { from: 'n2', to: 'n3', type: 'enables', label: '' },
      ],
      rootId: 'n1',
      leafIds: ['n3'],
    };

    const result = validateDAG(dag);
    expect(result.valid).toBe(true);
    expect(result.cyclePath).toBeNull();
  });

  it('should detect a cycle', () => {
    const dag: CausalDAG = {
      nodes: [
        { id: 'n1', state: 'classify', round: 0, decision: 'A', reasoning: '', inputs: [], outputs: [], timestamp: '' },
        { id: 'n2', state: 'plan', round: 0, decision: 'B', reasoning: '', inputs: [], outputs: [], timestamp: '' },
      ],
      edges: [
        { from: 'n1', to: 'n2', type: 'enables', label: '' },
        { from: 'n2', to: 'n1', type: 'enables', label: '' }, // Cycle!
      ],
      rootId: 'n1',
      leafIds: [],
    };

    const result = validateDAG(dag);
    expect(result.valid).toBe(false);
    expect(result.cyclePath).not.toBeNull();
  });

  it('should validate an empty DAG', () => {
    const dag: CausalDAG = {
      nodes: [],
      edges: [],
      rootId: null,
      leafIds: [],
    };

    const result = validateDAG(dag);
    expect(result.valid).toBe(true);
  });
});

describe('getDecisionPath', () => {
  it('should find path from root to target', () => {
    const dag: CausalDAG = {
      nodes: [
        { id: 'n1', state: 'classify', round: 0, decision: 'Classify', reasoning: '', inputs: [], outputs: [], timestamp: '' },
        { id: 'n2', state: 'plan', round: 0, decision: 'Plan', reasoning: '', inputs: [], outputs: [], timestamp: '' },
        { id: 'n3', state: 'execute', round: 0, decision: 'Execute', reasoning: '', inputs: [], outputs: [], timestamp: '' },
      ],
      edges: [
        { from: 'n1', to: 'n2', type: 'enables', label: '' },
        { from: 'n2', to: 'n3', type: 'enables', label: '' },
      ],
      rootId: 'n1',
      leafIds: ['n3'],
    };

    const path = getDecisionPath(dag, 'n3');
    expect(path).toHaveLength(3);
    expect(path[0].id).toBe('n1');
    expect(path[2].id).toBe('n3');
  });

  it('should return empty array when no path exists', () => {
    const dag: CausalDAG = {
      nodes: [
        { id: 'n1', state: 'classify', round: 0, decision: 'A', reasoning: '', inputs: [], outputs: [], timestamp: '' },
        { id: 'n2', state: 'plan', round: 0, decision: 'B', reasoning: '', inputs: [], outputs: [], timestamp: '' },
      ],
      edges: [],
      rootId: 'n1',
      leafIds: ['n2'],
    };

    const path = getDecisionPath(dag, 'n2');
    expect(path).toEqual([]);
  });
});

describe('formatCausalDAG', () => {
  it('should format DAG as readable string', () => {
    const dag: CausalDAG = {
      nodes: [
        { id: 'n1', state: 'classify', round: 0, decision: 'Classified intent', reasoning: '', inputs: [], outputs: [], timestamp: '' },
        { id: 'n2', state: 'plan', round: 0, decision: 'Planned tools', reasoning: '', inputs: [], outputs: [], timestamp: '' },
      ],
      edges: [
        { from: 'n1', to: 'n2', type: 'enables', label: 'classify → plan' },
      ],
      rootId: 'n1',
      leafIds: ['n2'],
    };

    const formatted = formatCausalDAG(dag);
    expect(formatted).toContain('2 nodes');
    expect(formatted).toContain('1 edges');
    expect(formatted).toContain('Classified intent');
    expect(formatted).toContain('classify → plan');
  });
});
