/**
 * Agent Skill Loader — progressive disclosure pattern.
 *
 * Scans available skills, matches trigger phrases against user query,
 * loads matching skill content into the Agent's context.
 *
 * Only ~100 tokens of metadata per skill at session start.
 * Full content loads only when triggered.
 */

import fs from 'fs';
import path from 'path';

interface SkillMeta {
  name: string;
  description: string;
  filePath: string;
  triggers: string[];
}

interface LoadedSkill {
  meta: SkillMeta;
  content: string;
}

const SKILLS_DIR = path.join(process.cwd(), 'skills', 'supply-chain');

function parseSkillFrontmatter(content: string): { name: string; description: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const frontmatter = match[1];
  const name = frontmatter.match(/name:\s*(.+)/)?.[1]?.trim() || '';
  const description = frontmatter.match(/description:\s*(.+)/)?.[1]?.trim() || '';
  return { name, description };
}

function extractTriggers(content: string): string[] {
  const triggerSection = content.match(/## Triggers\n([\s\S]*?)(?=\n## )/);
  if (!triggerSection) return [];
  return triggerSection[1]
    .split('\n')
    .filter(line => line.startsWith('-'))
    .map(line => line.replace(/^-\s*/, '').trim());
}

export function listAvailableSkills(): SkillMeta[] {
  if (!fs.existsSync(SKILLS_DIR)) return [];

  const skills: SkillMeta[] = [];
  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;

    const content = fs.readFileSync(skillFile, 'utf-8');
    const meta = parseSkillFrontmatter(content);
    if (!meta) continue;

    skills.push({
      name: meta.name,
      description: meta.description,
      filePath: skillFile,
      triggers: extractTriggers(content),
    });
  }

  return skills;
}

export function matchSkills(query: string): SkillMeta[] {
  const skills = listAvailableSkills();
  const q = query.toLowerCase();

  return skills.filter(skill => {
    // Check if any trigger phrase matches
    return skill.triggers.some(trigger =>
      q.includes(trigger.toLowerCase())
    );
  });
}

export function loadSkillContent(meta: SkillMeta): string | null {
  if (!fs.existsSync(meta.filePath)) return null;
  return fs.readFileSync(meta.filePath, 'utf-8');
}

/**
 * Get skills context to inject into the FSM plan phase.
 * Returns matching skills' content (not just metadata — content is loaded on trigger).
 */
export function getSkillContext(query: string): string {
  const matched = matchSkills(query);
  if (matched.length === 0) return '';

  const contents = matched.map(skill => {
    const content = loadSkillContent(skill);
    return content ? `\n## 🎯 匹配的技能 SOP: ${skill.name}\n\n${content}` : '';
  }).filter(Boolean);

  return contents.join('\n');
}
