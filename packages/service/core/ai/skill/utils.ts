/**
 * Skill 纯工具统一出口。
 *
 * 这里只放无副作用的 SKILL.md 文本解析和模板拼装，不访问数据库、对象存储、sandbox 或 LLM。
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

/**
 * 轻量 frontmatter YAML 解析器。
 *
 * 这里只覆盖 SKILL.md 元数据当前需要的简单结构：`key: value`、布尔值、数字、
 * null、行内数组，以及 `metadata:` 这种对象字段。后续如果要支持完整 YAML，
 * 应该在这个文件里统一替换实现，避免解析规则分散在业务流程里。
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

    let parsedValue: any;
    if (value.startsWith('"') || value.startsWith("'")) {
      parsedValue = value.slice(1, -1);
    } else if (value === 'true') {
      parsedValue = true;
    } else if (value === 'false') {
      parsedValue = false;
    } else if (!isNaN(Number(value)) && value !== '') {
      parsedValue = Number(value);
    } else if (value === 'null') {
      parsedValue = null;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      const arrayContent = value.slice(1, -1).trim();
      parsedValue = arrayContent
        ? arrayContent.split(',').map((item) => item.trim().replace(/["']/g, ''))
        : [];
    } else {
      parsedValue = value;
    }

    currentObj[key] = parsedValue;
  }

  return result;
}

/* ==================== SKILL.md 模版生成 (原 skillMdTemplate.ts) ==================== */

export type BuildSkillMdParams = {
  name: string;
  description: string;
};

/**
 * 生成一个最小可用的 SKILL.md。
 *
 * 该模板只包含 frontmatter，不生成正文说明，主要用于没有 AI 辅助生成需求的
 * 初次创建流程。后续用户可在 edit sandbox 中继续补充正文和其他文件。
 */
export function buildSkillMd(params: BuildSkillMdParams): string {
  return generateFrontmatter(params.name, params.description);
}

/**
 * 生成 SKILL.md 所需的 YAML frontmatter。
 *
 * 当前只写入 name 和 description，保持创建阶段的默认包尽量轻量。
 */
function generateFrontmatter(name: string, description: string): string {
  const escapedName = escapeYaml(name);
  const escapedDescription = escapeYaml(description);

  return `---\nname: ${escapedName}\ndescription: ${escapedDescription}\n---`;
}

/**
 * 解析由本模板工具生成或兼容的简单 frontmatter。
 *
 * 这里只服务模板构造相关的轻量读取；导入/部署时的正式 SKILL.md 元数据解析
 * 仍应使用 `parseSkillMarkdown`，避免业务校验规则分散。
 */
function parseFrontmatter(content: string): {
  name: string;
  description: string;
  body: string;
} {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);

  if (!frontmatterMatch) {
    throw new Error('Invalid SKILL.md format: missing frontmatter');
  }

  const frontmatterText = frontmatterMatch[1];
  const body = frontmatterMatch[2];

  const nameMatch = frontmatterText.match(/^name:\s*(.+)$/m);
  const name = nameMatch ? unescapeYaml(nameMatch[1].trim()) : '';

  const descMatch = frontmatterText.match(/^description:\s*(.+)$/m);
  const description = descMatch ? unescapeYaml(descMatch[1].trim()) : '';

  return { name, description, body };
}

/**
 * 将字符串转成适合写入简单 YAML 标量的形式。
 */
function escapeYaml(value: string): string {
  if (value === '') {
    return '""';
  }

  const needsQuoting =
    /[:#{}\[\],&*?|<>!=~`@]/.test(value) ||
    /^[-?]/.test(value) ||
    value.includes('\n') ||
    value.includes('"') ||
    /^true$|^false$|^null$|^~$/i.test(value);

  if (!needsQuoting) {
    return value;
  }

  if (value.includes('\n')) {
    const lines = value.split('\n');
    return '|\n' + lines.map((line) => '  ' + line).join('\n');
  }

  const escaped = value.replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * 反解析 `escapeYaml` 支持的简单 quoted scalar。
 */
function unescapeYaml(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/\\'/g, "'");
  }
  return value;
}

/**
 * 校验 skill name 是否满足 Agent Skills 的 kebab-case 约束。
 */
function sanitizeSkillNameForFile(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

export function extractSkillNameFromSkillMd(content: string): string {
  try {
    const { name } = parseFrontmatter(content);
    return name;
  } catch {
    const headerMatch = content.match(/^#\s+(.+)$/m);
    return headerMatch ? sanitizeSkillNameForFile(headerMatch[1]) : 'unnamed-skill';
  }
}

/* ==================== Shell 安全辅助 (原 shell.ts) ==================== */

/**
 * 智能转义参数以防止 Shell 注入。
 */
export const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

/* ==================== 沙盒路径与命名清洗辅助 (自 runtime 移入) ==================== */

export const MAX_SKILL_DIRECTORY_NAME_LENGTH = 50;

const trimSandboxPathRight = (value: string) => (value === '/' ? '' : value.replace(/\/+$/, ''));

/**
 * 拼接沙盒路径。
 */
export const joinSandboxPath = (basePath: string, path: string): string =>
  `${trimSandboxPathRight(basePath)}/${path}`;

/**
 * 获取沙盒内 Skill 一级根目录。
 */
export const getSkillsRootPath = (workDirectory: string): string =>
  joinSandboxPath(workDirectory, 'projects');

/**
 * 安全地将用户命名的 Skill Name 转换为适合容器目录存储的合法目录名。
 */
export const getSafeSkillDirectoryName = (skillName: string): string => {
  const normalized = skillName
    .trim()
    // 1. 将空格和空白字符替换为中划线
    .replace(/\s+/g, '-')
    // 2. 只保留中文、英文、数字、中划线和下划线，其它所有非法/危险字符都替换为中划线
    .replace(/[^\w\u4e00-\u9fa5-]/g, '-')
    // 3. 将连续的多个中划线或下划线合并为单个
    .replace(/-+/g, '-')
    .replace(/_+/g, '_')
    // 4. 去除首尾的多余中划线/下划线
    .replace(/^[-_]|[-_]$/g, '')
    // 5. 限制长度在合理范围
    .slice(0, MAX_SKILL_DIRECTORY_NAME_LENGTH)
    .trim();

  // 6. 排除特殊目录名或为空、纯中/下划线的情况，使用安全回退值
  return normalized && normalized !== '.' && normalized !== '..' && !/^[-_]+$/.test(normalized)
    ? normalized
    : 'skill';
};

/**
 * 获取运行态沙盒下的 Skill 物理存储目标路径。
 */
export const getSkillTargetPath = ({
  workDirectory,
  skillId
}: {
  workDirectory: string;
  skillId: string;
}): string => joinSandboxPath(getSkillsRootPath(workDirectory), getSafeSkillDirectoryName(skillId));

export type GitignoreParsedResult = {
  customExcludes: string[];
  pruneClause: string;
};

/**
 * 解析多个 .gitignore 文件的内容，生成用于 JSZip/其它排除的 excludes 列表，
 * 以及专为 Linux find 命令优化的 -prune 子句（防 Shell 注入）。
 */
export function parseGitignoreRules(gitignoreContents: string[]): GitignoreParsedResult {
  const customExcludes: string[] = [];
  const pruneDirs: string[] = [];

  for (const content of gitignoreContents) {
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const pattern = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
      if (!pattern) continue;

      if (trimmed.endsWith('/') || !pattern.includes('.')) {
        customExcludes.push(`${pattern}/*`);
        customExcludes.push(`*/${pattern}/*`);
        customExcludes.push(pattern);
        customExcludes.push(`*/${pattern}`);
        pruneDirs.push(pattern);
      } else {
        customExcludes.push(pattern);
        customExcludes.push(`*/${pattern}`);
      }
    }
  }

  // 加上排重和过滤
  const uniqPruneDirs = Array.from(
    new Set(
      pruneDirs
        .map((p) => p.replace(/\/\*$/, '').replace(/^\*\//, ''))
        .filter((p) => p && !p.includes('*') && !p.includes('.'))
    )
  );

  const pruneClauses: string[] = [];
  for (const dirPattern of uniqPruneDirs) {
    const cleanPattern = dirPattern.replace(/^\/+|\/+$/g, '');
    if (!cleanPattern) continue;

    if (dirPattern.includes('/')) {
      const pathPattern = cleanPattern.startsWith('./') ? cleanPattern : `./${cleanPattern}`;
      pruneClauses.push(`-path ${shellQuote(pathPattern)}`);
    } else {
      pruneClauses.push(`-name ${shellQuote(cleanPattern)}`);
    }
  }

  const pruneClause = pruneClauses.length > 0 ? pruneClauses.join(' -o ') : '';

  return {
    customExcludes,
    pruneClause
  };
}
