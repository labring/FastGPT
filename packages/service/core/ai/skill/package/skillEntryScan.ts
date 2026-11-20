/**
 * Skill 入口（`SKILL.md`）扫描规则。
 *
 * 发布结构校验、版本元数据解析与运行态 `find` 共用这套规则，
 * 避免发布校验与运行时读取对同一份包得出不同结果：
 *
 * - 递归匹配任意深度、大小写不敏感的 `SKILL.md` 文件；
 * - 跳过 `RUNTIME_SKILL_SCAN_PRUNE_DIRS` 中的目录；
 * - 只按 `/` 切分路径并取最后一段判断文件名，不把反斜杠当作目录分隔符。
 *   Unix `unzip` 解包时会保留字面反斜杠，`notes\SKILL.md` 解包后仍然是一个普通文件名，
 *   因此发布侧必须与运行侧保持同一解释口径；
 * - 目录条目（即使名字是 `SKILL.md`）不算入口。
 */

/**
 * Skill 包扫描时跳过的目录名。
 *
 * 与运行态 `buildSkillInfoFindCommand()` 的 `find ... -prune` 列表同源。
 */
export const RUNTIME_SKILL_SCAN_PRUNE_DIRS = ['node_modules', '.venv', 'venv'] as const;

export type SkillScanEntry = {
  /** 归档中的原始条目路径。 */
  path: string;
  /** 是否为目录条目。 */
  isDir: boolean;
};

/**
 * 归一化扫描路径：只去掉开头的 `./` 前缀。
 *
 * 注意不转换反斜杠：Unix `unzip` 不会把 `\` 当目录分隔符，转换后会让发布校验
 * 认可一个解包后不存在、运行时也扫不到的入口。
 */
export function normalizeSkillScanEntryPath(path: string): string {
  return path.replace(/^(?:\.\/)+/, '');
}

/**
 * 判断一个条目是否是 `SKILL.md` 文件入口（大小写不敏感、任意深度）。
 *
 * 与运行态 `find ... -type f -iname "SKILL.md"` 一致：
 * - 目录条目直接排除；
 * - `node_modules`、`.venv`、`venv` 下的条目一律跳过；
 * - 只按 `/` 切分，最后一个路径段才是文件名。
 */
export function isSkillMdEntryPath(path: string, isDir = false): boolean {
  if (isDir) return false;

  const normalized = normalizeSkillScanEntryPath(path);
  if (!normalized || normalized.endsWith('/')) return false;

  const segments = normalized.split('/');
  // 任意路径段命中排除目录即跳过，与运行态 `find ... -prune` 行为一致。
  if (
    segments.some((segment) =>
      (RUNTIME_SKILL_SCAN_PRUNE_DIRS as readonly string[]).includes(segment)
    )
  ) {
    return false;
  }

  return segments[segments.length - 1].toLowerCase() === 'skill.md';
}

/**
 * 从归档条目列表中递归扫描出所有 `SKILL.md` 文件路径（已归一化、去重并按字典序排序）。
 *
 * 这是发布校验与运行态元数据解析共用的唯一扫描规则；调用方需提供条目是否为目录。
 */
export function findSkillMdEntries(entries: readonly SkillScanEntry[]): string[] {
  return Array.from(
    new Set(
      entries
        .filter((entry) => isSkillMdEntryPath(entry.path, entry.isDir))
        .map((entry) => normalizeSkillScanEntryPath(entry.path))
    )
  ).sort((a, b) => a.localeCompare(b));
}
