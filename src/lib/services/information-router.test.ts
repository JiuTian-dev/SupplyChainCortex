/**
 * Tests for pure functions in information-router.ts
 *
 * classifyIntent  — classifies user queries into one of 6 intents
 * hasKeyword      — single-keyword matching with word-boundary for short English
 */
import { describe, it, expect } from 'vitest';
import { classifyIntent, hasKeyword } from './information-router';

// ─── classifyIntent ────────────────────────────────────────────────────────────────

describe('classifyIntent', () => {
  it('classifies supply_chain_data intent for commodity queries', () => {
    const result = classifyIntent('最新的铜价是多少？');
    expect(result.intent).toBe('news_event');
    expect(result.primaryTier).toBe(3);
    expect(result.shouldSearch).toBe(true);
  });

  it('classifies supply_chain_data intent for inventory queries', () => {
    const result = classifyIntent('查询当前库存水平和缺货情况');
    expect(result.intent).toBe('supply_chain_data');
    expect(result.primaryTier).toBe(1);
  });

  it('classifies news_event intent for time-sensitive queries', () => {
    const result = classifyIntent('这周中美贸易战有什么最新动态？');
    expect(result.intent).toBe('news_event');
    expect(result.primaryTier).toBe(3);
    expect(result.shouldSearch).toBe(true);
  });

  it('classifies news_event intent for policy change queries', () => {
    const result = classifyIntent('特朗普最新关税政策');
    expect(result.intent).toBe('news_event');
  });

  it('classifies general_knowledge intent for definition questions', () => {
    const result = classifyIntent('解释量子力学的基本概念');
    expect(result.intent).toBe('general_knowledge');
    expect(result.primaryTier).toBe(2);
  });

  it('classifies opinion_recommendation intent for recommendation queries', () => {
    const result = classifyIntent('推荐一个好的供应商管理系统');
    expect(result.intent).toBe('opinion_recommendation');
    expect(result.primaryTier).toBe(0);
    expect(result.shouldSearch).toBe(false);
  });

  it('classifies chat_greeting intent for greetings', () => {
    const result = classifyIntent('你好，请问你能做什么？');
    expect(result.intent).toBe('chat_greeting');
    expect(result.primaryTier).toBe(0);
    expect(result.shouldUseTools).toBe(false);
  });

  it('classifies supply_chain_knowledge intent for domain knowledge queries', () => {
    const result = classifyIntent('ABC分类和EOQ计算方法的区别');
    expect(result.intent).toBe('supply_chain_knowledge');
  });

  it('handles empty query by returning chat_greeting with tier 0', () => {
    const result = classifyIntent('');
    expect(result.intent).toBe('chat_greeting');
    expect(result.primaryTier).toBe(0);
    expect(result.shouldSearch).toBe(false);
  });

  it('handles whitespace-only query as empty', () => {
    const result = classifyIntent('   ');
    expect(result.intent).toBe('chat_greeting');
  });

  it('defaults to supply_chain_knowledge for completely unknown queries', () => {
    const result = classifyIntent('这是一个完全无关的测试内容');
    // No specific keywords match across any intent → should fall through to default
    expect(result.intent).toBe('supply_chain_knowledge');
    expect(result.shouldSearch).toBe(true);
  });

  it('classifies thank you messages as chat_greeting', () => {
    const result = classifyIntent('谢谢，这个回答很有帮助');
    expect(result.intent).toBe('chat_greeting');
  });

  it('classifies supply_chain_knowledge when supply chain keyword is a substring', () => {
    // '什么是供应链管理？' contains '什么是供应链' which is a supply_chain_knowledge keyword
    const result = classifyIntent('什么是供应链管理？');
    expect(result.intent).toBe('supply_chain_knowledge');
  });

  it('classifies general_knowledge for mixed domain/general queries with more general keyword hits', () => {
    // 'HS编码' hits supply_chain_knowledge (1 point), but '什么是' and '如何' hit general_knowledge (2 points)
    const result = classifyIntent('什么是HS编码？如何归类小家电产品？');
    expect(result.intent).toBe('general_knowledge');
  });

  it('classifies general_knowledge for principle explanation queries', () => {
    // '原理' keyword only matches general_knowledge
    const result = classifyIntent('量子计算机的原理是什么');
    expect(result.intent).toBe('general_knowledge');
  });
});

// ─── hasKeyword ─────────────────────────────────────────────────────────────────────

describe('hasKeyword', () => {
  it('returns true when the keyword is fully contained in the query', () => {
    expect(hasKeyword('查询最新铜价', '铜价')).toBe(true);
  });

  it('returns false when the keyword is not present', () => {
    expect(hasKeyword('查询最新铝价', '铜价')).toBe(false);
  });

  it('applies word boundary for short English keywords (1-3 letters)', () => {
    // "hi" should NOT match inside "this"
    expect(hasKeyword('this is a test', 'hi')).toBe(false);
    // "hi" as a standalone word SHOULD match
    expect(hasKeyword('say hi to me', 'hi')).toBe(true);
  });

  it('is case insensitive for both query and keyword', () => {
    expect(hasKeyword('查询FOB价格', 'fob')).toBe(true);
    expect(hasKeyword('查询fob价格', 'FOB')).toBe(true);
  });

  it('matches longer English keywords without word boundary restriction', () => {
    expect(hasKeyword('supply chain management', 'chain')).toBe(true);
  });
});
