import { describe, it, expect } from 'vitest';
import { parseFrontmatter, scanDirectory, deriveSourceLabel } from '../src/skillScanner';
import { readFileSync } from 'fs';
import { join } from 'path';

const fixturesDir = join(__dirname, 'fixtures');

describe('parseFrontmatter', () => {
  it('parses name and description from basic frontmatter', () => {
    const content = readFileSync(join(fixturesDir, 'workspace-skill', 'SKILL.md'), 'utf-8');
    const result = parseFrontmatter(content);
    expect(result).toEqual({
      name: 'test-skill',
      description: 'A test skill for unit testing',
    });
  });

  it('parses quoted values', () => {
    const content = readFileSync(join(fixturesDir, 'plugin-skill', 'SKILL.md'), 'utf-8');
    const result = parseFrontmatter(content);
    expect(result).toEqual({
      name: 'superpowers:brainstorming',
      description: 'Explores user intent before implementation',
    });
  });

  it('parses category when present', () => {
    const content = readFileSync(join(fixturesDir, 'categorized-skill', 'SKILL.md'), 'utf-8');
    const result = parseFrontmatter(content);
    expect(result).toEqual({
      name: 'my-custom-skill',
      description: 'A skill with explicit category',
      category: 'Custom Category',
    });
  });

  it('returns null for files without frontmatter', () => {
    const content = readFileSync(join(fixturesDir, 'no-frontmatter', 'SKILL.md'), 'utf-8');
    const result = parseFrontmatter(content);
    expect(result).toBeNull();
  });

  it('ignores extra metadata fields', () => {
    const content = readFileSync(join(fixturesDir, 'marketing-skill', 'SKILL.md'), 'utf-8');
    const result = parseFrontmatter(content);
    expect(result).toEqual({
      name: 'marketing-skills:seo-audit',
      description: 'Audit SEO issues on a site',
    });
  });
});

describe('scanDirectory', () => {
  it('finds skills in a directory of skill folders', () => {
    const skills = scanDirectory(fixturesDir, 'test');
    const names = skills.map(s => s.name);
    expect(names).toContain('test-skill');
    expect(names).toContain('superpowers:brainstorming');
    expect(names).toContain('my-custom-skill');
    expect(names).toContain('marketing-skills:seo-audit');
    // no-frontmatter should be excluded
    expect(names).not.toContain(expect.stringContaining('frontmatter'));
  });

  it('sets slashCommand with / prefix', () => {
    const skills = scanDirectory(fixturesDir, 'test');
    const skill = skills.find(s => s.name === 'test-skill');
    expect(skill?.slashCommand).toBe('/test-skill');
  });

  it('uses explicit category from frontmatter', () => {
    const skills = scanDirectory(fixturesDir, 'test');
    const skill = skills.find(s => s.name === 'my-custom-skill');
    expect(skill?.category).toBe('Custom Category');
  });

  it('derives category from source when not in frontmatter', () => {
    const skills = scanDirectory(fixturesDir, 'test');
    const skill = skills.find(s => s.name === 'test-skill');
    expect(skill?.category).toBe('Test');
  });

  it('sets source label on all skills', () => {
    const skills = scanDirectory(fixturesDir, 'test');
    for (const skill of skills) {
      expect(skill.source).toBe('test');
    }
  });

  it('sets filePath to absolute path', () => {
    const skills = scanDirectory(fixturesDir, 'test');
    const skill = skills.find(s => s.name === 'test-skill');
    expect(skill?.filePath).toBe(join(fixturesDir, 'workspace-skill', 'SKILL.md'));
  });

  it('returns empty array for nonexistent directory', () => {
    const skills = scanDirectory('/nonexistent/path', 'none');
    expect(skills).toEqual([]);
  });
});

describe('deriveSourceLabel', () => {
  it('returns "Workspace" for .claude/skills path', () => {
    expect(deriveSourceLabel('/project/.claude/skills')).toBe('Workspace');
  });

  it('returns "Superpowers" for superpowers plugin path', () => {
    expect(deriveSourceLabel('/home/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills')).toBe('Superpowers');
  });

  it('returns "Marketing" for marketingskills plugin path', () => {
    expect(deriveSourceLabel('/home/.claude/plugins/cache/marketingskills/marketing-skills/abc123/skills')).toBe('Marketing Skills');
  });

  it('returns capitalized basename for unknown paths', () => {
    expect(deriveSourceLabel('/some/custom/my-tools')).toBe('My Tools');
  });
});
