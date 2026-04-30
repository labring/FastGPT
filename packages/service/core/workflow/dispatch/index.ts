import { getNanoid } from '@fastgpt/global/common/string/tools';
import { SpanStatusCode, trace, type Span } from '@opentelemetry/api';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  ToolRunResponseItemType
} from '@fastgpt/global/core/chat/type';
import type {
  NodeEdgeGroups,
  NodeEdgeGroupsMap,
  NodeOutputItemType
} from '@fastgpt/global/core/workflow/runtime/type';
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
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { getErrText, UserError } from '@fastgpt/global/common/error/utils';
import { filterPublicNodeResponseData } from '@fastgpt/global/core/chat/utils';
import {
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
import { getLogger, LogCategories } from '../../../common/logger';
import { surrenderProcess } from '../../../common/system/tools';
import type { DispatchFlowResponse, WorkflowDebugResponse } from './type';
import {
  rewriteRuntimeWorkFlow,
  runtimeSystemVar2StoreType,
  filterOrphanEdges,
  getSystemVariables
} from './utils';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { callbackMap } from './constants';
import { getUserChatInfo } from '../../../support/user/team/utils';
import { checkTeamAIPoints } from '../../../support/permission/teamLimit';
import type { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { createChatUsageRecord, pushChatItemUsage } from '../../../support/wallet/usage/controller';
import type { RequireOnlyOne } from '@fastgpt/global/common/type/utils';
import { getS3ChatSource } from '../../../common/s3/sources/chat';
import { addPreviewUrlToChatItems } from '../../chat/utils';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { i18nT } from '../../../../web/i18n/utils';
import { validateFileUrlDomain } from '../../../common/security/fileUrlValidator';
import { classifyEdgesByDFS, findSCCs, isNodeInCycle, getEdgeType } from '../utils/tarjan';
import { observeWorkflowRun, observeWorkflowStep } from '../metrics';
import { withActiveSpan } from '../../../common/tracing';
import { delAgentRuntimeStopSign, shouldWorkflowStop } from './workflowStatus';
import { runWithContext } from '../utils/context';

const logger = getLogger(LogCategories.MODULE.WORKFLOW.DISPATCH);

type Props = Omit<
  ChatDispatchProps,
  'checkIsStopping' | 'workflowDispatchDeep' | 'timezone' | 'externalProvider'
> & {
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

type WorkflowObservedStepResult = {
  node: RuntimeNodeItemType;
  runStatus: 'run';
  result: NodeResponseCompleteType;
};

const tracedWorkflowStepTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.appModule,
  FlowNodeTypeEnum.pluginModule,
  FlowNodeTypeEnum.agent,
  FlowNodeTypeEnum.chatNode,
  FlowNodeTypeEnum.datasetSearchNode,
  FlowNodeTypeEnum.classifyQuestion,
  FlowNodeTypeEnum.contentExtract,
  FlowNodeTypeEnum.queryExtension,
  FlowNodeTypeEnum.toolCall,
  FlowNodeTypeEnum.httpRequest468,
  FlowNodeTypeEnum.lafModule,
  FlowNodeTypeEnum.code,
  FlowNodeTypeEnum.readFiles,
  FlowNodeTypeEnum.tool
]);

function shouldTraceWorkflowStep(nodeType: FlowNodeTypeEnum) {
  return tracedWorkflowStepTypes.has(nodeType);
}

function getWorkflowStepStatus(result: WorkflowObservedStepResult): 'ok' | 'error' {
  return result.result[DispatchNodeResponseKeyEnum.nodeResponse]?.error ? 'error' : 'ok';
}

function addWorkflowStepEvent({
  eventName,
  nodeType,
  mode,
  status,
  durationMs
}: {
  eventName: 'workflow.step.start' | 'workflow.step.end';
  nodeType: FlowNodeTypeEnum;
  mode: string;
  status?: 'ok' | 'error';
  durationMs?: number;
}) {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) return;

  const attributes: Record<string, string | number> = {
    'fastgpt.workflow.node.type': nodeType,
    'fastgpt.workflow.mode': mode
  };

  if (status) {
    attributes['fastgpt.workflow.step.status'] = status;
  }
  if (typeof durationMs === 'number') {
    attributes['fastgpt.workflow.step.duration_ms'] = durationMs;
  }

  activeSpan.addEvent(eventName, attributes);
}

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
  const {
    res,
    stream,
    runningUserInfo,
    runningAppInfo,
    lastInteractive,
    histories,
    query,
    chatId,
    apiVersion
  } = data;

  // Check url valid
  const invalidInput = query.some((item) => {
    if ('file' in item && item.file?.url) {
      if (!validateFileUrlDomain(item.file.url)) {
        return true;
      }
    }
  });
  if (invalidInput) {
    logger.info('Workflow run blocked due to invalid file url');
    return Promise.reject(new UserError('Invalid file url'));
  }

  /* Init function */
  // Check point
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
    })(),
    // Add preview url to chat items
    await addPreviewUrlToChatItems(histories, 'chatFlow'),
    // Add preview url to query
    ...query.map(async (item) => {
      if (!item.file?.key) return;
      const { url } = await getS3ChatSource().createGetChatFileURL({
        key: item.file.key,
        external: true
      });
      item.file.url = url;
    }),
    // Remove stopping sign
    delAgentRuntimeStopSign({
      appId: runningAppInfo.id,
      chatId
    })
  ]);

  let streamCheckTimer: NodeJS.Timeout | null = null;

  // set sse response headers
  if (res) {
    res.setHeader('Connection', 'keep-alive'); // Set keepalive for long connection
    if (stream) {
      res.on('close', () => res.end());
      res.on('error', () => {
        logger.error('Workflow stream response error');
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

  // Get default variables
  const defaultVariables = {
    ...externalProvider.externalWorkflowVariables,
    ...(await getSystemVariables({
      runningAppInfo: runningAppInfo,
      chatId: chatId,
      responseChatItemId: data.responseChatItemId,
      histories: histories,
      uid: data.uid,
      chatConfig: data.chatConfig,
      variables: data.variables,
      timezone: timezone
    }))
  };

  // Stop sign(没有 apiVersion，说明不会有暂停)
  let stopping = false;
  const checkIsStopping = (): boolean => {
    if (apiVersion === 'v2') {
      return stopping;
    }
    if (apiVersion === 'v1') {
      if (!res) return false;
      return res.closed || !!res.errored;
    }
    return false;
  };
  const checkStoppingTimer =
    apiVersion === 'v2'
      ? setInterval(async () => {
          if (stopping) return;

          const shouldStop = await shouldWorkflowStop({
            appId: runningAppInfo.id,
            chatId
          });
          if (shouldStop) {
            stopping = true;
          }
        }, 100)
      : undefined;

  // Init some props
  return new Promise((resolve, reject) => {
    runWithContext(
      {
        queryUrlTypeMap: {},
        mcpClientMemory: {}
      },
      (ctx) => {
        runWorkflow({
          ...data,
          checkIsStopping,
          query,
          histories,
          timezone,
          externalProvider,
          variables: defaultVariables,
          workflowDispatchDeep: 0,
          usageId: newUsageId,
          concatUsage
        })
          .then(resolve)
          .catch(reject)
          .finally(async () => {
            if (streamCheckTimer) {
              clearInterval(streamCheckTimer);
            }
            if (checkStoppingTimer) {
              clearInterval(checkStoppingTimer);
            }

            // Close mcpClient connections
            Object.values(ctx.mcpClientMemory).forEach((client) => {
              client.closeConnection();
            });

            // 工作流完成后删除 Redis 记录
            await delAgentRuntimeStopSign({
              appId: runningAppInfo.id,
              chatId
            });
          });
      }
    );
  });
}

export type RunWorkflowProps = ChatDispatchProps & {
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: RuntimeEdgeItemType[];
  defaultSkipNodeQueue?: WorkflowDebugResponse['skipNodeQueue'];
  concatUsage?: (points: number) => any;
};
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
export class WorkflowQueue {
  private data: RunWorkflowProps;
  isRootRuntime: boolean;
  private runtimeNodesMap: Map<string, RuntimeNodeItemType>;
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
  customFeedbackList: string[] = []; // Custom feedbacks collected from nodes

  // Debug
  private isDebugMode: boolean;
  private debugNextStepRunNodes: RuntimeNodeItemType[] = []; // 记录 Debug 模式下，下一个阶段需要执行的节点。
  private debugNodeResponses: WorkflowDebugResponse['nodeResponses'] = {};

  // Queue variables
  private activeRunQueue = new Set<string>();
  private skipNodeQueue = new Map<
    string,
    { node: RuntimeNodeItemType; skippedNodeIdList: Set<string> }
  >();
  private maxConcurrency: number;
  private resolve: (e: WorkflowQueue) => void;
  private processingActive = false; // 标记是否正在处理队列

  // Buffer
  // 可以根据 nodeId 获取所有的 source 边和 target 边
  private edgeIndex = {
    bySource: new Map<string, RuntimeEdgeItemType[]>(),
    byTarget: new Map<string, RuntimeEdgeItemType[]>()
  };
  // 🆕 预构建的节点边分组 Map
  private nodeEdgeGroupsMap: NodeEdgeGroupsMap;

  constructor({
    data,
    maxConcurrency = 10,
    defaultSkipNodeQueue,
    resolve
  }: {
    data: RunWorkflowProps;
    maxConcurrency?: number;
    defaultSkipNodeQueue?: WorkflowDebugResponse['skipNodeQueue'];
    resolve: (e: WorkflowQueue) => void;
  }) {
    this.data = data;
    this.isRootRuntime = data.workflowDispatchDeep === 1;
    this.maxConcurrency = maxConcurrency;
    this.resolve = resolve;
    this.runtimeNodesMap = new Map(data.runtimeNodes.map((item) => [item.nodeId, item]));
    this.isDebugMode = data.mode === 'debug';

    // Init skip node queue
    defaultSkipNodeQueue?.forEach(({ id, skippedNodeIdList }) => {
      const node = this.runtimeNodesMap.get(id);
      if (!node) return;
      this.addSkipNode(node, new Set(skippedNodeIdList));
    });

    this.edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: data.runtimeEdges });
    // 🆕 预构建节点边分组 Map（一次性计算，后续直接查询）
    this.nodeEdgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
      nodesMap: this.runtimeNodesMap,
      runtimeNodes: data.runtimeNodes,
      edgeIndex: this.edgeIndex
    });
  }

  /* ===== utils ===== */
  // 一次性构建edge索引 - O(m)
  static buildEdgeIndex({ runtimeEdges }: { runtimeEdges: RuntimeEdgeItemType[] }) {
    const edgeIndex = {
      bySource: new Map<string, RuntimeEdgeItemType[]>(),
      byTarget: new Map<string, RuntimeEdgeItemType[]>()
    };
    const filteredEdges = filterWorkflowEdges(runtimeEdges);
    filteredEdges.forEach((edge) => {
      if (!edgeIndex.bySource.has(edge.source)) {
        edgeIndex.bySource.set(edge.source, []);
      }
      edgeIndex.bySource.get(edge.source)!.push(edge);

      if (!edgeIndex.byTarget.has(edge.target)) {
        edgeIndex.byTarget.set(edge.target, []);
      }
      edgeIndex.byTarget.get(edge.target)!.push(edge);
    });

    return edgeIndex;
  }

  /**
   * 预构建所有节点的边分组
   * 使用 DFS 回边检测 + Tarjan SCC 算法
   *
   * 分组策略：
   * 1. 使用 DFS 边分类识别回边（循环边）
   * 2. 使用 Tarjan SCC 判断节点是否在循环中
   * 3. 根据节点是否在循环中决定是否按 branchHandle 分组
   */
  static buildNodeEdgeGroupsMap({
    nodesMap,
    runtimeNodes,
    edgeIndex
  }: {
    nodesMap?: Map<string, RuntimeNodeItemType>;
    runtimeNodes: RuntimeNodeItemType[];
    edgeIndex: {
      bySource: Map<string, RuntimeEdgeItemType[]>;
      byTarget: Map<string, RuntimeEdgeItemType[]>;
    };
  }): NodeEdgeGroupsMap {
    const formatNodesMap = nodesMap
      ? nodesMap
      : new Map(runtimeNodes.map((item) => [item.nodeId, item]));
    const nodeEdgeGroupsMap = new Map<string, NodeEdgeGroups>();

    // 第一步：全局 DFS 边分类
    const edgeTypes = classifyEdgesByDFS(runtimeNodes, edgeIndex);

    // 第二步：Tarjan 找出所有 SCC
    const { nodeToSCC, sccSizes } = findSCCs(runtimeNodes, edgeIndex);

    // 辅助函数
    const isBranchNode = (node: RuntimeNodeItemType) => {
      const type = {
        [FlowNodeTypeEnum.ifElseNode]: true,
        [FlowNodeTypeEnum.classifyQuestion]: true,
        [FlowNodeTypeEnum.userSelect]: true
      };
      return !!type[node.flowNodeType as keyof typeof type];
    };

    // 第三步：为每个节点构建分组
    runtimeNodes.forEach((targetNode) => {
      const sourceEdges = edgeIndex.byTarget.get(targetNode.nodeId) || [];

      // 判断目标节点是否在循环中
      const targetInCycle = isNodeInCycle(targetNode.nodeId, nodeToSCC, sccSizes);

      // 分类边：回边 vs 非回边
      const backEdges: RuntimeEdgeItemType[] = [];
      const nonBackEdges: RuntimeEdgeItemType[] = [];

      sourceEdges.forEach((edge) => {
        const type = getEdgeType(edge, edgeTypes);
        if (type === 'back') {
          backEdges.push(edge);
        } else {
          nonBackEdges.push(edge);
        }
      });

      // 构建分组
      const edgesGroup: NodeEdgeGroups = [];

      // 处理非回边
      if (nonBackEdges.length > 0) {
        if (targetInCycle) {
          // 目标节点在循环中 → 按 branchHandle 分组
          const branchGroups = this.groupEdgesByBranch(
            nonBackEdges,
            edgeIndex,
            formatNodesMap,
            isBranchNode
          );
          edgesGroup.push(...branchGroups);
        } else {
          // 目标节点不在循环中 → 所有非回边放在同一组
          edgesGroup.push(nonBackEdges);
        }
      }

      // 处理回边
      if (backEdges.length > 0) {
        // 回边按 branchHandle 分组
        const branchGroups = this.groupEdgesByBranch(
          backEdges,
          edgeIndex,
          formatNodesMap,
          isBranchNode
        );
        edgesGroup.push(...branchGroups);
      }

      nodeEdgeGroupsMap.set(targetNode.nodeId, edgesGroup);
    });

    return nodeEdgeGroupsMap;
  }

  /**
   * 按 branchHandle 分组边
   */
  private static groupEdgesByBranch(
    edges: RuntimeEdgeItemType[],
    edgeIndex: {
      bySource: Map<string, RuntimeEdgeItemType[]>;
      byTarget: Map<string, RuntimeEdgeItemType[]>;
    },
    nodesMap: Map<string, RuntimeNodeItemType>,
    isBranchNode: (node: RuntimeNodeItemType) => boolean
  ): RuntimeEdgeItemType[][] {
    // 为每条边找到其 branchHandle
    const edgeBranchMap = new Map<RuntimeEdgeItemType, string>();

    edges.forEach((edge) => {
      const branchHandle = this.findBranchHandle(edge, edgeIndex, nodesMap, isBranchNode);
      edgeBranchMap.set(edge, branchHandle);
    });

    // 按 branchHandle 分组
    const branchGroups = new Map<string, RuntimeEdgeItemType[]>();

    edges.forEach((edge) => {
      const handle = edgeBranchMap.get(edge)!;
      if (!branchGroups.has(handle)) {
        branchGroups.set(handle, []);
      }
      branchGroups.get(handle)!.push(edge);
    });

    return Array.from(branchGroups.values());
  }

  /**
   * 找到边的 branchHandle
   * 向上回溯，找到第一个分支节点的 sourceHandle
   */
  private static findBranchHandle(
    edge: RuntimeEdgeItemType,
    edgeIndex: {
      bySource: Map<string, RuntimeEdgeItemType[]>;
      byTarget: Map<string, RuntimeEdgeItemType[]>;
    },
    nodesMap: Map<string, RuntimeNodeItemType>,
    isBranchNode: (node: RuntimeNodeItemType) => boolean
  ): string {
    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; handle?: string }> = [
      { nodeId: edge.source, handle: edge.sourceHandle }
    ];

    while (queue.length > 0) {
      const { nodeId, handle } = queue.shift()!;

      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = nodesMap.get(nodeId);
      if (!node) continue;

      // 如果当前节点是分支节点且有 handle，返回 handle
      if (isBranchNode(node) && handle) {
        return handle;
      }

      // 继续向上回溯
      const inEdges = edgeIndex.byTarget.get(nodeId) || [];
      for (const inEdge of inEdges) {
        const sourceNode = nodesMap.get(inEdge.source);
        if (!sourceNode) continue;

        const newHandle = isBranchNode(sourceNode) ? inEdge.sourceHandle : handle;
        queue.push({ nodeId: inEdge.source, handle: newHandle });
      }
    }

    return 'common';
  }

  // 获取 node 的运行状态，根据 source edges
  static getNodeRunStatus = ({
    node,
    nodeEdgeGroupsMap
  }: {
    node: RuntimeNodeItemType;
    nodeEdgeGroupsMap: NodeEdgeGroupsMap;
  }): 'run' | 'skip' | 'wait' => {
    // 直接从 Map 获取预构建的边分组
    const edgeGroups = nodeEdgeGroupsMap.get(node.nodeId);

    // 没有输入边或无分组 → 入口节点
    if (!edgeGroups || edgeGroups.length === 0) {
      return 'run';
    }

    // check active（任意一组边满足条件即可运行）
    // 每组边内: 至少有一个 active，且没有 waiting
    if (
      edgeGroups.some(
        (group) =>
          group.some((edge) => edge.status === 'active') &&
          group.every((edge) => edge.status !== 'waiting')
      )
    ) {
      return 'run';
    }

    // check skip（所有组的边都是 skipped 才跳过）
    if (edgeGroups.every((group) => group.every((edge) => edge.status === 'skipped'))) {
      return 'skip';
    }

    return 'wait';
  };

  private usagePush(usages: ChatNodeUsageType[]) {
    // 暂时只有 root runtime 需要 push usage，child 的统一给到 root 去推送
    if (this.isRootRuntime) {
      if (this.data.usageId) {
        pushChatItemUsage({
          teamId: this.data.runningUserInfo.teamId,
          usageId: this.data.usageId,
          nodeUsages: usages
        });
      }
      if (this.data.concatUsage) {
        this.data.concatUsage(usages.reduce((sum, item) => sum + (item.totalPoints || 0), 0));
      }
    }

    this.chatNodeUsages = this.chatNodeUsages.concat(usages);
  }

  /* ===== life circle ===== */
  // Add active node to queue (if already in the queue, it will not be added again)
  addActiveNode(nodeId: string) {
    if (this.activeRunQueue.has(nodeId)) {
      return;
    }
    this.activeRunQueue.add(nodeId);

    // 非递归触发：如果没有正在处理，则启动处理循环
    if (!this.processingActive) {
      this.startProcessing();
    }
  }

  // 迭代处理队列（替代递归的 processActiveNode）
  private async startProcessing() {
    // 防止重复启动
    if (this.processingActive) {
      return;
    }

    this.processingActive = true;

    try {
      const runningNodePromises = new Set<Promise<unknown>>();

      // 迭代循环替代递归
      while (true) {
        // 检查结束条件
        if (this.activeRunQueue.size === 0 && runningNodePromises.size === 0) {
          if (this.isDebugMode) {
            // 没有下一个激活节点，说明debug 进入了一个”即将结束”状态。可以开始处理 skip 节点
            if (this.debugNextStepRunNodes.length === 0 && this.skipNodeQueue.size > 0) {
              await this.processSkipNodes();
              continue;
            } else {
              break;
            }
          }

          // 如果没有交互响应，则开始处理 skip（交互响应的 skip 需要留给后续处理）
          if (this.skipNodeQueue.size > 0 && !this.nodeInteractiveResponse) {
            await this.processSkipNodes();
            continue;
          } else {
            break;
          }
        }

        // 检查并发限制
        if (this.activeRunQueue.size === 0 || runningNodePromises.size >= this.maxConcurrency) {
          if (runningNodePromises.size > 0) {
            // 当上一个节点运行结束时，立即运行下一轮
            await Promise.race(runningNodePromises).catch((error) => {
              logger.error('Workflow race error', { chatId: this.data.chatId, error });
            });
          } else {
            // 理论上不应出现此情况，防御性退回到让出进程
            await surrenderProcess();
          }
          continue;
        }

        // 处理下一个节点
        const nodeId = this.activeRunQueue.keys().next().value;
        const node = nodeId ? this.runtimeNodesMap.get(nodeId) : undefined;

        if (nodeId) {
          this.activeRunQueue.delete(nodeId);
        }

        if (node) {
          // 不再递归调用，异步执行节点（不等待完成）
          const nodePromise: Promise<unknown> = this.checkNodeCanRun(node).finally(() => {
            runningNodePromises.delete(nodePromise);
          });
          runningNodePromises.add(nodePromise);
        }
      }
    } finally {
      this.resolve(this);
      this.processingActive = false;
    }
  }

  private addSkipNode(node: RuntimeNodeItemType, skippedNodeIdList: Set<string>) {
    // 保证一个node 只在queue里记录一次
    const skipNodeSkippedNodeIdList =
      this.skipNodeQueue.get(node.nodeId)?.skippedNodeIdList || new Set<string>();

    const concatSkippedNodeIdList = new Set([...skippedNodeIdList, ...skipNodeSkippedNodeIdList]);

    this.skipNodeQueue.set(node.nodeId, { node, skippedNodeIdList: concatSkippedNodeIdList });
  }

  // 迭代处理 skip 节点（每次只处理一个，然后返回主循环检查 active）
  private async processSkipNodes() {
    await surrenderProcess();
    const skipItem = this.skipNodeQueue.values().next().value;
    if (skipItem) {
      this.skipNodeQueue.delete(skipItem.node.nodeId);
      await this.checkNodeCanRun(skipItem.node, skipItem.skippedNodeIdList).catch((error) => {
        logger.error('Workflow skip node run error', { error, nodeName: skipItem.node.name });
      });
    }
  }

  /* ===== runtime ===== */
  private async nodeRunWithActive(node: RuntimeNodeItemType): Promise<{
    node: RuntimeNodeItemType;
    runStatus: 'run';
    result: NodeResponseCompleteType;
  }> {
    const mode = this.isDebugMode ? 'test' : this.data.mode;
    const stepMetricAttributes = {
      nodeType: node.flowNodeType,
      mode
    };

    const executeNode = async (stepSpan?: Span): Promise<WorkflowObservedStepResult> => {
      /* Inject data into module input */
      const getNodeRunParams = (node: RuntimeNodeItemType) => {
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
            nodesMap: this.runtimeNodesMap,
            variables: this.data.variables
          });

          // replace reference variables
          value = getReferenceVariableValue({
            value,
            nodesMap: this.runtimeNodesMap,
            variables: this.data.variables
          });

          // Dynamic input is stored in the dynamic key
          if (input.canEdit && dynamicInput && params[dynamicInput.key]) {
            params[dynamicInput.key][input.key] = valueTypeFormat(value, input.valueType);
          }
          params[input.key] = valueTypeFormat(value, input.valueType);
        });

        return params;
      };

      // push run status messages
      if (node.showStatus && !this.data.isToolCall) {
        this.data.workflowStreamResponse?.({
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
        ...this.data,
        usagePush: this.usagePush.bind(this),
        lastInteractive: this.data.lastInteractive?.entryNodeIds?.includes(node.nodeId)
          ? this.data.lastInteractive
          : undefined,
        variables: this.data.variables,
        histories: this.data.histories,
        retainDatasetCite: this.data.retainDatasetCite,
        node,
        runtimeNodes: this.data.runtimeNodes,
        runtimeNodesMap: this.runtimeNodesMap,
        runtimeEdges: this.data.runtimeEdges,
        params,
        mode
      };

      // run module
      const dispatchRes: NodeResponseType = await (async () => {
        if (callbackMap[node.flowNodeType]) {
          const targetEdges = this.edgeIndex.bySource.get(node.nodeId) || [];
          const errorHandleId = getHandleId(node.nodeId, 'source_catch', 'right');

          try {
            const result = (await callbackMap[node.flowNodeType](dispatchData)) as NodeResponseType;

            if (result.error) {
              // Run error and not catch error, skip all edges
              if (!node.catchError) {
                // Callback returned with `result.error` set instead of throwing;
                // mirror the catch-branch convention and copy it onto nodeResponse
                // so runLoopRun / parallelRun failure detection and OTel span
                // status see `.error` uniformly across both failure paths.
                const nodeResponseBase = result[DispatchNodeResponseKeyEnum.nodeResponse];
                const errText = nodeResponseBase?.errorText ?? getErrText(result.error as any);
                return {
                  ...result,
                  [DispatchNodeResponseKeyEnum.nodeResponse]: {
                    ...nodeResponseBase,
                    error: errText
                  },
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
            let skipHandleId = targetEdges.map((item) => item.sourceHandle);
            if (node.catchError) {
              skipHandleId = skipHandleId.filter((item) => item !== errorHandleId);
            }

            return {
              [DispatchNodeResponseKeyEnum.nodeResponse]: {
                error: getErrText(error)
              },
              [DispatchNodeResponseKeyEnum.skipHandleId]: skipHandleId
            };
          }
        }
        return {};
      })();

      const nodeResponses = dispatchRes[DispatchNodeResponseKeyEnum.nodeResponses] || [];
      // format response data. Add modulename and module type
      const formatResponseData: NodeResponseCompleteType['responseData'] = (() => {
        if (!dispatchRes[DispatchNodeResponseKeyEnum.nodeResponse]) return undefined;

        const val = {
          moduleName: node.name,
          moduleType: node.flowNodeType,
          moduleLogo: node.avatar,
          ...dispatchRes[DispatchNodeResponseKeyEnum.nodeResponse],
          id: getNanoid(),
          nodeId: node.nodeId,
          runningTime: +((Date.now() - startTime) / 1000).toFixed(2)
        };
        nodeResponses.push(val);
        return val;
      })();

      // Response node response
      if (
        this.data.apiVersion === 'v2' &&
        !this.data.isToolCall &&
        this.isRootRuntime &&
        nodeResponses.length > 0
      ) {
        const filteredResponses = this.data.responseAllData
          ? nodeResponses
          : filterPublicNodeResponseData({
              nodeRespones: nodeResponses,
              responseDetail: this.data.responseDetail
            });

        filteredResponses.forEach((item) => {
          this.data.workflowStreamResponse?.({
            event: SseResponseEventEnum.flowNodeResponse,
            data: item
          });
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
        this.data.variables = {
          ...this.data.variables,
          ...dispatchRes[DispatchNodeResponseKeyEnum.newVariables]
        };
      }

      // Error
      if (dispatchRes?.responseData?.error) {
        if (stepSpan) {
          stepSpan.setAttribute('fastgpt.workflow.step.error', true);
          stepSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: String(dispatchRes.responseData.error)
          });
        }
        logger.warn('Workflow node returned error', { error: dispatchRes.responseData.error });
      } else if (stepSpan) {
        stepSpan.setStatus({ code: SpanStatusCode.OK });
      }

      if (stepSpan && formatResponseData?.runningTime !== undefined) {
        stepSpan.setAttribute(
          'fastgpt.workflow.step.running_time_seconds',
          formatResponseData.runningTime
        );
      }

      return {
        node,
        runStatus: 'run',
        result: {
          ...dispatchRes,
          [DispatchNodeResponseKeyEnum.nodeResponse]: formatResponseData
        }
      };
    };

    if (shouldTraceWorkflowStep(node.flowNodeType)) {
      return observeWorkflowStep(
        stepMetricAttributes,
        () =>
          withActiveSpan(
            {
              name: 'workflow.step',
              tracerName: 'fastgpt.workflow',
              attributes: {
                'fastgpt.workflow.node.type': node.flowNodeType,
                'fastgpt.workflow.mode': mode
              }
            },
            async (stepSpan) => executeNode(stepSpan)
          ),
        {
          getStatus: getWorkflowStepStatus
        }
      );
    }

    return observeWorkflowStep(
      stepMetricAttributes,
      async () => {
        const stepStartedAt = Date.now();
        addWorkflowStepEvent({
          eventName: 'workflow.step.start',
          nodeType: node.flowNodeType,
          mode
        });

        try {
          const result = await executeNode();

          addWorkflowStepEvent({
            eventName: 'workflow.step.end',
            nodeType: node.flowNodeType,
            mode,
            status: getWorkflowStepStatus(result),
            durationMs: Date.now() - stepStartedAt
          });

          return result;
        } catch (error) {
          addWorkflowStepEvent({
            eventName: 'workflow.step.end',
            nodeType: node.flowNodeType,
            mode,
            status: 'error',
            durationMs: Date.now() - stepStartedAt
          });
          throw error;
        }
      },
      {
        getStatus: getWorkflowStepStatus
      }
    );
  }
  private nodeRunWithSkip(node: RuntimeNodeItemType): {
    node: RuntimeNodeItemType;
    runStatus: 'skip';
    result: NodeResponseCompleteType;
  } {
    // Set target edges status to skipped
    const targetEdges = this.data.runtimeEdges.filter((item) => item.source === node.nodeId);

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
      await checkTeamAIPoints(this.data.runningUserInfo.teamId);
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
  private async checkNodeCanRun(node: RuntimeNodeItemType, skippedNodeIdList = new Set<string>()) {
    /* Store special response field  */
    const pushStore = ({
      answerText,
      reasoningText,
      responseData,
      nodeResponses,
      toolResponses,
      assistantResponses,
      rewriteHistories,
      runTimes = 1,
      system_memories: newMemories,
      customFeedbacks
    }: NodeResponseCompleteType) => {
      // Add run times
      this.workflowRunTimes += runTimes;
      this.data.maxRunTimes -= runTimes;

      if (newMemories) {
        this.system_memories = {
          ...this.system_memories,
          ...newMemories
        };
      }

      if (responseData) {
        this.chatResponses.push(responseData);
      }
      if (nodeResponses) {
        this.chatResponses.push(...nodeResponses);
      }

      // Collect custom feedbacks
      if (customFeedbacks && Array.isArray(customFeedbacks)) {
        this.customFeedbackList = this.customFeedbackList.concat(customFeedbacks);
      }

      if (
        (toolResponses !== undefined && toolResponses !== null) ||
        (Array.isArray(toolResponses) && toolResponses.length > 0) ||
        (!Array.isArray(toolResponses) &&
          typeof toolResponses === 'object' &&
          toolResponses !== null &&
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
            reasoning: {
              content: reasoningText
            }
          });
        }
        if (answerText) {
          this.chatAssistantResponse.push({
            text: {
              content: answerText
            }
          });
        }
      }

      if (rewriteHistories) {
        this.data.histories = rewriteHistories;
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

      const targetEdges = this.edgeIndex.bySource.get(node.nodeId) || [];

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
      targetEdges.forEach((edge) => {
        const targetNode = this.runtimeNodesMap.get(edge.target);
        if (!targetNode) return;

        if (edge.status === 'active') {
          nextStepActiveNodesMap.set(targetNode.nodeId, targetNode);
        } else if (edge.status === 'skipped') {
          nextStepSkipNodesMap.set(targetNode.nodeId, targetNode);
        }
      });

      return {
        nextStepActiveNodes: Array.from(nextStepActiveNodesMap.values()),
        nextStepSkipNodes: Array.from(nextStepSkipNodesMap.values())
      };
    };

    // Check queue status
    if (this.data.maxRunTimes <= 0) {
      logger.error('Workflow max run times reached', {
        appId: this.data.runningAppInfo.id
      });
      return;
    }
    if (this.data.checkIsStopping()) {
      logger.warn('Workflow stopped', {
        appId: this.data.runningAppInfo.id,
        nodeId: node.nodeId,
        nodeName: node.name
      });
      return;
    }

    // Get node run status by edges (使用预构建的边分组)
    const status = WorkflowQueue.getNodeRunStatus({
      node,
      nodeEdgeGroupsMap: this.nodeEdgeGroupsMap
    });

    const nodeRunResult = await (async () => {
      if (status === 'run') {
        // All source edges status to waiting
        this.data.runtimeEdges.forEach((item) => {
          if (item.target === node.nodeId) {
            item.status = 'waiting';
          }
        });

        const blanceCheckResult = await this.checkTeamBlance();
        if (blanceCheckResult) {
          return {
            node,
            runStatus: 'pause' as const,
            result: blanceCheckResult
          };
        }

        logger.debug('dispatchWorkFlow node run with active', { nodeName: node.name });
        return this.nodeRunWithActive(node);
      }
      if (status === 'skip' && !skippedNodeIdList.has(node.nodeId)) {
        // All skip source edges status to waiting
        this.data.runtimeEdges.forEach((item) => {
          if (item.target === node.nodeId) {
            item.status = 'waiting';
          }
        });

        this.data.maxRunTimes -= 0.1;
        skippedNodeIdList.add(node.nodeId);
        logger.debug('dispatchWorkFlow node run with skip', { nodeName: node.name });
        return this.nodeRunWithSkip(node);
      }
    })();

    if (!nodeRunResult) return;

    // Store debug data
    if (this.isDebugMode) {
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
      if (this.isDebugMode) {
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
    } else if (this.isDebugMode) {
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
    this.data.runtimeNodes.forEach((node) => {
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
      memoryEdges: this.data.runtimeEdges.map((edge) => ({
        ...edge,
        // 入口前面的边全部激活，保证下次进来一定能执行。
        status: entryNodeIds.includes(edge.target) ? 'active' : edge.status
      })),
      nodeOutputs,
      usageId: this.data.usageId
    };

    // Tool call, not need interactive response
    if (!this.data.isToolCall && this.isRootRuntime) {
      this.data.workflowStreamResponse?.({
        event: SseResponseEventEnum.interactive,
        data: { interactive: interactiveResult }
      });
    }

    return {
      planId: interactiveResult.planId,
      interactive: interactiveResult
    };
  }
  getDebugResponse(): WorkflowDebugResponse {
    const entryNodeIds = this.debugNextStepRunNodes.map((item) => item.nodeId);

    return {
      memoryEdges: this.data.runtimeEdges.map((edge) => ({
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
export const runWorkflow = async (data: RunWorkflowProps): Promise<DispatchFlowResponse> => {
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
        variables: data.variables,
        removeObj: data.externalProvider.externalWorkflowVariables,
        userVariablesConfigs: data.chatConfig?.variables
      }),
      durationSeconds: 0
    };
  }

  data.runtimeEdges = filterOrphanEdges({
    edges: data.runtimeEdges,
    nodes: data.runtimeNodes,
    workflowId: data.runningAppInfo.id
  });

  return observeWorkflowRun(
    {
      mode: data.mode,
      isRoot: isRootRuntime
    },
    () =>
      withActiveSpan(
        {
          name: isRootRuntime ? 'workflow.run' : 'workflow.child.run',
          tracerName: 'fastgpt.workflow',
          attributes: {
            'fastgpt.workflow.mode': data.mode,
            'fastgpt.workflow.depth': data.workflowDispatchDeep,
            'fastgpt.workflow.is_root': isRootRuntime,
            'fastgpt.workflow.app_version': data.apiVersion,
            'fastgpt.workflow.is_tool_call': !!data.isToolCall,
            'fastgpt.workflow.node_count': data.runtimeNodes.length,
            'fastgpt.workflow.edge_count': data.runtimeEdges.length
          }
        },
        async (workflowSpan) => {
          const startTime = Date.now();

          await rewriteRuntimeWorkFlow({
            teamId: data.runningAppInfo.teamId,
            nodes: data.runtimeNodes,
            edges: data.runtimeEdges,
            lang: data.lang
          });
          // Init default value
          data.retainDatasetCite = data.retainDatasetCite ?? true;
          data.responseDetail = data.responseDetail ?? true;
          data.responseAllData = data.responseAllData ?? true;

          // Start process width initInput
          const entryNodes = data.runtimeNodes.filter((item) => item.isEntry);
          // Reset entry
          data.runtimeNodes.forEach((item) => {
            // Interactively nodes will use the "isEntry", which does not need to be updated
            if (
              item.flowNodeType !== FlowNodeTypeEnum.userSelect &&
              item.flowNodeType !== FlowNodeTypeEnum.formInput &&
              item.flowNodeType !== FlowNodeTypeEnum.toolCall
            ) {
              item.isEntry = false;
            }
          });

          const workflowQueue = await new Promise<WorkflowQueue>((resolve) => {
            logger.info('Workflow run start', {
              maxRunTimes: data.maxRunTimes,
              appId: data.runningAppInfo.id
            });
            const workflowQueue = new WorkflowQueue({
              data,
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
              if (workflowQueue.isRootRuntime) {
                workflowQueue.chatAssistantResponse.push(interactiveAssistant);
              }
              return interactiveAssistant.interactive;
            }
          })();

          const durationSeconds = +((Date.now() - startTime) / 1000).toFixed(2);

          workflowSpan.setAttribute('fastgpt.workflow.duration_seconds', durationSeconds);
          workflowSpan.setAttribute('fastgpt.workflow.run_times', workflowQueue.workflowRunTimes);
          workflowSpan.setAttribute(
            'fastgpt.workflow.has_interactive_response',
            !!workflowQueue.nodeInteractiveResponse
          );
          workflowSpan.setStatus({ code: SpanStatusCode.OK });

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
              variables: data.variables,
              removeObj: data.externalProvider.externalWorkflowVariables,
              userVariablesConfigs: data.chatConfig?.variables
            }),
            [DispatchNodeResponseKeyEnum.memories]:
              Object.keys(workflowQueue.system_memories).length > 0
                ? workflowQueue.system_memories
                : undefined,
            [DispatchNodeResponseKeyEnum.customFeedbacks]:
              workflowQueue.customFeedbackList.length > 0
                ? workflowQueue.customFeedbackList
                : undefined,
            durationSeconds
          };
        }
      ),
    {
      getRunTimes: (result) => result[DispatchNodeResponseKeyEnum.runTimes]
    }
  );
};

/* Merge consecutive text messages into one */
const mergeAssistantResponseAnswerText = (response: AIChatItemValueItemType[]) => {
  const result: AIChatItemValueItemType[] = [];
  // 合并连续的text
  for (let i = 0; i < response.length; i++) {
    const item = response[i];
    if (item.text) {
      let text = item.text?.content || '';
      const lastItem = result[result.length - 1];
      if (lastItem && lastItem.text?.content && item.stepId === lastItem.stepId) {
        lastItem.text.content += text;
        continue;
      }
    }
    result.push(item);
  }

  // If result is empty, auto add a text message
  if (result.length === 0) {
    result.push({
      text: { content: '' }
    });
  }

  return result;
};
