/**
 * Cost Service — public entry point (thin barrel).
 *
 * 实现已拆分到 ./cost/ 子目录：
 *   - types.ts        类型定义
 *   - calculations.ts 成本计算逻辑
 *   - queries.ts      查询类方法 + FX 缓存
 *
 * 此文件仅做 re-export，保持 `@/lib/services/cost.service` 公共 import 路径不变。
 */

export * from './cost';
