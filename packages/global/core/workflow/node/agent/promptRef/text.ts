import { parseAgentPromptRefKey } from './legacy';
import type { ParsedAgentPromptRef } from './types';

/** 严格双层大括号提示词引用正则；绝不贪婪吞掉 JSON 末尾第 3 个 `}`。 */
export const AGENT_PROMPT_REF_REGEXP = /\{\{@([^@{}]+)@\}\}/g;

/** 生成标准提示词引用包装文本 `{{@key@}}`。 */
export const formatPromptRefToken = (key: string): string => `{{@${key}@}}`;

/** 提取提示词中的全部引用，并对每个 rawKey 执行新/旧解析。 */
export const extractAgentPromptRefs = (
  text: string
): Array<{ raw: string; rawKey: string; parsed: ParsedAgentPromptRef }> => {
  if (!text) return [];

  const results: Array<{ raw: string; rawKey: string; parsed: ParsedAgentPromptRef }> = [];

  for (const match of text.matchAll(AGENT_PROMPT_REF_REGEXP)) {
    const raw = match[0];
    const rawKey = match[1].trim();
    results.push({
      raw,
      rawKey,
      parsed: parseAgentPromptRefKey(rawKey)
    });
  }

  return results;
};

/** 清理提示词中的所有引用占位符（用于工作流导出脱敏）。 */
export const stripAgentPromptRefs = (text: string): string => {
  if (!text) return text;
  return text.replace(AGENT_PROMPT_REF_REGEXP, '');
};

/** 检测提示词正文中是否残留本地调试插件引用（同时覆盖 V2 与旧 debug:tmbId:* 格式）。 */
export const hasDebugPromptRef = (text?: string | null): boolean => {
  if (!text) return false;

  return extractAgentPromptRefs(text).some(({ parsed }) => {
    const ref =
      parsed.kind === 'v2'
        ? parsed.ref
        : parsed.kind === 'legacy'
          ? parsed.deterministicRef
          : undefined;
    return ref?.type === 'plugin' && ref.source === 'debug';
  });
};
