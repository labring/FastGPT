/**
 * Skill 包空白工作区构建工具。
 */

import { buffer } from 'node:stream/consumers';
import { createTarZstStream } from '../../../../common/file/tarZst';
import { DEFAULT_GITIGNORE_CONTENT } from './constants';

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
