import { type SandboxClient } from '@fastgpt/service/core/ai/sandbox/service/runtime';
import type {
  SandboxFileTreeItem,
  SandboxListRecursiveResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import type archiver from 'archiver';
import mime from 'mime';
import { getSandboxRuntimeProfile } from '@fastgpt/service/core/ai/sandbox/runtime/profile';

export type SandboxFileEntry = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
};

export type SandboxFileContent = {
  content: Buffer;
  contentType: string;
  fileName: string;
};

const trimSandboxPathRight = (value: string) => (value === '/' ? '' : value.replace(/\/+$/, ''));

const getSandboxWorkDirectory = () => getSandboxRuntimeProfile().workDirectory;

/**
 * 将编辑器传入的相对路径锚定到 sandbox workspace。
 *
 * SandboxEditor 以 `.` 表示工作区根目录；Sealos provider 自身的 `.` 会落到
 * `/home/devbox`，因此 API 边界必须显式把相对路径解析到当前运行态 workDirectory。
 * 已经是绝对路径的历史节点路径保持原样，保证旧 UI 状态和下载/保存路径兼容。
 */
export function resolveSandboxWorkspacePath(
  path: string | undefined,
  workDirectory = getSandboxWorkDirectory()
) {
  const rawPath = path || '.';
  if (rawPath === '.' || rawPath === './' || rawPath === '') {
    return trimSandboxPathRight(workDirectory);
  }

  if (rawPath.split('/').includes('..')) {
    throw new Error('Path traversal detected');
  }

  if (rawPath.startsWith('/')) return rawPath;

  const relativePath = rawPath.replace(/^\.\//, '');
  return `${trimSandboxPathRight(workDirectory)}/${relativePath}`;
}

/**
 * 把 provider 返回的 workspace 绝对路径还原成前端编辑器使用的相对路径。
 *
 * API 发给 Sealos provider 时需要绝对 workDirectory；但前端文件树一直以 workspace
 * 相对路径作为节点 id。这里保留前端语义，避免首屏递归加载和后续新建/上传出现绝对路径与相对路径混用。
 */
export function toSandboxWorkspaceRelativePath(
  path: string,
  workDirectory = getSandboxWorkDirectory()
) {
  const normalizedPath = trimSandboxPathRight(path.replace(/^\.\//, ''));
  const normalizedWorkDirectory = trimSandboxPathRight(workDirectory);

  if (!normalizedWorkDirectory) {
    return normalizedPath.replace(/^\/+/, '') || '.';
  }

  if (normalizedPath === normalizedWorkDirectory) return '.';

  if (normalizedPath.startsWith(`${normalizedWorkDirectory}/`)) {
    return normalizedPath.slice(normalizedWorkDirectory.length + 1) || '.';
  }

  return normalizedPath;
}

/** 归一化单层目录列表中的路径，保持 API 响应为 workspace 相对路径。 */
export function normalizeSandboxFileEntryPaths(
  entries: SandboxFileEntry[],
  workDirectory: string
): SandboxFileEntry[] {
  return entries.map((entry) => ({
    ...entry,
    path: toSandboxWorkspaceRelativePath(entry.path, workDirectory)
  }));
}

/** 递归归一化首屏文件树和展开目录集合中的路径。 */
export function normalizeSandboxFileTreePaths(
  result: SandboxListRecursiveResponse,
  workDirectory: string
): SandboxListRecursiveResponse {
  const normalizeTree = (nodes: SandboxFileTreeItem[]): SandboxFileTreeItem[] =>
    nodes.map((node) => {
      const normalizedNode: SandboxFileTreeItem = {
        ...node,
        path: toSandboxWorkspaceRelativePath(node.path, workDirectory)
      };
      if (node.children) {
        normalizedNode.children = normalizeTree(node.children);
      }
      return normalizedNode;
    });

  return {
    files: normalizeTree(result.files),
    expandedPaths: result.expandedPaths.map((path) =>
      toSandboxWorkspaceRelativePath(path, workDirectory)
    )
  };
}

/**
 * 列出沙盒中指定目录的直接子项。
 * 这里只做 provider DirectoryEntry 到前端文件条目的轻量映射，不递归、不排序，调用方按自己的展示语义处理。
 */
export async function listSandboxDirectory(
  sandbox: SandboxClient,
  path: string
): Promise<SandboxFileEntry[]> {
  const workDirectory = getSandboxWorkDirectory();
  const entries = await sandbox.provider.listDirectory(
    resolveSandboxWorkspacePath(path, workDirectory)
  );
  return normalizeSandboxFileEntryPaths(
    entries.map((entry) => ({
      name: entry.name,
      path: entry.path,
      type: entry.isDirectory ? ('directory' as const) : ('file' as const),
      size: entry.isFile ? entry.size : undefined
    })),
    workDirectory
  );
}

type ListSandboxDirectoryRecursiveOptions = {
  excludeNames?: string[];
  maxDepth?: number;
};

const FIND_LIST_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const FIND_LIST_TIMEOUT_MS = 30 * 1000;

/**
 * 通过一次 find 命令获取沙盒目录的扁平文件清单，再在服务端内存中拼成前端文件树。
 *
 * 这个接口服务 Skill edit 首屏初始化：前端只请求一次，服务端也只执行一次命令，避免逐层
 * listDirectory 带来的多轮网络开销。返回的目录节点会带 children/loaded，可直接复用前端文件树结构。
 *
 * 边界行为：
 * - excludeNames 会转换为 find -prune，避免 node_modules/.git 等大目录进入输出。
 * - maxDepth 表示前端树的最大展开层级，find 使用 maxDepth + 1 包含该层目录节点本身。
 * - 输出被 provider 截断时直接报错，避免把半截文件树渲染到 UI。
 */
export async function listSandboxDirectoryRecursive(
  sandbox: SandboxClient,
  path: string,
  options: ListSandboxDirectoryRecursiveOptions = {}
): Promise<SandboxListRecursiveResponse> {
  const workDirectory = getSandboxWorkDirectory();
  const providerPath = resolveSandboxWorkspacePath(path, workDirectory);

  type FlatSandboxFileEntry = SandboxFileEntry & {
    level: number;
  };

  /**
   * 对用户可控路径和排除名做 POSIX shell 单引号转义。
   * find 命令需要拼接表达式，目前 sandbox provider 只暴露字符串命令接口，不能传 argv 数组。
   */
  const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

  /**
   * 与前端文件树保持一致：目录优先，同类型按自然序排序。
   * 在服务端排序可以让首次渲染和后续本地增删改的顺序一致。
   */
  const sortSandboxFileEntries = <T extends { type: 'file' | 'directory'; name: string }>(
    files: T[]
  ): T[] => {
    return [...files].sort((a, b) => {
      if (a.type === 'directory' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  };

  const trimPathRight = (value: string) => (value === '/' ? '/' : value.replace(/\/+$/, ''));
  const stripLeadingDotSlash = (value: string) => value.replace(/^\.\//, '');

  /**
   * 计算 entry 相对 rootPath 的路径，用于得出树节点层级。
   * find 在 path='.' 时会输出 './a/b'，这里统一去掉前缀，避免前端路径出现 './'。
   */
  const getRelativePathForLevel = (rootPath: string, entryPath: string) => {
    const normalizedRoot = trimPathRight(stripLeadingDotSlash(rootPath || '.'));
    const normalizedEntry = stripLeadingDotSlash(entryPath);

    if (normalizedRoot === '.' || normalizedRoot === '') {
      return normalizedEntry;
    }

    if (normalizedRoot === '/') {
      return normalizedEntry.replace(/^\/+/, '');
    }

    if (normalizedEntry.startsWith(`${normalizedRoot}/`)) {
      return normalizedEntry.slice(normalizedRoot.length + 1);
    }

    return normalizedEntry;
  };

  const getTreeLevel = (rootPath: string, entryPath: string) => {
    const relativePath = getRelativePathForLevel(rootPath, entryPath);
    if (!relativePath) return 0;
    return relativePath.split('/').filter(Boolean).length - 1;
  };

  /**
   * 归一化 find 输出的路径，并过滤 rootPath 自身。
   * 前端文件树只需要 root 的子项，root 节点本身不作为一个 TreeNode 返回。
   */
  const normalizeFindEntryPath = (rootPath: string, rawPath: string) => {
    const normalizedRoot = trimPathRight(stripLeadingDotSlash(rootPath || '.'));
    const normalizedEntry = trimPathRight(stripLeadingDotSlash(rawPath));

    if (
      normalizedEntry === normalizedRoot ||
      normalizedEntry === '.' ||
      (normalizedRoot === '.' && normalizedEntry === '.')
    ) {
      return;
    }

    return normalizedEntry;
  };

  const getParentPath = (entryPath: string) => {
    const slashIndex = entryPath.lastIndexOf('/');
    if (slashIndex < 0) return '.';
    if (slashIndex === 0) return '/';
    return entryPath.slice(0, slashIndex);
  };

  /**
   * 解析 find 的 NUL 分隔输出。
   * 使用 NUL 而不是换行，是为了兼容文件名里包含换行的情况；字段之间用 tab，通常文件名可能含 tab，
   * 所以解析时只读取前两个 tab，剩余部分全部视为路径。
   */
  const parseFindFileListOutput = (stdout: string, rootPath: string): FlatSandboxFileEntry[] => {
    return stdout
      .split('\0')
      .filter(Boolean)
      .flatMap((record): FlatSandboxFileEntry[] => {
        const typeEndIndex = record.indexOf('\t');
        const sizeEndIndex = record.indexOf('\t', typeEndIndex + 1);
        if (typeEndIndex < 0 || sizeEndIndex < 0) return [];

        const fileType = record.slice(0, typeEndIndex);
        const size = Number(record.slice(typeEndIndex + 1, sizeEndIndex));
        const normalizedPath = normalizeFindEntryPath(rootPath, record.slice(sizeEndIndex + 1));
        if (!normalizedPath) return [];

        const name = normalizedPath.split('/').filter(Boolean).pop();
        if (!name) return [];

        // symlink 统一按目录处理，沿用现有 listDirectory polyfill 的保守行为。
        const isDirectory = fileType === 'd' || fileType === 'l';
        return [
          {
            name,
            path: normalizedPath,
            type: isDirectory ? 'directory' : 'file',
            size: isDirectory ? undefined : Number.isFinite(size) ? size : undefined,
            level: getTreeLevel(rootPath, normalizedPath)
          }
        ];
      });
  };

  /**
   * 把扁平文件清单拼成 TreeNode 兼容结构。
   * 先建 path -> node 索引，再按层级从浅到深挂到父节点，避免依赖 find 输出顺序。
   */
  const buildSandboxFileTree = (entries: FlatSandboxFileEntry[]): SandboxListRecursiveResponse => {
    const nodeMap = new Map<string, SandboxFileTreeItem>();
    const rootNodes: SandboxFileTreeItem[] = [];

    for (const entry of entries) {
      const node: SandboxFileTreeItem = { ...entry };
      if (entry.type === 'directory') {
        node.children = [];
        // 达到 maxDepth 的目录节点保留但标记未加载，用户展开时仍可走单层 list 兜底。
        node.loaded = entry.level < maxDepth;
      }
      nodeMap.set(entry.path, node);
    }

    const nodes = [...nodeMap.values()].sort((a, b) => a.level - b.level);
    for (const node of nodes) {
      const parentNode = nodeMap.get(getParentPath(node.path));
      if (parentNode?.type === 'directory') {
        parentNode.children?.push(node);
      } else {
        rootNodes.push(node);
      }
    }

    const sortTreeNodes = (nodes: SandboxFileTreeItem[]): SandboxFileTreeItem[] =>
      sortSandboxFileEntries(nodes).map((node) =>
        node.children
          ? {
              ...node,
              children: sortTreeNodes(node.children)
            }
          : node
      );

    const sortedRootNodes = sortTreeNodes(rootNodes);
    const expandedPaths: string[] = [];

    // 递归列表会预加载多层目录，但 UI 默认只展开第一层，避免首屏把所有子目录铺开。
    const collectExpandedPaths = (nodes: SandboxFileTreeItem[]) => {
      for (const node of nodes) {
        if (node.type === 'directory' && node.loaded && node.level === 0) {
          expandedPaths.push(node.path);
        }
      }
    };
    collectExpandedPaths(sortedRootNodes);

    return {
      files: sortedRootNodes,
      expandedPaths
    };
  };

  const maxDepth = Math.max(0, options.maxDepth ?? 20);
  const pruneExpression = options.excludeNames?.length
    ? `\\( ${options.excludeNames.map((name) => `-name ${shellQuote(name)}`).join(' -o ')} \\) -prune -o`
    : '';
  const printEntryScript = [
    'for entry_path; do',
    'if [ -L "$entry_path" ]; then type=l; size=0',
    'elif [ -d "$entry_path" ]; then type=d; size=0',
    'elif [ -f "$entry_path" ]; then type=f; size=$(wc -c < "$entry_path" 2>/dev/null | tr -d "[:space:]"); [ -n "$size" ] || size=0',
    'else continue',
    'fi',
    'printf "%s\\t%s\\t%s\\0" "$type" "$size" "$entry_path"',
    'done'
  ].join('\n');
  const command = [
    `find ${shellQuote(providerPath)}`,
    `-maxdepth ${maxDepth + 1}`,
    pruneExpression,
    `\\( -type d -o -type f -o -type l \\)`,
    `-exec sh -c ${shellQuote(printEntryScript)} sh {} +`
  ]
    .filter(Boolean)
    .join(' ');

  const result = await sandbox.provider.execute(command, {
    timeoutMs: FIND_LIST_TIMEOUT_MS,
    maxOutputBytes: FIND_LIST_MAX_OUTPUT_BYTES
  });

  if (result.truncated) {
    return Promise.reject(new Error('Sandbox file list output was truncated'));
  }

  if (result.exitCode !== 0) {
    return Promise.reject(new Error(result.stderr || 'Failed to list sandbox files'));
  }

  return normalizeSandboxFileTreePaths(
    buildSandboxFileTree(parseFindFileListOutput(result.stdout, providerPath)),
    workDirectory
  );
}

/**
 * 写入沙盒文件。
 * 普通文本直接写入；data URL base64 内容会解码为 Buffer，以支持图片等二进制上传场景。
 */
export async function writeSandboxFile(
  sandbox: SandboxClient,
  path: string,
  content: string
): Promise<void> {
  const providerPath = resolveSandboxWorkspacePath(path);
  let data: string | Buffer = content;
  if (content.startsWith('data:') && content.includes(';base64,')) {
    const base64Index = content.indexOf(';base64,');
    if (base64Index !== -1) {
      const base64Str = content.slice(base64Index + 8);
      data = Buffer.from(base64Str, 'base64');
    }
  }

  const results = await sandbox.provider.writeFiles([{ path: providerPath, data }]);
  const result = results[0];
  if (result.error) {
    return Promise.reject(result.error);
  }
}

/**
 * 判断沙盒路径是否为目录。
 * 当 provider 查询不到信息时，对根路径和以斜杠结尾的路径做兼容性兜底，避免旧沙盒实现误报。
 */
export async function isSandboxPathDirectory(
  sandbox: SandboxClient,
  path: string
): Promise<boolean> {
  const providerPath = resolveSandboxWorkspacePath(path);
  const fileInfoMap = await sandbox.provider.getFileInfo([providerPath]);
  const fileInfo = fileInfoMap.get(providerPath);
  return (
    fileInfo?.isDirectory ??
    (path === '.' || path === '' || providerPath.endsWith('/') || path.endsWith('/'))
  );
}

/**
 * 读取沙盒文件内容并返回下载/预览所需的 Buffer、contentType 和文件名。
 * preview=true 时按扩展名推断 MIME，用于编辑器内联预览；非 preview 始终以二进制下载方式返回。
 */
export async function getSandboxFileContent(
  sandbox: SandboxClient,
  path: string,
  preview?: boolean
): Promise<SandboxFileContent> {
  const providerPath = resolveSandboxWorkspacePath(path);
  const results = await sandbox.provider.readFiles([providerPath]);
  const result = results[0];

  if (result.error) {
    return Promise.reject(new Error(`Failed to read file: ${result.error.message}`));
  }

  const fileName = providerPath.split('/').pop() || 'file';
  // 注意：preview 模式下 contentType 由文件路径决定，可能返回 text/html / image/svg+xml 等危险类型。
  // 若未来有任何代码让浏览器直接导航到 download 端点（iframe / window.open 等），需确保这类内容不被同源渲染，否则会造成存储型 XSS。
  const contentType = preview
    ? (mime.getType(providerPath) ?? 'application/octet-stream')
    : 'application/octet-stream';

  return {
    content: Buffer.from(result.content),
    contentType,
    fileName
  };
}

const MAX_ARCHIVE_DEPTH = 20;

/**
 * 递归把目录加入 ZIP 归档。
 * 读取失败的文件会被跳过，目录深度超过 MAX_ARCHIVE_DEPTH 时停止递归，避免异常目录结构导致打包失控。
 */
export async function addDirectoryToArchive(
  sandbox: SandboxClient,
  archive: archiver.Archiver,
  dirPath: string,
  archivePath: string,
  depth: number = 0
): Promise<void> {
  if (depth > MAX_ARCHIVE_DEPTH) return;

  const providerDirPath = resolveSandboxWorkspacePath(dirPath);
  const entries = await sandbox.provider.listDirectory(providerDirPath);

  for (const entry of entries) {
    const entryArchivePath = archivePath ? `${archivePath}/${entry.name}` : entry.name;

    if (entry.isDirectory) {
      await addDirectoryToArchive(sandbox, archive, entry.path, entryArchivePath, depth + 1);
    } else {
      const results = await sandbox.provider.readFiles([entry.path]);
      const result = results[0];

      if (!result.error) {
        archive.append(Buffer.from(result.content), { name: entryArchivePath });
      }
    }
  }
}
