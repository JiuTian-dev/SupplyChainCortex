'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Globe, Ship, Plane, Clock, CheckCircle2, AlertTriangle, Truck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useLogistics } from '@/hooks/use-supply-chain-data';
import type { ShipmentRecord } from '@/lib/types';

// ==================== City Coordinates ====================
const CITIES: Record<string, { x: number; y: number; label: string; isOrigin: boolean }> = {
  '佛山': { x: 72, y: 44, label: '佛山', isOrigin: true },
  '深圳': { x: 74, y: 48, label: '深圳', isOrigin: true },
  '上海': { x: 78, y: 36, label: '上海', isOrigin: true },
  '义乌': { x: 76, y: 40, label: '义乌', isOrigin: true },
  'Los Angeles': { x: 13, y: 38, label: '洛杉矶', isOrigin: false },
  'New York': { x: 22, y: 36, label: '纽约', isOrigin: false },
  'London': { x: 47, y: 26, label: '伦敦', isOrigin: false },
  'Tokyo': { x: 83, y: 38, label: '东京', isOrigin: false },
};

// ==================== Route Definitions ====================
interface RouteDef {
  id: string;
  origin: string;
  destination: string;
  color: string;
  avgTransitDays: number;
  carrier: string;
}

const ROUTE_COLORS = ['#f97316', '#8b5cf6', '#ef4444', '#22c55e', '#06b6d4', '#f59e0b', '#ec4899', '#14b8a6'];

// ==================== Status Colors ====================
const STATUS_COLORS: Record<string, string> = {
  delivered: '#22c55e',
  in_transit: '#3b82f6',
  customs: '#f59e0b',
  delayed: '#ef4444',
  pending: '#94a3b8',
};

const STATUS_LABELS: Record<string, string> = {
  delivered: '已送达',
  in_transit: '运输中',
  customs: '清关中',
  delayed: '延误',
  pending: '待发货',
};

// ==================== Tooltip Data ====================
interface RouteTooltipData {
  route: RouteDef;
  shipments: ShipmentRecord[];
  originCity: typeof CITIES[string];
  destCity: typeof CITIES[string];
}

// ==================== ShipmentRouteMap Component ====================
export function ShipmentRouteMap() {
  const [hoveredRoute, setHoveredRoute] = useState<string | null>(null);
  const [tooltipData, setTooltipData] = useState<RouteTooltipData | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Fetch logistics data
  const logisticsListQuery = useLogistics('list');
  const shipments = useMemo(() => {
    if (!logisticsListQuery.data) return [];
    const data = logisticsListQuery.data as Record<string, unknown>;
    return (data.shipments || []) as ShipmentRecord[];
  }, [logisticsListQuery.data]);

  // Build route definitions dynamically from actual DB shipments
  const routeDefs = useMemo(() => {
    const seen = new Set<string>();
    const defs: RouteDef[] = [];
    for (const s of shipments) {
      const origin = String(s.origin || '');
      const dest = String(s.destination || '');
      const key = `${origin}→${dest}`;
      if (!seen.has(key) && origin && dest) {
        seen.add(key);
        defs.push({
          id: `R${defs.length + 1}`,
          origin, destination: dest,
          color: ROUTE_COLORS[defs.length % ROUTE_COLORS.length],
          avgTransitDays: 10 + Math.round(defs.length * 2.5) % 14,
          carrier: s.carrier || 'Unknown',
        });
      }
    }
    return defs.length > 0 ? defs : [{ id: 'R0', origin: '深圳', destination: '洛杉矶', color: '#f97316', avgTransitDays: 14, carrier: '-' }];
  }, [shipments]);

  // Map shipments to routes
  const routeShipments = useMemo(() => {
    const mapping: Record<string, ShipmentRecord[]> = {};
    routeDefs.forEach((r) => {
      mapping[r.id] = [];
    });

    // Map each shipment to a route based on origin/destination
    shipments.forEach((s) => {
      const origin = String(s.origin || '');
      const destination = String(s.destination || '');
      const matchedRoute = routeDefs.find(
        (r) =>
          (origin.includes(r.origin) || r.origin.includes(origin)) &&
          (destination.includes(r.destination) || r.destination.includes(destination) ||
           (destination === '洛杉矶' && r.destination === 'Los Angeles') ||
           (destination === '纽约' && r.destination === 'New York') ||
           (destination === '伦敦' && r.destination === 'London') ||
           (destination === '东京' && r.destination === 'Tokyo'))
      );
      if (matchedRoute) {
        mapping[matchedRoute.id].push(s);
      }
    });

    return mapping;
  }, [shipments]);

  // Compute route statuses from shipments
  const routeStatuses = useMemo(() => {
    const statuses: Record<string, string> = {};
    routeDefs.forEach((r) => {
      const rShipments = routeShipments[r.id] || [];
      if (rShipments.length === 0) {
        statuses[r.id] = 'pending';
        return;
      }
      // Priority: delayed > customs > in_transit > delivered
      if (rShipments.some((s) => s.status === 'delayed' || s.status === 'exception')) {
        statuses[r.id] = 'delayed';
      } else if (rShipments.some((s) => s.status === 'customs')) {
        statuses[r.id] = 'customs';
      } else if (rShipments.some((s) => s.status === 'in_transit')) {
        statuses[r.id] = 'in_transit';
      } else {
        statuses[r.id] = 'delivered';
      }
    });
    return statuses;
  }, [routeShipments]);

  // Statistics
  const stats = useMemo(() => {
    const totalRoutes = routeDefs.length;
    const activeShipments = shipments.filter(
      (s) => s.status === 'in_transit' || s.status === 'customs'
    ).length;
    const deliveredOnTime = shipments.filter(
      (s) => s.status === 'delivered' && (s.delayDays || 0) <= 0
    ).length;
    const totalDelivered = shipments.filter((s) => s.status === 'delivered').length;
    const onTimeRate = totalDelivered > 0 ? Math.round((deliveredOnTime / totalDelivered) * 100) : 0;
    const avgTransit = routeDefs.reduce((sum, r) => sum + r.avgTransitDays, 0) / routeDefs.length;

    return { totalRoutes, activeShipments, onTimeRate, avgTransit: Math.round(avgTransit * 10) / 10 };
  }, [shipments]);

  // Build curved SVG path
  const buildPath = useCallback((origin: string, destination: string) => {
    const from = CITIES[origin];
    const to = CITIES[destination];
    if (!from || !to) return '';

    const midX = (from.x + to.x) / 2;
    const arcHeight = 12 + Math.abs(from.x - to.x) * 0.1;
    const midY = Math.min(from.y, to.y) - arcHeight;

    return `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`;
  }, []);

  // Handle route hover
  const handleRouteHover = useCallback(
    (routeId: string, event: React.MouseEvent) => {
      setHoveredRoute(routeId);
      const route = routeDefs.find((r) => r.id === routeId);
      if (route) {
        const svgRect = (event.currentTarget as SVGElement).closest('svg')?.getBoundingClientRect();
        if (svgRect) {
          const x = event.clientX - svgRect.left;
          const y = event.clientY - svgRect.top;
          setTooltipPos({ x, y });
        }
        setTooltipData({
          route,
          shipments: routeShipments[routeId] || [],
          originCity: CITIES[route.origin],
          destCity: CITIES[route.destination],
        });
      }
    },
    [routeShipments]
  );

  const handleRouteLeave = useCallback(() => {
    setHoveredRoute(null);
    setTooltipData(null);
  }, []);

  return (
    <div className="space-y-4">
      {/* Statistics bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '总路线', value: stats.totalRoutes, icon: <Globe className="h-3.5 w-3.5" />, color: 'text-orange-600' },
          { label: '活跃货运', value: stats.activeShipments, icon: <Ship className="h-3.5 w-3.5" />, color: 'text-blue-600' },
          { label: '准时率', value: `${stats.onTimeRate}%`, icon: <CheckCircle2 className="h-3.5 w-3.5" />, color: 'text-green-600' },
          { label: '平均天数', value: `${stats.avgTransit}天`, icon: <Clock className="h-3.5 w-3.5" />, color: 'text-violet-600' },
        ].map((stat) => (
          <div key={stat.label} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
            <div className={stat.color}>{stat.icon}</div>
            <div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-sm font-bold">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* SVG Map */}
      <div className="relative overflow-x-auto">
        <TooltipProvider delayDuration={200}>
          <svg
            viewBox="0 0 100 65"
            className="w-full h-auto"
            style={{ minHeight: '240px' }}
          >
            {/* Defs */}
            <defs>
              <filter id="route-map-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="0.6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="city-dot-glow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="1.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <linearGradient id="map-ocean-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f8fafc" />
                <stop offset="100%" stopColor="#f1f5f9" />
              </linearGradient>
            </defs>

            {/* Background */}
            <rect
              x="0" y="0" width="100" height="65"
              fill="url(#map-ocean-gradient)"
              rx="4"
              className="dark:fill-gray-900"
            />

            {/* Simplified continent shapes */}
            {/* China/East Asia */}
            <path
              d="M 68 28 Q 72 24 78 28 L 82 32 Q 84 36 82 42 L 80 48 Q 78 52 74 52 L 70 50 Q 66 46 66 42 L 66 36 Q 66 30 68 28 Z"
              fill="#e2e8f0" fillOpacity="0.5" stroke="#cbd5e1" strokeWidth="0.3"
              className="dark:fill-gray-700 dark:fill-opacity-40 dark:stroke-gray-600"
            />
            {/* North America */}
            <path
              d="M 6 18 Q 10 14 16 16 L 24 18 Q 28 14 32 18 L 30 24 Q 28 30 26 36 L 22 40 Q 18 42 14 40 L 10 36 Q 6 30 6 24 Z"
              fill="#e2e8f0" fillOpacity="0.5" stroke="#cbd5e1" strokeWidth="0.3"
              className="dark:fill-gray-700 dark:fill-opacity-40 dark:stroke-gray-600"
            />
            {/* Europe */}
            <path
              d="M 42 18 Q 46 14 52 18 L 54 22 Q 52 28 48 30 L 44 28 Q 40 24 42 18 Z"
              fill="#e2e8f0" fillOpacity="0.5" stroke="#cbd5e1" strokeWidth="0.3"
              className="dark:fill-gray-700 dark:fill-opacity-40 dark:stroke-gray-600"
            />
            {/* Japan */}
            <path
              d="M 84 34 Q 86 30 88 34 L 88 38 Q 86 42 84 40 Z"
              fill="#e2e8f0" fillOpacity="0.5" stroke="#cbd5e1" strokeWidth="0.3"
              className="dark:fill-gray-700 dark:fill-opacity-40 dark:stroke-gray-600"
            />

            {/* Grid lines */}
            {[20, 40, 60, 80].map((x) => (
              <line key={`gvl-${x}`} x1={x} y1="5" x2={x} y2="60" stroke="#e2e8f0" strokeWidth="0.12" strokeDasharray="1,2" className="dark:stroke-gray-700 dark:opacity-40" />
            ))}
            {[20, 40].map((y) => (
              <line key={`ghl-${y}`} x1="5" y1={y} x2="95" y2={y} stroke="#e2e8f0" strokeWidth="0.12" strokeDasharray="1,2" className="dark:stroke-gray-700 dark:opacity-40" />
            ))}

            {/* Route lines */}
            {routeDefs.map((route) => {
              const pathD = buildPath(route.origin, route.destination);
              if (!pathD) return null;

              const status = routeStatuses[route.id] || 'pending';
              const statusColor = STATUS_COLORS[status] || route.color;
              const isHovered = hoveredRoute === route.id;
              const shipmentCount = (routeShipments[route.id] || []).length;

              // Compute stroke-dashoffset for animation
              const pathLength = 200; // Approximate

              return (
                <g key={route.id}>
                  {/* Route glow (on hover) */}
                  {isHovered && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke={statusColor}
                      strokeWidth="2"
                      opacity="0.2"
                      filter="url(#route-map-glow)"
                    />
                  )}

                  {/* Route line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={statusColor}
                    strokeWidth={isHovered ? '1.2' : '0.7'}
                    strokeDasharray="3,2"
                    opacity={hoveredRoute && !isHovered ? '0.2' : '0.8'}
                    filter="url(#route-map-glow)"
                    className="route-dash-animation"
                    style={{
                      animation: 'routeLineDraw 1.5s ease-out forwards',
                    }}
                  >
                    {/* Animated drawing on entrance */}
                    <animate
                      attributeName="stroke-dashoffset"
                      from={pathLength}
                      to="0"
                      dur="1.5s"
                      fill="freeze"
                    />
                  </path>

                  {/* Animated flowing dot */}
                  <circle r="0.7" fill={statusColor} opacity={hoveredRoute && !isHovered ? '0.2' : '0.9'}>
                    <animateMotion
                      dur={`${4 + route.avgTransitDays * 0.2}s`}
                      repeatCount="indefinite"
                      path={pathD}
                    />
                  </circle>

                  {/* Shipment count badge */}
                  {shipmentCount > 0 && (
                    <g>
                      <circle
                        cx={(() => {
                          const from = CITIES[route.origin];
                          const to = CITIES[route.destination];
                          return (from.x + to.x) / 2;
                        })()}
                        cy={(() => {
                          const from = CITIES[route.origin];
                          const to = CITIES[route.destination];
                          const arcHeight = 12 + Math.abs(from.x - to.x) * 0.1;
                          return Math.min(from.y, to.y) - arcHeight + 2;
                        })()}
                        r="2.5"
                        fill={statusColor}
                        opacity={hoveredRoute && !isHovered ? '0.15' : '0.9'}
                      />
                      <text
                        x={(() => {
                          const from = CITIES[route.origin];
                          const to = CITIES[route.destination];
                          return (from.x + to.x) / 2;
                        })()}
                        y={(() => {
                          const from = CITIES[route.origin];
                          const to = CITIES[route.destination];
                          const arcHeight = 12 + Math.abs(from.x - to.x) * 0.1;
                          return Math.min(from.y, to.y) - arcHeight + 2.6;
                        })()}
                        textAnchor="middle"
                        fontSize="2.5"
                        fill="white"
                        fontWeight="700"
                      >
                        {shipmentCount}
                      </text>
                    </g>
                  )}

                  {/* Invisible hit area for hover */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="4"
                    onMouseEnter={(e) => handleRouteHover(route.id, e)}
                    onMouseLeave={handleRouteLeave}
                    className="cursor-pointer"
                  />
                </g>
              );
            })}

            {/* City markers */}
            {Object.entries(CITIES).map(([key, city]) => (
              <g key={key}>
                {/* City dot */}
                <circle
                  cx={city.x}
                  cy={city.y}
                  r={city.isOrigin ? '2.2' : '2'}
                  fill={city.isOrigin ? '#f97316' : '#3b82f6'}
                  stroke="white"
                  strokeWidth="0.5"
                  filter="url(#city-dot-glow)"
                  className="dark:stroke-gray-800"
                />
                {/* Pulse ring for origin cities */}
                {city.isOrigin && (
                  <circle
                    cx={city.x}
                    cy={city.y}
                    r="2.2"
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="0.3"
                    opacity="0.6"
                  >
                    <animate attributeName="r" from="2.2" to="5" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.6" to="0" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                {/* City label */}
                <text
                  x={city.x}
                  y={city.y + 5}
                  textAnchor="middle"
                  fontSize="3"
                  fill="#374151"
                  className="dark:fill-gray-300"
                  fontWeight="500"
                >
                  {city.label}
                </text>
                {/* Origin/Destination indicator */}
                <text
                  x={city.x}
                  y={city.y - 3}
                  textAnchor="middle"
                  fontSize="1.8"
                  fill={city.isOrigin ? '#f97316' : '#3b82f6'}
                  className="dark:fill-orange-400"
                  fontWeight="600"
                >
                  {city.isOrigin ? '●' : '◆'}
                </text>
              </g>
            ))}
          </svg>

          {/* Hover tooltip */}
          {tooltipData && hoveredRoute && (
            <div
              className="absolute z-50 pointer-events-none bg-popover border rounded-lg shadow-lg p-3 text-xs max-w-[220px]"
              style={{
                left: `${Math.min(tooltipPos.x, 400)}px`,
                top: `${tooltipPos.y - 120}px`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5"
                  style={{
                    borderColor: STATUS_COLORS[routeStatuses[hoveredRoute] || 'pending'] + '60',
                    color: STATUS_COLORS[routeStatuses[hoveredRoute] || 'pending'],
                  }}
                >
                  {STATUS_LABELS[routeStatuses[hoveredRoute] || 'pending']}
                </Badge>
                <span className="font-semibold">{tooltipData.route.id}</span>
              </div>
              <div className="space-y-1 text-muted-foreground">
                <p>
                  <span className="text-foreground font-medium">{tooltipData.originCity.label}</span>
                  {' → '}
                  <span className="text-foreground font-medium">{tooltipData.destCity.label}</span>
                </p>
                <p>承运商: <span className="text-foreground">{tooltipData.route.carrier}</span></p>
                <p>平均时效: <span className="text-foreground">{tooltipData.route.avgTransitDays} 天</span></p>
                <p>货运批次: <span className="text-foreground">{tooltipData.shipments.length}</span></p>
              </div>
            </div>
          )}
        </TooltipProvider>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs">
        {Object.entries(STATUS_LABELS).map(([status, label]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div
              className="w-4 h-0.5 rounded"
              style={{ backgroundColor: STATUS_COLORS[status] }}
            />
            <span className="text-muted-foreground">{label}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-orange-500" /> 发货地
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500" /> 目的地
          </span>
        </div>
      </div>

      {/* Route summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {routeDefs.slice(0, 4).map((route) => {
          const status = routeStatuses[route.id] || 'pending';
          const statusColor = STATUS_COLORS[status];
          const count = (routeShipments[route.id] || []).length;
          const originCity = CITIES[route.origin];
          const destCity = CITIES[route.destination];

          return (
            <div
              key={route.id}
              className="p-2 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors"
              style={{ borderLeftWidth: '3px', borderLeftColor: statusColor }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-muted-foreground">{route.id}</span>
                <Badge
                  variant="outline"
                  className="text-[9px] px-1 py-0 h-4"
                  style={{ borderColor: statusColor + '60', color: statusColor }}
                >
                  {STATUS_LABELS[status]}
                </Badge>
              </div>
              <p className="text-xs font-semibold truncate">
                {originCity?.label} → {destCity?.label}
              </p>
              <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                <span>{route.avgTransitDays}天</span>
                <span>·</span>
                <span>{count}批</span>
                <span>·</span>
                <span>{route.carrier}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* CSS Animation keyframes for route line drawing */}
      <style jsx>{`
        @keyframes routeLineDraw {
          from {
            stroke-dashoffset: 200;
            opacity: 0;
          }
          to {
            stroke-dashoffset: 0;
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
