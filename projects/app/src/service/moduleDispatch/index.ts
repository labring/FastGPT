import { NextApiResponse } from 'next';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import type { ChatDispatchProps, RunningModuleItemType } from '@fastgpt/global/core/module/type.d';
import { ModuleDispatchProps } from '@fastgpt/global/core/module/type.d';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type.d';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleItemType } from '@fastgpt/global/core/module/type';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { responseWrite } from '@fastgpt/service/common/response';
import { sseResponseEventEnum } from '@fastgpt/service/common/response/constant';
import { getSystemTime } from '@fastgpt/global/common/time/timezone';
import { initRunningModuleType } from '../core/modules/constant';

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
import { dispatchCFR } from './tools/cfr';
import { dispatchRunPlugin } from './plugin/run';
import { dispatchPluginInput } from './plugin/runInput';
import { dispatchPluginOutput } from './plugin/runOutput';
import { valueTypeFormat } from './utils';

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
  [FlowNodeTypeEnum.cfr]: dispatchCFR,

  // none
  [FlowNodeTypeEnum.userGuide]: () => Promise.resolve()
};

/* running */
export async function dispatchModules({
  res,
  modules,
  histories = [],
  startParams = {},
  variables = {},
  user,
  stream = false,
  detail = false,
  ...props
}: ChatDispatchProps & {
  modules: ModuleItemType[];
  startParams?: Record<string, any>;
}) {
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
  const runningModules = loadModules(modules, variables);

  // let storeData: Record<string, any> = {}; // after module used
  let chatResponse: ChatHistoryItemResType[] = []; // response request and save to database
  let chatAnswerText = ''; // AI answer
  let runningTime = Date.now();

  function pushStore(
    { inputs = [] }: RunningModuleItemType,
    {
      answerText = '',
      responseData
    }: {
      answerText?: string;
      responseData?: ChatHistoryItemResType | ChatHistoryItemResType[];
    }
  ) {
    const time = Date.now();
    if (responseData) {
      if (Array.isArray(responseData)) {
        chatResponse = chatResponse.concat(responseData);
      } else {
        chatResponse.push({
          ...responseData,
          runningTime: +((time - runningTime) / 1000).toFixed(2)
        });
      }
    }
    runningTime = time;

    const isResponseAnswerText =
      inputs.find((item) => item.key === ModuleInputKeyEnum.aiChatIsResponseText)?.value ?? true;
    if (isResponseAnswerText) {
      chatAnswerText += answerText;
    }
  }
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
    if (res.closed) return Promise.resolve();

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
      outputs: module.outputs,
      inputs: module.inputs,
      params
    };

    // run module
    const dispatchRes: Record<string, any> = await (async () => {
      if (callbackMap[module.flowType]) {
        return callbackMap[module.flowType](dispatchData);
      }
      return {};
    })();

    // format response data. Add modulename and moduletype
    const formatResponseData = (() => {
      if (!dispatchRes[ModuleOutputKeyEnum.responseData]) return undefined;
      if (Array.isArray(dispatchRes[ModuleOutputKeyEnum.responseData])) {
        return dispatchRes[ModuleOutputKeyEnum.responseData];
      }

      return {
        moduleName: module.name,
        moduleType: module.flowType,
        ...dispatchRes[ModuleOutputKeyEnum.responseData]
      };
    })();

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
      [ModuleOutputKeyEnum.responseData]: formatResponseData
    });
  }

  // start process width initInput
  const initModules = runningModules.filter((item) => initRunningModuleType[item.flowType]);

  // runningModules.forEach((item) => {
  //   console.log(item);
  // });

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
    [ModuleOutputKeyEnum.answerText]: chatAnswerText,
    [ModuleOutputKeyEnum.responseData]: chatResponse
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
    .map((module) => {
      return {
        moduleId: module.moduleId,
        name: module.name,
        flowType: module.flowType,
        showStatus: module.showStatus,
        inputs: module.inputs
          .filter(
            (item) =>
              item.type === FlowNodeInputTypeEnum.systemInput ||
              item.connected ||
              item.value !== undefined
          ) // filter unconnected target input
          .map((item) => {
            const replace = ['string'].includes(typeof item.value);

            return {
              key: item.key,
              // variables replace
              value: replace ? replaceVariable(item.value, variables) : item.value,
              valueType: item.valueType
            };
          }),
        outputs: module.outputs
          .map((item) => ({
            key: item.key,
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
  responseWrite({
    res,
    event: sseResponseEventEnum.moduleStatus,
    data: JSON.stringify({
      status: 'running',
      name
    })
  });
}

/* get system variable */
export function getSystemVariable({ timezone }: { timezone: string }) {
  return {
    cTime: getSystemTime(timezone)
  };
}
