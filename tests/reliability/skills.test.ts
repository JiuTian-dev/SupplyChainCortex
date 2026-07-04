/**
 * Skill Registry 单元测试。
 */
import { describe, it, expect } from 'vitest';
import {
  getSkillSummaries,
  expandSkill,
  getAllSkills,
  getAllSkillTools,
  routeToSkill,
  routeToSkills,
  getToolsForSkills,
  getMergedSystemPrompt,
  getSkillStats,
  type SkillId,
} from '@/lib/mcp/skills';

describe('Skill Registry', () => {
  describe('getSkillSummaries', () => {
    it('应返回 11 个 Skill 摘要', () => {
      const summaries = getSkillSummaries();
      expect(summaries).toHaveLength(11);
    });

    it('每个摘要应包含必要字段', () => {
      const summaries = getSkillSummaries();
      for (const s of summaries) {
        expect(s.id).toBeTruthy();
        expect(s.name).toBeTruthy();
        expect(s.description).toBeTruthy();
        expect(s.keywords).toBeInstanceOf(Array);
        expect(s.keywords.length).toBeGreaterThan(0);
        expect(s.toolCount).toBeGreaterThan(0);
        expect(s.icon).toBeTruthy();
      }
    });

    it('摘要不应包含工具详情（渐进式披露）', () => {
      const summaries = getSkillSummaries();
      for (const s of summaries) {
        expect(s).not.toHaveProperty('tools');
        expect(s).not.toHaveProperty('systemPrompt');
      }
    });
  });

  describe('expandSkill', () => {
    it('应返回完整 Skill（含工具和 system prompt）', () => {
      const skill = expandSkill('inventory-mgmt');
      expect(skill).toBeDefined();
      expect(skill!.tools).toBeInstanceOf(Array);
      expect(skill!.tools.length).toBeGreaterThan(0);
      expect(skill!.systemPrompt).toBeTruthy();
    });

    it('展开后的工具数应与摘要一致', () => {
      const summaries = getSkillSummaries();
      for (const s of summaries) {
        const skill = expandSkill(s.id);
        expect(skill!.tools.length).toBe(s.toolCount);
      }
    });

    it('不存在的 Skill ID 应返回 undefined', () => {
      const skill = expandSkill('nonexistent' as SkillId);
      expect(skill).toBeUndefined();
    });
  });

  describe('getAllSkillTools', () => {
    it('应返回所有 82 个工具（去重）', () => {
      const tools = getAllSkillTools();
      expect(tools.length).toBe(82);

      // 验证无重复
      const names = tools.map(t => t.name);
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    });
  });

  describe('routeToSkill', () => {
    it('库存查询应路由到 inventory-mgmt', () => {
      const skill = routeToSkill('查询当前库存水平');
      expect(skill.id).toBe('inventory-mgmt');
    });

    it('EOQ 计算应路由到 inventory-mgmt', () => {
      const skill = routeToSkill('计算经济订货批量 EOQ');
      expect(skill.id).toBe('inventory-mgmt');
    });

    it('级联风险应路由到 risk-compliance', () => {
      const skill = routeToSkill('评估供应链级联风险');
      expect(skill.id).toBe('risk-compliance');
    });

    it('供应商网络图应路由到 supplier-mgmt', () => {
      const skill = routeToSkill('查询供应商网络图谱');
      expect(skill.id).toBe('supplier-mgmt');
    });

    it('汇率查询应路由到 market-intel', () => {
      const skill = routeToSkill('查询当前人民币汇率');
      expect(skill.id).toBe('market-intel');
    });

    it('无匹配时应回退到 analytics', () => {
      const skill = routeToSkill('xyzabc123');
      expect(skill.id).toBe('analytics');
    });
  });

  describe('routeToSkills', () => {
    it('应返回多个匹配 Skill（top N）', () => {
      const skills = routeToSkills('查询供应商库存和风险', 3);
      expect(skills.length).toBeLessThanOrEqual(3);
      expect(skills.length).toBeGreaterThan(0);
    });

    it('无匹配时应回退到 analytics', () => {
      const skills = routeToSkills('xyzabc123', 3);
      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe('analytics');
    });
  });

  describe('getToolsForSkills', () => {
    it('应返回多个 Skill 的合并工具集（去重）', () => {
      const tools = getToolsForSkills(['inventory-mgmt', 'cost-finance']);
      expect(tools.length).toBeGreaterThan(0);

      const names = tools.map(t => t.name);
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    });
  });

  describe('getMergedSystemPrompt', () => {
    it('应合并多个 Skill 的 system prompt', () => {
      const prompt = getMergedSystemPrompt(['inventory-mgmt', 'cost-finance']);
      expect(prompt).toContain('库存管理');
      expect(prompt).toContain('成本与财务');
      expect(prompt).toContain('---');
    });
  });

  describe('getSkillStats', () => {
    it('应返回正确的统计信息', () => {
      const stats = getSkillStats();
      expect(stats.totalSkills).toBe(11);
      expect(stats.totalTools).toBe(82);
      expect(stats.bySkill).toHaveLength(11);
    });
  });

  describe('工具覆盖完整性', () => {
    it('所有 Skill 的工具总数应覆盖全部 82 工具', () => {
      const allSkills = getAllSkills();
      const allNames = new Set<string>();
      for (const skill of allSkills) {
        for (const tool of skill.tools) {
          allNames.add(tool.name);
        }
      }
      expect(allNames.size).toBe(82);
    });

    it('每个工具应属于至少一个 Skill', () => {
      const allTools = getAllSkillTools();
      const allSkills = getAllSkills();
      const skillToolNames = new Set<string>();
      for (const skill of allSkills) {
        for (const tool of skill.tools) {
          skillToolNames.add(tool.name);
        }
      }
      for (const tool of allTools) {
        expect(skillToolNames.has(tool.name)).toBe(true);
      }
    });
  });
});
