import { useCallback } from 'react';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import type { SkillLabelItemType } from '@fastgpt/web/components/common/Textarea/PromptEditor/plugins/SkillLabelPlugin';
import type {
  SelectedAgentSkillItemType,
  SelectedToolItemType
} from '@fastgpt/global/core/app/formEdit/type';
import { getAgentToolRuntimeStatus } from '@fastgpt/global/core/app/formEdit/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { SubAppIds, systemSubInfo } from '@fastgpt/global/core/workflow/node/agent/constants';
import { AGENT_SANDBOX_TOOLSET_ID } from '@fastgpt/global/core/ai/sandbox/tools';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { formatRefKey } from '@fastgpt/global/core/workflow/node/agent/promptRef/codec';
import {
  getPromptRefToolId,
  refFromBuiltin,
  refFromSkill,
  refFromTool
} from '@fastgpt/global/core/workflow/node/agent/promptRef/adapters';
import { AgentPromptRefRegistry } from '@fastgpt/global/core/workflow/node/agent/promptRef/registry';
import type { AgentPromptRefEntry } from '@fastgpt/global/core/workflow/node/agent/promptRef/types';

type UseAgentPromptRefsParams = {
  selectedTools: SelectedToolItemType[];
  selectedAgentSkills?: SelectedAgentSkillItemType[];
  canUploadFile: boolean;
  hasSelectedDataset: boolean;
  useAgentSandbox: boolean;
  lang: string;
};

/** 将工具状态投影为 PromptEditor 展示标签；下线/无权限/缺失资源按 invalid 渲染。 */
export const buildToolSkillLabelItem = ({
  tool,
  writeKey,
  configTarget
}: {
  tool: SelectedToolItemType;
  writeKey: string;
  configTarget?: SelectedToolItemType;
}): SkillLabelItemType => {
  const status = getAgentToolRuntimeStatus(tool);
  return {
    ...tool,
    id: writeKey,
    name: tool.name,
    configStatus: status === 'offline' ? 'invalid' : status,
    ...(configTarget ? { configTarget } : {})
  };
};

/** 将内置能力投影为 PromptEditor 展示标签，统一注册表与 @ 菜单的状态计算。 */
export const buildBuiltinSkillLabelItem = ({
  id,
  hasSelectedDataset,
  canUploadFile,
  useAgentSandbox,
  lang
}: {
  id: string;
  hasSelectedDataset: boolean;
  canUploadFile: boolean;
  useAgentSandbox: boolean;
  lang: string;
}): SkillLabelItemType | null => {
  const info = systemSubInfo[id];
  if (!info) return null;

  const canonicalKey = formatRefKey(refFromBuiltin(id));
  const displayName = parseI18nString(info.name, lang);
  const configStatus: SkillLabelItemType['configStatus'] = (() => {
    if (id === SubAppIds.datasetSearch) {
      return hasSelectedDataset ? 'configured' : 'waitingForConfig';
    }
    if (id === SubAppIds.readFiles) {
      return canUploadFile ? 'configured' : 'invalid';
    }
    if (id === AGENT_SANDBOX_TOOLSET_ID) {
      return useAgentSandbox ? 'noConfig' : 'invalid';
    }
    return 'noConfig';
  })();

  return {
    id: canonicalKey,
    pluginId: id,
    name: displayName,
    avatar: info.avatar,
    intro: info.toolDescription,
    flowNodeType: FlowNodeTypeEnum.tool,
    templateType: FlowNodeTemplateTypeEnum.tools,
    inputs: [],
    outputs: [],
    configStatus
  };
};
/** 将 Skill 投影为 PromptEditor 展示标签；无权限/已删除时按 invalid 渲染。 */
export const buildAgentSkillLabelItem = ({
  skill,
  writeKey,
  sandboxUnavailable = false
}: {
  skill: SelectedAgentSkillItemType;
  writeKey: string;
  sandboxUnavailable?: boolean;
}): SkillLabelItemType => ({
  id: writeKey,
  name: skill.name,
  avatar: skill.avatar || 'core/skill/default',
  intro: skill.description,
  flowNodeType: FlowNodeTypeEnum.tool,
  configStatus: skill.error || sandboxUnavailable ? 'invalid' : 'noConfig'
});

/**
 * ChatAgent 与 NodeAgent 共用的提示词引用统一 Hook。
 * 负责构建同构 AgentPromptRefRegistry，并统一提供标签投影与 V2 写入键生成。
 */
export const useAgentPromptRefs = ({
  selectedTools,
  selectedAgentSkills = [],
  canUploadFile,
  hasSelectedDataset,
  useAgentSandbox,
  lang
}: UseAgentPromptRefsParams) => {
  const getToolWriteKey = useCallback(
    (params: {
      id?: string;
      pluginId?: string;
      flowNodeType?: FlowNodeTypeEnum;
      toolConfig?: SelectedToolItemType['toolConfig'];
      source?: string;
    }) => {
      const resolvedId = getPromptRefToolId(params);
      const ref = refFromTool({ id: resolvedId, source: params.source });
      return ref ? formatRefKey(ref) : resolvedId.trim();
    },
    []
  );

  const getSkillWriteKey = useCallback(
    (params: { skillId: string; source?: SelectedAgentSkillItemType['source'] }) =>
      formatRefKey(refFromSkill(params).ref),
    []
  );

  const promptRefRegistry = useMemoEnhance(() => {
    const entries: AgentPromptRefEntry<SkillLabelItemType>[] = [];

    selectedTools.forEach((tool) => {
      const resolvedToolId = getPromptRefToolId(tool);
      const savedToolId = (tool.pluginId || tool.id || '').trim();
      const legacyExactKeys =
        savedToolId && savedToolId !== resolvedToolId ? [savedToolId] : undefined;
      const ref = refFromTool({
        id: resolvedToolId,
        source: tool.source
      });
      if (!ref) return;

      const canonicalKey = formatRefKey(ref);

      entries.push({
        ref,
        canonicalKey,
        displayName: tool.name,
        ...(legacyExactKeys ? { legacyExactKeys } : {}),
        meta: buildToolSkillLabelItem({ tool, writeKey: canonicalKey, configTarget: tool })
      });

      const childSpecs: Array<{ rawId: string; name: string }> = [];
      const systemToolList = tool.toolConfig?.systemToolSet?.toolList;
      if (systemToolList?.length) {
        const parentToolId = tool.toolConfig?.systemToolSet?.toolId || tool.pluginId || tool.id;
        systemToolList.forEach((child) => {
          const rawId = child.toolId.includes('/')
            ? child.toolId
            : `${parentToolId}/${child.toolId}`;
          childSpecs.push({ rawId, name: child.name || child.toolId });
        });
      }
      const mcpToolList = tool.toolConfig?.mcpToolSet?.toolList;
      if (mcpToolList?.length) {
        const mcpToolSet = tool.toolConfig?.mcpToolSet;
        const parentAppId =
          (mcpToolSet && 'toolId' in mcpToolSet ? mcpToolSet.toolId : undefined) ||
          tool.pluginId ||
          tool.id;
        mcpToolList.forEach((child) => {
          childSpecs.push({ rawId: `mcp-${parentAppId}/${child.name}`, name: child.name });
        });
      }
      const httpToolList = tool.toolConfig?.httpToolSet?.toolList;
      if (httpToolList?.length) {
        const httpToolSet = tool.toolConfig?.httpToolSet;
        const parentAppId =
          (httpToolSet && 'toolId' in httpToolSet ? httpToolSet.toolId : undefined) ||
          tool.pluginId ||
          tool.id;
        httpToolList.forEach((child) => {
          childSpecs.push({ rawId: `http-${parentAppId}/${child.name}`, name: child.name });
        });
      }

      childSpecs.forEach(({ rawId, name }) => {
        const childRef = refFromTool({ id: rawId, source: tool.source });
        if (!childRef) return;
        const childCanonicalKey = formatRefKey(childRef);
        entries.push({
          ref: childRef,
          canonicalKey: childCanonicalKey,
          displayName: name,
          meta: buildToolSkillLabelItem({
            tool: {
              ...tool,
              id: rawId,
              pluginId: rawId,
              name
            },
            writeKey: childCanonicalKey,
            configTarget: tool
          })
        });
      });
    });

    [SubAppIds.datasetSearch, SubAppIds.readFiles, AGENT_SANDBOX_TOOLSET_ID].forEach((id) => {
      const meta = buildBuiltinSkillLabelItem({
        id,
        hasSelectedDataset,
        canUploadFile,
        useAgentSandbox,
        lang
      });
      if (!meta) return;

      entries.push({
        ref: refFromBuiltin(id),
        canonicalKey: meta.id,
        displayName: meta.name,
        meta
      });
    });

    selectedAgentSkills.forEach((skill) => {
      const { ref, sourceInferred } = refFromSkill({
        skillId: skill.skillId,
        source: skill.source
      });
      const canonicalKey = formatRefKey(ref);

      entries.push({
        ref,
        canonicalKey,
        displayName: skill.name,
        sourceInferred,
        meta: buildAgentSkillLabelItem({
          skill,
          writeKey: canonicalKey,
          sandboxUnavailable: !useAgentSandbox
        })
      });
    });

    return AgentPromptRefRegistry.create(entries);
  }, [
    selectedTools,
    selectedAgentSkills,
    canUploadFile,
    hasSelectedDataset,
    useAgentSandbox,
    lang
  ]);

  return {
    promptRefRegistry,
    getToolWriteKey,
    getSkillWriteKey
  };
};
