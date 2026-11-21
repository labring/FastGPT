import { parseAgentPromptRefKey } from './legacy';
import type { ParsedAgentPromptRef } from './types';

/** 严格双层大括号提示词引用正则；绝不贪婪吞掉 JSON 末尾第 3 个 `}`。 */
export const AGENT_PROMPT_REF_REGEXP = /\{\{@([^@{}]+)@\}\}/g;

const PAIRED_DOUBLE_WRAP_REGEXP = /\{\{(\{\{@[^@{}]+@\}\})\}\}/g;

const MAX_UNWRAP_PASSES = 5;

/**
 * 查找编辑器中下一个完整的提示词引用实体范围：
 * 将成对外层 `{{...}}`（如 `{{{{@x@}}}}`）并入单个实体范围，
 * 同时保护非成对的 JSON 相邻大括号（如 `{"a":{"b":{{@x@}}}}`）。
 */
export const findAgentPromptRefEntityMatch = (
  text: string
): { start: number; end: number; raw: string; key: string } | null => {
  const regex = new RegExp(AGENT_PROMPT_REF_REGEXP.source);
  const match = regex.exec(text);
  if (!match) return null;

  let start = match.index;
  let end = start + match[0].length;
  for (let pass = 0; pass < MAX_UNWRAP_PASSES; pass++) {
    if (text.slice(start - 2, start) === '{{' && text.slice(end, end + 2) === '}}') {
      start -= 2;
      end += 2;
    } else {
      break;
    }
  }

  return {
    start,
    end,
    raw: text.slice(start, end),
    key: match[1]
  };
};

/**
 * 仅对称折叠成对多余包裹（如 `{{{{@x@}}}}` -> `{{@x@}}`），
 * 保护 JSON 场景 `{"tool": {{@x@}}}` 末尾的 3 个右括号不被破坏。
 */
export const normalizeDoubleWrappedRefs = (text: string): string => {
  let current = text;
  for (let pass = 0; pass < MAX_UNWRAP_PASSES; pass++) {
    const next = current.replace(PAIRED_DOUBLE_WRAP_REGEXP, '$1');
    if (next === current) break;
    current = next;
  }
  return current;
};

/** 生成标准提示词引用包装文本 `{{@key@}}`。 */
export const formatPromptRefToken = (key: string): string => `{{@${key}@}}`;

/** 提取提示词中的全部引用，并对每个 rawKey 执行新/旧解析。 */
export const extractAgentPromptRefs = (
  text: string
): Array<{ raw: string; rawKey: string; parsed: ParsedAgentPromptRef }> => {
  if (!text) return [];

  const normalized = normalizeDoubleWrappedRefs(text);
  const results: Array<{ raw: string; rawKey: string; parsed: ParsedAgentPromptRef }> = [];

  for (const match of normalized.matchAll(AGENT_PROMPT_REF_REGEXP)) {
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
  return normalizeDoubleWrappedRefs(text).replace(AGENT_PROMPT_REF_REGEXP, '');
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
