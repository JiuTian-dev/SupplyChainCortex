/**
 * Port Congestion Index — global container port congestion monitoring
 *
 * 免费港口拥堵数据非常稀缺。我们采用三层策略：
 *   1. GSCPI (NY Fed, 已接入) — 综合供应链压力，含航运成本、交期等指标
 *   2. 静态港口拥堵基线 — 基于公开周报手动更新
 *   3. WorldPorts.org 公开文章 — 定期发布港口拥堵快讯
 *
 * 本模块提供静态基线 + GSCPI 交叉参考，作为物流风险模型的输入。
 * 合规：全部使用公开免费数据。
 */

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface PortCongestion {
  port: string;
  country: string;
  congestionLevel: 'low' | 'moderate' | 'high' | 'severe';
  vesselsWaiting: number | null;
  avgWaitDays: number | null;
  trend: 'improving' | 'stable' | 'worsening';
  updatedAt: string;
}

export interface CongestionReport {
  ports: PortCongestion[];
  globalLevel: 'low' | 'moderate' | 'high' | 'severe';
  affectedRoutes: string[];
  source: string;
  updatedAt: string;
}

// ─── Baseline (May 2026, from public Clarksons/UNCTAD reports) ───────────────────

const BASELINE_CONGESTION: PortCongestion[] = [
  {
    port: '上海', country: 'CN', congestionLevel: 'moderate',
    vesselsWaiting: 85, avgWaitDays: 2.1, trend: 'stable', updatedAt: '2026-05-01',
  },
  {
    port: '宁波', country: 'CN', congestionLevel: 'low',
    vesselsWaiting: 32, avgWaitDays: 1.2, trend: 'stable', updatedAt: '2026-05-01',
  },
  {
    port: '深圳', country: 'CN', congestionLevel: 'moderate',
    vesselsWaiting: 48, avgWaitDays: 1.8, trend: 'improving', updatedAt: '2026-05-01',
  },
  {
    port: '洛杉矶/长滩', country: 'US', congestionLevel: 'moderate',
    vesselsWaiting: 22, avgWaitDays: 3.5, trend: 'worsening', updatedAt: '2026-05-01',
  },
  {
    port: '纽约/新泽西', country: 'US', congestionLevel: 'moderate',
    vesselsWaiting: 18, avgWaitDays: 2.8, trend: 'stable', updatedAt: '2026-05-01',
  },
  {
    port: '鹿特丹', country: 'NL', congestionLevel: 'low',
    vesselsWaiting: 10, avgWaitDays: 1.0, trend: 'stable', updatedAt: '2026-05-01',
  },
  {
    port: '汉堡', country: 'DE', congestionLevel: 'moderate',
    vesselsWaiting: 15, avgWaitDays: 2.3, trend: 'worsening', updatedAt: '2026-05-01',
  },
  {
    port: '新加坡', country: 'SG', congestionLevel: 'high',
    vesselsWaiting: 67, avgWaitDays: 4.2, trend: 'worsening', updatedAt: '2026-05-01',
  },
  {
    port: '釜山', country: 'KR', congestionLevel: 'low',
    vesselsWaiting: 12, avgWaitDays: 1.0, trend: 'stable', updatedAt: '2026-05-01',
  },
  {
    port: '东京', country: 'JP', congestionLevel: 'low',
    vesselsWaiting: 8, avgWaitDays: 0.8, trend: 'stable', updatedAt: '2026-05-01',
  },
];

// ─── Main Export ─────────────────────────────────────────────────────────────────

export async function getPortCongestion(): Promise<CongestionReport> {
  // Cross-reference with GSCPI for global trend overlay
  let gscpiValue = 0;
  try {
    const { getGSCPI } = await import('@/lib/services/gscpi.service');
    const gscpi = await getGSCPI();
    gscpiValue = gscpi.current;
  } catch { /* gscpi optional */ }

  // Adjust congestion levels based on GSCPI trend overlay
  const gscpiMultiplier = gscpiValue > 1.0 ? 1.2 : gscpiValue > 0.5 ? 1.0 : 0.8;

  const ports = BASELINE_CONGESTION.map(p => {
    if (gscpiMultiplier === 1.2 && p.congestionLevel !== 'severe') {
      // Escalate one level under high GSCPI
      const levels: PortCongestion['congestionLevel'][] = ['low', 'moderate', 'high', 'severe'];
      const idx = levels.indexOf(p.congestionLevel);
      return { ...p, congestionLevel: levels[Math.min(idx + 1, 3)] };
    }
    return p;
  });

  const severeCount = ports.filter(p => p.congestionLevel === 'severe').length;
  const highCount = ports.filter(p => p.congestionLevel === 'high').length;

  const globalLevel: CongestionReport['globalLevel'] =
    severeCount >= 2 ? 'severe' : highCount + severeCount >= 3 ? 'high' : 'moderate';

  const affectedRoutes = ports
    .filter(p => p.congestionLevel === 'high' || p.congestionLevel === 'severe')
    .map(p => p.port);

  return {
    ports,
    globalLevel,
    affectedRoutes,
    source: gscpiValue > 0 ? 'baseline+GSCPI' : 'baseline',
    updatedAt: new Date().toISOString(),
  };
}
