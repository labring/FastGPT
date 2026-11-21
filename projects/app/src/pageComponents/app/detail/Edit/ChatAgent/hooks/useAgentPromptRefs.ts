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
  writeKey
}: {
  tool: SelectedToolItemType;
  writeKey: string;
}): SkillLabelItemType => {
  const status = getAgentToolRuntimeStatus(tool);
  return {
    ...tool,
    id: writeKey,
    name: tool.name,
    configStatus: status === 'offline' ? 'invalid' : status
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
    (params: { id?: string; pluginId?: string; source?: string }) => {
      const ref = refFromTool(params);
      return ref ? formatRefKey(ref) : (params.pluginId || params.id || '').trim();
    },
    []
  );

  const getSkillWriteKey = useCallback(
    (params: { skillId: string; source?: SelectedAgentSkillItemType['source'] }) =>
      formatRefKey(refFromSkill(params).ref),
    []
  );

  const getBuiltinWriteKey = useCallback((id: string) => formatRefKey(refFromBuiltin(id)), []);

  const promptRefRegistry = useMemoEnhance(() => {
    const entries: AgentPromptRefEntry<SkillLabelItemType>[] = [];

    selectedTools.forEach((tool) => {
      const ref = refFromTool({
        id: getPromptRefToolId(tool),
        source: tool.source
      });
      if (!ref) return;

      const canonicalKey = formatRefKey(ref);

      entries.push({
        ref,
        canonicalKey,
        displayName: tool.name,
        meta: buildToolSkillLabelItem({ tool, writeKey: canonicalKey })
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
            writeKey: childCanonicalKey
          })
        });
      });
    });

    const builtinDefinitions: Array<{
      id: string;
      configStatus: SkillLabelItemType['configStatus'];
    }> = [
      {
        id: SubAppIds.datasetSearch,
        configStatus: hasSelectedDataset ? 'configured' : 'waitingForConfig'
      },
      {
        id: SubAppIds.readFiles,
        configStatus: canUploadFile ? 'configured' : 'invalid'
      },
      {
        id: AGENT_SANDBOX_TOOLSET_ID,
        configStatus: useAgentSandbox ? 'noConfig' : 'invalid'
      }
    ];

    builtinDefinitions.forEach(({ id, configStatus }) => {
      const info = systemSubInfo[id];
      if (!info) return;

      const ref = refFromBuiltin(id);
      const canonicalKey = formatRefKey(ref);
      const displayName = parseI18nString(info.name, lang);

      entries.push({
        ref,
        canonicalKey,
        displayName,
        meta: {
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
        }
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
    getSkillWriteKey,
    getBuiltinWriteKey
  };
};
