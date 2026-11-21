import type { AgentPromptRef } from './types';

const INVALID_REF_SEGMENT_RE = /[@{}\r\n]/;

/**
 * 按首个 `/` 拆分父级 ID 与子工具 ID，完整保留 childId 中的 `:` 与多级 `/`（如 `appId//api/v1/users`）。
 */
export const splitParentChildId = (id: string): { parentId: string; childId?: string } => {
  const slashIndex = id.indexOf('/');
  if (slashIndex <= 0 || slashIndex === id.length - 1) {
    return { parentId: id };
  }

  return {
    parentId: id.slice(0, slashIndex),
    childId: id.slice(slashIndex + 1)
  };
};

/** 将结构化 AgentPromptRef 序列化为唯一 V2 canonicalKey（不含 `{{@...@}}` 包装）。 */
export const formatRefKey = (ref: AgentPromptRef): string => {
  if (ref.type === 'builtin') {
    return `builtin:${ref.id}`;
  }
  if (ref.type === 'skill') {
    return `skill:${ref.source}:${ref.id}`;
  }
  if (ref.type === 'app') {
    return `app:team:${ref.id}`;
  }
  if (ref.source === 'team') {
    return `plugin:team:${ref.teamId}:${ref.id}`;
  }
  if (ref.source === 'debug') {
    return `plugin:debug:${ref.tmbId}:${ref.id}`;
  }
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
    const builtinId = restAfterType.trim();
    if (!builtinId || builtinId !== restAfterType) return null;
    return {
      type: 'builtin',
      id: builtinId
    };
  }

  const secondColon = restAfterType.indexOf(':');
  if (secondColon <= 0) return null;

  const source = restAfterType.slice(0, secondColon);
  const restAfterSource = restAfterType.slice(secondColon + 1);
  if (!restAfterSource) return null;

  if (type === 'plugin') {
    if (source === 'system' || source === 'commercial') {
      return {
        type: 'plugin',
        source,
        id: restAfterSource,
        ...splitParentChildId(restAfterSource)
      };
    }

    if (source === 'team' || source === 'debug') {
      const thirdColon = restAfterSource.indexOf(':');
      if (thirdColon <= 0) return null;
      const ownerId = restAfterSource.slice(0, thirdColon);
      const id = restAfterSource.slice(thirdColon + 1);
      if (!ownerId || !id || ownerId.includes('/')) return null;

      if (source === 'team') {
        return {
          type: 'plugin',
          source: 'team',
          teamId: ownerId,
          id,
          ...splitParentChildId(id)
        };
      }

      return {
        type: 'plugin',
        source: 'debug',
        tmbId: ownerId,
        id,
        ...splitParentChildId(id)
      };
    }

    return null;
  }

  if (type === 'skill') {
    if (source !== 'system' && source !== 'team') return null;
    return {
      type: 'skill',
      source,
      id: restAfterSource
    };
  }

  if (type === 'app') {
    if (source !== 'team') return null;
    return {
      type: 'app',
      source: 'team',
      id: restAfterSource,
      ...splitParentChildId(restAfterSource)
    };
  }

  return null;
};
