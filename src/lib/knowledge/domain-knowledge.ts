/**
 * Domain Knowledge — 跨境电商供应链垂直领域知识库.
 *
 * 静态知识库, 用于:
 *   1. RAG 管道冷启动 (无向量索引时的 fallback)
 *   2. 知识图谱构建脚本 (build-knowledge-graph.ts) 的种子数据
 *   3. FSM retrieve 状态的领域知识注入
 *
 * 覆盖: HS 编码大类 / 关税规则 / 物流通道 / 供应商风险因子 / 合规法规.
 */

import type { Intent } from '@/lib/agent/fsm-types';

// ─── HS 编码大类 (小家电相关) ──────────────────────────────────────────────

export interface HSCodeCategory {
  hsCode: string;
  description: string;
  category: string;
  /** 中国出口退税率 (%) */
  exportRebateRate: number;
  /** 美国最惠国税率 (%) */
  usMFNRate: number;
  /** 欧盟常规税率 (%) */
  euRate: number;
  keywords: string[];
}

export const HS_CODE_CATEGORIES: HSCodeCategory[] = [
  {
    hsCode: '8516',
    description: '家用电热器具 (电热水壶/电饭煲/烤箱/咖啡机/烤面包机)',
    category: '小家电',
    exportRebateRate: 13,
    usMFNRate: 3.4,
    euRate: 2.7,
    keywords: ['电热水壶', '电饭煲', '烤箱', '咖啡机', '烤面包机', '电热'],
  },
  {
    hsCode: '8414',
    description: '空气泵/真空泵/压缩机 (吸尘器/空气净化器电机)',
    category: '小家电',
    exportRebateRate: 13,
    usMFNRate: 2.5,
    euRate: 2.7,
    keywords: ['吸尘器', '空气净化器', '压缩机', '气泵'],
  },
  {
    hsCode: '8509',
    description: '家用电动器具 (搅拌机/榨汁机/研磨机)',
    category: '小家电',
    exportRebateRate: 13,
    usMFNRate: 4.4,
    euRate: 2.7,
    keywords: ['搅拌机', '榨汁机', '研磨机', '电动器具'],
  },
  {
    hsCode: '8479',
    description: '其他机器及机械器具 (智能家电主机/多功能处理器)',
    category: '小家电',
    exportRebateRate: 13,
    usMFNRate: 3.0,
    euRate: 2.7,
    keywords: ['智能家电', '多功能', '处理器'],
  },
  {
    hsCode: '8504',
    description: '变压器/电源适配器 (小家电电源模块)',
    category: '电子元件',
    exportRebateRate: 13,
    usMFNRate: 3.5,
    euRate: 2.7,
    keywords: ['电源', '适配器', '变压器', '充电器'],
  },
  {
    hsCode: '8544',
    description: '绝缘电线电缆 (小家电电源线)',
    category: '电子元件',
    exportRebateRate: 13,
    usMFNRate: 2.6,
    euRate: 3.0,
    keywords: ['电源线', '电缆', '电线'],
  },
  {
    hsCode: '3924',
    description: '塑料制家用器具 (塑料外壳/配件)',
    category: '塑料配件',
    exportRebateRate: 13,
    usMFNRate: 3.4,
    euRate: 6.5,
    keywords: ['塑料外壳', '塑料配件', '塑料'],
  },
  {
    hsCode: '7323',
    description: '钢铁制家用器具 (金属外壳/锅具)',
    category: '金属配件',
    exportRebateRate: 13,
    usMFNRate: 3.4,
    euRate: 2.7,
    keywords: ['金属外壳', '不锈钢', '锅具'],
  },
];

// ─── 关税规则 ─────────────────────────────────────────────────────────────

export interface TariffRule {
  ruleId: string;
  name: string;
  countries: string[]; // 适用国家代码
  description: string;
  rateRange: string; // 税率范围描述
  section?: string; // 301-list1 / 301-list3 / CBAM / RCEP / WTO-MFN
  notes: string;
  keywords: string[];
}

export const TARIFF_RULES: TariffRule[] = [
  {
    ruleId: 'section-301-list1',
    name: '美国 301 条款 List 1',
    countries: ['US'],
    description: '2018 年起对华 340 亿美元商品加征 25% 关税, 涵盖工业机械/电子元件等.',
    rateRange: '25% 额外关税',
    section: '301-list1',
    notes: '叠加 MFN 税率. 部分品类有豁免 (USTR 定期复审). 建议申请 exclusion 或首次销售规则降税.',
    keywords: ['301', '美国', '关税', 'USTR', '豁免', 'exclusion'],
  },
  {
    ruleId: 'section-301-list3',
    name: '美国 301 条款 List 3',
    countries: ['US'],
    description: '2018 年起对华 2000 亿美元商品加征关税, 税率从 10% 调至 25%.',
    rateRange: '25% 额外关税',
    section: '301-list3',
    notes: '覆盖大量消费品 (含部分小家电). 豁免申请窗口期短, 需关注 USTR 公告.',
    keywords: ['301', '美国', '关税', '消费品', '小家电'],
  },
  {
    ruleId: 'eu-cbam',
    name: '欧盟 CBAM 碳边境调节机制',
    countries: ['EU'],
    description: '2026 年 10 月起正式征收, 覆盖钢铁/铝/水泥/化肥/电力/氢. 进口商需购买 CBAM 证书.',
    rateRange: '等效增加 3-8% (钢铁) / 3-5% (铝)',
    section: 'CBAM',
    notes: '过渡期 (2023-2025) 仅报告碳排放. 正式期需购买证书, 价格 = EU-ETS 碳配额周均价. 建议提前核算产品碳足迹 (PAS 2050 / ISO 14067).',
    keywords: ['CBAM', '碳关税', '欧盟', '碳边境', '碳排放', '钢铁', '铝'],
  },
  {
    ruleId: 'rcep',
    name: 'RCEP 区域全面经济伙伴关系协定',
    countries: ['CN', 'JP', 'KR', 'AU', 'NZ', 'ASEAN'],
    description: '15 国自贸协定, 累计原产地规则 (RVC 40%). 中日首次建立双边关税减让.',
    rateRange: '逐步降税至 0% (20 年)',
    section: 'RCEP',
    notes: '日本对中国 86% 商品最终零关税, 中国对日本 88% 商品最终零关税. 家电 RVC 40% 可享优惠. 原产地证书可自助打印.',
    keywords: ['RCEP', '区域全面经济伙伴关系', '原产地', '中日', '关税减让', 'RVC', '东盟'],
  },
  {
    ruleId: 'us-mfn',
    name: 'WTO 最惠国税率 (美国)',
    countries: ['US'],
    description: 'WTO 成员间通用基础税率, 适用于未受 301 条款覆盖的商品.',
    rateRange: '0-7% (小家电平均 3-5%)',
    section: 'WTO-MFN',
    notes: '基础税率, 不叠加额外关税. 多数小家电 HS 8516/8509 适用 3-5% MFN.',
    keywords: ['MFN', '最惠国', 'WTO', '美国', '基础税率'],
  },
  {
    ruleId: 'eu-vat',
    name: '欧盟增值税 (VAT)',
    countries: ['EU'],
    description: 'IOSS 进口一站式服务适用于 ≤€150 包裹, 税率 = 目的地国增值税率.',
    rateRange: '17-27% (各国不同)',
    section: 'EU-VAT',
    notes: '德国 19%, 法国 20%, 意大利 22%, 北欧 25%. 平台代收代缴. >€150 走传统清关.',
    keywords: ['VAT', '增值税', '欧盟', 'IOSS', '德国', '法国'],
  },
];

// ─── 物流通道 ─────────────────────────────────────────────────────────────

export interface LogisticsLane {
  laneId: string;
  name: string;
  origin: string;
  destination: string;
  mode: 'sea' | 'air' | 'rail' | 'multi';
  transitDays: { min: number; max: number };
  costRange: string;
  reliability: 'high' | 'medium' | 'low';
  notes: string;
  keywords: string[];
}

export const LOGISTICS_LANES: LogisticsLane[] = [
  {
    laneId: 'cn-us-west-sea',
    name: '中国 → 美西 (海运)',
    origin: 'CN',
    destination: 'US-WEST',
    mode: 'sea',
    transitDays: { min: 14, max: 21 },
    costRange: '$1,800-2,500 / 40GP',
    reliability: 'high',
    notes: '上海/宁波 → 洛杉矶/长滩. 旺季 (8-10 月) +20-40%. 美森快船 12 天上海→长滩.',
    keywords: ['海运', '美西', '洛杉矶', '长滩', '上海', '宁波', '美森', 'Matson'],
  },
  {
    laneId: 'cn-us-east-sea',
    name: '中国 → 美东 (海运)',
    origin: 'CN',
    destination: 'US-EAST',
    mode: 'sea',
    transitDays: { min: 25, max: 35 },
    costRange: '$2,800-3,500 / 40GP',
    reliability: 'medium',
    notes: '上海/宁波 → 纽约/新泽西. 巴拿马运河干旱限行可能延误 3-7 天.',
    keywords: ['海运', '美东', '纽约', '新泽西', '巴拿马运河'],
  },
  {
    laneId: 'cn-eu-sea',
    name: '中国 → 欧洲 (海运)',
    origin: 'CN',
    destination: 'EU',
    mode: 'sea',
    transitDays: { min: 30, max: 45 },
    costRange: '$2,200-3,000 / 40GP',
    reliability: 'medium',
    notes: '上海/宁波 → 鹿特丹/汉堡. 苏伊士运河绕行好望角 +7-10 天.',
    keywords: ['海运', '欧洲', '鹿特丹', '汉堡', '苏伊士运河'],
  },
  {
    laneId: 'cn-us-air',
    name: '中国 → 美国 (空运)',
    origin: 'CN',
    destination: 'US',
    mode: 'air',
    transitDays: { min: 3, max: 7 },
    costRange: '$5-12 / kg',
    reliability: 'high',
    notes: '香港/深圳/上海 → 洛杉矶/纽约. 适合高价值/紧急补货. 含锂电池需 UN38.3 + 危险品申报.',
    keywords: ['空运', '美国', '香港', '深圳', '锂电池', 'UN38.3'],
  },
  {
    laneId: 'cn-eu-rail',
    name: '中欧班列 (铁路)',
    origin: 'CN',
    destination: 'EU',
    mode: 'rail',
    transitDays: { min: 15, max: 22 },
    costRange: '$4,500-6,500 / 40GP',
    reliability: 'medium',
    notes: '义乌/成都 → 马德里/杜伊斯堡. 比海运快 50%, 比空运便宜 70%. 俄罗斯段受地缘政治影响.',
    keywords: ['铁路', '中欧班列', '义乌', '马德里', '杜伊斯堡'],
  },
  {
    laneId: 'cn-jp-sea',
    name: '中国 → 日本 (海运)',
    origin: 'CN',
    destination: 'JP',
    mode: 'sea',
    transitDays: { min: 5, max: 10 },
    costRange: '$600-900 / 40GP',
    reliability: 'high',
    notes: '上海/宁波 → 东京/大阪. RCEP 优惠, 日本对中国 86% 商品最终零关税.',
    keywords: ['海运', '日本', '东京', '大阪', 'RCEP'],
  },
];

// ─── 供应商风险因子 ───────────────────────────────────────────────────────

export interface SupplierRiskFactor {
  factorId: string;
  category: 'financial' | 'operational' | 'geopolitical' | 'quality' | 'compliance' | 'capacity';
  name: string;
  description: string;
  weight: number; // 0-1, 风险权重
  mitigation: string;
  keywords: string[];
}

export const SUPPLIER_RISK_FACTORS: SupplierRiskFactor[] = [
  {
    factorId: 'single-source',
    category: 'operational',
    name: '单一供应源依赖',
    description: '关键物料仅 1 家供应商, 中断无替代源.',
    weight: 0.9,
    mitigation: 'A 类物料 ≥3 家合格供应商, 关键物料 ≥2 个不同地理区域.',
    keywords: ['单一供应', '依赖', '替代', '多元化'],
  },
  {
    factorId: 'geo-concentration',
    category: 'geopolitical',
    name: '地理集中风险',
    description: '供应商集中在单一地区 (如全部在广东), 区域性灾害/封锁影响全部供应.',
    weight: 0.8,
    mitigation: 'China+1 策略: 越南/墨西哥/印度作为第二供应源.',
    keywords: ['地理集中', '区域风险', 'China+1', '越南', '墨西哥'],
  },
  {
    factorId: 'financial-distress',
    category: 'financial',
    name: '供应商财务困境',
    description: '供应商现金流紧张/负债率高, 可能停产或降低品质.',
    weight: 0.7,
    mitigation: '要求供应商提供财报, 关注账期变化/产能利用率/员工流失率.',
    keywords: ['财务', '现金流', '负债', '停产'],
  },
  {
    factorId: 'quality-decline',
    category: 'quality',
    name: '品质下滑',
    description: '批次不良率上升/客诉增加, 反映工艺失控或偷工减料.',
    weight: 0.8,
    mitigation: '每批次 AQL 2.5 抽检, 关键物料 100% 全检, 季度供应商评审.',
    keywords: ['品质', '不良率', '客诉', 'AQL', '抽检'],
  },
  {
    factorId: 'lead-time-variability',
    category: 'operational',
    name: '交期波动',
    description: '实际交期与承诺交期偏差 >15%, 影响库存计划.',
    weight: 0.6,
    mitigation: '安全库存 +2-3 周, 关键物料双源备份, 月度交期 KPI 跟踪.',
    keywords: ['交期', '波动', '安全库存', 'KPI'],
  },
  {
    factorId: 'compliance-violation',
    category: 'compliance',
    name: '合规违规',
    description: '供应商环保/劳工/知识产权违规, 导致产品被扣押或品牌受损.',
    weight: 0.85,
    mitigation: '年度 BSCI/Sedex 审核, 突击现场检查, 供应商行为准则 (CoC) 签署.',
    keywords: ['合规', '环保', '劳工', 'BSCI', 'Sedex', '知识产权'],
  },
  {
    factorId: 'capacity-bottleneck',
    category: 'capacity',
    name: '产能瓶颈',
    description: '旺季产能不足, 导致订单延误或被优先级更高的客户挤占.',
    weight: 0.65,
    mitigation: '淡季 (4-7 月) 提前备货, 签订产能预留协议, 多供应商分流.',
    keywords: ['产能', '旺季', '延误', '备货'],
  },
  {
    factorId: 'ip-leakage',
    category: 'compliance',
    name: '知识产权泄露',
    description: 'ODM 供应商将客户设计/模具转售给竞品.',
    weight: 0.75,
    mitigation: 'NDA + NCA (不竞争协议), 模具产权归属明确, 关键工艺自研.',
    keywords: ['知识产权', '泄露', 'NDA', 'NCA', '模具', 'ODM'],
  },
];

// ─── 合规法规 ─────────────────────────────────────────────────────────────

export interface Regulation {
  regId: string;
  name: string;
  region: 'US' | 'EU' | 'UK' | 'JP' | 'CN' | 'GLOBAL';
  category: 'safety' | 'emc' | 'wireless' | 'environmental' | 'food_contact' | 'data_privacy';
  mandatory: boolean;
  description: string;
  cost: string;
  timeline: string;
  keywords: string[];
}

export const REGULATIONS: Regulation[] = [
  {
    regId: 'fcc-id',
    name: 'FCC-ID 认证 (美国无线设备)',
    region: 'US',
    category: 'wireless',
    mandatory: true,
    description: '含无线发射模块 (蓝牙/WiFi/2.4G/5G) 的产品必须通过 FCC-ID 认证, 需 TCB 审核.',
    cost: '$5,000-15,000',
    timeline: '8-12 周',
    keywords: ['FCC', '认证', '无线', '蓝牙', 'WiFi', 'TCB'],
  },
  {
    regId: 'fcc-sdoc',
    name: 'FCC-SDOC (美国普通电子)',
    region: 'US',
    category: 'emc',
    mandatory: true,
    description: '普通电子产品 (无无线模块) 自我声明 + 认可实验室测试.',
    cost: '$1,000-3,000',
    timeline: '2-4 周',
    keywords: ['FCC', 'SDOC', '电子', 'EMC'],
  },
  {
    regId: 'ul-etl',
    name: 'UL/ETL 安全认证 (美国)',
    region: 'US',
    category: 'safety',
    mandatory: true,
    description: '小家电强制 NRTL 认证 (UL 982/1082/1005 等). 亚马逊/Walmart 要求证书 + 工厂审核.',
    cost: '$8,000-25,000 + 年度 $1,500-3,000',
    timeline: '8-12 周',
    keywords: ['UL', 'ETL', 'NRTL', '安全', '亚马逊', 'Walmart'],
  },
  {
    regId: 'ce-red',
    name: 'CE-RED (欧盟无线设备)',
    region: 'EU',
    category: 'wireless',
    mandatory: true,
    description: '无线设备指令 2014/53/EU, 智能家电 (含 WiFi/蓝牙) 必须认证.',
    cost: '$3,000-8,000',
    timeline: '4-8 周',
    keywords: ['CE', 'RED', '欧盟', '无线', '智能家电'],
  },
  {
    regId: 'ce-lvd-emc',
    name: 'CE-LVD/EMC (欧盟安全/电磁兼容)',
    region: 'EU',
    category: 'safety',
    mandatory: true,
    description: 'LVD 2014/35/EU + EMC 2014/30/EU, 家电基础认证. 需 EU 授权代表.',
    cost: '$2,000-5,000',
    timeline: '4-6 周',
    keywords: ['CE', 'LVD', 'EMC', '欧盟', '授权代表'],
  },
  {
    regId: 'ukca',
    name: 'UKCA (英国)',
    region: 'UK',
    category: 'safety',
    mandatory: true,
    description: '2025 年起强制, 不再接受 CE. 需 UK 境内 Responsible Person.',
    cost: '$2,000-5,000',
    timeline: '4-6 周',
    keywords: ['UKCA', '英国', 'Responsible Person'],
  },
  {
    regId: 'rohs',
    name: 'RoHS (有害物质限制)',
    region: 'EU',
    category: 'environmental',
    mandatory: true,
    description: '限制 10 项物质 (铅/汞/镉等), 均质材料限量 0.1% (镉 0.01%).',
    cost: '$500-1,500 / 型号',
    timeline: '5-7 天',
    keywords: ['RoHS', '有害物质', '铅', '镉', '欧盟'],
  },
  {
    regId: 'reach',
    name: 'REACH (化学物质注册)',
    region: 'EU',
    category: 'environmental',
    mandatory: true,
    description: 'SVHC 高关注物质通报, 清单 233+ 项. 每批次原材料需供应商合规声明.',
    cost: '$1,000-2,500 / 检测',
    timeline: '7-10 天',
    keywords: ['REACH', 'SVHC', '化学', '欧盟'],
  },
  {
    regId: 'weee',
    name: 'WEEE (电子废弃物回收)',
    region: 'EU',
    category: 'environmental',
    mandatory: true,
    description: '需在目标国注册 WEEE 编号 (德国 EAR 等), 按投放量支付回收费.',
    cost: '€100-200 / 年 + 回收费',
    timeline: '4-8 周',
    keywords: ['WEEE', '电子废弃物', '回收', '德国', 'EAR'],
  },
  {
    regId: 'fda-food-contact',
    name: 'FDA 食品接触材料 (美国)',
    region: 'US',
    category: 'food_contact',
    mandatory: true,
    description: '21 CFR 175-178, 厨房家电食品接触部件需检测总迁移量/特定迁移量.',
    cost: '$500-1,500',
    timeline: '2-3 周',
    keywords: ['FDA', '食品接触', '迁移量', '厨房'],
  },
  {
    regId: 'prop-65',
    name: '加州 Proposition 65',
    region: 'US',
    category: 'safety',
    mandatory: true,
    description: '含致癌/致畸物质需贴 Warning Label. 常见: 铅/邻苯二甲酸酯/BPA.',
    cost: '$200-500 / 项 + 标签',
    timeline: '1-2 周',
    keywords: ['Prop 65', '加州', '致癌', '铅', 'BPA', '警告标签'],
  },
  {
    regId: 'gdpr',
    name: 'GDPR (欧盟数据隐私)',
    region: 'EU',
    category: 'data_privacy',
    mandatory: true,
    description: '智能家电 (含 App/云连接) 必须 GDPR 合规. 数据最小化/opt-in/72h 泄露通知.',
    cost: '视合规范围',
    timeline: '持续合规',
    keywords: ['GDPR', '数据隐私', '智能家电', 'App', '云连接'],
  },
  {
    regId: 'un38-3',
    name: 'UN38.3 (锂电池运输)',
    region: 'GLOBAL',
    category: 'safety',
    mandatory: true,
    description: '含锂电池产品 (无线吸尘器/电动牙刷) 需 UN38.3 检测 + MSDS. 空运 >100Wh 需危险品申报.',
    cost: '$2,000-4,000 / 型号',
    timeline: '2-4 周',
    keywords: ['UN38.3', '锂电池', '运输', 'MSDS', '危险品'],
  },
  {
    regId: 'energy-star',
    name: 'Energy Star / DOE 能效 (美国)',
    region: 'US',
    category: 'environmental',
    mandatory: false,
    description: 'DOE 强制最低能效 (MEPS), Energy Star 自愿性 (+10-20% 能效). 加州 CEC §1602 更严.',
    cost: '$2,000-5,000 / 型号',
    timeline: '4-8 周',
    keywords: ['Energy Star', 'DOE', '能效', 'MEPS', 'CEC'],
  },
];

// ─── 按意图检索领域知识 ───────────────────────────────────────────────────

export interface DomainKnowledgeResult {
  hsCodes: HSCodeCategory[];
  tariffRules: TariffRule[];
  logisticsLanes: LogisticsLane[];
  riskFactors: SupplierRiskFactor[];
  regulations: Regulation[];
  summary: string;
}

/** 简单关键词匹配函数 */
function matchesQuery(text: string, query: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  // 整词匹配
  if (t.includes(q)) return true;
  // 关键词匹配
  const keywords = query.split(/[\s,，、]+/).filter(k => k.length > 1);
  return keywords.some(k => t.includes(k.toLowerCase()));
}

/**
 * 按意图检索领域知识.
 * 根据用户意图和查询关键词, 返回相关的 HS 编码/关税/物流/风险/法规.
 */
export function getDomainKnowledge(
  query: string,
  _intent?: Intent,
): DomainKnowledgeResult {
  const q = query || '';

  // 按意图过滤领域
  const intentFilter = (item: { keywords: string[] }): boolean => {
    if (!q) return true;
    // 关键词数组匹配
    if (item.keywords.some(k => matchesQuery(k, q))) return true;
    return false;
  };

  const hsCodes = HS_CODE_CATEGORIES.filter(intentFilter);
  const tariffRules = TARIFF_RULES.filter(intentFilter);
  const logisticsLanes = LOGISTICS_LANES.filter(intentFilter);
  const riskFactors = SUPPLIER_RISK_FACTORS.filter(intentFilter);
  const regulations = REGULATIONS.filter(intentFilter);

  // 如果精确匹配为空, 但查询非空, 返回全部 (避免空结果)
  const hasAnyMatch =
    hsCodes.length > 0 ||
    tariffRules.length > 0 ||
    logisticsLanes.length > 0 ||
    riskFactors.length > 0 ||
    regulations.length > 0;

  if (!hasAnyMatch && q) {
    return {
      hsCodes: HS_CODE_CATEGORIES,
      tariffRules: TARIFF_RULES,
      logisticsLanes: LOGISTICS_LANES,
      riskFactors: SUPPLIER_RISK_FACTORS,
      regulations: REGULATIONS,
      summary: `查询 "${q}" 未精确匹配, 返回全部领域知识 (共 ${HS_CODE_CATEGORIES.length + TARIFF_RULES.length + LOGISTICS_LANES.length + SUPPLIER_RISK_FACTORS.length + REGULATIONS.length} 条).`,
    };
  }

  const total = hsCodes.length + tariffRules.length + logisticsLanes.length + riskFactors.length + regulations.length;
  return {
    hsCodes,
    tariffRules,
    logisticsLanes,
    riskFactors,
    regulations,
    summary: `领域知识检索: ${total} 条匹配 (HS编码 ${hsCodes.length}, 关税 ${tariffRules.length}, 物流 ${logisticsLanes.length}, 风险 ${riskFactors.length}, 法规 ${regulations.length}).`,
  };
}

/** 获取全部领域知识 (用于知识图谱构建) */
export function getAllDomainKnowledge(): DomainKnowledgeResult {
  return {
    hsCodes: HS_CODE_CATEGORIES,
    tariffRules: TARIFF_RULES,
    logisticsLanes: LOGISTICS_LANES,
    riskFactors: SUPPLIER_RISK_FACTORS,
    regulations: REGULATIONS,
    summary: `全部领域知识: ${HS_CODE_CATEGORIES.length + TARIFF_RULES.length + LOGISTICS_LANES.length + SUPPLIER_RISK_FACTORS.length + REGULATIONS.length} 条.`,
  };
}
