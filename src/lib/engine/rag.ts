/**
 * Supply Chain RAG (Retrieval-Augmented Generation) — Minimal Edition.
 *
 * Self-contained keyword + TF-IDF retrieval. No external API required.
 * Knowledge base covers: tariff rules, trade agreements, shipping terms,
 * compliance requirements, supply chain best practices, production & QC,
 * e-commerce platforms, product safety regulations, and cross-border payments.
 *
 * Architecture:
 *   User query → chunk retrieval (TF-IDF) → top-K chunks → augment prompt
 */

// ─── Knowledge Base ─────────────────────────────────────────────────────────────

interface KnowledgeChunk {
  id: string;
  domain: 'tariff' | 'logistics' | 'compliance' | 'risk' | 'general' | 'production' | 'ecommerce' | 'safety' | 'payment';
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

  // ── Production & Quality Control ───────────────────────────────────────────
  {
    id: 'prod-qc-process',
    domain: 'production',
    title: '小家电 QC 检验标准与流程',
    content: '出口小家电 QC 检验通常采用 AQL 2.5 标准(正常检验水平II)。检验流程: 来料检验(IQC)→过程检验(IPQC)→出货检验(OQC)。关键检查项: 外观(划痕/色差/毛刺)、功能(功率/转速/定时器精度)、安全(耐压测试/泄漏电流/接地电阻)、包装(跌落测试/堆码测试)。第三方验货公司: SGS、TUV、ITS、BV。建议每批次至少抽检 125pcs(AQL 2.5)或 200pcs(AQL 1.5)。新品首次出货建议 100% 全检。',
    keywords: ['QC', '检验', 'AQL', 'SGS', 'TUV', '全检', '抽样', '出货检验', '来料检验'],
  },
  {
    id: 'prod-factory-audit',
    domain: 'production',
    title: '工厂审核标准与验厂指南',
    content: '出口工厂常见审核类型: 质量审核(ISO 9001:2015)、社会责任审核(BSCI/Sedex SMETA/SA8000)、反恐审核(CTPAT/GSV)、品牌专属审核(Amazon/沃尔玛)。审核周期: 初次认证 3-6 个月，年度监督审核。审核重点: 生产能力评估(日产能/月产能/机器清单)、质量管理体系(检验记录/客诉处理/纠正预防措施)、员工权益(工时/工资/社保/安全设施)。建议核心供应商每年至少 1 次现场审核，关键供应商每半年 1 次。',
    keywords: ['工厂审核', '验厂', 'BSCI', 'ISO', '社会责任', 'CTPAT', 'Sedex', '品牌审核'],
  },
  {
    id: 'prod-leadtime',
    domain: 'production',
    title: '小家电生产交期与排程',
    content: '小家电生产周期: 模具开发 30-45 天(新模)、首样确认 7-14 天、大货生产 30-60 天(视订单量和复杂度)。关键路径: 原材料备料→注塑/冲压→喷涂/丝印→PCBA 贴片→总装→测试→包装。常见延误因素: 芯片缺货(MCU/蓝牙模块交期 8-16 周)、定制包材(彩盒 15-20 天)、春节前后(工厂放假+工人流失 30%产能下降)。建议: 淡季(4-7月)下单可缩短 15% 交期，旺季(9-11月)下单需预留 +25% 缓冲时间。',
    keywords: ['交期', 'lead time', '生产周期', '模具', '排程', '春节', '旺季', '芯片', '缺货'],
  },
  {
    id: 'prod-packaging',
    domain: 'production',
    title: '出口包装规范与标准',
    content: '出口包装需满足: 运输安全(ISTA 1A/2A 跌落测试)、环保要求(EU 包装指令 94/62/EC)、防潮防霉(海运高湿环境)。材质: 外箱建议五层瓦楞(B楞+C楞)、内盒三层瓦楞、产品包裹 PE 袋需打孔(防儿童窒息)。小家电包装: 泡沫衬垫或纸浆模塑、附件独立包装(电源线/说明书/保修卡)、彩盒需含 FCC/CE/UKCA 标志及多语言说明书。FBA 包装额外要求: 外箱贴 FBA 标签(可扫描 100%)、单箱<50lb(22.7kg)、无绑带/无松动物料。',
    keywords: ['包装', '外箱', 'ISTA', 'FBA', '彩盒', 'PE袋', '防潮', '跌落测试'],
  },
  {
    id: 'prod-cm-manufacturing',
    domain: 'production',
    title: '跨境电商兼容制造策略',
    content: '面向跨境电商的小家电制造需考虑: 多电压兼容(100-240V宽电压电源，适配美国110V/日本100V/EU230V)、插头适配(US/UK/EU/AU 4种插头)、多语言说明书(中英日德法5语 min)、模块化设计(快速切换面板/配色/功能组合)。优势: 同一模具生产多平台 SKU(亚马逊/速卖通/Temu)，降低模具摊销 30-50%。中性包装+可变标签(平台仓/Local仓)。注意: SKU 过多会增加库龄风险，建议每个产品线控制在 10 个 SKU 以内。',
    keywords: ['跨境电商', 'SKU', '多电压', '模块化', '插头', '中性包装', '制造'],
  },
  {
    id: 'prod-oem-odm',
    domain: 'production',
    title: 'OEM vs ODM 采购策略',
    content: 'OEM(贴牌): 买家提供设计方案，工厂按图生产。优势: 知识产权可控、品质可控、产品差异化。缺点: 开发周期长(3-6个月)、模具费 $5K-50K。ODM(贴牌生产): 工厂提供现成方案，买家选款+改色/改LOGO。优势: 起量快(15-30天可出货)、无需模具费、MOQ 低(500-1000pcs)。缺点: 同质化竞争、品质依赖工厂。建议: 长期爆款走 OEM(建壁垒)、测款/新品走 ODM(低成本试错)。注意: ODM 需签 NDA+NCA(不竞争协议)保护设计。',
    keywords: ['OEM', 'ODM', '贴牌', '模具', 'MOQ', 'NDA', '知识产权', '采购'],
  },
  {
    id: 'prod-sustainability',
    domain: 'production',
    title: '可持续/ESG 生产要求',
    content: '2026年出口欧美小家电 ESG 要求趋严。环境: EU REACH 233项 SVHC 检测、RoHS 10项限用物质、包装材料可回收率>80%。社会: 供应链透明化(GSCP/amfori BEPI)、冲突矿产申报(CMRT)、反强迫劳动审计。披露: EU CSRD 从 2026 年起覆盖大型出口商，需披露范围1/2/3 碳排放。建议: 提前建立碳足迹核算体系(PAS 2050)、工厂光伏安装(降低碳排放+节省电费 20-30%)、取得 ISO 14001 环境管理体系认证。',
    keywords: ['ESG', '可持续', '碳足迹', 'REACH', 'RoHS', 'SVHC', 'CSRD', 'ISO14001', '光伏'],
  },
  {
    id: 'prod-cost-breakdown',
    domain: 'production',
    title: '小家电成本结构拆解',
    content: '小家电典型成本结构: BOM(物料成本)40-50%、人工 15-20%、制造费用(OH)10-15%、物流 15-20%、平台费 8-15%。BOM 中核心部件: 电机/马达 15-25%、PCBA 控制板 10-15%、塑料外壳 10-15%、电源线+插头 3-5%、包装 5-8%。降本策略: 电机国产化替代(降低 30-40%)、塑料二次料掺用(降低 15-20%但影响外观)、PCBA 方案优化(集成芯片替代分立元件)、批量采购(LCL 拼箱→整柜 FCL 降低头程 20%)。总到岸成本(landed cost)应控制在售价的 25-35%。',
    keywords: ['成本结构', 'BOM', '物料', '降本', 'Landed Cost', 'FCL', '人工', '制造费用'],
  },

  // ── E-commerce Platforms ────────────────────────────────────────────────────
  {
    id: 'ecom-amazon-ranking',
    domain: 'ecommerce',
    title: '亚马逊 BSR 排名与搜索优化',
    content: '亚马逊 Best Seller Rank(BSR)每小时更新，基于近期销量+历史销量加权计算。影响排名因素: 关键词索引(Search Term字段+标题+五点+描述)、转化率(A+页面/A+ Premium)、库存时效(FBA in-stock rate需>95%)、Review 数量和评分。PPC 广告: 自动广告(用于跑词+发现新关键词)，手动广告(精准投放高转化词)。TACOS(广告花费占总销售额)健康值: 新品期 15-20%、成长期 10-15%、成熟期 5-8%。ACOS(广告花费占广告销售额)目标<20%。',
    keywords: ['Amazon', 'BSR', '排名', 'PPC', 'ACOS', 'TACOS', '关键词', '优化', 'A+'],
  },
  {
    id: 'ecom-amazon-policy',
    domain: 'ecommerce',
    title: '亚马逊平台政策与账户安全',
    content: '中国卖家账户风险: 关联封号(同一IP/设备/税号/Router)、Review 违规(刷单/礼品卡换评/Official Vine)、知识产权投诉(商标/专利/版权)、产品真实性投诉(假货/跟卖)。预防措施: 1个营业执照对应1个账号、使用独立的收款账号(Payoneer/连连)、FBA 100%合规标签、品牌备案(Brand Registry 2.0)。A-to-Z 索赔率需<1%、ODR(订单缺陷率)需<1%、Late Shipment Rate<4%。账号被关时: 准备好 POA(Action Plan)申诉信、发票/合同/品牌授权书。',
    keywords: ['亚马逊', '政策', '封号', '关联', '投诉', 'ODR', 'Brand Registry', 'A-to-Z', 'POA'],
  },
  {
    id: 'ecom-temu-shein',
    domain: 'ecommerce',
    title: 'Temu/Shein 平台运营策略',
    content: 'Temu 全托管模式: 平台定价+仓储配送，卖家仅负责供货。核价机制: 平台比价 1688+跨境同行，毛利率通常 5-15%。优势: 无需运营团队、出单快(上线 3 天可出单)。劣势: 无定价权、退货率 8-15%(质量问题平台承担但扣款)。Shein 半托管: 卖家自主定价(毛利率 15-25%)但需自行发货至 Shein 国内仓。适合品类: 美容个护/小型厨房电器/家居小件。Temu 2026年重点: 欧洲扩张(12国)、本地仓建立(降低配送时间至 5 天)。建议: Temu 适合清库存(低毛利高周转)，Shein 适合新品测试(中等毛利+品牌曝光)。',
    keywords: ['Temu', 'Shein', '全托管', '半托管', '核价', '清库存', '退货率', '拼多多'],
  },
  {
    id: 'ecom-walmart',
    domain: 'ecommerce',
    title: '沃尔玛 Marketplace 卖家指南',
    content: '沃尔玛美国站 2026年 GMV 约占美国电商 7%(仅次于 Amazon 的 38%)。入驻要求: 营业执照、美国退货地址(可第三方)、WFS(Walmart Fulfillment Services)或自发货。WFS 费用: 低于 FBA 约 15%。定价规则: Walmart 严格要求全网最低价(price parity)，包括与 Amazon 比价。优势: 竞争较少(卖家数量约为 Amazon 的 1/10)、品牌曝光机会(美国线下+线上联动)、退货率低(约 5-8%)。劣势: 后台功能较 Amazon 原始、流量较小、回款周期 T+30。建议: 作为第二平台布局，适合中高单价($30+)品类。',
    keywords: ['沃尔玛', 'Walmart', 'WFS', 'Price Parity', '入驻', '电商', '美国'],
  },
  {
    id: 'ecom-ads-roi',
    domain: 'ecommerce',
    title: '跨境电商广告投放与 ROI 优化',
    content: '跨境电商广告渠道: Amazon PPC(搜索广告+DSP展示广告)、Google Shopping(PLA购物广告)、Meta(Facebook+Instagram信息流广告)、TikTok Shop(短视频+直播带货)。ROI 评分: ROAS 3-5x 健康、CAC(获客成本)<产品售价 20%。预算分配建议: 60% Amazon PPC(精准流量)、20% Google Shopping(品牌词防御)、15% Social(内容种草)、5% 测试新渠道(TikTok/Pinterest)。季节性: Q4 投放预算翻倍(Black Friday+Christmas 占全年 30-40% 销售)。',
    keywords: ['广告', 'ROI', 'PPC', 'ROAS', 'CAC', 'TikTok', 'Google', 'Facebook', 'DSP'],
  },
  {
    id: 'ecom-review-management',
    domain: 'ecommerce',
    title: '产品评价与评分管理',
    content: '亚马逊 Review 策略: Amazon Vine(官方邀请优质评论员，$200/ASIN，适合新品)、合规索评(仅限官方 Request a Review 按钮)、产品插页(引导顾客联系客服解决问题而非差评)。Review 目标: 新品上架 30 天内 15+ Review、评分 4.0+。差评处理: 24小时内回复、无条件补发/退款、联系 Buyer-Seller Messaging(仅限订单相关问题)。Review velocity(评价增速): 每周 3-5 条 Review 增长为健康信号(提升 BSR)。注意: 严禁刷单(Review Manipulation)，违规可能导致 72 小时内账号关闭。',
    keywords: ['Review', '评价', '评分', 'Vine', '索评', '差评', '刷单', '合规'],
  },
  {
    id: 'ecom-returns-logistics',
    domain: 'ecommerce',
    title: '跨境电商退货与逆向物流',
    content: '跨境电商退货率: 服装 20-30%、小家电 5-10%、家居 3-8%。FBA 退货: Amazon 自动处理退货+退款(卖家支付退货处理费 $2-5/件+仓储费)。退货处理: 可售品级(Unfulfillable→Fulfillable 自动转换)、不可售(Remove/Liquidate/Dispose)。第三方退货中心(US$0.5-1.0/件): 检测/翻新/换标/重新入库。退货成本控制: 建议 US/EU 设立海外仓退货中心、残值产品打折销售(Amazon Outlet/eBay)、高价值产品购买退货险。注意: EU 消费者 14 天无条件退货权(电商法)，卖家承担退货运费。',
    keywords: ['退货', '逆向物流', 'FBA', '退货率', '海外仓', '退款', '退货中心'],
  },
  {
    id: 'ecom-multi-channel',
    domain: 'ecommerce',
    title: '多渠道库存管理与同步',
    content: '2026年跨境卖家多渠道趋势: Amazon + Temu + Shein + 独立站(Shopify)+ 线下批发。核心痛点: 库存数据不同步导致超卖/断货。解决方案: ERP 系统(领星/积加/马帮/店小秘)自动同步库存，设置安全库存预警(库存<7天用量自动下架非主力渠道)。全渠道分配: Amazon 优先 60%(利润最高)、Temu 清库存 20%、独立站品牌展示 10%、批发 10%。多仓策略: FBA 美东/美西各备 50% 库存(缩短 Prime 配送时效)、海外仓作为补充(FBM 自发货)。',
    keywords: ['多渠道', '库存同步', 'ERP', 'Shopify', 'FBM', '超卖', '断货', '全渠道'],
  },

  // ── Product Safety & Regulations ────────────────────────────────────────────
  {
    id: 'safety-ul-etc',
    domain: 'safety',
    title: 'UL/ETL 认证(美国产品安全)',
    content: '美国市场小家电强制安全认证: UL 标准覆盖 100+品类(UL 982 食品加工器、UL 1082 咖啡机、UL 1005 电热毯、UL 859 美发器具)。替代: ETL(Intertek)/CSA 与 UL 等效，费用低 20-30%。认证周期: 新申请 8-12 周、同类产品变更 4-6 周。认证费用: $8,000-25,000(初次)+年度工厂审查 $1,500-3,000。注意: 亚马逊要求所有电器必须 NRTL(Nationally Recognized Testing Lab)认证，未认证直接下架。Walmart 额外要求 UL/ETL 证书+工厂审核报告+产品责任险。',
    keywords: ['UL', 'ETL', 'NRTL', '安全认证', '亚马逊', 'Walmart', 'Intertek', 'CSA'],
  },
  {
    id: 'safety-cpsia',
    domain: 'safety',
    title: 'CPSC/CPSIA 消费品安全合规',
    content: 'CPSIA(消费品安全改进法案)覆盖所有在美销售的消费品。儿童用品: 第三方铅/邻苯二甲酸酯检测强制、永久性追踪标签(生产日期/批次/工厂)。一般消费品: 需提供 GCC(General Certificate of Conformity)声明符合适用安全标准。CPSC 可对不安全产品发布召回令(自愿召回可减轻处罚)。罚款: 单次违规$100K，连续违规$15M。2026年重点关注: 小家电倾倒/翻倒风险(咖啡机/空气炸锅)、锂电池过热/起火风险、电动工具防护缺失。',
    keywords: ['CPSIA', 'CPSC', 'GCC', '召回', '儿童安全', '铅', '邻苯二甲酸酯'],
  },
  {
    id: 'safety-rohs-weee',
    domain: 'safety',
    title: 'EU RoHS/WEEE/REACH 合规',
    content: 'EU RoHS 2.0(2011/65/EU+修订): 限制 10 项物质(铅/汞/镉/六价铬/PBBs/PBDEs/DEHP/BBP/DBP/DIBP)，均质材料限量 0.1%(镉 0.01%)。WEEE: 电子电器废弃物回收指令，需在目标国注册 WEEE 编号(德国 EAR/WEEE 注册约€100-200/年)，按投放量支付回收费用。REACH: 化学物质注册+高关注物质(SVHC)通报，目前清单 233+项。检测周期: RoHS 5-7 天、REACH SVHC 7-10 天。建议: 每批次原材料要求供应商提供 RoHS/REACH 合规声明+抽检验证。',
    keywords: ['RoHS', 'WEEE', 'REACH', 'SVHC', '电子废弃物', '注册', '检测', '重金属'],
  },
  {
    id: 'safety-lithium-battery',
    domain: 'safety',
    title: '锂电池运输安全规范',
    content: '含锂电池小家电(无线吸尘器/电动牙刷/蓝牙音箱)出口需满足: UN38.3 检测(UN/DOT 38.3 标准 T1-T8 8项测试，$2,000-4,000/型号)、MSDS(物质安全数据表)更新<2年、IATA DGR 危险品运输规则(Class 9 UN3481锂电池装在设备中)。运输要求: <100Wh 可普货运输(仅需 UN38.3 报告)、>100Wh 需按 Class 9 危险品申报(额外运费 20-40%)。空运限制: 单件设备含锂电池≤2块 或 锂金属电池≤2g。海运相对宽松(锂电池不限制数量但需危险品申报)。',
    keywords: ['锂电池', 'UN38.3', 'IATA', 'DGR', '危险品', 'MSDS', '空运', '海运'],
  },
  {
    id: 'safety-food-contact',
    domain: 'safety',
    title: '食品接触材料法规',
    content: '厨房小家电(榨汁机/咖啡机/搅拌杯/饭盒)食品接触部件需满足: FDA 21 CFR 175-178(美国)、EU 1935/2004+EU 10/2011(欧盟)、LFGB §30+31(德国)。检测项目: 总迁移量(Overall Migration)、特定迁移量(Specific Migration,如铅/镉/邻苯二甲酸酯)、感官测试(味道+气味迁移)。检测费用: FDA $500-1,500、EU $1,000-2,500。注意: 硅胶密封圈、不粘涂层(PTFE/PFOA)、塑料容器是最常见不合规点。颜色鲜艳的塑料件需加测重金属含量。',
    keywords: ['FDA', '食品接触', 'LFGB', 'EU 1935', '迁移量', '硅胶', '不粘涂层', '厨房'],
  },
  {
    id: 'safety-proposition65',
    domain: 'safety',
    title: '加州 Proposition 65 合规',
    content: '加州 65 号提案要求: 在加州销售(含线上)的产品如含有已知致癌/致畸物质，必须贴 Warning Label。小家电常见 Prop 65 物质: 铅(焊点/黄铜/PVC线缆)、邻苯二甲酸酯(软塑料件/电源线绝缘)、BPA(聚碳酸酯塑料)、甲醛(胶合板/粘合剂)。检测: 第三方 Prop 65 检测($200-500/项)。合规方案: (1) 提供警示标签(避免诉讼风险)、(2) 更换无铅焊料+无邻苯增塑剂、(3) 签署和解协议(被诉后)。注意: 60 天通知(Notice of Violation)后可被诉，律师费+和解金通常 $5K-20K。',
    keywords: ['Proposition 65', 'Prop65', '加州', '致癌', '铅', 'BPA', '警告标签', '无铅'],
  },
  {
    id: 'safety-energy-star',
    domain: 'safety',
    title: '能效标准与 Energy Star 认证',
    content: '美国 DOE 能效标准(强制性): 覆盖空调/冰箱/洗碗机/吸尘器等 60+品类，最低能效应达标(MEPS)。Energy Star(自愿性): DOE 能效标准之上 +10-20%，可获 Energy Star 标志(消费者认可度高)。EU ERP(Energy-related Products)能效标签 A-G 等级(EU 2017/1369)，2021 年起新等级不含 A+/A++/A+++ 旧标签产品库存限期 18 个月内销售完毕。检测: DOE 能耗测试($2,000-5,000/型号)、ERP 能效注册(EPREL 数据库)。加州 CEC §1602: 更严格待机功耗限制(<2W)。',
    keywords: ['Energy Star', 'DOE', 'ERP', '能效', '待机功耗', 'CEC', 'MEPS', 'EPREL'],
  },
  {
    id: 'safety-wireless-compliance',
    domain: 'safety',
    title: '智能家电无线合规(WiFi/蓝牙)',
    content: '智能小家电(含 WiFi/蓝牙/Zigbee 模块)出口合规清单: 美国 FCC-ID(无线射频)+ UL/ETL(安全)、欧盟 CE-RED(无线设备指令 2014/53/EU)+ CE-LVD(安全)、日本 MIC(无线技适认证)、韩国 KC-R。SAR(比吸收率)测试: 靠近人体使用的设备(如电动牙刷/美容仪/按摩器)需 SAR 测试($3,000-6,000/型号)。注意: WiFi 2.4GHz 与 5GHz 双频设备需分别测试 2.4G 和 5G 频段。蓝牙低功耗(BLE)模块如已获模块认证，整机可直接引用(节省 40-50% 认证费)。',
    keywords: ['WiFi', '蓝牙', 'FCC-ID', 'RED', 'SAR', 'MIC', '无线', '模块', 'Zigbee'],
  },

  // ── Cross-border Payments ───────────────────────────────────────────────────
  {
    id: 'payment-crossborder-fees',
    domain: 'payment',
    title: '跨境支付费率与渠道对比',
    content: '跨境电商收款费率: Payoneer 提现至国内银行 1.2%、WorldFirst(万里汇)0.3%封顶($50万+)、PingPong 1%封顶(阶梯费率)、LianLian(连连)0.7%封顶。PayPal 收款费率: 美国 2.9%+$0.30、跨境 4.4%+固定费(各国不同)。平台收款: Amazon 每 14 天自动结算至绑定的收款账号、Temu 结算周期 T+5 至 T+15。换汇损失: 第三方收款机构汇率优于银行牌价 0.3-0.8%。建议: 大额(>$50K)用 WorldFirst(最低费率)、小额多元化(PingPong+LianLian 备选)。',
    keywords: ['收款', 'Payoneer', 'WorldFirst', 'PingPong', 'LianLian', 'PayPal', '费率', '换汇'],
  },
  {
    id: 'payment-currency-settlement',
    domain: 'payment',
    title: '多币种结算与清算周期',
    content: '跨境电商多币种结算: USD/EUR/GBP/JPY/AUD 主流 5 币种。清算周期: 美国 ACH T+1-2(隔夜到账)、欧盟 SEPA T+1(即时支付逐步普及)、英国 Faster Payments 实时到账(单笔<£1M)、日本 Zengin T+1。Amazon 全球开店: 美元/欧元/英镑/日元收入均可直接提现至当地币种收款账号(避免二次换汇损失)。建议: 各币种收入保留 30% 在境外用于支付(采购/物流/广告费)，70% 结汇至人民币(利用远期锁汇降低汇率风险)。',
    keywords: ['结算', '多币种', 'ACH', 'SEPA', '提现', '外汇', '清算', 'USD', 'EUR'],
  },
  {
    id: 'payment-lc-trade',
    domain: 'payment',
    title: '信用证与贸易融资',
    content: '大额订单($50K+)建议使用信用证(L/C)降低风险。常见类型: 即期信用证(Sight L/C, 交单后 5 个工作日付款)、远期信用证(Usance L/C, 30/60/90 天后付款)、备用信用证(SBLC, 履约担保)。L/C 单据: 商业发票、装箱单、提单(B/L)、原产地证(CO)、保险单、受益人证明。不符点(Discrepancy): 单据与 L/C 条款不一致(如拼写错误/日期延迟/装船期超期)，单次不符点费 $50-150。建议: 首次合作买家 30%定金+70% L/C，老客户可放宽至 OA(Open Account)30-60 天。',
    keywords: ['信用证', 'L/C', '贸易融资', '即期', '远期', '不符点', '提单', 'SBLC'],
  },
  {
    id: 'payment-fx-management',
    domain: 'payment',
    title: '跨境支付外汇管理策略',
    content: 'CNY/USD 汇率 2026 年波动区间预计 6.8-7.5。外汇管理工具: 远期结汇(锁定 1-12 个月汇率，保证金 2-5%)、区间远期(设定上下限弹性结算)、普通期权(买权付保费 0.5-1.5%，保底不封顶)、零成本期权(买权+卖权组合无保费但有封顶)。操盘建议: 收到海外订单后即时锁汇(锁定 70% 预期收入)、滚动远期合约(每月 1/3 到期滚动)、止损机制(汇率波动>3%触发追加保证金)。禁止裸卖空(投机性外汇交易)。',
    keywords: ['外汇', '锁汇', '远期', '期权', '人民币', 'USDCNY', '止损', '保证金'],
  },
  {
    id: 'payment-compliance-kyc',
    domain: 'payment',
    title: '跨境支付 AML/KYC 合规',
    content: '跨境支付机构需遵守: FATF(反洗钱金融行动特别工作组)40项建议、OFAC SDN 制裁名单筛查、中国外汇管理局(SAFE)个人 5 万美元年度限额(商业收款不受限但需申报)。卖家 KYC: 营业执照(彩色扫描件+翻译件)、法人身份证/护照、公司账户证明(银行对账单<3个月)、股东结构图(穿透至最终受益人)。大额交易上报: 单笔>$10K 需提供合同/发票/提单(AML 合规)。2026年重点关注: 虚拟货币(比特币/USDT)收款合规性尚不明确，建议走传统银行渠道。',
    keywords: ['KYC', 'AML', 'OFAC', '制裁', '外汇管理局', '合规', '反洗钱', '受益所有人'],
  },
  {
    id: 'payment-platform-settlement',
    domain: 'payment',
    title: '电商平台结算周期与资金管理',
    content: 'Amazon 结算: 每 14 天自动结算一次(预留 7 天退货窗口期)，回款至 Payoneer/WorldFirst 需 1-3 天。Temu 结算: 全托管 T+5(每日结算)、JIT T+15(备货模式)。Shein 结算: 月结 T+30(每月 1 号/15 号对账，月末付款)。Shopify 独立站: 每日结算至 Stripe/PayPal(按交易逐笔结算)，提现至银行 T+1。资金管理: 运营账户(Amazon/Payoneer)保留 1 个月运营资金、税务账户(VAT/GST)保留应缴税额的 110%、公司账户保留 3 个月固定开支。',
    keywords: ['结算周期', '回款', '资金管理', 'T+5', 'T+15', 'VAT', '运营资金'],
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
