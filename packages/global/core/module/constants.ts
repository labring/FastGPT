export enum FlowNodeTemplateTypeEnum {
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
  selectDataset = 'selectDataset',

  // tool
  tools = 'tools'
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
  whisper = 'whisper',
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
  pluginId = 'pluginId',
  pluginStart = 'pluginStart'
}

export enum ModuleOutputKeyEnum {
  // common
  userChatInput = 'userChatInput',
  finish = 'finish',
  history = 'history',
  answerText = 'answerText', // module answer. the value will be show and save to history
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
  resultFalse = 'system_resultFalse',

  // tools
  selectedTools = 'selectedTools',

  // http
  httpRawResponse = 'httpRawResponse',

  // plugin
  pluginStart = 'pluginStart'
}

export enum VariableInputEnum {
  input = 'input',
  textarea = 'textarea',
  select = 'select',
  external = 'external'
}
export const variableMap = {
  [VariableInputEnum.input]: {
    icon: 'core/app/variable/input',
    title: 'core.module.variable.input type',
    desc: ''
  },
  [VariableInputEnum.textarea]: {
    icon: 'core/app/variable/textarea',
    title: 'core.module.variable.textarea type',
    desc: '允许用户最多输入4000字的对话框。'
  },
  [VariableInputEnum.select]: {
    icon: 'core/app/variable/select',
    title: 'core.module.variable.select type',
    desc: ''
  },
  [VariableInputEnum.external]: {
    icon: 'core/app/variable/external',
    title: 'core.module.variable.External type',
    desc: '可以通过API接口或分享链接的Query传递变量。增加该类型变量的主要目的是用于变量提示。使用例子: 你可以通过分享链接Query中拼接Token，来实现内部系统身份鉴权。'
  }
};

export const DYNAMIC_INPUT_KEY = 'DYNAMIC_INPUT_KEY';
