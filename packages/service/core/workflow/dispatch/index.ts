import { NextApiResponse } from 'next';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { ChatDispatchProps } from '@fastgpt/global/core/workflow/type/index.d';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type.d';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/type/index.d';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  ToolRunResponseItemType
} from '@fastgpt/global/core/chat/type.d';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { responseWriteNodeStatus } from '../../../common/response';
import { getSystemTime } from '@fastgpt/global/common/time/timezone';

import { dispatchWorkflowStart } from './init/workflowStart';
import { dispatchChatCompletion } from './chat/oneapi';
import { dispatchDatasetSearch } from './dataset/search';
import { dispatchDatasetConcat } from './dataset/concat';
import { dispatchAnswer } from './tools/answer';
import { dispatchClassifyQuestion } from './agent/classifyQuestion';
import { dispatchContentExtract } from './agent/extract';
import { dispatchHttp468Request } from './tools/http468';
import { dispatchAppRequest } from './tools/runApp';
import { dispatchQueryExtension } from './tools/queryExternsion';
import { dispatchRunPlugin } from './plugin/run';
import { dispatchPluginInput } from './plugin/runInput';
import { dispatchPluginOutput } from './plugin/runOutput';
import { removeSystemVariable, valueTypeFormat } from './utils';
import {
  filterWorkflowEdges,
  checkNodeRunStatus
} from '@fastgpt/global/core/workflow/runtime/utils';
import { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { dispatchRunTools } from './agent/runTool/index';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import { DispatchFlowResponse } from './type';
import { dispatchStopToolCall } from './agent/runTool/stopTool';
import { dispatchLafRequest } from './tools/runLaf';
import { dispatchIfElse } from './tools/runIfElse';
import { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { getReferenceVariableValue } from '@fastgpt/global/core/workflow/runtime/utils';
import { dispatchSystemConfig } from './init/systemConfig';
import { dispatchUpdateVariable } from './tools/runUpdateVar';
import { addLog } from '../../../common/system/log';
import { surrenderProcess } from '../../../common/system/tools';
import { dispatchRunCode } from './code/run';

const callbackMap: Record<FlowNodeTypeEnum, Function> = {
  [FlowNodeTypeEnum.workflowStart]: dispatchWorkflowStart,
  [FlowNodeTypeEnum.answerNode]: dispatchAnswer,
  [FlowNodeTypeEnum.chatNode]: dispatchChatCompletion,
  [FlowNodeTypeEnum.datasetSearchNode]: dispatchDatasetSearch,
  [FlowNodeTypeEnum.datasetConcatNode]: dispatchDatasetConcat,
  [FlowNodeTypeEnum.classifyQuestion]: dispatchClassifyQuestion,
  [FlowNodeTypeEnum.contentExtract]: dispatchContentExtract,
  [FlowNodeTypeEnum.httpRequest468]: dispatchHttp468Request,
  [FlowNodeTypeEnum.runApp]: dispatchAppRequest,
  [FlowNodeTypeEnum.pluginModule]: dispatchRunPlugin,
  [FlowNodeTypeEnum.pluginInput]: dispatchPluginInput,
  [FlowNodeTypeEnum.pluginOutput]: dispatchPluginOutput,
  [FlowNodeTypeEnum.queryExtension]: dispatchQueryExtension,
  [FlowNodeTypeEnum.tools]: dispatchRunTools,
  [FlowNodeTypeEnum.stopTool]: dispatchStopToolCall,
  [FlowNodeTypeEnum.lafModule]: dispatchLafRequest,
  [FlowNodeTypeEnum.ifElseNode]: dispatchIfElse,
  [FlowNodeTypeEnum.variableUpdate]: dispatchUpdateVariable,
  [FlowNodeTypeEnum.code]: dispatchRunCode,

  // none
  [FlowNodeTypeEnum.systemConfig]: dispatchSystemConfig,
  [FlowNodeTypeEnum.emptyNode]: () => Promise.resolve(),
  [FlowNodeTypeEnum.globalVariable]: () => Promise.resolve()
};

type Props = ChatDispatchProps & {
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: RuntimeEdgeItemType[];
};

/* running */
export async function dispatchWorkFlow(data: Props): Promise<DispatchFlowResponse> {
  let {
    res,
    runtimeNodes = [],
    runtimeEdges = [],
    histories = [],
    variables = {},
    user,
    stream = false,
    detail = false,
    ...props
  } = data;

  // set sse response headers
  if (stream && res) {
    res.setHeader('Content-Type', 'text/event-stream;charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
  }

  variables = {
    ...getSystemVariable(data),
    ...variables
  };

  let chatResponses: ChatHistoryItemResType[] = []; // response request and save to database
  let chatAssistantResponse: AIChatItemValueItemType[] = []; // The value will be returned to the user
  let chatNodeUsages: ChatNodeUsageType[] = [];
  let toolRunResponse: ToolRunResponseItemType;
  let runningTime = Date.now();
  let debugNextStepRunNodes: RuntimeNodeItemType[] = [];

  /* Store special response field  */
  function pushStore(
    { inputs = [] }: RuntimeNodeItemType,
    {
      answerText = '',
      responseData,
      nodeDispatchUsages,
      toolResponses,
      assistantResponses
    }: {
      [NodeOutputKeyEnum.answerText]?: string;
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
    } else if (answerText) {
      // save assistant text response
      const isResponseAnswerText =
        inputs.find((item) => item.key === NodeInputKeyEnum.aiChatIsResponseText)?.value ?? true;
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
  /* Pass the output of the module to the next stage */
  function nodeOutput(
    node: RuntimeNodeItemType,
    result: Record<string, any> = {}
  ): RuntimeNodeItemType[] {
    pushStore(node, result);

    // Assign the output value to the next node
    node.outputs.forEach((outputItem) => {
      if (result[outputItem.key] === undefined) return;
      /* update output value */
      outputItem.value = result[outputItem.key];
    });

    // Get next source edges and update status
    const skipHandleId = (result[DispatchNodeResponseKeyEnum.skipHandleId] || []) as string[];
    const targetEdges = filterWorkflowEdges(runtimeEdges).filter(
      (item) => item.source === node.nodeId
    );

    // update edge status
    targetEdges.forEach((edge) => {
      if (skipHandleId.includes(edge.sourceHandle)) {
        edge.status = 'skipped';
      } else {
        edge.status = 'active';
      }
    });

    const nextStepNodes = runtimeNodes.filter((node) => {
      return targetEdges.some((item) => item.target === node.nodeId);
    });

    if (props.mode === 'debug') {
      debugNextStepRunNodes = debugNextStepRunNodes.concat(nextStepNodes);
      return [];
    }

    return nextStepNodes;
  }
  function checkNodeCanRun(nodes: RuntimeNodeItemType[] = []): Promise<any> {
    return Promise.all(
      nodes.map(async (node) => {
        const status = checkNodeRunStatus({
          node,
          runtimeEdges
        });

        if (res?.closed || props.maxRunTimes <= 0) return;
        props.maxRunTimes--;
        addLog.debug(`Run node`, { maxRunTimes: props.maxRunTimes, uid: user._id });

        await surrenderProcess();

        if (status === 'run') {
          addLog.debug(`[dispatchWorkFlow] nodeRunWithActive: ${node.name}`);
          return nodeRunWithActive(node);
        }
        if (status === 'skip') {
          addLog.debug(`[dispatchWorkFlow] nodeRunWithSkip: ${node.name}`);
          return nodeRunWithSkip(node);
        }

        return;
      })
    ).then((result) => {
      const flat = result.flat().filter(Boolean) as unknown as {
        node: RuntimeNodeItemType;
        result: Record<string, any>;
      }[];
      if (flat.length === 0) return;

      // Update the node output at the end of the run and get the next nodes
      const nextNodes = flat.map((item) => nodeOutput(item.node, item.result)).flat();

      // Remove repeat nodes(Make sure that the node is only executed once)
      const filterNextNodes = nextNodes.filter(
        (node, index, self) => self.findIndex((t) => t.nodeId === node.nodeId) === index
      );

      return checkNodeCanRun(filterNextNodes);
    });
  }
  // 运行完一轮后，清除连线的状态，避免污染进程
  function nodeRunFinish(node: RuntimeNodeItemType) {
    const edges = runtimeEdges.filter((item) => item.target === node.nodeId);
    edges.forEach((item) => {
      item.status = 'waiting';
    });
  }
  /* Inject data into module input */
  function getNodeRunParams(node: RuntimeNodeItemType) {
    const params: Record<string, any> = {};
    node.inputs.forEach((input) => {
      // replace {{}} variables
      let value = replaceVariable(input.value, variables);

      // replace reference variables
      value = getReferenceVariableValue({
        value,
        nodes: runtimeNodes,
        variables
      });
      // format valueType
      params[input.key] = valueTypeFormat(value, input.valueType);
    });

    return params;
  }
  async function nodeRunWithActive(node: RuntimeNodeItemType) {
    // push run status messages
    if (res && stream && detail && node.showStatus) {
      responseStatus({
        res,
        name: node.name,
        status: 'running'
      });
    }

    // get node running params
    const params = getNodeRunParams(node);

    const dispatchData: ModuleDispatchProps<Record<string, any>> = {
      ...props,
      res,
      variables,
      histories,
      user,
      stream,
      detail,
      node,
      runtimeNodes,
      runtimeEdges,
      params,
      mode: props.mode === 'debug' ? 'test' : props.mode
    };

    // run module
    const dispatchRes: Record<string, any> = await (async () => {
      if (callbackMap[node.flowNodeType]) {
        return callbackMap[node.flowNodeType](dispatchData);
      }
      return {};
    })();

    // format response data. Add modulename and module type
    const formatResponseData: ChatHistoryItemResType = (() => {
      if (!dispatchRes[DispatchNodeResponseKeyEnum.nodeResponse]) return undefined;
      return {
        nodeId: node.nodeId,
        moduleName: node.name,
        moduleType: node.flowNodeType,
        ...dispatchRes[DispatchNodeResponseKeyEnum.nodeResponse]
      };
    })();

    // Add output default value
    node.outputs.forEach((item) => {
      if (!item.required) return;
      if (dispatchRes[item.key] !== undefined) return;
      dispatchRes[item.key] = valueTypeFormat(item.defaultValue, item.valueType);
    });

    nodeRunFinish(node);

    return {
      node,
      result: {
        ...dispatchRes,
        [DispatchNodeResponseKeyEnum.nodeResponse]: formatResponseData
      }
    };
  }
  async function nodeRunWithSkip(node: RuntimeNodeItemType) {
    // 其后所有target的节点，都设置为skip
    const targetEdges = runtimeEdges.filter((item) => item.source === node.nodeId);
    nodeRunFinish(node);

    return {
      node,
      result: {
        [DispatchNodeResponseKeyEnum.skipHandleId]: targetEdges.map((item) => item.sourceHandle)
      }
    };
  }

  // start process width initInput
  const entryNodes = runtimeNodes.filter((item) => item.isEntry);

  // reset entry
  runtimeNodes.forEach((item) => {
    item.isEntry = false;
  });
  await checkNodeCanRun(entryNodes);

  // focus try to run pluginOutput
  const pluginOutputModule = runtimeNodes.find(
    (item) => item.flowNodeType === FlowNodeTypeEnum.pluginOutput
  );
  if (pluginOutputModule && props.mode !== 'debug') {
    await nodeRunWithActive(pluginOutputModule);
  }

  return {
    flowResponses: chatResponses,
    flowUsages: chatNodeUsages,
    debugResponse: {
      finishedNodes: runtimeNodes,
      finishedEdges: runtimeEdges,
      nextStepRunNodes: debugNextStepRunNodes
    },
    [DispatchNodeResponseKeyEnum.assistantResponses]:
      mergeAssistantResponseAnswerText(chatAssistantResponse),
    [DispatchNodeResponseKeyEnum.toolResponses]: toolRunResponse,
    newVariables: removeSystemVariable(variables)
  };
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
export function getSystemVariable({
  user,
  app,
  chatId,
  responseChatItemId,
  histories = []
}: Props) {
  return {
    appId: String(app._id),
    chatId,
    responseChatItemId,
    histories,
    cTime: getSystemTime(user.timezone)
  };
}

/* Merge consecutive text messages into one */
export const mergeAssistantResponseAnswerText = (response: AIChatItemValueItemType[]) => {
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
