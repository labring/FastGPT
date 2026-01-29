import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import type { DispatchSubAppResponse } from '../../type';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import { getSystemToolById } from '../../../../../../app/tool/controller';
import { getSecretValue } from '../../../../../../../common/secret/utils';
import { MongoSystemTool } from '../../../../../../plugin/tool/systemToolSchema';
import { APIRunSystemTool } from '../../../../../../app/tool/api';
import type {
  ChatDispatchProps,
  RuntimeNodeItemType
} from '@fastgpt/global/core/workflow/runtime/type';
import type { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { pushTrack } from '../../../../../../../common/middle/tracks/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getAppVersionById } from '../../../../../../app/version/controller';
import { MCPClient } from '../../../../../../app/mcp';
import { runHTTPTool } from '../../../../../../app/http';

type SystemInputConfigType = {
  type: SystemToolSecretInputTypeEnum;
  value: StoreSecretValueType;
};
export type Props = {
  tool: {
    name: string;
    version?: string;
    toolConfig: RuntimeNodeItemType['toolConfig'];
  };
  params: {
    [NodeInputKeyEnum.systemInputConfig]?: SystemInputConfigType;
    [key: string]: any;
  };
  runningUserInfo: ChatDispatchProps['runningUserInfo'];
  runningAppInfo: ChatDispatchProps['runningAppInfo'];
  variables: ChatDispatchProps['variables'];
  workflowStreamResponse: ChatDispatchProps['workflowStreamResponse'];
};

export const dispatchTool = async ({
  tool: { name, version, toolConfig },
  params: { system_input_config, ...params },
  runningUserInfo,
  runningAppInfo,
  variables,
  workflowStreamResponse
}: Props): Promise<DispatchSubAppResponse> => {
  const startTime = Date.now();

  const getErrResponse = (error: any) => {
    return {
      runningTime: +((Date.now() - startTime) / 1000).toFixed(2),
      response: getErrText(error, 'Call tool error'),
      usages: []
    };
  };

  try {
    if (toolConfig?.systemTool?.toolId) {
      const tool = await getSystemToolById(toolConfig?.systemTool.toolId);
      const inputConfigParams = await (async () => {
        switch (system_input_config?.type) {
          case SystemToolSecretInputTypeEnum.team:
            return Promise.reject('This is not supported yet');
          case SystemToolSecretInputTypeEnum.manual:
            return getSecretValue({
              storeSecret: system_input_config.value || {}
            });
          case SystemToolSecretInputTypeEnum.system:
          default:
            // read from mongo
            const dbPlugin = await MongoSystemTool.findOne({
              pluginId: tool.id
            }).lean();
            return dbPlugin?.inputListVal || {};
        }
      })();
      const inputs = {
        ...Object.fromEntries(Object.entries(params)),
        ...inputConfigParams
      };

      const formatToolId = tool.id.split('-')[1];
      let answerText = '';

      const res = await APIRunSystemTool({
        toolId: formatToolId,
        inputs,
        systemVar: {
          user: {
            id: variables.userId,
            username: runningUserInfo.username,
            contact: runningUserInfo.contact,
            membername: runningUserInfo.memberName,
            teamName: runningUserInfo.teamName,
            teamId: runningUserInfo.teamId,
            name: runningUserInfo.tmbId
          },
          app: {
            id: runningAppInfo.id,
            name: runningAppInfo.id
          },
          tool: {
            id: formatToolId,
            version: version || tool.versionList?.[0]?.value || ''
          },
          time: variables.cTime
        },
        onMessage: ({ type, content }) => {
          if (workflowStreamResponse && content) {
            answerText += content;
            workflowStreamResponse({
              event: type as unknown as SseResponseEventEnum,
              data: textAdaptGptResponse({
                text: content
              })
            });
          }
        }
      });

      let result = res.output || {};

      if (res.error) {
        return getErrResponse(res.error);
      }

      const usagePoints = (() => {
        if (
          params.system_input_config?.type === SystemToolSecretInputTypeEnum.team ||
          params.system_input_config?.type === SystemToolSecretInputTypeEnum.manual
        ) {
          return 0;
        }
        return (tool.systemKeyCost ?? 0) + (tool.currentCost ?? 0);
      })();
      pushTrack.runSystemTool({
        teamId: runningUserInfo.teamId,
        tmbId: runningUserInfo.tmbId,
        uid: runningUserInfo.tmbId,
        toolId: tool.id,
        result: 1,
        usagePoint: usagePoints,
        msg: result[NodeOutputKeyEnum.systemError]
      });

      return {
        response: JSON.stringify(result),
        result,
        runningTime: +((Date.now() - startTime) / 1000).toFixed(2),
        usages: [
          {
            moduleName: name,
            totalPoints: usagePoints
          }
        ]
      };
    } else if (toolConfig?.mcpTool?.toolId) {
      const { pluginId } = splitCombineToolId(toolConfig.mcpTool.toolId);
      const [parentId, toolName] = pluginId.split('/');
      const tool = await getAppVersionById({
        appId: parentId,
        versionId: version
      });

      const { headerSecret, url } =
        tool.nodes[0].toolConfig?.mcpToolSet ?? tool.nodes[0].inputs[0].value;
      const mcpClient = new MCPClient({
        url,
        headers: getSecretValue({
          storeSecret: headerSecret
        })
      });

      const result = await mcpClient.toolCall({
        toolName,
        params
      });
      return {
        runningTime: +((Date.now() - startTime) / 1000).toFixed(2),
        response: JSON.stringify(result),
        result,
        usages: []
      };
    } else if (toolConfig?.httpTool?.toolId) {
      const { pluginId } = splitCombineToolId(toolConfig.httpTool.toolId);
      const [parentId, toolSetName, toolName] = pluginId.split('/');
      if (!parentId || !toolName) {
        return Promise.reject(`Invalid HTTP tool id: ${toolConfig.httpTool.toolId}`);
      }

      const toolset = await getAppVersionById({
        appId: parentId,
        versionId: version
      });
      const toolSetData = toolset.nodes[0].toolConfig?.httpToolSet;
      if (!toolSetData || typeof toolSetData !== 'object') {
        return Promise.reject(`HTTP tool set not found: ${toolConfig.httpTool.toolId}`);
      }

      const { headerSecret, baseUrl, toolList, customHeaders } = toolSetData;

      const httpTool = toolList?.find((tool) => tool.name === toolName);
      if (!httpTool) {
        return Promise.reject(`HTTP tool ${toolName} not found`);
      }

      const { data, errorMsg } = await runHTTPTool({
        baseUrl: baseUrl || '',
        toolPath: httpTool.path,
        method: httpTool.method,
        params,
        headerSecret: httpTool.headerSecret || headerSecret,
        customHeaders: customHeaders
          ? typeof customHeaders === 'string'
            ? JSON.parse(customHeaders)
            : customHeaders
          : undefined,
        staticParams: httpTool.staticParams,
        staticHeaders: httpTool.staticHeaders,
        staticBody: httpTool.staticBody
      });

      if (errorMsg) {
        return {
          runningTime: +((Date.now() - startTime) / 1000).toFixed(2),
          response: errorMsg,
          usages: []
        };
      }

      return {
        runningTime: +((Date.now() - startTime) / 1000).toFixed(2),
        response: typeof data === 'object' ? JSON.stringify(data) : data,
        result: data,
        usages: []
      };
    } else {
      return getErrResponse("Can't find the tool");
    }
  } catch (error) {
    if (toolConfig?.systemTool?.toolId) {
      pushTrack.runSystemTool({
        teamId: runningUserInfo.teamId,
        tmbId: runningUserInfo.tmbId,
        uid: runningUserInfo.tmbId,
        toolId: toolConfig.systemTool.toolId,
        result: 0,
        msg: getErrText(error)
      });
    }
    return getErrResponse(error);
  }
};
