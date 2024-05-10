export enum FlowNodeInputTypeEnum { // render ui
  reference = 'reference', // reference to other node output
  input = 'input', // one line input
  numberInput = 'numberInput',
  switch = 'switch', // true/false

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

  select = 'select',

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
  variableUpdate = 'variableUpdate'
}

export const EDGE_TYPE = 'default';

export const NodeVersions: Record<FlowNodeTypeEnum, string> = {
  [FlowNodeTypeEnum.emptyNode]: 'v2.0',
  [FlowNodeTypeEnum.systemConfig]: 'v2.0',
  [FlowNodeTypeEnum.globalVariable]: 'v2.0',
  [FlowNodeTypeEnum.workflowStart]: 'v2.0',
  [FlowNodeTypeEnum.chatNode]: 'v2.0',
  [FlowNodeTypeEnum.datasetSearchNode]: 'v2.0',
  [FlowNodeTypeEnum.datasetConcatNode]: 'v2.0',
  [FlowNodeTypeEnum.answerNode]: 'v2.0',
  [FlowNodeTypeEnum.classifyQuestion]: 'v2.0',
  [FlowNodeTypeEnum.contentExtract]: 'v2.0',
  [FlowNodeTypeEnum.httpRequest468]: 'v2.0',
  [FlowNodeTypeEnum.runApp]: 'v2.0',
  [FlowNodeTypeEnum.pluginModule]: 'v2.0',
  [FlowNodeTypeEnum.pluginInput]: 'v2.0',
  [FlowNodeTypeEnum.pluginOutput]: 'v2.0',
  [FlowNodeTypeEnum.queryExtension]: 'v2.0',
  [FlowNodeTypeEnum.tools]: 'v2.0',
  [FlowNodeTypeEnum.stopTool]: 'v2.0',
  [FlowNodeTypeEnum.lafModule]: 'v2.0',
  [FlowNodeTypeEnum.ifElseNode]: 'v2.0',
  [FlowNodeTypeEnum.variableUpdate]: 'v2.0'
};
