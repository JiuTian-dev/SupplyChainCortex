'use client';

import { useState, useMemo } from 'react';
import { MapPin, Warehouse, Truck, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSuppliers } from '@/hooks/use-supply-chain-data';

// ==================== Geographic Coordinate Data ====================
interface GeoLocation {
  name: string;
  type: 'supplier' | 'warehouse';
  city: string;
  x: number; // percentage position on SVG
  y: number;
  color: string;
  region?: string;
  leadTime?: number;
}

const SUPPLIER_LOCATIONS: GeoLocation[] = [
  { name: '东莞精密', type: 'supplier', city: '东莞', x: 62, y: 68, color: '#f59e0b', leadTime: 5 },
  { name: '佛山制造', type: 'supplier', city: '佛山', x: 55, y: 72, color: '#f97316', leadTime: 7 },
  { name: '上海电子', type: 'supplier', city: '上海', x: 78, y: 38, color: '#06b6d4', leadTime: 10 },
  { name: '义乌日用品', type: 'supplier', city: '义乌', x: 74, y: 52, color: '#8b5cf6', leadTime: 8 },
  { name: '深圳科技', type: 'supplier', city: '深圳', x: 60, y: 74, color: '#ef4444', leadTime: 4 },
  { name: '杭州贸易', type: 'supplier', city: '杭州', x: 76, y: 48, color: '#22c55e', leadTime: 9 },
];

const WAREHOUSE_LOCATIONS: GeoLocation[] = [
  { name: '华东仓', type: 'warehouse', city: '上海', x: 78, y: 35, color: '#22c55e' },
  { name: '华南仓', type: 'warehouse', city: '佛山', x: 55, y: 69, color: '#10b981' },
];

// ==================== Connection lines: supplier -> nearest warehouse ====================
const CONNECTIONS = [
  { from: '东莞精密', to: '华南仓' },
  { from: '佛山制造', to: '华南仓' },
  { from: '深圳科技', to: '华南仓' },
  { from: '上海电子', to: '华东仓' },
  { from: '义乌日用品', to: '华东仓' },
  { from: '杭州贸易', to: '华东仓' },
];

// ==================== Tooltip State ====================
interface TooltipInfo {
  name: string;
  type: 'supplier' | 'warehouse';
  city: string;
  x: number;
  y: number;
  color: string;
  leadTime?: number;
  region?: string;
}

// ==================== SupplierGeoMap Component ====================
export function SupplierGeoMap() {
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const { data: supplierData } = useSuppliers();

  // Derive suppliers from API data
  const suppliers = useMemo(() => {
    if (!supplierData) return [];
    return (supplierData as Record<string, unknown>)?.suppliers as Record<string, unknown>[] || [];
  }, [supplierData]);

  // Merge API supplier data with geo locations
  const enrichedLocations = useMemo(() => {
    return SUPPLIER_LOCATIONS.map((loc) => {
      const apiSupplier = suppliers.find((s) => s.name === loc.name);
      return {
        ...loc,
        region: (apiSupplier?.region as string) || loc.city,
        leadTime: (apiSupplier?.leadTime as number) || loc.leadTime || 0,
      };
    });
  }, [suppliers]);

  // Statistics
  const totalSuppliers = enrichedLocations.length;
  const activeSuppliers = suppliers.filter((s) => s.status === 'active').length || enrichedLocations.length;
  const avgLeadTime = enrichedLocations.length > 0
    ? Math.round(enrichedLocations.reduce((sum, s) => sum + (s.leadTime || 0), 0) / enrichedLocations.length)
    : 0;
  const regions = [...new Set(enrichedLocations.map((s) => s.city))];

  // Find connection coordinates
  const allLocations = [...enrichedLocations, ...WAREHOUSE_LOCATIONS];
  const getLocation = (name: string) => allLocations.find((l) => l.name === name);

  return (
    <Card
      className="card-entrance hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
      style={{ '--delay': '100ms' } as React.CSSProperties}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <MapPin className="h-4 w-4 text-orange-500" />
          供应商地理分布
          <Badge variant="outline" className="ml-auto text-xs font-normal">
            {totalSuppliers} 供应商 · {WAREHOUSE_LOCATIONS.length} 仓库
          </Badge>
        </CardTitle>
        <CardDescription>供应商与仓库分布可视化</CardDescription>
      </CardHeader>
      <CardContent>
        {/* SVG Map */}
        <div className="overflow-x-auto -mx-2 px-2">
          <svg
            viewBox="0 0 100 88"
            className="w-full min-w-[500px]"
            style={{ maxHeight: '380px' }}
          >
            {/* Background - simplified China outline hint */}
            <rect x="0" y="0" width="100" height="88" rx="8" fill="currentColor" className="text-muted/10 dark:text-muted/5" />

            {/* Grid lines for context */}
            {[20, 40, 60, 80].map((x) => (
              <line key={`vl-${x}`} x1={x} y1="5" x2={x} y2="83" stroke="currentColor" className="text-muted/10" strokeWidth="0.2" strokeDasharray="1 2" />
            ))}
            {[20, 40, 60, 80].map((y) => (
              <line key={`hl-${y}`} x1="5" y1={y} x2="95" y2={y} stroke="currentColor" className="text-muted/10" strokeWidth="0.2" strokeDasharray="1 2" />
            ))}

            {/* Region labels */}
            <text x="68" y="28" fontSize="3" fill="currentColor" className="text-muted-foreground/40" textAnchor="middle">华东地区</text>
            <text x="50" y="82" fontSize="3" fill="currentColor" className="text-muted-foreground/40" textAnchor="middle">华南地区</text>

            {/* Connection lines with animated flow */}
            {CONNECTIONS.map((conn, idx) => {
              const from = getLocation(conn.from);
              const to = getLocation(conn.to);
              if (!from || !to) return null;
              const midX = (from.x + to.x) / 2;
              const midY = (from.y + to.y) / 2 - 3;
              const pathId = `route-${idx}`;
              const path = `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`;
              return (
                <g key={pathId}>
                  {/* Route path */}
                  <path
                    d={path}
                    fill="none"
                    stroke={from.color}
                    strokeWidth="0.4"
                    strokeOpacity="0.3"
                    className="route-flow-line"
                  />
                  {/* Animated traveling dot */}
                  <circle r="0.8" fill={from.color} opacity="0.8">
                    <animateMotion dur={`${3 + idx * 0.5}s`} repeatCount="indefinite" begin={`${idx * 0.3}s`}>
                      <mpath href={`#${pathId}`} />
                    </animateMotion>
                  </circle>
                  <circle r="0.5" fill={from.color} opacity="0.5">
                    <animateMotion dur={`${3 + idx * 0.5}s`} repeatCount="indefinite" begin={`${idx * 0.3 + 1.5}s`}>
                      <mpath href={`#${pathId}`} />
                    </animateMotion>
                  </circle>
                  {/* Hidden path definition for animateMotion */}
                  <path id={pathId} d={path} fill="none" stroke="none" />
                </g>
              );
            })}

            {/* Warehouse markers */}
            {WAREHOUSE_LOCATIONS.map((wh) => (
              <g key={wh.name}>
                {/* Warehouse pulse ring */}
                <circle
                  cx={wh.x}
                  cy={wh.y}
                  r="3"
                  fill="none"
                  stroke={wh.color}
                  strokeWidth="0.3"
                  opacity="0.3"
                  className="geo-pulse-dot"
                />
                {/* Warehouse icon background */}
                <rect
                  x={wh.x - 2.5}
                  y={wh.y - 2}
                  width="5"
                  height="4"
                  rx="0.5"
                  fill={wh.color}
                  fillOpacity="0.15"
                  stroke={wh.color}
                  strokeWidth="0.3"
                />
                {/* Warehouse icon */}
                <text
                  x={wh.x}
                  y={wh.y + 0.8}
                  fontSize="2.5"
                  fill={wh.color}
                  textAnchor="middle"
                  className="select-none"
                >
                  ▣
                </text>
                {/* Warehouse label */}
                <text
                  x={wh.x}
                  y={wh.y - 3}
                  fontSize="2"
                  fill="currentColor"
                  className="text-foreground"
                  textAnchor="middle"
                  fontWeight="600"
                >
                  {wh.name}
                </text>
                {/* Hover area */}
                <rect
                  x={wh.x - 4}
                  y={wh.y - 4}
                  width="8"
                  height="8"
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setTooltip({ ...wh, leadTime: 0 })}
                  onMouseLeave={() => setTooltip(null)}
                />
              </g>
            ))}

            {/* Supplier markers */}
            {enrichedLocations.map((loc, idx) => (
              <g key={loc.name}>
                {/* Supplier pulse ring */}
                <circle
                  cx={loc.x}
                  cy={loc.y}
                  r="2.5"
                  fill="none"
                  stroke={loc.color}
                  strokeWidth="0.2"
                  opacity="0.4"
                  className="geo-pulse-dot"
                  style={{ animationDelay: `${(idx * 0.3) % 2}s` }}
                />
                {/* Supplier dot */}
                <circle
                  cx={loc.x}
                  cy={loc.y}
                  r="1.5"
                  fill={loc.color}
                  fillOpacity="0.8"
                  stroke={loc.color}
                  strokeWidth="0.3"
                  className="cursor-pointer hover:fill-opacity-100 transition-all"
                />
                {/* Supplier label */}
                <text
                  x={loc.x}
                  y={loc.y - 3}
                  fontSize="1.8"
                  fill="currentColor"
                  className="text-foreground"
                  textAnchor="middle"
                  fontWeight="500"
                >
                  {loc.name}
                </text>
                {/* Hover area */}
                <circle
                  cx={loc.x}
                  cy={loc.y}
                  r="3"
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setTooltip(loc)}
                  onMouseLeave={() => setTooltip(null)}
                />
              </g>
            ))}

            {/* Tooltip */}
            {tooltip && (
              <g>
                <rect
                  x={Math.min(Math.max(tooltip.x - 15, 2), 70)}
                  y={tooltip.y + 5}
                  width="30"
                  height={tooltip.type === 'supplier' ? 10 : 7}
                  rx="2"
                  fill="currentColor"
                  className="text-card"
                  stroke={tooltip.color}
                  strokeWidth="0.3"
                />
                <text
                  x={Math.min(Math.max(tooltip.x, 17), 85)}
                  y={tooltip.y + 8}
                  fontSize="1.8"
                  fill="currentColor"
                  className="text-foreground"
                  textAnchor="middle"
                  fontWeight="600"
                >
                  {tooltip.name}
                </text>
                <text
                  x={Math.min(Math.max(tooltip.x, 17), 85)}
                  y={tooltip.y + 10.5}
                  fontSize="1.4"
                  fill="currentColor"
                  className="text-muted-foreground"
                  textAnchor="middle"
                >
                  {tooltip.city} · {tooltip.type === 'supplier' ? '供应商' : '仓库'}
                </text>
                {tooltip.type === 'supplier' && tooltip.leadTime !== undefined && (
                  <text
                    x={Math.min(Math.max(tooltip.x, 17), 85)}
                    y={tooltip.y + 13}
                    fontSize="1.3"
                    fill={tooltip.color}
                    textAnchor="middle"
                  >
                    交货期 {tooltip.leadTime}天
                  </text>
                )}
              </g>
            )}
          </svg>
        </div>

        {/* Statistics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <MapPin className="h-3 w-3 text-orange-500" />
              <p className="text-xs text-muted-foreground">总供应商</p>
            </div>
            <p className="text-xl font-bold">{totalSuppliers}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Truck className="h-3 w-3 text-emerald-500" />
              <p className="text-xs text-muted-foreground">活跃供应商</p>
            </div>
            <p className="text-xl font-bold text-emerald-600">{activeSuppliers}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Clock className="h-3 w-3 text-cyan-500" />
              <p className="text-xs text-muted-foreground">平均交货期</p>
            </div>
            <p className="text-xl font-bold">{avgLeadTime}<span className="text-xs font-normal text-muted-foreground ml-0.5">天</span></p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Warehouse className="h-3 w-3 text-violet-500" />
              <p className="text-xs text-muted-foreground">区域分布</p>
            </div>
            <p className="text-xl font-bold">{regions.length}<span className="text-xs font-normal text-muted-foreground ml-0.5">个城市</span></p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mt-3 px-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" />
            供应商
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-2.5 h-2.5 rounded bg-emerald-500 border border-emerald-600" />
            仓库
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-6 h-0 border-t-2 border-dashed border-orange-400" />
            物流路线
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
