/**
 * 任务 1（`20261111_migrate_sandbox_to_juicefs`）纯函数工具：
 * 9 态数据源分类、确定性目标卷名计算与容器内安全归档/解压命令构造。
 */
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { OPEN_SANDBOX_DEFAULT_ROOT_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { createSessionVolumeClaimName } from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service';
import {
  LEGACY_WORKSPACE_MOUNT_PATH,
  type LegacyExportFileEntry,
  type LegacyExportSandboxOps,
  type TemporaryMigrationSandboxOps
} from '@fastgpt/service/core/ai/sandbox/legacy/legacyOpenSandbox';
import {
  getLegacyV2WorkspaceClaimName,
  type LegacySandboxV2Doc
} from '../sandbox_migration_shared/legacySchema';

const WORKSPACE_PRESERVED_SYSTEM_NAMES = [
  '.accesslog',
  '.config',
  '.stats',
  '.trash',
  'lost+found'
] as const;

const ALWAYS_EXCLUDED_TOP_NAMES = [
  '.fastgpt-sandbox-archive.zip',
  '.fastgpt-sandbox-restore.zip',
  ...WORKSPACE_PRESERVED_SYSTEM_NAMES
] as const;

const PYTHON_BLOCKED_TOP_NAMES_EXPR = `set(${JSON.stringify(ALWAYS_EXCLUDED_TOP_NAMES)})`;

export type LegacyMigrationSourcePlan =
  | { kind: 'skip_deleting' }
  | { kind: 'fail_legacy_v1' }
  | { kind: 's3_archive' }
  | { kind: 'opensandbox_volume'; oldClaimName?: string }
  | { kind: 'sealos_devbox' };

/**
 * 根据 `v2` 9 态状态机与 `operation.phase` 判定单条记录的权威物理数据源。
 */
export function classifyLegacyV2MigrationSource(
  doc: Pick<LegacySandboxV2Doc, 'status' | 'provider' | 'operation' | 'storage'>
): LegacyMigrationSourcePlan {
  if (doc.status === 'deleting') {
    return { kind: 'skip_deleting' };
  }
  if (doc.status === 'legacyMigrating') {
    return { kind: 'fail_legacy_v1' };
  }

  // 归档完成、恢复中（旧架构恢复完前始终保留 S3 zip）或归档已上传至 S3 的阶段均以 S3 package.zip 为权威源。
  if (
    doc.status === 'archived' ||
    doc.status === 'restoring' ||
    (doc.status === 'archiving' && doc.operation?.phase !== 'claimed')
  ) {
    return { kind: 's3_archive' };
  }

  if (doc.provider === 'sealosdevbox') {
    return { kind: 'sealos_devbox' };
  }

  return {
    kind: 'opensandbox_volume',
    oldClaimName: getLegacyV2WorkspaceClaimName(doc)
  };
}

/**
 * 基于 `v2._id` 计算确定性的新版 JuiceFS 卷名，确保重试幂等复用同一卷且绝不与旧卷重名。
 */
export function computeDeterministicV3ClaimName(params: {
  v2ObjectId: string;
  sandboxId: string;
  oldClaimName?: string;
}): string {
  const primaryHash = createHash('sha256')
    .update(`v3-juicefs:${params.v2ObjectId}`)
    .digest('hex')
    .slice(0, 8);
  const candidate = createSessionVolumeClaimName({
    sandboxId: params.sandboxId,
    generationId: primaryHash
  });

  if (params.oldClaimName && candidate === params.oldClaimName.toLowerCase()) {
    const fallbackHash = createHash('sha256')
      .update(`v3-juicefs-alt:${params.v2ObjectId}`)
      .digest('hex')
      .slice(0, 8);
    return createSessionVolumeClaimName({
      sandboxId: params.sandboxId,
      generationId: fallbackHash
    });
  }
  return candidate;
}

function buildTopLevelFindExcludePredicates(excludeArchiveZips = false): string {
  const names = excludeArchiveZips ? ALWAYS_EXCLUDED_TOP_NAMES : WORKSPACE_PRESERVED_SYSTEM_NAMES;
  const parts = names.map((name) => `! -name ${shellQuote(name)}`);
  parts.push("! -name '.jfs*'");
  return parts.join(' ');
}

/**
 * 生成清空 `/workspace` 租户目录但严格保留 JuiceFS 虚拟控制文件与块设备 `lost+found` 的安全命令。
 *
 * 先对非软链顶层租户目录恢复属主读写执行权限（`u+rwX`），防止 `0555` 只读目录（如 Go 模块缓存）导致非 root 重试清理报 `Permission denied`。
 */
export function buildClearWorkspaceTenantFilesCommand(
  workspaceDir: string = OPEN_SANDBOX_DEFAULT_ROOT_PATH
): string {
  const baseFind = `find ${shellQuote(workspaceDir)} -mindepth 1 -maxdepth 1 ${buildTopLevelFindExcludePredicates()}`;
  return [
    `${baseFind} ! -type l -exec chmod -R u+rwX -- {} + 2>/dev/null || true`,
    `${baseFind} -exec rm -rf -- {} +`
  ].join('\n');
}

/**
 * 构造顶层锚定的 `tar` 排除参数（主要供无 `--null` 支持的精简 `tar` 兜底使用）：
 * - 始终以 `./` 前缀仅排除根目录下的归档临时包、JuiceFS 控制文件与 ext4 `lost+found`，绝不误删子目录同名文件（如 `myapp/.config`）；
 * - 完整保留顶层 `projects` 及所有工作区目录，避免误删历史用户文件。
 */
export function buildTarExcludeArgs(): string[] {
  const patterns: string[] = [...ALWAYS_EXCLUDED_TOP_NAMES.map((name) => `./${name}`), './.jfs*'];
  return patterns.map((pattern) => `--exclude=${shellQuote(pattern)}`);
}

/**
 * 构造双挂载旧卷（`/legacy-workspace` -> `/workspace`）流式 `tar` 管道拷贝命令。
 *
 * 先在独立语句中运行 `find -mindepth 1 -maxdepth 1 -print0 > "$list_file"`，确保源挂载缺失、权限拒绝或 I/O 报错立即非 0 退出（不会因管道吞错变为空目录迁移）；
 * 再通过 `tar --null -T "$list_file"` 流式直拷并显式捕获左侧 `tar` 退出码。
 */
export function buildDualMountTarCopyCommand(
  params: {
    legacyMountPath?: string;
    targetMountPath?: string;
  } = {}
): string {
  const legacyDir = params.legacyMountPath ?? LEGACY_WORKSPACE_MOUNT_PATH;
  const targetDir = params.targetMountPath ?? OPEN_SANDBOX_DEFAULT_ROOT_PATH;
  const findPredicates = buildTopLevelFindExcludePredicates(true);

  return [
    'set -eu',
    'tar_err_file=$(mktemp /tmp/fastgpt-mig-tar.XXXXXX)',
    'list_file=$(mktemp /tmp/fastgpt-mig-list.XXXXXX)',
    'trap \'rm -f -- "$tar_err_file" "$list_file"\' EXIT',
    `if [ ! -d ${shellQuote(legacyDir)} ]; then`,
    `  echo "Legacy workspace mount directory missing: ${legacyDir}" >&2`,
    '  exit 1',
    'fi',
    `(cd ${shellQuote(legacyDir)} && find . -mindepth 1 -maxdepth 1 ${findPredicates} -print0) > "$list_file"`,
    buildClearWorkspaceTenantFilesCommand(targetDir),
    'if [ -s "$list_file" ]; then',
    `  { tar -C ${shellQuote(legacyDir)} --null -T "$list_file" -cf - || echo $? > "$tar_err_file"; } | tar -C ${shellQuote(targetDir)} --no-same-owner -xf -`,
    '  if [ -s "$tar_err_file" ]; then',
    '    exit "$(cat "$tar_err_file")"',
    '  fi',
    'fi'
  ].join('\n');
}

/**
 * 构造容器内校验防 Zip Slip / 软链祖先穿越并解压 `/tmp/migrate.zip` 到 `/workspace` 的命令（执行后清理临时包）。
 *
 * 允许保留合法的叶子软链（如 Python `.venv/bin/python3 -> /usr/bin/python3` 或相对软链），
 * 同时严格拦截任何穿过软链祖先目录写入下层路径的多跳逃逸链（如 `s1 -> .`, `s1/s2 -> ..`, `s1/s2/outside`）。
 */
export function buildSafeUnzipToWorkspaceCommand(params: {
  zipPath: string;
  targetMountPath?: string;
}): string {
  const targetDir = params.targetMountPath ?? OPEN_SANDBOX_DEFAULT_ROOT_PATH;

  const pythonScript = [
    'import os, shutil, stat, sys, zipfile',
    'zip_path, dest_root = sys.argv[1], os.path.realpath(sys.argv[2])',
    `blocked = ${PYTHON_BLOCKED_TOP_NAMES_EXPR}`,
    'def is_skipped(parts):',
    '    if not parts: return True',
    '    top = parts[0]',
    '    return top in blocked or top.startswith(".jfs")',
    'def assert_no_symlink_ancestors(parts, raw_name):',
    '    cur = dest_root',
    '    for seg in parts[:-1]:',
    '        cur = os.path.join(cur, seg)',
    '        if os.path.islink(cur):',
    '            raise RuntimeError(f"Refusing to extract through symlink directory: {raw_name}")',
    'symlink_entries = set()',
    'deferred_dir_modes = []',
    'with zipfile.ZipFile(zip_path, "r") as zf:',
    '    for info in zf.infolist():',
    '        name = info.filename.replace("\\\\", "/")',
    '        if name.startswith("/"): raise RuntimeError(f"Unsafe absolute zip entry: {name}")',
    '        parts = [p for p in name.split("/") if p and p != "."]',
    '        if any(p == ".." for p in parts): raise RuntimeError(f"Unsafe traversal zip entry: {name}")',
    '        if is_skipped(parts): continue',
    '        for idx in range(1, len(parts)):',
    '            if "/".join(parts[:idx]) in symlink_entries:',
    '                raise RuntimeError(f"Refusing to extract through symlink directory: {name}")',
    '        rel_path = "/".join(parts)',
    '        target = os.path.normpath(os.path.join(dest_root, rel_path))',
    '        if target != dest_root and not target.startswith(dest_root + os.sep):',
    '            raise RuntimeError(f"Zip entry escapes workspace: {name}")',
    '        mode = (info.external_attr >> 16) & 0xFFFF',
    '        if stat.S_ISLNK(mode):',
    '            symlink_entries.add(rel_path)',
    '    for info in zf.infolist():',
    '        name = info.filename.replace("\\\\", "/")',
    '        parts = [p for p in name.split("/") if p and p != "."]',
    '        if is_skipped(parts): continue',
    '        assert_no_symlink_ancestors(parts, name)',
    '        target = os.path.normpath(os.path.join(dest_root, "/".join(parts)))',
    '        mode = (info.external_attr >> 16) & 0xFFFF',
    '        if info.is_dir() or name.endswith("/"):',
    '            if os.path.islink(target):',
    '                raise RuntimeError(f"Refusing to overwrite symlink with directory: {name}")',
    '            os.makedirs(target, exist_ok=True)',
    '            dir_perm = mode & 0o777',
    '            if dir_perm:',
    '                deferred_dir_modes.append((target, dir_perm))',
    '            continue',
    '        os.makedirs(os.path.dirname(target), exist_ok=True)',
    '        if stat.S_ISLNK(mode):',
    '            link_target = zf.read(info).decode("utf-8", errors="surrogateescape")',
    '            if os.path.lexists(target): os.unlink(target)',
    '            os.symlink(link_target, target)',
    '            continue',
    '        if os.path.lexists(target): os.unlink(target)',
    '        with zf.open(info, "r") as src, open(target, "wb") as dst:',
    '            shutil.copyfileobj(src, dst)',
    '        perm = mode & 0o777',
    '        if perm:',
    '            os.chmod(target, perm)',
    'for dir_path, dir_perm in sorted(deferred_dir_modes, key=lambda item: len(item[0]), reverse=True):',
    '    os.chmod(dir_path, dir_perm)'
  ].join('\n');

  return [
    'set -eu',
    `trap 'rm -f -- ${shellQuote(params.zipPath)}' EXIT`,
    buildClearWorkspaceTenantFilesCommand(targetDir),
    `python3 -c ${shellQuote(pythonScript)} ${shellQuote(params.zipPath)} ${shellQuote(targetDir)}`
  ].join('\n');
}

const EXECD_LIST_SUBTREE_DEPTH = 8;
const EXECD_DIR_BATCH_SIZE = 100;
const EXECD_READ_CONCURRENCY = 4;
const EXECD_UPLOAD_CONCURRENCY = 4;
const EXECD_COMMAND_JSON_MAX_BYTES = 16 * 1024;
const EXECD_SYMLINK_READ_MAX_BATCH = 50;

export type LegacyExecdDirectoryEntry = {
  relPath: string;
  targetPath: string;
  mode: number;
};

export type LegacyExecdFileEntry = {
  relPath: string;
  sourcePath: string;
  targetPath: string;
  size?: number;
  mode: number;
};

export type LegacyExecdSymlinkEntry = {
  relPath: string;
  sourcePath: string;
  targetPath: string;
  linkTarget: string;
};

export type LegacyWorkspaceManifest = {
  isEmpty: boolean;
  directories: LegacyExecdDirectoryEntry[];
  files: LegacyExecdFileEntry[];
  symlinks: LegacyExecdSymlinkEntry[];
};

/** 判断顶层入口名是否属于迁移固定过滤项（系统临时包 / JuiceFS 控制文件 / `lost+found`）。 */
export function isExcludedLegacyTopEntryName(name: string): boolean {
  if ((ALWAYS_EXCLUDED_TOP_NAMES as readonly string[]).includes(name)) {
    return true;
  }
  return name.startsWith('.jfs');
}

/** 校验并归一化 execd 十进制八进制写法的文件权限（如 `755` / `644`，兼容 `2755` 等高位剥离），非法值回落默认权限。 */
export function normalizeExecdPermissionMode(mode: number | undefined, fallback: number): number {
  if (mode === undefined || !Number.isInteger(mode) || mode < 0) {
    return fallback;
  }
  const text = String(mode);
  if (!/^[0-7]{1,4}$/.test(text)) {
    return fallback;
  }
  return Number(text.slice(-3));
}

function stripMountRoot(fullPath: string, mountRoot: string): string {
  const normalizedRoot = mountRoot.replace(/\/+$/, '') || '/';
  const prefix = normalizedRoot === '/' ? '/' : `${normalizedRoot}/`;
  if (!fullPath.startsWith(prefix)) {
    throw new Error(`Unexpected entry outside workspace root (${normalizedRoot}): ${fullPath}`);
  }
  const relPath = fullPath.slice(prefix.length);
  if (!relPath || relPath.includes('\0')) {
    throw new Error(`Invalid relative workspace path: ${fullPath}`);
  }
  const segments = relPath.split('/');
  if (segments.some((seg) => !seg || seg === '.' || seg === '..')) {
    throw new Error(`Unsafe traversal entry path: ${fullPath}`);
  }
  return relPath;
}

function assertNoSymlinkAncestors(relPath: string, symlinkSet: ReadonlySet<string>): void {
  const segments = relPath.split('/');
  for (let idx = 1; idx < segments.length; idx++) {
    const prefix = segments.slice(0, idx).join('/');
    if (symlinkSet.has(prefix)) {
      throw new Error(`Refusing to copy through link directory: ${relPath}`);
    }
  }
}

/**
 * 校验并重写跨集群旧 OpenSandbox 中的符号链接目标：
 * - 含 `\0` 或相对路径向工作区外逃逸时直接失败拒绝；
 * - 指向 `/legacy-workspace` 的绝对软链（如历史绝径引用）自动重写为 `/workspace/...`；
 * - `.venv/bin/python3 -> /usr/bin/python3` 等运行时系统绝对软链保持原样迁移。
 */
export function validateAndRewriteLegacySymlinkTarget(params: {
  relPath: string;
  target: string;
  legacyRoot?: string;
  targetRoot?: string;
}): string {
  const { relPath, target } = params;
  const legacyRoot = (params.legacyRoot ?? LEGACY_WORKSPACE_MOUNT_PATH).replace(/\/+$/, '') || '/';
  const targetRoot =
    (params.targetRoot ?? OPEN_SANDBOX_DEFAULT_ROOT_PATH).replace(/\/+$/, '') || '/';

  if (!target || target.includes('\0')) {
    throw new Error(`Invalid symlink target for ${relPath}`);
  }

  if (target === legacyRoot || target.startsWith(`${legacyRoot}/`)) {
    return `${targetRoot}${target.slice(legacyRoot.length)}`;
  }

  if (!target.startsWith('/')) {
    const parentRel = posix.dirname(relPath);
    const resolvedRel = posix.normalize(parentRel === '.' ? target : posix.join(parentRel, target));
    if (resolvedRel === '..' || resolvedRel.startsWith('../')) {
      throw new Error(`Link escapes workspace: ${relPath}`);
    }
  }

  return target;
}

function buildReadSymlinksCommand(sourcePaths: string[]): string {
  const encodedPaths = Buffer.from(JSON.stringify(sourcePaths), 'utf8').toString('base64');
  const pythonScript = [
    'import base64, json, os, sys',
    'paths = json.loads(base64.b64decode(sys.argv[1]).decode("utf-8"))',
    'out = []',
    'for p in paths:',
    '    if not os.path.islink(p):',
    '        raise RuntimeError(f"Not a symlink: {p}")',
    '    out.append(base64.b64encode(os.fsencode(os.readlink(p))).decode("ascii"))',
    'sys.stdout.write(json.dumps(out))'
  ].join('\n');
  return `python3 -c ${shellQuote(pythonScript)} ${shellQuote(encodedPaths)}`;
}

function buildCreateSymlinksCommand(
  symlinks: Array<{ targetPath: string; linkTarget: string }>,
  targetRoot: string
): string {
  const payload = symlinks.map((item) => ({
    p: Buffer.from(item.targetPath, 'utf8').toString('base64'),
    t: Buffer.from(item.linkTarget, 'utf8').toString('base64')
  }));
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  const pythonScript = [
    'import base64, json, os, sys',
    'items = json.loads(base64.b64decode(sys.argv[1]).decode("utf-8"))',
    'dest_root = os.path.normpath(sys.argv[2])',
    'for item in items:',
    '    dst = os.path.normpath(base64.b64decode(item["p"]).decode("utf-8"))',
    '    tgt = base64.b64decode(item["t"]).decode("utf-8")',
    '    if dst != dest_root and not dst.startswith(dest_root + os.sep):',
    '        raise RuntimeError(f"Symlink destination escapes workspace: {dst}")',
    '    rel = os.path.relpath(dst, dest_root)',
    '    cur = dest_root',
    '    for seg in rel.split(os.sep)[:-1]:',
    '        cur = os.path.join(cur, seg)',
    '        if os.path.islink(cur):',
    '            raise RuntimeError(f"Refusing to create symlink through link directory: {rel}")',
    '    os.makedirs(os.path.dirname(dst), exist_ok=True)',
    '    if os.path.lexists(dst):',
    '        os.unlink(dst)',
    '    os.symlink(tgt, dst)'
  ].join('\n');
  return `python3 -c ${shellQuote(pythonScript)} ${shellQuote(encodedPayload)} ${shellQuote(targetRoot)}`;
}

function chunkItemsByEncodedBytes<T>(
  items: T[],
  getApproxBytes: (item: T) => number,
  maxItems?: number
): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let currentBytes = 0;

  for (const item of items) {
    const itemBytes = getApproxBytes(item);
    if (
      current.length > 0 &&
      (currentBytes + itemBytes > EXECD_COMMAND_JSON_MAX_BYTES ||
        (maxItems !== undefined && current.length >= maxItems))
    ) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(item);
    currentBytes += itemBytes;
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

/**
 * 通过只读导出容器的 `execd` (`GET /directories/list`) 直接枚举源工作区文件树，
 * 在不写源端 `/tmp` 打包文件的前提下完成顶层排除、特殊节点拒绝与软链批量读取校验。
 */
export async function collectLegacyWorkspaceManifest(params: {
  legacyOps: Pick<LegacyExportSandboxOps, 'listDirectory' | 'exec'>;
  legacyRoot?: string;
  targetRoot?: string;
  signal?: AbortSignal;
}): Promise<LegacyWorkspaceManifest> {
  const legacyRoot = (params.legacyRoot ?? LEGACY_WORKSPACE_MOUNT_PATH).replace(/\/+$/, '') || '/';
  const targetRoot =
    (params.targetRoot ?? OPEN_SANDBOX_DEFAULT_ROOT_PATH).replace(/\/+$/, '') || '/';

  params.signal?.throwIfAborted();
  const topEntries = await params.legacyOps.listDirectory(legacyRoot, 1);

  const seenRelPaths = new Set<string>();
  const symlinkSet = new Set<string>();
  const directories: LegacyExecdDirectoryEntry[] = [];
  const files: LegacyExecdFileEntry[] = [];
  const rawSymlinks: Array<{ relPath: string; sourcePath: string; targetPath: string }> = [];
  const pendingDirs: string[] = [];

  const recordEntry = (entry: LegacyExportFileEntry): string | null => {
    const relPath = stripMountRoot(entry.path, legacyRoot);
    assertNoSymlinkAncestors(relPath, symlinkSet);
    if (seenRelPaths.has(relPath)) return null;
    seenRelPaths.add(relPath);

    if (entry.type === 'other') {
      throw new Error(`Unsupported special filesystem entry: ${relPath}`);
    }
    if (!entry.type) {
      throw new Error(`Legacy export entry missing type: ${entry.path}`);
    }

    const targetPath = posix.join(targetRoot, relPath);
    if (entry.type === 'directory') {
      directories.push({
        relPath,
        targetPath,
        mode: normalizeExecdPermissionMode(entry.mode, 755)
      });
      return relPath;
    }
    if (entry.type === 'symlink') {
      symlinkSet.add(relPath);
      rawSymlinks.push({ relPath, sourcePath: entry.path, targetPath });
      return null;
    }

    files.push({
      relPath,
      sourcePath: entry.path,
      targetPath,
      size: entry.size,
      mode: normalizeExecdPermissionMode(entry.mode, 644)
    });
    return null;
  };

  for (const entry of topEntries) {
    const relPath = stripMountRoot(entry.path, legacyRoot);
    const topName = relPath.split('/')[0];
    if (isExcludedLegacyTopEntryName(topName)) {
      continue;
    }
    const recordedDir = recordEntry(entry);
    if (recordedDir !== null) {
      pendingDirs.push(entry.path);
    }
  }

  while (pendingDirs.length > 0) {
    const batchDirs = pendingDirs.splice(0, EXECD_READ_CONCURRENCY);
    const batchResults = await Promise.all(
      batchDirs.map(async (subDir) => {
        params.signal?.throwIfAborted();
        const children = await params.legacyOps.listDirectory(subDir, EXECD_LIST_SUBTREE_DEPTH);
        return { subDir, children };
      })
    );

    for (const { subDir, children } of batchResults) {
      const normalizedSubDir = subDir.replace(/\/+$/, '') || '/';
      const subPrefix = `${normalizedSubDir}/`;
      // 按路径段深度升序处理，确保任何模拟桩或乱序响应都能先登记父级符号链接并拦截越界子项。
      const sortedChildren = [...children].sort(
        (a, b) => a.path.split('/').length - b.path.split('/').length
      );

      for (const child of sortedChildren) {
        const recordedDir = recordEntry(child);
        if (recordedDir !== null && child.path.startsWith(subPrefix)) {
          const relDepth = child.path.slice(subPrefix.length).split('/').length;
          if (relDepth >= EXECD_LIST_SUBTREE_DEPTH) {
            pendingDirs.push(child.path);
          }
        }
      }
    }
  }

  // 所有条目收集完后再统一复核一次软链祖先，防御父子目录同层并发枚举时的交错情况。
  for (const dir of directories) assertNoSymlinkAncestors(dir.relPath, symlinkSet);
  for (const file of files) assertNoSymlinkAncestors(file.relPath, symlinkSet);
  for (const sym of rawSymlinks) assertNoSymlinkAncestors(sym.relPath, symlinkSet);

  if (directories.length === 0 && files.length === 0 && rawSymlinks.length === 0) {
    return { isEmpty: true, directories: [], files: [], symlinks: [] };
  }

  const symlinks: LegacyExecdSymlinkEntry[] = [];
  if (rawSymlinks.length > 0) {
    const symlinkChunks = chunkItemsByEncodedBytes(
      rawSymlinks,
      (item) => Buffer.byteLength(item.sourcePath, 'utf8') + 16,
      EXECD_SYMLINK_READ_MAX_BATCH
    );

    for (const chunk of symlinkChunks) {
      params.signal?.throwIfAborted();
      const res = await params.legacyOps.exec(
        buildReadSymlinksCommand(chunk.map((item) => item.sourcePath)),
        60
      );
      let decodedTargets: unknown;
      try {
        decodedTargets = JSON.parse(res.stdout.trim());
      } catch (error) {
        throw new Error(
          `Legacy symlink manifest decode failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      if (!Array.isArray(decodedTargets) || decodedTargets.length !== chunk.length) {
        throw new Error(
          `Legacy symlink count mismatch: expected ${chunk.length}, got ${Array.isArray(decodedTargets) ? decodedTargets.length : typeof decodedTargets}`
        );
      }

      chunk.forEach((item, index) => {
        const b64 = decodedTargets[index];
        if (typeof b64 !== 'string') {
          throw new Error(`Invalid symlink target encoding for ${item.relPath}`);
        }
        const rawTarget = Buffer.from(b64, 'base64').toString('utf8');
        const linkTarget = validateAndRewriteLegacySymlinkTarget({
          relPath: item.relPath,
          target: rawTarget,
          legacyRoot,
          targetRoot
        });
        symlinks.push({ ...item, linkTarget });
      });
    }
  }

  directories.sort(
    (a, b) =>
      a.relPath.split('/').length - b.relPath.split('/').length ||
      a.relPath.localeCompare(b.relPath)
  );

  return { isEmpty: false, directories, files, symlinks };
}

/**
 * 将已扫描确认的源端文件清单通过 `execd` 直接流式导入目标临时迁移容器 `/workspace`：
 * 1. 先清理目标 `/workspace` 租户残留目录（保留 JuiceFS 虚拟控制文件与 `lost+found`）；
 * 2. 以可写 `755` 顺序批量建立所有目标目录，确保源端只读目录（如 `0555`）在写入子节点期间不报 `EACCES`；
 * 3. 所有普通文件统一通过 `openFileStream -> uploadStream` 有界并发直传并保留原文件权限；
 * 4. 如有软链按块通过 `/command` 还原，最后由深到浅恢复非 `755` 目录权限。
 */
export async function syncLegacyWorkspaceManifestViaExecd(params: {
  manifest: LegacyWorkspaceManifest;
  legacyOps: Pick<LegacyExportSandboxOps, 'openFileStream'>;
  targetOps: TemporaryMigrationSandboxOps;
  targetRoot?: string;
  signal?: AbortSignal;
}): Promise<void> {
  const targetRoot =
    (params.targetRoot ?? OPEN_SANDBOX_DEFAULT_ROOT_PATH).replace(/\/+$/, '') || '/';
  const { manifest, legacyOps, targetOps, signal } = params;
  if (manifest.isEmpty) return;

  signal?.throwIfAborted();
  await targetOps.exec(buildClearWorkspaceTenantFilesCommand(targetRoot), 60);

  for (let i = 0; i < manifest.directories.length; i += EXECD_DIR_BATCH_SIZE) {
    signal?.throwIfAborted();
    const batch = manifest.directories.slice(i, i + EXECD_DIR_BATCH_SIZE);
    await targetOps.createDirectories(batch.map((dir) => ({ path: dir.targetPath, mode: 755 })));
  }

  let fileCursor = 0;
  const uploadWorkers = Math.min(EXECD_UPLOAD_CONCURRENCY, manifest.files.length);
  if (uploadWorkers > 0) {
    await Promise.all(
      Array.from({ length: uploadWorkers }, async () => {
        while (fileCursor < manifest.files.length) {
          signal?.throwIfAborted();
          const file = manifest.files[fileCursor++];
          await targetOps.uploadStream(
            file.targetPath,
            legacyOps.openFileStream(file.sourcePath),
            file.mode
          );
        }
      })
    );
  }

  if (manifest.symlinks.length > 0) {
    const symlinkChunks = chunkItemsByEncodedBytes(
      manifest.symlinks,
      (item) =>
        Buffer.byteLength(item.targetPath, 'utf8') + Buffer.byteLength(item.linkTarget, 'utf8') + 32
    );
    for (const chunk of symlinkChunks) {
      signal?.throwIfAborted();
      await targetOps.exec(buildCreateSymlinksCommand(chunk, targetRoot), 60);
    }
  }

  const deferredDirs = manifest.directories
    .filter((dir) => dir.mode !== 755)
    .sort(
      (a, b) =>
        b.relPath.split('/').length - a.relPath.split('/').length ||
        b.targetPath.length - a.targetPath.length
    );
  for (let i = 0; i < deferredDirs.length; i += EXECD_DIR_BATCH_SIZE) {
    signal?.throwIfAborted();
    const batch = deferredDirs.slice(i, i + EXECD_DIR_BATCH_SIZE);
    await targetOps.setPermissions(batch.map((dir) => ({ path: dir.targetPath, mode: dir.mode })));
  }
}

/**
 * 构造在远端 Sealos Devbox 内打包工作区目录为 `/tmp/.fastgpt-v3-migrate.tar.gz` 的命令，
 * 并在打包成功后向 stdout 输出归档包精确字节数，供下游流式传输完整性校验与自动重试使用。
 *
 * 先在无管道独立语句中执行 `find -print0 > "$list_file"`，确保权限拒绝或磁盘 I/O 错误立即非 0 失败，不会被误判为 `EMPTY_WORKDIR`。
 */
export function buildSealosRemotePackCommand(params: {
  workDirectory: string;
  remoteTarPath: string;
}): string {
  const findPredicates = buildTopLevelFindExcludePredicates(true);
  const excludes = buildTarExcludeArgs().join(' ');
  return [
    'set -eu',
    `rm -f -- ${shellQuote(params.remoteTarPath)}`,
    `if [ ! -d ${shellQuote(params.workDirectory)} ]; then`,
    "  printf 'EMPTY_WORKDIR'",
    '  exit 0',
    'fi',
    'list_file=$(mktemp /tmp/fastgpt-sealos-list.XXXXXX)',
    'trap \'rm -f -- "$list_file"\' EXIT',
    `(cd ${shellQuote(params.workDirectory)} && find . -mindepth 1 -maxdepth 1 ${findPredicates} -print0) > "$list_file"`,
    'if [ ! -s "$list_file" ]; then',
    "  printf 'EMPTY_WORKDIR'",
    '  exit 0',
    'fi',
    'if tar --null -T /dev/null -cf /dev/null 2>/dev/null; then',
    `  tar -C ${shellQuote(params.workDirectory)} --null -T "$list_file" -czf ${shellQuote(params.remoteTarPath)}`,
    'else',
    `  tar -C ${shellQuote(params.workDirectory)} ${excludes} -czf ${shellQuote(params.remoteTarPath)} .`,
    'fi',
    `wc -c < ${shellQuote(params.remoteTarPath)}`
  ].join('\n');
}

/**
 * 构造在临时迁移容器内受控校验并解压 `/tmp/migrate.tar.gz` 到 `/workspace` 的命令。
 *
 * 由 Python `tarfile` 逐项受控提取（不调用系统 `tar -xzf`）：
 * - 严格拦截绝对条目名、`..` 路径穿越、FIFO/设备特殊节点、软链祖先目录穿越与越界硬链接；
 * - 保留合法的叶子软链（如 `.venv/bin/python3 -> /usr/bin/python3`），并将指向旧 Devbox 工作区根路径（如 `/home/devbox/workspace/...`）的绝对软链自动重写到 `/workspace/...`。
 */
export function buildSafeUntarGzToWorkspaceCommand(params: {
  tarGzPath: string;
  targetMountPath?: string;
  oldWorkDirectory?: string;
}): string {
  const targetDir = params.targetMountPath ?? OPEN_SANDBOX_DEFAULT_ROOT_PATH;
  const oldWorkDir = params.oldWorkDirectory ?? '';
  const pythonExtractScript = [
    'import os, shutil, sys, tarfile',
    'tar_path, dest_root = sys.argv[1], os.path.realpath(sys.argv[2])',
    'old_root = sys.argv[3].rstrip("/") if len(sys.argv) > 3 and sys.argv[3] else ""',
    `blocked = ${PYTHON_BLOCKED_TOP_NAMES_EXPR}`,
    'def is_skipped(parts):',
    '    if not parts: return True',
    '    top = parts[0]',
    '    return top in blocked or top.startswith(".jfs")',
    'def assert_no_symlink_ancestors(parts, raw_name):',
    '    cur = dest_root',
    '    for seg in parts[:-1]:',
    '        cur = os.path.join(cur, seg)',
    '        if os.path.islink(cur):',
    '            raise RuntimeError(f"Refusing to extract through link directory: {raw_name}")',
    'link_entries = set()',
    'deferred_dir_modes = []',
    'with tarfile.open(tar_path, "r:gz") as tf:',
    '    members = tf.getmembers()',
    '    for m in members:',
    '        name = m.name.replace("\\\\", "/")',
    '        if name.startswith("/"): raise RuntimeError(f"Unsafe absolute tar entry: {name}")',
    '        parts = [p for p in name.split("/") if p and p != "."]',
    '        if any(p == ".." for p in parts): raise RuntimeError(f"Unsafe traversal tar entry: {name}")',
    '        if is_skipped(parts): continue',
    '        if not (m.isfile() or m.isdir() or m.issym() or m.islnk()):',
    '            raise RuntimeError(f"Unsupported special tar entry: {name}")',
    '        for idx in range(1, len(parts)):',
    '            if "/".join(parts[:idx]) in link_entries:',
    '                raise RuntimeError(f"Refusing to extract through link directory: {name}")',
    '        rel_path = "/".join(parts)',
    '        target = os.path.normpath(os.path.join(dest_root, rel_path))',
    '        if target != dest_root and not target.startswith(dest_root + os.sep):',
    '            raise RuntimeError(f"Tar entry escapes workspace: {name}")',
    '        if m.issym():',
    '            link_entries.add(rel_path)',
    '        elif m.islnk():',
    '            link_entries.add(rel_path)',
    '            link_name = m.linkname.replace("\\\\", "/")',
    '            if os.path.isabs(link_name): raise RuntimeError(f"Unsafe absolute link in tar: {name}")',
    '            link_parts = [p for p in link_name.split("/") if p and p != "."]',
    '            if not link_parts or any(p == ".." for p in link_parts):',
    '                raise RuntimeError(f"Link escapes workspace: {name}")',
    '            for idx in range(1, len(link_parts)):',
    '                if "/".join(link_parts[:idx]) in link_entries:',
    '                    raise RuntimeError(f"Refusing to extract through link directory: {name}")',
    '            resolved = os.path.normpath(os.path.join(dest_root, "/".join(link_parts)))',
    '            if resolved == dest_root or not resolved.startswith(dest_root + os.sep):',
    '                raise RuntimeError(f"Link escapes workspace: {name}")',
    '    for m in members:',
    '        name = m.name.replace("\\\\", "/")',
    '        parts = [p for p in name.split("/") if p and p != "."]',
    '        if is_skipped(parts): continue',
    '        assert_no_symlink_ancestors(parts, name)',
    '        target = os.path.normpath(os.path.join(dest_root, "/".join(parts)))',
    '        perm = (m.mode or 0) & 0o777',
    '        if m.isdir():',
    '            if os.path.islink(target):',
    '                raise RuntimeError(f"Refusing to overwrite symlink with directory: {name}")',
    '            os.makedirs(target, exist_ok=True)',
    '            if perm:',
    '                deferred_dir_modes.append((target, perm))',
    '            continue',
    '        os.makedirs(os.path.dirname(target), exist_ok=True)',
    '        if m.issym():',
    '            link_target = m.linkname',
    '            if old_root and old_root != dest_root and (link_target == old_root or link_target.startswith(old_root + "/")):',
    '                link_target = dest_root + link_target[len(old_root):]',
    '            if os.path.lexists(target): os.unlink(target)',
    '            os.symlink(link_target, target)',
    '            continue',
    '        if m.islnk():',
    '            link_parts = [p for p in m.linkname.replace("\\\\", "/").split("/") if p and p != "."]',
    '            assert_no_symlink_ancestors(link_parts, name)',
    '            link_src = os.path.normpath(os.path.join(dest_root, "/".join(link_parts)))',
    '            if os.path.lexists(target): os.unlink(target)',
    '            if os.path.islink(link_src):',
    '                os.symlink(os.readlink(link_src), target)',
    '            else:',
    '                os.link(link_src, target)',
    '            continue',
    '        if os.path.lexists(target): os.unlink(target)',
    '        src = tf.extractfile(m)',
    '        if src is None:',
    '            open(target, "wb").close()',
    '        else:',
    '            with src, open(target, "wb") as dst:',
    '                shutil.copyfileobj(src, dst)',
    '        if perm:',
    '            os.chmod(target, perm)',
    'for dir_path, dir_perm in sorted(deferred_dir_modes, key=lambda item: len(item[0]), reverse=True):',
    '    os.chmod(dir_path, dir_perm)'
  ].join('\n');

  return [
    'set -eu',
    `trap 'rm -f -- ${shellQuote(params.tarGzPath)}' EXIT`,
    buildClearWorkspaceTenantFilesCommand(targetDir),
    `python3 -c ${shellQuote(pythonExtractScript)} ${shellQuote(params.tarGzPath)} ${shellQuote(targetDir)} ${shellQuote(oldWorkDir)}`
  ].join('\n');
}
