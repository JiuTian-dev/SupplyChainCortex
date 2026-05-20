/**
 * Shared Chinese → English keyword maps for web search.
 *
 * Consolidates maps that were previously duplicated across:
 *   - web-search-rewriter.ts (REWRITE_STRATEGIES english strategy)
 *   - web-search.service.ts  (extractEnglishKeywords)
 *
 * Conflicting entries are resolved in favour of the rewriter's more specific
 * translations.
 */

/**
 * Base map with all entries from both sources.
 * Rewriter-priority values override service-original values where they differ.
 */
const _mergedEntries: Record<string, string> = {
  // ── From web-search.service.ts extractEnglishKeywords ───────────────────
  '特朗普': 'Trump',
  '螺纹钢': 'steel rebar',
  '碳关税': 'CBAM carbon',
  '人民币': 'CNY USD',
  '港口拥堵': 'port congestion',
  '产业链': 'industrial chain',
  '半导体': 'semiconductor',
  '制造业': 'manufacturing',
  '集装箱': 'container',
  '铝价': 'aluminum price',
  '钢价': 'steel price',
  '运费': 'shipping cost',
  '白宫': 'White House',
  '访华': 'China visit',
  '中美': 'US China',
  '进口': 'import',
  '贸易': 'trade',
  '影响': 'impact',
  '分析': 'analysis',
  '谈判': 'negotiation',
  '协议': 'agreement',
  '制裁': 'sanctions',
  '竞选': 'election',
  '大选': 'election',
  '国会': 'Congress',
  '新闻': 'news',
  '最新': 'latest',
  '动态': 'update',
  '变化': 'change',
  '越南': 'Vietnam',
  '墨西哥': 'Mexico',
  '印度': 'India',
  '芯片': 'chip',
  '铜': 'copper',
  '铝': 'aluminum',
  '召回': 'recall CPSC',
  '转移': 'relocation diversification',
  '美元': 'USD',
  '2026': '2026',
  '2025': '2025',

  // ── Entries shared by both (same value) ────────────────────────────────
  '供应链': 'supply chain',
  '贸易战': 'trade war',
  '出口': 'export',
  '合规': 'compliance',
  '认证': 'certification',
  '库存': 'inventory',
  '物流': 'logistics',
  '供应商': 'supplier',
  '销售': 'sales',
  '成本': 'cost',
  '风险': 'risk',
  '汇率': 'exchange rate',

  // ── From web-search-rewriter.ts (more specific — overrides service) ────
  '小家电': 'small home appliances',    // was: 'small appliance'
  '政策': 'policy regulation',          // was: 'policy'
};

/**
 * Compact map used by the rewriter to **append** English terms to Chinese
 * queries when generating English-language search variants.
 */
export const zhToEnRewriterMap: Record<string, string> = {
  '关税': 'tariff',
  '贸易战': 'trade war',
  '供应链': 'supply chain',
  '小家电': 'small home appliances',
  '铜价': 'copper price',
  '运价': 'freight rate',
  '港口': 'port congestion',
  '汇率': 'exchange rate',
  '合规': 'compliance',
  '出口': 'export',
  '碳价': 'carbon price',
  '库存': 'inventory',
  '物流': 'logistics',
  '政策': 'policy regulation',
  '供应商': 'supplier',
  '销售': 'sales',
  '成本': 'cost',
  '风险': 'risk',
  '认证': 'certification',
};

/**
 * Full-featured map used by `extractEnglishKeywords` to **replace** Chinese
 * tokens with English equivalents for fallback / cross-lingual search.
 *
 * Built by merging the rewriter entries on top of the base service entries
 * so the more-specific rewriter translations win on conflicts.
 */
export const zhToEnTermMap: Record<string, string> = {
  ..._mergedEntries,
  // Additional entries only in the service map (not in rewriter)
  '关税': 'tariff',
  '铜价': 'copper price',
  '运价': 'freight rate',
  '港口': 'port congestion',
  '碳价': 'carbon price',
};
