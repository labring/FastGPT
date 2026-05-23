import type { ChatCompletionMessageToolCall } from '@fastgpt/global/core/ai/llm/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { AgentLoopChildrenInteractiveParams } from '../../../../../ai/llm/agentLoop';
import { runSandboxTools } from '../../../../../ai/sandbox/toolCall';
import { parseJsonArgs } from '../../../../../ai/utils';
import { runWorkflow } from '../../../index';
import type { DispatchFlowResponse } from '../../../type';
import { getSandboxToolWorkflowResponse } from '../constants';
import type { ChildResponseItemType, DispatchToolModuleProps, FileInputType } from '../type';
import { dispatchReadFileTool, ReadFileToolParamsSchema } from '../tools/file';
import { formatToolResponse, initToolCallEdges, initToolNodes } from '../utils';
import type { ToolInfo } from './useToolCatalog';
import { checkTeamSandboxPermission } from '../../../../../../support/permission/teamLimit';

type WorkflowProps = Omit<
  DispatchToolModuleProps,
  | 'messages'
  | 'toolNodes'
  | 'toolModel'
  | 'childrenInteractiveParams'
  | 'allFiles'
  | 'currentInputFiles'
>;

type ToolRunResult = {
  response: string;
  flowResponse?: ChildResponseItemType;
  assistantMessages?: Awaited<ReturnType<typeof chats2GPTMessages>>;
  usages?: DispatchFlowResponse['flowUsages'];
  interactive?: WorkflowInteractiveResponseType;
  stop?: boolean;
};

const getAssistantMessages = (assistantResponses: DispatchFlowResponse['assistantResponses']) =>
  chats2GPTMessages({
    messages: [
      {
        obj: ChatRoleEnum.AI,
        value: assistantResponses
      }
    ],
    reserveId: false
  });

/**
 * ToolCall 调用知识库搜索节点时，模型只生成文本 query；父节点输入文件需要在这里追加。
 * 这里只做最小拼接，不判断文件类型：搜索节点会统一调用 normalizeDatasetSearchInput
 * 拆分文本和图片。清空 userChatInput 是为了让搜索节点走 datasetSearchInput 数组，
 * 避免旧字段优先级导致追加的文件 URL 被忽略。
 */
const mergeDatasetToolFileUrls = ({
  flowNodeType,
  startParams,
  fileUrls = []
}: {
  flowNodeType: RuntimeNodeItemType['flowNodeType'];
  startParams: Record<string, any>;
  fileUrls?: string[];
}) => {
  if (flowNodeType !== FlowNodeTypeEnum.datasetSearchNode || fileUrls.length === 0) {
    return startParams;
  }

  const queryInput =
    startParams[NodeInputKeyEnum.datasetSearchInput] ?? startParams[NodeInputKeyEnum.userChatInput];
  const queryList = Array.isArray(queryInput) ? queryInput : queryInput ? [queryInput] : [];

  return {
    ...startParams,
    [NodeInputKeyEnum.userChatInput]: '',
    [NodeInputKeyEnum.datasetSearchInput]: [...queryList, ...fileUrls]
  };
};

export const useToolRunner = ({
  workflowProps,
  runtimeNodes,
  runtimeEdges,
  allFiles,
  fileUrls = [],
  getToolInfo,
  cacheToolFlowResponse,
  appendToolFlowResponse,
  streamToolResponse
}: {
  workflowProps: WorkflowProps;
  runtimeNodes: DispatchToolModuleProps['runtimeNodes'];
  runtimeEdges: DispatchToolModuleProps['runtimeEdges'];
  allFiles: Map<string, FileInputType>;
  fileUrls?: string[];
  getToolInfo: (name: string) => ToolInfo | undefined;
  cacheToolFlowResponse: (args: {
    call: ChatCompletionMessageToolCall;
    flowResponse?: ChildResponseItemType;
  }) => void;
  appendToolFlowResponse: (flowResponse: ChildResponseItemType) => void;
  streamToolResponse: (args: { toolCallId: string; response?: string }) => void;
}) => {
  const runTool = async ({ call }: { call: ChatCompletionMessageToolCall }) => {
    const toolInfo = getToolInfo(call.function?.name);
    if (!toolInfo) {
      return {
        response: 'Call tool not found',
        assistantMessages: [],
        usages: [],
        interactive: undefined,
        stop: false
      };
    }

    const {
      response,
      flowResponse,
      assistantMessages = [],
      usages = [],
      interactive,
      stop
    } = await (async (): Promise<ToolRunResult> => {
      /**
       * 先处理系统工具：sandbox/file。
       */
      if (toolInfo.type === 'sandbox') {
        try {
          await checkTeamSandboxPermission(workflowProps.runningUserInfo.teamId);
        } catch (err) {
          throw new Error('当前应用未配置虚拟机，暂时无法使用相关功能，请联系管理员配置。');
        }

        const { input, response, durationSeconds } = await runSandboxTools({
          toolName: call.function.name,
          args: call.function.arguments ?? '',
          appId: workflowProps.runningAppInfo.id,
          userId: workflowProps.uid,
          chatId: workflowProps.chatId
        });

        const flowResponse = getSandboxToolWorkflowResponse({
          name: toolInfo.name,
          logo: toolInfo.avatar,
          toolId: call.function.name,
          input,
          response,
          durationSeconds
        });

        return { response, flowResponse };
      }

      if (toolInfo.type === 'file') {
        const { ids } = ReadFileToolParamsSchema.parse(parseJsonArgs(call.function.arguments));
        const { response, usages, flowResponse } = await dispatchReadFileTool({
          files: ids.map((id) => ({ id, url: allFiles.get(id)?.url ?? '' })),
          toolCallId: call.id,
          teamId: workflowProps.runningUserInfo.teamId,
          tmbId: workflowProps.runningUserInfo.tmbId,
          customPdfParse: workflowProps.chatConfig?.fileSelectConfig?.customPdfParse,
          usageId: workflowProps.usageId
        });

        return {
          response,
          usages,
          flowResponse
        };
      }

      const toolNode = toolInfo.rawData;

      /**
       * 用户配置的工具节点会在当前 runtime 副本中被标记为入口节点；
       * 参数只注入入口节点，后续依旧走原 workflow 的边和节点调度。
       */
      const startParams = mergeDatasetToolFileUrls({
        flowNodeType: toolNode.flowNodeType,
        startParams: parseJsonArgs(call.function.arguments) ?? {},
        fileUrls
      });
      initToolNodes(runtimeNodes, [toolNode.nodeId], startParams);
      initToolCallEdges(runtimeEdges, [toolNode.nodeId]);

      const toolRunResponse = await runWorkflow({
        ...workflowProps,
        runtimeNodes,
        isToolCall: true
      });

      const stringToolResponse = formatToolResponse(toolRunResponse.toolResponses);

      return {
        response: stringToolResponse,
        flowResponse: toolRunResponse,
        assistantMessages: getAssistantMessages(toolRunResponse.assistantResponses),
        usages: toolRunResponse.flowUsages,
        interactive: toolRunResponse.workflowInteractiveResponse,
        stop: toolRunResponse.flowResponses?.some((item) => item.toolStop)
      };
    })();

    /**
     * 这里只缓存真实工具/子流程的运行详情。
     * 最终 tool response 可能还会被 agentLoop 压缩，统一由 onAfterToolCall 落 nodeResponse。
     */
    cacheToolFlowResponse({
      call,
      flowResponse
    });

    return {
      response,
      assistantMessages,
      usages,
      interactive,
      stop
    };
  };

  const runInteractiveTool = async ({
    childrenResponse,
    toolParams
  }: AgentLoopChildrenInteractiveParams<WorkflowInteractiveResponseType>) => {
    /**
     * 交互恢复时没有新的 function call 生命周期，直接续跑上次中断的子工具入口。
     * 因此运行详情在这里追加，避免等待一个不会再触发的 onAfterToolCall。
     */
    initToolNodes(runtimeNodes, childrenResponse.entryNodeIds);
    initToolCallEdges(runtimeEdges, childrenResponse.entryNodeIds);

    const toolRunResponse = await runWorkflow({
      ...workflowProps,
      lastInteractive: childrenResponse,
      runtimeNodes,
      runtimeEdges,
      isToolCall: true
    });
    const stringToolResponse = formatToolResponse(toolRunResponse.toolResponses);

    streamToolResponse({
      toolCallId: toolParams.toolCallId,
      response: stringToolResponse
    });

    appendToolFlowResponse(toolRunResponse);

    return {
      response: stringToolResponse,
      assistantMessages: getAssistantMessages(toolRunResponse.assistantResponses),
      usages: toolRunResponse.flowUsages,
      interactive: toolRunResponse.workflowInteractiveResponse,
      stop: toolRunResponse.flowResponses?.some((item) => item.toolStop)
    };
  };

  return {
    runTool,
    runInteractiveTool
  };
};
