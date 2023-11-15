import { NextApiResponse } from 'next';
import { SystemInputEnum, SystemOutputEnum } from '@/constants/app';
import { RunningModuleItemType } from '@/types/app';
import { ModuleDispatchProps } from '@/types/core/chat/type';
import { ChatHistoryItemResType } from '@fastgpt/global/core/chat/api';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleItemType } from '@fastgpt/global/core/module/type';
import { UserType } from '@fastgpt/global/support/user/type';
import { TaskResponseKeyEnum } from '@fastgpt/global/core/chat/constants';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { responseWrite } from '@fastgpt/service/common/response';
import { sseResponseEventEnum } from '@fastgpt/service/common/response/constant';
import { getSystemTime } from '@fastgpt/global/common/time/timezone';
import { initModuleType } from '@/constants/flow';

import { dispatchHistory } from './init/history';
import { dispatchChatInput } from './init/userChatInput';
import { dispatchChatCompletion } from './chat/oneapi';
import { dispatchDatasetSearch } from './dataset/search';
import { dispatchAnswer } from './tools/answer';
import { dispatchClassifyQuestion } from './agent/classifyQuestion';
import { dispatchContentExtract } from './agent/extract';
import { dispatchHttpRequest } from './tools/http';
import { dispatchAppRequest } from './tools/runApp';
import { dispatchRunPlugin } from './plugin/run';
import { dispatchPluginInput } from './plugin/runInput';
import { dispatchPluginOutput } from './plugin/runOutput';

/* running */
export async function dispatchModules({
  res,
  chatId,
  modules,
  user,
  teamId,
  tmbId,
  params = {},
  variables = {},
  stream = false,
  detail = false
}: {
  res: NextApiResponse;
  chatId?: string;
  modules: ModuleItemType[];
  user: UserType;
  teamId: string;
  tmbId: string;
  params?: Record<string, any>;
  variables?: Record<string, any>;
  stream?: boolean;
  detail?: boolean;
}) {
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
      inputs.find((item) => item.key === SystemInputEnum.isResponseAnswerText)?.value ?? true;
    if (isResponseAnswerText) {
      chatAnswerText += answerText;
    }
  }
  function moduleInput(
    module: RunningModuleItemType,
    data: Record<string, any> = {}
  ): Promise<any> {
    const checkInputFinish = () => {
      return !module.inputs.find((item: any) => item.value === undefined);
    };
    const updateInputValue = (key: string, value: any) => {
      const index = module.inputs.findIndex((item: any) => item.key === key);
      if (index === -1) return;
      module.inputs[index].value = value;
    };

    const set = new Set();

    return Promise.all(
      Object.entries(data).map(([key, val]: any) => {
        updateInputValue(key, val);

        if (!set.has(module.moduleId) && checkInputFinish()) {
          set.add(module.moduleId);
          // remove switch
          updateInputValue(SystemInputEnum.switch, undefined);
          return moduleRun(module);
        }
      })
    );
  }
  function moduleOutput(
    module: RunningModuleItemType,
    result: Record<string, any> = {}
  ): Promise<any> {
    pushStore(module, result);
    return Promise.all(
      module.outputs.map((outputItem) => {
        if (result[outputItem.key] === undefined) return;
        /* update output value */
        outputItem.value = result[outputItem.key];

        /* update target */
        return Promise.all(
          outputItem.targets.map((target: any) => {
            // find module
            const targetModule = runningModules.find((item) => item.moduleId === target.moduleId);
            if (!targetModule) return;

            return moduleInput(targetModule, { [target.key]: outputItem.value });
          })
        );
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

    // get fetch params
    const params: Record<string, any> = {};
    module.inputs.forEach((item: any) => {
      params[item.key] = item.value;
    });
    const props: ModuleDispatchProps<Record<string, any>> = {
      res,
      stream,
      detail,
      variables,
      outputs: module.outputs,
      user,
      teamId,
      tmbId,
      inputs: params
    };

    const dispatchRes: Record<string, any> = await (async () => {
      const callbackMap: Record<string, Function> = {
        [FlowNodeTypeEnum.historyNode]: dispatchHistory,
        [FlowNodeTypeEnum.questionInput]: dispatchChatInput,
        [FlowNodeTypeEnum.answerNode]: dispatchAnswer,
        [FlowNodeTypeEnum.chatNode]: dispatchChatCompletion,
        [FlowNodeTypeEnum.datasetSearchNode]: dispatchDatasetSearch,
        [FlowNodeTypeEnum.classifyQuestion]: dispatchClassifyQuestion,
        [FlowNodeTypeEnum.contentExtract]: dispatchContentExtract,
        [FlowNodeTypeEnum.httpRequest]: dispatchHttpRequest,
        [FlowNodeTypeEnum.runApp]: dispatchAppRequest,
        [FlowNodeTypeEnum.pluginModule]: dispatchRunPlugin,
        [FlowNodeTypeEnum.pluginInput]: dispatchPluginInput,
        [FlowNodeTypeEnum.pluginOutput]: dispatchPluginOutput
      };
      if (callbackMap[module.flowType]) {
        return callbackMap[module.flowType](props);
      }
      return {};
    })();

    const formatResponseData = (() => {
      if (!dispatchRes[TaskResponseKeyEnum.responseData]) return undefined;
      if (Array.isArray(dispatchRes[TaskResponseKeyEnum.responseData]))
        return dispatchRes[TaskResponseKeyEnum.responseData];
      return {
        ...dispatchRes[TaskResponseKeyEnum.responseData],
        moduleName: module.name,
        moduleType: module.flowType
      };
    })();

    return moduleOutput(module, {
      [SystemOutputEnum.finish]: true,
      ...dispatchRes,
      [TaskResponseKeyEnum.responseData]: formatResponseData
    });
  }

  // start process width initInput
  const initModules = runningModules.filter((item) => initModuleType[item.flowType]);

  await Promise.all(initModules.map((module) => moduleInput(module, params)));

  // focus running pluginOutput
  const pluginOutputModule = runningModules.find(
    (item) => item.flowType === FlowNodeTypeEnum.pluginOutput
  );
  if (pluginOutputModule) {
    await moduleRun(pluginOutputModule);
  }

  return {
    [TaskResponseKeyEnum.answerText]: chatAnswerText,
    [TaskResponseKeyEnum.responseData]: chatResponse
  };
}

/* init store modules to running modules */
function loadModules(
  modules: ModuleItemType[],
  variables: Record<string, any>
): RunningModuleItemType[] {
  return modules.map((module) => {
    return {
      moduleId: module.moduleId,
      name: module.name,
      flowType: module.flowType,
      showStatus: module.showStatus,
      inputs: module.inputs
        .filter((item) => item.connected) // filter unconnected target input
        .map((item) => {
          if (typeof item.value !== 'string') {
            return {
              key: item.key,
              value: item.value
            };
          }

          // variables replace
          const replacedVal = replaceVariable(item.value, variables);

          return {
            key: item.key,
            value: replacedVal
          };
        }),
      outputs: module.outputs
        .map((item) => ({
          key: item.key,
          answer: item.key === TaskResponseKeyEnum.answerText,
          value: undefined,
          targets: item.targets
        }))
        .sort((a, b) => {
          // finish output always at last
          if (a.key === SystemOutputEnum.finish) return 1;
          if (b.key === SystemOutputEnum.finish) return -1;
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
