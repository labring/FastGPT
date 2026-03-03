import { i18nT } from '../../../../web/i18n/utils';
import { WorkflowIOValueTypeEnum } from '../constants';
export enum FlowNodeInputTypeEnum { // render ui
  reference = 'reference', // reference to other node output
  input = 'input', // one line input
  textarea = 'textarea',
  numberInput = 'numberInput',
  switch = 'switch', // true/false
  select = 'select',
  multipleSelect = 'multipleSelect',

  // editor
  JSONEditor = 'JSONEditor',

  addInputParam = 'addInputParam', // params input
  customVariable = 'customVariable', // 外部变量

  selectApp = 'selectApp',
  // ai model select
  selectLLMModel = 'selectLLMModel',
  settingLLMModel = 'settingLLMModel',

  // dataset special input
  selectDataset = 'selectDataset',
  selectDatasetParamsModal = 'selectDatasetParamsModal',
  settingDatasetQuotePrompt = 'settingDatasetQuotePrompt',

  hidden = 'hidden',
  custom = 'custom', // 自定义渲染

  fileSelect = 'fileSelect',
  timePointSelect = 'timePointSelect',
  timeRangeSelect = 'timeRangeSelect',
  password = 'password'
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
  [FlowNodeInputTypeEnum.multipleSelect]: {
    icon: 'core/workflow/inputType/multipleSelect'
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
    icon: 'core/workflow/inputType/internal'
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
  },
  [FlowNodeInputTypeEnum.timePointSelect]: {
    icon: 'core/workflow/inputType/timePointSelect'
  },
  [FlowNodeInputTypeEnum.timeRangeSelect]: {
    icon: 'core/workflow/inputType/timeRangeSelect'
  },
  [FlowNodeInputTypeEnum.password]: {
    icon: 'core/workflow/inputType/password'
  }
};

export enum FlowNodeOutputTypeEnum {
  hidden = 'hidden',
  error = 'error',
  source = 'source',
  static = 'static',
  dynamic = 'dynamic'
}

export enum FlowNodeTypeEnum {
  emptyNode = 'emptyNode',
  systemConfig = 'userGuide',
  pluginConfig = 'pluginConfig',
  globalVariable = 'globalVariable',
  comment = 'comment',

  workflowStart = 'workflowStart',
  chatNode = 'chatNode',

  datasetSearchNode = 'datasetSearchNode',
  datasetConcatNode = 'datasetConcatNode',

  answerNode = 'answerNode',
  classifyQuestion = 'classifyQuestion',
  contentExtract = 'contentExtract',
  httpRequest468 = 'httpRequest468',
  pluginInput = 'pluginInput',
  pluginOutput = 'pluginOutput',
  queryExtension = 'cfr',
  agent = 'tools',
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
  tool = 'tool',
  toolSet = 'toolSet',

  // child:
  appModule = 'appModule',
  pluginModule = 'pluginModule',
  runApp = 'app'
}

// node IO value type
export const FlowValueTypeMap: Record<
  WorkflowIOValueTypeEnum,
  {
    label: string;
    value: WorkflowIOValueTypeEnum;
    abandon?: boolean;
  }
> = {
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
  [WorkflowIOValueTypeEnum.selectDataset]: {
    label: i18nT('common:core.chat.Select dataset'),
    value: WorkflowIOValueTypeEnum.selectDataset
  },
  [WorkflowIOValueTypeEnum.dynamic]: {
    label: i18nT('common:core.workflow.dynamic_input'),
    value: WorkflowIOValueTypeEnum.dynamic
  },
  [WorkflowIOValueTypeEnum.selectApp]: {
    label: 'selectApp',
    value: WorkflowIOValueTypeEnum.selectApp,
    abandon: true
  }
};

export const EDGE_TYPE = 'default';

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
export const datasetSelectValueDesc = `{
  datasetId: string;
}[]`;

export const AppNodeFlowNodeTypeMap: Record<any, boolean> = {
  [FlowNodeTypeEnum.pluginModule]: true,
  [FlowNodeTypeEnum.appModule]: true,
  [FlowNodeTypeEnum.tool]: true,
  [FlowNodeTypeEnum.toolSet]: true
};

export const NodeGradients = {
  pink: 'linear-gradient(180deg, rgba(255, 161, 206, 0.20) 0%, rgba(255, 255, 255, 0.00) 100%)',
  blue: 'linear-gradient(180deg, rgba(104, 192, 255, 0.20) 0%, rgba(255, 255, 255, 0.00) 100%)',
  blueLight: 'linear-gradient(180deg, rgba(85, 184, 255, 0.20) 0%, rgba(255, 255, 255, 0.00) 100%)',
  blueDark: 'linear-gradient(180deg, rgba(125, 153, 255, 0.20) 0%, rgba(255, 255, 255, 0.00) 100%)',
  orange: 'linear-gradient(180deg, rgba(255, 199, 90, 0.20) 0%, rgba(255, 255, 255, 0.00) 100%)',
  purple: 'linear-gradient(180deg, rgba(235, 120, 254, 0.20) 0%, rgba(255, 255, 255, 0.00) 100%)',
  teal: 'linear-gradient(180deg, rgba(97, 210, 196, 0.20) 0%, rgba(255, 255, 255, 0.00) 100%)',
  green: 'linear-gradient(180deg, rgba(62, 217, 170, 0.20) 0%, rgba(255, 255, 255, 0.00) 100%)',
  greenLight:
    'linear-gradient(180deg, rgba(94, 209, 128, 0.20) 0%, rgba(255, 255, 255, 0.00) 100%)',
  indigo: 'linear-gradient(180deg, rgba(120, 147, 254, 0.20) 0%, rgba(255, 255, 255, 0.00) 100%)',
  coral: 'linear-gradient(180deg, rgba(252, 162, 143, 0.20) 0%, rgba(255, 255, 255, 0.00) 100%)',
  lime: 'linear-gradient(0deg, rgba(255, 255, 255, 0.00) 0%, rgba(92, 216, 201, 0.25) 100%)',
  violet: 'linear-gradient(180deg, rgba(155, 142, 255, 0.20) 0%, rgba(255, 255, 255, 0.00) 100%)',
  violetDeep:
    'linear-gradient(180deg, rgba(212, 117, 255, 0.20) 0%, rgba(255, 255, 255, 0.00) 100%)',
  yellowGreen:
    'linear-gradient(180deg, rgba(166, 218, 114, 0.20) 0%, rgba(255, 255, 255, 0.00) 100%)',
  lafTeal: 'linear-gradient(180deg, rgba(72, 213, 186, 0.20) 0%, rgba(255, 255, 255, 0.00) 100%)',
  skyBlue: 'linear-gradient(180deg, rgba(137, 229, 255, 0.20) 0%, rgba(255, 255, 255, 0.00) 100%)',
  salmon: 'linear-gradient(180deg, rgba(255, 160, 160, 0.20) 0%, rgba(255, 255, 255, 0.00) 100%)',
  gray: 'linear-gradient(180deg, rgba(136, 136, 136, 0.20) 0%, rgba(255, 255, 255, 0.00) 100%)'
};

export const NodeBorderColors = {
  pink: 'rgba(255, 161, 206, 0.6)',
  blue: 'rgba(104, 192, 255, 0.6)',
  blueLight: 'rgba(85, 184, 255, 0.6)',
  blueDark: 'rgba(125, 153, 255, 0.6)',
  orange: 'rgba(255, 199, 90, 0.6)',
  purple: 'rgba(235, 120, 254, 0.6)',
  teal: 'rgba(97, 210, 196, 0.6)',
  green: 'rgba(62, 217, 170, 0.6)',
  greenLight: 'rgba(94, 209, 128, 0.6)',
  indigo: 'rgba(120, 147, 254, 0.6)',
  coral: 'rgba(252, 162, 143, 0.6)',
  lime: 'rgba(92, 216, 201, 0.6)',
  violet: 'rgba(155, 142, 255, 0.6)',
  violetDeep: 'rgba(212, 117, 255, 0.6)',
  yellowGreen: 'rgba(166, 218, 114, 0.6)',
  lafTeal: 'rgba(72, 213, 186, 0.6)',
  skyBlue: 'rgba(137, 229, 255, 0.6)',
  salmon: 'rgba(255, 160, 160, 0.6)',
  gray: 'rgba(136, 136, 136, 0.6)'
};
