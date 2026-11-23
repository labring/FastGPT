import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

export const CLI_SKILLS_BUNDLE_FILE = 'cli-skills.json';

export type CliSkillBundleItem = {
  name: string;
  description: string;
  markdown: string;
  checksum: string;
};

// 独立可执行文件没有 dist 目录，由 Bun 在编译时内嵌同一份技能列表。
declare const __FASTGPT_CLI_SKILLS__: readonly CliSkillBundleItem[] | undefined;

function unquoteYamlScalar(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * 解析 `SKILL.md` 顶部的 YAML frontmatter，提取并校验 `name` 与 `description`。
 */
export function parseSkillFrontmatter({
  markdown,
  expectedName
}: {
  markdown: string;
  expectedName?: string;
}): { name: string; description: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    throw new Error(
      `Missing YAML frontmatter in skill${expectedName ? ` "${expectedName}"` : ''}.`
    );
  }

  const fields = new Map<string, string>();
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }
    const kvMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!kvMatch) {
      continue;
    }
    const key = kvMatch[1];
    const rest = kvMatch[2].trim();
    if (rest === '|' || rest === '>') {
      const collected: string[] = [];
      for (let j = i + 1; j < lines.length; j += 1) {
        if (/^\s+/.test(lines[j])) {
          collected.push(lines[j].trim());
          i = j;
        } else {
          break;
        }
      }
      fields.set(key, collected.join(rest === '>' ? ' ' : '\n').trim());
    } else {
      fields.set(key, unquoteYamlScalar(rest));
    }
  }

  const name = fields.get('name') ?? '';
  const description = fields.get('description') ?? '';
  if (!name) {
    throw new Error(
      `Missing frontmatter "name" in skill${expectedName ? ` "${expectedName}"` : ''}.`
    );
  }
  if (expectedName !== undefined && name !== expectedName) {
    throw new Error(`Skill frontmatter name "${name}" does not match directory "${expectedName}".`);
  }
  if (!description) {
    throw new Error(`Missing frontmatter "description" in skill "${name}".`);
  }

  return { name, description };
}

/**
 * 读取仓库中的官方内置 Agent Skill（`cli/skills/fastgpt-<name>/SKILL.md`），计算 SHA-256 校验和并按名称排序。
 */
export async function readCliSkillsSource(): Promise<CliSkillBundleItem[]> {
  const directory = new URL('../../../skills/', import.meta.url);
  const entries = await readdir(directory, { withFileTypes: true });
  const skillDirs = entries
    .filter((entry) => entry.isDirectory() && /^fastgpt-[a-z0-9-]+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const items = await Promise.all(
    skillDirs.map(async (dirName): Promise<CliSkillBundleItem> => {
      const markdown = await readFile(new URL(`${dirName}/SKILL.md`, directory), 'utf8');
      const { name, description } = parseSkillFrontmatter({ markdown, expectedName: dirName });
      const checksum = createHash('sha256').update(markdown, 'utf8').digest('hex');
      return {
        name,
        description,
        markdown,
        checksum
      };
    })
  );

  return items.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * 双路同源加载内置 CLI Skills：单文件编译读取内嵌常量，源码运行直读 `cli/skills/`，tsdown/Bun 产物读取同目录 JSON。
 */
export async function loadCliSkills(): Promise<readonly CliSkillBundleItem[]> {
  if (typeof __FASTGPT_CLI_SKILLS__ !== 'undefined') {
    return __FASTGPT_CLI_SKILLS__;
  }
  if (import.meta.url.endsWith('/cli-skill-catalog.ts')) {
    return readCliSkillsSource();
  }
  const json = await readFile(new URL(CLI_SKILLS_BUNDLE_FILE, import.meta.url), 'utf8');
  return JSON.parse(json) as CliSkillBundleItem[];
}
