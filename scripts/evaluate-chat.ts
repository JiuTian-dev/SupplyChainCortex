/**
 * SupplyChain Cortex Chat Assistant — Comprehensive Capability Evaluation
 * 30 queries covering 20 business scenarios + 10+ cross-cutting evaluation dimensions
 */
const BASE = 'http://localhost:3000';

interface TestCase {
  id: string;
  scenario: string;
  dimension: string;
  query: string;
  expectedTools: string[];
  expectedSourceTags: string[];
}

interface Result {
  id: string;
  scenario: string;
  dimension: string;
  response: string;
  elapsed: number;
  status: number;
  hasReply: boolean;
  hasToolCall: boolean;
  toolCalls: string[];
  hasSourceTag: boolean;
  sourceTags: string[];
  hasConfidence: boolean;
  tokenLen: number;
}

const TEST_QUERIES: TestCase[] = [
  // ==================== 20 Business Scenarios ====================

  // 1. 库存管理
  { id: 'S01', scenario: '库存查询', dimension: '数据查询准确性',
    query: '查询SKU为"厨房-榨汁0020"的库存健康状态', expectedTools: ['query_inventory'], expectedSourceTags: ['T1-MCP'] },
  { id: 'S02', scenario: '库存预警', dimension: '异常检测能力',
    query: '哪些产品库存处于紧急状态？列出前5个', expectedTools: ['query_inventory'], expectedSourceTags: ['T1-MCP'] },

  // 2. 补货决策
  { id: 'S03', scenario: '补货建议', dimension: '决策支持',
    query: '根据EOQ模型计算年需求10000件、订货成本200元、持有成本每件15元的补货策略', expectedTools: ['calculate_eoq'], expectedSourceTags: ['T1-MCP'] },
  { id: 'S04', scenario: '安全库存', dimension: '数学建模',
    query: '服务水平95%、提前期7天、需求标准差每天25件的安全库存是多少', expectedTools: ['calculate_safety_stock'], expectedSourceTags: ['T1-MCP'] },

  // 3. 成本分析
  { id: 'S05', scenario: '成本结构', dimension: '多维度分析',
    query: '分析当前所有产品的平均毛利率，列出毛利率最低的3个产品', expectedTools: ['query_cost'], expectedSourceTags: ['T1-MCP'] },
  { id: 'S06', scenario: '汇率影响', dimension: '风险量化',
    query: '当前USD/CNY汇率是多少？如果人民币升值5%，对我司出口成本有什么影响？', expectedTools: ['query_exchange_rates'], expectedSourceTags: ['T1-MCP'] },

  // 4. 关税与合规
  { id: 'S07', scenario: '关税查询', dimension: '政策理解',
    query: '美国对中国小家电目前的关税是多少？Section 301和附加关税分别是什么？', expectedTools: ['query_tariff','web_search'], expectedSourceTags: ['T1-MCP','T3-Search'] },
  { id: 'S08', scenario: '合规认证', dimension: '合规检查',
    query: '出口到欧盟的厨房小家电需要哪些认证？当前哪些证书即将到期？', expectedTools: ['query_compliance_check'], expectedSourceTags: ['T1-MCP'] },

  // 5. 供应商管理
  { id: 'S09', scenario: '供应商评估', dimension: '评分模型',
    query: '用供应商评分模型评估目前所有供应商，列出评分最高的5个', expectedTools: ['query_suppliers','calculate_supplier_scoring'], expectedSourceTags: ['T1-MCP'] },
  { id: 'S10', scenario: '供应商发现', dimension: '智能推荐',
    query: '帮我找浙江地区能供应不锈钢锅体的新供应商', expectedTools: ['query_supplier_discovery'], expectedSourceTags: ['T1-MCP'] },

  // 6. 物流管理
  { id: 'S11', scenario: '货运追踪', dimension: '实时状态',
    query: '当前有多少批货物处于延误状态？延误超过7天的有哪些？', expectedTools: ['query_logistics'], expectedSourceTags: ['T1-MCP'] },
  { id: 'S12', scenario: '港口天气', dimension: '外部数据融合',
    query: '洛杉矶港和长滩港目前的天气状况如何？是否有影响货运的风险？', expectedTools: ['query_weather'], expectedSourceTags: ['T1-MCP'] },

  // 7. 销售分析
  { id: 'S13', scenario: '销售预测', dimension: '预测精度',
    query: '预测未来14天厨房类产品的日销售额，给出置信区间', expectedTools: ['query_sales','forecast_demand'], expectedSourceTags: ['T1-MCP'] },
  { id: 'S14', scenario: '季节性分析', dimension: '时间序列',
    query: '分析最近一年销售数据的季节性波动规律，哪些月份是旺季？', expectedTools: ['calculate_seasonal_decompose'], expectedSourceTags: ['T1-MCP'] },

  // 8. 风险传播
  { id: 'S15', scenario: '台风场景', dimension: '仿真模拟',
    query: '如果太平洋台风导致中美航线延误10天，对供应链的连锁影响是什么？用级联风险模型分析', expectedTools: ['query_cascade_risk'], expectedSourceTags: ['T1-MCP'] },
  { id: 'S16', scenario: '贸易战场景', dimension: '情景规划',
    query: '假设美国再次加征25%关税，对公司整体供应链成本的影响模拟', expectedTools: ['query_cascade_risk','query_tariff'], expectedSourceTags: ['T1-MCP'] },

  // 9. 质量与召回
  { id: 'S17', scenario: '缺陷分析', dimension: '质量控制',
    query: '最近90天的产品缺陷分布如何？哪个缺陷类型最严重？根因是什么？', expectedTools: ['query_products'], expectedSourceTags: ['T1-MCP'] },
  { id: 'S18', scenario: '召回风险', dimension: '召回预警',
    query: '检查CPSC最近有没有中国产小家电的召回公告', expectedTools: ['query_cpsc_recalls','web_search'], expectedSourceTags: ['T1-MCP','T3-Search'] },

  // 10. 采购与定价
  { id: 'S19', scenario: '采购计划', dimension: '联合决策',
    query: '给出5个A类产品的联合补货方案，平衡订货成本和持有成本', expectedTools: ['calculate_joint_replenishment'], expectedSourceTags: ['T1-MCP'] },
  { id: 'S20', scenario: '定价优化', dimension: '利润最大',
    query: '某产品成本35元，需求弹性-1.8，当前售价79元，最优定价是多少？', expectedTools: ['calculate_optimal_pricing'], expectedSourceTags: ['T1-MCP'] },

  // ==================== 10+ Cross-Cutting Dimensions ====================

  // 21. 联网搜索
  { id: 'D01', scenario: '联网搜索', dimension: '搜索集成',
    query: '最近国际上对小家电出口有什么新的法规或贸易政策变化？搜索最新信息', expectedTools: ['web_search'], expectedSourceTags: ['T3-Search'] },

  // 22. 多轮对话
  { id: 'D02', scenario: '大宗商品', dimension: '多源数据融合',
    query: '最近铜价走势如何？结合LME期货和国内现货价格分析', expectedTools: ['query_commodities'], expectedSourceTags: ['T1-MCP'] },

  // 23. 复杂推理
  { id: 'D03', scenario: '综合决策', dimension: '复杂推理',
    query: '综合考虑库存水平、供应商交期、海运瓶颈和汇率波动，给出下个季度采购优先级排序', expectedTools: ['query_inventory','query_suppliers','query_weather','query_exchange_rates'], expectedSourceTags: ['T1-MCP'] },

  // 24. 错误处理
  { id: 'D04', scenario: '异常输入', dimension: '鲁棒性',
    query: '帮我查询 SKU-99999-NOTFOUND 这个不存在的产品的所有信息', expectedTools: ['query_products'], expectedSourceTags: ['T1-MCP'] },

  // 25. 置信度表达
  { id: 'D05', scenario: '不确定性问题', dimension: '置信度准确',
    query: '明年这个时候的欧元/美元汇率会是多少？', expectedTools: [], expectedSourceTags: ['T0-LLM'] },

  // 26. 供应链评分
  { id: 'D06', scenario: '健康诊断', dimension: '指标体系',
    query: '给公司供应链做一个全面的健康检查报告，包括库存健康、物流效率、成本控制、供应商可靠性', expectedTools: ['query_dashboard'], expectedSourceTags: ['T1-MCP'] },

  // 27. 数据钻取
  { id: 'D07', scenario: '深度钻取', dimension: '数据层层下钻',
    query: '先给我整体库存概览，然后聚焦到厨房类产品，再细化到A类SKU的具体库存状态', expectedTools: ['query_inventory'], expectedSourceTags: ['T1-MCP'] },

  // 28. 中英混合
  { id: 'D08', scenario: '中英混合', dimension: '多语言',
    query: 'Compare our FOB Shenzhen cost vs landed cost in LA for the top 3 SKUs by volume', expectedTools: ['query_cost','query_inventory'], expectedSourceTags: ['T1-MCP'] },

  // 29. 模糊语义
  { id: 'D09', scenario: '模糊查询', dimension: '语义理解',
    query: '最近公司运营状况怎么样？有没有什么需要我担心的？', expectedTools: ['query_dashboard'], expectedSourceTags: ['T1-MCP'] },

  // 30. 竞品分析
  { id: 'D10', scenario: '市场情报', dimension: '竞争分析',
    query: 'Amazon上我们主要竞品的定价策略如何？对比我们的价格有什么建议？', expectedTools: ['query_amazon_competitors'], expectedSourceTags: ['T1-MCP'] },
];

async function runQuery(tc: TestCase): Promise<Result> {
  const start = Date.now();
  let status = 0;
  let responseBody = '';
  try {
    const resp = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: tc.query, provider: 'deepseek', stream: false }),
    });
    status = resp.status;
    responseBody = await resp.text();
  } catch (e) {
    responseBody = `FETCH_ERROR: ${e}`;
  }
  const elapsed = Date.now() - start;

  let data: any = {};
  try { data = JSON.parse(responseBody); } catch { data = { error: responseBody }; }

  const reply = data?.data?.reply || data?.reply || data?.error || '';
  const toolCallMatch = reply.match(/<tool>[\s\S]*?<\/tool>/gi) || [];
  const hasSourceTag = /\[T\d-[A-Z]+\]/i.test(reply);
  const sourceTags = [...new Set((reply.match(/\[T\d-[A-Z]+\]/gi) || []))];
  const hasConfidence = /\[高\]|\[中\]|\[低\]/.test(reply);

  return {
    id: tc.id, scenario: tc.scenario, dimension: tc.dimension,
    response: reply.substring(0, 300), elapsed, status,
    hasReply: reply.length > 10,
    hasToolCall: toolCallMatch.length > 0,
    toolCalls: [...new Set(toolCallMatch.map(t => t.match(/<tool>([\w_]+)<\/tool>/)?.[1] || 'unknown'))],
    hasSourceTag, sourceTags, hasConfidence,
    tokenLen: reply.length,
  };
}

async function main() {
  console.log('='.repeat(70));
  console.log('SupplyChain Cortex Chat Assistant — Capability Evaluation');
  console.log('='.repeat(70));
  console.log(`Test queries: ${TEST_QUERIES.length} | Provider: deepseek`);
  console.log('');

  const results: Result[] = [];
  for (const tc of TEST_QUERIES) {
    process.stdout.write(`  [${tc.id}] ${tc.scenario}... `);
    const r = await runQuery(tc);
    results.push(r);
    const icon = r.hasReply ? (r.hasSourceTag ? '✓' : '△') : '✗';
    console.log(`${icon} ${r.elapsed}ms ${r.tokenLen}chars`);
  }

  // ==================== Analysis ====================
  console.log('');
  console.log('='.repeat(70));
  console.log('RESULTS ANALYSIS');
  console.log('='.repeat(70));

  const success = results.filter(r => r.hasReply && r.status === 200);
  const withTools = results.filter(r => r.hasToolCall);
  const withSources = results.filter(r => r.hasSourceTag);
  const withConfidence = results.filter(r => r.hasConfidence);

  console.log(`\n📊 Overall:`);
  console.log(`   成功率: ${success.length}/${results.length} (${Math.round(success.length/results.length*100)}%)`);
  console.log(`   平均延迟: ${Math.round(results.reduce((s,r)=>s+r.elapsed,0)/results.length)}ms`);
  console.log(`   平均响应长度: ${Math.round(results.reduce((s,r)=>s+r.tokenLen,0)/results.length)} chars`);

  console.log(`\n🔧 工具调用:`);
  console.log(`   启用了工具: ${withTools.length}/${results.length} (${Math.round(withTools.length/results.length*100)}%)`);
  const allTools = results.flatMap(r => r.toolCalls);
  const toolFreq: Record<string,number> = {};
  allTools.forEach(t => { toolFreq[t] = (toolFreq[t]||0)+1; });
  Object.entries(toolFreq).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([t,c]) => {
    console.log(`   ${t}: ${c}次`);
  });

  console.log(`\n🏷️ 来源标注:`);
  console.log(`   标注了来源: ${withSources.length}/${results.length} (${Math.round(withSources.length/results.length*100)}%)`);
  const allTags = results.flatMap(r => r.sourceTags);
  const tagFreq: Record<string,number> = {};
  allTags.forEach(t => { tagFreq[t] = (tagFreq[t]||0)+1; });
  Object.entries(tagFreq).sort().forEach(([t,c]) => {
    console.log(`   ${t}: ${c}次`);
  });

  console.log(`\n📈 置信度:`);
  console.log(`   表达了置信度: ${withConfidence.length}/${results.length} (${Math.round(withConfidence.length/results.length*100)}%)`);

  // By scenario category
  console.log(`\n📋 业务场景表现:`);
  results.forEach(r => {
    const score = (r.hasReply?2:0) + (r.hasSourceTag?1:0) + (r.hasConfidence?1:0) + (r.hasToolCall?1:0);
    const bar = '█'.repeat(Math.min(5, score)) + '░'.repeat(Math.max(0,5-score));
    console.log(`   ${r.id} ${r.scenario.padEnd(12)} ${bar} ${r.hasSourceTag?'[来源]':''} ${r.hasConfidence?'[置信度]':''} ${r.hasToolCall?'[工具: '+r.toolCalls.join(',')+']':''}`);
  });

  // Dimension analysis
  console.log(`\n🔬 交叉维度评估:`);
  const dimMap = new Map<string,Result[]>();
  results.forEach(r => {
    if (!dimMap.has(r.dimension)) dimMap.set(r.dimension, []);
    dimMap.get(r.dimension)!.push(r);
  });
  dimMap.forEach((rs, dim) => {
    const pass = rs.filter(r => r.hasReply);
    const avgElapsed = Math.round(rs.reduce((s,r)=>s+r.elapsed,0)/rs.length);
    console.log(`   ${dim.padEnd(16)}: ${pass.length}/${rs.length} 通过  avg ${avgElapsed}ms`);
  });

  // Save detailed results
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      success: success.length,
      successRate: Math.round(success.length/results.length*100),
      avgLatencyMs: Math.round(results.reduce((s,r)=>s+r.elapsed,0)/results.length),
      avgResponseLen: Math.round(results.reduce((s,r)=>s+r.tokenLen,0)/results.length),
      toolCallRate: Math.round(withTools.length/results.length*100),
      sourceTagRate: Math.round(withSources.length/results.length*100),
      confidenceRate: Math.round(withConfidence.length/results.length*100),
    },
    results: results.map(r => ({ ...r, response: r.response.substring(0, 500) })),
  };

  const outPath = 'test-results/chat-eval/capability-report.json';
  Bun.write(outPath, JSON.stringify(report, null, 2));
  console.log(`\n详细报告已保存: ${outPath}`);
}

main().catch(console.error);
