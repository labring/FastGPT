import { NextApiResponse } from 'next';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/module/runtime/constants';
import { ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import type { ChatDispatchProps } from '@fastgpt/global/core/module/type.d';
import type { RunningModuleItemType } from '@fastgpt/global/core/module/runtime/type.d';
import type { ModuleDispatchProps } from '@fastgpt/global/core/module/type.d';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  ToolRunResponseItemType
} from '@fastgpt/global/core/chat/type.d';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleItemType } from '@fastgpt/global/core/module/type';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { responseWriteNodeStatus } from '../../../common/response';
import { getSystemTime } from '@fastgpt/global/common/time/timezone';

import { dispatchHistory } from './init/history';
import { dispatchChatInput } from './init/userChatInput';
import { dispatchChatCompletion } from './chat/oneapi';
import { dispatchDatasetSearch } from './dataset/search';
import { dispatchDatasetConcat } from './dataset/concat';
import { dispatchAnswer } from './tools/answer';
import { dispatchClassifyQuestion } from './agent/classifyQuestion';
import { dispatchContentExtract } from './agent/extract';
import { dispatchHttpRequest } from './tools/http';
import { dispatchHttp468Request } from './tools/http468';
import { dispatchAppRequest } from './tools/runApp';
import { dispatchQueryExtension } from './tools/queryExternsion';
import { dispatchRunPlugin } from './plugin/run';
import { dispatchPluginInput } from './plugin/runInput';
import { dispatchPluginOutput } from './plugin/runOutput';
import { checkTheModuleConnectedByTool, valueTypeFormat } from './utils';
import { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { dispatchRunTools } from './agent/runTool/index';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import { DispatchFlowResponse } from './type';
import { dispatchStopToolCall } from './agent/runTool/stopTool';
import { dispatchLafRequest } from './tools/runLaf';

const callbackMap: Record<`${FlowNodeTypeEnum}`, Function> = {
  [FlowNodeTypeEnum.historyNode]: dispatchHistory,
  [FlowNodeTypeEnum.questionInput]: dispatchChatInput,
  [FlowNodeTypeEnum.answerNode]: dispatchAnswer,
  [FlowNodeTypeEnum.chatNode]: dispatchChatCompletion,
  [FlowNodeTypeEnum.datasetSearchNode]: dispatchDatasetSearch,
  [FlowNodeTypeEnum.datasetConcatNode]: dispatchDatasetConcat,
  [FlowNodeTypeEnum.classifyQuestion]: dispatchClassifyQuestion,
  [FlowNodeTypeEnum.contentExtract]: dispatchContentExtract,
  [FlowNodeTypeEnum.httpRequest]: dispatchHttpRequest,
  [FlowNodeTypeEnum.httpRequest468]: dispatchHttp468Request,
  [FlowNodeTypeEnum.runApp]: dispatchAppRequest,
  [FlowNodeTypeEnum.pluginModule]: dispatchRunPlugin,
  [FlowNodeTypeEnum.pluginInput]: dispatchPluginInput,
  [FlowNodeTypeEnum.pluginOutput]: dispatchPluginOutput,
  [FlowNodeTypeEnum.queryExtension]: dispatchQueryExtension,
  [FlowNodeTypeEnum.tools]: dispatchRunTools,
  [FlowNodeTypeEnum.stopTool]: dispatchStopToolCall,
  [FlowNodeTypeEnum.lafModule]: dispatchLafRequest,

  // none
  [FlowNodeTypeEnum.userGuide]: () => Promise.resolve()
};

/* running */
export async function dispatchWorkFlow({
  res,
  modules = [],
  runtimeModules,
  startParams = {},
  histories = [],
  variables = {},
  user,
  stream = false,
  detail = false,
  ...props
}: ChatDispatchProps & {
  modules?: ModuleItemType[]; // app modules
  runtimeModules?: RunningModuleItemType[];
  startParams?: Record<string, any>; // entry module params
}): Promise<DispatchFlowResponse> {
  // set sse response headers
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream;charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
  }

  variables = {
    ...getSystemVariable({ timezone: user.timezone }),
    ...variables
  };
  const runningModules = runtimeModules ? runtimeModules : loadModules(modules, variables);

  let chatResponses: ChatHistoryItemResType[] = []; // response request and save to database
  let chatAssistantResponse: AIChatItemValueItemType[] = []; // The value will be returned to the user
  let chatNodeUsages: ChatNodeUsageType[] = [];
  let toolRunResponse: ToolRunResponseItemType;
  let runningTime = Date.now();

  /* Store special response field  */
  function pushStore(
    { inputs = [] }: RunningModuleItemType,
    {
      answerText = '',
      responseData,
      nodeDispatchUsages,
      toolResponses,
      assistantResponses
    }: {
      [ModuleOutputKeyEnum.answerText]?: string;
      [DispatchNodeResponseKeyEnum.nodeResponse]?: ChatHistoryItemResType;
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]?: ChatNodeUsageType[];
      [DispatchNodeResponseKeyEnum.toolResponses]?: ToolRunResponseItemType;
      [DispatchNodeResponseKeyEnum.assistantResponses]?: AIChatItemValueItemType[]; // tool module, save the response value
    }
  ) {
    const time = Date.now();

    if (responseData) {
      chatResponses.push({
        ...responseData,
        runningTime: +((time - runningTime) / 1000).toFixed(2)
      });
    }
    if (nodeDispatchUsages) {
      chatNodeUsages = chatNodeUsages.concat(nodeDispatchUsages);
      props.maxRunTimes -= nodeDispatchUsages.length;
    }
    if (toolResponses !== undefined) {
      if (Array.isArray(toolResponses) && toolResponses.length === 0) return;
      if (typeof toolResponses === 'object' && Object.keys(toolResponses).length === 0) {
        return;
      }
      toolRunResponse = toolResponses;
    }
    if (assistantResponses) {
      chatAssistantResponse = chatAssistantResponse.concat(assistantResponses);
    }

    // save assistant text response
    if (answerText) {
      const isResponseAnswerText =
        inputs.find((item) => item.key === ModuleInputKeyEnum.aiChatIsResponseText)?.value ?? true;
      if (isResponseAnswerText) {
        chatAssistantResponse.push({
          type: ChatItemValueTypeEnum.text,
          text: {
            content: answerText
          }
        });
      }
    }

    runningTime = time;
  }
  /* Inject data into module input */
  function moduleInput(module: RunningModuleItemType, data: Record<string, any> = {}) {
    const updateInputValue = (key: string, value: any) => {
      const index = module.inputs.findIndex((item: any) => item.key === key);
      if (index === -1) return;
      module.inputs[index].value = value;
    };
    Object.entries(data).map(([key, val]: any) => {
      updateInputValue(key, val);
    });

    return;
  }
  /* Pass the output of the module to the next stage */
  function moduleOutput(
    module: RunningModuleItemType,
    result: Record<string, any> = {}
  ): Promise<any> {
    pushStore(module, result);

    const nextRunModules: RunningModuleItemType[] = [];

    // Assign the output value to the next module
    module.outputs.map((outputItem) => {
      if (result[outputItem.key] === undefined) return;
      /* update output value */
      outputItem.value = result[outputItem.key];

      /* update target */
      outputItem.targets.map((target: any) => {
        // find module
        const targetModule = runningModules.find((item) => item.moduleId === target.moduleId);
        if (!targetModule) return;

        // push to running queue
        nextRunModules.push(targetModule);

        // update input
        moduleInput(targetModule, { [target.key]: outputItem.value });
      });
    });

    // Ensure the uniqueness of running modules
    const set = new Set<string>();
    const filterModules = nextRunModules.filter((module) => {
      if (set.has(module.moduleId)) return false;
      set.add(module.moduleId);
      return true;
    });

    return checkModulesCanRun(filterModules);
  }
  function checkModulesCanRun(modules: RunningModuleItemType[] = []) {
    return Promise.all(
      modules.map((module) => {
        if (!module.inputs.find((item: any) => item.value === undefined)) {
          // remove switch
          moduleInput(module, { [ModuleInputKeyEnum.switch]: undefined });
          return moduleRun(module);
        }
      })
    );
  }
  async function moduleRun(module: RunningModuleItemType): Promise<any> {
    if (res.closed || props.maxRunTimes <= 0) return Promise.resolve();

    if (stream && detail && module.showStatus) {
      responseStatus({
        res,
        name: module.name,
        status: 'running'
      });
    }

    // get module running params
    const params: Record<string, any> = {};
    module.inputs.forEach((item) => {
      params[item.key] = valueTypeFormat(item.value, item.valueType);
    });

    const dispatchData: ModuleDispatchProps<Record<string, any>> = {
      ...props,
      res,
      variables,
      histories,
      user,
      stream,
      detail,
      module,
      runtimeModules: runningModules,
      params
    };

    // run module
    const dispatchRes: Record<string, any> = await (async () => {
      if (callbackMap[module.flowType]) {
        return callbackMap[module.flowType](dispatchData);
      }
      return {};
    })();

    // format response data. Add modulename and module type
    const formatResponseData: ChatHistoryItemResType = (() => {
      if (!dispatchRes[DispatchNodeResponseKeyEnum.nodeResponse]) return undefined;
      return {
        moduleName: module.name,
        moduleType: module.flowType,
        ...dispatchRes[DispatchNodeResponseKeyEnum.nodeResponse]
      };
    })();

    // Add output default value
    module.outputs.forEach((item) => {
      if (!item.required) return;
      if (dispatchRes[item.key] !== undefined) return;
      dispatchRes[item.key] = valueTypeFormat(item.defaultValue, item.valueType);
    });

    // Pass userChatInput
    const hasUserChatInputTarget = !!module.outputs.find(
      (item) => item.key === ModuleOutputKeyEnum.userChatInput
    )?.targets?.length;

    return moduleOutput(module, {
      [ModuleOutputKeyEnum.finish]: true,
      [ModuleOutputKeyEnum.userChatInput]: hasUserChatInputTarget
        ? params[ModuleOutputKeyEnum.userChatInput]
        : undefined,
      ...dispatchRes,
      [DispatchNodeResponseKeyEnum.nodeResponse]: formatResponseData,
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]:
        dispatchRes[DispatchNodeResponseKeyEnum.nodeDispatchUsages]
    });
  }
  // start process width initInput
  const initModules = runningModules.filter((item) => item.isEntry);
  // reset entry
  modules.forEach((item) => {
    item.isEntry = false;
  });

  initModules.map((module) =>
    moduleInput(module, {
      ...startParams,
      history: [] // abandon history field. History module will get histories from other fields.
    })
  );
  await checkModulesCanRun(initModules);

  // focus try to run pluginOutput
  const pluginOutputModule = runningModules.find(
    (item) => item.flowType === FlowNodeTypeEnum.pluginOutput
  );
  if (pluginOutputModule) {
    await moduleRun(pluginOutputModule);
  }

  return {
    flowResponses: chatResponses,
    flowUsages: chatNodeUsages,
    [DispatchNodeResponseKeyEnum.assistantResponses]:
      concatAssistantResponseAnswerText(chatAssistantResponse),
    [DispatchNodeResponseKeyEnum.toolResponses]: toolRunResponse
  };
}

/* init store modules to running modules */
function loadModules(
  modules: ModuleItemType[],
  variables: Record<string, any>
): RunningModuleItemType[] {
  return modules
    .filter((item) => {
      return ![FlowNodeTypeEnum.userGuide].includes(item.moduleId as any);
    })
    .map<RunningModuleItemType>((module) => {
      return {
        moduleId: module.moduleId,
        name: module.name,
        avatar: module.avatar,
        intro: module.intro,
        flowType: module.flowType,
        showStatus: module.showStatus,
        isEntry: module.isEntry,
        inputs: module.inputs
          .filter(
            /* 
              1. system input must be save
              2. connected by source handle
              3. manual input value or have default value
              4. For the module connected by the tool, leave the toolDescription input
            */
            (item) => {
              const isTool = checkTheModuleConnectedByTool(modules, module);

              if (isTool && item.toolDescription) {
                return true;
              }

              return (
                item.type === FlowNodeInputTypeEnum.systemInput ||
                item.connected ||
                item.value !== undefined
              );
            }
          ) // filter unconnected target input
          .map((item) => {
            const replace = ['string'].includes(typeof item.value);

            return {
              key: item.key,
              // variables replace
              value: replace ? replaceVariable(item.value, variables) : item.value,
              valueType: item.valueType,
              required: item.required,
              toolDescription: item.toolDescription
            };
          }),
        outputs: module.outputs
          .map((item) => ({
            key: item.key,
            required: item.required,
            defaultValue: item.defaultValue,
            answer: item.key === ModuleOutputKeyEnum.answerText,
            value: undefined,
            valueType: item.valueType,
            targets: item.targets
          }))
          .sort((a, b) => {
            // finish output always at last
            if (a.key === ModuleOutputKeyEnum.finish) return 1;
            if (b.key === ModuleOutputKeyEnum.finish) return -1;
            return 0;
          })
      };
    });
}

/* sse response modules staus */
export function responseStatus({
  res,
  status,
  name
}: {
  res: NextApiResponse;
  status?: 'running' | 'finish';
  name?: string;
}) {
  if (!name) return;
  responseWriteNodeStatus({
    res,
    name
  });
}

/* get system variable */
export function getSystemVariable({ timezone }: { timezone: string }) {
  return {
    cTime: getSystemTime(timezone)
  };
}

export const concatAssistantResponseAnswerText = (response: AIChatItemValueItemType[]) => {
  const result: AIChatItemValueItemType[] = [];
  // 合并连续的text
  for (let i = 0; i < response.length; i++) {
    const item = response[i];
    if (item.type === ChatItemValueTypeEnum.text) {
      let text = item.text?.content || '';
      const lastItem = result[result.length - 1];
      if (lastItem && lastItem.type === ChatItemValueTypeEnum.text && lastItem.text?.content) {
        lastItem.text.content += text;
        continue;
      }
    }
    result.push(item);
  }

  return result;
};
