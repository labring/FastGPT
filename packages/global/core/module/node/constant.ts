export enum FlowNodeInputTypeEnum {
  systemInput = 'systemInput', // history, userChatInput, variableInput

  input = 'input', // one line input
  textarea = 'textarea',
  numberInput = 'numberInput',
  select = 'select',
  slider = 'slider',
  custom = 'custom',
  target = 'target', // data input
  switch = 'switch',
  selectApp = 'selectApp',
  // chat special input
  aiSettings = 'aiSettings',
  // maxToken = 'maxToken',
  selectChatModel = 'selectChatModel',
  // dataset special input
  selectDataset = 'selectDataset',
  hidden = 'hidden'
}

export enum FlowNodeOutputTypeEnum {
  answer = 'answer',
  source = 'source',
  hidden = 'hidden'
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

  // abandon
  variable = 'variable'
}
