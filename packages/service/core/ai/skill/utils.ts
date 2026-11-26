/**
 * Skill 纯工具统一出口。
 *
 * 这里只放无副作用的 SKILL.md 文本解析与入口扫描规则，不访问数据库、对象存储、sandbox 或 LLM。
 */

/* ==================== YAML Frontmatter 解析 (原 skillMarkdown.ts) ==================== */

/**
 * 解析 SKILL.md 的 YAML frontmatter，并返回 frontmatter 与正文内容。
 *
 * FastGPT 当前只依赖简单的 frontmatter 字段，因此这里使用轻量解析器处理常见
 * key/value、数组和一层对象。复杂 YAML 语法如果解析失败，会通过 error 返回给调用方。
 */
export function parseSkillMarkdown(markdown: string): {
  frontmatter: Record<string, any>;
  content: string;
  error?: string;
} {
  const frontmatterRegex = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/;
  const match = markdown.match(frontmatterRegex);

  if (!match) {
    return {
      frontmatter: {},
      content: markdown,
      error: 'SKILL.md must contain YAML frontmatter (delimited by ---)'
    };
  }

  const yamlContent = match[1];
  const bodyContent = match[2] ?? '';

  try {
    const frontmatter = parseYamlFrontmatter(yamlContent);
    return {
      frontmatter,
      content: bodyContent
    };
  } catch (error: any) {
    return {
      frontmatter: {},
      content: markdown,
      error: `Failed to parse frontmatter: ${error.message}`
    };
  }
}

export type ParsedSkillMetadataResult =
  | {
      valid: true;
      name: string;
      description: string;
    }
  | {
      valid: false;
      error: string;
    };

/**
 * 从 SKILL.md 文本中提取运行态所需的元数据（name、description）。
 *
 * 发布元数据解析与运行态 sandbox 扫描共用这套口径：必须存在合法 frontmatter 且
 * `name` 为非空字符串；`description` 为可选字符串，缺省回退为空串。
 */
export function extractSkillMetadataFromMarkdown(markdown: string): ParsedSkillMetadataResult {
  const { frontmatter, error } = parseSkillMarkdown(markdown);
  if (error) {
    return { valid: false, error };
  }

  const name = typeof frontmatter.name === 'string' ? frontmatter.name.trim() : '';
  if (!name) {
    return { valid: false, error: 'frontmatter name is required' };
  }

  return {
    valid: true,
    name,
    description: typeof frontmatter.description === 'string' ? frontmatter.description.trim() : ''
  };
}

/**
 * 轻量 frontmatter YAML 解析器。
 *
 * 这里只覆盖 SKILL.md 元数据当前需要的简单结构：`key: value` 和一层对象字段。
 * 所有标量值都按文本保留，不做 YAML 的数字、布尔值、null 或行内数组类型推断。
 * 后续如果要支持完整 YAML，应该在这个文件里统一替换实现，避免解析规则分散在业务流程里。
 */
function parseYamlFrontmatter(yaml: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yaml.split('\n');

  const stack: { indent: number; obj: Record<string, any> }[] = [];
  let currentObj = result;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const matchIndent = line.match(/^(\s*)/);
    const indent = matchIndent ? matchIndent[1].length : 0;

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    currentObj = stack.length > 0 ? stack[stack.length - 1].obj : result;

    if (trimmed.endsWith(':')) {
      const key = trimmed.slice(0, -1).trim();
      const newObj: Record<string, any> = {};
      currentObj[key] = newObj;
      stack.push({ indent, obj: newObj });
      currentObj = newObj;
      continue;
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    currentObj[key] = value;
  }

  return result;
}

/* ==================== Skill 入口扫描规则 ==================== */

/**
 * Skill 包扫描时跳过的目录名。
 *
 * 与运行态 `find ... -prune` 列表同源，避免发布校验与运行态扫描口径漂移。
 */
export const RUNTIME_SKILL_SCAN_PRUNE_DIRS = ['node_modules', '.venv', 'venv'] as const;

export type SkillScanEntry = {
  /** 归档中的原始条目路径。 */
  path: string;
  /** 是否为目录条目。 */
  isDir: boolean;
};

/**
 * 从归档条目列表中递归扫描出所有 `SKILL.md` 文件条目（路径已归一化、去重并按字典序排序）。
 *
 * 发布结构校验、版本元数据解析与运行态 `find` 共用这套规则：
 * - 递归匹配任意深度、大小写不敏感的 `SKILL.md` 文件；
 * - 跳过 `RUNTIME_SKILL_SCAN_PRUNE_DIRS` 中的目录；
 * - 只去除开头的 `./` 前缀且只按 `/` 切分路径（Unix `unzip` 保留字面反斜杠，不转换 `\`）；
 * - 目录条目（即使名字是 `SKILL.md`）不算入口；
 * - 透传调用方附带的扩展字段，避免外部二次建索引。
 */
export function findSkillMdEntries<T extends SkillScanEntry>(
  entries: readonly T[]
): Array<T & { path: string }> {
  const deduped = new Map<string, T & { path: string }>();

  for (const entry of entries) {
    if (entry.isDir) continue;

    const normalized = entry.path.replace(/^(?:\.\/)+/, '');
    if (!normalized || normalized.endsWith('/')) continue;

    const segments = normalized.split('/');
    // 任意路径段命中排除目录即跳过，与运行态 `find ... -prune` 行为一致。
    if (
      segments.some((segment) =>
        (RUNTIME_SKILL_SCAN_PRUNE_DIRS as readonly string[]).includes(segment)
      )
    ) {
      continue;
    }

    if (segments[segments.length - 1].toLowerCase() !== 'skill.md') continue;

    if (!deduped.has(normalized)) {
      deduped.set(normalized, { ...entry, path: normalized });
    }
  }

  return Array.from(deduped.values()).sort((a, b) => a.path.localeCompare(b.path));
}
