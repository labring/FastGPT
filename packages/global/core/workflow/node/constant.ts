import { WorkflowIOValueTypeEnum } from '../constants';

export enum FlowNodeInputTypeEnum { // render ui
  reference = 'reference', // reference to other node output
  input = 'input', // one line input
  numberInput = 'numberInput',
  switch = 'switch', // true/false
  select = 'select',

  // editor
  textarea = 'textarea',
  JSONEditor = 'JSONEditor',

  addInputParam = 'addInputParam', // params input

  // special input
  selectApp = 'selectApp',

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
export const FlowNodeInputMap: Record<
  FlowNodeInputTypeEnum,
  {
    icon: string;
  }
> = {
  [FlowNodeInputTypeEnum.reference]: {
    icon: 'core/workflow/inputType/reference'
  },
  [FlowNodeInputTypeEnum.input]: {
    icon: 'core/workflow/inputType/input'
  },
  [FlowNodeInputTypeEnum.numberInput]: {
    icon: 'core/workflow/inputType/numberInput'
  },
  [FlowNodeInputTypeEnum.select]: {
    icon: 'core/workflow/inputType/input'
  },
  [FlowNodeInputTypeEnum.switch]: {
    icon: 'core/workflow/inputType/switch'
  },
  [FlowNodeInputTypeEnum.textarea]: {
    icon: 'core/workflow/inputType/textarea'
  },
  [FlowNodeInputTypeEnum.JSONEditor]: {
    icon: 'core/workflow/inputType/jsonEditor'
  },
  [FlowNodeInputTypeEnum.addInputParam]: {
    icon: 'core/workflow/inputType/dynamic'
  },
  [FlowNodeInputTypeEnum.selectApp]: {
    icon: 'core/workflow/inputType/selectApp'
  },
  [FlowNodeInputTypeEnum.selectLLMModel]: {
    icon: 'core/workflow/inputType/selectLLM'
  },
  [FlowNodeInputTypeEnum.settingLLMModel]: {
    icon: 'core/workflow/inputType/selectLLM'
  },
  [FlowNodeInputTypeEnum.selectDataset]: {
    icon: 'core/workflow/inputType/selectDataset'
  },
  [FlowNodeInputTypeEnum.selectDatasetParamsModal]: {
    icon: 'core/workflow/inputType/selectDataset'
  },
  [FlowNodeInputTypeEnum.settingDatasetQuotePrompt]: {
    icon: 'core/workflow/inputType/selectDataset'
  },
  [FlowNodeInputTypeEnum.hidden]: {
    icon: 'core/workflow/inputType/select'
  },
  [FlowNodeInputTypeEnum.custom]: {
    icon: 'core/workflow/inputType/select'
  }
};

export enum FlowNodeOutputTypeEnum {
  hidden = 'hidden',
  source = 'source',
  static = 'static',
  dynamic = 'dynamic'
}

export enum FlowNodeTypeEnum {
  emptyNode = 'emptyNode',
  systemConfig = 'userGuide',
  globalVariable = 'globalVariable',
  workflowStart = 'workflowStart',
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
  lafModule = 'lafModule',
  ifElseNode = 'ifElseNode',
  variableUpdate = 'variableUpdate',
  code = 'code',
  textEditor = 'textEditor',
  customFeedback = 'customFeedback'
}

// node IO value type
export const FlowValueTypeMap = {
  [WorkflowIOValueTypeEnum.string]: {
    label: 'string',
    value: WorkflowIOValueTypeEnum.string,
    description: ''
  },
  [WorkflowIOValueTypeEnum.number]: {
    label: 'number',
    value: WorkflowIOValueTypeEnum.number,
    description: ''
  },
  [WorkflowIOValueTypeEnum.boolean]: {
    label: 'boolean',
    value: WorkflowIOValueTypeEnum.boolean,
    description: ''
  },
  [WorkflowIOValueTypeEnum.object]: {
    label: 'object',
    value: WorkflowIOValueTypeEnum.object,
    description: ''
  },
  [WorkflowIOValueTypeEnum.arrayString]: {
    label: 'array<string>',
    value: WorkflowIOValueTypeEnum.arrayString,
    description: ''
  },
  [WorkflowIOValueTypeEnum.arrayNumber]: {
    label: 'array<number>',
    value: WorkflowIOValueTypeEnum.arrayNumber,
    description: ''
  },
  [WorkflowIOValueTypeEnum.arrayBoolean]: {
    label: 'array<boolean>',
    value: WorkflowIOValueTypeEnum.arrayBoolean,
    description: ''
  },
  [WorkflowIOValueTypeEnum.arrayObject]: {
    label: 'array<object>',
    value: WorkflowIOValueTypeEnum.arrayObject,
    description: ''
  },
  [WorkflowIOValueTypeEnum.any]: {
    label: 'any',
    value: WorkflowIOValueTypeEnum.any,
    description: ''
  },
  [WorkflowIOValueTypeEnum.chatHistory]: {
    label: '历史记录',
    value: WorkflowIOValueTypeEnum.chatHistory,
    description: `{
  obj: System | Human | AI;
  value: string;
}[]`
  },
  [WorkflowIOValueTypeEnum.datasetQuote]: {
    label: '知识库引用',
    value: WorkflowIOValueTypeEnum.datasetQuote,
    description: `{
  id: string;
  datasetId: string;
  collectionId: string;
  sourceName: string;
  sourceId?: string;
  q: string;
  a: string
}[]`
  },
  [WorkflowIOValueTypeEnum.selectApp]: {
    label: '选择应用',
    value: WorkflowIOValueTypeEnum.selectApp,
    description: ''
  },
  [WorkflowIOValueTypeEnum.selectDataset]: {
    label: '选择知识库',
    value: WorkflowIOValueTypeEnum.selectDataset,
    description: `{
  datasetId: string;
}`
  },
  [WorkflowIOValueTypeEnum.dynamic]: {
    label: '动态输入',
    value: WorkflowIOValueTypeEnum.dynamic,
    description: ''
  }
};

export const EDGE_TYPE = 'default';
export const defaultNodeVersion = '481';
