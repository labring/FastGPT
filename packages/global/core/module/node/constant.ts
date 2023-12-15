export enum FlowNodeInputTypeEnum {
  systemInput = 'systemInput', // history, userChatInput, variableInput

  input = 'input', // one line input
  numberInput = 'numberInput',
  select = 'select',
  slider = 'slider',
  target = 'target', // data input
  switch = 'switch',
  textarea = 'textarea',

  addInputParam = 'addInputParam', // params input

  selectApp = 'selectApp',

  // chat special input
  aiSettings = 'aiSettings',

  // ai model select
  selectChatModel = 'selectChatModel',
  selectCQModel = 'selectCQModel',
  selectExtractModel = 'selectExtractModel',

  // dataset special input
  selectDataset = 'selectDataset',
  selectDatasetParamsModal = 'selectDatasetParamsModal',

  hidden = 'hidden',
  custom = 'custom'
}

export enum FlowNodeOutputTypeEnum {
  answer = 'answer',
  source = 'source',
  hidden = 'hidden',

  addOutputParam = 'addOutputParam'
}

export enum FlowNodeTypeEnum {
  empty = 'empty',
  userGuide = 'userGuide',
  questionInput = 'questionInput',
  historyNode = 'historyNode',
  chatNode = 'chatNode',
  datasetSearchNode = 'datasetSearchNode',
  answerNode = 'answerNode',
  classifyQuestion = 'classifyQuestion',
  contentExtract = 'contentExtract',
  httpRequest = 'httpRequest',
  runApp = 'app',
  pluginModule = 'pluginModule',
  pluginInput = 'pluginInput',
  pluginOutput = 'pluginOutput',
  textEditor = 'textEditor',

  // abandon
  variable = 'variable'
}

export const EDGE_TYPE = 'smoothstep';
