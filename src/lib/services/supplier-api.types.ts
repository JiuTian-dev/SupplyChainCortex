/**
 * Supplier API type definitions — maps Python Pydantic schemas to TypeScript.
 *
 * Source: D:/vibe-coding/API/Supplier-API/app/models/schemas.py
 *         D:/vibe-coding/API/Supplier-API/app/db/graph.py
 *         D:/vibe-coding/API/Supplier-API/app/api/graph_routes.py
 *         D:/vibe-coding/API/Supplier-API/app/api/dependency_routes.py
 */

// ─── Generic API envelope ──────────────────────────────────────────────────────

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T | null;
  meta?: Record<string, unknown>;
}

// ─── Dependency (schemas.py: DependencyResponse / DependencyMeta) ──────────────

export interface DependencyMeta {
  source: string;
  confidence: number;
  updated_at: string;
  delay_minutes: number;
  cache_hit: boolean;
}

export interface DependencyProfile {
  ticker: string;
  company: string;
  region: string;
  supplier_count: number;
  exposure_pct_range: string;
  hhi_score: number | null;
  risk_flags: string[];
  meta: DependencyMeta;
}

// ─── Batch dependency result ───────────────────────────────────────────────────

export interface BatchDependencyItem {
  ticker: string;
  company: string;
  supplier_count: number;
  hhi_score: number | null;
  risk_flags: string[];
  confidence: number;
  error?: string;
}

// ─── Trend (historical snapshots) ──────────────────────────────────────────────

export interface TrendPoint {
  computed_at: string;
  supplier_count: number;
  exposure_pct_range: string;
  hhi_score: number | null;
  risk_flags: string; // JSON string from SQLite
  confidence: number;
}

export interface TrendResponse {
  ticker: string;
  region: string;
  days: number;
  data_points: number;
  history: TrendPoint[];
}

// ─── Graph: Network (nodes + edges) ────────────────────────────────────────────

export interface GraphNode {
  id: string;
  label: string;
  type: 'company' | 'supplier';
  risk?: boolean;
  risk_type?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  confidence: number;
  tier: number;
  source: string;
  component: string;
  evidence_type: string;
}

export interface NetworkData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  node_count: number;
  edge_count: number;
}

// ─── Graph: Impact analysis ────────────────────────────────────────────────────

export interface AffectedCompany {
  ticker: string;
  company: string;
  region: string;
}

export interface PropagationPath {
  company: string;
  distance: number;
  chain: string[];
}

export interface ImpactResult {
  disrupted_supplier: string;
  affected_companies: AffectedCompany[];
  affected_count: number;
  paths: PropagationPath[];
}

// ─── Graph: Chokepoints ────────────────────────────────────────────────────────

export interface Chokepoint {
  supplier: string;
  code: string;
  companies_supplied: number;
}

export interface ChokepointResponse {
  chokepoints: Chokepoint[];
  count: number;
  page: number;
  page_size: number;
}

// ─── Graph: Geo-risk ───────────────────────────────────────────────────────────

export interface GeoHub {
  hub: string;
  supplier_count: number;
  percentage: number;
  sample_suppliers: string[];
  natural_risks: string[];
}

export interface AtRiskSupplier {
  name: string;
  code: string;
  hub?: string;
  risk_type?: string;
  z?: number;
  esg?: string;
}

export interface GeoRiskResult {
  ticker: string;
  total_suppliers: number;
  geo_hhi: number;
  concentration_risk: 'high' | 'medium' | 'low';
  hubs: GeoHub[];
  at_risk_suppliers: AtRiskSupplier[];
}

// ─── Graph: Evolution ──────────────────────────────────────────────────────────

export interface EvolutionSnapshot {
  date: string;
  supplier_count: number;
  hhi: number | null;
  confidence: number;
  risk_flags: string[];
  source_count: number;
}

export interface EvolutionResult {
  ticker: string;
  period_months: number;
  first_snapshot: EvolutionSnapshot;
  latest_snapshot: EvolutionSnapshot;
  data_points: number;
  changes: {
    supplier_count_delta: number;
    hhi_delta: number;
    new_risk_flags: string[];
    resolved_risk_flags: string[];
  };
  trend: string;
  timeline: EvolutionSnapshot[];
}

// ─── Graph: Stats ──────────────────────────────────────────────────────────────

export interface GraphStats {
  company_count: number;
  supplier_count: number;
  edge_count: number;
  by_tier: Record<string, number>;
}

// ─── Graph: Components ─────────────────────────────────────────────────────────

export interface ComponentInfo {
  component: string;
  category: string;
  supplier_count: number;
  edge_count: number;
  sample_companies: string[];
}

export interface ComponentTreeNode {
  name: string;
  supplier_count: number;
  edge_count: number;
}

export interface ComponentCategory {
  category: string;
  supplier_count: number;
  edge_count: number;
  children: ComponentTreeNode[];
}

// ─── Graph: Tiers ──────────────────────────────────────────────────────────────

export interface Tier2Relationship {
  tier1_supplier: { code: string; name: string };
  tier2_supplier: { code: string; name: string };
  confidence: number;
  source: string;
}

export interface TierStructure {
  ticker: string;
  tier_counts: Record<string, number>;
  total_unique_suppliers: number;
  tier2_relationships: Tier2Relationship[];
  deepest_tier: number;
}

// ─── Health: Parser health ─────────────────────────────────────────────────────

export interface ParserHealthEntry {
  success: number;
  failure: number;
  consecutive_failures: number;
  last_success: string | null;
  last_failure: string | null;
  total_records: number;
  status: 'healthy' | 'degraded';
}

export interface ParserHealthReport {
  total_runs: number;
  success_rate: string;
  parsers: Record<string, ParserHealthEntry>;
}

// ─── Health: Freshness ─────────────────────────────────────────────────────────

export interface FreshnessEntry {
  ticker: string;
  company: string;
  region: string;
  status: 'fresh' | 'stale' | 'outdated' | 'missing';
  age_hours: number | null;
  supplier_count: number;
}

export interface FreshnessReport {
  total: number;
  fresh: number;
  stale: number;
  missing: number;
  page: number;
  page_size: number;
  tickers: FreshnessEntry[];
}

// ─── Supplier search ───────────────────────────────────────────────────────────

export interface SupplierSearchResult {
  name: string;
  stock_code: string;
  component: string;
  category: string;
  confidence: number;
  source: string;
  status: string;
  location: string;
}

export interface SupplierSearchResponse {
  results: SupplierSearchResult[];
  total: number;
  page: number;
  page_size: number;
}

// ─── Dead letter stats ─────────────────────────────────────────────────────────

export interface DeadLetterStats {
  total: number;
  pending: number;
  retried: number;
  failed: number;
}
