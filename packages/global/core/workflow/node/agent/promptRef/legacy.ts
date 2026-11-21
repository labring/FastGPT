import { formatRefKey, parseV2RefKey, splitParentChildId } from './codec';
import type {
  AgentPromptRef,
  KnownBuiltinPromptRefId,
  ParsedAgentPromptRef,
  ParsedLegacyPromptRef
} from './types';

/** 仅历史无前缀裸名内置能力需要白名单；新增内置能力统一走 V2 builtin: 前缀。 */
const LEGACY_BUILTIN_ID_SET = new Set<string>([
  'dataset_search',
  'read_files',
  'agent_sandbox'
] satisfies KnownBuiltinPromptRefId[]);

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

/** 剥离历史插件 ID 前缀，保持与 splitCombineToolId 一致的语义。 */
export const stripLegacyPluginPrefix = (id: string): string => {
  if (id === 'commercial-dalle3') return 'dalle3';
  if (id.startsWith('systemTool-')) return id.slice('systemTool-'.length);
  if (id.startsWith('community-')) return id.slice('community-'.length);
  if (id.startsWith('commercial-')) return id.slice('commercial-'.length);
  return id;
};

/**
 * 统一解析带历史前缀的工具 ID（commercial-/systemTool-/community-/personal-/mcp-/http-）。
 * 由 parseLegacyRefKey 与 adapters.refFromTool 共享，避免同一套前缀规则维护两份。
 */
export const parsePrefixedLegacyToolRef = (
  rawId: string
): { ref: AgentPromptRef; allowLegacyToolsetSegmentFallback?: boolean } | null => {
  if (rawId === 'commercial-dalle3') {
    return {
      ref: {
        type: 'plugin',
        source: 'system',
        id: 'dalle3',
        parentId: 'dalle3'
      }
    };
  }

  if (rawId.startsWith('systemTool-') || rawId.startsWith('community-')) {
    const id = stripLegacyPluginPrefix(rawId);
    if (!id) return null;
    return {
      ref: {
        type: 'plugin',
        source: 'system',
        id,
        ...splitParentChildId(id)
      }
    };
  }

  if (rawId.startsWith('commercial-')) {
    const id = stripLegacyPluginPrefix(rawId);
    if (!id) return null;
    return {
      ref: {
        type: 'plugin',
        source: 'commercial',
        id,
        ...splitParentChildId(id)
      }
    };
  }

  if (rawId.startsWith('personal-')) {
    const id = rawId.slice('personal-'.length);
    if (!id) return null;
    return {
      ref: {
        type: 'app',
        source: 'team',
        id,
        ...splitParentChildId(id)
      }
    };
  }

  if (rawId.startsWith('mcp-') || rawId.startsWith('http-')) {
    const id = rawId.slice(rawId.indexOf('-') + 1);
    if (!id) return null;
    const { parentId, childId } = splitParentChildId(id);
    const allowLegacyToolsetSegmentFallback =
      rawId.startsWith('mcp-') &&
      Boolean(childId && childId.includes('/') && !childId.startsWith('/'));
    return {
      ...(allowLegacyToolsetSegmentFallback ? { allowLegacyToolsetSegmentFallback: true } : {}),
      ref: {
        type: 'app',
        source: 'team',
        id,
        parentId,
        ...(childId ? { childId } : {})
      }
    };
  }

  return null;
};

/**
 * 独立旧格式解析器（零 V2 耦合，存量退场后可整文件移除）。
 * - 能无状态确定来源与类型的旧键，直接还原为 deterministicRef；
 * - 裸 ObjectId / 极老裸插件名返回 bareId，交由 Registry 按目录消歧与冲突熔断。
 */
export const parseLegacyRefKey = (rawKey: string): ParsedLegacyPromptRef => {
  const trimmed = rawKey.trim();

  if (LEGACY_BUILTIN_ID_SET.has(trimmed)) {
    return {
      kind: 'legacy',
      rawKey: trimmed,
      deterministicRef: {
        type: 'builtin',
        id: trimmed
      }
    };
  }

  // 1. 团队隔离插件：teamId:<teamId>:<pluginId>
  const teamMatch = /^teamId:([^:]+):(.+)$/.exec(trimmed);
  if (teamMatch) {
    const teamId = teamMatch[1];
    const id = stripLegacyPluginPrefix(teamMatch[2]);
    if (id) {
      return {
        kind: 'legacy',
        rawKey: trimmed,
        deterministicRef: {
          type: 'plugin',
          source: 'team',
          teamId,
          id,
          ...splitParentChildId(id)
        }
      };
    }
  }

  // 2. 本地调试插件：debug:tmbId:<tmbId>:<pluginId>
  const debugMatch = /^debug:tmbId:([^:]+):(.+)$/.exec(trimmed);
  if (debugMatch) {
    const tmbId = debugMatch[1];
    const id = stripLegacyPluginPrefix(debugMatch[2]);
    if (id) {
      return {
        kind: 'legacy',
        rawKey: trimmed,
        deterministicRef: {
          type: 'plugin',
          source: 'debug',
          tmbId,
          id,
          ...splitParentChildId(id)
        }
      };
    }
  }

  // 3. system: 前缀或无前缀的组合旧工具 ID
  const hasSystemPrefix = trimmed.startsWith('system:');
  const inner = hasSystemPrefix ? trimmed.slice('system:'.length) : trimmed;

  const prefixedRef = parsePrefixedLegacyToolRef(inner);
  if (prefixedRef) {
    return {
      kind: 'legacy',
      rawKey: trimmed,
      ...(prefixedRef.allowLegacyToolsetSegmentFallback
        ? { allowLegacyToolsetSegmentFallback: true }
        : {}),
      deterministicRef: prefixedRef.ref
    };
  }

  // 历史 getToolIdentityKey(id, undefined) 可能对裸 ObjectId 生成 system:<24hex>；按 bareId 交由目录消歧。
  if (hasSystemPrefix && inner) {
    if (OBJECT_ID_RE.test(inner)) {
      return {
        kind: 'legacy',
        rawKey: trimmed,
        bareId: inner
      };
    }
    return {
      kind: 'legacy',
      rawKey: trimmed,
      deterministicRef: {
        type: 'plugin',
        source: 'system',
        id: inner,
        ...splitParentChildId(inner)
      }
    };
  }

  // 4. 上下文相关的裸键（裸 24 位 appId/skillId 或极老裸插件名）
  return {
    kind: 'legacy',
    rawKey: trimmed,
    bareId: trimmed
  };
};

/** 统一薄分发入口：优先调用纯 V2 解析，未命中再调用独立旧解析。 */
export const parseAgentPromptRefKey = (raw: string): ParsedAgentPromptRef => {
  const rawKey = raw.trim();
  if (!rawKey) {
    return { kind: 'invalid', rawKey, reason: 'empty' };
  }

  const v2Ref = parseV2RefKey(rawKey);
  if (v2Ref) {
    return {
      kind: 'v2',
      ref: v2Ref,
      canonicalKey: formatRefKey(v2Ref)
    };
  }

  return parseLegacyRefKey(rawKey);
};

/** 从结构化引用派生需要注册到 legacyMap 的裸键候选（不包含确定性前缀键，避免污染歧义表）。 */
export const deriveBareLegacyKeys = (ref: AgentPromptRef): string[] => {
  if (ref.type === 'builtin') return [];
  return [ref.id];
};

/**
 * 双向兼容还原：将结构化 V2 引用转为旧版 Tool API（如 getNewToolPreviewNode）所需的 { appId, source }。
 * builtin 与 skill 不走工具详情接口，返回 null。
 */
export const toLegacyToolLookup = (
  ref: AgentPromptRef
): { appId: string; source?: string } | null => {
  if (ref.type === 'builtin' || ref.type === 'skill') {
    return null;
  }

  if (ref.type === 'app') {
    return {
      appId: ref.id
    };
  }

  if (ref.source === 'system') {
    return {
      appId: `systemTool-${ref.id}`,
      source: 'system'
    };
  }

  if (ref.source === 'commercial') {
    return {
      appId: `commercial-${ref.id}`,
      source: 'system'
    };
  }

  if (ref.source === 'team') {
    return {
      appId: `systemTool-${ref.id}`,
      source: `teamId:${ref.teamId}`
    };
  }

  return {
    appId: `systemTool-${ref.id}`,
    source: `debug:tmbId:${ref.tmbId}`
  };
};
