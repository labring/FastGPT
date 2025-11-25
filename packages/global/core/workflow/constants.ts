import { i18nT } from '../../../web/i18n/utils';
import type { JsonSchemaPropertiesItemType } from '../app/jsonschema';

export enum FlowNodeTemplateTypeEnum {
  systemInput = 'systemInput',
  ai = 'ai',
  interactive = 'interactive',
  tools = 'tools',
  other = 'other',

  // Team app type
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
  arrayAny = 'arrayAny',
  any = 'any',

  chatHistory = 'chatHistory',
  datasetQuote = 'datasetQuote',

  dynamic = 'dynamic',

  // plugin special type
  selectDataset = 'selectDataset',

  // abandon
  selectApp = 'selectApp'
}

export const toolValueTypeList: {
  label: string;
  value: WorkflowIOValueTypeEnum;
  jsonSchema: JsonSchemaPropertiesItemType;
}[] = [
  {
    label: WorkflowIOValueTypeEnum.string,
    value: WorkflowIOValueTypeEnum.string,
    jsonSchema: {
      type: 'string'
    }
  },
  {
    label: WorkflowIOValueTypeEnum.number,
    value: WorkflowIOValueTypeEnum.number,
    jsonSchema: {
      type: 'number'
    }
  },
  {
    label: WorkflowIOValueTypeEnum.boolean,
    value: WorkflowIOValueTypeEnum.boolean,
    jsonSchema: {
      type: 'boolean'
    }
  },
  {
    label: 'array<string>',
    value: WorkflowIOValueTypeEnum.arrayString,
    jsonSchema: {
      type: 'array',
      items: {
        type: 'string'
      }
    }
  },
  {
    label: 'array<number>',
    value: WorkflowIOValueTypeEnum.arrayNumber,
    jsonSchema: {
      type: 'array',
      items: {
        type: 'number'
      }
    }
  },
  {
    label: 'array<boolean>',
    value: WorkflowIOValueTypeEnum.arrayBoolean,
    jsonSchema: {
      type: 'array',
      items: {
        type: 'boolean'
      }
    }
  },
  {
    label: 'object',
    value: WorkflowIOValueTypeEnum.object,
    jsonSchema: {
      type: 'object'
    }
  }
];
export const valueTypeJsonSchemaMap: Record<string, JsonSchemaPropertiesItemType> =
  toolValueTypeList.reduce(
    (acc, item) => {
      acc[item.value] = item.jsonSchema;
      return acc;
    },
    {} as Record<string, JsonSchemaPropertiesItemType>
  );

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
  autoExecute = 'autoExecute',

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
  forbidStream = 'system_forbid_stream',
  headerSecret = 'system_header_secret',
  systemInputConfig = 'system_input_config',

  // history
  historyMaxAmount = 'maxContext',

  // ai chat
  aiChatTemperature = 'temperature',
  aiChatMaxToken = 'maxToken',
  aiChatSettingModal = 'aiSettings',
  aiChatIsResponseText = 'isResponseAnswerText',
  aiChatQuoteRole = 'aiChatQuoteRole',
  aiChatQuoteTemplate = 'quoteTemplate',
  aiChatQuotePrompt = 'quotePrompt',
  aiChatDatasetQuote = 'quoteQA',
  aiChatVision = 'aiChatVision',
  stringQuoteText = 'stringQuoteText',
  aiChatReasoning = 'aiChatReasoning',
  aiChatTopP = 'aiChatTopP',
  aiChatStopSign = 'aiChatStopSign',
  aiChatResponseFormat = 'aiChatResponseFormat',
  aiChatJsonSchema = 'aiChatJsonSchema',

  // dataset
  datasetSelectList = 'datasets',
  datasetSimilarity = 'similarity',
  datasetMaxTokens = 'limit',
  datasetSearchMode = 'searchMode',
  datasetSearchEmbeddingWeight = 'embeddingWeight',

  datasetSearchUsingReRank = 'usingReRank',
  datasetSearchRerankWeight = 'rerankWeight',
  datasetSearchRerankModel = 'rerankModel',

  datasetSearchUsingExtensionQuery = 'datasetSearchUsingExtensionQuery',
  datasetSearchExtensionModel = 'datasetSearchExtensionModel',
  datasetSearchExtensionBg = 'datasetSearchExtensionBg',
  collectionFilterMatch = 'collectionFilterMatch',
  authTmbId = 'authTmbId',
  datasetDeepSearch = 'datasetDeepSearch',
  datasetDeepSearchModel = 'datasetDeepSearchModel',
  datasetDeepSearchMaxTimes = 'datasetDeepSearchMaxTimes',
  datasetDeepSearchBg = 'datasetDeepSearchBg',

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
  userSelectOptions = 'userSelectOptions',

  // loop
  loopInputArray = 'loopInputArray',
  childrenNodeIdList = 'childrenNodeIdList',
  nodeWidth = 'nodeWidth',
  nodeHeight = 'nodeHeight',
  loopNodeInputHeight = 'loopNodeInputHeight',
  // loop start
  loopStartInput = 'loopStartInput',
  loopStartIndex = 'loopStartIndex',
  // loop end
  loopEndInput = 'loopEndInput',

  // form input
  userInputForms = 'userInputForms',

  // comment
  commentText = 'commentText',
  commentSize = 'commentSize',

  // Tool
  toolData = 'system_toolData',
  toolSetData = 'system_toolSetData'
}

export enum NodeOutputKeyEnum {
  // common
  userChatInput = 'userChatInput',
  history = 'history',
  answerText = 'answerText', // node answer. the value will be show and save to history
  reasoningText = 'reasoningText', // node reasoning. the value will be show but not save to history
  success = 'success',
  failed = 'failed',
  text = 'system_text',
  addOutputParam = 'system_addOutputParam',
  rawResponse = 'system_rawResponse',
  systemError = 'system_error',
  errorText = 'system_error_text',

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
  selectResult = 'selectResult',

  // loop
  loopArray = 'loopArray',
  // loop start
  loopStartInput = 'loopStartInput',
  loopStartIndex = 'loopStartIndex',

  // form input
  formInputResult = 'formInputResult',

  // File
  fileTitle = 'fileTitle',

  // @deprecated
  error = 'error'
}

export enum VariableInputEnum {
  input = 'input',
  textarea = 'textarea',
  numberInput = 'numberInput',
  select = 'select',
  multipleSelect = 'multipleSelect',
  timePointSelect = 'timePointSelect',
  timeRangeSelect = 'timeRangeSelect',
  switch = 'switch',
  password = 'password',
  file = 'file',

  llmSelect = 'llmSelect',
  datasetSelect = 'datasetSelect',

  custom = 'custom',
  internal = 'internal'
}

type VariableConfigType = {
  icon: string;
  label: string;
  value: VariableInputEnum;
  defaultValueType: WorkflowIOValueTypeEnum;
  description?: string;
};

export const variableConfigs: VariableConfigType[][] = [
  [
    {
      icon: 'core/workflow/inputType/input',
      label: i18nT('common:core.workflow.inputType.textInput'),
      value: VariableInputEnum.input,
      defaultValueType: WorkflowIOValueTypeEnum.string
    },
    {
      icon: 'core/workflow/inputType/password',
      label: i18nT('common:core.workflow.inputType.password'),
      value: VariableInputEnum.password,
      defaultValueType: WorkflowIOValueTypeEnum.string
    },
    {
      icon: 'core/workflow/inputType/numberInput',
      label: i18nT('common:core.workflow.inputType.number input'),
      value: VariableInputEnum.numberInput,
      defaultValueType: WorkflowIOValueTypeEnum.number
    },
    {
      icon: 'core/workflow/inputType/option',
      label: i18nT('common:core.workflow.inputType.select'),
      value: VariableInputEnum.select,
      defaultValueType: WorkflowIOValueTypeEnum.string
    },
    {
      icon: 'core/workflow/inputType/multipleSelect',
      label: i18nT('common:core.workflow.inputType.multipleSelect'),
      value: VariableInputEnum.multipleSelect,
      defaultValueType: WorkflowIOValueTypeEnum.arrayString
    },
    {
      icon: 'core/workflow/inputType/switch',
      label: i18nT('common:core.workflow.inputType.switch'),
      value: VariableInputEnum.switch,
      defaultValueType: WorkflowIOValueTypeEnum.boolean
    },
    {
      icon: 'core/workflow/inputType/timePointSelect',
      label: i18nT('common:core.workflow.inputType.timePointSelect'),
      value: VariableInputEnum.timePointSelect,
      defaultValueType: WorkflowIOValueTypeEnum.string
    },
    {
      icon: 'core/workflow/inputType/timeRangeSelect',
      label: i18nT('common:core.workflow.inputType.timeRangeSelect'),
      value: VariableInputEnum.timeRangeSelect,
      defaultValueType: WorkflowIOValueTypeEnum.arrayString
    }
  ],
  [
    {
      icon: 'core/workflow/inputType/model',
      label: i18nT('common:core.workflow.inputType.modelSelect'),
      value: VariableInputEnum.llmSelect,
      defaultValueType: WorkflowIOValueTypeEnum.string
    },
    {
      icon: 'core/workflow/inputType/file',
      label: i18nT('common:core.workflow.inputType.file'),
      value: VariableInputEnum.file,
      defaultValueType: WorkflowIOValueTypeEnum.arrayString
    }
  ],
  [
    {
      icon: 'core/workflow/inputType/external',
      label: i18nT('common:core.workflow.inputType.custom'),
      value: VariableInputEnum.custom,
      defaultValueType: WorkflowIOValueTypeEnum.string,
      description: i18nT('app:variable.select type_desc')
    },
    {
      icon: 'core/workflow/inputType/internal',
      label: i18nT('common:core.workflow.inputType.internal'),
      value: VariableInputEnum.internal,
      defaultValueType: WorkflowIOValueTypeEnum.string,
      description: i18nT('app:variable.internal_type_desc')
    }
  ]
];

export const variableMap: Record<VariableInputEnum, VariableConfigType> = {
  ...variableConfigs
    .flat()
    .reduce(
      (acc, config) => ({ ...acc, [config.value]: config }),
      {} as Record<VariableInputEnum, VariableConfigType>
    ),
  [VariableInputEnum.textarea]: {
    icon: 'core/workflow/inputType/textarea',
    label: i18nT('common:core.workflow.inputType.textarea'),
    value: VariableInputEnum.textarea,
    defaultValueType: WorkflowIOValueTypeEnum.string,
    description: i18nT('app:variable.textarea_type_desc')
  }
};

// Keep backward compatibility
export const variableMapGroups = variableConfigs;

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

export const contentTypeMap = {
  [ContentTypes.none]: '',
  [ContentTypes.formData]: '',
  [ContentTypes.xWwwFormUrlencoded]: 'application/x-www-form-urlencoded',
  [ContentTypes.json]: 'application/json',
  [ContentTypes.xml]: 'application/xml',
  [ContentTypes.raw]: 'text/plain'
};

// http request methods
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export const ArrayTypeMap: Record<WorkflowIOValueTypeEnum, WorkflowIOValueTypeEnum> = {
  [WorkflowIOValueTypeEnum.string]: WorkflowIOValueTypeEnum.arrayString,
  [WorkflowIOValueTypeEnum.number]: WorkflowIOValueTypeEnum.arrayNumber,
  [WorkflowIOValueTypeEnum.boolean]: WorkflowIOValueTypeEnum.arrayBoolean,
  [WorkflowIOValueTypeEnum.object]: WorkflowIOValueTypeEnum.arrayObject,
  [WorkflowIOValueTypeEnum.arrayString]: WorkflowIOValueTypeEnum.arrayString,
  [WorkflowIOValueTypeEnum.arrayNumber]: WorkflowIOValueTypeEnum.arrayNumber,
  [WorkflowIOValueTypeEnum.arrayBoolean]: WorkflowIOValueTypeEnum.arrayBoolean,
  [WorkflowIOValueTypeEnum.arrayObject]: WorkflowIOValueTypeEnum.arrayObject,
  [WorkflowIOValueTypeEnum.chatHistory]: WorkflowIOValueTypeEnum.arrayObject,
  [WorkflowIOValueTypeEnum.datasetQuote]: WorkflowIOValueTypeEnum.arrayObject,
  [WorkflowIOValueTypeEnum.dynamic]: WorkflowIOValueTypeEnum.arrayObject,
  [WorkflowIOValueTypeEnum.selectDataset]: WorkflowIOValueTypeEnum.arrayObject,
  [WorkflowIOValueTypeEnum.selectApp]: WorkflowIOValueTypeEnum.arrayObject,
  [WorkflowIOValueTypeEnum.arrayAny]: WorkflowIOValueTypeEnum.arrayAny,
  [WorkflowIOValueTypeEnum.any]: WorkflowIOValueTypeEnum.arrayAny
};
