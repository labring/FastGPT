import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { type Tool } from '@modelcontextprotocol/sdk/types.js';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { toolValueTypeList, valueTypeJsonSchemaMap } from '@fastgpt/global/core/workflow/constants';
import type { AppChatConfigType, AppSchemaType } from '@fastgpt/global/core/app/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { type toolCallProps } from './type';

import {
  getRunningUserInfoByTmbId,
  getUserIdByTmbId
} from '@fastgpt/service/support/user/team/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { type AIChatItemType, type UserChatItemType } from '@fastgpt/global/core/chat/type';
import {
  serverGetWorkflowToolRunUserQuery,
  updateWorkflowToolInputByVariables
} from '@fastgpt/service/core/app/tool/workflowTool/utils';
import { getWorkflowToolInputsFromStoreNodes } from '@fastgpt/global/core/app/tool/workflowTool/utils';
import {
  ChatFileTypeEnum,
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import {
  getWorkflowEntryNodeIds,
  storeEdges2RuntimeEdges
} from '@fastgpt/global/core/workflow/runtime/utils';
import { storeNodes2RuntimeNodes } from '@fastgpt/global/common/workflow/runtime';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { prepareWorkflowFileQuery } from '@fastgpt/service/core/workflow/utils/fileLimits';
import { removeEmptyUserInput } from '@fastgpt/global/core/chat/utils';
import {
  failChatRound,
  finalizeChatRound,
  type Props as SaveChatProps
} from '@fastgpt/service/core/chat/saveChat';
import { preChatRound } from '@fastgpt/service/core/chat/utils/prepare';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { removeDatasetCiteText } from '@fastgpt/global/core/ai/llm/utils';
import { getWorkflowRuntimeSummary } from '@fastgpt/service/core/workflow/dispatch/utils/summary';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { resolveMcpEffectiveTmbId } from './auth';
import { assertCancellation } from '@fastgpt/service/support/user/account/cancellation/guard';
import { markProfileError, profileStage, setProfileMeta } from '@fastgpt/service/common/profiling';
import { createWorkflowResourceContext } from '@fastgpt/service/core/workflow/resource/context';
import {
  LimitTypeEnum,
  assertTeamFrequencyLimit
} from '@fastgpt/service/common/api/frequencyLimit';

const assertMcpTeamUsable = async (mcp: { teamId?: string; tmbId?: string }) => {
  if (!mcp.teamId || !mcp.tmbId) return;
  await assertCancellation({
    teamId: mcp.teamId,
    userId: await getUserIdByTmbId(mcp.tmbId)
  });
};

const stringifyMcpPluginOutput = (pluginOutput: unknown) => {
  if (pluginOutput === undefined || pluginOutput === null) {
    return 'Can not get response from plugin';
  }

  return JSON.stringify(pluginOutput);
};

export const pluginNodes2InputSchema = (
  nodes: { flowNodeType: FlowNodeTypeEnum; inputs: FlowNodeInputItemType[] }[]
) => {
  const pluginInput = nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput);

  const schema: Tool['inputSchema'] = {
    type: 'object',
    properties: {},
    required: []
  };

  pluginInput?.inputs.forEach((input) => {
    const jsonSchema = input.valueType
      ? valueTypeJsonSchemaMap[input.valueType] || toolValueTypeList[0].jsonSchema
      : toolValueTypeList[0].jsonSchema;

    schema.properties![input.key] = {
      ...jsonSchema,
      description: input.description,
      enum: input.enum?.split('\n').filter(Boolean) || undefined
    };

    if (input.required) {
      // @ts-ignore
      schema.required.push(input.key);
    }
  });

  return schema;
};
export const workflow2InputSchema = (chatConfig?: {
  fileSelectConfig?: AppChatConfigType['fileSelectConfig'];
  variables?: AppChatConfigType['variables'];
}) => {
  const schema: Tool['inputSchema'] = {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'Question from user'
      },
      ...(chatConfig?.fileSelectConfig?.canSelectFile || chatConfig?.fileSelectConfig?.canSelectImg
        ? {
            fileUrlList: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'File linkage'
            }
          }
        : {})
    },
    required: ['question']
  };

  chatConfig?.variables?.forEach((item) => {
    const jsonSchema = item.valueType
      ? valueTypeJsonSchemaMap[item.valueType] || toolValueTypeList[0].jsonSchema
      : toolValueTypeList[0].jsonSchema;

    schema.properties![item.key] = {
      ...jsonSchema,
      description: item.description,
      enum: item.enums?.map((enumItem) => enumItem.value) || undefined
    };

    if (item.required) {
      // @ts-ignore
      schema.required!.push(item.key);
    }
  });

  return schema;
};
/**
 * 获取 MCP key 当前绑定的工具列表。
 *
 * MCP key 在创建或更新绑定应用时已经完成权限校验；运行时按 key 中保存的应用快照提供工具，
 * 不再因为创建人的应用权限后续变化而隐藏工具，避免已发布集成被普通权限调整意外中断。
 */
export const getMcpServerTools = async (key: string): Promise<Tool[]> => {
  const mcp = await profileStage({ event: 'mcpKey.read' }, () =>
    MongoMcpKey.findOne({ key }, { apps: 1, teamId: 1, tmbId: 1 }).lean()
  );
  if (!mcp) {
    return Promise.reject(CommonErrEnum.invalidResource);
  }

  setProfileMeta({ appCount: mcp.apps.length });
  await profileStage({ event: 'team.check' }, () => assertMcpTeamUsable(mcp));

  // Get app list
  const appList = await profileStage(
    { event: 'app.list', params: { appCount: mcp.apps.length } },
    () =>
      MongoApp.find(
        {
          _id: { $in: mcp.apps.map((app) => app.appId) },
          type: {
            $in: [AppTypeEnum.simple, AppTypeEnum.workflow, AppTypeEnum.workflowTool]
          }
        },
        { name: 1, intro: 1, publishedVersionId: 1 }
      ).lean()
  );

  // Get latest version
  const versionList = await profileStage({ event: 'app.versions' }, () =>
    Promise.all(appList.map((app) => getAppLatestVersion(app._id, app)))
  );

  // Compute mcp tools
  const tools = versionList.map<Tool>((version, index) => {
    const app = appList[index];
    const mcpApp = mcp.apps.find((mcpApp) => String(mcpApp.appId) === String(app._id))!;

    const isPlugin = !!version.nodes.find(
      (node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput
    );

    return {
      name: mcpApp.toolName,
      description: mcpApp.description,
      inputSchema: isPlugin
        ? pluginNodes2InputSchema(version.nodes)
        : workflow2InputSchema(version.chatConfig)
    };
  });

  return tools;
};

/**
 * 调用 MCP key 已绑定的工具。
 *
 * 发布 key 用于定位绑定关系；每次执行都按发布者或 authProxy 代理成员重新校验应用读权限，
 * 并将对话与运行用户上下文归属到该有效成员。
 */
export const callMcpServerTool = async ({ key, toolName, inputs, authProxy }: toolCallProps) => {
  setProfileMeta({ toolName });
  const dispatchApp = async (
    app: AppSchemaType,
    variables: Record<string, any>,
    effectiveTmbId: string
  ) => {
    const isPlugin = app.type === AppTypeEnum.workflowTool;
    const pluginFixedTitle = isPlugin ? 'Mcp call' : undefined;

    // Get app latest version
    const { versionId, nodes, edges, chatConfig, resources } = await profileStage(
      { event: 'app.version', params: { appId: String(app._id) } },
      () => getAppLatestVersion(app._id, app)
    );

    setProfileMeta({
      appId: String(app._id),
      isPlugin,
      nodeCount: nodes.length
    });

    const userQuestion: UserChatItemType = (() => {
      if (isPlugin) {
        return serverGetWorkflowToolRunUserQuery({
          pluginInputs: getWorkflowToolInputsFromStoreNodes(nodes),
          variables
        });
      }
      return {
        obj: ChatRoleEnum.Human,
        value: [
          ...(variables.fileUrlList || []).map((url: string) => ({
            file: {
              type: ChatFileTypeEnum.file,
              name: url,
              url: url
            }
          })),
          {
            text: {
              content: variables.question
            }
          }
        ]
      };
    })();

    let runtimeNodes = storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes));
    if (isPlugin) {
      // Assign values to runtimeNodes using variables
      runtimeNodes = updateWorkflowToolInputByVariables(runtimeNodes, variables);
      // Plugin runtime does not need global variables(It has been injected into the pluginInputNode)
      variables = {};
    } else {
      delete variables.question;
      delete variables.fileUrlList;
    }

    const chatId = getNanoid();
    const responseChatItemId = getNanoid(24);
    const chatSource = {
      sourceType: ChatSourceTypeEnum.app,
      sourceId: String(app._id)
    };
    const {
      query: workflowQuery,
      maxFileAmount,
      maxBytesPerFile
    } = await profileStage({ event: 'file.limit' }, () =>
      prepareWorkflowFileQuery({
        teamId: String(app.teamId),
        chatConfig,
        query: userQuestion.value
      })
    );
    const workflowUserQuestion: UserChatItemType = {
      ...userQuestion,
      value: workflowQuery
    };
    const preparedRound = await profileStage({ event: 'chat.prepare' }, () =>
      preChatRound({
        ...chatSource,
        chatId,
        teamId: String(app.teamId),
        tmbId: effectiveTmbId,
        source: ChatSourceEnum.mcp,
        userContent: workflowUserQuestion,
        responseChatItemId,
        fixedTitle: pluginFixedTitle
      })
    );
    let chatRoundFinalized = false;

    try {
      // 保持在 dispatchWorkFlow 参数求值时的原始顺序：先读运行成员，再构建资源快照。
      const runningUserInfo = await profileStage({ event: 'runningUser.read' }, () =>
        getRunningUserInfoByTmbId(effectiveTmbId)
      );
      const resourceContext = createWorkflowResourceContext({
        resources,
        teamId: app.teamId
      });

      const {
        assistantResponses,
        newVariables,
        durationSeconds,
        system_memories,
        workflowRuntimeSummary
      } = await profileStage(
        { event: 'workflow.dispatch', params: { nodeCount: runtimeNodes.length } },
        () =>
          dispatchWorkFlow({
            chatId: preparedRound.chatId,
            mode: 'chat',
            usageSource: UsageSourceEnum.mcp,
            runningAppInfo: {
              sourceType: ChatSourceTypeEnum.app,
              sourceId: String(app._id),
              name: app.name,
              teamId: String(app.teamId),
              tmbId: String(app.tmbId)
            },
            runningUserInfo,
            uid: effectiveTmbId,
            runtimeNodes,
            runtimeEdges: storeEdges2RuntimeEdges(edges),
            resourceContext,
            variables,
            responseChatItemId: preparedRound.responseChatItemId,
            query: removeEmptyUserInput(workflowQuery),
            maxFileAmount,
            maxBytesPerFile,
            chatConfig,
            histories: [],
            stream: false,
            maxRunTimes: WORKFLOW_MAX_RUN_TIMES,
            nodeResponseWriteConfig: {
              persistToDb: true,
              retainInMemory: false
            }
          })
      );

      // dispatchWorkFlow 正常返回但工作流内部存在未捕获错误时，本次调用仍应视为失败，
      // 避免失败请求进入成功分位数；响应与落库行为保持不变。
      if (workflowRuntimeSummary?.errorCount || workflowRuntimeSummary?.errorText) {
        markProfileError(workflowRuntimeSummary.errorText || 'Workflow run failed');
      }

      // Save chat
      const aiResponse: AIChatItemType & { dataId?: string } = {
        dataId: preparedRound.responseChatItemId,
        obj: ChatRoleEnum.AI,
        value: assistantResponses,
        memories: system_memories
      };
      const saveParams: SaveChatProps = {
        ...chatSource,
        chatId: preparedRound.chatId,
        versionId,
        teamId: String(app.teamId),
        tmbId: effectiveTmbId,
        nodes,
        appChatConfig: chatConfig,
        variables: newVariables,
        source: ChatSourceEnum.mcp,
        userContent: workflowUserQuestion,
        aiContent: aiResponse,
        durationSeconds,
        workflowRuntimeSummary
      };
      await profileStage({ event: 'chat.finalize' }, () => finalizeChatRound(saveParams));
      chatRoundFinalized = true;

      // Get MCP response type
      let responseContent = (() => {
        if (isPlugin) {
          const { pluginOutput } = getWorkflowRuntimeSummary({ workflowRuntimeSummary });
          return stringifyMcpPluginOutput(pluginOutput);
        }

        return assistantResponses
          .map((item) => item?.text?.content)
          .filter(Boolean)
          .join('\n');
      })();

      // Format response content
      responseContent = removeDatasetCiteText(responseContent.trim(), false);

      return responseContent;
    } catch (error) {
      if (!chatRoundFinalized && preparedRound.shouldPersistChatRound) {
        await failChatRound({
          ...chatSource,
          chatId: preparedRound.chatId,
          responseChatItemId: preparedRound.responseChatItemId,
          error
        });
      }
      throw error;
    }
  };

  const mcp = await profileStage({ event: 'mcpKey.read' }, () =>
    MongoMcpKey.findOne({ key }, { apps: 1, teamId: 1, tmbId: 1, authProxy: 1 }).lean()
  );

  if (!mcp) {
    return Promise.reject(CommonErrEnum.invalidResource);
  }

  setProfileMeta({ appCount: mcp.apps.length });
  await profileStage({ event: 'team.check' }, () => assertMcpTeamUsable(mcp));

  // Get app list
  const appList = await profileStage(
    { event: 'app.list', params: { appCount: mcp.apps.length } },
    () =>
      MongoApp.find({
        _id: { $in: mcp.apps.map((app) => app.appId) },
        type: {
          $in: [AppTypeEnum.simple, AppTypeEnum.workflow, AppTypeEnum.workflowTool]
        }
      }).lean()
  );

  const app = appList.find((app) => {
    const mcpApp = mcp.apps.find((mcpApp) => String(mcpApp.appId) === String(app._id))!;

    return toolName === mcpApp.toolName;
  });

  if (!app) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const effectiveTmbId = await profileStage({ event: 'identity.resolve' }, () =>
    resolveMcpEffectiveTmbId({ mcp, authProxy })
  );
  await profileStage({ event: 'app.auth', params: { appId: String(app._id) } }, () =>
    authAppByTmbId({
      tmbId: effectiveTmbId,
      appId: String(app._id),
      per: ReadPermissionVal
    })
  );

  // 校验所属团队的对话 QPM 频次限制，防止无限制调用打满集群或下游模型并发
  await profileStage({ event: 'team.frequency' }, () =>
    assertTeamFrequencyLimit({
      teamId: String(app.teamId),
      type: LimitTypeEnum.chat
    })
  );

  return await dispatchApp(app, inputs, effectiveTmbId);
};
