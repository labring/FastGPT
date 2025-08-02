import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getSystemTime } from '@fastgpt/global/common/time/timezone';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  NodeOutputItemType,
  ToolRunResponseItemType
} from '@fastgpt/global/core/chat/type.d';
import type { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  ChatDispatchProps,
  DispatchNodeResultType,
  ModuleDispatchProps,
  SystemVariablesType
} from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type.d';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import { filterPublicNodeResponseData } from '@fastgpt/global/core/chat/utils';
import {
  checkNodeRunStatus,
  filterWorkflowEdges,
  getReferenceVariableValue,
  replaceEditorVariable,
  textAdaptGptResponse,
  valueTypeFormat
} from '@fastgpt/global/core/workflow/runtime/utils';
import type {
  InteractiveNodeResponseType,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { addLog } from '../../../common/system/log';
import { surrenderProcess } from '../../../common/system/tools';
import { dispatchAppRequest } from './abandoned/runApp';
import { dispatchClassifyQuestion } from './ai/classifyQuestion';
import { dispatchContentExtract } from './ai/extract';
import { dispatchRunTools } from './ai/agent/index';
import { dispatchStopToolCall } from './ai/agent/stopTool';
import { dispatchToolParams } from './ai/agent/toolParams';
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
import type { DispatchFlowResponse } from './type';
import { removeSystemVariable, rewriteRuntimeWorkFlow } from './utils';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';

const callbackMap: Record<FlowNodeTypeEnum, Function> = {
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

type Props = ChatDispatchProps & {
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: RuntimeEdgeItemType[];
};
type NodeResponseType = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]?: string;
  [NodeOutputKeyEnum.reasoningText]?: string;
  [key: string]: any;
}>;
type NodeResponseCompleteType = Omit<NodeResponseType, 'responseData'> & {
  [DispatchNodeResponseKeyEnum.nodeResponse]?: ChatHistoryItemResType;
};

/* running */
export async function dispatchWorkFlow(data: Props): Promise<DispatchFlowResponse> {
  let {
    res,
    runtimeNodes = [],
    runtimeEdges = [],
    histories = [],
    variables = {},
    timezone,
    externalProvider,
    stream = false,
    retainDatasetCite = true,
    version = 'v1',
    responseDetail = true,
    responseAllData = true,
    ...props
  } = data;
  const startTime = Date.now();

  await rewriteRuntimeWorkFlow({ nodes: runtimeNodes, edges: runtimeEdges });

  // 初始化深度和自动增加深度，避免无限嵌套
  if (!props.workflowDispatchDeep) {
    props.workflowDispatchDeep = 1;
  } else {
    props.workflowDispatchDeep += 1;
  }
  const isRootRuntime = props.workflowDispatchDeep === 1;

  if (props.workflowDispatchDeep > 20) {
    return {
      flowResponses: [],
      flowUsages: [],
      debugResponse: {
        finishedNodes: [],
        finishedEdges: [],
        nextStepRunNodes: []
      },
      [DispatchNodeResponseKeyEnum.runTimes]: 1,
      [DispatchNodeResponseKeyEnum.assistantResponses]: [],
      [DispatchNodeResponseKeyEnum.toolResponses]: null,
      newVariables: removeSystemVariable(variables, externalProvider.externalWorkflowVariables),
      durationSeconds: 0
    };
  }

  let workflowRunTimes = 0;
  let streamCheckTimer: NodeJS.Timeout | null = null;

  // Init
  if (isRootRuntime) {
    // set sse response headers
    res?.setHeader('Connection', 'keep-alive'); // Set keepalive for long connection
    if (stream && res) {
      res.on('close', () => res.end());
      res.on('error', () => {
        addLog.error('Request error');
        res.end();
      });

      res.setHeader('Content-Type', 'text/event-stream;charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Cache-Control', 'no-cache, no-transform');

      // 10s sends a message to prevent the browser from thinking that the connection is disconnected
      streamCheckTimer = setInterval(() => {
        props?.workflowStreamResponse?.({
          event: SseResponseEventEnum.answer,
          data: textAdaptGptResponse({
            text: ''
          })
        });
      }, 10000);
    }

    // Get default variables
    variables = {
      ...externalProvider.externalWorkflowVariables,
      ...getSystemVariables(data)
    };
  }

  let chatResponses: ChatHistoryItemResType[] = []; // response request and save to database
  let chatAssistantResponse: AIChatItemValueItemType[] = []; // The value will be returned to the user
  let chatNodeUsages: ChatNodeUsageType[] = [];
  let toolRunResponse: ToolRunResponseItemType; // Run with tool mode. Result will response to tool node.
  let debugNextStepRunNodes: RuntimeNodeItemType[] = [];
  // 记录交互节点，交互节点需要在工作流完全结束后再进行计算
  let nodeInteractiveResponse:
    | {
        entryNodeIds: string[];
        interactiveResponse: InteractiveNodeResponseType;
      }
    | undefined;
  let system_memories: Record<string, any> = {}; // Workflow node memories

  /* Store special response field  */
  function pushStore(
    { inputs = [] }: RuntimeNodeItemType,
    {
      data: { answerText = '', reasoningText } = {},
      responseData,
      nodeDispatchUsages,
      toolResponses,
      assistantResponses,
      rewriteHistories,
      runTimes = 1,
      system_memories: newMemories
    }: NodeResponseCompleteType
  ) {
    // Add run times
    workflowRunTimes += runTimes;
    props.maxRunTimes -= runTimes;

    if (newMemories) {
      system_memories = {
        ...system_memories,
        ...newMemories
      };
    }

    if (responseData) {
      chatResponses.push(responseData);
    }

    if (nodeDispatchUsages) {
      chatNodeUsages = chatNodeUsages.concat(nodeDispatchUsages);
    }

    if (toolResponses !== undefined && toolResponses !== null) {
      if (Array.isArray(toolResponses) && toolResponses.length === 0) return;
      if (
        !Array.isArray(toolResponses) &&
        typeof toolResponses === 'object' &&
        Object.keys(toolResponses).length === 0
      )
        return;
      toolRunResponse = toolResponses;
    }

    // Histories store
    if (assistantResponses) {
      chatAssistantResponse = chatAssistantResponse.concat(assistantResponses);
    } else {
      if (reasoningText) {
        const isResponseReasoningText = inputs.find(
          (item) => item.key === NodeInputKeyEnum.aiChatReasoning
        )?.value;
        if (isResponseReasoningText) {
          chatAssistantResponse.push({
            type: ChatItemValueTypeEnum.reasoning,
            reasoning: {
              content: reasoningText
            }
          });
        }
      }
      if (answerText) {
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
    }

    if (rewriteHistories) {
      histories = rewriteHistories;
    }
  }
  /* Pass the output of the node, to get next nodes and update edge status */
  function nodeOutput(
    node: RuntimeNodeItemType,
    result: NodeResponseCompleteType
  ): {
    nextStepActiveNodes: RuntimeNodeItemType[];
    nextStepSkipNodes: RuntimeNodeItemType[];
  } {
    pushStore(node, result);

    const concatData: Record<string, any> = {
      ...(result.data ?? {}),
      ...(result.error ?? {})
    };

    // Assign the output value to the next node
    node.outputs.forEach((outputItem) => {
      if (concatData[outputItem.key] === undefined) return;
      /* update output value */
      outputItem.value = concatData[outputItem.key];
    });

    // Get next source edges and update status
    const skipHandleId = result[DispatchNodeResponseKeyEnum.skipHandleId] || [];
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

    const nextStepActiveNodes: RuntimeNodeItemType[] = [];
    const nextStepSkipNodes: RuntimeNodeItemType[] = [];
    runtimeNodes.forEach((node) => {
      if (targetEdges.some((item) => item.target === node.nodeId && item.status === 'active')) {
        nextStepActiveNodes.push(node);
      }
      if (targetEdges.some((item) => item.target === node.nodeId && item.status === 'skipped')) {
        nextStepSkipNodes.push(node);
      }
    });

    if (props.mode === 'debug') {
      debugNextStepRunNodes = debugNextStepRunNodes.concat(
        props.lastInteractive ? nextStepActiveNodes : [...nextStepActiveNodes, ...nextStepSkipNodes]
      );
      return {
        nextStepActiveNodes: [],
        nextStepSkipNodes: []
      };
    }

    return {
      nextStepActiveNodes,
      nextStepSkipNodes
    };
  }

  /* Have interactive result, computed edges and node outputs */
  function handleInteractiveResult({
    entryNodeIds,
    interactiveResponse
  }: {
    entryNodeIds: string[];
    interactiveResponse: InteractiveNodeResponseType;
  }): AIChatItemValueItemType {
    // Get node outputs
    const nodeOutputs: NodeOutputItemType[] = [];
    runtimeNodes.forEach((node) => {
      node.outputs.forEach((output) => {
        if (output.value) {
          nodeOutputs.push({
            nodeId: node.nodeId,
            key: output.key as NodeOutputKeyEnum,
            value: output.value
          });
        }
      });
    });

    const interactiveResult: WorkflowInteractiveResponseType = {
      ...interactiveResponse,
      entryNodeIds,
      memoryEdges: runtimeEdges.map((edge) => ({
        ...edge,
        status: entryNodeIds.includes(edge.target) ? 'active' : edge.status
      })),
      nodeOutputs
    };

    // Tool call, not need interactive response
    if (!props.isToolCall && isRootRuntime) {
      props.workflowStreamResponse?.({
        event: SseResponseEventEnum.interactive,
        data: { interactive: interactiveResult }
      });
    }

    return {
      type: ChatItemValueTypeEnum.interactive,
      interactive: interactiveResult
    };
  }

  // 每个节点确定 运行/跳过 前，初始化边的状态
  function nodeRunBeforeHook(node: RuntimeNodeItemType) {
    runtimeEdges.forEach((item) => {
      if (item.target === node.nodeId) {
        item.status = 'waiting';
      }
    });
  }
  /* Check node run/skip or wait */
  async function checkNodeCanRun(
    node: RuntimeNodeItemType,
    skippedNodeIdList = new Set<string>()
  ): Promise<RuntimeNodeItemType[]> {
    if (res?.closed || props.maxRunTimes <= 0) return [];
    // Thread avoidance
    await surrenderProcess();

    addLog.debug(`Run node`, { maxRunTimes: props.maxRunTimes, appId: props.runningAppInfo.id });

    // Get node run status by edges
    const status = checkNodeRunStatus({
      node,
      runtimeEdges
    });

    const nodeRunResult = await (() => {
      if (status === 'run') {
        nodeRunBeforeHook(node);
        addLog.debug(`[dispatchWorkFlow] nodeRunWithActive: ${node.name}`);
        return nodeRunWithActive(node);
      }
      if (status === 'skip' && !skippedNodeIdList.has(node.nodeId)) {
        nodeRunBeforeHook(node);
        props.maxRunTimes -= 0.1;
        skippedNodeIdList.add(node.nodeId);
        addLog.debug(`[dispatchWorkFlow] nodeRunWithSkip: ${node.name}`);
        return nodeRunWithSkip(node);
      }
    })();

    if (!nodeRunResult) return [];

    /*
      特殊情况：
      通过 skipEdges 可以判断是运行了分支节点。
      由于分支节点，可能会实现递归调用（skip 连线往前递归）
      需要把分支节点也加入到已跳过的记录里，可以保证递归 skip 运行时，至多只会传递到当前分支节点，不会影响分支后的内容。
    */
    const skipEdges = (nodeRunResult.result[DispatchNodeResponseKeyEnum.skipHandleId] ||
      []) as string[];
    if (skipEdges && skipEdges?.length > 0) {
      skippedNodeIdList.add(node.nodeId);
    }

    // In the current version, only one interactive node is allowed at the same time
    const interactiveResponse = nodeRunResult.result?.[DispatchNodeResponseKeyEnum.interactive];
    if (interactiveResponse) {
      pushStore(nodeRunResult.node, nodeRunResult.result);

      if (props.mode === 'debug') {
        debugNextStepRunNodes = debugNextStepRunNodes.concat([nodeRunResult.node]);
      }

      nodeInteractiveResponse = {
        entryNodeIds: [nodeRunResult.node.nodeId],
        interactiveResponse
      };
      return [];
    }

    // Update the node output at the end of the run and get the next nodes
    let { nextStepActiveNodes, nextStepSkipNodes } = nodeOutput(
      nodeRunResult.node,
      nodeRunResult.result
    );
    // Remove repeat nodes(Make sure that the node is only executed once)
    nextStepActiveNodes = nextStepActiveNodes.filter(
      (node, index, self) => self.findIndex((t) => t.nodeId === node.nodeId) === index
    );
    nextStepSkipNodes = nextStepSkipNodes.filter(
      (node, index, self) => self.findIndex((t) => t.nodeId === node.nodeId) === index
    );

    // Run next nodes（先运行 run 的，再运行 skip 的）
    const nextStepActiveNodesResults = (
      await Promise.all(nextStepActiveNodes.map((node) => checkNodeCanRun(node)))
    ).flat();

    // 如果已经 active 运行过，不再执行 skip（active 中有闭环）
    nextStepSkipNodes = nextStepSkipNodes.filter(
      (node) => !nextStepActiveNodesResults.some((item) => item.nodeId === node.nodeId)
    );

    const nextStepSkipNodesResults = (
      await Promise.all(nextStepSkipNodes.map((node) => checkNodeCanRun(node, skippedNodeIdList)))
    ).flat();

    if (res?.closed) {
      addLog.warn('Request is closed', {
        appId: props.runningAppInfo.id,
        nodeId: node.nodeId,
        nodeName: node.name
      });
      return [];
    }

    return [
      ...nextStepActiveNodes,
      ...nextStepSkipNodes,
      ...nextStepActiveNodesResults,
      ...nextStepSkipNodesResults
    ];
  }
  /* Inject data into module input */
  function getNodeRunParams(node: RuntimeNodeItemType) {
    if (node.flowNodeType === FlowNodeTypeEnum.pluginInput) {
      // Format plugin input to object
      return node.inputs.reduce<Record<string, any>>((acc, item) => {
        acc[item.key] = valueTypeFormat(item.value, item.valueType);
        return acc;
      }, {});
    }

    // Dynamic input need to store a key.
    const dynamicInput = node.inputs.find(
      (item) => item.renderTypeList[0] === FlowNodeInputTypeEnum.addInputParam
    );
    const params: Record<string, any> = dynamicInput
      ? {
          [dynamicInput.key]: {}
        }
      : {};

    node.inputs.forEach((input) => {
      // Special input, not format
      if (input.key === dynamicInput?.key) return;

      // Skip some special key
      if (
        [NodeInputKeyEnum.childrenNodeIdList, NodeInputKeyEnum.httpJsonBody].includes(
          input.key as NodeInputKeyEnum
        )
      ) {
        params[input.key] = input.value;
        return;
      }

      // replace {{$xx.xx$}} and {{xx}} variables
      let value = replaceEditorVariable({
        text: input.value,
        nodes: runtimeNodes,
        variables
      });

      // replace reference variables
      value = getReferenceVariableValue({
        value,
        nodes: runtimeNodes,
        variables
      });

      // Dynamic input is stored in the dynamic key
      if (input.canEdit && dynamicInput && params[dynamicInput.key]) {
        params[dynamicInput.key][input.key] = valueTypeFormat(value, input.valueType);
      }
      params[input.key] = valueTypeFormat(value, input.valueType);
    });

    return params;
  }
  async function nodeRunWithActive(node: RuntimeNodeItemType): Promise<{
    node: RuntimeNodeItemType;
    runStatus: 'run';
    result: NodeResponseCompleteType;
  }> {
    // push run status messages
    if (node.showStatus && !props.isToolCall) {
      props.workflowStreamResponse?.({
        event: SseResponseEventEnum.flowNodeStatus,
        data: {
          status: 'running',
          name: node.name
        }
      });
    }
    const startTime = Date.now();

    // get node running params
    const params = getNodeRunParams(node);

    const dispatchData: ModuleDispatchProps<Record<string, any>> = {
      ...props,
      res,
      variables,
      histories,
      timezone,
      externalProvider,
      stream,
      retainDatasetCite,
      node,
      runtimeNodes,
      runtimeEdges,
      params,
      mode: props.mode === 'debug' ? 'test' : props.mode
    };

    // run module
    const dispatchRes: NodeResponseType = await (async () => {
      if (callbackMap[node.flowNodeType]) {
        const targetEdges = runtimeEdges.filter((item) => item.source === node.nodeId);

        try {
          const result = (await callbackMap[node.flowNodeType](dispatchData)) as NodeResponseType;
          const errorHandleId = getHandleId(node.nodeId, 'source_catch', 'right');

          if (!result.error) {
            const skipHandleId =
              targetEdges.find((item) => item.sourceHandle === errorHandleId)?.sourceHandle || '';

            return {
              ...result,
              [DispatchNodeResponseKeyEnum.skipHandleId]: (result[
                DispatchNodeResponseKeyEnum.skipHandleId
              ]
                ? [...result[DispatchNodeResponseKeyEnum.skipHandleId], skipHandleId]
                : [skipHandleId]
              ).filter(Boolean)
            };
          }

          // Run error and not catch error, skip all edges
          if (!node.catchError) {
            return {
              ...result,
              [DispatchNodeResponseKeyEnum.skipHandleId]: targetEdges.map(
                (item) => item.sourceHandle
              )
            };
          }

          //  Catch error
          const skipHandleIds = targetEdges
            .filter((item) => {
              if (node.catchError) {
                return item.sourceHandle !== errorHandleId;
              }
              return true;
            })
            .map((item) => item.sourceHandle);

          return {
            ...result,
            [DispatchNodeResponseKeyEnum.skipHandleId]: result[
              DispatchNodeResponseKeyEnum.skipHandleId
            ]
              ? [...result[DispatchNodeResponseKeyEnum.skipHandleId], ...skipHandleIds].filter(
                  Boolean
                )
              : skipHandleIds
          };
        } catch (error) {
          // Skip all edges and return error
          return {
            [DispatchNodeResponseKeyEnum.nodeResponse]: {
              error: getErrText(error)
            },
            [DispatchNodeResponseKeyEnum.skipHandleId]: targetEdges.map((item) => item.sourceHandle)
          };
        }
      }
      return {};
    })();

    // format response data. Add modulename and module type
    const formatResponseData: NodeResponseCompleteType['responseData'] = (() => {
      if (!dispatchRes[DispatchNodeResponseKeyEnum.nodeResponse]) return undefined;

      return {
        ...dispatchRes[DispatchNodeResponseKeyEnum.nodeResponse],
        id: getNanoid(),
        nodeId: node.nodeId,
        moduleName: node.name,
        moduleType: node.flowNodeType,
        runningTime: +((Date.now() - startTime) / 1000).toFixed(2)
      };
    })();

    // Response node response
    if (version === 'v2' && !props.isToolCall && isRootRuntime && formatResponseData) {
      props.workflowStreamResponse?.({
        event: SseResponseEventEnum.flowNodeResponse,
        data: responseAllData
          ? formatResponseData
          : filterPublicNodeResponseData({
              flowResponses: [formatResponseData],
              responseDetail
            })[0]
      });
    }

    // Add output default value
    if (dispatchRes.data) {
      node.outputs.forEach((item) => {
        if (!item.required) return;
        if (dispatchRes.data?.[item.key] !== undefined) return;
        dispatchRes.data![item.key] = valueTypeFormat(item.defaultValue, item.valueType);
      });
    }

    // Update new variables
    if (dispatchRes[DispatchNodeResponseKeyEnum.newVariables]) {
      variables = {
        ...variables,
        ...dispatchRes[DispatchNodeResponseKeyEnum.newVariables]
      };
    }

    // Error
    if (dispatchRes?.responseData?.error) {
      addLog.warn('workflow error', { error: dispatchRes.responseData.error });
    }

    return {
      node,
      runStatus: 'run',
      result: {
        ...dispatchRes,
        [DispatchNodeResponseKeyEnum.nodeResponse]: formatResponseData
      }
    };
  }
  async function nodeRunWithSkip(node: RuntimeNodeItemType): Promise<{
    node: RuntimeNodeItemType;
    runStatus: 'skip';
    result: NodeResponseCompleteType;
  }> {
    // Set target edges status to skipped
    const targetEdges = runtimeEdges.filter((item) => item.source === node.nodeId);

    return {
      node,
      runStatus: 'skip',
      result: {
        [DispatchNodeResponseKeyEnum.skipHandleId]: targetEdges.map((item) => item.sourceHandle)
      }
    };
  }

  try {
    // start process width initInput
    const entryNodes = runtimeNodes.filter((item) => item.isEntry);
    // reset entry
    runtimeNodes.forEach((item) => {
      // Interactively nodes will use the "isEntry", which does not need to be updated
      if (
        item.flowNodeType !== FlowNodeTypeEnum.userSelect &&
        item.flowNodeType !== FlowNodeTypeEnum.formInput &&
        item.flowNodeType !== FlowNodeTypeEnum.agent
      ) {
        item.isEntry = false;
      }
    });
    await Promise.all(entryNodes.map((node) => checkNodeCanRun(node)));

    // focus try to run pluginOutput
    const pluginOutputModule = runtimeNodes.find(
      (item) => item.flowNodeType === FlowNodeTypeEnum.pluginOutput
    );
    if (pluginOutputModule && props.mode !== 'debug') {
      await nodeRunWithActive(pluginOutputModule);
    }

    // Interactive node
    const interactiveResult = (() => {
      if (nodeInteractiveResponse) {
        const interactiveAssistant = handleInteractiveResult({
          entryNodeIds: nodeInteractiveResponse.entryNodeIds,
          interactiveResponse: nodeInteractiveResponse.interactiveResponse
        });
        if (isRootRuntime) {
          chatAssistantResponse.push(interactiveAssistant);
        }
        return interactiveAssistant.interactive;
      }
    })();

    const durationSeconds = +((Date.now() - startTime) / 1000).toFixed(2);

    if (isRootRuntime && stream) {
      props.workflowStreamResponse?.({
        event: SseResponseEventEnum.workflowDuration,
        data: { durationSeconds }
      });
    }

    return {
      flowResponses: chatResponses,
      flowUsages: chatNodeUsages,
      debugResponse: {
        finishedNodes: runtimeNodes,
        finishedEdges: runtimeEdges,
        nextStepRunNodes: debugNextStepRunNodes
      },
      workflowInteractiveResponse: interactiveResult,
      [DispatchNodeResponseKeyEnum.runTimes]: workflowRunTimes,
      [DispatchNodeResponseKeyEnum.assistantResponses]:
        mergeAssistantResponseAnswerText(chatAssistantResponse),
      [DispatchNodeResponseKeyEnum.toolResponses]: toolRunResponse,
      [DispatchNodeResponseKeyEnum.newVariables]: removeSystemVariable(
        variables,
        externalProvider.externalWorkflowVariables
      ),
      [DispatchNodeResponseKeyEnum.memories]:
        Object.keys(system_memories).length > 0 ? system_memories : undefined,
      durationSeconds
    };
  } catch (error) {
    return Promise.reject(error);
  } finally {
    if (streamCheckTimer) {
      clearInterval(streamCheckTimer);
    }
  }
}

/* get system variable */
const getSystemVariables = ({
  timezone,
  runningAppInfo,
  chatId,
  responseChatItemId,
  histories = [],
  uid,
  chatConfig,
  variables
}: Props): SystemVariablesType => {
  // Get global variables(Label -> key; Key -> key)
  const globalVariables = chatConfig?.variables || [];
  const variablesMap = globalVariables.reduce<Record<string, any>>((acc, item) => {
    // API
    if (variables[item.label] !== undefined) {
      acc[item.key] = valueTypeFormat(variables[item.label], item.valueType);
    }
    // Web
    else if (variables[item.key] !== undefined) {
      acc[item.key] = valueTypeFormat(variables[item.key], item.valueType);
    } else {
      acc[item.key] = valueTypeFormat(item.defaultValue, item.valueType);
    }
    return acc;
  }, {});

  return {
    ...variablesMap,
    // System var:
    userId: uid,
    appId: String(runningAppInfo.id),
    chatId,
    responseChatItemId,
    histories,
    cTime: getSystemTime(timezone)
  };
};

/* Merge consecutive text messages into one */
const mergeAssistantResponseAnswerText = (response: AIChatItemValueItemType[]) => {
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

  // If result is empty, auto add a text message
  if (result.length === 0) {
    result.push({
      type: ChatItemValueTypeEnum.text,
      text: { content: '' }
    });
  }

  return result;
};
