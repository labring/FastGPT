/**
 * 沙盒共用工具：提供跨层复用的纯函数。
 *
 * 只放路径、hash、文件名清洗等无副作用工具，不访问数据库、provider 或业务状态。
 */
import { createHash } from 'crypto';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { isAppSandboxSourceType } from '@fastgpt/global/common/chat/source';
import { getRunningSandboxId } from './id';

type HashContent = string | Buffer | Uint8Array;

/** 去掉 sandbox 路径右侧斜杠，根路径保持可继续拼接的空前缀。 */
export const trimSandboxPathRight = (value: string) =>
  value === '/' ? '' : value.replace(/\/+$/, '');

/** 用 sandbox 语义拼接一段或多段路径，避免不同 provider 工作目录末尾斜杠导致双斜杠。 */
export const joinSandboxPath = (basePath: string, path: string, ...paths: string[]) =>
  [path, ...paths].reduce(
    (currentPath, nextPath) => `${trimSandboxPathRight(currentPath)}/${nextPath}`,
    basePath
  );

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
  allowOutsideWorkspace?: boolean;
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

  if (isAppSandboxSourceType(sourceType)) {
    return {
      workspaceRoot,
      runtimeSkillsRoot,
      sessionWorkDirectory: joinSandboxPath(
        workspaceRoot,
        'sessions',
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
 * 将运行时文件路径解析到当前会话目录；显式允许绝对路径时默认不限制其 workspace 范围。
 *
 * 相对路径始终以 sessionWorkDirectory 为基准；绝对路径直接按 sandbox 文件系统路径使用。
 */
export const resolveSandboxRuntimePath = (
  path: string | undefined,
  runtimePaths: Pick<SandboxRuntimePaths, 'workspaceRoot' | 'sessionWorkDirectory'>,
  options: ResolveSandboxRuntimePathOptions = {}
) => {
  const rawPath = path || '.';
  const allowOutsideWorkspace = options.allowOutsideWorkspace ?? true;
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
    const workspaceRoot = trimSandboxPathRight(runtimePaths.workspaceRoot);
    if (
      !allowOutsideWorkspace &&
      rawPath !== workspaceRoot &&
      !rawPath.startsWith(`${workspaceRoot}/`)
    ) {
      throw new Error('Sandbox path is outside workspace');
    }
    return rawPath;
  }

  return joinSandboxPath(sessionWorkDirectory, rawPath.replace(/^\.\//, ''));
};

/** 构建 runtime 状态和 manifest 统一使用的内容 hash。 */
export const buildRuntimeHash = (content: HashContent): string =>
  `sha256:${createHash('sha256').update(content).digest('hex')}`;

export type SandboxInputFileNameAllocation = {
  usedNames: Map<string, number>;
  urlByFilename: Map<string, string>;
  filenameByUrlAndBaseName: Map<string, string>;
};

export const createSandboxInputFileNameAllocation = (): SandboxInputFileNameAllocation => ({
  usedNames: new Map<string, number>(),
  urlByFilename: new Map<string, string>(),
  filenameByUrlAndBaseName: new Map<string, string>()
});

const allocationsByOwner = new WeakMap<object, Map<string, SandboxInputFileNameAllocation>>();

const setOwnerAllocation = (
  owner: object,
  key: string,
  allocation: SandboxInputFileNameAllocation
) => {
  let byScope = allocationsByOwner.get(owner);
  if (!byScope) {
    byScope = new Map<string, SandboxInputFileNameAllocation>();
    allocationsByOwner.set(owner, byScope);
  }
  byScope.set(key, allocation);
};

/** 生成单个会话沙盒工作目录的输入文件去重作用域键。 */
export const buildSandboxInputFileScopeKey = ({
  sourceType,
  sourceId,
  userId,
  chatId
}: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId?: string;
}) => `${getRunningSandboxId({ sourceType, sourceId, userId })}:${chatId ?? ''}`;

/**
 * 获取或创建同一沙盒会话工作目录下的输入文件名分配状态。
 *
 * 状态仅通过 WeakMap 绑定到当前请求上下文对象（contextOwner）或沙盒实例（sandbox），
 * 请求或实例释放后随 GC 自动回收，不在进程级 Map 中永久保留历史会话数据。
 */
export const getSandboxInputFileNameAllocation = ({
  scopeKey,
  contextOwner,
  sandbox,
  workDirectory = ''
}: {
  scopeKey?: string;
  contextOwner?: object;
  sandbox?: object | null;
  workDirectory?: string;
}): SandboxInputFileNameAllocation => {
  const key = scopeKey || workDirectory;
  const sandboxObject = sandbox && typeof sandbox === 'object' ? sandbox : undefined;

  if (contextOwner) {
    let allocation = allocationsByOwner.get(contextOwner)?.get(key);
    if (!allocation) {
      allocation = createSandboxInputFileNameAllocation();
      setOwnerAllocation(contextOwner, key, allocation);
    }
    if (sandboxObject) {
      setOwnerAllocation(sandboxObject, key, allocation);
    }
    return allocation;
  }

  if (sandboxObject) {
    let allocation = allocationsByOwner.get(sandboxObject)?.get(key);
    if (!allocation) {
      allocation = createSandboxInputFileNameAllocation();
      setOwnerAllocation(sandboxObject, key, allocation);
    }
    return allocation;
  }

  return createSandboxInputFileNameAllocation();
};

/**
 * 将外部文件名收敛为可写入 sandbox user_files 的单个 path segment。
 * URL query、API body 和模型上下文都可能携带文件名，因此调用方不能信任原始 name。
 * 当提供会话级 allocation 时，相同 URL 复用原文件名，不同 URL 的同名文件自动递增后缀。
 */
export const getSafeSandboxInputFilename = (
  filename: string,
  index: number,
  usedNames: Map<string, number>,
  options?: {
    url?: string;
    allocation?: SandboxInputFileNameAllocation;
    batchUsedFilenames?: Set<string>;
  }
) => {
  const fallbackName = `file-${index}`;
  const normalized = filename.replace(/\\/g, '/').split('/').pop()?.trim() || fallbackName;
  const withoutControlChars = normalized.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  const baseName =
    withoutControlChars && withoutControlChars !== '.' && withoutControlChars !== '..'
      ? withoutControlChars
      : fallbackName;

  const allocation = options?.allocation;
  const normalizedUrl = options?.url?.trim() || undefined;
  const batchUsedFilenames = options?.batchUsedFilenames;
  if (allocation && normalizedUrl) {
    const existing = allocation.filenameByUrlAndBaseName.get(`${baseName}\0${normalizedUrl}`);
    if (existing && !batchUsedFilenames?.has(existing)) {
      batchUsedFilenames?.add(existing);
      return existing;
    }
  }

  const firstDotIndex = baseName.indexOf('.');
  const stem = firstDotIndex > 0 ? baseName.slice(0, firstDotIndex) : baseName;
  const extension = firstDotIndex > 0 ? baseName.slice(firstDotIndex) : '';
  const targetUsedNames = allocation?.usedNames ?? usedNames;
  let count = targetUsedNames.get(baseName) || 0;
  let candidate = count === 0 ? baseName : `${stem}-${count}${extension}`;
  while (
    batchUsedFilenames?.has(candidate) ||
    (allocation &&
      allocation.urlByFilename.has(candidate) &&
      allocation.urlByFilename.get(candidate) !== normalizedUrl)
  ) {
    count += 1;
    candidate = `${stem}-${count}${extension}`;
  }
  targetUsedNames.set(baseName, count + 1);
  batchUsedFilenames?.add(candidate);
  if (allocation && normalizedUrl) {
    allocation.urlByFilename.set(candidate, normalizedUrl);
    allocation.filenameByUrlAndBaseName.set(`${baseName}\0${normalizedUrl}`, candidate);
    allocation.filenameByUrlAndBaseName.set(`${candidate}\0${normalizedUrl}`, candidate);
  }

  return candidate;
};
