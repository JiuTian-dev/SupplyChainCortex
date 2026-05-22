import type { ProviderAdapter, Classification } from './adapter';
import type { RoutingDecision, Intent } from './fsm-types';

const VALID_INTENTS = new Set<Intent>([
  'supply_chain_data',
  'supply_chain_knowledge',
  'news_event',
  'general_knowledge',
  'opinion_recommendation',
  'chat_greeting',
]);

export function buildClassificationPrompt(): string {
  return `你是一个供应链查询路由器。将用户问题分类到以下意图之一：

意图列表：
- chat_greeting: 问候、闲聊、感谢、再见（如"你好""谢谢"）
- opinion_recommendation: 请求建议、推荐、意见（如"推荐哪个供应商""你觉得呢"）
- supply_chain_data: 查询实时供应链数据（库存、成本、关税、汇率、大宗商品价格、供应商、物流）
- supply_chain_knowledge: 供应链专业知识问题（如"什么是EOQ""如何计算安全库存"）
- news_event: 新闻/政策/趋势/预测/时效性事件（如"最近铜价走势""特朗普关税"）
- general_knowledge: 通用知识问答（如"什么是GDP""解释通胀"）

输出 JSON：
{
  "intent": "<intent>",
  "confidence": <0.0-1.0>,
  "reason": "<一句话说明分类依据>"
}`;
}

export function parseClassificationResponse(raw: string): Classification {
  try {
    const parsed = JSON.parse(raw);
    const intent = VALID_INTENTS.has(parsed.intent)
      ? parsed.intent
      : 'supply_chain_knowledge';
    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;
    return {
      intent,
      confidence,
      reason: parsed.reason || 'parsed from LLM response',
    };
  } catch {
    return {
      intent: 'supply_chain_knowledge',
      confidence: 0.5,
      reason: 'classification parse failed — default route',
    };
  }
}

export async function classifyIntent(
  query: string,
  adapter: ProviderAdapter,
): Promise<RoutingDecision> {
  const systemPrompt = buildClassificationPrompt();
  const result = await adapter.classify(query, systemPrompt);

  const intent = result.intent;
  const confidence = result.confidence;

  const shouldUseTools = intent === 'supply_chain_data' || intent === 'supply_chain_knowledge';
  const shouldSearch = intent === 'news_event';

  return {
    intent,
    confidence,
    shouldUseTools,
    shouldSearch,
    reason: result.reason,
  };
}
