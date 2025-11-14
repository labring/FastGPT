import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getSystemTime } from '@fastgpt/global/common/time/timezone';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  NodeOutputItemType,
  ToolRunResponseItemType
} from '@fastgpt/global/core/chat/type.d';
import type { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeInputKeyEnum, VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
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
import type { DispatchFlowResponse, WorkflowDebugResponse } from './type';
import { rewriteRuntimeWorkFlow, runtimeSystemVar2StoreType } from './utils';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { callbackMap } from './constants';
import { anyValueDecrypt } from '../../../common/secret/utils';
import { getUserChatInfo } from '../../../support/user/team/utils';
import { checkTeamAIPoints } from '../../../support/permission/teamLimit';
import type { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { createChatUsageRecord, pushChatItemUsage } from '../../../support/wallet/usage/controller';
import type { RequireOnlyOne } from '@fastgpt/global/common/type/utils';
import { getS3ChatSource } from '../../../common/s3/sources/chat';
import { addPreviewUrlToChatItems } from '../../chat/utils';
import type { MCPClient } from '../../app/mcp';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { i18nT } from '../../../../web/i18n/utils';

type Props = Omit<ChatDispatchProps, 'workflowDispatchDeep' | 'timezone' | 'externalProvider'> & {
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: RuntimeEdgeItemType[];
  defaultSkipNodeQueue?: WorkflowDebugResponse['skipNodeQueue'];
};
type NodeResponseType = DispatchNodeResultType<{
  [key: string]: any;
}>;
type NodeResponseCompleteType = Omit<NodeResponseType, 'responseData'> & {
  [DispatchNodeResponseKeyEnum.nodeResponse]?: ChatHistoryItemResType;
};

// Run workflow
type WorkflowUsageProps = RequireOnlyOne<{
  usageSource: UsageSourceEnum;
  concatUsage: (points: number) => any;
  usageId: string;
}>;
export async function dispatchWorkFlow({
  usageSource,
  usageId,
  concatUsage,
  ...data
}: Props & WorkflowUsageProps): Promise<DispatchFlowResponse> {
  const { res, stream, runningUserInfo, runningAppInfo, lastInteractive, histories, query } = data;

  await checkTeamAIPoints(runningUserInfo.teamId);
  const [{ timezone, externalProvider }, newUsageId] = await Promise.all([
    getUserChatInfo(runningUserInfo.tmbId),
    (() => {
      if (lastInteractive?.usageId) {
        return lastInteractive.usageId;
      }
      if (usageSource) {
        return createChatUsageRecord({
          appName: runningAppInfo.name,
          appId: runningAppInfo.id,
          teamId: runningUserInfo.teamId,
          tmbId: runningUserInfo.tmbId,
          source: usageSource
        });
      }
      return usageId;
    })()
  ]);

  let streamCheckTimer: NodeJS.Timeout | null = null;

  // set sse response headers
  if (res) {
    res.setHeader('Connection', 'keep-alive'); // Set keepalive for long connection
    if (stream) {
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
        data?.workflowStreamResponse?.({
          event: SseResponseEventEnum.answer,
          data: textAdaptGptResponse({
            text: ''
          })
        });
      }, 10000);
    }
  }

  // Add preview url to chat items
  await addPreviewUrlToChatItems(histories, 'chatFlow');
  for (const item of query) {
    if (item.type !== ChatItemValueTypeEnum.file || !item.file?.key) continue;
    item.file.url = await getS3ChatSource().createGetChatFileURL({
      key: item.file.key,
      external: true
    });
  }

  // Get default variables

  const defaultVariables = {
    ...externalProvider.externalWorkflowVariables,
    ...(await getSystemVariables({
      ...data,
      query,
      histories,
      timezone
    }))
  };

  let mcpClientMemory = {} as Record<string, MCPClient>;

  // Init some props
  return runWorkflow({
    ...data,
    query,
    histories,
    timezone,
    externalProvider,
    variables: defaultVariables,
    workflowDispatchDeep: 0,
    usageId: newUsageId,
    concatUsage,
    mcpClientMemory
  }).finally(() => {
    if (streamCheckTimer) {
      clearInterval(streamCheckTimer);
    }

    // Close mcpClient connections
    Object.values(mcpClientMemory).forEach((client) => {
      client.closeConnection();
    });
  });
}

type RunWorkflowProps = ChatDispatchProps & {
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: RuntimeEdgeItemType[];
  mcpClientMemory: Record<string, MCPClient>;
  defaultSkipNodeQueue?: WorkflowDebugResponse['skipNodeQueue'];
  concatUsage?: (points: number) => any;
};
export const runWorkflow = async (data: RunWorkflowProps): Promise<DispatchFlowResponse> => {
  let {
    res,
    runtimeNodes = [],
    runtimeEdges = [],
    histories = [],
    variables = {},
    externalProvider,
    retainDatasetCite = true,
    version = 'v1',
    responseDetail = true,
    responseAllData = true,
    usageId,
    concatUsage,
    runningUserInfo: { teamId },
    mcpClientMemory
  } = data;

  // Over max depth
  data.workflowDispatchDeep++;
  const isRootRuntime = data.workflowDispatchDeep === 1;
  if (data.workflowDispatchDeep > 20) {
    return {
      flowResponses: [],
      flowUsages: [],
      debugResponse: {
        memoryEdges: [],
        memoryNodes: [],
        entryNodeIds: [],
        nodeResponses: {},
        skipNodeQueue: []
      },
      [DispatchNodeResponseKeyEnum.runTimes]: 1,
      [DispatchNodeResponseKeyEnum.assistantResponses]: [],
      [DispatchNodeResponseKeyEnum.toolResponses]: null,
      [DispatchNodeResponseKeyEnum.newVariables]: runtimeSystemVar2StoreType({
        variables,
        removeObj: externalProvider.externalWorkflowVariables,
        userVariablesConfigs: data.chatConfig?.variables
      }),
      durationSeconds: 0
    };
  }

  const startTime = Date.now();

  await rewriteRuntimeWorkFlow({ nodes: runtimeNodes, edges: runtimeEdges, lang: data.lang });

  const isDebugMode = data.mode === 'debug';

  /*
    工作流队列控制
    特点：
      1. 可以控制一个 team 下，并发 run 的节点数量。
      2. 每个节点，同时只会执行一个。一个节点不可能同时运行多次。
      3. 都会返回 resolve，不存在 reject 状态。
    方案：
      - 采用回调的方式，避免深度递归。
      - 使用 activeRunQueue 记录待运行检查的节点（可能可以运行），并控制并发数量。
      - 每次添加新节点，以及节点运行结束后，均会执行一次 processActiveNode 方法。 processActiveNode 方法，如果没触发跳出条件，则必定会取一个 activeRunQueue 继续检查处理。
      - checkNodeCanRun 会检查该节点状态
        - 没满足运行条件：跳出函数
        - 运行：执行节点逻辑，并返回结果，将 target node 加入到 activeRunQueue 中，等待队列处理。
        - 跳过：执行跳过逻辑，并将其后续的 target node 也进行一次检查。
    特殊情况：
      - 触发交互节点后，需要跳过所有 skip 节点，避免后续执行了 skipNode。
  */
  class WorkflowQueue {
    runtimeNodesMap = new Map(runtimeNodes.map((item) => [item.nodeId, item]));
    // Workflow variables
    workflowRunTimes = 0;
    chatResponses: ChatHistoryItemResType[] = []; // response request and save to database
    chatAssistantResponse: AIChatItemValueItemType[] = []; // The value will be returned to the user
    chatNodeUsages: ChatNodeUsageType[] = [];
    toolRunResponse: ToolRunResponseItemType; // Run with tool mode. Result will response to tool node.
    // 记录交互节点，交互节点需要在工作流完全结束后再进行计算
    nodeInteractiveResponse:
      | {
          entryNodeIds: string[];
          interactiveResponse: InteractiveNodeResponseType;
        }
      | undefined;
    system_memories: Record<string, any> = {}; // Workflow node memories

    // Debug
    debugNextStepRunNodes: RuntimeNodeItemType[] = []; // 记录 Debug 模式下，下一个阶段需要执行的节点。
    debugNodeResponses: WorkflowDebugResponse['nodeResponses'] = {};

    // Queue variables
    private activeRunQueue = new Set<string>();
    private skipNodeQueue = new Map<
      string,
      { node: RuntimeNodeItemType; skippedNodeIdList: Set<string> }
    >();
    private runningNodeCount = 0;
    private maxConcurrency: number;
    private resolve: (e: WorkflowQueue) => void;

    constructor({
      maxConcurrency = 10,
      defaultSkipNodeQueue,
      resolve
    }: {
      maxConcurrency?: number;
      defaultSkipNodeQueue?: WorkflowDebugResponse['skipNodeQueue'];
      resolve: (e: WorkflowQueue) => void;
    }) {
      this.maxConcurrency = maxConcurrency;
      this.resolve = resolve;

      // Init skip node queue
      defaultSkipNodeQueue?.forEach(({ id, skippedNodeIdList }) => {
        const node = this.runtimeNodesMap.get(id);
        if (!node) return;
        this.addSkipNode(node, new Set(skippedNodeIdList));
      });
    }

    get connectionIsActive(): boolean {
      return !res?.closed && !res?.errored;
    }

    // Add active node to queue (if already in the queue, it will not be added again)
    addActiveNode(nodeId: string) {
      if (this.activeRunQueue.has(nodeId)) {
        return;
      }
      this.activeRunQueue.add(nodeId);

      this.processActiveNode();
    }
    // Process next active node
    private processActiveNode() {
      // Finish
      if (this.activeRunQueue.size === 0 && this.runningNodeCount === 0) {
        if (isDebugMode) {
          // 没有下一个激活节点，说明debug 进入了一个“即将结束”状态。可以开始处理 skip 节点
          if (this.debugNextStepRunNodes.length === 0 && this.skipNodeQueue.size > 0) {
            this.processSkipNodes();
          } else {
            this.resolve(this);
          }
          return;
        }

        // 如果没有交互响应，则开始处理 skip（交互响应的 skip 需要留给后续处理）
        if (this.skipNodeQueue.size > 0 && !this.nodeInteractiveResponse) {
          this.processSkipNodes();
        } else {
          this.resolve(this);
        }
        return;
      }

      // Over max concurrency（如果 this.activeRunQueue.size === 0 条件触发，代表肯定有节点在运行）
      if (this.activeRunQueue.size === 0 || this.runningNodeCount >= this.maxConcurrency) {
        return;
      }

      const nodeId = this.activeRunQueue.keys().next().value;
      const node = nodeId ? this.runtimeNodesMap.get(nodeId) : undefined;

      if (nodeId) {
        this.activeRunQueue.delete(nodeId);
      }
      if (node) {
        this.runningNodeCount++;

        this.checkNodeCanRun(node).finally(() => {
          this.runningNodeCount--;
          this.processActiveNode();
        });
      }
      // 兜底，除非极端情况，否则不可能触发
      else {
        this.processActiveNode();
      }
    }

    private addSkipNode(node: RuntimeNodeItemType, skippedNodeIdList: Set<string>) {
      // 保证一个node 只在queue里记录一次
      const skipNodeSkippedNodeIdList =
        this.skipNodeQueue.get(node.nodeId)?.skippedNodeIdList || new Set<string>();

      const concatSkippedNodeIdList = new Set([...skippedNodeIdList, ...skipNodeSkippedNodeIdList]);

      this.skipNodeQueue.set(node.nodeId, { node, skippedNodeIdList: concatSkippedNodeIdList });
    }
    private processSkipNodes() {
      // 取一个 node，并且从队列里删除
      const skipItem = this.skipNodeQueue.values().next().value;
      if (skipItem) {
        this.skipNodeQueue.delete(skipItem.node.nodeId);
        this.checkNodeCanRun(skipItem.node, skipItem.skippedNodeIdList).finally(() => {
          this.processActiveNode();
        });
      } else {
        this.processActiveNode();
      }
    }

    async nodeRunWithActive(node: RuntimeNodeItemType): Promise<{
      node: RuntimeNodeItemType;
      runStatus: 'run';
      result: NodeResponseCompleteType;
    }> {
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

      // push run status messages
      if (node.showStatus && !data.isToolCall) {
        data.workflowStreamResponse?.({
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
        ...data,
        mcpClientMemory,
        lastInteractive: data.lastInteractive?.entryNodeIds?.includes(node.nodeId)
          ? data.lastInteractive
          : undefined,
        variables,
        histories,
        retainDatasetCite,
        node,
        runtimeNodes,
        runtimeEdges,
        params,
        mode: isDebugMode ? 'test' : data.mode
      };

      // run module
      const dispatchRes: NodeResponseType = await (async () => {
        if (callbackMap[node.flowNodeType]) {
          const targetEdges = runtimeEdges.filter((item) => item.source === node.nodeId);

          try {
            const result = (await callbackMap[node.flowNodeType](dispatchData)) as NodeResponseType;
            const errorHandleId = getHandleId(node.nodeId, 'source_catch', 'right');

            if (result.error) {
              // Run error and not catch error, skip all edges
              if (!node.catchError) {
                return {
                  ...result,
                  [DispatchNodeResponseKeyEnum.skipHandleId]: targetEdges.map(
                    (item) => item.sourceHandle
                  )
                };
              }

              // Catch error, skip unError handle
              const skipHandleIds = targetEdges
                .filter((item) => item.sourceHandle !== errorHandleId)
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
            }

            // Not error
            const errorHandle =
              targetEdges.find((item) => item.sourceHandle === errorHandleId)?.sourceHandle || '';

            return {
              ...result,
              [DispatchNodeResponseKeyEnum.skipHandleId]: (result[
                DispatchNodeResponseKeyEnum.skipHandleId
              ]
                ? [...result[DispatchNodeResponseKeyEnum.skipHandleId], errorHandle]
                : [errorHandle]
              ).filter(Boolean)
            };
          } catch (error) {
            // Skip all edges and return error
            return {
              [DispatchNodeResponseKeyEnum.nodeResponse]: {
                error: getErrText(error)
              },
              [DispatchNodeResponseKeyEnum.skipHandleId]: targetEdges.map(
                (item) => item.sourceHandle
              )
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
      if (version === 'v2' && !data.isToolCall && isRootRuntime && formatResponseData) {
        data.workflowStreamResponse?.({
          event: SseResponseEventEnum.flowNodeResponse,
          data: responseAllData
            ? formatResponseData
            : filterPublicNodeResponseData({
                nodeRespones: [formatResponseData],
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
    private nodeRunWithSkip(node: RuntimeNodeItemType): {
      node: RuntimeNodeItemType;
      runStatus: 'skip';
      result: NodeResponseCompleteType;
    } {
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
    private async checkTeamBlance(): Promise<NodeResponseCompleteType | undefined> {
      try {
        await checkTeamAIPoints(data.runningUserInfo.teamId);
      } catch (error) {
        // Next time you enter the system, you will still start from the current node(Current check team blance node).
        if (error === TeamErrEnum.aiPointsNotEnough) {
          return {
            [DispatchNodeResponseKeyEnum.interactive]: {
              type: 'paymentPause',
              params: {
                description: i18nT('chat:balance_not_enough_pause')
              }
            }
          };
        }
      }
    }
    /* Check node run/skip or wait */
    private async checkNodeCanRun(
      node: RuntimeNodeItemType,
      skippedNodeIdList = new Set<string>()
    ) {
      /* Store special response field  */
      const pushStore = ({
        answerText,
        reasoningText,
        responseData,
        nodeDispatchUsages,
        toolResponses,
        assistantResponses,
        rewriteHistories,
        runTimes = 1,
        system_memories: newMemories
      }: NodeResponseCompleteType) => {
        // Add run times
        this.workflowRunTimes += runTimes;
        data.maxRunTimes -= runTimes;

        if (newMemories) {
          this.system_memories = {
            ...this.system_memories,
            ...newMemories
          };
        }

        if (responseData) {
          this.chatResponses.push(responseData);
        }

        // Push usage in real time. Avoid a workflow usage a large number of points
        if (nodeDispatchUsages) {
          if (usageId) {
            pushChatItemUsage({
              teamId,
              usageId,
              nodeUsages: nodeDispatchUsages
            });
          }
          if (concatUsage) {
            concatUsage(nodeDispatchUsages.reduce((sum, item) => sum + (item.totalPoints || 0), 0));
          }

          this.chatNodeUsages = this.chatNodeUsages.concat(nodeDispatchUsages);
        }

        if (
          (toolResponses !== undefined && toolResponses !== null) ||
          (Array.isArray(toolResponses) && toolResponses.length > 0) ||
          (!Array.isArray(toolResponses) &&
            typeof toolResponses === 'object' &&
            Object.keys(toolResponses).length > 0)
        ) {
          this.toolRunResponse = toolResponses;
        }

        // Histories store
        if (assistantResponses) {
          this.chatAssistantResponse = this.chatAssistantResponse.concat(assistantResponses);
        } else {
          if (reasoningText) {
            this.chatAssistantResponse.push({
              type: ChatItemValueTypeEnum.reasoning,
              reasoning: {
                content: reasoningText
              }
            });
          }
          if (answerText) {
            this.chatAssistantResponse.push({
              type: ChatItemValueTypeEnum.text,
              text: {
                content: answerText
              }
            });
          }
        }

        if (rewriteHistories) {
          histories = rewriteHistories;
        }
      };
      /* Pass the output of the node, to get next nodes and update edge status */
      const nodeOutput = (
        node: RuntimeNodeItemType,
        result: NodeResponseCompleteType
      ): {
        nextStepActiveNodes: RuntimeNodeItemType[];
        nextStepSkipNodes: RuntimeNodeItemType[];
      } => {
        pushStore(result);

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

        // 同时可以去重
        const nextStepActiveNodesMap = new Map<string, RuntimeNodeItemType>();
        const nextStepSkipNodesMap = new Map<string, RuntimeNodeItemType>();
        runtimeNodes.forEach((node) => {
          if (targetEdges.some((item) => item.target === node.nodeId && item.status === 'active')) {
            nextStepActiveNodesMap.set(node.nodeId, node);
          }
          if (
            targetEdges.some((item) => item.target === node.nodeId && item.status === 'skipped')
          ) {
            nextStepSkipNodesMap.set(node.nodeId, node);
          }
        });

        const nextStepActiveNodes = Array.from(nextStepActiveNodesMap.values());
        const nextStepSkipNodes = Array.from(nextStepSkipNodesMap.values());

        return {
          nextStepActiveNodes,
          nextStepSkipNodes
        };
      };

      // Check queue status
      if (data.maxRunTimes <= 0) {
        addLog.error('Max run times is 0', {
          appId: data.runningAppInfo.id
        });
        return;
      }
      if (!this.connectionIsActive) {
        addLog.warn('Request is closed/errored', {
          appId: data.runningAppInfo.id,
          nodeId: node.nodeId,
          nodeName: node.name
        });
        return;
      }

      // Thread avoidance
      await surrenderProcess();

      addLog.debug(`Run node`, { maxRunTimes: data.maxRunTimes, appId: data.runningAppInfo.id });

      // Get node run status by edges
      const status = checkNodeRunStatus({
        nodesMap: this.runtimeNodesMap,
        node,
        runtimeEdges
      });

      const nodeRunResult = await (async () => {
        if (status === 'run') {
          const blanceCheckResult = await this.checkTeamBlance();
          if (blanceCheckResult) {
            return {
              node,
              runStatus: 'pause' as const,
              result: blanceCheckResult
            };
          }

          // All source edges status to waiting
          runtimeEdges.forEach((item) => {
            if (item.target === node.nodeId) {
              item.status = 'waiting';
            }
          });

          addLog.debug(`[dispatchWorkFlow] nodeRunWithActive: ${node.name}`);
          return this.nodeRunWithActive(node);
        }
        if (status === 'skip' && !skippedNodeIdList.has(node.nodeId)) {
          // All skip source edges status to waiting
          runtimeEdges.forEach((item) => {
            if (item.target === node.nodeId) {
              item.status = 'waiting';
            }
          });

          data.maxRunTimes -= 0.1;
          skippedNodeIdList.add(node.nodeId);
          addLog.debug(`[dispatchWorkFlow] nodeRunWithSkip: ${node.name}`);
          return this.nodeRunWithSkip(node);
        }
      })();

      if (!nodeRunResult) return;

      // Store debug data
      if (isDebugMode) {
        if (status === 'run') {
          this.debugNodeResponses[node.nodeId] = {
            nodeId: node.nodeId,
            type: 'run',
            interactiveResponse: nodeRunResult.result[DispatchNodeResponseKeyEnum.interactive],
            response: nodeRunResult.result[DispatchNodeResponseKeyEnum.nodeResponse]
          };
        } else if (status === 'skip') {
          this.debugNodeResponses[node.nodeId] = {
            nodeId: node.nodeId,
            type: 'skip',
            response: nodeRunResult.result[DispatchNodeResponseKeyEnum.nodeResponse]
          };
        }
      }
      // 如果一个节点 active 运行了，则需要把它从 skip queue 里删除
      if (status === 'run') {
        this.skipNodeQueue.delete(node.nodeId);
      }

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

      // Update the node output at the end of the run and get the next nodes
      const { nextStepActiveNodes, nextStepSkipNodes } = nodeOutput(
        nodeRunResult.node,
        nodeRunResult.result
      );

      nextStepSkipNodes.forEach((node) => {
        this.addSkipNode(node, skippedNodeIdList);
      });

      // In the current version, only one interactive node is allowed at the same time
      const interactiveResponse = nodeRunResult.result[DispatchNodeResponseKeyEnum.interactive];
      if (interactiveResponse) {
        if (isDebugMode) {
          this.debugNextStepRunNodes = this.debugNextStepRunNodes.concat([nodeRunResult.node]);
        }

        // For the pause interactive response, there may be multiple nodes triggered at the same time, so multiple entry nodes need to be recorded.
        // For other interactive nodes, only one will be triggered at the same time.
        if (interactiveResponse.type === 'paymentPause') {
          this.nodeInteractiveResponse = {
            entryNodeIds: this.nodeInteractiveResponse?.entryNodeIds
              ? this.nodeInteractiveResponse.entryNodeIds.concat(nodeRunResult.node.nodeId)
              : [nodeRunResult.node.nodeId],
            interactiveResponse
          };
        } else {
          this.nodeInteractiveResponse = {
            entryNodeIds: [nodeRunResult.node.nodeId],
            interactiveResponse
          };
        }
        return;
      } else if (isDebugMode) {
        // Debug 模式下一步时候，会自己增加 activeNode
        this.debugNextStepRunNodes = this.debugNextStepRunNodes.concat(nextStepActiveNodes);
      } else {
        nextStepActiveNodes.forEach((node) => {
          this.addActiveNode(node.nodeId);
        });
      }
    }

    /* Have interactive result, computed edges and node outputs */
    handleInteractiveResult({
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
        skipNodeQueue: Array.from(this.skipNodeQueue.values()).map((item) => ({
          id: item.node.nodeId,
          skippedNodeIdList: Array.from(item.skippedNodeIdList)
        })),
        entryNodeIds,
        memoryEdges: runtimeEdges.map((edge) => ({
          ...edge,
          // 入口前面的边全部激活，保证下次进来一定能执行。
          status: entryNodeIds.includes(edge.target) ? 'active' : edge.status
        })),
        nodeOutputs,
        usageId
      };

      // Tool call, not need interactive response
      if (!data.isToolCall && isRootRuntime) {
        data.workflowStreamResponse?.({
          event: SseResponseEventEnum.interactive,
          data: { interactive: interactiveResult }
        });
      }

      return {
        type: ChatItemValueTypeEnum.interactive,
        interactive: interactiveResult
      };
    }
    getDebugResponse(): WorkflowDebugResponse {
      const entryNodeIds = this.debugNextStepRunNodes.map((item) => item.nodeId);

      return {
        memoryEdges: runtimeEdges.map((edge) => ({
          ...edge,
          status: entryNodeIds.includes(edge.target) ? 'active' : edge.status
        })),
        memoryNodes: Array.from(this.runtimeNodesMap.values()),
        entryNodeIds,
        nodeResponses: this.debugNodeResponses,
        skipNodeQueue: Array.from(this.skipNodeQueue.values()).map((item) => ({
          id: item.node.nodeId,
          skippedNodeIdList: Array.from(item.skippedNodeIdList)
        }))
      };
    }
  }

  // Start process width initInput
  const entryNodes = runtimeNodes.filter((item) => item.isEntry);
  // Reset entry
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

  const workflowQueue = await new Promise<WorkflowQueue>((resolve) => {
    const workflowQueue = new WorkflowQueue({
      resolve,
      defaultSkipNodeQueue: data.lastInteractive?.skipNodeQueue || data.defaultSkipNodeQueue
    });

    entryNodes.forEach((node) => {
      workflowQueue.addActiveNode(node.nodeId);
    });
  });

  // Get interactive node response.
  const interactiveResult = (() => {
    if (workflowQueue.nodeInteractiveResponse) {
      const interactiveAssistant = workflowQueue.handleInteractiveResult({
        entryNodeIds: workflowQueue.nodeInteractiveResponse.entryNodeIds,
        interactiveResponse: workflowQueue.nodeInteractiveResponse.interactiveResponse
      });
      if (isRootRuntime) {
        workflowQueue.chatAssistantResponse.push(interactiveAssistant);
      }
      return interactiveAssistant.interactive;
    }
  })();

  const durationSeconds = +((Date.now() - startTime) / 1000).toFixed(2);

  if (isRootRuntime) {
    data.workflowStreamResponse?.({
      event: SseResponseEventEnum.workflowDuration,
      data: { durationSeconds }
    });
  }

  return {
    flowResponses: workflowQueue.chatResponses,
    flowUsages: workflowQueue.chatNodeUsages,
    debugResponse: workflowQueue.getDebugResponse(),
    workflowInteractiveResponse: interactiveResult,
    [DispatchNodeResponseKeyEnum.runTimes]: workflowQueue.workflowRunTimes,
    [DispatchNodeResponseKeyEnum.assistantResponses]: mergeAssistantResponseAnswerText(
      workflowQueue.chatAssistantResponse
    ),
    [DispatchNodeResponseKeyEnum.toolResponses]: workflowQueue.toolRunResponse,
    [DispatchNodeResponseKeyEnum.newVariables]: runtimeSystemVar2StoreType({
      variables,
      removeObj: externalProvider.externalWorkflowVariables,
      userVariablesConfigs: data.chatConfig?.variables
    }),
    [DispatchNodeResponseKeyEnum.memories]:
      Object.keys(workflowQueue.system_memories).length > 0
        ? workflowQueue.system_memories
        : undefined,
    durationSeconds
  };
};

/* get system variable */
const getSystemVariables = async ({
  timezone,
  runningAppInfo,
  chatId,
  responseChatItemId,
  histories = [],
  uid,
  chatConfig,
  variables
}: Props & {
  timezone: string;
}): Promise<SystemVariablesType> => {
  // Get global variables(Label -> key; Key -> key)
  const variablesConfig = chatConfig?.variables || [];

  const variablesMap: Record<string, any> = {};
  for await (const item of variablesConfig) {
    // For internal variables, ignore external input and use default value
    if (item.type === VariableInputEnum.password) {
      const val = variables[item.label] || variables[item.key] || item.defaultValue;
      const actualValue = anyValueDecrypt(val);
      variablesMap[item.key] = valueTypeFormat(actualValue, item.valueType);
    }
    // API
    else if (variables[item.label] !== undefined) {
      variablesMap[item.key] = valueTypeFormat(variables[item.label], item.valueType);
    }
    // Web
    else if (variables[item.key] !== undefined) {
      variablesMap[item.key] = valueTypeFormat(variables[item.key], item.valueType);
    } else {
      variablesMap[item.key] = valueTypeFormat(item.defaultValue, item.valueType);
    }
  }

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
