'use client';

import { useState } from 'react';
import { Play, RotateCcw, Hash } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const SCENARIOS = ['baseline', 'trade_war', 'typhoon_season', 'perfect_storm'] as const;

export function SandboxReplay() {
  const [scenario, setScenario] = useState<string>('perfect_storm');
  const [rounds, setRounds] = useState(50);
  const [seed, setSeed] = useState('42');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastSeed, setLastSeed] = useState('');

  const run = async (replaySeed?: string) => {
    setLoading(true);
    const s = replaySeed || seed;
    setLastSeed(s);
    try {
      const res = await fetch(`/api/sandbox?scenario=${scenario}&rounds=${rounds}&seed=${s}`);
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
              {SCENARIOS.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" value={rounds} onChange={e => setRounds(Number(e.target.value))} className="h-7 text-xs w-16" min={10} max={200} />
          <span className="text-xs text-muted-foreground">轮</span>
          <Input value={seed} onChange={e => setSeed(e.target.value)} className="h-7 text-xs w-20 font-mono" placeholder="seed" />
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
