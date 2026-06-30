import JSZip from 'jszip';
import type { RuntimeSkillMetadataType } from '@fastgpt/global/core/ai/skill/type';
import { parseSkillMarkdown } from '../utils';
import { validateZipSafety } from './zipBuilder';

export type ExtractRuntimeSkillsFromPackageOptions = {
  allowEmpty?: boolean;
};

/**
 * 从 Skill 包中解析运行态子 Skill 元数据。
 *
 * 标准 workspace 读取 `skills/<skillDir>/SKILL.md`；历史单 skill 包允许从根目录或
 * 一级目录 `SKILL.md` 兜底解析，并把 path 规范化为运行态可识别的
 * `skills/<name>/SKILL.md`。初始空白 workspace 可通过 `allowEmpty` 跳过空包校验。
 */
export async function extractRuntimeSkillsFromPackage(
  zipBuffer: Buffer,
  options: ExtractRuntimeSkillsFromPackageOptions = {}
): Promise<RuntimeSkillMetadataType[]> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const safety = validateZipSafety(zip);
  if (!safety.valid) {
    throw new Error(safety.error || 'Invalid skill package');
  }

  const allSkillMdEntries = Object.entries(zip.files)
    .filter(([, file]) => !file.dir)
    .map(([path, file]) => ({
      path: normalizeRuntimeSkillPath(path),
      file
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const workspaceEntries = allSkillMdEntries.filter((entry) =>
    isWorkspaceRuntimeSkillMdPath(entry.path)
  );
  const skillMdEntries =
    workspaceEntries.length > 0
      ? workspaceEntries
      : allSkillMdEntries.filter((entry) => isLegacySkillMdPath(entry.path));

  if (skillMdEntries.length === 0) {
    if (options.allowEmpty) return [];
    throw new Error('Skill package must contain at least one skills/<name>/SKILL.md');
  }

  const nameSet = new Set<string>();
  const runtimeSkills: RuntimeSkillMetadataType[] = [];

  for (const entry of skillMdEntries) {
    const content = await entry.file.async('string');
    const { frontmatter, error } = parseSkillMarkdown(content);
    if (error) {
      throw new Error(`${entry.path}: ${error}`);
    }

    const name = typeof frontmatter.name === 'string' ? frontmatter.name.trim() : '';
    if (!name) {
      throw new Error(`${entry.path}: frontmatter name is required`);
    }

    if (nameSet.has(name)) {
      throw new Error(`Duplicate runtime skill name: ${name}`);
    }
    nameSet.add(name);

    runtimeSkills.push({
      name,
      description:
        typeof frontmatter.description === 'string' ? frontmatter.description.trim() : '',
      path: getRuntimeSkillMetadataPath(entry.path, name)
    });
  }

  return runtimeSkills;
}

function normalizeRuntimeSkillPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function isWorkspaceRuntimeSkillMdPath(path: string): boolean {
  return /^skills\/[^/]+\/SKILL\.md$/i.test(path);
}

function isLegacySkillMdPath(path: string): boolean {
  return /^SKILL\.md$/i.test(path) || /^[^/]+\/SKILL\.md$/i.test(path);
}

function getRuntimeSkillMetadataPath(path: string, name: string): string {
  return isWorkspaceRuntimeSkillMdPath(path) ? path : `skills/${name}/SKILL.md`;
}
