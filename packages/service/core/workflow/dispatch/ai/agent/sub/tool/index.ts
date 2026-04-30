import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import type { DispatchSubAppResponse } from '../../type';
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
import { assertMCPUrlNotInternal, MCPClient } from '../../../../../../app/mcp';
import { runHTTPTool } from '../../../../../../app/http';
import { getS3ChatSource } from '../../../../../../../common/s3/sources/chat';
import { parseToolId } from '../../../../child/runTool';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { RequireOnlyOne } from '@fastgpt/global/common/type/utils';

type SystemInputConfigType = {
  type: SystemToolSecretInputTypeEnum;
  value: StoreSecretValueType;
};
export type Props = {
  tool: {
    name: string;
    avatar?: string;
    version?: string;
    toolConfig: RuntimeNodeItemType['toolConfig'];
  };
  params: {
    [NodeInputKeyEnum.systemInputConfig]?: SystemInputConfigType;
    [key: string]: any;
  };
  runningUserInfo: ChatDispatchProps['runningUserInfo'];
  runningAppInfo: ChatDispatchProps['runningAppInfo'];
  chatId: ChatDispatchProps['chatId'];
  uid: ChatDispatchProps['uid'];
  variables: ChatDispatchProps['variables'];
  workflowStreamResponse: ChatDispatchProps['workflowStreamResponse'];
};

export const dispatchTool = async ({
  tool: { name, avatar, version, toolConfig },
  params: { system_input_config, ...params },
  runningUserInfo,
  runningAppInfo,
  chatId,
  uid,
  variables,
  workflowStreamResponse
}: Props): Promise<DispatchSubAppResponse> => {
  const getNodeResponse = ({
    result,
    response
  }: RequireOnlyOne<{
    result?: any;
    response?: string;
  }>): DispatchSubAppResponse['nodeResponse'] => {
    return {
      moduleType: FlowNodeTypeEnum.tool,
      moduleName: name,
      moduleLogo: avatar,
      toolInput: params,
      toolRes: result || response
    };
  };
  const getErrResponse = (error: any): DispatchSubAppResponse => {
    const response = getErrText(error, 'Call tool error');
    return {
      response,
      nodeResponse: getNodeResponse({
        response
      })
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
            version: version || tool.versionList?.[0]?.value || '',
            prefix: getS3ChatSource().getToolFilePrefix({
              appId: runningAppInfo.id,
              chatId,
              uId: uid
            })
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
          system_input_config?.type === SystemToolSecretInputTypeEnum.team ||
          system_input_config?.type === SystemToolSecretInputTypeEnum.manual
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
        nodeResponse: getNodeResponse({
          result
        }),
        usages: [
          {
            moduleName: name,
            totalPoints: usagePoints
          }
        ]
      };
    } else if (toolConfig?.mcpTool?.toolId) {
      const { parentId, toolName } = parseToolId(toolConfig.mcpTool.toolId);
      const tool = await getAppVersionById({
        appId: parentId,
        versionId: version
      });

      const { headerSecret, url } =
        tool.nodes[0].toolConfig?.mcpToolSet ?? tool.nodes[0].inputs[0].value;

      await assertMCPUrlNotInternal(url);

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
        response: JSON.stringify(result),
        nodeResponse: getNodeResponse({
          result: result
        })
      };
    } else if (toolConfig?.httpTool?.toolId) {
      const { parentId, toolName } = parseToolId(toolConfig.httpTool.toolId);
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
          nodeResponse: getNodeResponse({
            response: errorMsg
          }),
          response: errorMsg
        };
      }

      return {
        nodeResponse: getNodeResponse({
          result: data
        }),
        response: typeof data === 'object' ? JSON.stringify(data) : data
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
