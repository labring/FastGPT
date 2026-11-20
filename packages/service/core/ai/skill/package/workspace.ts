/**
 * Skill 包空白工作区构建与可部署目录结构校验工具。
 */

import { buffer } from 'node:stream/consumers';
import { createTarZstStream } from '../../../../common/file/tarZst';
import { DEFAULT_GITIGNORE_CONTENT } from './constants';

type DeployableSkillWorkspaceValidationResult = {
  valid: boolean;
  files: string[];
  error?: string;
};

/**
 * 创建新建 Skill 的空白工作区 `.tar.zst` 包。
 *
 * 初始版本只建立工作区外壳（`.gitignore` 与空 `skills/` 目录），不生成任何可执行 Skill。
 */
export async function createBlankSkillWorkspacePackage(): Promise<Buffer> {
  return buffer(
    createTarZstStream([
      {
        path: '.gitignore',
        type: 'file',
        mode: 0o644,
        content: Buffer.from(DEFAULT_GITIGNORE_CONTENT, 'utf8')
      },
      { path: 'skills/', type: 'directory', mode: 0o755 }
    ])
  );
}

/**
 * 校验（已由归档解析器规范化、目录以 `/` 结尾的）路径列表是否满足可部署工作区结构（含 `skills/<dir>/SKILL.md`）。
 */
export function validateDeployableSkillWorkspacePaths(
  files: string[]
): DeployableSkillWorkspaceValidationResult {
  const hasSkillsDirectory = files.some((path) => path.startsWith('skills/'));

  if (!hasSkillsDirectory) {
    return {
      valid: false,
      files,
      error: 'Missing required directory: skills/'
    };
  }

  const firstLevelSkillDirs = new Set<string>();
  const executableSkillDirs = new Set<string>();

  for (const path of files) {
    const firstLevelDirMatch = path.match(/^skills\/([^/]+)\//);
    if (firstLevelDirMatch?.[1]) {
      firstLevelSkillDirs.add(firstLevelDirMatch[1]);
    }

    const skillMdMatch = path.match(/^skills\/([^/]+)\/SKILL\.md$/i);
    if (skillMdMatch?.[1]) {
      executableSkillDirs.add(skillMdMatch[1]);
    }
  }

  if (firstLevelSkillDirs.size === 0) {
    return {
      valid: false,
      files,
      error: 'The skills/ directory must contain at least one first-level skill folder'
    };
  }

  const missingSkillMdDirs = [...firstLevelSkillDirs].filter(
    (dir) => !executableSkillDirs.has(dir)
  );
  if (missingSkillMdDirs.length > 0) {
    return {
      valid: false,
      files,
      error: `Each first-level skill folder under skills/ must contain SKILL.md: ${missingSkillMdDirs.join(', ')}`
    };
  }

  return {
    valid: true,
    files
  };
}
