import { getErrText } from '@fastgpt/global/common/error/utils';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  type DispatchNodeResultType,
  type ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { assertMCPUrlNotInternal, MCPClient } from '../../../app/mcp';
import { getSecretValue } from '../../../../common/secret/utils';
import type { McpToolDataType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import type { HttpToolConfigType } from '@fastgpt/global/core/app/tool/httpTool/type';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { pushTrack } from '../../../../common/middle/tracks/utils';
import { getNodeErrResponse } from '../utils';
import { getAppVersionById } from '../../../../core/app/version/controller';
import { runHTTPTool } from '../../../app/http';
import { getWorkflowContext } from '../../utils/context';
import { getToolRawId } from '@fastgpt/global/core/app/tool/utils';
import { pluginClient } from '../../../../thirdProvider/fastgptPlugin';
import { SystemToolRepo } from '../../../app/tool/systemTool/systemTool.repo';
import { InvokeProcessor } from '../../../../support/invoke/invoke';
import { getLogger, LogCategories } from '../../../../common/logger';

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
    variableState,
    workflowStreamResponse,
    node: { name, avatar, toolConfig, version, catchError }
  } = props;
  const cTime = String(variableState.get('cTime') ?? '');
  const logger = getLogger(LogCategories.MODULE.APP.TOOL);

  const {
    uid: uId,
    chatId = '',
    runningAppInfo: { id: appId }
  } = props;

  const systemToolId = toolConfig?.systemTool?.toolId;
  let toolInput: Record<string, any> = {};

  try {
    // run system tool
    if (toolConfig?.systemTool?.toolId) {
      const systemToolRepo = SystemToolRepo.getInstance();
      const tool = await systemToolRepo.getSystemToolRuntime({
        pluginId: toolConfig.systemTool.toolId,
        source: 'system', // TODO : 后续用户调用时传 teamId
        version
      });

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
            return tool.secretsVal ?? {};
        }
      })();
      toolInput = Object.fromEntries(
        Object.entries(params).filter(([key]) => key !== NodeInputKeyEnum.systemInputConfig)
      );

      const invokeToken = new InvokeProcessor({
        appId,
        chatId,
        uId,
        teamId: String(runningUserInfo.teamId),
        tmbId: String(runningUserInfo.tmbId),
        permissions: tool.permissions ?? []
      }).generateToken();

      const formatToolId = getToolRawId(toolConfig.systemTool!.toolId);
      const childId = toolConfig.systemTool.toolId.split('/')[1];
      let answerText = '';

      const res = await pluginClient.runToolStream({
        pluginId: formatToolId,
        version: tool.version ?? version ?? '',
        source: 'system', // TODO: 后续用户调用时传 teamId
        input: toolInput,
        secrets: inputConfigParams,
        ...(childId ? { childId } : {}),
        systemVar: {
          app: {
            id: runningAppInfo.id,
            name: runningAppInfo.name
          },
          chat: {
            chatId,
            uid: uId
          },
          invokeToken,
          time: cTime
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

      const result = (res.output as any) || {};

      if (res.error) {
        // 适配旧版：旧版本没有catchError，部分工具会正常返回 error 字段作为响应。
        if (catchError === undefined && typeof res.error === 'object' && 'error' in res.error) {
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

        logger.error('Tool Run Error', { error: res.error });
        throw res.error;
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
      props.usagePush([
        {
          moduleName: name,
          totalPoints: usagePoints
        }
      ]);

      pushTrack.runSystemTool({
        teamId: runningUserInfo.teamId,
        tmbId: runningUserInfo.tmbId,
        uid: runningUserInfo.tmbId,
        toolId: tool.id,
        result: 1,
        usagePoint: usagePoints,
        msg: String(res.error || '')
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
        [DispatchNodeResponseKeyEnum.toolResponses]: result
      };
    } else if (toolConfig?.mcpTool?.toolId) {
      // pluginId: toolSetAppId/toolsetName/toolName
      const { parentId, toolName } = parseToolId(toolConfig.mcpTool.toolId);
      const tool = await getAppVersionById({
        appId: parentId,
        versionId: version
      });

      const { headerSecret, url } =
        tool.nodes[0].toolConfig?.mcpToolSet ?? tool.nodes[0].inputs[0].value;

      await assertMCPUrlNotInternal(url);

      const context = getWorkflowContext();
      // Buffer mcpClient in this workflow
      const mcpClient =
        context.mcpClientMemory?.[url] ??
        new MCPClient({
          url,
          headers: getSecretValue({
            storeSecret: headerSecret
          })
        });
      context.mcpClientMemory[url] = mcpClient;

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
      const { parentId, toolName } = parseToolId(toolConfig.httpTool.toolId);
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

      await assertMCPUrlNotInternal(url);

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
        uid: uId,
        toolId: systemToolId,
        result: 0,
        msg: getErrText(error)
      });
    }

    logger.error('Tool Run Error', { error });

    return getNodeErrResponse({
      error,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        toolInput,
        moduleLogo: avatar
      }
    });
  }
};

export const parseToolId = (id: string) => {
  const formatId = id.split('-').slice(1).join('-');
  const [parentId, toolsetNameOrToolName, legacyToolName] = formatId.split('/');

  if (legacyToolName) {
    // 旧版格式: source-appId/toolsetName/toolName
    return { parentId, toolName: legacyToolName };
  }

  // 新版格式: source-appId/toolName
  return { parentId, toolName: toolsetNameOrToolName };
};
