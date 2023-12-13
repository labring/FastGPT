export enum ModuleTemplateTypeEnum {
  userGuide = 'userGuide',
  systemInput = 'systemInput',
  tools = 'tools',
  textAnswer = 'textAnswer',
  dataset = 'dataset',
  functionCall = 'functionCall',
  externalCall = 'externalCall',

  personalPlugin = 'personalPlugin',
  communityPlugin = 'communityPlugin',
  commercialPlugin = 'commercialPlugin',

  other = 'other'
}

export enum ModuleDataTypeEnum {
  string = 'string',
  number = 'number',
  boolean = 'boolean',
  chatHistory = 'chatHistory',
  datasetQuote = 'datasetQuote',
  any = 'any',

  // plugin special type
  selectApp = 'selectApp',
  selectDataset = 'selectDataset'
}

/* reg: modulename key */
export enum ModuleInputKeyEnum {
  // old
  welcomeText = 'welcomeText',
  variables = 'variables',
  switch = 'switch', // a trigger switch
  history = 'history',
  userChatInput = 'userChatInput',
  questionGuide = 'questionGuide',
  tts = 'tts',
  answerText = 'text',
  agents = 'agents', // cq agent key

  // latest
  // common
  aiModel = 'model',
  aiSystemPrompt = 'systemPrompt',
  description = 'description',
  anyInput = 'anyInput',
  textareaInput = 'textareaInput',

  // history
  historyMaxAmount = 'maxContext',

  // ai chat
  aiChatTemperature = 'temperature',
  aiChatMaxToken = 'maxToken',
  aiChatSettingModal = 'aiSettings',
  aiChatIsResponseText = 'isResponseAnswerText',
  aiChatQuoteTemplate = 'quoteTemplate',
  aiChatQuotePrompt = 'quotePrompt',
  aiChatDatasetQuote = 'quoteQA',

  // dataset
  datasetSelectList = 'datasets',
  datasetSimilarity = 'similarity',
  datasetLimit = 'limit',
  datasetSearchMode = 'searchMode',
  datasetParamsModal = 'datasetParamsModal',

  // context extract
  contextExtractInput = 'content',
  extractKeys = 'extractKeys',

  // http
  httpReqUrl = 'httpReqUrl',
  httpHeader = 'httpHeader',
  httpMethod = 'httpMethod',
  abandon_httpUrl = 'url',

  // app
  runAppSelectApp = 'app',

  // plugin
  pluginId = 'pluginId'
}

export enum ModuleOutputKeyEnum {
  // common
  userChatInput = 'userChatInput',
  finish = 'finish',
  responseData = 'responseData',
  history = 'history',
  answerText = 'answerText', //  answer module text key
  success = 'success',
  failed = 'failed',
  text = 'text',

  // dataset
  datasetIsEmpty = 'isEmpty',
  datasetUnEmpty = 'unEmpty',
  datasetQuoteQA = 'quoteQA',

  // context extract
  contextExtractFields = 'fields',

  // tf switch
  resultTrue = 'resultTrue',
  resultFalse = 'resultFalse'
}

export enum VariableInputEnum {
  input = 'input',
  textarea = 'textarea',
  select = 'select'
}
