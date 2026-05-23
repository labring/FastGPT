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
export function generateFrontmatter(name: string, description: string): string {
  const escapedName = escapeYaml(name);
  const escapedDescription = escapeYaml(description);

  return `---\nname: ${escapedName}\ndescription: ${escapedDescription}\n---`;
}

/**
 * 解析由本模板工具生成或兼容的简单 frontmatter。
 *
 * 这里只服务模板构造相关的轻量读取；导入/部署时的正式 SKILL.md 元数据解析
 * 仍应使用 `utils/skillMarkdown.ts`，避免业务校验规则分散。
 */
export function parseFrontmatter(content: string): {
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
export function escapeYaml(value: string): string {
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
export function unescapeYaml(value: string): string {
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
export function validateSkillName(name: string): boolean {
  if (name.length === 0 || name.length > 64) {
    return false;
  }

  if (!/^[a-z0-9-]+$/.test(name)) {
    return false;
  }

  if (name.startsWith('-') || name.endsWith('-')) {
    return false;
  }

  if (name.includes('--')) {
    return false;
  }

  return true;
}

/**
 * 将用户输入清洗成可用于 skill 包目录名的 kebab-case-ish 字符串。
 */
export function sanitizeSkillNameForFile(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

/**
 * 从 SKILL.md 内容里提取 name，缺少 frontmatter 时回退到首个一级标题。
 */
export function extractSkillNameFromSkillMd(content: string): string {
  try {
    const { name } = parseFrontmatter(content);
    return name;
  } catch {
    const headerMatch = content.match(/^#\s+(.+)$/m);
    return headerMatch ? sanitizeSkillNameForFile(headerMatch[1]) : 'unnamed-skill';
  }
}

/**
 * 从 SKILL.md 内容里提取 description，解析失败时返回空字符串。
 */
export function extractDescriptionFromSkillMd(content: string): string {
  try {
    const { description } = parseFrontmatter(content);
    return description;
  } catch {
    return '';
  }
}
