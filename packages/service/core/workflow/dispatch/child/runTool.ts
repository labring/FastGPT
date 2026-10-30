import { createHash } from 'node:crypto';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { NodeOutputKeyEnum, NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getReferenceVariableValue } from '@fastgpt/global/core/workflow/runtime/utils';
import { jsonSchema2SecretInput } from '@fastgpt/global/core/app/jsonschema';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';
import {
  assertMCPUrlNotInternal,
  getMCPChildren,
  MCPClient,
  normalizeLegacyMcpHeaderSecret
} from '../../../app/mcp';
import { getSecretValue } from '../../../../common/secret/utils';
import { resolveToolInputValues } from '../../../app/tool/secretConfig';
import type { McpToolDataType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import { getMCPToolErrorText } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import type { HttpToolConfigType } from '@fastgpt/global/core/app/tool/httpTool/type';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import type { ReferenceValueType } from '@fastgpt/global/core/workflow/type/io';
import { pushTrack } from '../../../../common/middle/tracks/utils';
import { getNodeErrResponse } from '../utils';
import { getHTTPToolList, runHTTPTool } from '../../../app/http';
import { getWorkflowContext } from '../../utils/context';
import { getAppVersionById } from '../../../app/version/controller';
import {
  HttpToolSetRuntimeConfigSchema,
  McpToolSetRuntimeConfigSchema
} from '@fastgpt/global/core/workflow/type/node';
import { isWorkflowResourceError, loadWorkflowAppResource } from '../../resource/service';
import {
  getToolNameCandidates,
  getToolRawId,
  isDebugToolSource,
  isTeamPluginSource
} from '@fastgpt/global/core/app/tool/utils';
import { pluginClient } from '../../../../thirdProvider/fastgptPlugin';
import { SystemToolRepo } from '../../../app/tool/systemTool/systemTool.repo';
import { computedSystemToolUsage } from '../../../app/tool/runtime/utils';
import { InvokeProcessor } from '../../../../support/invoke/invoke';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getWorkflowAppId } from '../utils/source';
import {
  assertTeamPluginSourceAccess,
  getRawPluginIdFromSystemToolId
} from '../../../plugin/teamPluginPolicy';

type SystemInputConfigType = {
  type: SystemToolSecretInputTypeEnum;
  value: StoreSecretValueType;
};

export const isPluginAnswerType = (type: string): type is 'answer' | 'fastAnswer' =>
  type === 'answer' || type === 'fastAnswer';

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

/** 执行系统、HTTP 和 MCP 工具，并把协议执行错误转换为节点错误分支与展示详情。 */
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

  const { uid: uId, chatId = '' } = props;
  const appId = getWorkflowAppId(runningAppInfo);

  const systemToolId = toolConfig?.systemTool?.toolId;
  let toolInput: Record<string, any> = {};
  /** MCP 执行失败通过 isError 返回，保留原结果供详情和模型读取，不构造重复的 rawError。 */
  const getMcpResponse = (result: any): RunToolResponse => {
    const errorText = getMCPToolErrorText(result);
    return {
      data: { [NodeOutputKeyEnum.rawResponse]: result },
      ...(errorText !== undefined ? { error: { [NodeOutputKeyEnum.errorText]: errorText } } : {}),
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        toolInput,
        toolRes: result,
        moduleLogo: avatar,
        ...(errorText !== undefined ? { errorText } : {})
      },
      [DispatchNodeResponseKeyEnum.toolResponse]: result
    };
  };
  const resolveReference = (value: ReferenceValueType) =>
    getReferenceVariableValue({
      value,
      nodesMap: props.runtimeNodesMap,
      variables: variableState.toRuntimeRecord(),
      isReferenceVal: true
    });

  const callMcpTool = async ({
    toolName,
    url,
    headerSecret
  }: {
    toolName: string;
    url: string;
    headerSecret?: StoreSecretValueType | null;
  }) => {
    await assertMCPUrlNotInternal(url);

    const context = getWorkflowContext();
    const headers = getSecretValue({ storeSecret: headerSecret ?? undefined, resolveReference });
    // 认证引用会随 workflow 变量变化；缓存键保存摘要，避免包含密钥原文。
    const headersFingerprint = createHash('sha256')
      .update(
        JSON.stringify(Object.entries(headers).sort(([left], [right]) => left.localeCompare(right)))
      )
      .digest('hex');
    const cacheKey = JSON.stringify([url, headersFingerprint]);
    const mcpClient = context.mcpClientMemory?.[cacheKey] ?? new MCPClient({ url, headers });
    context.mcpClientMemory[cacheKey] = mcpClient;

    toolInput = params;
    return mcpClient.toolCall({ toolName, params, closeConnection: false });
  };

  const callHttpTool = async ({
    tool,
    apiSchemaStr,
    baseUrl,
    headerSecret,
    customHeaders
  }: {
    tool: HttpToolConfigType;
    apiSchemaStr?: string;
    baseUrl?: string;
    headerSecret?: StoreSecretValueType | null;
    customHeaders?: string | Record<string, string>;
  }) => {
    toolInput = params;
    const { data, errorMsg } = await runHTTPTool({
      apiSchemaStr,
      baseUrl: baseUrl || '',
      toolPath: tool.path,
      method: tool.method,
      params,
      headerSecret: tool.headerSecret || headerSecret,
      customHeaders: customHeaders
        ? typeof customHeaders === 'string'
          ? JSON.parse(customHeaders)
          : customHeaders
        : undefined,
      staticParams: tool.staticParams,
      staticHeaders: tool.staticHeaders,
      staticBody: tool.staticBody,
      resolveReference
    });

    if (errorMsg) {
      return getNodeErrResponse({
        error: errorMsg,
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          toolInput,
          toolRes: errorMsg,
          moduleLogo: avatar
        }
      });
    }

    return {
      data: { [NodeOutputKeyEnum.rawResponse]: data, ...(typeof data === 'object' ? data : {}) },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        toolInput,
        toolRes: data,
        moduleLogo: avatar
      },
      [DispatchNodeResponseKeyEnum.toolResponse]: data
    };
  };

  const getSystemToolSource = () => {
    const toolConfigSource = toolConfig?.systemTool?.source;
    if (isDebugToolSource(toolConfigSource)) return toolConfigSource;
    if (isTeamPluginSource(toolConfigSource)) return toolConfigSource;

    return 'system';
  };

  const resolveSystemToolRuntimeSource = async ({
    source,
    toolId
  }: {
    source: string;
    toolId: string;
  }) => {
    if (!isTeamPluginSource(source)) return source;

    await assertTeamPluginSourceAccess({
      teamId: String(runningUserInfo.teamId),
      source,
      pluginId: getRawPluginIdFromSystemToolId(toolId)
    });

    return source;
  };

  try {
    /**
     * 子工具按名称命中版本快照时沿用发布授权，未命中时检查运行成员的工具集读取权限。
     */
    const authRuntimeToolset = async (parentId: string, toolName?: string) =>
      loadWorkflowAppResource({
        tmbId: runningUserInfo.tmbId,
        appId: parentId,
        type: 'tool',
        toolName
      });

    // run system tool
    if (toolConfig?.systemTool?.toolId) {
      const toolSource = getSystemToolSource();
      const runtimeToolSource = await resolveSystemToolRuntimeSource({
        source: toolSource,
        toolId: toolConfig.systemTool.toolId
      });
      const systemToolRepo = SystemToolRepo.getInstance();
      const tool = await systemToolRepo.getSystemToolRuntime({
        pluginId: toolConfig.systemTool.toolId,
        source: runtimeToolSource,
        version
      });

      const toolDetail = await systemToolRepo.getSystemToolDetail({
        pluginId: toolConfig.systemTool.toolId,
        source: toolSource,
        version: tool.version ?? version,
        fallbackLatestVersion: true
      });
      const inputList = jsonSchema2SecretInput({ jsonSchema: toolDetail.secretSchema });

      const inputConfigParams = await (async () => {
        switch (params.system_input_config?.type) {
          case SystemToolSecretInputTypeEnum.team:
            return Promise.reject(new Error('This is not supported yet'));
          case SystemToolSecretInputTypeEnum.manual:
            const val = params.system_input_config.value || {};
            return resolveToolInputValues({
              value: val,
              inputList,
              resolveReference
            });
          case SystemToolSecretInputTypeEnum.system:
          default:
            if (isDebugToolSource(runtimeToolSource)) return {};
            return tool.secretsVal ?? {};
        }
      })();
      toolInput = Object.fromEntries(
        Object.entries(params).filter(([key]) => key !== NodeInputKeyEnum.systemInputConfig)
      );
      const invokeToken = appId
        ? new InvokeProcessor({
            appId,
            chatId,
            uId,
            teamId: String(runningUserInfo.teamId),
            tmbId: String(runningUserInfo.tmbId),
            permissions: tool.permissions ?? []
          }).generateToken()
        : undefined;

      const formatToolId = getToolRawId(toolConfig.systemTool!.toolId);
      const childId = toolConfig.systemTool.toolId.split('/')[1];
      let answerText = '';

      const res = await pluginClient.runToolStream({
        pluginId: formatToolId,
        version: tool.version ?? version ?? '',
        source: runtimeToolSource,
        input: toolInput,
        secrets: inputConfigParams,
        ...(childId ? { childId } : {}),
        systemVar: {
          app: {
            id: appId || '',
            name: appId ? runningAppInfo.name : ''
          },
          chat: {
            chatId,
            uid: uId
          },
          invokeToken: invokeToken || '',
          time: cTime
        },
        onMessage: ({ type, content }) => {
          if (!workflowStreamResponse || !content || !isPluginAnswerType(type)) return;

          answerText += content;
          workflowStreamResponse(
            type === 'fastAnswer'
              ? workflowSseEvent.fastAnswerDelta(content)
              : workflowSseEvent.answerDelta(content)
          );
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
            [DispatchNodeResponseKeyEnum.toolResponse]: res.error
          };
        }

        // String error(Common error, not custom)
        if (typeof res.error === 'string') {
          logger.error('Tool Run Error', { error: res.error });
          throw new Error(res.error);
        }

        // Custom error field
        return getNodeErrResponse({
          error: res.error,
          [DispatchNodeResponseKeyEnum.nodeResponse]: {
            toolInput,
            error: res.error,
            moduleLogo: avatar
          }
        });
      }

      const usagePoints = computedSystemToolUsage({
        tool,
        useSystemKey:
          params.system_input_config?.type !== SystemToolSecretInputTypeEnum.team &&
          params.system_input_config?.type !== SystemToolSecretInputTypeEnum.manual
      });
      props.usagePush([
        {
          moduleName: name,
          totalPoints: usagePoints
        }
      ]);

      pushTrack.runSystemTool({
        teamId: runningUserInfo.teamId,
        tmbId: runningUserInfo.tmbId,
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
        [DispatchNodeResponseKeyEnum.toolResponse]: result
      };
    } else if (toolConfig?.mcpTool) {
      const mcpTool = toolConfig.mcpTool;
      if ('toolId' in mcpTool) {
        // pluginId: toolSetAppId/toolsetName/toolName
        const { parentId, toolName } = parseToolId(mcpTool.toolId);
        if (!parentId || !toolName) {
          throw new Error(`Invalid MCP tool id: ${mcpTool.toolId}`);
        }
        const app = await authRuntimeToolset(parentId, toolName);
        const workflow = await getAppVersionById({ appId: parentId, app });
        const mcpToolSet = McpToolSetRuntimeConfigSchema.safeParse(
          workflow.nodes[0]?.toolConfig?.mcpToolSet
        ).data;
        const mcpToolList = await getMCPChildren(app, workflow);
        if (!mcpToolSet || !mcpToolList.length) throw new Error('MCP tool set is missing');
        const referencedTool = getToolNameCandidates(toolName)
          .map((name) => mcpToolList.find((tool) => tool.name === name))
          .find(Boolean);
        if (!referencedTool) throw new Error(`MCP tool ${toolName} not found`);
        const url = mcpToolSet.url ?? referencedTool.url;
        const headerSecret = mcpToolSet.headerSecret ?? referencedTool.headerSecret;
        if (!url) throw new Error('MCP tool set URL is missing');
        return getMcpResponse(await callMcpTool({ toolName, url, headerSecret }));
      }

      if (!mcpTool.url) throw new Error('MCP tool set URL is missing');
      return getMcpResponse(
        await callMcpTool({
          toolName: mcpTool.name,
          url: mcpTool.url,
          headerSecret: mcpTool.headerSecret
        })
      );
    } else if (toolConfig?.httpTool) {
      const httpToolConfig = toolConfig.httpTool;
      if (!('toolId' in httpToolConfig)) {
        return await callHttpTool({
          tool: httpToolConfig,
          apiSchemaStr: httpToolConfig.apiSchemaStr,
          baseUrl: httpToolConfig.baseUrl,
          headerSecret: httpToolConfig.headerSecret,
          customHeaders: httpToolConfig.customHeaders
        });
      }

      const { parentId, toolName } = parseToolId(httpToolConfig.toolId);
      if (!parentId || !toolName) {
        throw new Error(`Invalid HTTP tool id: ${httpToolConfig.toolId}`);
      }
      const app = await authRuntimeToolset(parentId, toolName);
      const workflow = await getAppVersionById({
        appId: parentId,
        versionId: version,
        app
      });
      const toolSetData = HttpToolSetRuntimeConfigSchema.safeParse(
        workflow.nodes[0]?.toolConfig?.httpToolSet
      ).data;
      const toolList = await getHTTPToolList(app, workflow);
      if (!toolSetData || !toolList.length) {
        throw new Error('HTTP tool set not found');
      }

      const httpTool = getToolNameCandidates(toolName)
        .map((name) => toolList?.find((tool: HttpToolConfigType) => tool.name === name))
        .find(Boolean);
      if (!httpTool) {
        throw new Error(`HTTP tool ${toolName} not found`);
      }

      return await callHttpTool({
        tool: httpTool,
        apiSchemaStr: toolSetData.apiSchemaStr,
        baseUrl: toolSetData.baseUrl,
        headerSecret: toolSetData.headerSecret,
        customHeaders: toolSetData.customHeaders
      });
    } else {
      // mcp tool (old version compatible)
      const { toolData, system_toolData, ...restParams } = params;
      const { name: toolName, url, headerSecret } = toolData || system_toolData;

      await assertMCPUrlNotInternal(url);

      const mcpClient = new MCPClient({
        url,
        headers: getSecretValue({
          storeSecret: normalizeLegacyMcpHeaderSecret(headerSecret),
          resolveReference
        })
      });
      toolInput = restParams;
      const result = await mcpClient.toolCall({ toolName, params: restParams });
      return getMcpResponse(result);
    }
  } catch (error) {
    if (isWorkflowResourceError(error)) throw error;
    if (systemToolId) {
      pushTrack.runSystemTool({
        teamId: runningUserInfo.teamId,
        tmbId: runningUserInfo.tmbId,
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
  const [parentId, toolsetNameOrToolName, ...restToolNameParts] = formatId.split('/');

  if (restToolNameParts.length > 0) {
    const toolName = restToolNameParts.join('/');

    // 新版格式允许 toolName 以 `/` 开头，此时 ID 会表现为 source-appId//toolName。
    if (!toolsetNameOrToolName) {
      return { parentId, toolName: `/${toolName}` };
    }

    // 旧版格式: source-appId/toolsetName/toolName
    return { parentId, toolName };
  }

  // 新版格式: source-appId/toolName
  return { parentId, toolName: toolsetNameOrToolName };
};
