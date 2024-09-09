import { i18nT } from '../../../web/i18n/utils';

export enum FlowNodeTemplateTypeEnum {
  systemInput = 'systemInput',
  ai = 'ai',
  function = 'function',
  tools = 'tools',
  interactive = 'interactive',

  search = 'search',
  multimodal = 'multimodal',
  communication = 'communication',

  other = 'other',
  teamApp = 'teamApp'
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

  // plugin config
  instruction = 'instruction',

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
  aiChatVision = 'aiChatVision',
  stringQuoteText = 'stringQuoteText',

  // dataset
  datasetSelectList = 'datasets',
  datasetSimilarity = 'similarity',
  datasetMaxTokens = 'limit',
  datasetSearchMode = 'searchMode',
  datasetSearchUsingReRank = 'usingReRank',
  datasetSearchUsingExtensionQuery = 'datasetSearchUsingExtensionQuery',
  datasetSearchExtensionModel = 'datasetSearchExtensionModel',
  datasetSearchExtensionBg = 'datasetSearchExtensionBg',
  collectionFilterMatch = 'collectionFilterMatch',

  // concat dataset
  datasetQuoteList = 'system_datasetQuoteList',

  // context extract
  contextExtractInput = 'content',
  extractKeys = 'extractKeys',

  // http
  httpReqUrl = 'system_httpReqUrl',
  httpHeaders = 'system_httpHeader',
  httpMethod = 'system_httpMethod',
  httpParams = 'system_httpParams',
  httpJsonBody = 'system_httpJsonBody',
  httpFormBody = 'system_httpFormBody',
  httpContentType = 'system_httpContentType',
  httpTimeout = 'system_httpTimeout',
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
  codeType = 'codeType', // js|py

  // read files
  fileUrlList = 'fileUrlList',

  // user select
  userSelectOptions = 'userSelectOptions'
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

  // start
  userFiles = 'userFiles',

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

  // if else
  ifElseResult = 'ifElseResult',

  //user select
  selectResult = 'selectResult'
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
    title: i18nT('common:core.module.variable.input type'),
    desc: ''
  },
  [VariableInputEnum.textarea]: {
    icon: 'core/app/variable/textarea',
    title: i18nT('common:core.module.variable.textarea type'),
    desc: i18nT('app:variable.textarea_type_desc')
  },
  [VariableInputEnum.select]: {
    icon: 'core/app/variable/select',
    title: i18nT('common:core.module.variable.select type'),
    desc: ''
  },
  [VariableInputEnum.custom]: {
    icon: 'core/app/variable/external',
    title: i18nT('common:core.module.variable.Custom type'),
    desc: i18nT('app:variable.select type_desc')
  }
};

/* run time */
export enum RuntimeEdgeStatusEnum {
  'waiting' = 'waiting',
  'active' = 'active',
  'skipped' = 'skipped'
}

export const VARIABLE_NODE_ID = 'VARIABLE_NODE_ID';
export const DYNAMIC_INPUT_REFERENCE_KEY = 'DYNAMIC_INPUT_REFERENCE_KEY';

// http node body content type
export enum ContentTypes {
  none = 'none',
  formData = 'form-data',
  xWwwFormUrlencoded = 'x-www-form-urlencoded',
  json = 'json',
  xml = 'xml',
  raw = 'raw-text'
}
