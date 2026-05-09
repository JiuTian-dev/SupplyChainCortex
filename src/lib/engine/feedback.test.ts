import { describe, it, expect, beforeEach } from 'vitest';
import {
  feedbackStore,
  recordFeedback,
  recordOutcome,
  getFeedbackStats,
} from './feedback';

beforeEach(() => {
  feedbackStore._clear();
});

describe('FeedbackStore', () => {
  it('records entries and retrieves by auditId', () => {
    const fb = recordFeedback({ auditId: 'audit-1', engine: 'cascade-risk', action: 'accepted' });
    expect(fb.auditId).toBe('audit-1');
    expect(fb.action).toBe('accepted');
    expect(fb.engine).toBe('cascade-risk');
    expect(fb.id).toBeTruthy();
    expect(fb.suggestedAt).toBeTruthy();
  });

  it('respects maxSize bounded queue', () => {
    const small = feedbackStore._createSmall(3);
    const mk = (id: string, auditId: string, action: 'accepted' | 'rejected' | 'ignored'): Record<string, unknown> =>
      ({ id, auditId, engine: 'test', action, suggestedAt: new Date().toISOString() });
    small.record(mk('1', 'a1', 'accepted') as any);
    small.record(mk('2', 'a2', 'rejected') as any);
    small.record(mk('3', 'a3', 'accepted') as any);
    small.record(mk('4', 'a4', 'ignored') as any);
    const all = small.exportAll();
    expect(all).toHaveLength(3);
    expect(all[0].id).toBe('2');
    expect(all[0].auditId).toBe('a2');
  });

  it('findByAuditId returns matching entry', () => {
    recordFeedback({ auditId: 'find-me', engine: 'sandbox', action: 'accepted' });
    const found = feedbackStore.findByAuditId('find-me');
    expect(found).toBeTruthy();
    expect(found!.auditId).toBe('find-me');
  });

  it('findByAuditId returns undefined for missing', () => {
    const found = feedbackStore.findByAuditId('non-existent');
    expect(found).toBeUndefined();
  });

  it('getRecent returns latest N in reverse order', () => {
    for (let i = 1; i <= 5; i++) {
      recordFeedback({ auditId: `audit-${i}`, engine: 'cascade-risk', action: 'accepted' });
    }
    const recent = feedbackStore.getRecent(3);
    expect(recent).toHaveLength(3);
    expect(recent[0].auditId).toBe('audit-5');
    expect(recent[1].auditId).toBe('audit-4');
    expect(recent[2].auditId).toBe('audit-3');
  });

  it('exportAll returns a snapshot array', () => {
    recordFeedback({ auditId: 'iso-1', engine: 'test', action: 'accepted' });
    const copy = feedbackStore.exportAll();
    expect(copy).toHaveLength(1);
    expect(copy[0].auditId).toBe('iso-1');
    expect(copy[0].action).toBe('accepted');
  });
});

describe('getFeedbackStats', () => {
  it('returns zeros for empty store', () => {
    const stats = getFeedbackStats();
    expect(stats.total).toBe(0);
    expect(stats.acceptanceRate).toBe(0);
    expect(stats.byEngine).toEqual({});
  });

  it('computes correct acceptance rate', () => {
    recordFeedback({ auditId: 'a1', engine: 'cascade-risk', action: 'accepted' });
    recordFeedback({ auditId: 'a2', engine: 'cascade-risk', action: 'rejected' });
    recordFeedback({ auditId: 'a3', engine: 'cascade-risk', action: 'accepted' });
    const stats = getFeedbackStats();
    expect(stats.total).toBe(3);
    expect(stats.accepted).toBe(2);
    expect(stats.rejected).toBe(1);
    expect(stats.acceptanceRate).toBeCloseTo(0.67, 1);
  });

  it('groups by engine', () => {
    recordFeedback({ auditId: 'a1', engine: 'cascade-risk', action: 'accepted' });
    recordFeedback({ auditId: 'a2', engine: 'sandbox', action: 'rejected' });
    const stats = getFeedbackStats();
    expect(stats.byEngine['cascade-risk']).toBeDefined();
    expect(stats.byEngine['sandbox']).toBeDefined();
  });
});

describe('recordOutcome', () => {
  it('attaches outcome to existing feedback', () => {
    recordFeedback({ auditId: 'outcome-test', engine: 'decision-graph', action: 'accepted' });
    recordOutcome('outcome-test', {
      delayDeltaDays: -2,
      costDeltaCny: -50000,
      stockoutDelta: 0,
      satisfactionImpact: 8,
      description: '提前到货，降低成本',
      recordedAt: new Date().toISOString(),
    });
    const fb = feedbackStore.findByAuditId('outcome-test');
    expect(fb).toBeTruthy();
    expect(fb!.outcome).toBeTruthy();
    expect(fb!.outcome!.delayDeltaDays).toBe(-2);
    expect(fb!.outcome!.costDeltaCny).toBe(-50000);
  });

  it('does nothing for non-existent auditId', () => {
    expect(() => recordOutcome('not-found', {
      delayDeltaDays: 0, costDeltaCny: 0, stockoutDelta: 0,
      satisfactionImpact: 0, description: 'n/a', recordedAt: new Date().toISOString(),
    })).not.toThrow();
  });
});
