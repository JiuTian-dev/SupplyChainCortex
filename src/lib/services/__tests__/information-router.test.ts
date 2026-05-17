// src/lib/services/__tests__/information-router.test.ts
import { describe, it, expect } from 'vitest';
import { classifyIntent, getActiveSources, type Intent, type RoutingDecision } from '../information-router';

// ─── Helper ─────────────────────────────────────────────────────────────────────

function route(query: string): RoutingDecision {
  return classifyIntent(query);
}

// ─── Tier 1: Supply chain real-time data ────────────────────────────────────────

describe('Tier 1: Supply chain real-time data', () => {
  const cases: Array<[string, string]> = [
    ['铜价最近走势如何', '铜价'],
    ['铝价今天多少钱', '铝价'],
    ['SCFI运价最新数据', 'SCFI'],
    ['人民币对美元汇率', '汇率'],
    ['咖啡机库存告急的SKU有哪些', '库存'],
    ['电机马达供应商风险多大', '供应商'],
    ['美国301关税最新税率', '关税'],
    ['洛杉矶港口拥堵情况', '港口'],
    ['最近有CPSC召回吗', '召回'],
    ['copper price forecast', 'copper price'],
    ['exchange rate CNY USD', 'exchange rate'],
    ['CBAM碳关税成本估算', 'CBAM'],
    ['如何计算安全库存', '安全库存'],
    ['怎么优化库存周转率', '库存'],
    ['什么是CBAM碳关税', 'CBAM'],
  ];

  cases.forEach(([query, _label]) => {
    it(`routes "${query.substring(0, 30)}" to Tier 1`, () => {
      const r = route(query);
      expect(r.intent).toBe('supply_chain_data');
      expect(r.primaryTier).toBe(1);
      expect(r.shouldUseTools).toBe(true);
    });
  });
});

// ─── Tier 1+2: Supply chain domain knowledge ────────────────────────────────────

describe('Tier 1+2: Supply chain domain knowledge', () => {
  const cases = [
    'FOB和CIF有什么区别',
    'HS编码怎么查',
    '什么是供应链数字化转型',
    'Incoterm和贸易术语有什么区别',
  ];

  cases.forEach(query => {
    it(`routes "${query.substring(0, 30)}" to supply_chain_knowledge`, () => {
      const r = route(query);
      expect(r.intent).toBe('supply_chain_knowledge');
      expect(r.primaryTier).toBe(1);
      expect(r.shouldUseTools).toBe(true);
    });
  });
});

// ─── Tier 3: News and events ────────────────────────────────────────────────────

describe('Tier 3: News and events', () => {
  const cases = [
    '这周有什么供应链大事件',
    '今天最新关税政策',
    '最近中美贸易战有什么新动态',
    '刚刚发生的港口罢工影响',
    'what happened this week in trade',
    'latest supply chain news',
  ];

  cases.forEach(query => {
    it(`routes "${query.substring(0, 35)}" to news_event`, () => {
      const r = route(query);
      expect(r.intent).toBe('news_event');
      expect(r.primaryTier).toBe(3);
      expect(r.shouldSearch).toBe(true);
    });
  });
});

// ─── Tier 2: General knowledge ──────────────────────────────────────────────────

describe('Tier 2: General knowledge', () => {
  const cases = [
    '什么是区块链',
    '为什么会有通货膨胀',
    'how does machine learning work',
    '量子计算是什么原理',
  ];

  cases.forEach(query => {
    it(`routes "${query.substring(0, 30)}" to general_knowledge`, () => {
      const r = route(query);
      expect(r.intent).toBe('general_knowledge');
      expect(r.primaryTier).toBe(2);
    });
  });
});

// ─── Tier 0: Opinion and recommendation ─────────────────────────────────────────

describe('Tier 0: Opinion and recommendation', () => {
  const cases = [
    '推荐一本供应链管理的书',
    '哪个物流平台比较好',
    '你觉得应该签长约吗',
    '帮我选一个供应商',
    'best coffee maker for export',
  ];

  cases.forEach(query => {
    it(`routes "${query.substring(0, 30)}" to opinion_recommendation (Tier 0)`, () => {
      const r = route(query);
      expect(r.intent).toBe('opinion_recommendation');
      expect(r.primaryTier).toBe(0);
      expect(r.shouldSearch).toBe(false);
    });
  });
});

// ─── Tier 0: Chat and greeting ──────────────────────────────────────────────────

describe('Tier 0: Chat and greeting', () => {
  const cases = [
    '你好',
    '早安',
    '谢谢你的帮助',
    '再见',
    '你能做什么',
  ];

  cases.forEach(query => {
    it(`routes "${query}" to chat_greeting (Tier 0)`, () => {
      const r = route(query);
      expect(r.intent).toBe('chat_greeting');
      expect(r.primaryTier).toBe(0);
      expect(r.shouldSearch).toBe(false);
    });
  });
});

// ─── Default routing ────────────────────────────────────────────────────────────

describe('Default routing', () => {
  it('routes unrecognized supply chain query to supply_chain_knowledge', () => {
    const r = route('供应链优化方案');
    expect(r.intent).toBe('supply_chain_knowledge');
    expect(r.primaryTier).toBe(1);
    expect(r.shouldUseTools).toBe(true);
  });

  it('routes empty query to chat_greeting', () => {
    const r = route('');
    expect(r.intent).toBe('chat_greeting');
    expect(r.primaryTier).toBe(0);
    expect(r.shouldSearch).toBe(false);
  });
});

// ─── getActiveSources ───────────────────────────────────────────────────────────

describe('getActiveSources', () => {
  it('enables MCP tools for Tier 1 decisions', () => {
    const sources = getActiveSources(route('铜价多少'));
    expect(sources.mcpTools).toBe(true);
    expect(sources.directReply).toBe(false);
  });

  it('enables Wikipedia for Tier 2 decisions', () => {
    const sources = getActiveSources(route('什么是区块链'));
    expect(sources.wikipedia).toBe(true);
    expect(sources.mcpTools).toBe(false);
  });

  it('enables web search for Tier 3 decisions', () => {
    const sources = getActiveSources(route('这周有什么新闻'));
    expect(sources.webSearch).toBe(true);
  });

  it('enables direct reply for Tier 0 decisions', () => {
    const sources = getActiveSources(route('你好'));
    expect(sources.directReply).toBe(true);
    expect(sources.webSearch).toBe(false);
    expect(sources.mcpTools).toBe(false);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('handles very long queries', () => {
    const longQuery = '铜价'.repeat(100);
    const r = route(longQuery);
    expect(r.intent).toBeDefined();
    expect(r.primaryTier).toBeDefined();
  });

  it('handles special characters', () => {
    const r = route('铜价!!!???%%%');
    expect(r.intent).toBe('supply_chain_data');
  });

  it('handles mixed Chinese-English', () => {
    const r = route('CBAM carbon tariff 对中国家电出口影响');
    expect(r.intent).toBe('supply_chain_data');
    expect(r.primaryTier).toBe(1);
  });

  it('all routing decisions have valid tiers', () => {
    const queries = [
      '铜价', '什么是CBAM', '这周新闻', '推荐一本书', '你好',
      '库存SKU', 'copper price', 'how to calculate safety stock',
    ];
    for (const q of queries) {
      const r = route(q);
      expect([0, 1, 2, 3]).toContain(r.primaryTier);
      expect([0, 1, 2, 3]).toContain(r.fallbackTier);
      expect(typeof r.reason).toBe('string');
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });
});
