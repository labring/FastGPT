import type { DispatchSubAppResponse } from '../../type';
import { getAppVersionById } from '../../../../../../../core/app/version/controller';
import {
  createWorkflowChildResourceContext,
  loadWorkflowAppResource
} from '../../../../../../../core/workflow/utils/resource';
import { getUserChatInfo } from '../../../../../../../support/user/team/utils';
import { runWorkflow } from '../../../../../../../core/workflow/dispatch';
import {
  getWorkflowEntryNodeIds,
  rewriteNodeOutputByHistories,
  storeEdges2RuntimeEdges,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { chats2GPTMessages, chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { serverGetWorkflowToolRunUserQuery } from '../../../../../../app/tool/workflowTool/utils';
import {
  filterWorkflowToolInputVariables,
  getWorkflowToolInputsFromStoreNodes
} from '@fastgpt/global/core/app/tool/workflowTool/utils';
import { appData2FlowNodeIO } from '@fastgpt/global/core/workflow/utils';
import type { RunWorkflowProps } from '../../../../../../../core/workflow/dispatch';
import { SystemToolRepo } from '../../../../../../app/tool/systemTool/systemTool.repo';
import { anyValueDecrypt } from '../../../../../../../common/secret/utils';
import {
  getWorkflowFileInputsFromValue,
  getWorkflowFileVariableInputs,
  WorkflowVariableState
} from '../../../../utils/variables';
import { getRuntimeNodeResponseSummary } from '../../../../utils';
import { ChatRoleEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { runWithDerivedWorkflowFileContext } from '../../../../../utils/context';
import {
  computedAppToolUsage,
  getAppToolOutputError
} from '../../../../../../app/tool/runtime/utils';

type Props = Pick<
  RunWorkflowProps,
  | 'checkIsStopping'
  | 'lang'
  | 'requestOrigin'
  | 'mode'
  | 'timezone'
  | 'externalProvider'
  | 'uid'
  | 'chatId'
  | 'responseChatItemId'
  | 'runningAppInfo'
  | 'runningUserInfo'
  | 'retainDatasetCite'
  | 'maxRunTimes'
  | 'workflowDispatchDeep'
  | 'responseAllData'
  | 'responseDetail'
  | 'nodeResponseSink'
  | 'nodeResponseParentId'
  | 'variableState'
  | 'lastInteractive'
> & {
  app: {
    name: string;
    avatar?: string;
    id: string;
    // Agent 工具固定版本需要与 schema 加载阶段保持一致。
    version?: string;
    /** 系统 Workflow Tool 的 commercial id；存在时跳过用户态 App 鉴权。 */
    systemToolId?: string;
  };
  userChatInput: string;
  customAppVariables: Record<string, any>;
  dynamic?: boolean;
  useResourceSnapshot?: boolean;
};

export const dispatchApp = async (props: Props): Promise<DispatchSubAppResponse> => {
  const {
    runningAppInfo,
    runningUserInfo,
    app,
    variableState,
    customAppVariables,
    userChatInput,
    dynamic = false,
    ...data
  } = props;

  const appData = await loadWorkflowAppResource({
    appId: app.id,
    tmbId: runningUserInfo.tmbId,
    type: 'tool',
    dynamic
  });
  const childVersion = await getAppVersionById({
    appId: app.id,
    versionId: app.version,
    app: appData
  });
  const { nodes, edges, chatConfig } = childVersion;
  const resourceContext = await createWorkflowChildResourceContext(
    childVersion.resources,
    String(appData.teamId)
  );
  const workflowToolVariables = filterWorkflowToolInputVariables({
    inputs: appData2FlowNodeIO({ chatConfig }).inputs,
    variables: customAppVariables
  });

  // Rewrite children app variables
  const { externalProvider } = await getUserChatInfo(appData.tmbId);
  const childRunningAppInfo = {
    sourceType: ChatSourceTypeEnum.app,
    sourceId: String(appData._id),
    teamId: String(appData.teamId),
    tmbId: String(appData.tmbId),
    name: appData.name,
    isChildApp: true
  };
  const runtimeNodes = rewriteNodeOutputByHistories(
    storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes))
  );
  const runtimeEdges = storeEdges2RuntimeEdges(edges);

  const {
    assistantResponses,
    flowUsages,
    runtimeNodeResponseSummary,
    workflowInteractiveResponse
  } = await runWithDerivedWorkflowFileContext({
    files: getWorkflowFileVariableInputs({
      variablesConfig: chatConfig.variables ?? [],
      inputVariables: workflowToolVariables
    }),
    resourceContext,
    fn: async ({ resolveInputFile }) => {
      const childrenVariableState = await WorkflowVariableState.create({
        timezone: data.timezone,
        runningAppInfo: childRunningAppInfo,
        chatId: data.chatId,
        responseChatItemId: data.responseChatItemId,
        histories: [],
        uid: data.uid,
        variablesConfig: chatConfig.variables ?? [],
        inputVariables: workflowToolVariables,
        externalVariables: externalProvider?.externalWorkflowVariables,
        sourceVariableState: variableState,
        resolveInputFile
      });

      return runWorkflow({
        ...data,
        runningAppInfo: {
          sourceType: ChatSourceTypeEnum.app,
          sourceId: String(appData._id),
          name: appData.name,
          teamId: String(appData.teamId),
          tmbId: String(appData.tmbId),
          isChildApp: true
        },
        runningUserInfo,
        runtimeNodes,
        runtimeEdges,
        chatConfig,
        histories: [],
        variableState: childrenVariableState,
        isToolCall: true,
        query: [
          {
            text: {
              content: userChatInput
            }
          }
        ],
        stream: false,
        workflowStreamResponse: undefined
      });
    }
  });

  const { text } = chatValue2RuntimePrompt(assistantResponses);
  const runtimeSummary = getRuntimeNodeResponseSummary({
    runtimeNodeResponseSummary
  });

  return {
    response: text,
    ...(runtimeSummary.hasError
      ? { errorMessage: runtimeSummary.errorText || 'Run workflow failed' }
      : {}),
    assistantMessages: chats2GPTMessages({
      messages: [
        {
          obj: ChatRoleEnum.AI,
          value: assistantResponses
        }
      ],
      reserveId: false,
      reserveTool: true
    }),
    usages: flowUsages,
    interactive: workflowInteractiveResponse,
    nodeResponse: {
      moduleType: FlowNodeTypeEnum.appModule,
      moduleName: app.name,
      moduleLogo: app.avatar,
      toolInput: {
        userChatInput,
        ...workflowToolVariables
      },
      toolRes: text,
      childResponseCount: runtimeSummary.childResponseCount
    }
  };
};

export const dispatchPlugin = async (props: Props): Promise<DispatchSubAppResponse> => {
  const {
    runningAppInfo,
    runningUserInfo,
    app,
    variableState,
    customAppVariables,
    userChatInput,
    dynamic = false,
    useResourceSnapshot = true,
    ...data
  } = props;
  // plugin 子应用不接收普通 userChatInput；这里解构只为了避免透传给 runWorkflow。
  void userChatInput;

  let resourceContext: Awaited<ReturnType<typeof createWorkflowChildResourceContext>> | null = null;
  const { nodes, edges, chatConfig, childAppInfo, externalProviderTmbId, billingTool } =
    await (async () => {
      if (app.systemToolId) {
        const systemToolRuntime = await SystemToolRepo.getInstance().getSystemToolWorkflowRuntime({
          pluginId: app.systemToolId,
          version: app.version
        });

        return {
          nodes: systemToolRuntime.nodes,
          edges: systemToolRuntime.edges,
          chatConfig: systemToolRuntime.chatConfig ?? {},
          childAppInfo: {
            sourceId: systemToolRuntime.id,
            teamId: systemToolRuntime.teamId,
            tmbId: systemToolRuntime.tmbId,
            name: systemToolRuntime.name
          },
          // 系统 Workflow 没有调用者可访问的 App 记录，沿用当前工作流的用户上下文。
          externalProviderTmbId: systemToolRuntime.tmbId ?? runningAppInfo.tmbId,
          billingTool: systemToolRuntime
        };
      }

      // Personal plugin 必须以当前 workflow user 做 App 权限校验，并在需要时切换资源快照。
      const appData = await loadWorkflowAppResource({
        appId: app.id,
        tmbId: runningUserInfo.tmbId,
        type: 'tool',
        dynamic: dynamic || !useResourceSnapshot
      });
      const appVersion = await getAppVersionById({
        appId: app.id,
        versionId: app.version,
        app: appData
      });
      if (useResourceSnapshot) {
        resourceContext = await createWorkflowChildResourceContext(
          appVersion.resources,
          String(appData.teamId || runningAppInfo.teamId)
        );
      }

      return {
        nodes: appVersion.nodes,
        edges: appVersion.edges,
        chatConfig: appVersion.chatConfig,
        childAppInfo: {
          sourceId: String(appData._id),
          teamId: appData.teamId,
          tmbId: appData.tmbId,
          name: appData.name
        },
        externalProviderTmbId: appData.tmbId,
        billingTool: undefined
      };
    })();
  const pluginInputs = getWorkflowToolInputsFromStoreNodes(nodes);
  const workflowToolVariables = filterWorkflowToolInputVariables({
    inputs: pluginInputs,
    variables: customAppVariables
  });

  // Rewrite children app variables
  const { externalProvider } = await getUserChatInfo(externalProviderTmbId);
  const childRunningAppInfo = {
    sourceType: ChatSourceTypeEnum.app,
    sourceId: childAppInfo.sourceId,
    teamId: String(childAppInfo.teamId || runningAppInfo.teamId),
    tmbId: String(childAppInfo.tmbId || runningAppInfo.tmbId),
    name: childAppInfo.name,
    isChildApp: true
  };
  const childFileInputs = [
    ...getWorkflowFileVariableInputs({
      variablesConfig: chatConfig.variables ?? [],
      inputVariables: {}
    }),
    ...nodes.flatMap((node) =>
      node.flowNodeType === FlowNodeTypeEnum.pluginInput
        ? node.inputs.flatMap((input) =>
            input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect)
              ? getWorkflowFileInputsFromValue(
                  workflowToolVariables[input.key] ?? input.value ?? input.defaultValue,
                  input.maxFiles
                )
              : []
          )
        : []
    )
  ];

  const outputFilterMap =
    nodes
      .find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginOutput)
      ?.inputs.reduce<Record<string, boolean>>((acc, cur) => {
        acc[cur.key] = cur.isToolOutput === false ? false : true;
        return acc;
      }, {}) ?? {};

  const {
    assistantResponses = [],
    flowUsages,
    runtimeNodeResponseSummary,
    workflowInteractiveResponse
  } = await runWithDerivedWorkflowFileContext({
    files: childFileInputs,
    resourceContext,
    fn: async ({ resolveInputFile, filterFiles }) => {
      const childrenVariableState = await WorkflowVariableState.create({
        timezone: data.timezone,
        runningAppInfo: childRunningAppInfo,
        chatId: data.chatId,
        responseChatItemId: data.responseChatItemId,
        histories: [],
        uid: data.uid,
        variablesConfig: chatConfig.variables ?? [],
        inputVariables: {},
        externalVariables: externalProvider?.externalWorkflowVariables,
        sourceVariableState: variableState,
        resolveInputFile
      });
      const runtimeVariables = childrenVariableState.toRuntimeRecord();
      const runtimeNodes = storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes)).map(
        (node) => {
          // Update plugin input value
          if (node.flowNodeType === FlowNodeTypeEnum.pluginInput) {
            return {
              ...node,
              showStatus: false,
              inputs: node.inputs.map((input) => {
                const hasExternalValue = Object.prototype.hasOwnProperty.call(
                  workflowToolVariables,
                  input.key
                );
                let val = hasExternalValue ? workflowToolVariables[input.key] : input.value;
                val ??= input.defaultValue;
                if (input.renderTypeList.includes(FlowNodeInputTypeEnum.password)) {
                  val = anyValueDecrypt(val);
                } else if (
                  input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect) &&
                  Array.isArray(val)
                ) {
                  val = filterFiles(val);
                  if (hasExternalValue) {
                    workflowToolVariables[input.key] = val.map((item: any) =>
                      typeof item === 'string' ? item : item.url
                    );
                  }
                }

                return {
                  ...input,
                  value: val
                };
              })
            };
          }
          return {
            ...node,
            showStatus: false
          };
        }
      );

      return runWorkflow({
        ...data,
        runningAppInfo: {
          sourceType: ChatSourceTypeEnum.app,
          sourceId: childAppInfo.sourceId,
          // 如果系统插件有 teamId 和 tmbId，则使用系统插件的 teamId 和 tmbId（管理员指定了插件作为系统插件）
          name: childAppInfo.name,
          teamId: childAppInfo.teamId || runningAppInfo.teamId,
          tmbId: childAppInfo.tmbId || runningAppInfo.tmbId,
          isChildApp: true
        },
        runningUserInfo,
        runtimeNodes,
        runtimeEdges: storeEdges2RuntimeEdges(edges),
        chatConfig,
        histories: [],
        variableState: childrenVariableState,
        isToolCall: true,
        query: serverGetWorkflowToolRunUserQuery({
          pluginInputs,
          variables: {
            ...runtimeVariables,
            ...workflowToolVariables
          }
        }).value,
        stream: false,
        workflowStreamResponse: undefined
      });
    }
  });

  const runtimeSummary = getRuntimeNodeResponseSummary({
    runtimeNodeResponseSummary
  });
  const pluginOutput = runtimeSummary.pluginOutput;
  const pluginOutputError = billingTool
    ? getAppToolOutputError({ plugin: billingTool, pluginOutput })
    : undefined;
  const { text: assistantText } = chatValue2RuntimePrompt(assistantResponses);
  const filteredPluginOutput = pluginOutput
    ? Object.keys(pluginOutput)
        .filter((key) => outputFilterMap[key])
        .reduce<Record<string, any>>((acc, key) => {
          acc[key] = pluginOutput[key];
          return acc;
        }, {})
    : undefined;
  const response = filteredPluginOutput
    ? JSON.stringify(
        pluginOutputError
          ? { ...filteredPluginOutput, error: pluginOutputError }
          : filteredPluginOutput
      )
    : workflowInteractiveResponse
      ? assistantText
      : 'Run workflow tool failed';
  const errorMessage = runtimeSummary.hasError
    ? runtimeSummary.errorText || 'Run workflow tool failed'
    : !pluginOutput
      ? 'Run workflow tool failed'
      : pluginOutputError;
  const usages = billingTool
    ? [
        {
          moduleName: app.name,
          totalPoints: await computedAppToolUsage({
            plugin: billingTool,
            childrenUsage: flowUsages,
            error: !!errorMessage
          })
        }
      ]
    : flowUsages;

  return {
    response,
    ...(errorMessage ? { errorMessage } : {}),
    assistantMessages: chats2GPTMessages({
      messages: [
        {
          obj: ChatRoleEnum.AI,
          value: assistantResponses
        }
      ],
      reserveId: false,
      reserveTool: true
    }),
    usages,
    interactive: workflowInteractiveResponse,
    nodeResponse: {
      moduleType: FlowNodeTypeEnum.pluginModule,
      moduleName: app.name,
      moduleLogo: app.avatar,
      toolInput: workflowToolVariables,
      toolRes: pluginOutput || {},
      childResponseCount: runtimeSummary.childResponseCount,
      ...(errorMessage ? { errorText: errorMessage } : {})
    }
  };
};
