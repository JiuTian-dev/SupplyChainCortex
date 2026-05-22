/**
 * Tests for Agent Skill Loader.
 *
 * Verifies:
 * - listAvailableSkills() returns all 8 supply chain skills
 * - matchSkills() returns correct skills for Chinese triggers
 * - matchSkills() returns correct skills for English triggers
 * - matchSkills() returns empty for irrelevant queries
 * - loadSkillContent() loads content by meta
 */

import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';

// Dynamically import the module (it uses fs which needs actual filesystem)
const SKILLS_DIR = path.join(process.cwd(), 'skills', 'supply-chain');

describe('Agent Skill Loader', () => {
  let listAvailableSkills: () => any[];
  let matchSkills: (query: string) => any[];
  let loadSkillContent: (meta: any) => string | null;

  beforeAll(async () => {
    const mod = await import('./skill-loader');
    listAvailableSkills = mod.listAvailableSkills;
    matchSkills = mod.matchSkills;
    loadSkillContent = mod.loadSkillContent;
  });

  describe('listAvailableSkills()', () => {
    it('returns 8 supply chain skills', () => {
      const skills = listAvailableSkills();
      expect(skills).toHaveLength(8);
    });

    it('each skill has name, description, filePath, and triggers', () => {
      const skills = listAvailableSkills();
      for (const skill of skills) {
        expect(skill.name).toBeTruthy();
        expect(skill.description).toBeTruthy();
        expect(skill.filePath).toBeTruthy();
        expect(Array.isArray(skill.triggers)).toBe(true);
        expect(skill.triggers.length).toBeGreaterThan(0);
      }
    });

    it('each skill file exists on disk', () => {
      const skills = listAvailableSkills();
      for (const skill of skills) {
        expect(fs.existsSync(skill.filePath)).toBe(true);
      }
    });

    it('lists expected skill names', () => {
      const skills = listAvailableSkills();
      const names = skills.map(s => s.name).sort();
      expect(names).toEqual([
        'compliance-audit',
        'cost-optimization',
        'full-health-report',
        'inventory-health-check',
        'logistics-port-monitor',
        'procurement-planning',
        'supplier-risk-assessment',
        'tariff-trade-war-sim',
      ]);
    });
  });

  describe('matchSkills()', () => {
    it('matches "库存健康检查" to inventory-health-check', () => {
      const matched = matchSkills('我想做库存健康检查');
      const names = matched.map(s => s.name);
      expect(names).toContain('inventory-health-check');
    });

    it('matches "缺货风险" to inventory-health-check', () => {
      const matched = matchSkills('分析一下缺货风险');
      const names = matched.map(s => s.name);
      expect(names).toContain('inventory-health-check');
    });

    it('matches "降低成本" to cost-optimization', () => {
      const matched = matchSkills('有什么降低成本的方案');
      const names = matched.map(s => s.name);
      expect(names).toContain('cost-optimization');
    });

    it('matches "supplier risk" to supplier-risk-assessment', () => {
      const matched = matchSkills('supplier risk assessment for our top vendors');
      const names = matched.map(s => s.name);
      expect(names).toContain('supplier-risk-assessment');
    });

    it('matches "trade war impact" to tariff-trade-war-sim', () => {
      const matched = matchSkills('trade war impact on our supply chain');
      const names = matched.map(s => s.name);
      expect(names).toContain('tariff-trade-war-sim');
    });

    it('matches "物流状态" to logistics-port-monitor', () => {
      const matched = matchSkills('查看物流状态');
      const names = matched.map(s => s.name);
      expect(names).toContain('logistics-port-monitor');
    });

    it('matches "全健康报告" to full-health-report', () => {
      const matched = matchSkills('生成供应链全健康报告');
      const names = matched.map(s => s.name);
      expect(names).toContain('full-health-report');
    });

    it('matches "采购计划" to procurement-planning', () => {
      const matched = matchSkills('帮我做一个采购计划');
      const names = matched.map(s => s.name);
      expect(names).toContain('procurement-planning');
    });

    it('matches "CE认证" to compliance-audit', () => {
      const matched = matchSkills('检查CE认证状态');
      const names = matched.map(s => s.name);
      expect(names).toContain('compliance-audit');
    });

    it('returns empty array for irrelevant query', () => {
      const matched = matchSkills('今天的天气怎么样');
      expect(matched).toHaveLength(0);
    });

    it('returns empty array for random English text', () => {
      const matched = matchSkills('hello world this is a test with no supply chain context');
      expect(matched).toHaveLength(0);
    });

    it('can match multiple skills for broad queries', () => {
      // "库存" might match inventory-health-check and procurement-planning
      const matched = matchSkills('库存情况怎么样');
      const names = matched.map(s => s.name);
      expect(names.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('loadSkillContent()', () => {
    it('loads content from a valid skill meta', () => {
      const skills = listAvailableSkills();
      const skill = skills.find(s => s.name === 'inventory-health-check');
      expect(skill).toBeTruthy();

      const content = loadSkillContent(skill!);
      expect(content).toBeTruthy();
      expect(content).toContain('# Skill: 库存健康检查');
      expect(content).toContain('query_inventory');
      expect(content).toContain('classify_abc_xyz');
    });

    it('returns null for non-existent file', () => {
      const result = loadSkillContent({
        name: 'non-existent',
        description: '',
        filePath: '/tmp/non-existent/SKILL.md',
        triggers: [],
      });
      expect(result).toBeNull();
    });
  });
});
