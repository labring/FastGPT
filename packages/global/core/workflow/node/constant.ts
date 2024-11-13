import { WorkflowIOValueTypeEnum } from '../constants';
import { i18nT } from '../../../../web/i18n/utils';
export enum FlowNodeInputTypeEnum { // render ui
  reference = 'reference', // reference to other node output
  input = 'input', // one line input
  textarea = 'textarea',
  numberInput = 'numberInput',
  switch = 'switch', // true/false
  select = 'select',

  // editor
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
  custom = 'custom',

  fileSelect = 'fileSelect'
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
  [FlowNodeInputTypeEnum.numberInput]: {
    icon: 'core/workflow/inputType/numberInput'
  },
  [FlowNodeInputTypeEnum.select]: {
    icon: 'core/workflow/inputType/option'
  },
  [FlowNodeInputTypeEnum.switch]: {
    icon: 'core/workflow/inputType/switch'
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
  },
  [FlowNodeInputTypeEnum.input]: {
    icon: 'core/workflow/inputType/input'
  },
  [FlowNodeInputTypeEnum.textarea]: {
    icon: 'core/workflow/inputType/textarea'
  },
  [FlowNodeInputTypeEnum.fileSelect]: {
    icon: 'core/workflow/inputType/file'
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
  toolParams = 'toolParams',
  lafModule = 'lafModule',
  ifElseNode = 'ifElseNode',
  variableUpdate = 'variableUpdate',
  code = 'code',
  textEditor = 'textEditor',
  customFeedback = 'customFeedback',
  readFiles = 'readFiles',
  userSelect = 'userSelect',
  loop = 'loop',
  loopStart = 'loopStart',
  loopEnd = 'loopEnd',
  formInput = 'formInput',
  comment = 'comment'
}

// node IO value type
export const FlowValueTypeMap = {
  [WorkflowIOValueTypeEnum.string]: {
    label: 'String',
    value: WorkflowIOValueTypeEnum.string
  },
  [WorkflowIOValueTypeEnum.number]: {
    label: 'Number',
    value: WorkflowIOValueTypeEnum.number
  },
  [WorkflowIOValueTypeEnum.boolean]: {
    label: 'Boolean',
    value: WorkflowIOValueTypeEnum.boolean
  },
  [WorkflowIOValueTypeEnum.object]: {
    label: 'Object',
    value: WorkflowIOValueTypeEnum.object
  },
  [WorkflowIOValueTypeEnum.arrayString]: {
    label: 'Array<string>',
    value: WorkflowIOValueTypeEnum.arrayString
  },
  [WorkflowIOValueTypeEnum.arrayNumber]: {
    label: 'Array<number>',
    value: WorkflowIOValueTypeEnum.arrayNumber
  },
  [WorkflowIOValueTypeEnum.arrayBoolean]: {
    label: 'Array<boolean>',
    value: WorkflowIOValueTypeEnum.arrayBoolean
  },
  [WorkflowIOValueTypeEnum.arrayObject]: {
    label: 'Array<object>',
    value: WorkflowIOValueTypeEnum.arrayObject
  },
  [WorkflowIOValueTypeEnum.arrayAny]: {
    label: 'Array',
    value: WorkflowIOValueTypeEnum.arrayAny
  },
  [WorkflowIOValueTypeEnum.any]: {
    label: 'Any',
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
