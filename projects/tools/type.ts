import { z } from 'zod';

export enum NodeOutputKeyEnum {
  // common
  userChatInput = 'userChatInput',
  history = 'history',
  answerText = 'answerText', // node answer. the value will be show and save to history
  reasoningText = 'reasoningText', // node reasoning. the value will be show but not save to history
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
  selectResult = 'selectResult',

  // loop
  loopArray = 'loopArray',
  // loop start
  loopStartInput = 'loopStartInput',
  loopStartIndex = 'loopStartIndex',

  // form input
  formInputResult = 'formInputResult'
}
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
  commentSize = 'commentSize'
}

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

  // special input
  selectApp = 'selectApp',
  customVariable = 'customVariable',

  // ai model select
  selectLLMModel = 'selectLLMModel',
  settingLLMModel = 'settingLLMModel',

  // dataset special input
  selectDataset = 'selectDataset',
  selectDatasetParamsModal = 'selectDatasetParamsModal',
  settingDatasetQuotePrompt = 'settingDatasetQuotePrompt',

  hidden = 'hidden',
  custom = 'custom',

  fileSelect = 'fileSelect'
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

enum LLMModelTypeEnum {
  all = 'all',
  classify = 'classify',
  extractFields = 'extractFields',
  toolCall = 'toolCall'
}

export enum FlowNodeOutputTypeEnum {
  hidden = 'hidden',
  source = 'source',
  static = 'static',
  dynamic = 'dynamic'
}

export const ToolCallbackType = z
  .function()
  .args(z.any())
  .returns(z.promise(z.object({ error: z.any().optional(), output: z.any() })));

export const InfoString = z.object({
  en: z.string().optional(),
  'zh-CN': z.string(),
  'zh-Hant': z.string().optional()
});

export const ToolSchema = z
  .object({
    toolId: z.string().optional(),
    name: InfoString,
    description: InfoString,
    type: z.string(),
    icon: z.string(),
    cb: ToolCallbackType.optional(),
    author: z.string().optional(),
    docURL: z.string().optional(),
    version: z.string(),
    parentId: z.string().optional(),
    isFolder: z.boolean().optional()
  })
  .refine((data) => {
    if (!data.isFolder && !data.cb) return { message: 'cb is required' };
  });

export type ToolType = z.infer<typeof ToolSchema> & {
  inputs: InputType[];
  outputs: OutputType[];
};

export type ToolConfigType = Omit<ToolType, 'cb'>;
export type FolderConfigType = Omit<ToolType, 'cb' | 'inputs' | 'outputs'>;

export type CustomFieldConfigType = {
  // reference
  selectValueTypeList?: WorkflowIOValueTypeEnum[]; // 可以选哪个数据类型, 只有1个的话,则默认选择
  showDefaultValue?: boolean;
  showDescription?: boolean;
};

export type InputType = {
  referencePlaceholder?: string;
  placeholder?: string; // input,textarea
  maxLength?: number; // input,textarea

  list?: { label: string; value: string }[]; // select

  markList?: { label: string; value: number }[]; // slider
  step?: number; // slider
  max?: number; // slider, number input
  min?: number; // slider, number input

  defaultValue?: string;

  llmModelType?: `${LLMModelTypeEnum}`;

  // dynamic input
  customInputConfig?: CustomFieldConfigType;
  selectedTypeIndex?: number;
  renderTypeList: FlowNodeInputTypeEnum[]; // Node Type. Decide on a render style

  key: `${NodeInputKeyEnum}` | string;
  valueType?: WorkflowIOValueTypeEnum; // data type
  valueDesc?: string; // data desc
  value?: unknown;
  label: string;
  debugLabel?: string;
  description?: string; // field desc
  required?: boolean;
  enum?: string;

  toolDescription?: string; // If this field is not empty, it is entered as a tool

  // render components params
  canEdit?: boolean; // dynamic inputs
  isPro?: boolean; // Pro version field
  isToolOutput?: boolean;

  // file
  canSelectFile?: boolean;
  canSelectImg?: boolean;
  maxFiles?: number;
};

export type OutputType = {
  id: string; // output unique id(Does not follow the key change)
  type: FlowNodeOutputTypeEnum;
  key: `${NodeOutputKeyEnum}` | string;
  valueType?: WorkflowIOValueTypeEnum;
  valueDesc?: string;
  value?: unknown;

  label?: string;
  description?: string;
  defaultValue?: unknown;
  required?: boolean;
};
