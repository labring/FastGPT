import { AgentSkillSourceEnum } from '../../../../ai/skill/constants';
import {
  getAgentToolSource,
  getSystemToolSetChildId,
  getToolIdentityKey,
  parseDebugToolSource,
  parseTeamPluginSource
} from '../../../../app/tool/utils';
import { FlowNodeTypeEnum } from '../../constant';
import type { NodeToolConfigType } from '../../../type/node';
import {
  AGENT_PROMPT_REF_REGEXP,
  formatRefKey,
  parseV2RefKey,
  type AgentPromptRef
} from './protocol';
import {
  parseAgentPromptRefKey,
  parsePrefixedLegacyToolRef,
  stripLegacyPluginPrefix,
  type ParsedAgentPromptRef,
  type ParsedLegacyPromptRef
} from './legacy';

export type PromptRefTool = {
  id?: string;
  pluginId?: string;
  flowNodeType?: FlowNodeTypeEnum;
  toolConfig?: NodeToolConfigType;
  source?: string;
};

export type AgentPromptRefEntry<TMeta = unknown> = {
  ref: AgentPromptRef;
  canonicalKey?: string;
  displayName: string;
  /** 历史 Skill 快照缺少 source 时标记为 true，允许按全局唯一 ObjectId 跨 system/team 命中。 */
  sourceInferred?: boolean;
  /**
   * 仅记录已保存历史工具的原始旧键（如 v4.14.8 三段式 `mcp-<appId>/<toolsetName>/<toolName>`），
   * 仅由 `resolveLegacy` 按原始键精确命中，绝不进入 `resolveV2`。
   */
  legacyExactKeys?: string[];
  meta: TMeta;
};

type NormalizedAgentPromptRefEntry<TMeta = unknown> = Omit<
  AgentPromptRefEntry<TMeta>,
  'canonicalKey'
> & {
  canonicalKey: string;
};

export type ResolvePromptRefResult<TMeta = unknown> =
  | {
      status: 'resolved';
      entry: NormalizedAgentPromptRefEntry<TMeta>;
      matchedBy: 'canonical' | 'deterministic_legacy' | 'legacy_lookup';
    }
  | {
      status: 'ambiguous';
      rawKey: string;
      candidates: NormalizedAgentPromptRefEntry<TMeta>[];
    }
  | {
      status: 'unresolved';
      rawKey: string;
      parsed: ParsedAgentPromptRef;
    };

/**
 * 前后端同构的 Agent 提示词引用不可变注册表。
 * - 构造期一次性建立 canonicalMap / legacyMap / ambiguousMap，运行期查询 O(1) 无副作用；
 * - 严格分离 resolveV2 与 resolveLegacy，避免新旧解析耦合与跨来源串源。
 */
export class AgentPromptRefRegistry<TMeta = unknown> {
  private readonly canonicalMap = new Map<string, NormalizedAgentPromptRefEntry<TMeta>>();
  private readonly legacyMap = new Map<string, NormalizedAgentPromptRefEntry<TMeta>>();
  private readonly legacyExactMap = new Map<string, NormalizedAgentPromptRefEntry<TMeta>>();
  private readonly ambiguousMap = new Map<string, NormalizedAgentPromptRefEntry<TMeta>[]>();
  private readonly inferredSkillIdMap = new Map<string, NormalizedAgentPromptRefEntry<TMeta>>();

  private constructor(entries: AgentPromptRefEntry<TMeta>[]) {
    for (const entry of entries) {
      const canonicalKey = entry.canonicalKey ?? formatRefKey(entry.ref);
      const normalized: NormalizedAgentPromptRefEntry<TMeta> = {
        ...entry,
        canonicalKey
      };

      if (!this.canonicalMap.has(canonicalKey)) {
        this.canonicalMap.set(canonicalKey, normalized);
      }

      if (entry.ref.type === 'skill' && entry.sourceInferred) {
        this.inferredSkillIdMap.set(entry.ref.id, normalized);
      }

      if (entry.legacyExactKeys?.length) {
        for (const legacyKey of entry.legacyExactKeys) {
          const trimmedLegacyKey = legacyKey.trim();
          if (trimmedLegacyKey && !this.legacyExactMap.has(trimmedLegacyKey)) {
            this.legacyExactMap.set(trimmedLegacyKey, normalized);
          }
        }
      }

      // 仅非 builtin 能力注册裸键；同名多来源自动移入 ambiguousMap 熔断。
      if (entry.ref.type !== 'builtin' && entry.ref.id) {
        const bareKey = entry.ref.id;
        const existingAmbiguous = this.ambiguousMap.get(bareKey);
        if (existingAmbiguous) {
          if (!existingAmbiguous.some((item) => item.canonicalKey === canonicalKey)) {
            existingAmbiguous.push(normalized);
          }
          continue;
        }

        const existing = this.legacyMap.get(bareKey);
        if (!existing) {
          this.legacyMap.set(bareKey, normalized);
          continue;
        }

        // ToolSet 展开多个子工具共享同一父级 canonicalKey 时视作同一引用，不触发假歧义。
        if (existing.canonicalKey !== canonicalKey) {
          this.legacyMap.delete(bareKey);
          this.ambiguousMap.set(bareKey, [existing, normalized]);
        }
      }
    }
  }

  static create<TMeta = unknown>(
    entries: AgentPromptRefEntry<TMeta>[]
  ): AgentPromptRefRegistry<TMeta> {
    return new AgentPromptRefRegistry(entries);
  }

  /** 返回去重后的全部规范化条目快照。 */
  entries(): NormalizedAgentPromptRefEntry<TMeta>[] {
    return Array.from(this.canonicalMap.values());
  }

  /** 纯 V2 查表：只查 canonicalMap（+无 source 旧 Skill 兜底），严禁降级查 legacyMap 防串源。 */
  private resolveV2(
    parsed: Extract<ParsedAgentPromptRef, { kind: 'v2' }>,
    rawKey: string
  ): ResolvePromptRefResult<TMeta> {
    const hit = this.canonicalMap.get(parsed.canonicalKey);
    if (hit) {
      return { status: 'resolved', entry: hit, matchedBy: 'canonical' };
    }

    if (parsed.ref.type === 'skill') {
      const inferred = this.inferredSkillIdMap.get(parsed.ref.id);
      if (inferred) {
        return { status: 'resolved', entry: inferred, matchedBy: 'canonical' };
      }
    }

    return { status: 'unresolved', rawKey: rawKey.trim(), parsed };
  }

  /** 纯旧格式查表：先按完整规范键匹配确定性旧键，再查冲突熔断表与裸键表。 */
  private resolveLegacy(parsed: ParsedLegacyPromptRef): ResolvePromptRefResult<TMeta> {
    if (parsed.deterministicRef) {
      const canonicalKey = formatRefKey(parsed.deterministicRef);
      const hit = this.canonicalMap.get(canonicalKey) ?? this.legacyExactMap.get(parsed.rawKey);
      if (hit) {
        return { status: 'resolved', entry: hit, matchedBy: 'deterministic_legacy' };
      }
      return { status: 'unresolved', rawKey: parsed.rawKey, parsed };
    }

    if (parsed.bareId) {
      const ambiguousCandidates = this.ambiguousMap.get(parsed.bareId);
      if (ambiguousCandidates) {
        return { status: 'ambiguous', rawKey: parsed.bareId, candidates: ambiguousCandidates };
      }

      const hit = this.legacyMap.get(parsed.bareId);
      if (hit) {
        return { status: 'resolved', entry: hit, matchedBy: 'legacy_lookup' };
      }
    }

    return { status: 'unresolved', rawKey: parsed.rawKey, parsed };
  }

  /** 统一薄路由入口：先走纯 V2 解析与查表，未命中 V2 语法再走独立旧链路。 */
  resolve(rawKey: string): ResolvePromptRefResult<TMeta> {
    const parsed = parseAgentPromptRefKey(rawKey);
    if (parsed.kind === 'invalid') {
      return { status: 'unresolved', rawKey: parsed.rawKey, parsed };
    }
    return parsed.kind === 'v2' ? this.resolveV2(parsed, rawKey) : this.resolveLegacy(parsed);
  }

  /** 逐个解析标准引用，替换为模型可读的 `{{displayName}}`。 */
  renderForModel({
    text,
    formatResolved,
    onAmbiguous
  }: {
    text: string;
    formatResolved?: (entry: NormalizedAgentPromptRefEntry<TMeta>, raw: string) => string;
    onAmbiguous?: (rawKey: string, candidates: NormalizedAgentPromptRefEntry<TMeta>[]) => void;
  }): string {
    if (!text) return text;

    return text.replace(AGENT_PROMPT_REF_REGEXP, (raw, innerKey: string) => {
      const result = this.resolve(innerKey);
      if (result.status === 'resolved') {
        return formatResolved
          ? formatResolved(result.entry, raw)
          : `{{${result.entry.displayName}}}`;
      }

      if (result.status === 'ambiguous') {
        onAmbiguous?.(result.rawKey, result.candidates);
      }

      return raw;
    });
  }
}

/* ===== 领域适配器（工具 / 技能 / 内置能力 → AgentPromptRef） ===== */

/** 构造内置能力的 V2 引用对象。 */
export const refFromBuiltin = (id: string): AgentPromptRef => ({
  type: 'builtin',
  id: id.trim()
});

/** 构造 Skill 的 V2 引用对象；若历史快照缺少 source，则标记 sourceInferred 以支持跨 source 兜底匹配。 */
export const refFromSkill = ({
  skillId,
  source
}: {
  skillId: string;
  source?: AgentSkillSourceEnum | 'system' | 'team' | 'personal';
}): { ref: AgentPromptRef; sourceInferred: boolean } => ({
  ref: {
    type: 'skill',
    source: source === AgentSkillSourceEnum.system ? 'system' : 'team',
    id: skillId.trim()
  },
  sourceInferred: !source
});

/**
 * 解析工具在提示词引用中的规范 ID：
 * 非工具集的单 MCP/HTTP 子工具优先取实际加载出的 toolConfig.*.toolId，
 * 保证前端编辑器与后端运行时在历史候选回退后登记完全一致的引用身份。
 */
export const getPromptRefToolId = ({
  id,
  pluginId,
  flowNodeType,
  toolConfig
}: PromptRefTool): string => {
  if (flowNodeType !== FlowNodeTypeEnum.toolSet) {
    const resolvedChildId =
      (toolConfig?.mcpTool && 'toolId' in toolConfig.mcpTool
        ? toolConfig.mcpTool.toolId
        : undefined) ||
      (toolConfig?.httpTool && 'toolId' in toolConfig.httpTool
        ? toolConfig.httpTool.toolId
        : undefined);
    if (resolvedChildId) return resolvedChildId;
  }

  return pluginId || id || '';
};

const refFromToolId = (rawId: string, source?: string): AgentPromptRef | null => {
  if (!rawId) return null;

  const directV2 = parseV2RefKey(rawId);
  if (directV2) return directV2;

  const teamSource = parseTeamPluginSource(source);
  if (teamSource) {
    const cleanId = stripLegacyPluginPrefix(rawId);
    return cleanId
      ? { type: 'plugin', source: 'team', teamId: teamSource.teamId, id: cleanId }
      : null;
  }

  const debugSource = parseDebugToolSource(source);
  if (debugSource) {
    const cleanId = stripLegacyPluginPrefix(rawId);
    return cleanId
      ? { type: 'plugin', source: 'debug', tmbId: debugSource.tmbId, id: cleanId }
      : null;
  }

  const prefixedRef = parsePrefixedLegacyToolRef(rawId);
  if (prefixedRef) return prefixedRef;

  if (source === 'system') {
    return { type: 'plugin', source: 'system', id: rawId };
  }

  // 无前缀且无 plugin source 时默认属于团队应用（工作流 / MCP / HTTP 工具集）
  return { type: 'app', source: 'team', id: rawId };
};

/** 从实际工具 ID 和有效来源构造 V2 引用。 */
export const refFromTool = (tool: PromptRefTool): AgentPromptRef | null =>
  refFromToolId(getPromptRefToolId(tool).trim(), getAgentToolSource(tool));

/** 为编辑器和运行时登记实际工具身份，旧保存 ID 仅作为精确旧别名。 */
export const getToolPromptReference = (tool: PromptRefTool) => {
  const savedId = (tool.pluginId || tool.id || '').trim();
  const resolvedId = getPromptRefToolId(tool).trim();
  const ref = refFromToolId(resolvedId, getAgentToolSource(tool));
  if (!ref) return;

  return savedId && savedId !== resolvedId ? { ref, legacyExactKeys: [savedId] } : { ref };
};

/** 从工具集配置中展开全部子工具的原始 ID、展示名与 V2 引用，避免前后端重复拼接子工具规则。 */
export const getToolSetChildPromptRefs = (
  tool: PromptRefTool
): Array<{ rawId: string; name: string; ref: AgentPromptRef }> => {
  const specs: Array<{ rawId: string; name: string }> = [];

  const systemToolList = tool.toolConfig?.systemToolSet?.toolList;
  if (systemToolList?.length) {
    const parentToolId = tool.toolConfig?.systemToolSet?.toolId || tool.pluginId || tool.id || '';
    if (parentToolId) {
      systemToolList.forEach((child) => {
        specs.push({
          rawId: getSystemToolSetChildId(parentToolId, child.toolId),
          name: child.name || child.toolId
        });
      });
    }
  }

  const mcpToolSet = tool.toolConfig?.mcpToolSet;
  if (mcpToolSet?.toolList?.length) {
    const parentAppId =
      ('toolId' in mcpToolSet ? mcpToolSet.toolId : undefined) || tool.pluginId || tool.id || '';
    if (parentAppId) {
      mcpToolSet.toolList.forEach((child) => {
        specs.push({ rawId: `mcp-${parentAppId}/${child.name}`, name: child.name });
      });
    }
  }

  const httpToolSet = tool.toolConfig?.httpToolSet;
  if (httpToolSet?.toolList?.length) {
    const parentAppId =
      ('toolId' in httpToolSet ? httpToolSet.toolId : undefined) || tool.pluginId || tool.id || '';
    if (parentAppId) {
      httpToolSet.toolList.forEach((child) => {
        specs.push({ rawId: `http-${parentAppId}/${child.name}`, name: child.name });
      });
    }
  }

  const source = getAgentToolSource(tool);
  return specs.flatMap(({ rawId, name }) => {
    const ref = refFromTool({ id: rawId, source });
    return ref ? [{ rawId, name, ref }] : [];
  });
};

/** 从工具对象直接生成标准 V2 canonicalKey；无法识别时返回空字符串。 */
export const getCanonicalKeyForTool = (params: PromptRefTool): string => {
  const ref = refFromTool(params);
  return ref ? formatRefKey(ref) : '';
};

/**
 * 计算工具的规范身份键，供工具列表去重、增删、选中态与预览复用统一口径。
 * 优先使用 V2 canonicalKey（自动归一化隐式 toolConfig.source 与已解析的单子工具 toolId），
 * 无法解析为 V2 键时回退到 source-aware 组合键。
 */
export const getAgentToolIdentityKey = (tool: PromptRefTool): string =>
  getCanonicalKeyForTool(tool) ||
  getToolIdentityKey(getPromptRefToolId(tool).trim(), getAgentToolSource(tool));
