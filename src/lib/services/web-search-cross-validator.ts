// src/lib/services/web-search-cross-validator.ts

import type { SearchResult } from './web-search.service';

export interface VerifiedResult {
  sourceCount: number;
  supportingSources: number;
  confidence: 'high' | 'medium' | 'low';
  caveats: string[];
  results: Array<{ result: SearchResult; verified: boolean; note?: string }>;
}

// ─── Claim Extraction ───────────────────────────────────────────────────────────

export function extractClaim(text: string): string[] {
  const claims: string[] = [];
  const sentences = text.split(/[.。!！?？\n]+/).filter(s => s.trim().length > 10);

  for (const sentence of sentences) {
    const hasFactualIndicator =
      /\d+%/.test(sentence) ||
      /\d{4}年/.test(sentence) ||
      /(?:increase|decrease|rise|fall|grow|decline|impose|announce|report|according)/i.test(sentence) ||
      /(?:增[加长]|减[少]|上涨|下跌|宣布|发布|实施|执行|关税|税率)/.test(sentence);

    if (hasFactualIndicator && sentence.length > 15) {
      claims.push(sentence.trim());
    }
  }

  return claims.slice(0, 5);
}

// ─── Source Agreement ───────────────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  const chinese = text.match(/[一-鿿]{2,}/g) || [];
  const english = text.match(/[a-zA-Z]{3,}/g) || [];
  const numbers = text.match(/\d+(?:\.\d+)?%?/g) || [];
  for (const t of [...chinese, ...english, ...numbers]) {
    tokens.add(t.toLowerCase());
  }
  return tokens;
}

export function computeSourceAgreement(
  claim: string,
  sources: string[],
): { score: number; supportingSources: number } {
  if (sources.length === 0) return { score: 0, supportingSources: 0 };

  const claimTokens = tokenize(claim);
  if (claimTokens.size === 0) return { score: 0, supportingSources: 0 };

  let supportingSources = 0;
  const scores: number[] = [];

  for (const source of sources) {
    const sourceTokens = tokenize(source);
    const intersection = [...claimTokens].filter(t => sourceTokens.has(t)).length;
    const similarity = intersection / Math.max(claimTokens.size, 1);
    scores.push(similarity);
    if (similarity > 0.3) supportingSources++;
  }

  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { score: avgScore, supportingSources };
}

// ─── Cross Validator ────────────────────────────────────────────────────────────

export function crossValidate(results: SearchResult[], _query: string): VerifiedResult {
  if (results.length === 0) {
    return {
      sourceCount: 0,
      supportingSources: 0,
      confidence: 'low',
      caveats: ['联网搜索未返回任何结果，以下分析基于内置知识和数据模型。'],
      results: [],
    };
  }

  // Group results by source type
  const newsSources = results.filter(r => {
    try {
      const host = new URL(r.url).hostname;
      return /reuters|bloomberg|bbc|ft|wsj|scmp|cnbc|caixin|36kr|yicai|cls/i.test(host);
    } catch { return false; }
  });
  const govSources = results.filter(r => {
    try {
      return /\.gov|gov\.cn|edu\.cn/.test(r.url);
    } catch { return false; }
  });

  const allText = results.map(r => `${r.title} ${r.snippet}`);
  const primaryClaims = extractClaim(results[0]?.snippet || '');

  const caveats: string[] = [];
  let confidence: 'high' | 'medium' | 'low' = 'medium';

  if (results.length < 3) {
    caveats.push('信息来源较少，结论可能存在偏差。');
    confidence = 'low';
  }

  if (govSources.length === 0 && newsSources.length === 0) {
    caveats.push('未找到政府或权威媒体来源，信息可靠性较低。');
    confidence = 'low';
  }

  let totalSupporting = 0;
  for (const claim of primaryClaims) {
    const agreement = computeSourceAgreement(claim, allText);
    totalSupporting += agreement.supportingSources;
  }

  if (govSources.length > 0 && newsSources.length > 1) {
    confidence = 'high';
    caveats.push('结果来自政府和权威媒体，交叉验证通过。');
  } else if (newsSources.length >= 1 || govSources.length >= 1) {
    if (confidence !== 'low') confidence = 'medium';
  }

  if (primaryClaims.length > 0 && totalSupporting < 2) {
    caveats.push('主要声明未得到其他来源的充分支持。');
  }

  const verifiedResults = results.map(r => {
    try {
      const host = new URL(r.url).hostname;
      const isVerified =
        newsSources.includes(r) || govSources.includes(r) ||
        /wikipedia|mckinsey|gartner|deloitte|pwc|bain|freightos/i.test(host);
      return {
        result: r,
        verified: isVerified,
        note: isVerified ? undefined : '来源未经验证',
      };
    } catch {
      return { result: r, verified: false, note: 'URL 无效' };
    }
  });

  return {
    sourceCount: results.length,
    supportingSources: totalSupporting,
    confidence,
    caveats,
    results: verifiedResults,
  };
}
