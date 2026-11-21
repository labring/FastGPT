import {
  AppFormEditFormV1TypeSchema,
  type SelectedAgentSkillItemType,
  type SelectedToolItemType,
  type AppFormEditFormType
} from '@fastgpt/global/core/app/formEdit/type';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { WorkflowStart } from '@fastgpt/global/core/workflow/template/system/workflowStart';
import { userFilesInput } from '@fastgpt/global/core/workflow/template/output';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { workflowStartNodeId } from '@/web/core/app/constants';
import { AgentNode } from '@fastgpt/global/core/workflow/template/system/agent/index';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { getAppChatConfig } from '@fastgpt/global/common/app/chat';
import { Input_Template_File_Link } from '@fastgpt/global/core/workflow/template/input';
import {
  serializeAgentTool,
  validateToolConfiguration
} from '@fastgpt/global/core/app/formEdit/utils';
import { getNewToolPreviewNode } from '@/web/core/app/api/tool';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { inheritToolInputConfig } from '../FormComponent/ToolSelector/utils';
import type { ChatAgentConfigFormDataType } from '@fastgpt/global/core/ai/auxiliaryGeneration/type';
import { AGENT_SANDBOX_TOOLSET_ID } from '@fastgpt/global/core/ai/sandbox/tools';
import { formatRefKey } from '@fastgpt/global/core/workflow/node/agent/promptRef/codec';
import { refFromBuiltin } from '@fastgpt/global/core/workflow/node/agent/promptRef/adapters';
import { extractAgentPromptRefs } from '@fastgpt/global/core/workflow/node/agent/promptRef/text';
import { getToolIdentityKey } from '@fastgpt/global/core/app/tool/utils';
import { parseV2RefKey } from '@fastgpt/global/core/workflow/node/agent/promptRef/codec';
import { toLegacyToolLookup } from '@fastgpt/global/core/workflow/node/agent/promptRef/legacy';
import { getCanonicalKeyForTool } from '@fastgpt/global/core/workflow/node/agent/promptRef/adapters';

/* format app nodes to edit form */
export const appWorkflow2AgentForm = ({
  nodes,
  chatConfig
}: {
  nodes: StoreNodeItemType[];
  chatConfig: AppChatConfigType;
}) => {
  const defaultAppForm = getDefaultAppForm();
  defaultAppForm.chatConfig = getAppChatConfig({
    chatConfig,
    isPublicFetch: true
  });
  const findInputValueByKey = (inputs: FlowNodeInputItemType[], key: string) => {
    return inputs.find((item) => item.key === key)?.value;
  };

  nodes.forEach((node) => {
    const inputMap = new Map(node.inputs.map((input) => [input.key, input.value]));
    if (node.flowNodeType === FlowNodeTypeEnum.agent) {
      defaultAppForm.aiSettings.modelId = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.aiModelId
      );
      defaultAppForm.aiSettings.model = findInputValueByKey(node.inputs, NodeInputKeyEnum.aiModel);
      defaultAppForm.aiSettings.systemPrompt = inputMap.get(NodeInputKeyEnum.aiSystemPrompt);
      defaultAppForm.aiSettings.temperature = inputMap.get(NodeInputKeyEnum.aiChatTemperature);
      defaultAppForm.aiSettings.maxHistories =
        inputMap.get(NodeInputKeyEnum.history) ?? defaultAppForm.aiSettings.maxHistories;
      defaultAppForm.aiSettings.aiChatReasoning =
        inputMap.get(NodeInputKeyEnum.aiChatReasoning) ?? true;
      defaultAppForm.aiSettings.aiChatReasoningEffort = inputMap.get(
        NodeInputKeyEnum.aiChatReasoningEffort
      );
      defaultAppForm.aiSettings.aiChatTopP = inputMap.get(NodeInputKeyEnum.aiChatTopP);
      const useAgentSandbox = inputMap.get(NodeInputKeyEnum.useAgentSandbox);
      defaultAppForm.aiSettings.useAgentSandbox = useAgentSandbox;
      defaultAppForm.aiSettings.sandboxEntrypoint = inputMap.get(
        NodeInputKeyEnum.sandboxEntrypoint
      );

      const tools = inputMap.get(NodeInputKeyEnum.selectedTools) as SelectedToolItemType[];
      if (tools) {
        defaultAppForm.selectedTools = tools.map((tool) => ({
          ...tool,
          id: tool.pluginId ?? tool.id
        }));
      }

      // Dataset configuration
      const datasetParams = inputMap.get(NodeInputKeyEnum.datasetParams);
      if (datasetParams) {
        const parsedDatasetParams = datasetParams as AppFormEditFormType['dataset'];
        defaultAppForm.dataset = {
          ...defaultAppForm.dataset,
          ...parsedDatasetParams,
          searchMode: parsedDatasetParams.searchMode || DatasetSearchModeEnum.embedding,
          usingReRank: !!parsedDatasetParams.usingReRank
        };
      }

      // Skills configuration
      const skills = inputMap.get(NodeInputKeyEnum.skills) as
        | SelectedAgentSkillItemType[]
        | undefined;
      if (skills && skills.length > 0) {
        defaultAppForm.selectedAgentSkills = skills;
      }
    }
  });

  return defaultAppForm;
};

export type WorkflowType = {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
};

/** 将 Agent 表单转换为工作流，并通过共用 Schema 校验和归一化知识库参数。 */
export function agentForm2AppWorkflow(
  data: AppFormEditFormType,
  t: any // i18nT
): WorkflowType & {
  chatConfig: AppChatConfigType;
} {
  const aiChatNodeId = '7BdojPlukIQw';
  const normalizedSandboxEntrypoint = data.aiSettings.sandboxEntrypoint?.trim() || undefined;
  const modelMultimodal = {
    // 表单只控制文件上传；媒体传递和链接提取统一放行，实际能力由运行时模型配置判断。
    vision: true,
    audio: true,
    video: true,
    extractFiles: true
  };
  const modelReferenceInputs: FlowNodeInputItemType[] = [
    ...(data.aiSettings.modelId !== undefined || !data.aiSettings.model
      ? [
          {
            key: NodeInputKeyEnum.aiModelId,
            renderTypeList: [FlowNodeInputTypeEnum.settingLLMModel],
            label: t('common:core.module.input.label.aiModel'),
            valueType: WorkflowIOValueTypeEnum.string,
            value: data.aiSettings.modelId
          }
        ]
      : []),
    ...(data.aiSettings.model
      ? [
          {
            key: NodeInputKeyEnum.aiModel,
            renderTypeList: [FlowNodeInputTypeEnum.settingLLMModel],
            label: t('common:core.module.input.label.aiModel'),
            valueType: WorkflowIOValueTypeEnum.string,
            value: data.aiSettings.model
          }
        ]
      : [])
  ];

  function workflowStartTemplate(): StoreNodeItemType {
    return {
      nodeId: workflowStartNodeId,
      name: t(WorkflowStart.name),
      intro: '',
      avatar: WorkflowStart.avatar,
      flowNodeType: WorkflowStart.flowNodeType,
      position: {
        x: 558.4082376415505,
        y: 123.72387429194112
      },
      version: WorkflowStart.version,
      inputs: WorkflowStart.inputs,
      outputs: [...WorkflowStart.outputs, userFilesInput]
    };
  }
  function agentChatTemplate(): WorkflowType {
    return {
      nodes: [
        {
          nodeId: aiChatNodeId,
          name: t(AgentNode.name),
          intro: t(AgentNode.intro),
          avatar: AgentNode.avatar,
          flowNodeType: AgentNode.flowNodeType,
          showStatus: true,
          position: {
            x: 1106.3238387960757,
            y: -350.6030674683474
          },
          version: AgentNode.version,
          inputs: [
            ...modelReferenceInputs,
            {
              key: NodeInputKeyEnum.aiSystemPrompt,
              renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
              label: t('common:core.ai.Prompt'),
              valueType: WorkflowIOValueTypeEnum.string,
              value: data.aiSettings.systemPrompt
            },
            {
              ...Input_Template_File_Link,
              value: [[workflowStartNodeId, NodeOutputKeyEnum.userFiles]]
            },
            {
              key: NodeInputKeyEnum.aiChatVision,
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              label: '',
              valueType: WorkflowIOValueTypeEnum.boolean,
              value: modelMultimodal.vision
            },
            {
              key: NodeInputKeyEnum.aiChatAudio,
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              label: '',
              valueType: WorkflowIOValueTypeEnum.boolean,
              value: modelMultimodal.audio
            },
            {
              key: NodeInputKeyEnum.aiChatVideo,
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              label: '',
              valueType: WorkflowIOValueTypeEnum.boolean,
              value: modelMultimodal.video
            },
            {
              key: NodeInputKeyEnum.aiChatExtractFiles,
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              label: '',
              valueType: WorkflowIOValueTypeEnum.boolean,
              value: modelMultimodal.extractFiles
            },
            {
              key: NodeInputKeyEnum.aiChatReasoning,
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              label: '',
              valueType: WorkflowIOValueTypeEnum.boolean,
              value: data.aiSettings.aiChatReasoning ?? true
            },
            {
              key: NodeInputKeyEnum.aiChatReasoningEffort,
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              label: '',
              valueType: WorkflowIOValueTypeEnum.string,
              value: data.aiSettings.aiChatReasoningEffort
            },
            {
              key: NodeInputKeyEnum.userChatInput,
              renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
              valueType: WorkflowIOValueTypeEnum.string,
              label: i18nT('common:core.module.input.label.user question'),
              required: true,
              toolDescription: i18nT('common:core.module.input.label.user question'),
              value: [workflowStartNodeId, NodeInputKeyEnum.userChatInput]
            },
            {
              key: NodeInputKeyEnum.selectedTools,
              renderTypeList: [FlowNodeInputTypeEnum.hidden], // Set in the pop-up window
              label: '',
              valueType: WorkflowIOValueTypeEnum.arrayObject,
              value: data.selectedTools.map((tool) => serializeAgentTool({ tool }))
            },
            // Dataset configuration
            {
              key: NodeInputKeyEnum.datasetParams,
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              label: '',
              valueType: WorkflowIOValueTypeEnum.object,
              value: AppFormEditFormV1TypeSchema.shape.dataset.parse({
                datasets: data.dataset.datasets,
                similarity: data.dataset.similarity,
                limit: data.dataset.limit,
                searchMode: data.dataset.searchMode,
                embeddingWeight: data.dataset.embeddingWeight,
                usingReRank: data.dataset.usingReRank,
                rerankModelId: data.dataset.rerankModelId,
                rerankModel: data.dataset.rerankModel,
                rerankWeight: data.dataset.rerankWeight,
                rerankCandidateNum: data.dataset.rerankCandidateNum,
                datasetSearchUsingExtensionQuery: data.dataset.datasetSearchUsingExtensionQuery,
                datasetSearchExtensionModelId: data.dataset.datasetSearchExtensionModelId,
                datasetSearchExtensionModel: data.dataset.datasetSearchExtensionModel,
                datasetSearchExtensionBg: data.dataset.datasetSearchExtensionBg,
                collectionFilterMatch: data.dataset.collectionFilterMatch,
                [NodeInputKeyEnum.authTmbId]: data.dataset.authTmbId
              })
            },
            // agent sandbox
            {
              key: NodeInputKeyEnum.useAgentSandbox,
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              label: '',
              valueType: WorkflowIOValueTypeEnum.boolean,
              value: data.aiSettings.useAgentSandbox ?? false
            },
            {
              key: NodeInputKeyEnum.sandboxEntrypoint,
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              label: '',
              valueType: WorkflowIOValueTypeEnum.string,
              value: normalizedSandboxEntrypoint
            },
            // Skills configuration
            ...(data.selectedAgentSkills && data.selectedAgentSkills.length > 0
              ? [
                  {
                    key: NodeInputKeyEnum.skills,
                    renderTypeList: [FlowNodeInputTypeEnum.hidden],
                    label: '',
                    valueType: WorkflowIOValueTypeEnum.arrayObject,
                    value: data.selectedAgentSkills.map(
                      ({ skillId, source, name, description, avatar }) => ({
                        skillId,
                        ...(source ? { source } : {}),
                        name,
                        description,
                        ...(avatar === undefined ? {} : { avatar })
                      })
                    )
                  }
                ]
              : [])
          ],
          outputs: AgentNode.outputs
        }
      ],
      edges: [
        {
          source: workflowStartNodeId,
          target: aiChatNodeId,
          sourceHandle: `${workflowStartNodeId}-source-right`,
          targetHandle: `${aiChatNodeId}-target-left`
        }
      ]
    };
  }

  const workflow = agentChatTemplate();

  return {
    nodes: [workflowStartTemplate(), ...workflow.nodes],
    edges: workflow.edges,
    chatConfig: data.chatConfig
  };
}

export const getEmptyAgentConfig = (t: any) => {
  const defaultAppForm = getDefaultAppForm();

  return agentForm2AppWorkflow(
    {
      aiSettings: {
        model: '',
        maxHistories: 6,
        isResponseAnswerText: true,
        aiChatReasoning: true
      },
      dataset: {
        ...defaultAppForm.dataset,
        datasets: [],
        searchMode: DatasetSearchModeEnum.embedding
      },
      selectedTools: [],
      chatConfig: {}
    },
    t
  );
};

/** 加载辅助生成的工具，同时兼容 V2 canonicalKey 与旧格式 { id, source } / string 引用。 */
export const loadGeneratedTools = async ({
  newToolIds,
  existsTools = [],
  generatedSelectedTools = [],
  fileSelectConfig
}: {
  newToolIds: Array<string | { id: string; source?: string }>; // 新的，完整的 toolId
  existsTools?: SelectedToolItemType[];
  generatedSelectedTools?: SelectedToolItemType[];
  fileSelectConfig?: AppFileSelectConfigType;
}): Promise<SelectedToolItemType[]> => {
  const results = (
    await Promise.all(
      newToolIds.map<Promise<SelectedToolItemType | undefined>>(async (toolRef) => {
        const { toolId, source } = (() => {
          if (typeof toolRef === 'string') {
            const v2Ref = parseV2RefKey(toolRef);
            if (v2Ref) {
              const legacyLookup = toLegacyToolLookup(v2Ref);
              return legacyLookup
                ? { toolId: legacyLookup.appId, source: legacyLookup.source }
                : { toolId: '', source: undefined };
            }
            return { toolId: toolRef, source: undefined };
          }
          return { toolId: toolRef.id, source: toolRef.source };
        })();
        if (!toolId) return;

        const identityKey = getToolIdentityKey(toolId, source);
        const canonicalKey = getCanonicalKeyForTool({ id: toolId, source });
        const isSameTool = (tool: SelectedToolItemType) => {
          if (getToolIdentityKey(tool.pluginId, tool.source) === identityKey) return true;
          if (canonicalKey) {
            return (
              getCanonicalKeyForTool({ id: tool.pluginId ?? tool.id, source: tool.source }) ===
              canonicalKey
            );
          }
          return false;
        };

        // 已经存在的工具，直接返回
        const existTool = existsTools.find(isSameTool);
        if (existTool) {
          // 复用旧配置时补齐显式来源，保持与运行时引用一致。
          if (source === 'system' && !existTool.source) {
            return { ...existTool, source };
          }
          return existTool;
        }

        // 新工具，需要与已配置的 tool 进行 input 合并
        const tool = await getNewToolPreviewNode({
          appId: toolId,
          source
        });
        // 验证工具配置
        const toolValid = validateToolConfiguration({
          toolTemplate: tool,
          isAppTool: true,
          canUploadFile: !!(
            fileSelectConfig?.canSelectFile ||
            fileSelectConfig?.canSelectImg ||
            fileSelectConfig?.canSelectVideo ||
            fileSelectConfig?.canSelectAudio ||
            fileSelectConfig?.canSelectCustomFileExtension
          )
        });
        if (!toolValid) {
          return;
        }

        const generatedTool = generatedSelectedTools.find(isSameTool);
        const inheritedTool = inheritToolInputConfig({ tool, sourceTool: generatedTool });
        const previewToolId =
          tool.pluginId ||
          (tool.toolConfig?.mcpTool && 'toolId' in tool.toolConfig.mcpTool
            ? tool.toolConfig.mcpTool.toolId
            : undefined) ||
          (tool.toolConfig?.httpTool && 'toolId' in tool.toolConfig.httpTool
            ? tool.toolConfig.httpTool.toolId
            : undefined) ||
          tool.id;
        const resolvedToolId =
          toolId.includes('/') &&
          (previewToolId.startsWith('mcp-') || previewToolId.startsWith('http-'))
            ? previewToolId
            : toolId;

        return {
          ...inheritedTool,
          id: resolvedToolId,
          source
        };
      })
    )
  ).filter((item) => item !== undefined);

  return results;
};

const SANDBOX_CANONICAL_KEY = formatRefKey(refFromBuiltin(AGENT_SANDBOX_TOOLSET_ID));

/** 检测辅助生成交付的配置中是否包含虚拟机或技能依赖。 */
export const hasHelperSandboxOrSkillConfig = (formData: ChatAgentConfigFormDataType): boolean => {
  if (formData.enableSandboxEnabled || (formData.selectedAgentSkills?.length ?? 0) > 0) {
    return true;
  }
  if (
    (formData.tools || []).some((tool) => {
      const key = typeof tool === 'string' ? tool : tool.id;
      return key === AGENT_SANDBOX_TOOLSET_ID || key === SANDBOX_CANONICAL_KEY;
    })
  ) {
    return true;
  }
  return extractAgentPromptRefs(formData.systemPrompt || '').some(({ parsed }) => {
    const ref =
      parsed.kind === 'v2'
        ? parsed.ref
        : parsed.kind === 'legacy'
          ? parsed.deterministicRef
          : undefined;
    return (
      ref?.type === 'skill' || (ref?.type === 'builtin' && ref.id === AGENT_SANDBOX_TOOLSET_ID)
    );
  });
};

/**
 * 应用辅助生成配置到 ChatAgent 表单：
 * 沙盒不可用时保留历史已选技能与虚拟机开关，避免套餐降级或系统临时关闭时静默清空历史配置。
 */
export const applyChatAgentHelperFormData = ({
  prev,
  formData,
  newTools,
  canUseSandbox
}: {
  prev: AppFormEditFormType;
  formData: ChatAgentConfigFormDataType;
  newTools: SelectedToolItemType[];
  canUseSandbox: boolean;
}): AppFormEditFormType => {
  const fileUploadEnabled = !!formData.fileUploadEnabled;
  const nextSelectedAgentSkills = canUseSandbox
    ? formData.selectedAgentSkills || []
    : prev.selectedAgentSkills;
  const nextUseAgentSandbox = canUseSandbox
    ? !!formData.enableSandboxEnabled || (formData.selectedAgentSkills?.length || 0) > 0
    : prev.aiSettings.useAgentSandbox;

  return {
    ...prev,
    selectedTools: [...newTools],
    selectedAgentSkills: nextSelectedAgentSkills,
    dataset: {
      ...prev.dataset,
      datasets: formData.datasets ?? []
    },
    aiSettings: {
      ...prev.aiSettings,
      systemPrompt: formData.systemPrompt || prev.aiSettings.systemPrompt,
      useAgentSandbox: nextUseAgentSandbox
    },
    chatConfig: {
      ...prev.chatConfig,
      fileSelectConfig: fileUploadEnabled
        ? {
            ...prev.chatConfig.fileSelectConfig,
            canSelectFile: true
          }
        : {
            maxFiles: undefined,
            canSelectFile: false,
            customPdfParse: false,
            canSelectImg: false,
            canSelectVideo: false,
            canSelectAudio: false,
            canSelectCustomFileExtension: false,
            customFileExtensionList: []
          }
    }
  };
};
