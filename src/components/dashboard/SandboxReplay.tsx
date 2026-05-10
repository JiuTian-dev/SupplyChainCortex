'use client';

import { useState, useEffect } from 'react';
import { Play, RotateCcw, Hash, Brain, Cpu, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const SCENARIOS = ['当前趋势', 'baseline', 'stress_test'] as const;

export function SandboxReplay() {
  const [scenario, setScenario] = useState<string>('当前趋势');
  const [rounds, setRounds] = useState(50);
  const [seed, setSeed] = useState('42');
  const [mode, setMode] = useState<'rule' | 'llm' | 'compare'>('rule');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastSeed, setLastSeed] = useState('');
  const [liveParams, setLiveParams] = useState<Record<string, number>>({});
  const [liveLoaded, setLiveLoaded] = useState(false);

  // Load live commodity/freight data for the "当前趋势" baseline
  useEffect(() => {
    const loadLive = async () => {
      try {
        const [commodity, freight] = await Promise.all([
          fetch('/api/commodity').then(r => r.json()).catch(() => ({})),
          fetch('/api/freight').then(r => r.json()).catch(() => ({})),
        ]);
        const copperChange = (commodity?.commodities?.find((c: Record<string, unknown>) => c.code === 'COPPER')?.changePct as number) || 0;
        const freightChange = (freight?.rates?.[0]?.changePct as number) || 0;
        setLiveParams({
          copperChange: Math.round(copperChange * 10) / 10,
          freightTrend: freight?.trend === 'rising' ? 1 : freight?.trend === 'falling' ? -1 : 0,
          avgFreightRate: freight?.avgRate40GP || 0,
        });
        setLiveLoaded(true);
      } catch { /* use defaults */ }
    };
    loadLive();
  }, []);

  const run = async (replaySeed?: string) => {
    setLoading(true);
    const s = replaySeed || seed;
    setLastSeed(s);
    try {
      // Map scenario names to API params
      const scenarioParam = scenario === '当前趋势' ? 'auto' : scenario;
      const baseUrl = mode === 'rule'
        ? `/api/sandbox?scenario=${scenarioParam}&rounds=${rounds}&seed=${s}`
        : `/api/sandbox-llm?mode=${mode}&rounds=${rounds}&seed=${s}`;
      const res = await fetch(baseUrl);
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ error: '沙箱执行失败' });
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Hash className="h-4 w-4 text-blue-500" />沙箱仿真回放
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={scenario} onValueChange={setScenario}>
            <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="当前趋势"><span className="flex items-center gap-1"><TrendingUp className="h-3 w-3 text-orange-500" />当前趋势</span></SelectItem>
              <SelectItem value="baseline">基准（无冲击）</SelectItem>
              <SelectItem value="stress_test">压力测试（极端）</SelectItem>
            </SelectContent>
          </Select>
          <Input type="number" value={rounds} onChange={e => setRounds(Number(e.target.value))} className="h-7 text-xs w-16" min={10} max={200} />
          <span className="text-xs text-muted-foreground">轮</span>
          {scenario === '当前趋势' && liveLoaded && (
            <Badge variant="outline" className="text-[9px] h-5 gap-1 font-normal">
              🟡 铜 {(liveParams.copperChange as number) > 0 ? '+' : ''}{liveParams.copperChange}% · 运费 ${liveParams.avgFreightRate}
            </Badge>
          )}
          <Input value={seed} onChange={e => setSeed(e.target.value)} className="h-7 text-xs w-20 font-mono" placeholder="seed" />
          {/* Mode toggle */}
          <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
            <Button
              size="sm"
              variant={mode === 'rule' ? 'default' : 'ghost'}
              className="h-6 text-[10px] gap-1 px-2"
              onClick={() => setMode('rule')}
            >
              <Cpu className="h-3 w-3" />规则
            </Button>
            <Button
              size="sm"
              variant={mode === 'llm' ? 'default' : 'ghost'}
              className="h-6 text-[10px] gap-1 px-2"
              onClick={() => setMode('llm')}
            >
              <Brain className="h-3 w-3" />LLM
            </Button>
          </div>
          <Button size="sm" className="h-7 text-xs gap-1" disabled={loading} onClick={() => run()}>
            <Play className="h-3 w-3" />{loading ? '运行中...' : '运行'}
          </Button>
          {lastSeed && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => run(lastSeed)}>
              <RotateCcw className="h-3 w-3" />复现 seed={lastSeed}
            </Button>
          )}
        </div>
        {result && (
          <div className="grid grid-cols-4 gap-2 text-xs">
            {result.config ? (
              <>
                <div className="bg-muted/50 rounded p-2">
                  <div className="text-muted-foreground">场景</div>
                  <div className="font-mono">{(result.config as any).scenario}</div>
                </div>
                <div className="bg-muted/50 rounded p-2">
                  <div className="text-muted-foreground">轮次</div>
                  <div className="font-mono">{(result.config as any).rounds}</div>
                </div>
                <div className="bg-muted/50 rounded p-2">
                  <div className="text-muted-foreground">总延误</div>
                  <div className="font-mono text-red-500">{(result as any).totalDelays ?? '-'}</div>
                </div>
                <div className="bg-muted/50 rounded p-2">
                  <div className="text-muted-foreground">断货事件</div>
                  <div className="font-mono text-orange-500">{(result as any).stockoutEvents ?? '-'}</div>
                </div>
              </>
            ) : (
              <div className="col-span-4 text-muted-foreground">运行沙箱以查看结果</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
