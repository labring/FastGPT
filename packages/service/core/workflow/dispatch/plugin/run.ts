import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import { getWorkflowToolInputsFromStoreNodes } from '@fastgpt/global/core/app/tool/workflowTool/utils';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import {
  getWorkflowEntryNodeIds,
  storeEdges2RuntimeEdges,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { authWorkflowToolByTmbId } from '../../../../support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { computedAppToolUsage } from '../../../app/tool/runtime/utils';
import { filterSystemVariables, getNodeErrResponse } from '../utils';
import { serverGetWorkflowToolRunUserQuery } from '../../../app/tool/workflowTool/utils';
import {
  type NodeInputKeyEnum,
  type NodeOutputKeyEnum
} from '@fastgpt/global/core/workflow/constants';
import { runWorkflow } from '../index';
import { getUserChatInfo } from '../../../../support/user/team/utils';
import { dispatchRunTool } from '../child/runTool';
import type { AppToolRuntimeType } from '@fastgpt/global/core/app/tool/type';
import { anyValueDecrypt } from '../../../../common/secret/utils';
import { getAppVersionById } from '../../../app/version/controller';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';

type RunPluginProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.forbidStream]?: boolean;
  [key: string]: any;
}>;
type RunPluginResponse = DispatchNodeResultType<
  {
    [key: string]: any;
  },
  {
    [NodeOutputKeyEnum.errorText]?: string;
  }
>;

export const dispatchRunPlugin = async (props: RunPluginProps): Promise<RunPluginResponse> => {
  const {
    node: { pluginId, version },
    runningAppInfo,
    query,
    params: { system_forbid_stream = false, ...data } // Plugin input
  } = props;
  if (!pluginId) {
    return getNodeErrResponse({ error: 'pluginId can not find' });
  }

  let workflowTool: AppToolRuntimeType | undefined;

  try {
    // Adapt <= 4.10 system tool
    const { source, pluginId: formatPluginId } = splitCombineToolId(pluginId);
    if (source === AppToolSourceEnum.systemTool) {
      return await dispatchRunTool({
        ...props,
        node: {
          ...props.node,
          toolConfig: {
            systemTool: {
              toolId: formatPluginId
            }
          }
        }
      });
    }

    if (source !== AppToolSourceEnum.commercial && source !== AppToolSourceEnum.personal) {
      return getNodeErrResponse({ error: 'pluginId can not find' });
    }

    /*
      1. Team app
      2. Admin selected system tool
    */
    const { files } = chatValue2RuntimePrompt(query);

    // auth workflowTool
    const toolData = await authWorkflowToolByTmbId({
      appId: formatPluginId,
      tmbId: runningAppInfo.tmbId,
      per: ReadPermissionVal
    });

    const toolVersion = await getAppVersionById({
      appId: toolData._id,
      versionId: version,
      app: toolData
    });

    workflowTool = {
      id: String(toolData._id),
      teamId: toolData.teamId,
      tmbId: toolData.tmbId,
      name: parseI18nString(toolData.name, props.lang),
      avatar: toolData.avatar || '',
      showStatus: true,
      currentCost: 0,
      systemKeyCost: 0,
      nodes: toolVersion.nodes,
      edges: toolVersion.edges,
      hasTokenFee: false
    };

    const outputFilterMap =
      workflowTool.nodes
        .find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginOutput)
        ?.inputs.reduce<Record<string, boolean>>((acc, cur) => {
          acc[cur.key] = cur.isToolOutput === false ? false : true;
          return acc;
        }, {}) ?? {};
    const runtimeNodes = storeNodes2RuntimeNodes(
      workflowTool.nodes,
      getWorkflowEntryNodeIds(workflowTool.nodes)
    ).map((node) => {
      // Update workflowTool input value
      if (node.flowNodeType === FlowNodeTypeEnum.pluginInput) {
        return {
          ...node,
          showStatus: false,
          inputs: node.inputs.map((input) => {
            let val = data[input.key] ?? input.value;
            if (input.renderTypeList.includes(FlowNodeInputTypeEnum.password)) {
              val = anyValueDecrypt(val);
            } else if (
              input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect) &&
              Array.isArray(val) &&
              data[input.key]
            ) {
              data[input.key] = val.map((item) => (typeof item === 'string' ? item : item.url));
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
    });

    const { externalProvider } = await getUserChatInfo(runningAppInfo.tmbId);
    const runtimeVariables = {
      ...filterSystemVariables(props.variables),
      appId: String(workflowTool.id),
      ...(externalProvider ? externalProvider.externalWorkflowVariables : {})
    };
    const {
      flowResponses,
      flowUsages,
      assistantResponses,
      runTimes,
      system_memories,
      [DispatchNodeResponseKeyEnum.customFeedbacks]: customFeedbacks
    } = await runWorkflow({
      ...props,
      usageId: undefined,
      // Rewrite stream mode
      ...(system_forbid_stream
        ? {
            stream: false,
            workflowStreamResponse: undefined
          }
        : {}),
      runningAppInfo: {
        id: String(workflowTool.id),
        name: workflowTool.name,
        // 如果系统插件有 teamId 和 tmbId，则使用系统插件的 teamId 和 tmbId（管理员指定了插件作为系统插件）
        teamId: workflowTool.teamId || runningAppInfo.teamId,
        tmbId: workflowTool.tmbId || runningAppInfo.tmbId,
        isChildApp: true
      },
      variables: runtimeVariables,
      query: serverGetWorkflowToolRunUserQuery({
        pluginInputs: getWorkflowToolInputsFromStoreNodes(workflowTool.nodes),
        variables: runtimeVariables,
        files
      }).value,
      chatConfig: {},
      runtimeNodes,
      runtimeEdges: storeEdges2RuntimeEdges(workflowTool.edges)
    });
    const output = flowResponses.find((item) => item.moduleType === FlowNodeTypeEnum.pluginOutput);

    const usagePoints = await computedAppToolUsage({
      plugin: workflowTool,
      childrenUsage: flowUsages,
      error: !!output?.pluginOutput?.error
    });
    return {
      data: output ? output.pluginOutput : {},
      // 嵌套运行时，如果 childApp stream=false，实际上不会有任何内容输出给用户，所以不需要存储
      assistantResponses: system_forbid_stream ? [] : assistantResponses,
      system_memories,
      // responseData, // debug
      [DispatchNodeResponseKeyEnum.runTimes]: runTimes,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        moduleLogo: workflowTool.avatar,
        totalPoints: usagePoints,
        toolInput: data,
        pluginOutput: output?.pluginOutput,
        pluginDetail: toolData?.permission?.hasWritePer // Not system workflowTool
          ? flowResponses
          : undefined
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
        {
          moduleName: workflowTool.name,
          totalPoints: usagePoints
        }
      ],
      [DispatchNodeResponseKeyEnum.toolResponses]: output?.pluginOutput
        ? Object.keys(output.pluginOutput)
            .filter((key) => outputFilterMap[key])
            .reduce<Record<string, any>>((acc, key) => {
              acc[key] = output.pluginOutput![key];
              return acc;
            }, {})
        : null,
      [DispatchNodeResponseKeyEnum.customFeedbacks]: customFeedbacks
    };
  } catch (error) {
    return getNodeErrResponse({
      error,
      [DispatchNodeResponseKeyEnum.nodeResponse]: { moduleLogo: workflowTool?.avatar }
    });
  }
};
