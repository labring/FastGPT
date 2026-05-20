import { AgentSkillCategoryEnum } from '@fastgpt/global/core/ai/skill/constants';

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

/**
 * 从 SKILL.md frontmatter 中提取 FastGPT skill 元数据。
 *
 * 这个函数只负责“解析与规范化”，不负责权限、存储、版本等业务动作。调用方拿到
 * error 时应中止导入/部署，避免不可用的 SKILL.md 进入对象存储或版本记录。
 */
export function extractSkillFromMarkdown(markdown: string): { skill: any; error?: string } {
  const { frontmatter, error } = parseSkillMarkdown(markdown);

  if (error) {
    return { skill: null, error };
  }

  if (!frontmatter.name) {
    return { skill: null, error: 'Frontmatter field "name" is required' };
  }

  if (!frontmatter.description) {
    return { skill: null, error: 'Frontmatter field "description" is required' };
  }

  // YAML 解析可能把纯数字 name 转成 number；校验前统一转成 string。
  const skillName = String(frontmatter.name);

  const nameRegex = /^[a-z0-9]([a-z0-9]|-(?!-))*[a-z0-9]$|^[a-z0-9]$/;
  if (!nameRegex.test(skillName)) {
    return {
      skill: null,
      error:
        'Name must contain only lowercase letters, numbers, and hyphens; cannot start/end with hyphen; no consecutive hyphens'
    };
  }

  if (skillName.length > 50) {
    return { skill: null, error: 'Name must be less than 50 characters' };
  }

  const description = frontmatter.description.slice(0, 500);
  const skill: any = {
    name: skillName,
    description,
    category: [AgentSkillCategoryEnum.other],
    config: {}
  };

  if (frontmatter.license) {
    skill.config.license = frontmatter.license;
  }

  if (frontmatter.compatibility) {
    skill.config.compatibility = frontmatter.compatibility;
  }

  if (frontmatter['allowed-tools']) {
    skill.config['allowed-tools'] = frontmatter['allowed-tools'];
  }

  if (frontmatter.metadata && typeof frontmatter.metadata === 'object') {
    const metadata = frontmatter.metadata as Record<string, any>;

    if (metadata.category) {
      if (Array.isArray(metadata.category)) {
        skill.category = metadata.category;
      } else if (typeof metadata.category === 'string') {
        skill.category = metadata.category.split(',').map((c) => c.trim());
      }

      const validCategories = Object.values(AgentSkillCategoryEnum);
      const invalidCategories = skill.category.filter(
        (c: string) => !validCategories.includes(c as AgentSkillCategoryEnum)
      );

      if (invalidCategories.length > 0) {
        skill.category = [AgentSkillCategoryEnum.other];
      }
    }

    for (const [key, value] of Object.entries(metadata)) {
      if (key !== 'category') {
        skill.config[key] = value;
      }
    }
  }

  return { skill };
}
