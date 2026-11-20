import type { RuntimeSkillMetadataType } from '@fastgpt/global/core/ai/skill/type';
import { parseSkillMarkdown } from '../utils';

type ExtractRuntimeSkillsFromPackageOptions = {
  allowEmpty?: boolean;
};

export type SkillMdFileInput = {
  path: string;
  content: string;
};

export const MAX_SKILL_MD_ENTRY_BYTES = 2 * 1024 * 1024;

function isWorkspaceRuntimeSkillMdPath(path: string): boolean {
  return /^skills\/[^/]+\/SKILL\.md$/i.test(path);
}

function isLegacySkillMdPath(path: string): boolean {
  return /^SKILL\.md$/i.test(path) || /^[^/]+\/SKILL\.md$/i.test(path);
}

/** 判断（已由归档解析器规范化的）条目路径是否属于可参与运行时子 Skill 元数据提取的 `SKILL.md`。 */
export function isRuntimeSkillMdPath(entryPath: string): boolean {
  return isWorkspaceRuntimeSkillMdPath(entryPath) || isLegacySkillMdPath(entryPath);
}

function getRuntimeSkillMetadataPath(path: string, name: string): string {
  return isWorkspaceRuntimeSkillMdPath(path) ? path : `skills/${name}/SKILL.md`;
}

/**
 * 从已提取的 `SKILL.md` 文件集合解析运行态子 Skill 元数据（与底层打包格式 `.tar.zst`/`.zip` 解耦）。
 *
 * 优先匹配标准 `skills/<skillDir>/SKILL.md`；未命中时允许根目录或一级目录 `SKILL.md` 兜底，
 * 并统一规范化为 `skills/<name>/SKILL.md`。初始空白工作区可通过 `allowEmpty` 跳过空校验。
 */
export function extractRuntimeSkillsFromSkillMdFiles(
  files: SkillMdFileInput[],
  options: ExtractRuntimeSkillsFromPackageOptions = {}
): RuntimeSkillMetadataType[] {
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  const workspaceEntries = sortedFiles.filter((entry) => isWorkspaceRuntimeSkillMdPath(entry.path));
  const skillMdEntries =
    workspaceEntries.length > 0
      ? workspaceEntries
      : sortedFiles.filter((entry) => isLegacySkillMdPath(entry.path));

  if (skillMdEntries.length === 0) {
    if (options.allowEmpty) return [];
    throw new Error('Skill package must contain at least one skills/<name>/SKILL.md');
  }

  const nameSet = new Set<string>();
  const runtimeSkills: RuntimeSkillMetadataType[] = [];

  for (const entry of skillMdEntries) {
    const { frontmatter, error } = parseSkillMarkdown(entry.content);
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
