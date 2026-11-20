/**
 * Skill 入口（`SKILL.md`）扫描规则。
 *
 * 发布结构校验、版本元数据解析、打包入口保留校验与运行态 `find` 共用这套规则，
 * 避免「发布校验」与「运行时读取」对同一份包得出不同结果：
 *
 * - 递归匹配任意深度、大小写不敏感的 `SKILL.md` **文件**；
 * - 跳过 `RUNTIME_SKILL_SCAN_PRUNE_DIRS` 中的目录；
 * - 只按 `/` 切分路径并取最后一段判断文件名，**不把反斜杠当作目录分隔符**。
 *   Unix `unzip` 解包时会保留字面反斜杠，`notes\SKILL.md` 解包后仍然是一个普通文件名，
 *   因此发布侧必须与运行侧保持同一解释口径；
 * - 目录条目（即使名字是 `SKILL.md`）不算入口。
 */

/**
 * Skill 包扫描时跳过的目录名。
 *
 * 必须与运行态 `buildSkillInfoFindCommand()` 的 `find ... -prune` 列表保持一致。
 */
export const RUNTIME_SKILL_SCAN_PRUNE_DIRS = ['node_modules', '.venv', 'venv'] as const;

export type SkillScanEntry = {
  /** 归档中的原始条目路径。 */
  path: string;
  /** 是否为目录条目。 */
  isDir: boolean;
};

/**
 * 归一化扫描路径：只去掉 `./` 前缀，统一使用 `/` 作为发布侧已有的分隔符。
 *
 * 注意：**不转换反斜杠**。Unix `unzip` 不会把 `\` 当目录分隔符，转换后会让发布校验
 * 认可一个解包后不存在、运行时也扫不到的入口。
 */
export function normalizeSkillScanEntryPath(path: string): string {
  return path.replace(/^(?:\.\/)+/, '');
}

function hasPrunedSkillScanSegment(path: string): boolean {
  return path
    .split('/')
    .some((segment) => (RUNTIME_SKILL_SCAN_PRUNE_DIRS as readonly string[]).includes(segment));
}

/**
 * 判断一个条目是否是 `SKILL.md` 入口（大小写不敏感、任意深度）。
 *
 * 与运行态 `find ... -type f -iname "SKILL.md"` 一致：
 * - 目录条目直接排除；
 * - `node_modules/.venv/venv` 下的条目一律跳过；
 * - 只按 `/` 切分，最后一个路径段才是文件名。
 */
export function isSkillMdEntryPath(path: string, isDir = false): boolean {
  if (isDir) return false;

  const normalized = normalizeSkillScanEntryPath(path);
  if (!normalized || normalized.endsWith('/')) return false;
  if (hasPrunedSkillScanSegment(normalized)) return false;

  const segments = normalized.split('/');
  return segments[segments.length - 1].toLowerCase() === 'skill.md';
}

/**
 * 从归档条目列表中递归扫描出所有 `SKILL.md` 路径（已归一化、按字典序排序）。
 *
 * 这是发布校验与运行态元数据解析共用的唯一扫描规则；调用方需提供条目是否为目录。
 */
export function findSkillMdEntries(entries: readonly SkillScanEntry[]): string[] {
  return entries
    .filter((entry) => isSkillMdEntryPath(entry.path, entry.isDir))
    .map((entry) => normalizeSkillScanEntryPath(entry.path))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * 判断扫描路径是否是标准工作区入口 `skills/<name>/SKILL.md`（大小写不敏感、恰三段）。
 *
 * 这是「标准入口」的唯一判断处；版本元数据解析、打包保留检查和运行态扫描都必须复用它，
 * 避免三处各自维护同名谓词后规则漂移。
 * 标准入口存在时，更深层的 `SKILL.md`（如示例模板）视为资源文件，不注册为可执行 Skill。
 */
export function isStandardWorkspaceSkillEntryPath(path: string): boolean {
  const segments = normalizeSkillScanEntryPath(path).split('/');
  return (
    segments.length === 3 &&
    segments[0].toLowerCase() === 'skills' &&
    segments[2].toLowerCase() === 'skill.md'
  );
}

/**
 * 从一组包内相对路径中按「标准入口优先」选出实际入口。
 *
 * 发布元数据解析与打包保留检查共用这一函数：只要存在 `skills/<name>/SKILL.md`，
 * 就只保留标准入口（深层示例/资源不参与），否则保留全部路径。
 */
export function selectSkillEntryPaths(paths: readonly string[]): string[] {
  const standardPaths = paths.filter(isStandardWorkspaceSkillEntryPath);
  return standardPaths.length > 0 ? standardPaths : [...paths];
}

/**
 * 运行态按**已发布版本的入口契约**过滤单个扫描目录。
 *
 * 已发布版本在版本元数据中记录了 `runtimeSkills[].path`，运行态必须与发布时保持一致：
 * 只保留这些声明入口，避免发布时被判定为资源的深层示例在运行态重新出现。
 *
 * @param params.scanDirectory 版本包解压目录（`deployedSkillVersions[].targetDir`）
 * @param params.paths        该目录下 find 命中的 `SKILL.md` 绝对路径
 * @param params.declaredPaths 版本元数据声明的包内相对入口路径
 */
export function filterSkillScanPathsByDeclaredEntries(params: {
  scanDirectory: string;
  paths: readonly string[];
  declaredPaths: readonly string[];
}): string[] {
  const { scanDirectory, paths, declaredPaths } = params;
  const declared = new Set(declaredPaths.map((path) => normalizeSkillScanEntryPath(path)));
  return paths.filter((path) => declared.has(toRelativeScanPath(path, scanDirectory)));
}

/**
 * 归一化 `unzip -Z1` 展示文本中的路径。
 *
 * `unzip -Z1` 输出的是展示文本而不是原始字节：文件名里的换行/回车/制表符会被
 * 分别显示成 `^J`、`^M`、`^I`。打包保留检查用 `find -print0` 得到真实路径，
 * 比较前必须逐字符映射成同一表示，否则含控制字符的合法文件会被误判为
 * 「被打包规则剔除」。
 *
 * 注意：这些字符的入口会在正式发布前被明确拒绝（sandbox `unzip` 落盘时会改名），
 * 这里的映射是保留检查的防御性口径，不构成对这些路径的发布支持。
 */
export function normalizeArchiveListedEntryPath(path: string): string {
  return path.replace(/\n/g, '^J').replace(/\r/g, '^M').replace(/\t/g, '^I');
}

function normalizeScanDirectory(scanDirectory: string): string {
  const trimmed = scanDirectory.trim().replace(/\/+$/, '');
  return trimmed || '/';
}

/**
 * 把 find 命中的绝对路径转换为扫描根下的相对路径。
 *
 * 非版本目录需要在解析 `SKILL.md` 后判断是否为标准入口，因此该转换需要暴露给运行态。
 */
export function toRelativeScanPath(path: string, scanDirectory: string): string {
  const root = normalizeScanDirectory(scanDirectory);
  if (root === '/') return normalizeSkillScanEntryPath(path);
  const prefix = `${root}/`;
  // 不在扫描根下的路径保持原样，避免误命中标准入口规则。
  return path.startsWith(prefix) ? path.slice(prefix.length) : normalizeSkillScanEntryPath(path);
}
