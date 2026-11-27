import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { RuntimeSkillMetadataType } from '@fastgpt/global/core/ai/skill/type';
import { getLogger } from '../../../../common/logger/client';
import { LogCategories } from '../../../../common/logger/categories';
import { extractSkillMetadataFromMarkdown, findSkillMdEntries } from '../utils';

const logger = getLogger(LogCategories.MODULE.AI.AGENT);

export type SkillMdFileInput = {
  path: string;
  content: string;
  error?: string;
};

export const MAX_SKILL_MD_ENTRY_BYTES = 2 * 1024 * 1024;

/**
 * 从流式提取的 `SKILL.md` 文件集合中解析运行态子 Skill 元数据。
 *
 * 扫描与解析口径与运行态 `getAgentSkillInfos` 保持一致：
 * - 递归扫描任意深度的 `SKILL.md` 文件（大小写不敏感、跳过 `node_modules/.venv/venv`）；
 * - `path` 保留包内真实相对路径，允许子 Skill 间 `name` 重复；
 * - 解析失败、缺少有效 `name` 或超出元数据上限的 `SKILL.md` 跳过并记警告；全部无效抛 `noValidSkillMd`，零匹配抛 `missingSkillMd`。
 */
export function extractRuntimeSkillsFromSkillMdFiles(
  files: SkillMdFileInput[]
): RuntimeSkillMetadataType[] {
  const skillMdEntries = findSkillMdEntries(
    files.map((entry) => ({
      ...entry,
      isDir: false
    }))
  );

  if (skillMdEntries.length === 0) {
    throw new UserError(SkillErrEnum.missingSkillMd);
  }

  const runtimeSkills: RuntimeSkillMetadataType[] = [];
  const invalidReasons: string[] = [];

  for (const entry of skillMdEntries) {
    if (entry.error) {
      invalidReasons.push(`${entry.path}: ${entry.error}`);
      logger.warn('[Agent Skills] Skip invalid SKILL.md while extracting runtime metadata', {
        path: entry.path,
        error: entry.error
      });
      continue;
    }

    const parsed = extractSkillMetadataFromMarkdown(entry.content);
    if (!parsed.valid) {
      invalidReasons.push(`${entry.path}: ${parsed.error}`);
      logger.warn('[Agent Skills] Skip invalid SKILL.md while extracting runtime metadata', {
        path: entry.path,
        error: parsed.error
      });
      continue;
    }

    runtimeSkills.push({
      name: parsed.name,
      description: parsed.description,
      path: entry.path
    });
  }

  if (runtimeSkills.length === 0) {
    throw new UserError(SkillErrEnum.noValidSkillMd, undefined, {
      cause: new Error(invalidReasons.join('; '))
    });
  }

  return runtimeSkills;
}
