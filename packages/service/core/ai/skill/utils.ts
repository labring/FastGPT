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
