import { createChatStopController } from '../../chat/stop';
import { markProfileError, profileStage } from '../../../common/profiling';
import { appendWorkflowInteractiveValue } from '@fastgpt/global/core/workflow/runtime/utils';

import { SpanStatusCode } from '@opentelemetry/api';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import { normalizeAIChatValue } from '@fastgpt/global/core/chat/adapt';
import type { WorkflowDispatchProps } from '../types/runtime';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { getLogger, LogCategories } from '../../../common/logger';
import type { DispatchFlowResponse, WorkflowDebugResponse, RunWorkflowProps } from './type';
import { rewriteRuntimeWorkFlow, filterOrphanEdges } from './utils/index';
import { getEntryPointRuntimeVariables, WorkflowVariableState } from './context/variables';
import { getUserChatInfo } from '../../../support/user/team/utils';
import { checkTeamAIPoints } from '../../../support/permission/teamLimit';
import type { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { createChatUsageRecord } from '../../../support/wallet/usage/controller';
import type { RequireOnlyOne } from '@fastgpt/global/common/type/utils';
import { addPreviewUrlToChatItems } from '../../chat/utils';
import { observeWorkflowRun } from '../metrics';
import { withActiveSpan } from '../../../common/tracing';
import { onWorkflowEnd, onWorkflowStart } from '../../../common/langfuse/workflow';
import { getWorkflowContext, runWithContext } from './context';
import { createClientAbortTracker } from './utils/clientAbort';
import type { IncomingMessage } from 'node:http';
import type { NodeHttpResponse } from '../../../types/http';
import type { WorkflowNodeResponseWriteConfig } from './utils/entry';
import { createWorkflowEntryNodeResponseSink } from './context/nodeResponse';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { isWorkflowSseResponseInitialized } from './context/streamResponse';
import type { AgentSandboxPrepareAction } from './ai/agent/sub/sandbox';
import { getWorkflowSource } from './utils/source';
import { prepareWorkflowFileContext } from './context/file';
import type { WorkflowResourceContext } from '@fastgpt/global/core/workflow/runtime/type';
import { WorkflowQueue } from './queue';
import type { WorkflowRuntimeControl } from './context/runtimeControl';
import { WORKFLOW_MAX_RUN_TIMES } from '../constants';

const logger = getLogger(LogCategories.MODULE.WORKFLOW.DISPATCH);

// 显式声明入口接受的运行参数，避免运行期新增字段自动成为入口依赖。
type Props = Pick<
  WorkflowDispatchProps,
  | 'lang'
  | 'requestOrigin'
  | 'runningAppInfo'
  | 'runningUserInfo'
  | 'uid'
  | 'chatId'
  | 'responseChatItemId'
  | 'histories'
  | 'query'
  | 'chatConfig'
  | 'lastInteractive'
  | 'stream'
  | 'retainDatasetCite'
  | 'workflowStreamResponse'
  | 'nodeResponseParentId'
  | 'usageId'
> & {
  mode: WorkflowRuntimeControl['mode'];
  /** 入口协议配置：用于停止检测和响应 Context，不属于节点参数。 */
  apiVersion?: RunWorkflowProps['apiVersion'];
  responseAllData?: boolean;
  responseDetail?: boolean;
  variables: Record<string, any>;
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: RuntimeEdgeItemType[];
  req?: IncomingMessage;
  res?: NodeHttpResponse; // 仅供入口 SSE 校验和 v1 断连检测使用，不传入 runtime 或节点执行上下文。
  defaultSkipNodeQueue?: WorkflowDebugResponse['skipNodeQueue'];
  nodeResponseWriteConfig: WorkflowNodeResponseWriteConfig;
  agentSandboxPrepareActions?: AgentSandboxPrepareAction[];
  maxFileAmount: number; //已在持久化前计算完成的用户级 Workflow 文件数量和大小上限
  maxBytesPerFile: number;
  resourceContext: WorkflowResourceContext; //本次运行的资源快照，必填：App 入口传选中 Version 的快照；Test/Debug 传当前请求临时快照；
};

// Run workflow
type WorkflowUsageProps = RequireOnlyOne<{
  usageSource: UsageSourceEnum;
  concatUsage: (points: number) => any;
  usageId: string;
}>;

/**
 * 构建入口运行上下文并执行工作流。
 *
 * req/res 只用于入口的 HTTP 协议校验和取消检测；提前从参数中取出，避免通过 data
 * 透传给 runWorkflow、子工作流或节点。节点只通过流式输出和停止检查接口访问这些能力。
 * 文件限额同样只用于构建文件上下文和初始化变量，节点从文件上下文统一读取。
 */
export async function dispatchWorkFlow({
  req,
  res,
  maxFileAmount,
  maxBytesPerFile,
  mode,
  apiVersion,
  responseAllData,
  responseDetail,
  usageSource,
  usageId,
  concatUsage,
  ...data
}: Props & WorkflowUsageProps): Promise<DispatchFlowResponse> {
  const { stream, runningUserInfo, runningAppInfo, histories, query, chatId } = data;
  const responseChatItemId = data.responseChatItemId;
  if (stream && res && !isWorkflowSseResponseInitialized(res)) {
    // HTTP SSE 响应必须由调用入口提前初始化，dispatch 只执行 workflow，不隐式管理响应协议。
    return Promise.reject(
      new Error('Workflow SSE response must be initialized before dispatchWorkFlow')
    );
  }
  const chatSource = getWorkflowSource(runningAppInfo);
  const clientAbortTracker =
    apiVersion === 'v1' ? createClientAbortTracker({ req: req, res }) : undefined;
  // 主动停止与 HTTP 协议版本解耦：MCP、定时触发等无 SSE 入口也监听同一信号。
  const stopController =
    apiVersion === 'v1' ? undefined : await createChatStopController({ ...chatSource, chatId });
  const checkIsStopping = () =>
    clientAbortTracker?.isClientAborted() ?? stopController?.checkIsStopping() ?? false;

  try {
    /* Init function */
    // Check point
    await profileStage({ event: 'wf.points.check' }, () =>
      checkTeamAIPoints(runningUserInfo.teamId)
    );

    const {
      fileContext,
      getPreviewUrl,
      query: runtimeQuery,
      histories: preparedHistories
    } = await profileStage({ event: 'wf.file.context' }, () =>
      prepareWorkflowFileContext({
        query,
        histories,
        scope: {
          sourceType: runningAppInfo.sourceType,
          sourceId: runningAppInfo.sourceId,
          uid: data.uid,
          chatId
        },
        maxFileAmount: maxFileAmount,
        maxBytesPerFile: maxBytesPerFile
      })
    );
    const getHistoryPreviewUrl = async (key: string) => {
      try {
        return await getPreviewUrl(key);
      } catch (error) {
        if (!(error instanceof UserError)) throw error;
        logger.warn('Skip unavailable workflow history file', { key, message: error.message });
      }
    };

    const [{ timezone, externalProvider }, newUsageId, runtimeHistories] = await profileStage(
      { event: 'wf.init' },
      () =>
        Promise.all([
          runningUserInfo.externalProvider
            ? {
                timezone: runningUserInfo.timezone ?? 'Asia/Shanghai',
                externalProvider: runningUserInfo.externalProvider
              }
            : getUserChatInfo(runningUserInfo.tmbId),
          (() => {
            if (data.lastInteractive?.usageId) {
              return data.lastInteractive.usageId;
            }
            if (usageSource) {
              return createChatUsageRecord({
                appName: runningAppInfo.name,
                appId:
                  runningAppInfo.sourceType === ChatSourceTypeEnum.app
                    ? runningAppInfo.sourceId
                    : undefined,
                skillId:
                  runningAppInfo.sourceType === ChatSourceTypeEnum.skillEdit
                    ? runningAppInfo.sourceId
                    : undefined,
                teamId: runningUserInfo.teamId,
                tmbId: runningUserInfo.tmbId,
                source: usageSource
              });
            }
            return usageId;
          })(),
          // 复用 Context 的鉴权和请求级签名缓存，刷新 history 里其它服务端文件引用。
          addPreviewUrlToChatItems(preparedHistories, 'chatFlow', getHistoryPreviewUrl)
        ])
    );

    const variableState = await profileStage({ event: 'wf.variable.state' }, () =>
      WorkflowVariableState.create({
        timezone,
        runningAppInfo,
        uid: data.uid,
        chatId,
        responseChatItemId,
        histories: runtimeHistories,
        variablesConfig: data.chatConfig?.variables,
        inputVariables: data.variables,
        externalVariables: externalProvider.externalWorkflowVariables,
        runtimeOnlyVariables: getEntryPointRuntimeVariables({
          entryPoints: data.chatConfig?.entryPoints,
          inputVariables: data.variables
        }),
        maxFileAmount: maxFileAmount,
        resolveInputFile: async (file) => {
          const ref = await fileContext.register({
            file,
            source: 'variable'
          });
          if (!ref) throw new UserError('Invalid workflow variable file');
          return ref.modelUrl;
        }
      })
    );

    const nodeResponseSink = await profileStage({ event: 'wf.sink.create' }, () =>
      createWorkflowEntryNodeResponseSink({
        teamId: data.runningAppInfo.teamId,
        sourceType: data.runningAppInfo.sourceType,
        sourceId: data.runningAppInfo.sourceId,
        chatId,
        chatItemDataId: responseChatItemId,
        nodeResponseWriteConfig: data.nodeResponseWriteConfig,
        apiVersion: apiVersion,
        responseAllData: responseAllData,
        responseDetail: responseDetail,
        workflowStreamResponse: data.workflowStreamResponse
      })
    );

    return await runWithContext(
      {
        runtimeControl: {
          mode,
          maxRunTimes: WORKFLOW_MAX_RUN_TIMES,
          workflowDispatchDeep: 0,
          isToolCall: false
        },
        checkIsStopping,
        variableContext: variableState,
        nodeResponseSink,
        mcpClientMemory: {},
        fileContext,
        resourceContext: data.resourceContext,
        sandboxContext: {
          sourceType: runningAppInfo.sourceType,
          sourceId: runningAppInfo.sourceId,
          teamId: runningAppInfo.teamId,
          userId: data.uid,
          chatId
        }
      },
      async (ctx) => {
        try {
          const result = await runWorkflow({
            ...data,
            apiVersion,
            responseChatItemId,
            query: runtimeQuery,
            histories: runtimeHistories,
            timezone,
            externalProvider,
            usageId: newUsageId,
            concatUsage
          });
          await nodeResponseSink.close();
          // HTTP 200/SSE 正常收尾也可能包含根运行错误；只按最终摘要判断，避免子层错误误报。
          const { errorText, errorCount } = result.workflowRuntimeSummary;
          if (errorText || errorCount) markProfileError(errorText || 'Workflow run failed');

          return {
            ...result,
            // 子工作流只消费 summary；完整详情由共享 writer 持久化。
            ...(data.nodeResponseWriteConfig.retainInMemory
              ? { flatNodeResponses: nodeResponseSink.getFlatNodeResponses() }
              : {})
          };
        } catch (error) {
          await nodeResponseSink.close();
          throw error;
        } finally {
          Object.values(ctx.mcpClientMemory).forEach((client) => {
            client.closeConnection();
          });
        }
      }
    );
  } finally {
    // 初始化失败同样停止监听；先完成清理再返回，避免下一轮启动后被旧执行清掉信号。
    clientAbortTracker?.cleanup();
    await stopController?.cleanup();
  }
}

/** 执行当前层工作流，维护独立摘要，并在返回或抛出前完成本层错误上报。 */
export const runWorkflow = async (data: RunWorkflowProps): Promise<DispatchFlowResponse> => {
  // 上层已准备本次运行的变量与独立响应 Scope；runtime 只消费完整 Context。
  const { variableContext, nodeResponseSink, runtimeControl } = getWorkflowContext();
  const { workflowRuntimeSummary } = nodeResponseSink;

  // 计算当前工作流深度
  const previousWorkflowDispatchDeep = runtimeControl.workflowDispatchDeep;
  const currentWorkflowDispatchDeep = previousWorkflowDispatchDeep + 1;
  runtimeControl.workflowDispatchDeep = currentWorkflowDispatchDeep;
  if (currentWorkflowDispatchDeep > 20) {
    runtimeControl.workflowDispatchDeep = previousWorkflowDispatchDeep;
    return {
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
      [DispatchNodeResponseKeyEnum.toolResponse]: null,
      [DispatchNodeResponseKeyEnum.newVariables]: variableContext.toStoreRecord(),
      workflowRuntimeSummary,
      durationSeconds: 0
    };
  }

  const isRootRuntime = currentWorkflowDispatchDeep === 1;

  return observeWorkflowRun(
    {
      mode: runtimeControl.mode,
      isRoot: isRootRuntime
    },
    () => {
      onWorkflowStart({
        isRootRuntime,
        mode: runtimeControl.mode,
        sessionId: data.chatId ?? '',
        userId: String(data.runningUserInfo.tmbId),
        appId: String(data.runningAppInfo.sourceId),
        appName: data.runningAppInfo.name,
        input: data.query
      });
      return withActiveSpan(
        {
          name: isRootRuntime ? 'workflow.run' : 'workflow.child.run',
          tracerName: 'fastgpt.workflow',
          attributes: {
            'fastgpt.workflow.mode': runtimeControl.mode,
            'fastgpt.workflow.depth': runtimeControl.workflowDispatchDeep,
            'fastgpt.workflow.is_root': isRootRuntime,
            'fastgpt.workflow.app_version': data.apiVersion,
            'fastgpt.workflow.is_tool_call': !!runtimeControl.isToolCall,
            'fastgpt.workflow.node_count': data.runtimeNodes.length,
            'fastgpt.workflow.edge_count': data.runtimeEdges.length
          }
        },
        async (workflowSpan) => {
          const startTime = Date.now();
          try {
            await rewriteRuntimeWorkFlow({
              teamId: data.runningAppInfo.teamId,
              tmbId: data.runningUserInfo.tmbId,
              nodes: data.runtimeNodes,
              edges: data.runtimeEdges,
              lang: data.lang
            });
            // 外部工具集和 HTTP 已展开；内联 MCP 的旧暂停边先还原为聚合连接，
            // 待 ToolCall 可运行后再读取当前鉴权，避免启动阶段消费尚未产生的上游输出。
            data.runtimeEdges = filterOrphanEdges({
              edges: data.runtimeEdges,
              nodes: data.runtimeNodes,
              workflowId: data.runningAppInfo.sourceId
            });
            // Init default value
            data.retainDatasetCite = data.retainDatasetCite ?? true;

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
              logger.debug('Workflow run start', {
                maxRunTimes: runtimeControl.maxRunTimes,
                ...getWorkflowSource(data.runningAppInfo)
              });
              const workflowQueue = new WorkflowQueue({
                data,
                resolve,
                workflowRuntimeSummary,
                defaultSkipNodeQueue:
                  data.lastInteractive?.skipNodeQueue || data.defaultSkipNodeQueue
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
                  interactiveResponse: workflowQueue.nodeInteractiveResponse.interactiveResponse,
                  nodeResponseId: workflowQueue.nodeInteractiveResponse.nodeResponseId
                });
                if (workflowQueue.isRootRuntime) {
                  appendWorkflowInteractiveValue({
                    values: workflowQueue.chatAssistantResponse,
                    interactive: interactiveAssistant.interactive!
                  });
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

            onWorkflowEnd({
              isRootRuntime,
              mode: runtimeControl.mode,
              output: workflowQueue.chatAssistantResponse
            });

            if (isRootRuntime) {
              data.workflowStreamResponse?.(workflowSseEvent.workflowDuration(durationSeconds));
            }

            const outputMemories = workflowQueue.memoryState.isForked
              ? workflowQueue.memoryState.getDelta()
              : workflowQueue.memoryState.toRecord();

            return {
              flowUsages: workflowQueue.chatNodeUsages,
              debugResponse: workflowQueue.getDebugResponse(),
              workflowInteractiveResponse: interactiveResult,
              [DispatchNodeResponseKeyEnum.runTimes]: workflowQueue.workflowRunTimes,
              [DispatchNodeResponseKeyEnum.assistantResponses]: normalizeAIChatValue(
                workflowQueue.chatAssistantResponse
              ),
              [DispatchNodeResponseKeyEnum.toolResponse]: workflowQueue.toolRunResponse,
              [DispatchNodeResponseKeyEnum.newVariables]: variableContext.toStoreRecord(),
              [DispatchNodeResponseKeyEnum.memories]:
                Object.keys(outputMemories).length > 0 ? outputMemories : undefined,
              [DispatchNodeResponseKeyEnum.customFeedbacks]:
                workflowQueue.customFeedbackList.length > 0
                  ? workflowQueue.customFeedbackList
                  : undefined,
              workflowRuntimeSummary: workflowQueue.workflowRuntimeSummary,
              durationSeconds
            };
          } finally {
            runtimeControl.workflowDispatchDeep = previousWorkflowDispatchDeep;
          }
        }
      );
    },
    {
      getRunTimes: (result) => result[DispatchNodeResponseKeyEnum.runTimes]
    }
  ).finally(() => {
    if (runtimeControl.workflowDispatchDeep === currentWorkflowDispatchDeep) {
      runtimeControl.workflowDispatchDeep = previousWorkflowDispatchDeep;
    }
  });
};
