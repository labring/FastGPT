/**
 * Agent 提示词引用 V2 协议原语（最底层，零业务依赖）。
 * - builtin.id 保持开放 string 以保证跨版本前向兼容；
 * - plugin.id 恒存纯净 pluginId（不含 systemTool- / commercial- 等历史前缀）。
 */
export type AgentPromptRef =
  | { type: 'builtin'; id: string }
  | { type: 'plugin'; source: 'system'; id: string }
  | { type: 'plugin'; source: 'commercial'; id: string }
  | { type: 'plugin'; source: 'team'; teamId: string; id: string }
  | { type: 'plugin'; source: 'debug'; tmbId: string; id: string }
  | { type: 'skill'; source: 'system' | 'team'; id: string }
  | { type: 'app'; source: 'team'; id: string };

const INVALID_REF_SEGMENT_RE = /[@{}\r\n]/;
const LEGACY_DEBUG_REF_RE = /^debug:tmbId:[^:]+:.+$/;

/** 只匹配双花括号开头且不跨行，保留 JSON 中紧邻引用的闭合括号并防止跨行误匹配。 */
export const AGENT_PROMPT_REF_REGEXP = /(?<!\{)\{\{@([^@{}\r\n]+)@\}\}/g;

/** 生成标准提示词引用包装文本 `{{@key@}}`。 */
export const formatPromptRefToken = (key: string): string => `{{@${key}@}}`;

/** 将结构化 AgentPromptRef 序列化为唯一 V2 canonicalKey（不含 `{{@...@}}` 包装）。 */
export const formatRefKey = (ref: AgentPromptRef): string => {
  if (ref.type === 'builtin') return `builtin:${ref.id}`;
  if (ref.type === 'skill') return `skill:${ref.source}:${ref.id}`;
  if (ref.type === 'app') return `app:team:${ref.id}`;
  if (ref.source === 'team') return `plugin:team:${ref.teamId}:${ref.id}`;
  if (ref.source === 'debug') return `plugin:debug:${ref.tmbId}:${ref.id}`;
  return `plugin:${ref.source}:${ref.id}`;
};

/**
 * 纯 V2 严格解析器（零 legacy 逻辑）。
 * 按类型定长切分冒号，防止 MCP/HTTP 子工具名中的 `:` 破坏解析。
 */
export const parseV2RefKey = (rawKey: string): AgentPromptRef | null => {
  const trimmed = rawKey.trim();
  if (!trimmed || INVALID_REF_SEGMENT_RE.test(trimmed)) return null;

  const firstColon = trimmed.indexOf(':');
  if (firstColon <= 0) return null;

  const type = trimmed.slice(0, firstColon);
  const restAfterType = trimmed.slice(firstColon + 1);
  if (!restAfterType) return null;

  if (type === 'builtin') {
    return restAfterType === restAfterType.trim() ? { type: 'builtin', id: restAfterType } : null;
  }

  const secondColon = restAfterType.indexOf(':');
  if (secondColon <= 0) return null;

  const source = restAfterType.slice(0, secondColon);
  const restAfterSource = restAfterType.slice(secondColon + 1);
  if (!restAfterSource) return null;

  if (type === 'plugin') {
    if (source === 'system' || source === 'commercial') {
      return { type: 'plugin', source, id: restAfterSource };
    }

    if (source === 'team' || source === 'debug') {
      const thirdColon = restAfterSource.indexOf(':');
      if (thirdColon <= 0) return null;
      const ownerId = restAfterSource.slice(0, thirdColon);
      const id = restAfterSource.slice(thirdColon + 1);
      if (!ownerId || !id || ownerId.includes('/')) return null;

      return source === 'team'
        ? { type: 'plugin', source: 'team', teamId: ownerId, id }
        : { type: 'plugin', source: 'debug', tmbId: ownerId, id };
    }

    return null;
  }

  if (type === 'skill') {
    return source === 'system' || source === 'team'
      ? { type: 'skill', source, id: restAfterSource }
      : null;
  }

  if (type === 'app') {
    return source === 'team' ? { type: 'app', source: 'team', id: restAfterSource } : null;
  }

  return null;
};

/** 清理提示词中的所有引用占位符（用于工作流导出脱敏）。 */
export const stripAgentPromptRefs = (text: string): string => {
  if (!text) return text;
  return text.replace(AGENT_PROMPT_REF_REGEXP, '');
};

/** 检测提示词正文中是否残留本地调试插件引用（同时覆盖 V2 与旧 debug:tmbId:* 格式）。 */
export const hasDebugPromptRef = (text?: string | null): boolean => {
  if (!text) return false;

  for (const match of text.matchAll(AGENT_PROMPT_REF_REGEXP)) {
    const rawKey = match[1].trim();
    const v2Ref = parseV2RefKey(rawKey);
    if (v2Ref?.type === 'plugin' && v2Ref.source === 'debug') return true;
    // 兼容历史 debug:tmbId:<tmbId>:<pluginId> 提示词引用，存量退场后可移除。
    if (!v2Ref && LEGACY_DEBUG_REF_RE.test(rawKey)) return true;
  }

  return false;
};
