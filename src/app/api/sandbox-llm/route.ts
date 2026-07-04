/**
 * Multi-Agent Sandbox API — real data pipeline connected.
 *
 * GET /api/sandbox-llm?rounds=10        → run agents with real DB + live data
 * GET /api/sandbox-llm?role=warehouse   → single agent view
 * GET /api/sandbox-llm?mode=compare     → LLM vs rule-based
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-utils';
import { withApiRateLimit } from '@/lib/api-protection';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import { runLLMAgent, runAllAgents } from '@/lib/engine/llm-agent';
import { db } from '@/lib/db';

async function gatherRealState() {
  const [
    products, inventory, shipments, suppliers,
    cascadeRisk, fx, carbon, commodity, freight,
    recentAlerts, cpscRecalls,
  ] = await Promise.all([
    db.product.findMany({ take: 20, include: { inventory: true, cost: true } }),
    db.inventory.findMany({ take: 30, orderBy: { quantity: 'asc' } }),
    db.shipmentItem.findMany({ take: 20, orderBy: { updatedAt: 'desc' } }),
    db.supplier.findMany({ where: { status: 'active' }, take: 10 }),

    // Live cascade risk
    (async () => {
      try {
        const { getCascadeRisk } = await import('@/lib/services/cascade-risk.service');
        const r = await getCascadeRisk({ scenario: 'auto', includeForwardProjection: false, includeCounterfactuals: false });
        return {
          affectedNodes: r.summary?.affectedNodes || 0,
          totalLoss: r.summary?.totalMonthlyLoss || 0,
          sources: (r as any).sourceNodes?.map((s: any) => ({ cause: s.cause, riskScore: s.riskScore })) || [],
        };
      } catch { return { affectedNodes: 0, totalLoss: 0, sources: [] }; }
    })(),

    // Live FX
    (async () => {
      try {
        const { getLatestRates } = await import('@/lib/queries/exchange-rate.queries');
        const fx = await getLatestRates();
        return { usdCny: fx.rates?.USD ? 1 / fx.rates.USD : 7.25, midpoint: fx.midpoints?.USD?.midpoint, spread: fx.midpoints?.USD?.spread };
      } catch {
        // Fallback: 7.25 is a conservative USD/CNY estimate used when the live
        // exchange-rate service is unavailable. Replace with a fresher value
        // periodically or wire up an external FX API.
        return { usdCny: 7.25 };
      }
    })(),

    // Live carbon
    (async () => {
      try {
        const { fetchCarbonPrice } = await import('@/lib/sources/carbon-price');
        const c = await fetchCarbonPrice();
        return c ? { euaPrice: c.price } : null;
      } catch { return null; }
    })(),

    // Live commodities
    (async () => {
      try {
        const { fetchDailyCommodities } = await import('@/lib/sources/alphavantage-commodities');
        return await fetchDailyCommodities();
      } catch { return []; }
    })(),

    // Live freight
    (async () => {
      try {
        const { getFreightRates } = await import('@/lib/services/freight.service');
        return await getFreightRates();
      } catch { return null; }
    })(),

    // Recent alerts
    db.supplyChainEvent.findMany({
      where: { type: 'alert', createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
      orderBy: { createdAt: 'desc' }, take: 5,
    }),

    // Recent recalls
    db.regulationChange.findMany({
      where: { source: 'CCPIT/CPSC', createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
      orderBy: { createdAt: 'desc' }, take: 5,
    }),
  ]);

  // Build real inventory state
  const inventoryState = inventory.map(i => ({
    sku: i.sku,
    productName: i.productName,
    quantity: i.quantity,
    safetyStock: i.safetyStock,
    reorderPoint: i.reorderPoint,
    stockStatus: i.stockStatus,
    warehouse: i.warehouse,
  }));

  // Build real shipment state
  const shipmentState = shipments.map(s => ({
    trackingNumber: s.trackingNumber,
    productName: s.productName,
    origin: s.origin,
    destination: s.destination,
    status: s.status,
    delayDays: s.delayDays,
    riskLevel: s.riskLevel,
    eta: s.eta,
  }));

  // Build real supplier state (with dynamic scoring if available)
  const supplierState = suppliers.map(s => {
    const ratingDetails = typeof s.ratingDetails === 'object' && s.ratingDetails
      ? (s.ratingDetails as any)
      : {};
    return {
      name: s.name,
      code: s.code,
      rating: s.rating,
      leadTime: s.leadTime,
      region: s.region,
      category: s.category,
      scoreBreakdown: ratingDetails.breakdown || '静态评分',
    };
  });

  // Product cost summary
  const productsWithCost = products
    .filter(p => p.cost)
    .map(p => ({
      sku: p.sku,
      name: p.name,
      category: p.category,
      totalLanded: p.cost!.totalLanded,
      grossMargin: p.cost!.grossMargin,
      stockQuantity: p.inventory?.quantity || 0,
      stockStatus: p.inventory?.stockStatus || 'unknown',
    }));

  // Computed derived fields for LLM agent compatibility
  const weatherSeverity = cascadeRisk.sources?.some((s: any) => s.cause?.includes('天气')) ? 40 : 15;

  // Tariff rate: try to fetch the live Section 301 List 3 rate from the DB
  // first; fall back to 7.5% (the default US Section 301 List 3 rate on
  // Chinese electro-mechanical imports, per USTR 4-year review extended to 2026).
  let tariffRate = 7.5; // default Section 301 List 3 rate
  try {
    const section301Rule = await db.tariffRule.findFirst({
      where: {
        countryCode: 'US',
        originCountry: 'CN',
        tradeAgreement: 'Section301-list3',
        isActive: true,
      },
      orderBy: { priority: 'desc' },
    });
    if (section301Rule) tariffRate = section301Rule.rate;
  } catch { /* keep default fallback */ }

  // Market demand heuristic: when inventory data is present we assume a
  // healthy/normal market (100); when the inventory feed is empty we assume
  // a degraded signal and lower the demand estimate (80). This is a proxy
  // until a real demand/sales-trend feed is wired in.
  const marketDemand = inventoryState.length > 0 ? 100 : 80;
  const stockoutEvents = inventoryState.filter(i => i.stockStatus === 'critical').length;
  const totalDelays = shipmentState.filter(s => s.status === 'delayed' || s.status === 'exception').length;

  return {
    round: 1,
    // Required by LLM agent interface
    weatherSeverity,
    exchangeRate: fx.usdCny,
    tariffRate,
    marketDemand,
    stockoutEvents,
    totalDelays,
    // Extended real-time external data
    fxMidpoint: fx.midpoint || 0,
    fxSpread: fx.spread || 0,
    // Fallback: 77 €/t is a conservative EUA price used when the live carbon
    // price feed (fetchCarbonPrice) is unavailable or returns null.
    carbonPrice: carbon?.euaPrice || 77,
    // Commodity trends
    commodityTrend: commodity.length > 0
      ? commodity.map(c => ({ name: c.name, price: c.price, changePct: c.changePct }))
      : [],
    // Freight
    freightAvgRate: freight?.avgRate40GP || 0,
    freightTrend: freight?.trend || 'stable',
    // Real DB data
    inventory: inventoryState,
    shipments: shipmentState,
    suppliers: supplierState,
    products: productsWithCost,
    // Cascade risk summary
    cascadeRisk,
    // Context
    recentAlerts: recentAlerts.map(a => ({ title: a.title, severity: a.severity, createdAt: a.createdAt })),
    cpscRecalls: cpscRecalls.map(r => ({ title: r.title, impactLevel: r.impactLevel, date: r.createdAt })),
  };
}

export const GET = withApiRateLimit(withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();
  const { searchParams } = new URL(request.url);
  const rounds = parseInt(searchParams.get('rounds') || '5');
  const role = searchParams.get('role');
  const mode = searchParams.get('mode') || 'run';

  const state = await gatherRealState();

  // ── Single agent mode ──────────────────────────────────────────────
  if (role && ['warehouse', 'supplier', 'forwarder', 'market'].includes(role)) {
    const decision = await runLLMAgent({
      role: role as any,
      state: { ...state, round: Math.min(rounds, 20) } as any,
    }, { serverSide: true });

    // Log to audit
    try {
      await db.auditLog.create({
        data: {
          action: 'SIMULATE', entity: 'sandbox-agent', userId: 'system',
          userName: `沙箱代理-${role}`, severity: 'info',
          details: { role, action: decision.action, confidence: decision.confidence, fallback: decision.fallback },
        },
      });
    } catch { /* non-critical */ }

    return NextResponse.json({
      success: true, mode: 'single', role,
      state: { round: state.round, exchangeRate: state.exchangeRate, cascadeRiskSummary: state.cascadeRisk },
      decision,
    });
  }

  // ── Compare mode ────────────────────────────────────────────────────
  if (mode === 'compare') {
    const llmDecisions = await runAllAgents(state as any, { serverSide: true });
    return NextResponse.json({
      success: true, mode: 'compare',
      state: { round: state.round, exchangeRate: state.exchangeRate },
      decisions: llmDecisions,
      note: 'fallback=true means LLM unavailable, rule-based logic used',
    });
  }

  // ── All agents mode ─────────────────────────────────────────────────
  const decisions = await runAllAgents(state as any);

  // Persist simulation event
  const summary = Object.entries(decisions).map(([r, d]) => ({
    role: r, action: d.action, confidence: d.confidence, llm: !d.fallback,
  }));
  try {
    await db.supplyChainEvent.create({
      data: {
        type: 'simulation',
        title: `沙箱协作: ${summary.map(s => `${s.role}=${s.action}`).join(', ')}`,
        description: JSON.stringify(summary),
        icon: '🧪',
        color: '#8b5cf6',
        severity: 'info',
      },
    });
  } catch { /* non-critical */ }

  return NextResponse.json({
    success: true, mode: 'all',
    state: {
      round: Math.min(rounds, 20),
      exchangeRate: state.exchangeRate,
      cascadeRiskSummary: state.cascadeRisk,
      inventoryCount: state.inventory.length,
      shipmentCount: state.shipments.length,
      supplierCount: state.suppliers.length,
    },
    decisions,
    summary,
  });
}));
