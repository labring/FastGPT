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
  chatInput = 'chatInput',
  selectApp = 'selectApp',
  // chat special input
  aiSettings = 'aiSettings',
  maxToken = 'maxToken',
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
  variable = 'variable',
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
  pluginOutput = 'pluginOutput'
}

export enum FlowNodeSpecialInputKeyEnum {
  'answerText' = 'text',
  'agents' = 'agents', // cq agent key
  'pluginId' = 'pluginId'
}

export enum FlowNodeValTypeEnum {
  'string' = 'string',
  'number' = 'number',
  'boolean' = 'boolean',
  'chatHistory' = 'chatHistory',
  'datasetQuote' = 'datasetQuote',
  'any' = 'any'
}
