'use client';

import { useState, useMemo, useEffect } from 'react';
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

// Comprehensive Chinese city → SVG map coordinate lookup.
// Geography data, not business data — covers any future supplier/warehouse city.
const CITY_COORDS: Record<string, { x: number; y: number }> = {
  '深圳':{x:60,y:76},'东莞':{x:58,y:74},'广州':{x:54,y:72},'佛山':{x:52,y:70},'厦门':{x:66,y:66},
  '上海':{x:78,y:38},'杭州':{x:74,y:44},'宁波':{x:80,y:42},'义乌':{x:72,y:48},'苏州':{x:76,y:40},
  '南京':{x:72,y:38},'无锡':{x:74,y:36},'合肥':{x:70,y:44},'温州':{x:78,y:50},
  '北京':{x:72,y:18},'天津':{x:74,y:22},'青岛':{x:78,y:28},'大连':{x:80,y:20},
  '成都':{x:40,y:54},'重庆':{x:46,y:56},'昆明':{x:32,y:70},'贵阳':{x:44,y:66},
  '武汉':{x:62,y:50},'郑州':{x:64,y:38},'长沙':{x:58,y:56},'南昌':{x:66,y:54},
  '西安':{x:50,y:40},'兰州':{x:38,y:36},'沈阳':{x:80,y:16},'哈尔滨':{x:84,y:10},
  '海防':{x:44,y:82},'河内':{x:42,y:84},'胡志明':{x:40,y:88},
};

// Parse city from warehouse name: "深圳仓"→"深圳", "义乌仓"→"义乌"
function cityFromWarehouse(wh: string): string {
  return wh.replace(/仓$/,'');
}

function getCityForRegion(region: string): string {
  const map: Record<string, string> = { '华南':'广州','华东':'上海','西南':'成都','华北':'北京','华中':'武汉' };
  return map[region] || '广州';
}

const SUPPLIER_COLORS = ['#f59e0b','#f97316','#06b6d4','#8b5cf6','#ef4444','#22c55e'];
const WAREHOUSE_COLORS = ['#22c55e','#8b5cf6','#06b6d4','#f59e0b'];

function getCoord(city: string, fallback: {x:number;y:number}) {
  return CITY_COORDS[city] || fallback;
}

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

  // Build supplier geo locations from API data + city coordinate table
  const supplierLocations = useMemo((): GeoLocation[] => {
    return suppliers.map((s, idx) => {
      const region = (s.region as string) || '华南';
      const city = getCityForRegion(region);
      const coords = getCoord(city, { x: 60, y: 60 });
      return {
        name: (s.name as string) || (s.code as string),
        type: 'supplier' as const,
        city,
        x: coords.x + (idx % 3 - 1) * 2,
        y: coords.y + (idx % 2) * 1.5,
        color: SUPPLIER_COLORS[idx % SUPPLIER_COLORS.length],
        region,
        leadTime: (s.leadTime as number) || 0,
      };
    });
  }, [suppliers]);

  // Query warehouse names from inventory API
  const [warehouseNames, setWarehouseNames] = useState<string[]>([]);
  useEffect(() => {
    fetch('/api/inventory?action=warehouse_zones')
      .then(r => r.json())
      .then(d => {
        const names = (d.zones || d.data?.zones || []).map((z: any) => z.warehouse as string).filter(Boolean);
        setWarehouseNames(names.length > 0 ? [...new Set(names)] as string[] : ['深圳仓','义乌仓']);
      })
      .catch(() => setWarehouseNames(['深圳仓','义乌仓','宁波仓','越南仓']));
  }, []);

  // Build warehouse locations from real warehouse names
  const warehouseLocations = useMemo((): GeoLocation[] => {
    return warehouseNames.map((name, idx) => {
      const city = cityFromWarehouse(name);
      const coords = getCoord(city, { x: 50 + idx * 10, y: 40 + idx * 10 });
      return {
        name, type: 'warehouse' as const, city,
        x: coords.x, y: coords.y,
        color: WAREHOUSE_COLORS[idx % WAREHOUSE_COLORS.length],
      };
    });
  }, [warehouseNames]);

  // Build connections from each supplier to the nearest warehouse (same region)
  const connections = useMemo(() => {
    if (warehouseLocations.length === 0) return [] as { from: string; to: string }[];
    return supplierLocations.map(s => {
      // Find nearest warehouse by proximity or region match
      const nearest = warehouseLocations.reduce((best, wh) => {
        const dBest = Math.abs(best.x - s.x) + Math.abs(best.y - s.y);
        const dWh = Math.abs(wh.x - s.x) + Math.abs(wh.y - s.y);
        return dWh < dBest ? wh : best;
      });
      return { from: s.name, to: nearest.name };
    });
  }, [supplierLocations, warehouseLocations]);

  // Statistics
  const totalSuppliers = suppliers.length;
  const activeSuppliers = suppliers.filter((s) => s.status === 'active').length;
  const avgLeadTime = suppliers.length > 0
    ? Math.round(suppliers.reduce((sum, s) => sum + ((s.leadTime as number) || 0), 0) / suppliers.length)
    : 0;
  const regions = [...new Set(suppliers.map((s) => s.region as string).filter(Boolean))];

  // Find connection coordinates
  const allLocations = [...supplierLocations, ...warehouseLocations];
  const getLocation = (name: string) => allLocations.find((l) => l.name === name);

  return (
    <Card
      className="card-dashboard"
     
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <MapPin className="h-4 w-4 text-orange-500" />
          供应商地理分布
          <Badge variant="outline" className="ml-auto text-xs font-normal">
            {totalSuppliers} 供应商 · {warehouseLocations.length} 仓库
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
            {connections.map((conn, idx) => {
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
            {warehouseLocations.map((wh) => (
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
            {supplierLocations.map((loc, idx) => (
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
