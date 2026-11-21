import { parseDebugToolSource, parseTeamPluginSource } from '../../../../app/tool/utils';
import { AgentSkillSourceEnum } from '../../../../ai/skill/constants';
import { FlowNodeTypeEnum } from '../../constant';
import type { NodeToolConfigType } from '../../../type/node';
import { formatRefKey, parseV2RefKey, splitParentChildId } from './codec';
import { parseLegacyRefKey, parsePrefixedLegacyToolRef, stripLegacyPluginPrefix } from './legacy';
import type { AgentPromptRef } from './types';

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
}: {
  id?: string;
  pluginId?: string;
  flowNodeType?: FlowNodeTypeEnum;
  toolConfig?: NodeToolConfigType;
}): string => {
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

/**
 * 从工具配置（SelectedToolItemType / AgentToolType / 模板项）构造 V2 引用对象。
 * 优先信任显式 source（teamId: / debug:tmbId: / system），再按工具 ID 规则推断。
 */
export const refFromTool = ({
  id,
  pluginId,
  source
}: {
  id?: string;
  pluginId?: string;
  source?: string;
}): AgentPromptRef | null => {
  const rawId = (pluginId || id || '').trim();
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

/** 判断任意工具引用（V2 或旧格式）是否为 builtin 类型。 */
export const isBuiltinPromptRefKey = (rawKey: string): boolean => {
  const v2Ref = parseV2RefKey(rawKey);
  if (v2Ref) return v2Ref.type === 'builtin';

  const legacy = parseLegacyRefKey(rawKey);
  return legacy.deterministicRef?.type === 'builtin';
};

/** 从工具对象直接生成标准 V2 canonicalKey；无法识别时返回空字符串。 */
export const getCanonicalKeyForTool = (params: {
  id?: string;
  pluginId?: string;
  source?: string;
}): string => {
  const ref = refFromTool(params);
  return ref ? formatRefKey(ref) : '';
};
