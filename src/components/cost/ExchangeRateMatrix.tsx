'use client';

import { useMemo, useEffect, useState } from 'react';
import { Globe, ArrowUp, ArrowDown, Minus, TrendingUp, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getExchangeRates, type ExchangeRateEntry } from '@/lib/exchange-rate';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

function RateCell({ rate }: { rate: ExchangeRateEntry }) {
  const isUp = rate.change > 0;
  const isDown = rate.change < 0;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`rounded-lg border p-3 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-default
              ${isUp ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20' : ''}
              ${isDown ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20' : ''}
              ${!isUp && !isDown ? 'border-border bg-card' : ''}
            `}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-muted-foreground tracking-wide">{rate.code}</span>
                <span className="text-[10px] text-muted-foreground/70">{rate.symbol}</span>
              </div>
              <div className={`flex items-center gap-0.5 text-[10px] font-medium ${
                isUp ? 'text-emerald-600 dark:text-emerald-400'
                : isDown ? 'text-red-600 dark:text-red-400'
                : 'text-muted-foreground'
              }`}>
                {isUp ? <ArrowUp className="h-2.5 w-2.5" /> : isDown ? <ArrowDown className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
                {rate.change > 0 ? '+' : ''}{rate.change.toFixed(2)}%
              </div>
            </div>
            <p className="text-lg font-bold tabular-nums tracking-tight">
              {rate.code === 'JPY'
                ? (rate.rate * 100).toFixed(4)
                : rate.rate.toFixed(4)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{rate.name}</p>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="space-y-1">
            <p className="font-semibold">{rate.code}/CNY — {rate.name}</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              <span className="text-muted-foreground">买入:</span><span className="font-mono">{rate.bid.toFixed(4)}</span>
              <span className="text-muted-foreground">卖出:</span><span className="font-mono">{rate.ask.toFixed(4)}</span>
              <span className="text-muted-foreground">日变动:</span>
              <span className={`font-mono ${rate.change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {rate.change > 0 ? '+' : ''}{rate.changeAmount.toFixed(4)}
              </span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ExchangeRateMatrix() {
  const staticSnapshot = useMemo(() => getExchangeRates(), []);
  const [rates, setRates] = useState<ExchangeRateEntry[]>(staticSnapshot.rates);
  const [dataSource, setDataSource] = useState<'frankfurter' | 'hybrid' | 'static'>('static');
  const [lastUpdated, setLastUpdated] = useState<number>(() => Date.now());

  // Fetch live rates from Frankfurter API on mount, then refresh every 5 minutes
  useEffect(() => {
    let cancelled = false;
    const fetchRates = () => {
      fetch('/api/exchange-rates?action=all')
        .then(res => res.json())
        .then(data => {
          if (cancelled) return;
          if (data.rates && data.rates.length > 0) {
            setRates(data.rates);
            setDataSource(data.source || 'static');
            setLastUpdated(Date.now());
          }
        })
        .catch(() => { /* keep current data on error */ });
    };

    fetchRates();
    const interval = setInterval(fetchRates, 300000); // 5 minutes
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const majorRates = rates.slice(0, 8);
  const otherRates = rates.slice(8);

  const dominantDirection = useMemo(() => {
    const ups = rates.filter(r => r.change > 0).length;
    const downs = rates.filter(r => r.change < 0).length;
    if (ups > downs) return { label: '人民币承压', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800' };
    if (downs > ups) return { label: '人民币走强', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800' };
    return { label: '汇率平稳', color: 'text-muted-foreground', bg: 'bg-muted/30', border: 'border-border' };
  }, [rates]);

  const updatedAt = useMemo(
    () => new Date(lastUpdated).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    [lastUpdated],
  );

  const sourceBadge = dataSource === 'frankfurter'
    ? { label: 'Frankfurter API', color: 'text-emerald-600 dark:text-emerald-400' }
    : dataSource === 'hybrid'
      ? { label: '混合数据', color: 'text-cyan-600 dark:text-cyan-400' }
      : { label: '静态数据', color: 'text-amber-600 dark:text-amber-400' };

  return (
    <Card
      className="card-dashboard border-cyan-200 dark:border-cyan-900"
     
    >
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              主要结算货币对 CNY 实时汇率
              <Badge variant="outline" className="text-[10px] h-5 gap-1 font-normal">
                <RefreshCw className="h-2.5 w-2.5" />
                实时
              </Badge>
            </CardTitle>
            <CardDescription>
              更新时间 {updatedAt} | {rates.length} 种货币 | 数据源: <span className={sourceBadge.color}>{sourceBadge.label}</span>
            </CardDescription>
          </div>
          <Badge className={`${dominantDirection.bg} ${dominantDirection.color} ${dominantDirection.border} border text-[10px] gap-1`}>
            <TrendingUp className="h-2.5 w-2.5" />
            {dominantDirection.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-3">
          {majorRates.map(rate => (
            <RateCell key={rate.code} rate={rate} />
          ))}
        </div>
        {otherRates.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {otherRates.map(rate => (
              <RateCell key={rate.code} rate={rate} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
