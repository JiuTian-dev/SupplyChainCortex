import { describe, it, expect, vi } from 'vitest';
import { createFSMContext, getNextState } from './fsm';
import type { FSMContext, FSMState } from './fsm-types';
import { DEFAULT_FSM_CONFIG } from './fsm-types';

// Mock deep imports that trigger DB connection at module load time.
// These modules are not exercised by the pure logic tests below.
vi.mock('@/lib/mcp/tools', () => ({ getToolSchemas: vi.fn(), executeTool: vi.fn() }));
vi.mock('@/lib/engine/autonomy-policy', () => ({ executeWithPolicy: vi.fn() }));
vi.mock('@/lib/engine/passport', () => ({ createPassport: vi.fn(), provenanceEntry: vi.fn() }));
vi.mock('@/lib/engine/rag', () => ({ retrieveKnowledge: vi.fn(), augmentPrompt: vi.fn() }));
vi.mock('@/lib/services/web-search.service', () => ({ webSearchWithQuality: vi.fn(), formatSearchContext: vi.fn() }));
vi.mock('@/app/api/chat/chat.prompt', () => ({ SYSTEM_PROMPT: '' }));

function mockCtx(overrides?: Partial<FSMContext>): FSMContext {
  return {
    query: 'test query',
    history: [],
    config: DEFAULT_FSM_CONFIG,
    round: 1,
    toolResults: [],
    observations: [],
    toolsUsed: [],
    startTimeMs: Date.now(),
    ...overrides,
  };
}

describe('FSM transition table', () => {
  it('classify → plan (always)', () => {
    expect(getNextState('classify', mockCtx())).toBe('plan');
  });

  it('plan → synthesize when no tools needed', () => {
    const ctx = mockCtx({
      routing: { intent: 'chat_greeting', confidence: 0.95, shouldUseTools: false, shouldSearch: false, reason: 'greeting' },
    });
    expect(getNextState('plan', ctx)).toBe('synthesize');
  });

  it('plan → execute when tools needed', () => {
    const ctx = mockCtx({
      routing: { intent: 'supply_chain_data', confidence: 0.9, shouldUseTools: true, shouldSearch: false, reason: 'data' },
    });
    expect(getNextState('plan', ctx)).toBe('execute');
  });

  it('execute → observe (always)', () => {
    expect(getNextState('execute', mockCtx())).toBe('observe');
  });

  it('observe → decide (always)', () => {
    expect(getNextState('observe', mockCtx())).toBe('decide');
  });

  it('decide → synthesize when max rounds reached', () => {
    expect(getNextState('decide', mockCtx({ round: 3, config: { ...DEFAULT_FSM_CONFIG, maxRounds: 3 } }))).toBe('synthesize');
  });

  it('decide → plan when more rounds available', () => {
    const ctx = mockCtx({
      round: 1,
      routing: { intent: 'supply_chain_data', confidence: 0.9, shouldUseTools: true, shouldSearch: false, reason: 'data' },
    });
    expect(getNextState('decide', ctx)).toBe('plan');
  });

  it('plan → synthesize when max rounds reached (guard)', () => {
    expect(getNextState('plan', mockCtx({ round: 3, config: { ...DEFAULT_FSM_CONFIG, maxRounds: 3 } }))).toBe('synthesize');
  });

  it('synthesize is terminal (returns null)', () => {
    expect(getNextState('synthesize', mockCtx())).toBeNull();
  });

  it('invalid state returns null', () => {
    expect(getNextState('nonexistent' as FSMState, mockCtx())).toBeNull();
  });
});

describe('createFSMContext', () => {
  it('initializes with defaults', () => {
    const ctx = createFSMContext({ query: '库存情况如何', history: [], startTimeMs: 1000 });
    expect(ctx.query).toBe('库存情况如何');
    expect(ctx.round).toBe(0);
    expect(ctx.toolsUsed).toEqual([]);
    expect(ctx.toolResults).toEqual([]);
    expect(ctx.config).toEqual(DEFAULT_FSM_CONFIG);
  });

  it('merges custom config', () => {
    const ctx = createFSMContext({
      query: 'test',
      history: [],
      startTimeMs: 0,
      config: { maxRounds: 5 },
    });
    expect(ctx.config.maxRounds).toBe(5);
    expect(ctx.config.maxToolsPerRound).toBe(DEFAULT_FSM_CONFIG.maxToolsPerRound);
  });
});
