import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import type { Skill } from './types';

export interface FrontmatterResult {
  name: string;
  description: string;
  category?: string;
}

export function parseFrontmatter(content: string): FrontmatterResult | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const yaml = match[1];
  const name = extractField(yaml, 'name');
  const description = extractField(yaml, 'description');

  if (!name || !description) return null;

  const category = extractField(yaml, 'category');
  const result: FrontmatterResult = { name, description };
  if (category) result.category = category;
  return result;
}

export function scanDirectory(dirPath: string, sourceLabel: string): Skill[] {
  const skills: Skill[] = [];

  let entries: import('fs').Dirent[];
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const defaultCategory = sourceLabel.charAt(0).toUpperCase() + sourceLabel.slice(1);

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(dirPath, entry.name, 'SKILL.md');
    let content: string;
    try {
      content = readFileSync(skillFile, 'utf-8');
    } catch {
      continue;
    }

    const frontmatter = parseFrontmatter(content);
    if (!frontmatter) continue;

    skills.push({
      name: frontmatter.name,
      description: frontmatter.description,
      category: frontmatter.category ?? defaultCategory,
      source: sourceLabel,
      slashCommand: `/${frontmatter.name}`,
      filePath: skillFile,
      kind: 'skill',
    });
  }

  return skills;
}

export function scanAgentsDirectory(dirPath: string, sourceLabel: string): Skill[] {
  const agents: Skill[] = [];

  let entries: import('fs').Dirent[];
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const defaultCategory = sourceLabel.charAt(0).toUpperCase() + sourceLabel.slice(1);

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const filePath = join(dirPath, entry.name);
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const frontmatter = parseFrontmatter(content);
    if (!frontmatter) continue;

    agents.push({
      name: frontmatter.name,
      description: frontmatter.description,
      category: frontmatter.category ?? defaultCategory,
      source: sourceLabel,
      slashCommand: `/${frontmatter.name}`,
      filePath,
      kind: 'agent',
    });
  }

  return agents;
}

export function deriveSourceLabel(dirPath: string): string {
  const normalized = dirPath.replace(/\\/g, '/');

  // Workspace skills: .claude/skills
  if (normalized.toLowerCase().includes('.claude/skills')) return 'Workspace';

  // Plugin cache: .../<plugin-name>/<version>/skills|agents
  // Extract the plugin name (2 levels up from the skills/agents dir)
  const base = basename(normalized);
  if (base === 'skills' || base === 'agents') {
    const pluginName = basename(join(normalized, '..', '..'));
    if (pluginName && pluginName !== '.' && pluginName !== '..') {
      return formatLabel(pluginName);
    }
  }

  return formatLabel(basename(normalized));
}

function formatLabel(name: string): string {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractField(yaml: string, field: string): string | undefined {
  const regex = new RegExp(`^${field}:\\s*(.+)$`, 'm');
  const match = yaml.match(regex);
  if (!match) return undefined;
  let value = match[1].trim();
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value;
}
