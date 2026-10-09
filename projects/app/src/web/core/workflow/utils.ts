import type { StoreNodeItemType, FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import type { Node, XYPosition } from 'reactflow';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import {
  EDGE_TYPE,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { EmptyNode } from '@fastgpt/global/core/workflow/template/system/emptyNode';
import { type StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type EditorVariablePickerType } from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import {
  formatEditorVariablePickerIcon,
  getAppChatConfig,
  getHandleId,
  getSelectedInputRenderType,
  isWorkflowSystemModelInput,
  workflowModelKeyMappings
} from '@fastgpt/global/core/workflow/utils';
import { type TFunction } from 'next-i18next';
import {
  type FlowNodeInputItemType,
  type FlowNodeOutputItemType,
  type ReferenceItemValueType
} from '@fastgpt/global/core/workflow/type/io';
import { type IfElseListItemType } from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { initNewIfElseList } from '@fastgpt/global/core/workflow/template/system/ifElse/utils';
import { type AppChatConfigType } from '@fastgpt/global/core/app/type';
import { workflowSystemVariables } from '../app/utils';
import {
  canInputBeAgentGenerated,
  normalizeFlowNodeInputType
} from '@fastgpt/global/core/app/formEdit/utils';
import { isEmptyModelValue } from '@fastgpt/global/core/ai/modelReference';
import {
  DatasetTagFilterVersionEnum,
  resolveDatasetTagFilterVersion
} from '@fastgpt/global/core/dataset/workflowTagFilter';

export {
  filterSelectableWorkflowNodeOutputs,
  filterWorkflowNodeOutputsByType,
  getWorkflowReferenceItems,
  isConfiguredReferenceValue,
  isEmptyReferenceValue,
  isWorkflowEdgeSourceHandleValid,
  isWorkflowReferenceItem,
  type WorkflowReferenceSourceNode,
  workflowValueTypeIsCompatible
} from '@fastgpt/global/core/workflow/editor/utils';

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
  const name = t(template.name as any);

  // 用持久化节点数据覆盖模板默认值。
  const moduleItem: FlowNodeItemType = {
    ...template,
    name: formatName?.(name) ?? name,
    intro: template.intro ? t(template.intro as any) : template.intro,
    nodeId: getNanoid(),
    parentNodeId
  };

  // 仅创建时初始化主模型；已有值和引用模式原样保留，不读写持久化的上次选择记录。
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
    moduleTemplatesFlat.find((template) => template.flowNodeType === storeNode.flowNodeType) ||
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

  // replace item data
  const nodeItem: FlowNodeItemType = {
    parentNodeId,
    ...nodeTemplate,
    ...storeNode,
    // 连接柄由当前模板控制，避免存量数据重新开启已禁用的 source。
    showSourceHandle: nodeTemplate.showSourceHandle,
    name: t(storeNode.name as any),
    intro: storeNode.intro ? t(storeNode.intro as any) : storeNode.intro,
    avatar: nodeTemplate.avatar ?? storeNode.avatar,
    version: nodeTemplate.version || storeNode.version,
    catchError: storeNode.catchError ?? nodeTemplate.catchError,
    // 按模板顺序恢复当前输入及存量废弃输入。
    inputs: orderedTemplateInputs
      .map<FlowNodeInputItemType>((inputTemplate) => {
        const storeInput = getStoredInputForTemplate(inputTemplate);

        return {
          ...storeInput,
          // 迁移层不写入 locale 相关的展示字段；恢复画布时以当前模板为准，避免旧语言文本残留。
          ...inputTemplate,
          debugLabel: t(inputTemplate.debugLabel ?? (storeInput.debugLabel as any)),
          toolDescription: t(inputTemplate.toolDescription ?? (storeInput.toolDescription as any)),
          key: storeInput.key,
          label:
            usesLegacyDatasetSearchFilter &&
            inputTemplate.key === NodeInputKeyEnum.collectionFilterMatch
              ? 'workflow:collection_metadata_filter'
              : inputTemplate.label,
          description:
            usesLegacyDatasetSearchFilter &&
            inputTemplate.key === NodeInputKeyEnum.collectionFilterMatch
              ? 'workflow:filter_description'
              : inputTemplate.description,
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
      .map<FlowNodeOutputItemType>((outputTemplate) => {
        const storeOutput =
          storeNode.outputs.find((item) => item.key === outputTemplate.key) || outputTemplate;

        return {
          ...storeOutput,
          ...outputTemplate,
          description: t(outputTemplate.description ?? (storeOutput.description as any)),
          id: storeOutput.id ?? outputTemplate.id,
          value: storeOutput.value ?? outputTemplate.value,
          // invalid 是编辑器层按当前模型能力计算的派生状态，不从持久化节点恢复。
          invalid: outputTemplate.invalid
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
  // 当前导出脱敏范围与历史基线保持一致，仅处理数据集选择和系统密钥输入；工具配置暂不做递归脱敏，避免误删普通 value/defaultValue。
  const cloneNodes = JSON.parse(JSON.stringify(nodes)) as StoreNodeItemType[];

  cloneNodes.forEach((node) => {
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

/* ====== 节点 IO 分类 ======= */

/**
 * 将工具输入和普通节点输入分开，避免 Agent 生成参数在节点内重复渲染。
 * isTool 由调用方按连线判定（见 useIsToolNode），本函数只做纯分类。
 */
export const splitToolInputsByMode = (inputs: FlowNodeInputItemType[], isTool: boolean) => {
  const toolInputs: FlowNodeInputItemType[] = [];
  const commonInputs: FlowNodeInputItemType[] = [];

  inputs.forEach((item) => {
    const normalizedInput = normalizeFlowNodeInputType(item, { isTool });
    // canEdit 仅表示该字段可在节点内编辑；代码变量不应自动成为工具参数。
    const isToolParamInput =
      item.canEdit === true &&
      item.defaultToAgentGenerated === true &&
      canInputBeAgentGenerated(item);

    if (isTool && isToolParamInput) {
      toolInputs.push(item);
      return;
    }

    commonInputs.push(normalizedInput);
  });

  return {
    toolInputs,
    commonInputs
  };
};

/** 单次遍历把输出分成可展示的成功输出、隐藏输出与错误捕获输出。 */
export const splitNodeOutputs = (outputs: FlowNodeOutputItemType[]) => {
  const successOutputs: FlowNodeOutputItemType[] = [];
  const hiddenOutputs: FlowNodeOutputItemType[] = [];
  const errorOutputs: FlowNodeOutputItemType[] = [];

  outputs.forEach((item) => {
    if (
      item.type === FlowNodeOutputTypeEnum.dynamic ||
      item.type === FlowNodeOutputTypeEnum.static ||
      item.type === FlowNodeOutputTypeEnum.source
    ) {
      successOutputs.push(item);
    } else if (item.type === FlowNodeOutputTypeEnum.hidden) {
      hiddenOutputs.push(item);
    } else {
      errorOutputs.push(item);
    }
  });

  return {
    successOutputs,
    hiddenOutputs,
    errorOutputs
  };
};

/* ====== Reference ======= */
export const getRefData = ({
  variable,
  getNodeById,
  chatConfig
}: {
  variable?: ReferenceItemValueType;
  getNodeById: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
  chatConfig?: AppChatConfigType;
}) => {
  if (!variable)
    return {
      valueType: WorkflowIOValueTypeEnum.any,
      required: false
    };

  const node = getNodeById(variable[0]);
  if (!node && variable[0] === VARIABLE_NODE_ID) {
    const globalVariable = getWorkflowGlobalVariables({
      chatConfig: chatConfig ?? {}
    }).find((item) => item.key === variable[1]);
    return {
      valueType: globalVariable?.valueType ?? WorkflowIOValueTypeEnum.any,
      required: !!globalVariable?.required
    };
  }

  if (!node) {
    return {
      valueType: WorkflowIOValueTypeEnum.any,
      required: false
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
 * 图查询只用到连线端点与 handle；画布边与 Runtime 文档边都满足这个形状。
 */
export type WorkflowGraphEdge = {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

/**
 * 收集某个输出字段 source handle 上的连线断开命令。
 *
 * 删除或替换输出字段时，旧 handle 上的连线必须和 outputs 一起消失；调用方把结果作为
 * updateNode 的 disconnectEdges 传入，保证一个事务、一条历史。
 * index 按降序返回：同一事务内逐条删除会改变后续下标。
 */
export const getOutputDisconnectCommands = ({
  edges,
  nodeId,
  outputKey
}: {
  edges: readonly WorkflowGraphEdge[];
  nodeId: string;
  outputKey: string;
}): { index: number }[] => {
  const handle = getHandleId(nodeId, 'source', outputKey);
  const indexes: number[] = [];
  edges.forEach((edge, index) => {
    if (edge.source === nodeId && edge.sourceHandle === handle) indexes.push(index);
  });
  return indexes.sort((a, b) => b - a).map((index) => ({ index }));
};

/* ====== Variables ======= */
/* get workflowStart output to global variables */
export const getWorkflowGlobalVariables = ({
  chatConfig
}: {
  chatConfig: AppChatConfigType;
}): EditorVariablePickerType[] => {
  const globalVariables = formatEditorVariablePickerIcon(
    getAppChatConfig({
      chatConfig,
      isPublicFetch: true
    })?.variables || []
  );

  return [...globalVariables, ...workflowSystemVariables];
};
