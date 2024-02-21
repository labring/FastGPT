export enum ModuleTemplateTypeEnum {
  userGuide = 'userGuide',
  systemInput = 'systemInput',
  tools = 'tools',
  textAnswer = 'textAnswer',
  functionCall = 'functionCall',
  externalCall = 'externalCall',

  personalPlugin = 'personalPlugin',

  other = 'other'
}

export enum ModuleIOValueTypeEnum {
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
  anyInput = 'system_anyInput',
  textareaInput = 'system_textareaInput',
  addInputParam = 'system_addInputParam',

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
  datasetMaxTokens = 'limit',
  datasetSearchMode = 'searchMode',
  datasetSearchUsingReRank = 'usingReRank',
  datasetSearchUsingExtensionQuery = 'datasetSearchUsingExtensionQuery',
  datasetSearchExtensionModel = 'datasetSearchExtensionModel',
  datasetSearchExtensionBg = 'datasetSearchExtensionBg',

  // context extract
  contextExtractInput = 'content',
  extractKeys = 'extractKeys',

  // http
  httpReqUrl = 'system_httpReqUrl',
  httpHeaders = 'system_httpHeader',
  httpMethod = 'system_httpMethod',
  httpParams = 'system_httpParams',
  httpJsonBody = 'system_httpJsonBody',
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
  text = 'system_text',
  addOutputParam = 'system_addOutputParam',

  // dataset
  datasetIsEmpty = 'isEmpty',
  datasetUnEmpty = 'unEmpty',
  datasetQuoteQA = 'quoteQA',

  // context extract
  contextExtractFields = 'fields',

  // tf switch
  resultTrue = 'system_resultTrue',
  resultFalse = 'system_resultFalse'
}

export enum VariableInputEnum {
  input = 'input',
  textarea = 'textarea',
  select = 'select'
}
export const variableMap = {
  [VariableInputEnum.input]: {
    icon: 'core/app/variable/input'
  },
  [VariableInputEnum.textarea]: {
    icon: 'core/app/variable/textarea'
  },
  [VariableInputEnum.select]: {
    icon: 'core/app/variable/select'
  }
};

export const DYNAMIC_INPUT_KEY = 'DYNAMIC_INPUT_KEY';
