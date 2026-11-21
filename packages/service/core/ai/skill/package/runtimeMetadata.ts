import JSZip from 'jszip';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { RuntimeSkillMetadataType } from '@fastgpt/global/core/ai/skill/type';
import { getLogger, LogCategories } from '../../../../common/logger';
import {
  extractSkillMetadataFromMarkdown,
  findSkillMdEntries,
  normalizeSkillScanEntryPath
} from '../utils';
import { validateZipSafety } from './zipBuilder';

const logger = getLogger(LogCategories.MODULE.AI.AGENT);

export type ExtractRuntimeSkillsFromPackageOptions = {
  allowEmpty?: boolean;
};

/**
 * 从 Skill ZIP 包中解析运行态子 Skill 元数据。
 *
 * 扫描与解析口径与运行态 `getAgentSkillInfos` 保持一致：
 * - 递归扫描任意深度的 `SKILL.md` 文件（大小写不敏感、跳过 `node_modules/.venv/venv`）；
 * - `path` 保留包内真实相对路径；
 * - 解析失败或缺少有效 `name` 的 `SKILL.md`（例如文档示例或草稿）跳过并记警告，不阻断发布；
 * - 不限制子 Skill 间 `name` 重复（运行态向模型同时注入 `name`、`description` 和唯一文件路径）；
 * - 若包内所有 `SKILL.md` 均无效（最终有效数为 0），非 `allowEmpty` 场景下抛可国际化的业务错误码，
 *   并在日志与 `cause` 中保留具体解析原因，避免发布出运行态不可用的空壳版本；
 *   初始空白 workspace 可通过 `allowEmpty` 允许空结果。
 */
export async function extractRuntimeSkillsFromPackage(
  zipBuffer: Buffer,
  options: ExtractRuntimeSkillsFromPackageOptions = {}
): Promise<RuntimeSkillMetadataType[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch (error) {
    throw new UserError(SkillErrEnum.invalidSkillPackage, undefined, { cause: error });
  }

  const safety = validateZipSafety(zip);
  if (!safety.valid) {
    throw new UserError(safety.errorCode ?? SkillErrEnum.invalidSkillPackage, undefined, {
      cause: new Error(safety.error)
    });
  }

  const fileByNormalizedPath = new Map<string, JSZip.JSZipObject>();
  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    const normalizedPath = normalizeSkillScanEntryPath(path);
    if (!fileByNormalizedPath.has(normalizedPath)) {
      fileByNormalizedPath.set(normalizedPath, file);
    }
  }

  const skillMdPaths = findSkillMdEntries(
    Object.entries(zip.files).map(([path, file]) => ({ path, isDir: file.dir }))
  );

  if (skillMdPaths.length === 0) {
    if (options.allowEmpty) return [];
    throw new UserError(SkillErrEnum.missingSkillMd);
  }

  const runtimeSkills: RuntimeSkillMetadataType[] = [];
  const invalidReasons: string[] = [];

  for (const path of skillMdPaths) {
    const file = fileByNormalizedPath.get(path);
    if (!file) continue;

    const content = await file.async('string');
    const parsed = extractSkillMetadataFromMarkdown(content);

    if (!parsed.valid) {
      invalidReasons.push(`${path}: ${parsed.error}`);
      logger.warn('[Agent Skills] Skip invalid SKILL.md while extracting runtime metadata', {
        path,
        error: parsed.error
      });
      continue;
    }

    runtimeSkills.push({
      name: parsed.name,
      description: parsed.description,
      path
    });
  }

  if (runtimeSkills.length === 0) {
    if (options.allowEmpty) return [];
    throw new UserError(SkillErrEnum.noValidSkillMd, undefined, {
      cause: new Error(invalidReasons.join('; '))
    });
  }

  return runtimeSkills;
}
