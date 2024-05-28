export enum FlowNodeTemplateTypeEnum {
  systemInput = 'systemInput',
  tools = 'tools',
  textAnswer = 'textAnswer',
  functionCall = 'functionCall',
  externalCall = 'externalCall',

  personalPlugin = 'personalPlugin',

  other = 'other'
}

export enum WorkflowIOValueTypeEnum {
  string = 'string',
  number = 'number',
  boolean = 'boolean',
  object = 'object',
  arrayString = 'arrayString',
  arrayNumber = 'arrayNumber',
  arrayBoolean = 'arrayBoolean',
  arrayObject = 'arrayObject',
  any = 'any',

  chatHistory = 'chatHistory',
  datasetQuote = 'datasetQuote',

  dynamic = 'dynamic',

  // plugin special type
  selectApp = 'selectApp',
  selectDataset = 'selectDataset'
}

/* reg: modulename key */
export enum NodeInputKeyEnum {
  // old
  welcomeText = 'welcomeText',
  switch = 'switch', // a trigger switch
  history = 'history',
  answerText = 'text',

  // system config
  questionGuide = 'questionGuide',
  tts = 'tts',
  whisper = 'whisper',
  variables = 'variables',
  scheduleTrigger = 'scheduleTrigger',
  chatInputGuide = 'chatInputGuide',

  // entry
  userChatInput = 'userChatInput',
  inputFiles = 'inputFiles',

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
  pluginStart = 'pluginStart',

  // if else
  condition = 'condition',
  ifElseList = 'ifElseList',

  // variable update
  updateList = 'updateList',

  // code
  code = 'code',
  codeType = 'codeType' // js|py
}

export enum NodeOutputKeyEnum {
  // common
  userChatInput = 'userChatInput',
  history = 'history',
  answerText = 'answerText', // module answer. the value will be show and save to history
  success = 'success',
  failed = 'failed',
  error = 'error',
  text = 'system_text',
  addOutputParam = 'system_addOutputParam',
  rawResponse = 'system_rawResponse',

  // dataset
  datasetQuoteQA = 'quoteQA',

  // classify
  cqResult = 'cqResult',
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
  pluginStart = 'pluginStart',

  ifElseResult = 'ifElseResult'
}

export enum VariableInputEnum {
  input = 'input',
  textarea = 'textarea',
  select = 'select',
  custom = 'custom'
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
  [VariableInputEnum.custom]: {
    icon: 'core/app/variable/external',
    title: 'core.module.variable.Custom type',
    desc: '可以定义一个无需用户填写的全局变量。\n该变量的值可以来自于 API 接口，分享链接的 Query 或通过【变量更新】模块进行赋值。'
  }
};

export const DYNAMIC_INPUT_REFERENCE_KEY = 'DYNAMIC_INPUT_REFERENCE_KEY';

/* run time */
export enum RuntimeEdgeStatusEnum {
  'waiting' = 'waiting',
  'active' = 'active',
  'skipped' = 'skipped'
}

export const VARIABLE_NODE_ID = 'VARIABLE_NODE_ID';
