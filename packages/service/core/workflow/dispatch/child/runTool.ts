import { getErrText } from '@fastgpt/global/common/error/utils';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  type DispatchNodeResultType,
  type ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { MCPClient } from '../../../app/mcp';
import { getSecretValue } from '../../../../common/secret/utils';
import type { McpToolDataType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import type { HttpToolConfigType } from '@fastgpt/global/core/app/type';
import { APIRunSystemTool } from '../../../app/tool/api';
import { MongoSystemTool } from '../../../plugin/tool/systemToolSchema';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { getSystemToolById } from '../../../app/tool/controller';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { pushTrack } from '../../../../common/middle/tracks/utils';
import { getNodeErrResponse } from '../utils';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import { getAppVersionById } from '../../../../core/app/version/controller';
import { runHTTPTool } from '../../../app/http';

type SystemInputConfigType = {
  type: SystemToolSecretInputTypeEnum;
  value: StoreSecretValueType;
};

type RunToolProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.toolData]?: McpToolDataType;
  [NodeInputKeyEnum.systemInputConfig]?: SystemInputConfigType;
  [key: string]: any;
}>;

type RunToolResponse = DispatchNodeResultType<
  {
    [NodeOutputKeyEnum.rawResponse]?: any;
    [key: string]: any;
  },
  Record<string, any>
>;

export const dispatchRunTool = async (props: RunToolProps): Promise<RunToolResponse> => {
  const {
    params,
    runningUserInfo,
    runningAppInfo,
    variables,
    workflowStreamResponse,

    node: { name, avatar, toolConfig, version, catchError }
  } = props;

  const systemToolId = toolConfig?.systemTool?.toolId;
  let toolInput: Record<string, any> = {};

  try {
    // run system tool
    if (toolConfig?.systemTool?.toolId) {
      const tool = await getSystemToolById(toolConfig.systemTool!.toolId);

      const inputConfigParams = await (async () => {
        switch (params.system_input_config?.type) {
          case SystemToolSecretInputTypeEnum.team:
            return Promise.reject(new Error('This is not supported yet'));
          case SystemToolSecretInputTypeEnum.manual:
            const val = params.system_input_config.value || {};
            return getSecretValue({
              storeSecret: val
            });
          case SystemToolSecretInputTypeEnum.system:
          default:
            // read from mongo
            const dbPlugin = await MongoSystemTool.findOne({
              pluginId: toolConfig.systemTool?.toolId
            }).lean();
            return dbPlugin?.inputListVal || {};
        }
      })();
      toolInput = Object.fromEntries(
        Object.entries(params).filter(([key]) => key !== NodeInputKeyEnum.systemInputConfig)
      );
      const inputs = {
        ...toolInput,
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
        // 适配旧版：旧版本没有catchError，部分工具会正常返回 error 字段作为响应。
        if (catchError === undefined && typeof res.error === 'object') {
          return {
            data: res.error,
            [DispatchNodeResponseKeyEnum.nodeResponse]: {
              toolInput,
              toolRes: res.error,
              moduleLogo: avatar
            },
            [DispatchNodeResponseKeyEnum.toolResponses]: res.error
          };
        }

        // String error(Common error, not custom)
        if (typeof res.error === 'string') {
          throw new Error(res.error);
        }

        // Custom error field
        return {
          error: res.error,
          [DispatchNodeResponseKeyEnum.nodeResponse]: {
            toolInput,
            error: res.error,
            moduleLogo: avatar
          },
          [DispatchNodeResponseKeyEnum.toolResponses]: res.error
        };
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
        data: result,
        [DispatchNodeResponseKeyEnum.answerText]: answerText,
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          toolInput,
          toolRes: result,
          moduleLogo: avatar,
          totalPoints: usagePoints
        },
        [DispatchNodeResponseKeyEnum.toolResponses]: result,
        [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
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

      // Buffer mcpClient in this workflow
      const mcpClient =
        props.mcpClientMemory?.[url] ??
        new MCPClient({
          url,
          headers: getSecretValue({
            storeSecret: headerSecret
          })
        });
      props.mcpClientMemory[url] = mcpClient;

      toolInput = params;
      const result = await mcpClient.toolCall({ toolName, params, closeConnection: false });
      return {
        data: { [NodeOutputKeyEnum.rawResponse]: result },
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          toolInput,
          toolRes: result,
          moduleLogo: avatar
        },
        [DispatchNodeResponseKeyEnum.toolResponses]: result
      };
    } else if (toolConfig?.httpTool?.toolId) {
      const { pluginId } = splitCombineToolId(toolConfig.httpTool.toolId);
      const [parentId, toolSetName, toolName] = pluginId.split('/');
      const toolset = await getAppVersionById({
        appId: parentId,
        versionId: version
      });
      const toolSetData = toolset.nodes[0].toolConfig?.httpToolSet;
      if (!toolSetData || typeof toolSetData !== 'object') {
        throw new Error('HTTP tool set not found');
      }

      const { headerSecret, baseUrl, toolList, customHeaders } = toolSetData;

      const httpTool = toolList?.find((tool: HttpToolConfigType) => tool.name === toolName);
      if (!httpTool) {
        throw new Error(`HTTP tool ${toolName} not found`);
      }

      toolInput = params;
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
        if (catchError) {
          return {
            error: { [NodeOutputKeyEnum.errorText]: errorMsg },
            [DispatchNodeResponseKeyEnum.nodeResponse]: {
              toolInput,
              toolRes: errorMsg,
              moduleLogo: avatar
            },
            [DispatchNodeResponseKeyEnum.toolResponses]: errorMsg
          };
        }
        throw new Error(errorMsg);
      }

      return {
        data: { [NodeOutputKeyEnum.rawResponse]: data, ...(typeof data === 'object' ? data : {}) },
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          toolInput,
          toolRes: data,
          moduleLogo: avatar
        },
        [DispatchNodeResponseKeyEnum.toolResponses]: data
      };
    } else {
      // mcp tool (old version compatible)
      const { toolData, system_toolData, ...restParams } = params;
      const { name: toolName, url, headerSecret } = toolData || system_toolData;

      const mcpClient = new MCPClient({
        url,
        headers: getSecretValue({
          storeSecret: headerSecret
        })
      });
      toolInput = restParams;
      const result = await mcpClient.toolCall({ toolName, params: restParams });

      return {
        data: {
          [NodeOutputKeyEnum.rawResponse]: result
        },
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          toolInput,
          toolRes: result,
          moduleLogo: avatar
        },
        [DispatchNodeResponseKeyEnum.toolResponses]: result
      };
    }
  } catch (error) {
    if (systemToolId) {
      pushTrack.runSystemTool({
        teamId: runningUserInfo.teamId,
        tmbId: runningUserInfo.tmbId,
        uid: runningUserInfo.tmbId,
        toolId: systemToolId,
        result: 0,
        msg: getErrText(error)
      });
    }

    return getNodeErrResponse({
      error,
      customNodeResponse: {
        toolInput,
        moduleLogo: avatar
      }
    });
  }
};
