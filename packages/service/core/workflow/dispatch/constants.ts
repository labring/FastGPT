import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { dispatchAppRequest } from './abandoned/runApp';
import { dispatchClassifyQuestion } from './ai/classifyQuestion';
import { dispatchContentExtract } from './ai/extract';
import { dispatchRunTools } from './ai/tool/index';
import { dispatchStopToolCall } from './ai/tool/stopTool';
import { dispatchToolParams } from './ai/tool/toolParams';
import { dispatchChatCompletion } from './ai/chat';
import { dispatchCodeSandbox } from './tools/codeSandbox';
import { dispatchDatasetConcat } from './dataset/concat';
import { dispatchDatasetSearch } from './dataset/search';
import { dispatchSystemConfig } from './init/systemConfig';
import { dispatchWorkflowStart } from './init/workflowStart';
import { dispatchFormInput } from './interactive/formInput';
import { dispatchUserSelect } from './interactive/userSelect';
import { dispatchLoop } from './loop/runLoop';
import { dispatchLoopEnd } from './loop/runLoopEnd';
import { dispatchLoopStart } from './loop/runLoopStart';
import { dispatchRunPlugin } from './plugin/run';
import { dispatchRunAppNode } from './child/runApp';
import { dispatchPluginInput } from './plugin/runInput';
import { dispatchPluginOutput } from './plugin/runOutput';
import { dispatchRunTool } from './child/runTool';
import { dispatchAnswer } from './tools/answer';
import { dispatchCustomFeedback } from './tools/customFeedback';
import { dispatchHttp468Request } from './tools/http468';
import { dispatchQueryExtension } from './tools/queryExternsion';
import { dispatchReadFiles } from './tools/readFiles';
import { dispatchIfElse } from './tools/runIfElse';
import { dispatchLafRequest } from './tools/runLaf';
import { dispatchUpdateVariable } from './tools/runUpdateVar';
import { dispatchTextEditor } from './tools/textEditor';

export const callbackMap: Record<FlowNodeTypeEnum, Function> = {
  [FlowNodeTypeEnum.workflowStart]: dispatchWorkflowStart,
  [FlowNodeTypeEnum.answerNode]: dispatchAnswer,
  [FlowNodeTypeEnum.chatNode]: dispatchChatCompletion,
  [FlowNodeTypeEnum.datasetSearchNode]: dispatchDatasetSearch,
  [FlowNodeTypeEnum.datasetConcatNode]: dispatchDatasetConcat,
  [FlowNodeTypeEnum.classifyQuestion]: dispatchClassifyQuestion,
  [FlowNodeTypeEnum.contentExtract]: dispatchContentExtract,
  [FlowNodeTypeEnum.httpRequest468]: dispatchHttp468Request,
  [FlowNodeTypeEnum.appModule]: dispatchRunAppNode,
  [FlowNodeTypeEnum.pluginModule]: dispatchRunPlugin,
  [FlowNodeTypeEnum.pluginInput]: dispatchPluginInput,
  [FlowNodeTypeEnum.pluginOutput]: dispatchPluginOutput,
  [FlowNodeTypeEnum.queryExtension]: dispatchQueryExtension,
  [FlowNodeTypeEnum.agent]: dispatchRunTools,
  [FlowNodeTypeEnum.stopTool]: dispatchStopToolCall,
  [FlowNodeTypeEnum.toolParams]: dispatchToolParams,
  [FlowNodeTypeEnum.lafModule]: dispatchLafRequest,
  [FlowNodeTypeEnum.ifElseNode]: dispatchIfElse,
  [FlowNodeTypeEnum.variableUpdate]: dispatchUpdateVariable,
  [FlowNodeTypeEnum.code]: dispatchCodeSandbox,
  [FlowNodeTypeEnum.textEditor]: dispatchTextEditor,
  [FlowNodeTypeEnum.customFeedback]: dispatchCustomFeedback,
  [FlowNodeTypeEnum.readFiles]: dispatchReadFiles,
  [FlowNodeTypeEnum.userSelect]: dispatchUserSelect,
  [FlowNodeTypeEnum.loop]: dispatchLoop,
  [FlowNodeTypeEnum.loopStart]: dispatchLoopStart,
  [FlowNodeTypeEnum.loopEnd]: dispatchLoopEnd,
  [FlowNodeTypeEnum.formInput]: dispatchFormInput,
  [FlowNodeTypeEnum.tool]: dispatchRunTool,

  // none
  [FlowNodeTypeEnum.systemConfig]: dispatchSystemConfig,
  [FlowNodeTypeEnum.pluginConfig]: () => Promise.resolve(),
  [FlowNodeTypeEnum.emptyNode]: () => Promise.resolve(),
  [FlowNodeTypeEnum.globalVariable]: () => Promise.resolve(),
  [FlowNodeTypeEnum.comment]: () => Promise.resolve(),
  [FlowNodeTypeEnum.toolSet]: () => Promise.resolve(),

  // @deprecated
  [FlowNodeTypeEnum.runApp]: dispatchAppRequest
};
