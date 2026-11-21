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
  getLegacyWriteKeyForTool,
  refFromBuiltin,
  refFromSkill,
  refFromTool
} from '@fastgpt/global/core/workflow/node/agent/promptRef/adapters';
import { AgentPromptRefRegistry } from '@fastgpt/global/core/workflow/node/agent/promptRef/registry';
import {
  DEFAULT_AGENT_PROMPT_REF_WRITE_MODE,
  type AgentPromptRefEntry,
  type AgentPromptRefWriteMode
} from '@fastgpt/global/core/workflow/node/agent/promptRef/types';

export type UseAgentPromptRefsParams = {
  selectedTools: SelectedToolItemType[];
  selectedAgentSkills?: SelectedAgentSkillItemType[];
  canUploadFile: boolean;
  hasSelectedDataset: boolean;
  useAgentSandbox: boolean;
  lang: string;
  writeMode?: AgentPromptRefWriteMode;
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
 * 负责构建同构 AgentPromptRefRegistry，并统一提供解析、标签投影、写入键生成与无损升级。
 */
export const useAgentPromptRefs = ({
  selectedTools,
  selectedAgentSkills = [],
  canUploadFile,
  hasSelectedDataset,
  useAgentSandbox,
  lang,
  writeMode = DEFAULT_AGENT_PROMPT_REF_WRITE_MODE
}: UseAgentPromptRefsParams) => {
  const getToolWriteKey = useCallback(
    (params: { id?: string; pluginId?: string; source?: string }) => {
      const legacyKey = getLegacyWriteKeyForTool(params);
      if (writeMode === 'legacy') return legacyKey;
      const ref = refFromTool(params);
      return ref ? formatRefKey(ref) : legacyKey;
    },
    [writeMode]
  );

  const getSkillWriteKey = useCallback(
    (params: { skillId: string; source?: SelectedAgentSkillItemType['source'] }) => {
      if (writeMode === 'legacy') return params.skillId;
      return formatRefKey(refFromSkill(params).ref);
    },
    [writeMode]
  );

  const getBuiltinWriteKey = useCallback(
    (id: string) => {
      if (writeMode === 'legacy') return id;
      return formatRefKey(refFromBuiltin(id));
    },
    [writeMode]
  );

  const promptRefRegistry = useMemoEnhance(() => {
    const entries: AgentPromptRefEntry<SkillLabelItemType>[] = [];

    selectedTools.forEach((tool) => {
      const ref = refFromTool({
        id: tool.id,
        pluginId: tool.pluginId,
        source: tool.source
      });
      if (!ref) return;

      const canonicalKey = formatRefKey(ref);
      const legacyWriteKey = getLegacyWriteKeyForTool({
        id: tool.id,
        pluginId: tool.pluginId,
        source: tool.source
      });
      const writeKey = writeMode === 'legacy' ? legacyWriteKey : canonicalKey;

      entries.push({
        ref,
        canonicalKey,
        displayName: tool.name,
        legacyWriteKey,
        meta: buildToolSkillLabelItem({ tool, writeKey })
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
        const childLegacyKey = getLegacyWriteKeyForTool({ id: rawId, source: tool.source });
        const childWriteKey = writeMode === 'legacy' ? childLegacyKey : childCanonicalKey;
        entries.push({
          ref: childRef,
          canonicalKey: childCanonicalKey,
          displayName: name,
          legacyWriteKey: childLegacyKey,
          meta: buildToolSkillLabelItem({
            tool: {
              ...tool,
              id: rawId,
              pluginId: rawId,
              name
            },
            writeKey: childWriteKey
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
      const writeKey = writeMode === 'legacy' ? id : canonicalKey;
      const displayName = parseI18nString(info.name, lang);

      entries.push({
        ref,
        canonicalKey,
        displayName,
        legacyWriteKey: id,
        meta: {
          id: writeKey,
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
      const writeKey = writeMode === 'legacy' ? skill.skillId : canonicalKey;

      entries.push({
        ref,
        canonicalKey,
        displayName: skill.name,
        legacyWriteKey: skill.skillId,
        sourceInferred,
        meta: buildAgentSkillLabelItem({
          skill,
          writeKey,
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
    lang,
    writeMode
  ]);

  const selectedSkills = useMemoEnhance<SkillLabelItemType[]>(
    () => promptRefRegistry.entries().map((entry) => entry.meta),
    [promptRefRegistry]
  );

  const resolveRef = useCallback(
    (rawKey: string) => promptRefRegistry.resolve(rawKey),
    [promptRefRegistry]
  );

  const upgradePrompt = useCallback(
    (text: string) => promptRefRegistry.upgradePrompt(text).text,
    [promptRefRegistry]
  );

  return {
    promptRefRegistry,
    selectedSkills,
    resolveRef,
    getToolWriteKey,
    getSkillWriteKey,
    getBuiltinWriteKey,
    upgradePrompt
  };
};
