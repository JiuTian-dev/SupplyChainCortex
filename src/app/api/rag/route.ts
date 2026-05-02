/**
 * Supply Chain RAG API — knowledge retrieval + prompt augmentation.
 *
 * GET /api/rag?q=Section301关税怎么计算  → retrieve relevant knowledge
 * GET /api/rag?q=FCC认证要求&augment=true → return augmented prompt for LLM
 * GET /api/rag?action=domains             → list knowledge domains
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-utils';
import { retrieveKnowledge, augmentPrompt, getRAGDomains, searchByDomain } from '@/lib/engine/rag';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const query = searchParams.get('q') || '';
  const domain = searchParams.get('domain');
  const augment = searchParams.get('augment') === 'true';
  const topK = parseInt(searchParams.get('topK') || '3');

  if (action === 'domains') {
    return NextResponse.json({
      domains: getRAGDomains(),
      totalChunks: 15,
      note: 'Self-contained TF-IDF retrieval. No external API required.',
    });
  }

  if (domain) {
    const chunks = searchByDomain(domain);
    return NextResponse.json({ domain, chunks: chunks.map(c => ({ title: c.title, id: c.id })) });
  }

  const results = retrieveKnowledge(query, topK);

  if (augment) {
    const promptAddition = augmentPrompt(query, results);
    return NextResponse.json({
      query,
      results: results.map(r => ({
        title: r.chunk.title,
        domain: r.chunk.domain,
        score: Math.round(r.score * 1000) / 1000,
        relevance: r.relevance,
      })),
      augmentedPrompt: promptAddition
        ? promptAddition.slice(0, 2000)
        : '(无相关知识库匹配)',
    });
  }

  return NextResponse.json({
    query,
    results: results.map(r => ({
      title: r.chunk.title,
      domain: r.chunk.domain,
      content: r.chunk.content.slice(0, 300) + '...',
      score: Math.round(r.score * 1000) / 1000,
      relevance: r.relevance,
    })),
  });
});
