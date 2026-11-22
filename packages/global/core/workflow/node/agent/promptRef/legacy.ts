import { AppToolSourceEnum } from '../../../../app/tool/constants';
import { splitCombineToolId } from '../../../../app/tool/utils';
import {
  AGENT_PROMPT_REF_REGEXP,
  formatRefKey,
  parseV2RefKey,
  type AgentPromptRef
} from './protocol';

export type ParsedLegacyPromptRef = {
  kind: 'legacy';
  rawKey: string;
  /** 可无状态确定还原的旧格式（如 system:systemTool-x、teamId:tid:x、dataset_search、personal-id） */
  deterministicRef?: AgentPromptRef;
  /** 需目录消歧的裸键（如裸 24 位 ObjectId、极老裸插件名） */
  bareId?: string;
};

export type ParsedAgentPromptRef =
  | { kind: 'v2'; ref: AgentPromptRef; canonicalKey: string }
  | ParsedLegacyPromptRef
  | { kind: 'invalid'; rawKey: string; reason: string };

/** 仅历史无前缀裸名内置能力需要白名单；新增内置能力统一走 V2 builtin: 前缀。 */
const LEGACY_BUILTIN_ID_SET = new Set<string>(['dataset_search', 'read_files', 'agent_sandbox']);

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

/** 剥离历史插件 ID 前缀（systemTool-/community-/commercial-），直接复用 splitCombineToolId 口径。 */
export const stripLegacyPluginPrefix = (id: string): string => {
  if (!id.includes('-')) return id;

  try {
    const { source, pluginId } = splitCombineToolId(id);
    if (source === AppToolSourceEnum.systemTool || source === AppToolSourceEnum.commercial) {
      return pluginId;
    }
  } catch {
    // 非标准组合前缀保留原值（如裸自定义插件 ID 含连字符）
  }

  return id;
};

/**
 * 统一解析带历史前缀的工具 ID（commercial-/systemTool-/community-/personal-/mcp-/http-）。
 * 直接复用 splitCombineToolId，避免同一套前缀规则维护两份。
 */
export const parsePrefixedLegacyToolRef = (rawId: string): AgentPromptRef | null => {
  if (!rawId.includes('-')) return null;

  try {
    const { source, pluginId } = splitCombineToolId(rawId);
    if (!pluginId) return null;

    if (source === AppToolSourceEnum.systemTool) {
      return { type: 'plugin', source: 'system', id: pluginId };
    }
    if (source === AppToolSourceEnum.commercial) {
      return { type: 'plugin', source: 'commercial', id: pluginId };
    }
    if (
      source === AppToolSourceEnum.personal ||
      source === AppToolSourceEnum.mcp ||
      source === AppToolSourceEnum.http
    ) {
      return { type: 'app', source: 'team', id: pluginId };
    }
  } catch {
    // 非历史组合前缀交由上层按裸键或团队应用处理
  }

  return null;
};

/**
 * 独立旧格式解析器（存量退场后可整文件移除）。
 * - 能无状态确定来源与类型的旧键，直接还原为 deterministicRef；
 * - 裸 ObjectId / 极老裸插件名返回 bareId，交由 Registry 按目录消歧与冲突熔断。
 */
export const parseLegacyRefKey = (rawKey: string): ParsedLegacyPromptRef => {
  const trimmed = rawKey.trim();

  if (LEGACY_BUILTIN_ID_SET.has(trimmed)) {
    return {
      kind: 'legacy',
      rawKey: trimmed,
      deterministicRef: { type: 'builtin', id: trimmed }
    };
  }

  // 1. 团队隔离插件：teamId:<teamId>:<pluginId>
  const teamMatch = /^teamId:([^:]+):(.+)$/.exec(trimmed);
  if (teamMatch) {
    const id = stripLegacyPluginPrefix(teamMatch[2]);
    if (id) {
      return {
        kind: 'legacy',
        rawKey: trimmed,
        deterministicRef: { type: 'plugin', source: 'team', teamId: teamMatch[1], id }
      };
    }
  }

  // 2. 本地调试插件：debug:tmbId:<tmbId>:<pluginId>
  const debugMatch = /^debug:tmbId:([^:]+):(.+)$/.exec(trimmed);
  if (debugMatch) {
    const id = stripLegacyPluginPrefix(debugMatch[2]);
    if (id) {
      return {
        kind: 'legacy',
        rawKey: trimmed,
        deterministicRef: { type: 'plugin', source: 'debug', tmbId: debugMatch[1], id }
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
      deterministicRef: prefixedRef
    };
  }

  // 历史 getToolIdentityKey(id, undefined) 可能对裸 ObjectId 生成 system:<24hex>；按 bareId 交由目录消歧。
  if (hasSystemPrefix && inner) {
    if (OBJECT_ID_RE.test(inner)) {
      return { kind: 'legacy', rawKey: trimmed, bareId: inner };
    }
    return {
      kind: 'legacy',
      rawKey: trimmed,
      deterministicRef: { type: 'plugin', source: 'system', id: inner }
    };
  }

  // 4. 上下文相关的裸键（裸 24 位 appId/skillId 或极老裸插件名）
  return { kind: 'legacy', rawKey: trimmed, bareId: trimmed };
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

/** 判断任意引用（V2 或旧格式）是否为 builtin 类型。 */
export const isBuiltinPromptRefKey = (rawKey: string): boolean => {
  const v2Ref = parseV2RefKey(rawKey);
  if (v2Ref) return v2Ref.type === 'builtin';

  return parseLegacyRefKey(rawKey).deterministicRef?.type === 'builtin';
};

/** 检测提示词正文中是否残留本地调试插件引用（统一复用新旧解析入口，避免发布守卫与运行时分叉）。 */
export const hasDebugPromptRef = (text?: string | null): boolean => {
  if (!text) return false;

  for (const match of text.matchAll(AGENT_PROMPT_REF_REGEXP)) {
    const parsed = parseAgentPromptRefKey(match[1]);
    const ref =
      parsed.kind === 'v2'
        ? parsed.ref
        : parsed.kind === 'legacy'
          ? parsed.deterministicRef
          : undefined;
    if (ref?.type === 'plugin' && ref.source === 'debug') return true;
  }

  return false;
};

/**
 * 双向兼容还原：将结构化 V2 引用转为旧版 Tool API（如 getNewToolPreviewNode）所需的 { appId, source }。
 * builtin 与 skill 不走工具详情接口，返回 null。
 */
export const toLegacyToolLookup = (
  ref: AgentPromptRef
): { appId: string; source?: string } | null => {
  if (ref.type === 'builtin' || ref.type === 'skill') return null;
  if (ref.type === 'app') return { appId: ref.id };
  if (ref.source === 'system') return { appId: `systemTool-${ref.id}`, source: 'system' };
  if (ref.source === 'commercial') return { appId: `commercial-${ref.id}`, source: 'system' };
  if (ref.source === 'team') {
    return { appId: `systemTool-${ref.id}`, source: `teamId:${ref.teamId}` };
  }
  return { appId: `systemTool-${ref.id}`, source: `debug:tmbId:${ref.tmbId}` };
};
