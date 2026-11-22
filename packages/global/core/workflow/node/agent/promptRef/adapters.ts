import {
  getAgentToolSource,
  getToolIdentityKey,
  parseDebugToolSource,
  parseTeamPluginSource
} from '../../../../app/tool/utils';
import { AgentSkillSourceEnum } from '../../../../ai/skill/constants';
import { FlowNodeTypeEnum } from '../../constant';
import type { NodeToolConfigType } from '../../../type/node';
import { formatRefKey, parseV2RefKey, splitParentChildId } from './codec';
import { parseLegacyRefKey, parsePrefixedLegacyToolRef, stripLegacyPluginPrefix } from './legacy';
import type { AgentPromptRef } from './types';

type PromptRefTool = {
  id?: string;
  pluginId?: string;
  flowNodeType?: FlowNodeTypeEnum;
  toolConfig?: NodeToolConfigType;
  source?: string;
};

/** 将 Skill 的业务 source（system / personal）归一为提示词引用协议 source（system / team）。 */
const normalizeSkillPromptRefSource = (
  source?: AgentSkillSourceEnum | 'system' | 'team' | 'personal'
): 'system' | 'team' => (source === AgentSkillSourceEnum.system ? 'system' : 'team');

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
    source: normalizeSkillPromptRefSource(source),
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
    if (!cleanId) return null;
    return {
      type: 'plugin',
      source: 'team',
      teamId: teamSource.teamId,
      id: cleanId,
      ...splitParentChildId(cleanId)
    };
  }

  const debugSource = parseDebugToolSource(source);
  if (debugSource) {
    const cleanId = stripLegacyPluginPrefix(rawId);
    if (!cleanId) return null;
    return {
      type: 'plugin',
      source: 'debug',
      tmbId: debugSource.tmbId,
      id: cleanId,
      ...splitParentChildId(cleanId)
    };
  }

  const prefixedRef = parsePrefixedLegacyToolRef(rawId);
  if (prefixedRef) return prefixedRef;

  if (source === 'system') {
    return {
      type: 'plugin',
      source: 'system',
      id: rawId,
      ...splitParentChildId(rawId)
    };
  }

  // 无前缀且无 plugin source 时默认属于团队应用（工作流 / MCP / HTTP 工具集）
  return {
    type: 'app',
    source: 'team',
    id: rawId,
    ...splitParentChildId(rawId)
  };
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

/** 判断任意工具引用（V2 或旧格式）是否为 builtin 类型。 */
export const isBuiltinPromptRefKey = (rawKey: string): boolean => {
  const v2Ref = parseV2RefKey(rawKey);
  if (v2Ref) return v2Ref.type === 'builtin';

  const legacy = parseLegacyRefKey(rawKey);
  return legacy.deterministicRef?.type === 'builtin';
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
