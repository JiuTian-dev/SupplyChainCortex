/**
 * Supply Chain RAG (Retrieval-Augmented Generation) — Minimal Edition.
 *
 * Self-contained keyword + TF-IDF retrieval. No external API required.
 * Knowledge base covers: tariff rules, trade agreements, shipping terms,
 * compliance requirements, and supply chain best practices.
 *
 * Architecture:
 *   User query → chunk retrieval (TF-IDF) → top-K chunks → augment prompt
 */

// ─── Knowledge Base ─────────────────────────────────────────────────────────────

interface KnowledgeChunk {
  id: string;
  domain: 'tariff' | 'logistics' | 'compliance' | 'risk' | 'general';
  title: string;
  content: string;
  keywords: string[];
}

const KNOWLEDGE_BASE: KnowledgeChunk[] = [
  // ── Tariff & Trade ─────────────────────────────────────────────────────────
  {
    id: 'tariff-section301',
    domain: 'tariff',
    title: 'Section 301 关税条款',
    content: '美国贸易法 Section 301 授权 USTR 对知识产权侵权国的商品加征关税。2026年，Section 301 覆盖约 $300B 中国进口商品，税率 7.5%-25%。豁免品类: 医疗设备、部分半导体、环保产品。每年 8 月 USTR 复审一次。建议出口商申请 exclusion 或利用首次销售规则降低关税基数。注意: de minimis $800 以下包裹暂免 Section 301。',
    keywords: ['301', '关税', 'section', '美国', '贸易战', 'USTR', '豁免', 'exclusion', 'de minimis'],
  },
  {
    id: 'tariff-cbam',
    domain: 'tariff',
    title: 'EU CBAM 碳边境调节机制',
    content: '2026年10月起，EU CBAM 进入正式征收期。覆盖6大品类: 钢铁、铝、水泥、化肥、电力、氢。进口商需购买 CBAM 证书，价格 = EU-ETS 碳配额周均价。过渡期(2023-2025)仅需报告碳排放。2026年起需实际购买证书。对中国出口影响: 钢铁制品关税等效增加 5-8%，铝制品 3-5%。建议出口商进行产品碳足迹核算(PAS 2050或ISO 14067标准)。',
    keywords: ['CBAM', '碳关税', '欧盟', '碳边境', '碳排放', 'ETS', '钢铁', '铝'],
  },
  {
    id: 'tariff-rcep',
    domain: 'tariff',
    title: 'RCEP 区域全面经济伙伴关系协定',
    content: 'RCEP 覆盖15国: 中日韩澳新 + 东盟10国。累计原产地规则(RVC 40%)。关税减让表分20年逐步降税。中日首次建立双边关税减让: 日本对中国 86% 商品最终零关税，中国对日本 88% 商品最终零关税。关键品类: 家电(RVC 40%可享优惠)、汽车零部件(部分立即零关税)、纺织品。原产地证书可自助打印，无需商会签章。',
    keywords: ['RCEP', '区域全面经济伙伴关系', '原产地', '中日', '关税减让', 'RVC', '东盟'],
  },
  {
    id: 'tariff-hs-classification',
    domain: 'tariff',
    title: 'HS 编码归类与关税优化',
    content: 'HS 编码前6位为国际通用，后4位各国自定。常见归类风险: 多功能产品(按主要功能归类)、零件vs整机(零件通常税率更低)、成套包装(按最高税率品类归类)。优化策略: 拆分发货(零件单独报关)、利用 FTA 原产地规则、首次销售规则(First Sale Rule)降低完税价格。美国 CBP 对归类错误可追溯5年补税+罚款。建议使用 Customs Ruling 预先裁定。',
    keywords: ['HS编码', '海关编码', '归类', '关税优化', '报关', 'FTA', '原产地', 'CBP'],
  },

  // ── Logistics & Shipping ───────────────────────────────────────────────────
  {
    id: 'logistics-incoterms',
    domain: 'logistics',
    title: 'Incoterms 2020 贸易术语',
    content: 'FOB(离岸价): 卖方负责装船前所有费用，买方负责海运+保险+目的港费用。CIF(到岸价): 卖方负责海运+保险至目的港。DDP(完税后交货): 卖方承担所有关税+增值税+清关费用(风险最大，建议避免)。EXW(工厂交货): 买方承担全部运费+关税。跨境小家电建议 FOB 或 CIF，避免 DDP(美国进口需Bond+POA，个人难以办理)。亚马逊FBA建议 DAP(不含清关)。',
    keywords: ['Incoterms', 'FOB', 'CIF', 'DDP', 'EXW', '贸易术语', 'FBA', '亚马逊', '清关'],
  },
  {
    id: 'logistics-container',
    domain: 'logistics',
    title: '集装箱运费与航线选择',
    content: '2026年主要航线运费(40GP): 上海→洛杉矶 $1,800-2,500, 上海→纽约 $2,800-3,500, 上海→汉堡 $2,200-3,000。旺季(8-10月)运费 +20-40%。影响运费因素: 苏伊士/巴拿马运河通行费、燃油附加费(BAF)、旺季附加费(PSS)。中小卖家建议货代拼箱(LCL)或使用快船服务(Matson/美森 12天上海→长滩)。注意: 2026年 IMO 碳排放新规可能推高运费 3-5%。',
    keywords: ['集装箱', '运费', '航线', '40GP', '拼箱', 'LCL', 'BAF', 'PSS', 'Matson', '美森'],
  },
  {
    id: 'logistics-port-risks',
    domain: 'logistics',
    title: '主要港口风险与替代路线',
    content: '洛杉矶/长滩港(美西): 罢工风险(ILWU合同2028到期)、冬季风暴延误。替代: 奥克兰港、西雅图港、加拿大温哥华港(铁路转运至美国中西部)。纽约/新泽西港(美东): 巴拿马运河干旱限行(2026年每日通行量限制至24艘)。替代: 苏伊士运河→地中海→美东、或墨西哥 Lazaro Cardenas 港+铁路至休斯顿。宁波/上海港(中国): 台风季节(7-9月)间歇性关闭。替代: 深圳、厦门港。',
    keywords: ['港口', '延误', '罢工', '替代路线', '洛杉矶', '长滩', '纽约', '宁波', '上海', '台风'],
  },

  // ── Compliance & Certification ─────────────────────────────────────────────
  {
    id: 'compliance-fcc',
    domain: 'compliance',
    title: 'FCC 认证(美国无线设备)',
    content: '所有含无线发射模块的产品(蓝牙/WiFi/2.4G/5G)必须通过 FCC 认证。两种路径: FCC-SDOC(普通电子，自我声明+认可实验室测试，$1,000-3,000) 和 FCC-ID(无线发射，需 TCB 审核，$5,000-15,000)。注意: 带 WiFi 的小家电(如智能电饭煲、WiFi榨汁机)按 FCC-ID 认证。标签必须印有 FCC ID，用户手册含 FCC 合规声明。违规罚款: $20,000/天，可追溯。',
    keywords: ['FCC', '认证', '无线', '蓝牙', 'WiFi', '美国', 'TCB', '罚款'],
  },
  {
    id: 'compliance-ce-ukca',
    domain: 'compliance',
    title: 'CE/UKCA 认证(欧盟/英国)',
    content: '2026年 CE 认证仍适用于 EU 27国。英国脱欧后需 UKCA 标志(2025年起强制执行，不再接受 CE)。家电需满足: LVD 低电压指令(2014/35/EU)、EMC 电磁兼容指令(2014/30/EU)、RoHS 有害物质限制(2011/65/EU+修订)。部分品类需 ERP 能效标签(如空调、冰箱、吸尘器)。CE 认证需 EU 境内授权代表(Authorized Representative)。UKCA 需 UK 境内 Responsible Person。',
    keywords: ['CE', 'UKCA', '欧盟', '英国', '认证', 'LVD', 'EMC', 'RoHS', 'ERP', '能效', '授权代表'],
  },
  {
    id: 'compliance-gdpr',
    domain: 'compliance',
    title: 'GDPR 数据隐私合规',
    content: '智能家电(含App/云连接功能)在欧盟销售必须 GDPR 合规。核心要求: 数据最小化(只收集必要数据)、用户同意(opt-in，不能默认勾选)、数据可携带(用户可下载所有数据)、72小时泄露通知、DPO 任命(大规模处理用户数据时)。罚款: 最高全球营收4%或€20M(取高者)。建议: App 提供隐私政策链接、服务器优先部署在 Frankfurt/Paris 节点。注意: 2026年 EU AI Act 对 AI 功能家电有额外要求。',
    keywords: ['GDPR', '数据隐私', '欧盟', '智能家电', 'App', '云连接', '罚款', '隐私政策', 'AI Act'],
  },

  // ── Risk Management ────────────────────────────────────────────────────────
  {
    id: 'risk-fx-hedging',
    domain: 'risk',
    title: '汇率风险管理与锁汇策略',
    content: '跨境卖家面临 CNY/USD 汇率波动风险(年波动 5-10%)。常用对冲工具: 远期结汇(锁定未来汇率，银行收取 1-2% 保证金)、期权(买权付保费 0.5-1.5%)、自然对冲(USD收入直接支付USD采购/运费)。建议: 70% 预期收入做远期锁汇，20% 做期权保护，10% 保留现货灵活。关注美联储 FOMC 会议(每6周)和中国人民银行 LPR 调整。当前(2026年)USD/CNY 中枢 7.0-7.3。',
    keywords: ['汇率', '锁汇', '远期结汇', '期权', 'FX', 'USD', 'CNY', '对冲', 'FOMC'],
  },
  {
    id: 'risk-inventory-buffer',
    domain: 'risk',
    title: '安全库存与缓冲策略',
    content: '经典安全库存公式: SS = Z × σ × √LT。其中 Z=服务水平系数(95%→1.65, 99%→2.33), σ=需求标准差, LT=lead time(天)。跨境卖家建议: A类产品(占80%营收) Z=2.33(99%服务水平)，B类产品 Z=1.65，C类产品 Z=1.28。考虑因素: 海运不确定性(+2-3周缓冲)、关税政策变动(提前备货 30-45天)、季节性(Prime Day 前备货翻倍)。周转天数>90天视为滞销，建议清仓促销。',
    keywords: ['安全库存', '缓冲', 'Z值', 'lead time', '服务水平', 'ABC分类', '周转天数', '滞销'],
  },
  {
    id: 'risk-supplier-diversification',
    domain: 'risk',
    title: '供应商多元化策略',
    content: '供应链韧性第一原则: 不依赖单一供应商。评估标准: 供应商评分(quality×0.3 + onTime×0.3 + cost×0.25 + flexibility×0.15)。建议: A类物料≥3家合格供应商、关键物料≥2家不同地理区域。每季度供应商评审，年度淘汰末尾10%。2026年趋势: China+1策略(越南、墨西哥、印度作为第二供应源)。注意: 供应商切换成本(模具$5K-50K、认证3-6个月、打样2-4周)。',
    keywords: ['供应商', '多元化', '评估', 'China+1', '越南', '墨西哥', '切换', '韧性'],
  },

  // ── General Best Practices ─────────────────────────────────────────────────
  {
    id: 'general-fba-optimization',
    domain: 'general',
    title: '亚马逊 FBA 库存优化',
    content: 'IPI 分数<400 将限制库容并加收超额费。提高 IPI: 清理滞销库存(创建移除订单)、提高 sell-through rate(保持>2.0)、修复 suppressed listings。FBA 仓储费: 1-9月 $0.87/立方英尺, 10-12月 $2.40/立方英尺。长期仓储费(>365天): $6.90/立方英尺或 $0.15/件(取高者)。建议: Prime Day 前90天开始备货，Black Friday 前60天开始备货。使用 AGL(Amazon Global Logistics)可降低头程运费15-20%。',
    keywords: ['FBA', '亚马逊', 'IPI', '仓储费', 'Prime Day', 'sell-through', 'AGL'],
  },
  {
    id: 'general-cross-border-tax',
    domain: 'general',
    title: '跨境税务与转让定价',
    content: '美国: 销售税由 Marketplace Facilitator(亚马逊等平台)代收代缴，卖家无需注册(除自行建站)。欧盟: IOSS(进口一站式服务)适用于≤€150包裹，税率=目的地国增值税率(17-27%)。英国: 2026年 VAT 20%，£135以下商品由平台代收。转让定价: 关联企业间交易需按独立交易原则(Arm\'s Length Principle)定价，准备 TP Documentation(主体文档+本地文档+国别报告)。中国: 跨境电商出口退税(增值税13%→出口0%，可退进项税)。',
    keywords: ['税务', '增值税', 'VAT', 'IOSS', '销售税', '转让定价', '退税', '出口退税'],
  },
];

// ─── Vector Store ────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9一-鿿\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function computeTF(chunk: KnowledgeChunk): Record<string, number> {
  const tokens = tokenize(chunk.title + ' ' + chunk.content + ' ' + chunk.keywords.join(' '));
  const tf: Record<string, number> = {};
  for (const t of tokens) {
    tf[t] = (tf[t] || 0) + 1;
  }
  const total = tokens.length || 1;
  for (const t of Object.keys(tf)) {
    tf[t] /= total;
  }
  return tf;
}

// IDF: inverse document frequency
function computeIDF(chunks: KnowledgeChunk[]): Record<string, number> {
  const df: Record<string, number> = {};
  for (const chunk of chunks) {
    const tokens = new Set(tokenize(chunk.title + ' ' + chunk.content));
    for (const t of tokens) {
      df[t] = (df[t] || 0) + 1;
    }
  }
  const N = chunks.length;
  const idf: Record<string, number> = {};
  for (const [t, count] of Object.entries(df)) {
    idf[t] = Math.log((N - count + 0.5) / (count + 0.5) + 1);
  }
  return idf;
}

// ─── Retrieval ───────────────────────────────────────────────────────────────────

export interface RAGResult {
  chunk: KnowledgeChunk;
  score: number;
  relevance: string;
}

/**
 * Retrieve top-K most relevant knowledge chunks for a query.
 * Uses TF-IDF cosine similarity (self-contained, zero API calls).
 */
export function retrieveKnowledge(query: string, topK = 3): RAGResult[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const tfs = KNOWLEDGE_BASE.map(c => computeTF(c));
  const idf = computeIDF(KNOWLEDGE_BASE);

  // Query TF-IDF vector
  const queryTF: Record<string, number> = {};
  for (const t of queryTokens) {
    queryTF[t] = (queryTF[t] || 0) + 1;
  }
  const queryLen = queryTokens.length;
  for (const t of Object.keys(queryTF)) {
    queryTF[t] = (queryTF[t] / queryLen) * (idf[t] || 1);
  }

  // Cosine similarity
  const scores = KNOWLEDGE_BASE.map((chunk, i) => {
    const tf = tfs[i];
    let dotProduct = 0;
    let queryNorm = 0;
    let chunkNorm = 0;

    for (const t of Object.keys(queryTF)) {
      dotProduct += queryTF[t] * (tf[t] || 0);
      queryNorm += queryTF[t] ** 2;
    }
    for (const v of Object.values(tf)) {
      chunkNorm += v ** 2;
    }

    queryNorm = Math.sqrt(queryNorm) || 1;
    chunkNorm = Math.sqrt(chunkNorm) || 1;
    return { chunk, score: dotProduct / (queryNorm * chunkNorm) };
  });

  return scores
    .filter(s => s.score > 0.02)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(s => ({
      ...s,
      relevance: s.score > 0.3 ? 'high' : s.score > 0.1 ? 'medium' : 'low',
    }));
}

/**
 * Build a prompt augmentation string from retrieved chunks.
 */
export function augmentPrompt(query: string, results: RAGResult[]): string {
  if (results.length === 0) return '';

  const lines = [
    '\n\n--- 供应链知识库参考(供参考，帮助回答用户问题) ---',
    ...results.map((r, i) =>
      `[${i + 1}] ${r.chunk.title} (领域: ${r.chunk.domain}, 相关度: ${r.relevance})\n${r.chunk.content}`
    ),
    '--- 知识库引用结束 ---\n',
  ];
  return lines.join('\n\n');
}

/** List all knowledge domains */
export function getRAGDomains(): string[] {
  return [...new Set(KNOWLEDGE_BASE.map(c => c.domain))];
}

/** Search by domain */
export function searchByDomain(domain: string): KnowledgeChunk[] {
  return KNOWLEDGE_BASE.filter(c => c.domain === domain);
}
