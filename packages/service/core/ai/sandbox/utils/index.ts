/**
 * 沙盒共用工具：提供跨层复用的纯函数。
 *
 * 只放路径、hash、文件名清洗等无副作用工具，不访问数据库、provider 或业务状态。
 */
import { createHash } from 'crypto';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

type HashContent = string | Buffer | Uint8Array;

/** 去掉 sandbox 路径右侧斜杠，根路径保持可继续拼接的空前缀。 */
export const trimSandboxPathRight = (value: string) =>
  value === '/' ? '' : value.replace(/\/+$/, '');

/** 用 sandbox 语义拼接路径，避免不同 provider 工作目录末尾斜杠导致双斜杠。 */
export const joinSandboxPath = (basePath: string, path: string) =>
  `${trimSandboxPathRight(basePath)}/${path}`;

/** 将 chatId 转成稳定的单个目录名；常规 NanoID 保持原值，异常输入使用 URL 编码。 */
export const getSandboxSessionPathSegment = (chatId: string) => {
  if (!chatId) {
    throw new Error('chatId is required for App sandbox session path');
  }

  const encoded = encodeURIComponent(chatId);
  if (encoded !== '.' && encoded !== '..' && Buffer.byteLength(encoded) <= 200) {
    return encoded;
  }

  return `chat-${createHash('sha256').update(chatId).digest('hex').slice(0, 40)}`;
};

export type SandboxRuntimePaths = {
  workspaceRoot: string;
  runtimeSkillsRoot: string;
  sessionWorkDirectory: string;
};

type ResolveSandboxRuntimePathOptions = {
  allowAbsolutePath?: boolean;
};

/** 根据 provider 工作目录和 Chat source 构造本轮 Sandbox 运行时路径。 */
export const getSandboxRuntimePaths = ({
  sourceType,
  workDirectory,
  chatId
}: {
  sourceType: ChatSourceTypeEnum;
  workDirectory: string;
  chatId?: string;
}): SandboxRuntimePaths => {
  const workspaceRoot = trimSandboxPathRight(workDirectory);
  const runtimeSkillsRoot = joinSandboxPath(workspaceRoot, 'projects');

  if (sourceType === ChatSourceTypeEnum.app) {
    return {
      workspaceRoot,
      runtimeSkillsRoot,
      sessionWorkDirectory: joinSandboxPath(
        joinSandboxPath(workspaceRoot, 'sessions'),
        getSandboxSessionPathSegment(chatId ?? '')
      )
    };
  }

  return {
    workspaceRoot,
    runtimeSkillsRoot,
    sessionWorkDirectory: workspaceRoot
  };
};

/**
 * 将运行时文件路径解析到当前会话目录，并限制绝对路径只能落在 workspace 内。
 *
 * 相对路径始终以 sessionWorkDirectory 为基准；绝对路径用于编辑器从会话目录
 * 向上浏览 workspace，不把目录层级当作安全隔离边界。
 */
export const resolveSandboxRuntimePath = (
  path: string | undefined,
  runtimePaths: Pick<SandboxRuntimePaths, 'workspaceRoot' | 'sessionWorkDirectory'>,
  options: ResolveSandboxRuntimePathOptions = {}
) => {
  const rawPath = path || '.';
  const workspaceRoot = trimSandboxPathRight(runtimePaths.workspaceRoot);
  const sessionWorkDirectory = trimSandboxPathRight(runtimePaths.sessionWorkDirectory);

  if (rawPath === '.' || rawPath === './' || rawPath === '') {
    return sessionWorkDirectory;
  }

  if (rawPath.split('/').includes('..')) {
    throw new Error('Path traversal detected');
  }

  if (rawPath.startsWith('/')) {
    if (!options.allowAbsolutePath) {
      throw new Error('Absolute sandbox paths are not allowed');
    }
    if (rawPath !== workspaceRoot && !rawPath.startsWith(`${workspaceRoot}/`)) {
      throw new Error('Sandbox path is outside workspace');
    }
    return rawPath;
  }

  return joinSandboxPath(sessionWorkDirectory, rawPath.replace(/^\.\//, ''));
};

/** 构建 runtime 状态和 manifest 统一使用的内容 hash。 */
export const buildRuntimeHash = (content: HashContent): string =>
  `sha256:${createHash('sha256').update(content).digest('hex')}`;

/**
 * 将外部文件名收敛为可写入 sandbox user_files 的单个 path segment。
 * URL query、API body 和模型上下文都可能携带文件名，因此调用方不能信任原始 name。
 */
export const getSafeSandboxInputFilename = (
  filename: string,
  index: number,
  usedNames: Map<string, number>
) => {
  const fallbackName = `file-${index}`;
  const normalized = filename.replace(/\\/g, '/').split('/').pop()?.trim() || fallbackName;
  const withoutControlChars = normalized.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  const baseName =
    withoutControlChars && withoutControlChars !== '.' && withoutControlChars !== '..'
      ? withoutControlChars
      : fallbackName;
  const firstDotIndex = baseName.indexOf('.');
  const stem = firstDotIndex > 0 ? baseName.slice(0, firstDotIndex) : baseName;
  const extension = firstDotIndex > 0 ? baseName.slice(firstDotIndex) : '';
  const count = usedNames.get(baseName) || 0;
  usedNames.set(baseName, count + 1);

  return count === 0 ? baseName : `${stem}-${count}${extension}`;
};
