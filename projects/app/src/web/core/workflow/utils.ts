import type { WorkflowDataContextType } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { isEmptyModelValue } from '@fastgpt/global/core/ai/model/reference';
import { normalizeFlowNodeInputType } from '@fastgpt/global/core/app/formEdit/utils';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  EDGE_TYPE,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import type { FlowNodeTemplateOutputItemType } from '@fastgpt/global/core/workflow/template/output';
import { EmptyNode } from '@fastgpt/global/core/workflow/template/system/emptyNode';
import { HttpToolSetNode } from '@fastgpt/global/core/workflow/template/system/httpToolSet';
import type { ClassifyQuestionAgentItemType } from '@fastgpt/global/core/workflow/template/system/classifyQuestion/type';
import type { IfElseListItemType } from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { initNewIfElseList } from '@fastgpt/global/common/workflow/condition';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType,
  ReferenceItemValueType,
  EditorVariablePickerType
} from '@fastgpt/global/core/workflow/type/io';
import type {
  FlowNodeItemType,
  FlowNodeTemplateType,
  StoreNodeItemType
} from '@fastgpt/global/core/workflow/type/node';
import { formatEditorVariablePickerIcon } from '@fastgpt/web/core/workflow/utils';
import { getAppChatConfig } from '@fastgpt/global/common/app/chat';
import {
  getSelectedInputRenderType,
  getWorkflowReferenceSourceNodes,
  getWorkflowReferenceVariables
} from '@fastgpt/global/common/workflow/reference';
import { isWorkflowSystemModelInput } from '@fastgpt/global/common/workflow/model';
import { workflowModelKeyMappings } from '@fastgpt/global/core/workflow/model/constants';
import { cloneDeep, isEqual } from 'lodash-es';
import type { TFunction } from 'next-i18next';
import type { Edge, Node, XYPosition } from 'reactflow';
import { getGlobalVariableNode } from './adapt';
import { DatasetTagFilterVersionEnum } from '@fastgpt/global/core/dataset/constants';
import { resolveDatasetTagFilterVersion } from '@fastgpt/global/core/dataset/search/tagFilter';

/**
 * 将节点模板转换为画布节点，并按创建时语言初始化可编辑文本。
 * `formatName` 在翻译完成后执行，用于基于实例名称追加重名序号。
 */
export const nodeTemplate2FlowNode = ({
  template,
  position,
  selected,
  parentNodeId,
  zIndex,
  t,
  formatName,
  initialModelId
}: {
  template: FlowNodeTemplateType;
  position: XYPosition;
  selected?: boolean;
  parentNodeId?: string;
  zIndex?: number;
  t: TFunction;
  formatName?: (name: string) => string;
  /** 新建业务显式解析后的默认 ID；恢复和复制不传。 */
  initialModelId?: string;
}): Node<FlowNodeItemType> => {
  const name = t(template.name);

  // 用持久化节点数据覆盖模板默认值。
  const moduleItem: FlowNodeItemType = {
    ...template,
    name: formatName?.(name) ?? name,
    intro: template.intro ? t(template.intro) : template.intro,
    nodeId: getNanoid(),
    parentNodeId
  };
  // 仅创建时初始化主模型；已有值和引用模式原样保留，不读写“上次选择”的持久化记录。
  // 知识库搜索的辅助模型由参数弹窗负责，不在这里预填。
  moduleItem.inputs = moduleItem.inputs.map((input) => {
    const renderType = getSelectedInputRenderType(input);
    if (
      moduleItem.flowNodeType === FlowNodeTypeEnum.datasetSearchNode ||
      !initialModelId ||
      !isEmptyModelValue(input.value) ||
      (renderType !== FlowNodeInputTypeEnum.selectLLMModel &&
        renderType !== FlowNodeInputTypeEnum.settingLLMModel)
    )
      return input;
    return { ...input, value: initialModelId };
  });
  if (moduleItem.flowNodeType === FlowNodeTypeEnum.ifElseNode) {
    moduleItem.inputs = moduleItem.inputs.map((input) => {
      if (input.key !== NodeInputKeyEnum.ifElseList) return input;

      return {
        ...input,
        value: initNewIfElseList(input.value as IfElseListItemType[])
      };
    });
  }
  if (moduleItem.flowNodeType === FlowNodeTypeEnum.classifyQuestion) {
    moduleItem.inputs = moduleItem.inputs.map((input) => {
      if (input.key !== NodeInputKeyEnum.agents) return input;

      return {
        ...input,
        value: (input.value as ClassifyQuestionAgentItemType[]).map((item) => ({
          ...item,
          value: t(item.value)
        }))
      };
    });
  }

  return {
    id: moduleItem.nodeId,
    type: moduleItem.flowNodeType,
    data: moduleItem,
    position: position,
    selected,
    zIndex
  };
};

type StoreNode2FlowNodeProps = {
  item: StoreNodeItemType;
  selected?: boolean;
  zIndex?: number;
  parentNodeId?: string;
  isTool?: boolean;
  t: TFunction;
};

/**
 * 将持久化节点恢复为画布节点，并在加载时实体化历史 i18n 文本。
 * 名称或描述命中翻译 key 时使用当前语言文本，后续保存会写回实体文本。
 *
 * 结构迁移不会解析需要服务端模型全集才能确认的 legacy model。模板合并前先按原始 key
 * 去重模型输入：canonical key 存在时删除 legacy key；只有 legacy key 时复用 canonical
 * 模板槽位但保留旧 key，等待保存边界解析为真实 modelId。
 */
export const storeNode2FlowNode = ({
  item: storeNode,
  selected = false,
  zIndex,
  parentNodeId,
  isTool = false,
  t
}: StoreNode2FlowNodeProps): Node<FlowNodeItemType> => {
  // init some static data
  const nodeTemplate =
    (storeNode.flowNodeType === FlowNodeTypeEnum.toolSet &&
    !storeNode.pluginId &&
    storeNode.toolConfig?.httpToolSet &&
    !('toolId' in storeNode.toolConfig.httpToolSet)
      ? HttpToolSetNode
      : moduleTemplatesFlat.find((template) => template.flowNodeType === storeNode.flowNodeType)) ||
    EmptyNode;

  const storedInputs = storeNode.inputs;
  // 废弃模板输入仅在存量节点已有该字段时，按模板顺序保留。
  const orderedTemplateInputs = nodeTemplate.inputs.filter(
    (input) =>
      (!input.canEdit && input.deprecated !== true) ||
      (input.deprecated === true && storedInputs.some((item) => item.key === input.key))
  );
  const staticTemplateOutputs = nodeTemplate.outputs.filter(
    (output) => output.type !== FlowNodeOutputTypeEnum.dynamic
  );
  const dynamicInputTemplate = nodeTemplate.inputs.find(
    (input) => input.renderTypeList[0] === FlowNodeInputTypeEnum.addInputParam
  );
  const removedStoreInputs = new Set<FlowNodeInputItemType>();
  const replacedStoreInputs = new Map<FlowNodeInputItemType, FlowNodeInputItemType>();
  const isDynamicModelInput = (input: FlowNodeInputItemType) =>
    getSelectedInputRenderType(input) === FlowNodeInputTypeEnum.reference ||
    Array.isArray(input.value) ||
    (typeof input.value === 'string' && /^\{\{.*\}\}$/.test(input.value));
  for (const [legacyKey, modelIdKey] of workflowModelKeyMappings) {
    const canonicalInputs = storeNode.inputs.filter(
      (input) => input.key === modelIdKey && isWorkflowSystemModelInput({ node: storeNode, input })
    );
    const legacyInputs = storeNode.inputs.filter(
      (input) => input.key === legacyKey && isWorkflowSystemModelInput({ node: storeNode, input })
    );

    if (canonicalInputs.length > 0) {
      canonicalInputs.slice(1).forEach((input) => removedStoreInputs.add(input));
      legacyInputs.forEach((input) => removedStoreInputs.add(input));
    } else {
      legacyInputs.slice(1).forEach((input) => removedStoreInputs.add(input));
      const legacyInput = legacyInputs[0];
      if (legacyInput && isDynamicModelInput(legacyInput)) {
        replacedStoreInputs.set(legacyInput, { ...legacyInput, key: modelIdKey });
      }
    }
  }
  const adaptedStoreInputs = storeNode.inputs
    .filter((input) => !removedStoreInputs.has(input))
    .map((input) => replacedStoreInputs.get(input) ?? input);

  const getStoredInputForTemplate = (templateInput: FlowNodeInputItemType) => {
    const exactInput = adaptedStoreInputs.find((input) => input.key === templateInput.key);
    if (exactInput) return exactInput;

    const legacyKey = workflowModelKeyMappings.find(
      ([, modelIdKey]) => modelIdKey === templateInput.key
    )?.[0];
    if (!legacyKey || !isWorkflowSystemModelInput({ node: storeNode, input: templateInput })) {
      return templateInput;
    }

    return (
      adaptedStoreInputs.find(
        (input) => input.key === legacyKey && isWorkflowSystemModelInput({ node: storeNode, input })
      ) ?? templateInput
    );
  };

  const storedInputIsRepresentedByTemplate = (storeInput: FlowNodeInputItemType) => {
    if (orderedTemplateInputs.some((templateInput) => templateInput.key === storeInput.key)) {
      return true;
    }
    if (!isWorkflowSystemModelInput({ node: storeNode, input: storeInput })) return false;

    const modelIdKey = workflowModelKeyMappings.find(
      ([legacyKey]) => legacyKey === storeInput.key
    )?.[1];
    return orderedTemplateInputs.some(
      (templateInput) =>
        templateInput.key === modelIdKey &&
        isWorkflowSystemModelInput({ node: storeNode, input: templateInput })
    );
  };
  const collectionFilterVersion =
    storeNode.flowNodeType === FlowNodeTypeEnum.datasetSearchNode
      ? resolveDatasetTagFilterVersion({
          version: adaptedStoreInputs.find(
            (input) => input.key === NodeInputKeyEnum.collectionFilterVersion
          )?.value,
          filterValue: adaptedStoreInputs.find(
            (input) => input.key === NodeInputKeyEnum.collectionFilterMatch
          )?.value
        })
      : DatasetTagFilterVersionEnum.structured;
  const usesLegacyDatasetSearchFilter =
    storeNode.flowNodeType === FlowNodeTypeEnum.datasetSearchNode &&
    collectionFilterVersion === DatasetTagFilterVersionEnum.legacy;
  const isPluginNode = Boolean(storeNode.pluginId);

  // replace item data
  const nodeItem: FlowNodeItemType = {
    parentNodeId,
    ...nodeTemplate,
    ...storeNode,
    // 连接柄由当前模板控制，避免存量数据重新开启已禁用的 source。
    showSourceHandle: nodeTemplate.showSourceHandle,
    name: isPluginNode ? storeNode.name : t(storeNode.name),
    intro: isPluginNode || !storeNode.intro ? storeNode.intro : t(storeNode.intro),
    avatar:
      isPluginNode && storeNode.flowNodeType === FlowNodeTypeEnum.toolSet
        ? storeNode.avatar || nodeTemplate.avatar
        : (nodeTemplate.avatar ?? storeNode.avatar),
    version: nodeTemplate.version || storeNode.version,
    catchError: storeNode.catchError ?? nodeTemplate.catchError,
    // 按模板顺序恢复当前输入及存量废弃输入。
    inputs: orderedTemplateInputs
      .map<FlowNodeInputItemType>((inputTemplate) => {
        const storeInput = getStoredInputForTemplate(inputTemplate);
        const debugLabel = isPluginNode
          ? (storeInput.debugLabel ?? inputTemplate.debugLabel)
          : (inputTemplate.debugLabel ?? storeInput.debugLabel);
        const toolDescription = isPluginNode
          ? (storeInput.toolDescription ?? inputTemplate.toolDescription)
          : (inputTemplate.toolDescription ?? storeInput.toolDescription);
        const label =
          usesLegacyDatasetSearchFilter &&
          inputTemplate.key === NodeInputKeyEnum.collectionFilterMatch
            ? 'workflow:collection_metadata_filter'
            : isPluginNode
              ? (storeInput.label ?? inputTemplate.label)
              : inputTemplate.label;
        const description =
          usesLegacyDatasetSearchFilter &&
          inputTemplate.key === NodeInputKeyEnum.collectionFilterMatch
            ? 'workflow:filter_description'
            : isPluginNode
              ? (storeInput.description ?? inputTemplate.description)
              : inputTemplate.description;

        return {
          ...storeInput,
          // 插件节点保留实例 IO 文案快照；内部节点继续使用当前模板和 i18n key。
          ...inputTemplate,
          debugLabel: isPluginNode || !debugLabel ? debugLabel : t(debugLabel),
          toolDescription: isPluginNode || !toolDescription ? toolDescription : t(toolDescription),
          key: storeInput.key,
          label,
          description,
          placeholder: isPluginNode
            ? (storeInput.placeholder ?? inputTemplate.placeholder)
            : inputTemplate.placeholder,
          selectedType: (() => {
            // 旧节点用 textarea 手写 JSON；切到条件行渲染类型，但保留字符串 value 以便展示升级 UI。
            if (
              inputTemplate.key === NodeInputKeyEnum.collectionFilterMatch &&
              storeInput.selectedType === FlowNodeInputTypeEnum.textarea
            ) {
              return FlowNodeInputTypeEnum.datasetTagFilter;
            }
            return storeInput.selectedType ?? inputTemplate.selectedType;
          })(),
          value:
            inputTemplate.key === NodeInputKeyEnum.collectionFilterVersion
              ? collectionFilterVersion
              : storeInput.value
        };
      })
      .concat(
        // 追加未按模板顺序恢复的存量输入，例如自定义动态字段。
        adaptedStoreInputs
          .filter((item) => !storedInputIsRepresentedByTemplate(item))
          .map((item) => {
            const inputTemplate = nodeTemplate.inputs.find((input) => input.key === item.key);

            if (!dynamicInputTemplate) {
              return {
                ...item,
                deprecated: inputTemplate?.deprecated
              };
            }

            return {
              ...item,
              ...getInputComponentProps(dynamicInputTemplate),
              ...(item.defaultToAgentGenerated === true
                ? { canAgentGenerated: item.canAgentGenerated }
                : {}),
              deprecated: inputTemplate?.deprecated
            };
          })
      ),
    outputs: staticTemplateOutputs
      .map<FlowNodeTemplateOutputItemType>((outputTemplate) => {
        const storeOutput =
          storeNode.outputs.find((item) => item.key === outputTemplate.key) || outputTemplate;
        const outputDescription = storeOutput.description ?? outputTemplate.description;
        const outputLabel = isPluginNode
          ? (storeOutput.label ?? outputTemplate.label)
          : outputTemplate.label;

        return {
          ...storeOutput,
          ...outputTemplate,
          label: outputLabel,
          description:
            isPluginNode || !outputDescription ? outputDescription : t(outputDescription),
          id: storeOutput.id ?? outputTemplate.id,
          value: storeOutput.value ?? outputTemplate.value
        };
      })
      .concat(
        storeNode.outputs
          .filter((item) => !staticTemplateOutputs.find((output) => output.key === item.key))
          .map((item) => {
            const outputTemplate = nodeTemplate.outputs.find((output) => output.key === item.key);
            return {
              ...item,
              deprecated: outputTemplate?.deprecated
            };
          })
      )
  };

  // Loop 容器兜底：动态输出必须由同名 canEdit 输入声明驱动（NodeLoopRun 挂载时按
  // canEdit 输入集合同步删除/补全动态输出，未声明的动态输出会被删除并带走连线）。
  // AI 生成文档可能只声明了 outputs、未在 inputs 声明对应的 canEdit 输入
  // （loopCustomOutputs 的 addInputParam 机制要求两者成对出现），此处按动态输出
  // 自动补齐输入声明，避免应用后的画布内容被挂载逻辑误删还原。
  if (nodeItem.flowNodeType === FlowNodeTypeEnum.loopRun) {
    const declaredCanEditKeys = new Set(
      nodeItem.inputs.filter((input) => input.canEdit === true).map((input) => input.key)
    );
    const missingDynamicInputs = nodeItem.outputs
      .filter((output) => output.type === FlowNodeOutputTypeEnum.dynamic)
      .filter((output) => !declaredCanEditKeys.has(output.key))
      .map<FlowNodeInputItemType>((output) => ({
        key: output.key,
        label: output.label || output.key,
        valueType: output.valueType || WorkflowIOValueTypeEnum.any,
        renderTypeList: [FlowNodeInputTypeEnum.reference],
        selectedType: FlowNodeInputTypeEnum.reference,
        canEdit: true,
        required: false
      }));
    if (missingDynamicInputs.length > 0) {
      nodeItem.inputs = nodeItem.inputs.concat(missingDynamicInputs);
    }
  }
  nodeItem.inputs =
    nodeItem.flowNodeType === FlowNodeTypeEnum.pluginInput
      ? nodeItem.inputs.map((input) => {
          const renderTypeList = input.renderTypeList.filter(
            (type) => type !== FlowNodeInputTypeEnum.agentGenerated
          );
          return {
            ...input,
            renderTypeList,
            selectedType:
              input.selectedType === FlowNodeInputTypeEnum.agentGenerated
                ? renderTypeList[0]
                : input.selectedType
          };
        })
      : nodeItem.inputs.map((input) => normalizeFlowNodeInputType(input, { isTool }));

  // 输出能力由始终挂载的节点逻辑就近读取模型后计算，折叠不影响能力同步。

  return {
    id: storeNode.nodeId,
    type: storeNode.flowNodeType,
    data: nodeItem,
    selected,
    position: storeNode.position || { x: 0, y: 0 },
    zIndex
  };
};

export const filterSensitiveNodesData = (nodes: StoreNodeItemType[]) => {
  // 只清理 MCP/HTTP 工具配置的鉴权字段，不递归处理普通 value/defaultValue。
  const cloneNodes = JSON.parse(JSON.stringify(nodes)) as StoreNodeItemType[];
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const stripHeaderSecret = (value: unknown) => {
    if (!isRecord(value) || !('headerSecret' in value)) return value;
    const sanitized = { ...value };
    delete sanitized.headerSecret;
    return sanitized;
  };
  const clearToolCredentials = (toolConfig: unknown) => {
    if (!isRecord(toolConfig)) return;

    (['mcpTool', 'httpTool'] as const).forEach((key) => {
      const tool = toolConfig[key];
      if (isRecord(tool)) toolConfig[key] = stripHeaderSecret(tool);
    });

    (['mcpToolSet', 'httpToolSet'] as const).forEach((key) => {
      const toolSet = toolConfig[key];
      if (!isRecord(toolSet)) return;
      const sanitizedToolSet = stripHeaderSecret(toolSet);
      if (!isRecord(sanitizedToolSet)) return;
      if (Array.isArray(toolSet.toolList)) {
        sanitizedToolSet.toolList = toolSet.toolList.map(stripHeaderSecret);
      }
      toolConfig[key] = sanitizedToolSet;
    });
  };

  cloneNodes.forEach((node) => {
    clearToolCredentials(node.toolConfig);

    const selectedToolsInput = node.inputs.find(
      (input) => input.key === NodeInputKeyEnum.selectedTools
    );
    if (Array.isArray(selectedToolsInput?.value)) {
      selectedToolsInput.value.forEach((selectedTool) => {
        if (isRecord(selectedTool)) clearToolCredentials(selectedTool.toolConfig);
      });
    }
    // selected dataset
    if (node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode) {
      node.inputs.forEach((input) => {
        if (input.key === NodeInputKeyEnum.datasetSelectList) {
          input.value = [];
        }
      });
    }

    for (const input of node.inputs) {
      if (input.key === NodeInputKeyEnum.systemInputConfig) {
        input.value = undefined;
      }
    }
    return node;
  });
  return cloneNodes;
};

/* ====== edge ======= */
export const storeEdge2RenderEdge = ({ edge }: { edge: StoreEdgeItemType }) => {
  const sourceHandle = edge.sourceHandle.replace(/-source-(top|bottom|left)$/, '-source-right');
  const targetHandle = edge.targetHandle.replace(/-target-(top|bottom|right)$/, '-target-left');

  return {
    ...edge,
    id: getNanoid(),
    type: EDGE_TYPE,
    sourceHandle,
    targetHandle
  };
};

/* ====== IO ======= */
export const getInputComponentProps = (input: FlowNodeInputItemType) => {
  return {
    referencePlaceholder: input.referencePlaceholder,
    placeholder: input.placeholder,
    maxLength: input.maxLength,
    list: input.list,
    markList: input.markList,
    step: input.step,
    max: input.max,
    min: input.min,
    defaultValue: input.defaultValue,
    customInputConfig: input.customInputConfig,
    ...(input.canAgentGenerated === undefined ? {} : { canAgentGenerated: input.canAgentGenerated })
  };
};

/* ====== Reference ======= */
export const getRefData = ({
  variable,
  getNodeById,
  chatConfig
}: {
  variable?: ReferenceItemValueType;
  getNodeById: WorkflowDataContextType['getNodeById'];
  chatConfig: AppChatConfigType;
}) => {
  if (!variable)
    return {
      valueType: WorkflowIOValueTypeEnum.any,
      required: false
    };

  const node = getNodeById(variable[0]);
  const systemVariables = getWorkflowGlobalVariables({ chatConfig });

  if (!node) {
    const globalVariable = systemVariables.find((item) => item.key === variable?.[1]);
    return {
      valueType: globalVariable?.valueType || WorkflowIOValueTypeEnum.any,
      required: !!globalVariable?.required
    };
  }

  const output = node.outputs.find((item) => item.id === variable[1]);
  if (!output)
    return {
      valueType: WorkflowIOValueTypeEnum.any,
      required: false
    };

  return {
    valueType: output.valueType,
    required: !!output.required
  };
};
/**
 * 获取当前节点可引用的所有上游节点。
 * 结果按工作流入边距离由近到远排列；嵌套节点先取自身入边，再取父容器入边，
 * 最后追加全局变量，保证引用选择器优先展示最近的可用输出。
 */
export const getNodeAllSource = ({
  nodeId,
  getNodeById,
  edges,
  chatConfig,
  t,
  includeChildren,
  childrenNodeIdListMap
}: {
  nodeId: string;
  getNodeById: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
  edges: Edge[];
  chatConfig: AppChatConfigType;
  t: TFunction;
  includeChildren?: boolean;
  childrenNodeIdListMap?: Record<string, string[]>;
}): FlowNodeItemType[] => {
  // get current node
  const node = getNodeById(nodeId);
  if (!node) {
    return [];
  }

  const sourceNodes = new Map(
    getWorkflowReferenceSourceNodes({
      nodeId,
      getNodeById,
      edges,
      includeChildren,
      childrenNodeIdListMap
    }).map((source) => [source.nodeId, source])
  );

  sourceNodes.set(
    'system_global_variable',
    getGlobalVariableNode({
      t,
      chatConfig
    })
  );

  return Array.from(sourceNodes.values());
};

/* ====== Variables ======= */
/* get workflowStart output to global variables */
export const getWorkflowGlobalVariables = ({
  chatConfig
}: {
  chatConfig: AppChatConfigType;
}): EditorVariablePickerType[] => {
  return formatEditorVariablePickerIcon(
    getWorkflowReferenceVariables({
      chatConfig: getAppChatConfig({ chatConfig, isPublicFetch: true })
    })
  );
};

/* ====== Snapshot ======= */
export const compareSnapshot = (
  snapshot1: {
    nodes?: Node[];
    edges?: Edge<any>[] | undefined;
    chatConfig?: AppChatConfigType;
  },
  snapshot2: {
    nodes?: Node[];
    edges?: Edge<any>[];
    chatConfig?: AppChatConfigType;
  }
) => {
  const clone1 = cloneDeep(snapshot1);
  const clone2 = cloneDeep(snapshot2);

  if (!clone1.nodes || !clone2.nodes) return false;
  if (!clone1.edges || !clone2.edges) return false;

  const formatEdge = (edges: Edge[] | undefined) => {
    if (!edges) return [];
    return edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: edge.type
    }));
  };

  if (!isEqual(formatEdge(clone1.edges), formatEdge(clone2.edges))) {
    console.log('Edge not equal');
    return false;
  }

  if (
    clone1.chatConfig &&
    clone2.chatConfig &&
    !isEqual(
      {
        welcomeText: clone1.chatConfig?.welcomeText || '',
        welcomeConfig: clone1.chatConfig?.welcomeConfig || undefined,
        variables: clone1.chatConfig?.variables || [],
        questionGuide: clone1.chatConfig?.questionGuide || false,
        ttsConfig: clone1.chatConfig?.ttsConfig || undefined,
        whisperConfig: clone1.chatConfig?.whisperConfig || undefined,
        scheduledTriggerConfig: clone1.chatConfig?.scheduledTriggerConfig || undefined,
        chatInputGuide: clone1.chatConfig?.chatInputGuide || undefined,
        fileSelectConfig: clone1.chatConfig?.fileSelectConfig || undefined,
        instruction: clone1.chatConfig?.instruction || '',
        autoExecute: clone1.chatConfig?.autoExecute || undefined
      },
      {
        welcomeText: clone2.chatConfig?.welcomeText || '',
        welcomeConfig: clone2.chatConfig?.welcomeConfig || undefined,
        variables: clone2.chatConfig?.variables || [],
        questionGuide: clone2.chatConfig?.questionGuide || false,
        ttsConfig: clone2.chatConfig?.ttsConfig || undefined,
        whisperConfig: clone2.chatConfig?.whisperConfig || undefined,
        scheduledTriggerConfig: clone2.chatConfig?.scheduledTriggerConfig || undefined,
        chatInputGuide: clone2.chatConfig?.chatInputGuide || undefined,
        fileSelectConfig: clone2.chatConfig?.fileSelectConfig || undefined,
        instruction: clone2.chatConfig?.instruction || '',
        autoExecute: clone2.chatConfig?.autoExecute || undefined
      }
    )
  ) {
    console.log('chatConfig not equal');
    return false;
  }

  const formatNodes = (nodes: Node[]) => {
    return nodes
      .filter((node) => {
        if (!node) return;

        return true;
      })
      .map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: {
          id: node.data.id,
          flowNodeType: node.data.flowNodeType,
          inputs: node.data.inputs.map((input: FlowNodeInputItemType) => ({
            key: input.key,
            selectedType: getSelectedInputRenderType(input),
            renderTypeLis: input.renderTypeList,
            // set to arrayAny for nestedInputArray to skip valueType comparison
            // valueType: input.key === NodeInputKeyEnum.nestedInputArray ? 'arrayAny' : input.valueType,
            value: input.value ?? undefined
          })),
          outputs: node.data.outputs.map((item: FlowNodeOutputItemType) => ({
            key: item.key,
            type: item.type,
            value: item.value ?? undefined
          })),
          name: node.data.name,
          intro: node.data.intro,
          avatar: node.data.avatar,
          version: node.data.version,
          isFolded: node.data.isFolded
        }
      }));
  };
  const node1 = formatNodes(clone1.nodes);
  const node2 = formatNodes(clone2.nodes);

  node1.forEach((node, i) => {
    if (!isEqual(node, node2[i])) {
      console.log('node not equal');
    }
  });

  return isEqual(node1, node2);
};
