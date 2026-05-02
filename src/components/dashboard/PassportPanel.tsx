'use client';

import { useState, useEffect } from 'react';
import { ShieldCheck, ChevronDown, ExternalLink, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface PassportData {
  auditId: string;
  engine: string;
  confidence: number;
  ruleVersion: string;
  generatedAt: string;
  dataProvenance: Array<{ source: string; status: string; latencyMs: number }>;
  alternatives: Array<{ action: string; expectedImpact: string; confidence: number }>;
  warnings: string[];
}

const SOURCE_ICONS: Record<string, string> = {
  'weather:open-meteo': '🌤',
  'fx:frankfurter': '💱',
  'db:inventory': '📦',
  'db:shipments': '🚢',
  'db:suppliers': '🏢',
};

export function PassportPanel() {
  const [passport, setPassport] = useState<PassportData | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch('/api/cascade-risk?scenario=auto')
      .then(r => r.json())
      .then(d => { if (d.passport) setPassport(d.passport); })
      .catch(() => {});
  }, []);

  if (!passport) return null;

  const confidenceLabel = passport.confidence >= 0.9 ? '高' : passport.confidence >= 0.7 ? '中' : '低';
  const confidenceColor = passport.confidence >= 0.9 ? 'text-green-600' : passport.confidence >= 0.7 ? 'text-yellow-600' : 'text-red-600';

  return (
    <Card className="border-purple-200 dark:border-purple-800">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-purple-500" />
              <CardTitle className="text-sm font-semibold">决策溯源护照</CardTitle>
              <Badge variant="outline" className={`text-[10px] ${confidenceColor}`}>
                置信度: {(passport.confidence * 100).toFixed(0)}%
              </Badge>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 text-xs">
                <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            {/* Audit ID */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ExternalLink className="h-3 w-3" />
              <span className="font-mono text-[10px]">{passport.auditId}</span>
              <span className="text-muted-foreground">· 版本 {passport.ruleVersion.slice(0, 8)}</span>
            </div>

            {/* Data Provenance Chain */}
            <div>
              <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                <Activity className="h-3 w-3" />数据溯源链 ({passport.dataProvenance.length} 源)
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {passport.dataProvenance.map((p, i) => (
                  <Badge
                    key={i}
                    variant={p.status === 'ok' ? 'default' : p.status === 'degraded' ? 'secondary' : 'outline'}
                    className={`text-[9px] gap-1 ${p.status === 'ok' ? 'bg-green-50 text-green-700' : p.status === 'degraded' ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'}`}
                  >
                    {SOURCE_ICONS[p.source] || '📡'} {p.source.split(':')[0]}
                    {p.status !== 'ok' && ` (${p.status})`}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Alternatives */}
            {passport.alternatives.length > 0 && (
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">替代方案对比</div>
                <div className="space-y-1">
                  {passport.alternatives.slice(0, 3).map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1">
                      <span>{a.action}</span>
                      <span className="text-muted-foreground">{a.expectedImpact}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {passport.warnings.length > 0 && (
              <div className="text-[10px] text-yellow-600">
                ⚠ {passport.warnings.join('; ')}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
