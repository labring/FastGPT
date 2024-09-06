import { WorkflowIOValueTypeEnum } from '../constants';
import { i18nT } from '../../../../web/i18n/utils';
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
  customVariable = 'customVariable',

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
    icon: 'core/workflow/inputType/option'
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
  [FlowNodeInputTypeEnum.customVariable]: {
    icon: 'core/workflow/inputType/customVariable'
  },
  [FlowNodeInputTypeEnum.custom]: {
    icon: 'core/workflow/inputType/custom'
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
  pluginConfig = 'pluginConfig',
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
  appModule = 'appModule',
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
  customFeedback = 'customFeedback',
  readFiles = 'readFiles',
  userSelect = 'userSelect'
}

// node IO value type
export const FlowValueTypeMap = {
  [WorkflowIOValueTypeEnum.string]: {
    label: 'string',
    value: WorkflowIOValueTypeEnum.string
  },
  [WorkflowIOValueTypeEnum.number]: {
    label: 'number',
    value: WorkflowIOValueTypeEnum.number
  },
  [WorkflowIOValueTypeEnum.boolean]: {
    label: 'boolean',
    value: WorkflowIOValueTypeEnum.boolean
  },
  [WorkflowIOValueTypeEnum.object]: {
    label: 'object',
    value: WorkflowIOValueTypeEnum.object
  },
  [WorkflowIOValueTypeEnum.arrayString]: {
    label: 'array<string>',
    value: WorkflowIOValueTypeEnum.arrayString
  },
  [WorkflowIOValueTypeEnum.arrayNumber]: {
    label: 'array<number>',
    value: WorkflowIOValueTypeEnum.arrayNumber
  },
  [WorkflowIOValueTypeEnum.arrayBoolean]: {
    label: 'array<boolean>',
    value: WorkflowIOValueTypeEnum.arrayBoolean
  },
  [WorkflowIOValueTypeEnum.arrayObject]: {
    label: 'array<object>',
    value: WorkflowIOValueTypeEnum.arrayObject
  },
  [WorkflowIOValueTypeEnum.any]: {
    label: 'any',
    value: WorkflowIOValueTypeEnum.any
  },
  [WorkflowIOValueTypeEnum.chatHistory]: {
    label: i18nT('common:core.chat.History'),
    value: WorkflowIOValueTypeEnum.chatHistory
  },
  [WorkflowIOValueTypeEnum.datasetQuote]: {
    label: i18nT('common:core.workflow.Dataset quote'),
    value: WorkflowIOValueTypeEnum.datasetQuote
  },
  [WorkflowIOValueTypeEnum.selectApp]: {
    label: i18nT('common:plugin.App'),
    value: WorkflowIOValueTypeEnum.selectApp
  },
  [WorkflowIOValueTypeEnum.selectDataset]: {
    label: i18nT('common:core.chat.Select dataset'),
    value: WorkflowIOValueTypeEnum.selectDataset
  },
  [WorkflowIOValueTypeEnum.dynamic]: {
    label: i18nT('common:core.workflow.dynamic_input'),
    value: WorkflowIOValueTypeEnum.dynamic
  }
};

export const EDGE_TYPE = 'default';
export const defaultNodeVersion = '481';

export const chatHistoryValueDesc = `{
  obj: System | Human | AI;
  value: string;
}[]`;
export const datasetQuoteValueDesc = `{
  id: string;
  datasetId: string;
  collectionId: string;
  sourceName: string;
  sourceId?: string;
  q: string;
  a: string
}[]`;
