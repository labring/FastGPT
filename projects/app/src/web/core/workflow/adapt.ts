import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { getHandleConfig } from '@fastgpt/global/core/workflow/template/utils';
import { FlowNodeItemType, StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { LLMModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import { PluginTypeEnum } from '@fastgpt/global/core/plugin/constants';
import { getWorkflowGlobalVariables } from './utils';
import { TFunction } from 'next-i18next';
import { AppChatConfigType } from '@fastgpt/global/core/app/type';

export const getGlobalVariableNode = ({
  nodes,
  chatConfig,
  t
}: {
  nodes: FlowNodeItemType[];
  chatConfig: AppChatConfigType;
  t: TFunction;
}) => {
  const template: FlowNodeTemplateType = {
    id: FlowNodeTypeEnum.globalVariable,
    templateType: FlowNodeTemplateTypeEnum.other,
    flowNodeType: FlowNodeTypeEnum.emptyNode,
    sourceHandle: getHandleConfig(false, false, false, false),
    targetHandle: getHandleConfig(false, false, false, false),
    avatar: 'core/workflow/template/variable',
    name: t('common:core.module.Variable'),
    intro: '',
    unique: true,
    forbidDelete: true,
    version: '481',
    inputs: [],
    outputs: []
  };

  const globalVariables = getWorkflowGlobalVariables({ nodes, chatConfig });

  const variableNode: FlowNodeItemType = {
    nodeId: VARIABLE_NODE_ID,
    ...template,
    outputs: globalVariables.map((item) => ({
      id: item.key,
      type: FlowNodeOutputTypeEnum.static,
      label: item.label,
      key: item.key,
      valueType: item.valueType || WorkflowIOValueTypeEnum.any
    }))
  };

  return variableNode;
};

/* adapt v1 workfwlo */
enum InputTypeEnum {
  triggerAndFinish = 'triggerAndFinish',
  systemInput = 'systemInput', // history, userChatInput, variableInput

  input = 'input', // one line input
  numberInput = 'numberInput',
  select = 'select',
  slider = 'slider',
  target = 'target', // data input
  switch = 'switch',

  // editor
  textarea = 'textarea',
  JSONEditor = 'JSONEditor',

  addInputParam = 'addInputParam', // params input

  selectApp = 'selectApp',

  // chat special input
  aiSettings = 'aiSettings',

  // ai model select
  selectLLMModel = 'selectLLMModel',
  settingLLMModel = 'settingLLMModel',

  // dataset special input
  selectDataset = 'selectDataset',
  selectDatasetParamsModal = 'selectDatasetParamsModal',
  settingDatasetQuotePrompt = 'settingDatasetQuotePrompt',

  hidden = 'hidden',
  custom = 'custom'
}
enum FlowTypeEnum {
  userGuide = 'userGuide',
  questionInput = 'questionInput',
  chatNode = 'chatNode',

  datasetSearchNode = 'datasetSearchNode',
  datasetConcatNode = 'datasetConcatNode',

  answerNode = 'answerNode',
  classifyQuestion = 'classifyQuestion',
  contentExtract = 'contentExtract',
  httpRequest468 = 'httpRequest468',
  runApp = 'app',
  pluginModule = 'pluginModule',
  pluginInput = 'pluginInput',
  pluginOutput = 'pluginOutput',
  queryExtension = 'cfr',
  tools = 'tools',
  stopTool = 'stopTool',
  lafModule = 'lafModule'
}
enum OutputTypeEnum {
  answer = 'answer',
  source = 'source',
  hidden = 'hidden',

  addOutputParam = 'addOutputParam'
}
type V1WorkflowType = {
  name: string;
  avatar?: string;
  intro?: string;
  moduleId: string;
  position?: {
    x: number;
    y: number;
  };
  flowType: FlowTypeEnum;
  showStatus?: boolean;
  inputs: {
    valueType?: WorkflowIOValueTypeEnum; // data type
    type: InputTypeEnum; // Node Type. Decide on a render style
    key: `${NodeInputKeyEnum}` | string;
    value?: any;
    label: string;
    description?: string;
    required?: boolean;
    toolDescription?: string; // If this field is not empty, it is entered as a tool

    edit?: boolean; // Whether to allow editing
    editField?: {
      inputType?: boolean;
      required?: boolean;
      isToolInput?: boolean;
      name?: boolean;
      key?: boolean;
      description?: boolean;
      dataType?: boolean;
      defaultValue?: boolean;
    };
    defaultEditField?: {
      inputType?: InputTypeEnum; // input type
      outputType?: FlowNodeOutputTypeEnum;
      required?: boolean;
      key?: string;
      label?: string;
      description?: string;
      valueType?: WorkflowIOValueTypeEnum;
      isToolInput?: boolean;
      defaultValue?: string;
    };

    connected?: boolean; // There are incoming data

    showTargetInApp?: boolean;
    showTargetInPlugin?: boolean;

    hideInApp?: boolean;
    hideInPlugin?: boolean;

    placeholder?: string; // input,textarea

    list?: { label: string; value: any }[]; // select

    markList?: { label: string; value: any }[]; // slider
    step?: number; // slider
    max?: number; // slider, number input
    min?: number; // slider, number input

    llmModelType?: `${LLMModelTypeEnum}`;
  }[];
  outputs: {
    type?: OutputTypeEnum;
    key: `${NodeOutputKeyEnum}` | string;
    valueType?: WorkflowIOValueTypeEnum;

    label?: string;
    description?: string;
    required?: boolean;
    defaultValue?: any;

    edit?: boolean;
    editField?: {
      inputType?: boolean;
      required?: boolean;
      isToolInput?: boolean;
      name?: boolean;
      key?: boolean;
      description?: boolean;
      dataType?: boolean;
      defaultValue?: boolean;
    };
    defaultEditField?: {
      inputType?: `${FlowNodeInputTypeEnum}`; // input type
      outputType?: FlowNodeOutputTypeEnum;
      required?: boolean;
      key?: string;
      label?: string;
      description?: string;
      valueType?: `${WorkflowIOValueTypeEnum}`;
      isToolInput?: boolean;
      defaultValue?: string;
    };

    targets: { moduleId: string; key: string }[];
  }[];

  // runTime field
  isEntry?: boolean;
  pluginType?: `${PluginTypeEnum}`;
  parentId?: string;
};
export const v1Workflow2V2 = (
  nodes: V1WorkflowType[]
): {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
} => {
  let copyNodes = JSON.parse(JSON.stringify(nodes)) as V1WorkflowType[];

  // 只保留1个开始节点
  copyNodes = copyNodes.filter((node, index, self) => {
    if (node.flowType === FlowTypeEnum.questionInput) {
      return index === self.findIndex((item) => item.flowType === FlowTypeEnum.questionInput);
    }
    return true;
  });

  const newNodes: StoreNodeItemType[] = copyNodes.map((node) => {
    // flowNodeType adapt
    const nodeTypeMap = {
      [FlowTypeEnum.userGuide]: FlowNodeTypeEnum.systemConfig,
      [FlowTypeEnum.questionInput]: FlowNodeTypeEnum.workflowStart,
      [FlowTypeEnum.chatNode]: FlowNodeTypeEnum.chatNode,
      [FlowTypeEnum.datasetSearchNode]: FlowNodeTypeEnum.datasetSearchNode,
      [FlowTypeEnum.datasetConcatNode]: FlowNodeTypeEnum.datasetConcatNode,
      [FlowTypeEnum.answerNode]: FlowNodeTypeEnum.answerNode,
      [FlowTypeEnum.classifyQuestion]: FlowNodeTypeEnum.classifyQuestion,
      [FlowTypeEnum.contentExtract]: FlowNodeTypeEnum.contentExtract,
      [FlowTypeEnum.httpRequest468]: FlowNodeTypeEnum.httpRequest468,
      [FlowTypeEnum.runApp]: FlowNodeTypeEnum.runApp,
      [FlowTypeEnum.pluginModule]: FlowNodeTypeEnum.pluginModule,
      [FlowTypeEnum.pluginInput]: FlowNodeTypeEnum.pluginInput,
      [FlowTypeEnum.pluginOutput]: FlowNodeTypeEnum.pluginOutput,
      [FlowTypeEnum.queryExtension]: FlowNodeTypeEnum.queryExtension,
      [FlowTypeEnum.tools]: FlowNodeTypeEnum.tools,
      [FlowTypeEnum.stopTool]: FlowNodeTypeEnum.stopTool,
      [FlowTypeEnum.lafModule]: FlowNodeTypeEnum.lafModule
    };

    const inputTypeMap: Record<any, FlowNodeInputTypeEnum> = {
      [InputTypeEnum.systemInput]: FlowNodeInputTypeEnum.input,
      [InputTypeEnum.input]: FlowNodeInputTypeEnum.input,
      [InputTypeEnum.numberInput]: FlowNodeInputTypeEnum.numberInput,
      [InputTypeEnum.select]: FlowNodeInputTypeEnum.select,
      [InputTypeEnum.target]: FlowNodeInputTypeEnum.reference,
      [InputTypeEnum.switch]: FlowNodeInputTypeEnum.switch,
      [InputTypeEnum.textarea]: FlowNodeInputTypeEnum.textarea,
      [InputTypeEnum.JSONEditor]: FlowNodeInputTypeEnum.JSONEditor,
      [InputTypeEnum.addInputParam]: FlowNodeInputTypeEnum.addInputParam,
      [InputTypeEnum.selectApp]: FlowNodeInputTypeEnum.selectApp,
      [InputTypeEnum.selectLLMModel]: FlowNodeInputTypeEnum.selectLLMModel,
      [InputTypeEnum.settingLLMModel]: FlowNodeInputTypeEnum.settingLLMModel,
      [InputTypeEnum.selectDataset]: FlowNodeInputTypeEnum.selectDataset,
      [InputTypeEnum.selectDatasetParamsModal]: FlowNodeInputTypeEnum.selectDatasetParamsModal,
      [InputTypeEnum.settingDatasetQuotePrompt]: FlowNodeInputTypeEnum.settingDatasetQuotePrompt,
      [InputTypeEnum.hidden]: FlowNodeInputTypeEnum.hidden,
      [InputTypeEnum.custom]: FlowNodeInputTypeEnum.custom
    };
    let pluginId: string | undefined = undefined;
    const inputs = node.inputs
      .map<FlowNodeInputItemType>((input) => {
        const newInput: FlowNodeInputItemType = {
          ...input,
          selectedTypeIndex: 0,
          renderTypeList: !input.type
            ? [FlowNodeInputTypeEnum.custom]
            : inputTypeMap[input.type]
              ? [inputTypeMap[input.type]]
              : [],

          key: input.key,
          value: input.value,
          valueType: input.valueType,

          label: input.label,
          description: input.description,
          required: input.required,
          toolDescription: input.toolDescription,
          canEdit: input.edit,
          placeholder: input.placeholder,
          list: input.list,
          markList: input.markList,
          step: input.step,
          max: input.max,
          min: input.min,
          llmModelType: input.llmModelType
        };

        if (input.key === 'userChatInput') {
          newInput.label = '问题输入';
        } else if (input.key === 'quoteQA') {
          newInput.label = '';
        } else if (input.key === 'pluginId') {
          pluginId = input.value;
        }

        return newInput;
      })
      .filter((input) => input.renderTypeList.length > 0)
      .filter((input) => {
        if (input.key === 'pluginId') {
          return false;
        }
        if (input.key === 'switch') {
          return false;
        }
        if (input.key === 'pluginStart') {
          return false;
        }
        if (input.key === 'DYNAMIC_INPUT_KEY') return;
        if (input.key === 'system_addInputParam') return;
        return true;
      });

    const outputTypeMap: Record<any, FlowNodeOutputTypeEnum> = {
      [OutputTypeEnum.addOutputParam]: FlowNodeOutputTypeEnum.dynamic,
      [OutputTypeEnum.answer]: FlowNodeOutputTypeEnum.static,
      [OutputTypeEnum.source]: FlowNodeOutputTypeEnum.static,
      [OutputTypeEnum.hidden]: FlowNodeOutputTypeEnum.hidden
    };

    const outputs = node.outputs
      .map<FlowNodeOutputItemType>((output) => ({
        id: output.key,
        type: output.type ? outputTypeMap[output.type] : FlowNodeOutputTypeEnum.static,
        key: output.key,
        valueType: output.valueType,
        label: output.label,
        description: output.description,
        required: output.required,
        defaultValue: output.defaultValue,
        canEdit: output.edit,
        editField: output.editField
      }))
      .filter((output) => {
        if (node.flowType === FlowTypeEnum.pluginOutput) return false;
        if (output.key === 'finish') return false;
        if (output.key === 'isEmpty') return false;
        if (output.key === 'unEmpty') return false;
        if (output.key === 'pluginStart') return false;
        if (node.flowType !== FlowTypeEnum.questionInput && output.key === 'userChatInput')
          return false;
        if (
          node.flowType === FlowTypeEnum.contentExtract &&
          (output.key === 'success' || output.key === 'failed')
        )
          return;

        return true;
      });

    // special node
    if (node.flowType === FlowTypeEnum.questionInput) {
      node.name = '流程开始';
    } else if (node.flowType === FlowTypeEnum.pluginOutput) {
      node.outputs.forEach((output) => {
        inputs.push({
          key: output.key,
          valueType: output.valueType,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          label: output.key,
          canEdit: true
        });
      });
    }

    return {
      nodeId: node.moduleId,
      position: node.position,
      flowNodeType: nodeTypeMap[node.flowType],
      avatar: node.flowType === FlowTypeEnum.pluginModule ? node.avatar : undefined,
      name: node.name,
      intro: node.intro,
      showStatus: node.showStatus,
      pluginId,
      pluginType: node.pluginType,
      parentId: node.parentId,
      version: '481',

      inputs,
      outputs
    };
  });
  let newEdges: StoreEdgeItemType[] = [];

  // 遍历output，连线
  copyNodes.forEach((node) => {
    node.outputs.forEach((output) => {
      output.targets?.forEach((target) => {
        if (output.key === 'finish') return;
        if (output.key === 'isEmpty') return;
        if (output.key === 'unEmpty') return;
        if (node.flowType !== FlowTypeEnum.questionInput && output.key === 'userChatInput') return;

        if (output.key === NodeOutputKeyEnum.selectedTools) {
          newEdges.push({
            source: node.moduleId,
            sourceHandle: NodeOutputKeyEnum.selectedTools,
            target: target.moduleId,
            targetHandle: NodeOutputKeyEnum.selectedTools
          });
        } else if (node.flowType === FlowTypeEnum.classifyQuestion) {
          newEdges.push({
            source: node.moduleId,
            sourceHandle: getHandleId(node.moduleId, 'source', output.key),
            target: target.moduleId,
            targetHandle: getHandleId(target.moduleId, 'target', 'left')
          });
        } else if (node.flowType === FlowTypeEnum.contentExtract) {
        } else {
          newEdges.push({
            source: node.moduleId,
            sourceHandle: getHandleId(node.moduleId, 'source', 'right'),
            target: target.moduleId,
            targetHandle: getHandleId(target.moduleId, 'target', 'left')
          });
        }
      });
    });
  });

  // 去除相同source和target的线
  newEdges = newEdges.filter((edge, index, self) => {
    return (
      self.findIndex((item) => item.source === edge.source && item.target === edge.target) === index
    );
  });

  const workflowStart = newNodes.find(
    (node) => node.flowNodeType === FlowNodeTypeEnum.workflowStart
  );

  /* 更新input的取值 */
  copyNodes.forEach((node) => {
    node.outputs.forEach((output) => {
      output.targets?.forEach((target) => {
        const targetNode = newNodes.find((item) => item.nodeId === target.moduleId);
        if (!targetNode) return;

        const targetInput = targetNode.inputs.find((item) => item.key === target.key);
        if (!targetInput) return;

        targetInput.value = [node.moduleId, output.key];
      });
    });
  });

  // 更新特殊的输入(输入全部从开始取)
  newNodes.forEach((node) => {
    node.inputs.forEach((input) => {
      if (workflowStart && input.key === NodeInputKeyEnum.userChatInput) {
        input.value = [workflowStart.nodeId, NodeOutputKeyEnum.userChatInput];
      }
    });
  });

  console.log({
    nodes: newNodes.filter((node) => node.nodeId),
    edges: newEdges
  });
  return {
    nodes: newNodes.filter((node) => node.nodeId),
    edges: newEdges
  };
};
