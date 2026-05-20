/**
 * SupplyChain Cortex Chat Assistant — Web Search Capability Evaluation
 * 15 business scenarios + 12 evaluation angles
 */
const BASE = 'http://localhost:3000';

interface WSTestCase {
  id: string;
  scenario: string;
  angle: string;
  query: string;
  requiresSearch: boolean;
}

interface WSResult {
  id: string;
  scenario: string;
  angle: string;
  response: string;
  elapsed: number;
  status: number;
  hasReply: boolean;
  hasSourceTag: boolean;
  sourceTags: string[];
  hasSearchTag: boolean;
  hasConfidence: boolean;
  hasNumericData: boolean;
  hasChineseText: boolean;
  hasEnglishText: boolean;
  tokenLen: number;
  mentionsSource: boolean;
}

const WS_TESTS: WSTestCase[] = [
  // ==================== 15 Business Scenarios ====================

  // 1. 最新贸易政策
  { id: 'W01', scenario: '贸易政策', angle: '政策追踪',
    query: '美国最近对中国小家电有没有新的关税调整或贸易限制措施？搜索最新消息', requiresSearch: true },

  // 2. 实时运价
  { id: 'W02', scenario: '运价查询', angle: '实时数据',
    query: '最新SCFI上海出口集装箱运价指数是多少？美西航线和欧洲航线分别什么价格？', requiresSearch: true },

  // 3. 港口拥堵
  { id: 'W03', scenario: '港口动态', angle: '时效性',
    query: '洛杉矶港、长滩港和上海港目前的拥堵状况如何？有没有罢工或延误新闻？', requiresSearch: true },

  // 4. 大宗商品
  { id: 'W04', scenario: '商品行情', angle: '价格追踪',
    query: '最近LME铜价和铝价走势如何？对家电制造成本有什么影响？', requiresSearch: true },

  // 5. 欧盟法规
  { id: 'W05', scenario: '法规变更', angle: '合规情报',
    query: '欧盟2026年对小家电有没有出台新的环保或安全法规？碳边境调整机制CBAM有什么最新进展？', requiresSearch: true },

  // 6. 竞品动态
  { id: 'W06', scenario: '竞品情报', angle: '市场监测',
    query: '中山、顺德一带的家电出口企业最近有什么重要新闻或动态？', requiresSearch: true },

  // 7. 汇率走势
  { id: 'W07', scenario: '汇率追踪', angle: '金融数据',
    query: '最近一周人民币兑美元汇率走势如何？央行有没有调整中间价？对出口利润有什么影响？', requiresSearch: true },

  // 8. 碳价追踪
  { id: 'W08', scenario: '碳价追踪', angle: 'ESG数据',
    query: 'EU ETS欧盟碳价目前是多少？最近有什么波动？对中国出口商的影响有多大？', requiresSearch: true },

  // 9. 海运保险
  { id: 'W09', scenario: '海运风险', angle: '突发事件',
    query: '最近红海和中东局势对全球航运有什么影响？保险公司有没有调整战争险费率？', requiresSearch: true },

  // 10. 天气预警
  { id: 'W10', scenario: '天气预警', angle: '风险预警',
    query: '太平洋台风季预测2026年会有几个台风？对中美航线有什么潜在影响？', requiresSearch: true },

  // 11. 召回公告
  { id: 'W11', scenario: '产品召回', angle: '安全监控',
    query: 'CPSC最新发布的中国产小家电召回有哪些？有没有涉及空气炸锅或榨汁机的？', requiresSearch: true },

  // 12. 跨境电商
  { id: 'W12', scenario: '电商政策', angle: '平台规则',
    query: 'Amazon、Temu和SHEIN最近有没有调整卖家费用或供应链物流政策？', requiresSearch: true },

  // 13. 展会动态
  { id: 'W13', scenario: '行业展会', angle: '行业情报',
    query: '2026年有哪些重要的国际家电展会？IHA芝加哥展和IFA柏林展的具体时间是什么？', requiresSearch: true },

  // 14. 产业转移
  { id: 'W14', scenario: '产业趋势', angle: '战略情报',
    query: '中国家电产业链向东南亚和墨西哥转移的趋势如何？最近有哪些企业在海外建厂？', requiresSearch: true },

  // 15. 可持续性
  { id: 'W15', scenario: '可持续发展', angle: 'ESG战略',
    query: '欧盟新电池法规和电子产品可维修权法案对小家电行业有什么新要求？', requiresSearch: true },

  // ==================== 12 Evaluation Angles (Additional) ====================

  // 16. 搜索真实性
  { id: 'A01', scenario: '事实核查', angle: '准确性验证',
    query: '请搜索确认：2026年5月的人民币兑美元中间价具体是多少？给出精确数字和来源', requiresSearch: true },

  // 17. 多来源对比
  { id: 'A02', scenario: '多源对比', angle: '来源多样性',
    query: '小家电跨境电商的物流成本最近有什么变化？请从不同来源对比分析', requiresSearch: true },

  // 18. 中英混合搜索
  { id: 'A03', scenario: '中英搜索', angle: '多语言检索',
    query: 'Search for latest US CPSC small kitchen appliance recalls AND Chinese customs export data for Q1 2026', requiresSearch: true },

  // 19. 深度综合分析
  { id: 'A04', scenario: '深度研究', angle: '信息综合',
    query: '做一份关于"特朗普关税2.0时代中国小家电出口策略"的深度分析，结合最新政策和市场数据', requiresSearch: true },

  // 20. 无结果降级
  { id: 'A05', scenario: '罕见查询', angle: '降级处理',
    query: '2026年5月19日上午10点宁波舟山港3号泊位的实时靠泊船只有哪些？', requiresSearch: true },

  // 21. 搜索+本地融合
  { id: 'A06', scenario: '数据融合', angle: '搜索与DB融合',
    query: '将我司的库存数据和当前国际铜价走势结合起来，分析哪些产品面临成本上升风险', requiresSearch: true },

  // 22. 时效验证
  { id: 'A07', scenario: '时效验证', angle: '时间敏感',
    query: '最近24小时关于中美贸易的突发新闻是什么？只给我最新的消息', requiresSearch: true },

  // 23. 敏感话题
  { id: 'A08', scenario: '政治敏感', angle: '安全边界',
    query: '中国政府对家电出口有没有新的补贴或限制政策？', requiresSearch: true },

  // 24. 技术问题
  { id: 'A09', scenario: '技术查询', angle: '专业深度',
    query: '最新的变频电机技术和热泵干燥技术在家电中的应用趋势是什么？搜索最新技术论文和专利', requiresSearch: true },

  // 25. 极端模糊
  { id: 'A10', scenario: '模糊查询', angle: '鲁棒性',
    query: '最近发生的影响我们出口的事情有哪些？给我一个全面的简报', requiresSearch: true },
];

async function runQ(tc: WSTestCase): Promise<WSResult> {
  const start = Date.now();
  let status = 0;
  let body = '';
  try {
    const r = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: tc.query, provider: 'deepseek', stream: false }),
    });
    status = r.status;
    body = await r.text();
  } catch (e) { body = `FETCH_ERROR: ${e}`; }
  const elapsed = Date.now() - start;

  let data: any = {};
  try { data = JSON.parse(body); } catch { data = { error: body }; }
  const reply = data?.data?.reply || data?.reply || data?.error || '';
  const sourceTags = [...new Set((reply.match(/\[T\d-[A-Za-z]+\]/gi) || []))];

  return {
    id: tc.id, scenario: tc.scenario, angle: tc.angle,
    response: reply.substring(0, 200), elapsed, status,
    hasReply: reply.length > 10,
    hasSourceTag: sourceTags.length > 0,
    sourceTags,
    hasSearchTag: sourceTags.includes('[T3-Search]'),
    hasConfidence: /\[高\]|\[中\]|\[低\]/.test(reply),
    hasNumericData: /\d+[\d,.]*/.test(reply) && reply.length > 50,
    hasChineseText: /[一-鿿]/.test(reply),
    hasEnglishText: /[a-zA-Z]{3,}/.test(reply),
    tokenLen: reply.length,
    mentionsSource: /来源|source|引用|据.*报道|http/i.test(reply),
  };
}

async function main() {
  console.log('='.repeat(70));
  console.log('SupplyChain Cortex — Web Search Capability Evaluation');
  console.log(`Tests: ${WS_TESTS.length} | Mode: non-streaming`);
  console.log('='.repeat(70));

  const results: WSResult[] = [];
  for (const tc of WS_TESTS) {
    process.stdout.write(`  [${tc.id}] ${tc.scenario.padEnd(14)}… `);
    const r = await runQ(tc);
    results.push(r);
    const icon = r.hasSearchTag ? '✓' : r.hasSourceTag ? '△' : '✗';
    const search = r.hasSearchTag ? '[搜索]' : '';
    process.stdout.write(`${icon} ${r.elapsed}ms ${r.tokenLen}ch ${search}\n`);
  }

  // Analysis
  console.log('');
  console.log('='.repeat(70));
  console.log('ANALYSIS');
  console.log('='.repeat(70));

  const s = results;
  const success = s.filter(r => r.hasReply && r.status === 200);
  const withSearch = s.filter(r => r.hasSearchTag);
  const withSource = s.filter(r => r.hasSourceTag);
  const withConf = s.filter(r => r.hasConfidence);
  const withNum = s.filter(r => r.hasNumericData);

  console.log(`\n✅ Success: ${success.length}/${s.length} (${Math.round(success.length/s.length*100)}%)`);
  console.log(`⏱️  Avg latency: ${Math.round(s.reduce((a,r)=>a+r.elapsed,0)/s.length)}ms`);
  console.log(`📏 Avg length: ${Math.round(s.reduce((a,r)=>a+r.tokenLen,0)/s.length)} chars`);
  console.log(`🔍 [T3-Search] tags: ${withSearch.length}/${s.length}`);
  console.log(`🏷️  Any source tag: ${withSource.length}/${s.length}`);
  console.log(`📊 Confidence labels: ${withConf.length}/${s.length}`);
  console.log(`🔢 Numeric data: ${withNum.length}/${s.length}`);

  const allTags = s.flatMap(r => r.sourceTags);
  const tagFreq: Record<string,number> = {};
  allTags.forEach(t => { tagFreq[t] = (tagFreq[t]||0)+1; });
  console.log('\n🏷️  Source tag distribution:');
  Object.entries(tagFreq).sort().forEach(([t,c]) => {
    console.log(`   ${t}: ${c}次`);
  });

  console.log('\n📋 Scenario performance:');
  const scenarios = [...new Set(s.map(r => r.scenario))];
  scenarios.forEach(sc => {
    const xs = s.filter(r => r.scenario === sc);
    xs.forEach(r => {
      const stars = r.hasSearchTag ? '⭐⭐⭐' : r.hasSourceTag ? '⭐⭐' : '⭐';
      console.log(`   ${stars} ${r.id} ${r.scenario.padEnd(14)} ${r.elapsed}ms ${r.tokenLen}ch ${r.hasSearchTag?'[T3-Search]':r.hasSourceTag?`[${r.sourceTags.join(',')}]`:'[无来源]'}`);
    });
  });

  console.log('\n🔬 Angle evaluation:');
  const angles = [...new Set(s.map(r => r.angle))];
  angles.forEach(ang => {
    const xs = s.filter(r => r.angle === ang);
    const pass = xs.filter(r => r.hasSearchTag || r.hasSourceTag);
    const avg = Math.round(xs.reduce((a,r)=>a+r.elapsed,0)/xs.length);
    console.log(`   ${ang.padEnd(16)}: ${pass.length}/${xs.length} with tags  avg ${avg}ms`);
  });

  // Save
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: s.length, success: success.length,
      successRate: Math.round(success.length/s.length*100),
      searchTagRate: Math.round(withSearch.length/s.length*100),
      sourceTagRate: Math.round(withSource.length/s.length*100),
      confidenceRate: Math.round(withConf.length/s.length*100),
      avgLatencyMs: Math.round(s.reduce((a,r)=>a+r.elapsed,0)/s.length),
      avgLength: Math.round(s.reduce((a,r)=>a+r.tokenLen,0)/s.length),
    },
    results: s.map(r => ({ ...r, response: r.response.substring(0, 300) })),
  };
  Bun.write('test-results/chat-eval/search-capability-report.json', JSON.stringify(report, null, 2));
  console.log(`\n📁 Report saved to test-results/chat-eval/search-capability-report.json`);
}

main().catch(console.error);
