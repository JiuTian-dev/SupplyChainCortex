# Cascade Risk Engine Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐级联风险引擎剩余收口项，使场景契约、因果闭环、决策主链和验证链路一致。

**Architecture:** 以最小改动收口现有实现，不重构引擎主体。优先通过测试锁定 `/api/cascade-risk` 路由契约，再在 `cascade-risk.main.ts` 中补齐审计落库和 passport 数据源，最后执行类型检查与定向测试验证。

**Tech Stack:** Next.js App Router, TypeScript 5, Prisma, Vitest

---

### Task 1: 对齐 API 场景契约与响应裁剪

**Files:**
- Modify: `src/app/api/cascade-risk/route.ts`
- Create: `src/app/api/cascade-risk/route.test.ts`

- [ ] **Step 1: 写路由契约失败测试**

```ts
it('accepts advanced cascade scenarios exposed by the frontend', async () => {
  const request = new NextRequest('http://localhost:3000/api/cascade-risk?scenario=commodity_shock');
  const response = await GET(request);
  expect(response.status).toBe(200);
});

it('keeps seirTimeline when includeCausal=false', async () => {
  const request = new NextRequest('http://localhost:3000/api/cascade-risk?scenario=auto&includeCausal=false');
  const response = await GET(request);
  const json = await response.json();
  expect(json.seirTimeline).toBeDefined();
  expect(json.causalCounterfactuals).toBeUndefined();
});
```

- [ ] **Step 2: 运行路由测试确认失败**

```bash
npx vitest run src/app/api/cascade-risk/route.test.ts
```

Expected: 至少 1 个失败，体现旧白名单或错误裁剪逻辑。

- [ ] **Step 3: 最小实现修复**

```ts
const validScenarios = [
  'weather_disruption',
  'exchange_shock',
  'supplier_failure',
  'port_congestion',
  'tariff_escalation',
  'commodity_shock',
  'cbam_enforcement',
  'competitor_pressure',
  'auto',
];

if (!includeCausal && report) {
  delete (report as any).causalEdges;
  delete (report as any).causalSummary;
  delete (report as any).causalCounterfactuals;
}
```

- [ ] **Step 4: 重跑路由测试**

```bash
npx vitest run src/app/api/cascade-risk/route.test.ts
```

Expected: PASS

### Task 2: 打通 CausalML 审计闭环

**Files:**
- Modify: `src/lib/services/cascade-risk.main.ts`
- Modify: `src/lib/services/cascade-risk.test.ts`

- [ ] **Step 1: 写失败测试，验证审计快照包含因果结果**

```ts
it('persists causal counterfactual snapshot into audit log details', async () => {
  const auditCreate = vi.spyOn(db.auditLog, 'create').mockResolvedValue({} as any);
  await getCascadeRisk({ scenario: 'auto', includeCounterfactuals: true });
  expect(auditCreate).toHaveBeenCalled();
  const payload = auditCreate.mock.calls[0][0] as any;
  expect(payload.data.details.snapshot.causalCounterfactuals).toBeDefined();
});
```

- [ ] **Step 2: 运行定向服务测试确认失败**

```bash
npx vitest run src/lib/services/cascade-risk.test.ts -t "persists causal counterfactual snapshot"
```

Expected: FAIL，快照内缺失 causal 数据。

- [ ] **Step 3: 在审计快照中落库最小必要字段**

```ts
details: {
  scenario,
  snapshot: {
    affectedNodes: affectedNodes.length,
    avgPropagatedRisk: avgRisk,
    totalMonthlyLoss: propagation.reduce((s, p) => s + (p.monetaryImpact || 0), 0),
    topRisks: topAffectedProducts.slice(0, 3).map(...),
    counterfactuals: (report.counterfactuals ?? []).slice(0, 4).map(...),
    causalCounterfactuals: (report.causalCounterfactuals ?? []).slice(0, 4).map(...),
  },
}
```

- [ ] **Step 4: 重跑相关服务测试**

```bash
npx vitest run src/lib/services/cascade-risk.test.ts -t "persists causal counterfactual snapshot"
```

Expected: PASS

### Task 3: 让 passport 主链优先采用新因果结果

**Files:**
- Modify: `src/lib/services/cascade-risk.main.ts`
- Modify: `src/lib/services/cascade-risk.test.ts`

- [ ] **Step 1: 写失败测试，验证 alternatives 优先读 causalCounterfactuals**

```ts
it('builds passport alternatives from causal counterfactuals before legacy ones', async () => {
  const report = await getCascadeRisk({ scenario: 'auto', includeCounterfactuals: true });
  expect(report.passport?.alternatives?.length).toBeGreaterThan(0);
  expect(report.passport?.alternatives?.[0]?.action).toBeTruthy();
});
```

- [ ] **Step 2: 跑相关测试确认当前行为不满足**

```bash
npx vitest run src/lib/services/cascade-risk.test.ts -t "passport alternatives"
```

Expected: FAIL 或断言不足，需要补强。

- [ ] **Step 3: 最小实现切换数据源**

```ts
const primaryAlternatives = report.causalCounterfactuals?.length
  ? report.causalCounterfactuals.map(cf => ({
      action: cf.scenario,
      expectedImpact: `风险降低 ${(cf.estimatedReduction * 100).toFixed(1)}%`,
      confidence: cf.estimatedReduction,
      tradeoffs: cf.isReliable ? [] : ['历史样本有限，结论偏先验'],
    }))
  : (report.counterfactuals ?? []).map(cf => ({
      action: cf.scenario || '替代方案',
      expectedImpact: `风险降低 ${cf.improvement}%`,
      confidence: cf.improvement / 100,
      tradeoffs: [],
    }));
```

- [ ] **Step 4: 重跑相关服务测试**

```bash
npx vitest run src/lib/services/cascade-risk.test.ts -t "passport alternatives"
```

Expected: PASS

### Task 4: 统一验证

**Files:**
- Modify: `task_plan.md`
- Modify: `progress.md`
- Modify: `HANDOVER.md`

- [ ] **Step 1: 运行路由与服务测试**

```bash
npx vitest run src/app/api/cascade-risk/route.test.ts src/lib/services/cascade-risk.test.ts
```

Expected: PASS

- [ ] **Step 2: 运行类型检查**

```bash
npx tsc --noEmit
```

Expected: 无新增 TypeScript 错误；若仍有历史错误，仅记录 pre-existing。

- [ ] **Step 3: 记录结果与交接**

```md
- 更新 `task_plan.md` 阶段状态
- 在 `progress.md` 记录测试命令与结果
- 在 `HANDOVER.md` 写明本轮收口项与剩余风险
```

- [ ] **Step 4: 提交**

```bash
git add src/app/api/cascade-risk/route.ts src/app/api/cascade-risk/route.test.ts src/lib/services/cascade-risk.main.ts src/lib/services/cascade-risk.test.ts task_plan.md findings.md progress.md HANDOVER.md
git commit -m "fix: close out cascade risk engine integration"
```
