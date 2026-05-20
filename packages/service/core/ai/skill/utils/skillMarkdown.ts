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
  let currentObj = result;
  const stack: { key: string; obj: Record<string, any> }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.endsWith(':')) {
      const key = trimmed.slice(0, -1).trim();
      currentObj[key] = {};
      stack.push({ key, obj: currentObj });
      currentObj = currentObj[key] as Record<string, any>;
      continue;
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (value.startsWith('"') || value.startsWith("'")) {
      currentObj[key] = value.slice(1, -1);
    } else if (value === 'true') {
      currentObj[key] = true;
    } else if (value === 'false') {
      currentObj[key] = false;
    } else if (!isNaN(Number(value)) && value !== '') {
      currentObj[key] = Number(value);
    } else if (value === 'null') {
      currentObj[key] = null;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      const arrayContent = value.slice(1, -1).trim();
      currentObj[key] = arrayContent
        ? arrayContent.split(',').map((item) => item.trim().replace(/["']/g, ''))
        : [];
    } else {
      currentObj[key] = value;
    }
  }

  return result;
}
