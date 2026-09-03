import { AgentToolInputConfigSchema, type AgentToolType } from '@fastgpt/global/core/app/tool/type';
import { hashStr } from '@fastgpt/global/common/string/tools';
import {
  getToolNameCandidates,
  getToolIdentityKey,
  isSystemOrCommercialToolId,
  isDebugToolSource,
  isTeamPluginSource,
  splitCombineToolId,
  splitToolsetToolPluginId
} from '@fastgpt/global/core/app/tool/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authAppByTmbId } from '../../../../../../../support/permission/app/auth';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { getSystemToolRunTimeNodeFromSystemToolset } from '../../../../../../workflow/utils';
import { getMCPToolRuntimeNode } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import { getHTTPToolRuntimeNode } from '@fastgpt/global/core/app/tool/httpTool/utils';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import {
  jsonSchema2NodeInput,
  jsonSchema2NodeOutput,
  jsonSchema2SecretInput,
  type JSONSchemaInputType
} from '@fastgpt/global/core/app/jsonschema';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { McpToolConfigType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import type { HttpToolConfigType } from '@fastgpt/global/core/app/tool/httpTool/type';
import type { SubAppInitType } from '../type';
import {
  filterToolConfiguredParams,
  getToolConfigStatus,
  getToolInputManualRenderType,
  initAgentToolInputType,
  initToolInputsTypeByDefaultMode,
  parseJsonEditorValue,
  validateToolConfiguration
} from '@fastgpt/global/core/app/formEdit/utils';
import { compileToolRuntime } from '@fastgpt/global/core/app/tool/runtime';
import { getLogger, LogCategories } from '../../../../../../../common/logger';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import {
  appData2FlowNodeIO,
  pluginData2FlowNodeIO,
  projectExternalVariableInput,
  toolData2FlowNodeIO
} from '@fastgpt/global/core/workflow/utils';
import type { AppSchemaType } from '@fastgpt/global/core/app/type';
import { getAppVersionById } from '../../../../../../app/version/controller';
import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { SystemToolRepo } from '../../../../../../app/tool/systemTool/systemTool.repo';
import { Output_Template_Error_Message } from '@fastgpt/global/core/workflow/template/output';
import type { NodeToolConfigType } from '@fastgpt/global/core/workflow/type/node';
import { getMCPChildren } from '../../../../../../app/mcp';
import { getTmbInfoByTmbId } from '../../../../../../../support/user/team/controller';
import {
  assertTeamPluginSourceAccess,
  getRawPluginIdFromSystemToolId
} from '../../../../../../plugin/teamPluginPolicy';

type AgentRuntimeNode = RuntimeNodeItemType & {
  currentCost?: number;
  hasSystemSecret?: boolean;
  hasTokenFee?: boolean;
  systemKeyCost?: number;
};

/** 为隔离 source 生成稳定短 ID，避免特殊字符清洗或长度截断造成 runtime tool ID 碰撞。 */
const getAgentRuntimeToolId = ({ pluginId, source }: { pluginId: string; source?: string }) => {
  const normalizedPluginId = pluginId.replace(/[^a-zA-Z0-9_-]/g, '');
  const isSourceScoped = isTeamPluginSource(source) || isDebugToolSource(source);
  if (!isSourceScoped || !source) return normalizedPluginId;

  const rawPluginId = pluginId.replace(/^systemTool-/, '');
  return hashStr(`${source}:${rawPluginId}`).slice(0, 16);
};

/**
 * 将 Agent 选择的工具配置转换成 LLM function calling 与 runtime 执行共用的工具描述。
 *
 * 这里刻意不调用面向前端预览的 getClientToolPreviewNode：Agent runtime 只关心鉴权后的执行
 * 节点、toolConfig 和 JSON Schema。App 类工具按 Agent 配置读取固定版本或最新版本；MCP 工具会
 * 在运行态补齐旧版子 App 数据或前端预览数据中被裁剪的 schema。
 */
export const getAgentRuntimeTools = async ({
  tools,
  tmbId,
  lang
}: {
  tools: AgentToolType[];
  tmbId: string;
  lang?: localeType;
}): Promise<SubAppInitType[]> => {
  let teamIdPromise: Promise<string> | undefined;
  const getCurrentTeamId = async () => {
    if (!teamIdPromise) {
      teamIdPromise = getTmbInfoByTmbId({ tmbId }).then((team) => {
        return team.teamId;
      });
    }
    return teamIdPromise;
  };

  // Agent 工具执行需要统一的错误输出口，方便 workflow runtime 收敛失败结果。
  const appendErrorOutput = (outputs: RuntimeNodeItemType['outputs'] = []) => {
    return outputs.some((item) => item.type === FlowNodeOutputTypeEnum.error)
      ? outputs
      : [...outputs, Output_Template_Error_Message];
  };

  // toolsetData2FlowNodeIO 偏前端展示，会丢掉部分 schema 相关信息；runtime 直接保留节点 IO。
  const getToolSetNodeIO = ({
    nodes
  }: {
    nodes: AppSchemaType['modules'];
  }): {
    inputs: RuntimeNodeItemType['inputs'];
    outputs: RuntimeNodeItemType['outputs'];
    toolConfig?: NodeToolConfigType;
  } => {
    const toolSetNode = nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.toolSet);

    return {
      inputs: toolSetNode?.inputs || [],
      outputs: toolSetNode?.outputs || [],
      toolConfig: toolSetNode?.toolConfig
    };
  };

  /**
   * 系统工具和商业工具来自 SystemToolRepo，不需要 App 鉴权和版本查询。
   * associatedPluginId 表示这个系统能力最终应按插件工作流执行。
   */
  const formatSystemToolNode = async ({
    toolId,
    nodeId,
    idSource,
    runtimeSource,
    versionId
  }: {
    toolId: string;
    nodeId: string;
    idSource: AppToolSourceEnum.systemTool | AppToolSourceEnum.commercial;
    runtimeSource?: string;
    versionId?: string;
  }): Promise<AgentRuntimeNode> => {
    const systemToolRepo = SystemToolRepo.getInstance();
    const toolConfigSource = (() => {
      if (isDebugToolSource(runtimeSource)) return runtimeSource;
      if (isTeamPluginSource(runtimeSource)) return runtimeSource;
    })();
    const detailSource = await (async () => {
      if (!isTeamPluginSource(runtimeSource)) {
        return (
          toolConfigSource ?? (idSource === AppToolSourceEnum.commercial ? idSource : 'system')
        );
      }

      await assertTeamPluginSourceAccess({
        teamId: await getCurrentTeamId(),
        source: runtimeSource,
        pluginId: getRawPluginIdFromSystemToolId(toolId)
      });

      return runtimeSource;
    })();
    const toolDetail = await systemToolRepo.getSystemToolDetail({
      pluginId: toolId,
      version: versionId || undefined,
      lang,
      source: detailSource
    });
    const isWorkflowTool = !!toolDetail.associatedPluginId;
    const secrets = jsonSchema2SecretInput({ jsonSchema: toolDetail.secretSchema });
    const schemaInputs = jsonSchema2NodeInput({
      jsonSchema: toolDetail.inputSchema,
      schemaType: 'systemTool'
    });
    const schemaOutputs = jsonSchema2NodeOutput({ jsonSchema: toolDetail.outputSchema });
    // secrets 是运行时私密配置，只放进隐藏 input，不能暴露成模型可填写参数。
    const inputs = [
      ...(secrets?.length
        ? [
            {
              key: NodeInputKeyEnum.systemInputConfig,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              inputList: secrets
            } satisfies FlowNodeInputItemType
          ]
        : []),
      ...(isWorkflowTool ? schemaInputs.map(projectExternalVariableInput) : schemaInputs)
    ];

    return {
      nodeId,
      pluginId: toolId,
      flowNodeType: isWorkflowTool
        ? FlowNodeTypeEnum.pluginModule
        : toolDetail.isToolSet
          ? FlowNodeTypeEnum.toolSet
          : FlowNodeTypeEnum.tool,
      avatar: toolDetail.avatar,
      name: toolDetail.name,
      intro: toolDetail.intro,
      version: versionId ?? '',
      inputs,
      outputs: appendErrorOutput(schemaOutputs),
      jsonSchema: toolDetail.inputSchema,
      currentCost: toolDetail.currentCost,
      hasSystemSecret: toolDetail.hasSystemSecret,
      hasTokenFee: toolDetail.hasTokenFee,
      systemKeyCost: toolDetail.systemKeyCost,
      ...(isWorkflowTool
        ? {}
        : {
            toolConfig: {
              ...(toolDetail.isToolSet
                ? {
                    systemToolSet: {
                      toolId,
                      ...(toolConfigSource ? { source: toolConfigSource } : {}),
                      toolList:
                        toolDetail.children?.map((child) => ({
                          description: child.description ?? '',
                          name: child.name,
                          toolId: child.id
                        })) ?? []
                    }
                  }
                : {
                    systemTool: {
                      toolId,
                      ...(toolConfigSource ? { source: toolConfigSource } : {})
                    }
                  })
            }
          })
    };
  };

  // 缺失或空版本都表示最新版本；固定版本由 Agent 工具配置显式传入。
  const getVersionNodes = async ({
    app,
    versionId
  }: {
    app: AppSchemaType;
    versionId?: string;
  }) => {
    const version = await getAppVersionById({
      appId: String(app._id),
      versionId,
      app
    });

    return {
      ...version,
      nodes: version.nodes
    };
  };

  const hasMcpInputSchemaProperties = (schema?: JSONSchemaInputType) => {
    return !!schema?.properties && Object.keys(schema.properties).length > 0;
  };

  const findToolByName = <T extends { name: string }>(toolList: T[], toolName: string) => {
    return getToolNameCandidates(toolName)
      .map((name) => toolList.find((item) => item.name === name))
      .find(Boolean);
  };

  /**
   * Agent 工具面板保存的 MCP toolset 可能来自前端 preview，toolList 仍有工具名但
   * inputSchema.properties 已被裁剪。运行态按名称从 MCP app 的 children 中补回完整 schema。
   */
  const getMcpToolListWithRuntimeSchema = async ({
    app,
    toolList
  }: {
    app?: AppSchemaType;
    toolList?: McpToolConfigType[];
  }): Promise<McpToolConfigType[]> => {
    const currentToolList = toolList ?? [];
    if (!app) return currentToolList;

    if (!currentToolList.length) {
      return getMCPChildren(app);
    }

    const hasStrippedSchema = currentToolList.some(
      (tool) => !hasMcpInputSchemaProperties(tool.inputSchema)
    );
    if (!hasStrippedSchema) return currentToolList;

    const runtimeToolList = await getMCPChildren(app);
    if (!runtimeToolList.length) return currentToolList;

    return currentToolList.map((tool) => {
      if (hasMcpInputSchemaProperties(tool.inputSchema)) return tool;

      const runtimeTool = findToolByName(runtimeToolList, tool.name);
      if (!runtimeTool || !hasMcpInputSchemaProperties(runtimeTool.inputSchema)) return tool;

      return {
        ...tool,
        inputSchema: runtimeTool.inputSchema
      };
    });
  };

  type RuntimeMcpToolSet = NonNullable<
    NonNullable<RuntimeNodeItemType['toolConfig']>['mcpToolSet']
  >;
  type RuntimeMcpTool = McpToolConfigType & {
    url?: string;
    headerSecret?: RuntimeMcpToolSet['headerSecret'];
    id?: string;
    avatar?: string;
  };

  /** 将 Agent MCP 工具资源投影为执行阶段使用的 canonical ToolSet。 */
  const buildMcpRuntimeToolSet = ({
    mcpToolSet,
    toolList,
    selectedTool
  }: {
    mcpToolSet?: RuntimeMcpToolSet;
    toolList: RuntimeMcpTool[];
    selectedTool?: RuntimeMcpTool;
  }): RuntimeMcpToolSet | undefined => {
    const url = selectedTool?.url ?? mcpToolSet?.url;
    if (!url) return undefined;

    const headerSecret = selectedTool?.headerSecret ?? mcpToolSet?.headerSecret;
    return {
      url,
      ...(headerSecret ? { headerSecret } : {}),
      toolList: toolList.map(
        ({ url: _url, headerSecret: _headerSecret, id: _id, avatar: _avatar, ...tool }) => tool
      )
    };
  };

  /**
   * 普通 App 需要根据当前版本节点形态判断运行时类型：
   * - pluginInput: 插件工作流
   * - 单 toolSet: MCP/HTTP/System toolset
   * - 单 tool: 普通工具节点
   * - 其他: 子应用 workflow
   */
  const formatPersonalAppNode = async ({
    app,
    versionId
  }: {
    app: AppSchemaType;
    versionId?: string;
  }): Promise<AgentRuntimeNode> => {
    if (AppFolderTypeList.includes(app.type)) {
      return Promise.reject(PluginErrEnum.unExist);
    }

    const version = await getVersionNodes({ app, versionId });
    const nodes = version.nodes;
    const baseNode = {
      nodeId: String(app._id),
      pluginId: String(app._id),
      avatar: app.avatar,
      name: parseI18nString(app.name, lang),
      intro: parseI18nString(app.intro, lang),
      version: versionId ?? '',
      showStatus: true,
      inputs: [],
      outputs: []
    };

    // pluginInput 是插件工作流的显式标识，后续执行走 dispatchPlugin。
    if (nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput)) {
      const nodeIO = pluginData2FlowNodeIO({ nodes });
      return {
        ...baseNode,
        flowNodeType: FlowNodeTypeEnum.pluginModule,
        inputs: nodeIO.inputs,
        outputs: appendErrorOutput(nodeIO.outputs)
      };
    }

    const toolSetNode = nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.toolSet);
    if (toolSetNode && nodes.length === 1) {
      // MCP/HTTP toolset 的 json schema 保存在 toolConfig.toolList 上，必须保留原始 toolConfig。
      const nodeIO = getToolSetNodeIO({ nodes });
      return {
        ...baseNode,
        flowNodeType: FlowNodeTypeEnum.toolSet,
        inputs: nodeIO.inputs,
        outputs: appendErrorOutput(nodeIO.outputs),
        toolConfig: nodeIO.toolConfig
      };
    }

    const toolNode = nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.tool);
    if (toolNode && nodes.length === 1) {
      // 单工具节点可能直接带 jsonSchema，优先作为 function parameters 使用。
      const nodeIO = toolData2FlowNodeIO({ nodes });
      return {
        ...baseNode,
        flowNodeType: FlowNodeTypeEnum.tool,
        inputs: nodeIO.inputs,
        outputs: appendErrorOutput(nodeIO.outputs),
        toolConfig: nodeIO.toolConfig,
        jsonSchema: (toolNode as RuntimeNodeItemType).jsonSchema
      };
    }

    const nodeIO = appData2FlowNodeIO({ chatConfig: version.chatConfig });
    return {
      ...baseNode,
      flowNodeType: FlowNodeTypeEnum.appModule,
      inputs: nodeIO.inputs,
      outputs: appendErrorOutput(nodeIO.outputs)
    };
  };

  /**
   * 解析单个 MCP 工具 id: mcp-${appId}/${toolName}。
   * 新版数据从当前版本 toolConfig.mcpToolSet.toolList 读取；旧版 MCP 子工具 schema
   * 只保存在子 App 的 toolData 中，需要回退到 getMCPChildren。
   */
  const formatMcpToolNode = async ({
    app,
    pluginId,
    versionId
  }: {
    app: AppSchemaType;
    pluginId: string;
    versionId?: string;
  }): Promise<AgentRuntimeNode> => {
    const { toolName } = splitToolsetToolPluginId(pluginId);
    const version = await getVersionNodes({ app, versionId });
    const mcpToolSet = version.nodes[0]?.toolConfig?.mcpToolSet;
    const toolList = await getMcpToolListWithRuntimeSchema({
      app,
      toolList: mcpToolSet?.toolList
    });
    const tool = findToolByName(toolList, toolName);
    if (!tool) return Promise.reject(PluginErrEnum.unExist);

    const node = getMCPToolRuntimeNode({
      nodeId: pluginId.replace(/[^a-zA-Z0-9_-]/g, ''),
      toolSetId: String(app._id),
      toolsetName: app.name,
      avatar: app.avatar,
      tool,
      mcpToolSet: buildMcpRuntimeToolSet({
        mcpToolSet,
        toolList: toolList as RuntimeMcpTool[],
        selectedTool: tool as RuntimeMcpTool
      })
    });

    // 单独选择子工具时，模型侧展示子工具名即可，不需要带 toolset 前缀。
    return {
      ...node,
      version: versionId ?? '',
      name: tool.name,
      intro: tool.description
    };
  };

  /**
   * 解析单个 HTTP 工具 id: http-${appId}/${toolName}。
   * HTTP function parameters 使用 requestSchema，而不是展示表单用的 inputSchema。
   */
  const formatHttpToolNode = async ({
    app,
    pluginId,
    versionId
  }: {
    app: AppSchemaType;
    pluginId: string;
    versionId?: string;
  }): Promise<AgentRuntimeNode> => {
    const { toolName } = splitToolsetToolPluginId(pluginId);
    const version = await getVersionNodes({ app, versionId });
    const toolList = version.nodes[0]?.toolConfig?.httpToolSet?.toolList ?? [];
    const tool = getToolNameCandidates(toolName)
      .map((name) => toolList.find((item) => item.name === name))
      .find(Boolean);
    if (!tool) return Promise.reject(PluginErrEnum.unExist);

    const node = getHTTPToolRuntimeNode({
      nodeId: pluginId.replace(/[^a-zA-Z0-9_-]/g, ''),
      toolSetId: String(app._id),
      toolsetName: app.name,
      avatar: app.avatar,
      tool
    });

    // 单独选择子工具时，模型侧展示子工具名即可，不需要带 toolset 前缀。
    return {
      ...node,
      version: versionId ?? '',
      name: tool.name,
      intro: tool.description
    };
  };

  const getRuntimeToolNode = async ({
    idSource,
    runtimeSource,
    pluginId,
    toolId,
    versionId,
    app
  }: {
    idSource: AppToolSourceEnum | string;
    runtimeSource?: string;
    pluginId: string;
    toolId: string;
    versionId?: string;
    app?: AppSchemaType;
  }): Promise<AgentRuntimeNode> => {
    // Agent 运行时只需要节点执行和 schema 信息，不能依赖面向前端展示的 preview controller。
    if (idSource === AppToolSourceEnum.systemTool || idSource === AppToolSourceEnum.commercial) {
      return formatSystemToolNode({
        toolId,
        nodeId: pluginId,
        idSource,
        runtimeSource,
        versionId
      });
    }
    if (!app) return Promise.reject(PluginErrEnum.unExist);
    if (idSource === AppToolSourceEnum.mcp) {
      return formatMcpToolNode({ app, pluginId, versionId });
    }
    if (idSource === AppToolSourceEnum.http) {
      return formatHttpToolNode({ app, pluginId, versionId });
    }
    return formatPersonalAppNode({ app, versionId });
  };

  /** runtime schema 只使用 rewrite 入口生成的 canonical jsonSchema。 */
  const compileRuntimeTool = ({
    toolId,
    inputs,
    name,
    intro,
    jsonSchema,
    fixedInputBindings
  }: {
    toolId: string;
    inputs: FlowNodeInputItemType[];
    name: string;
    intro?: string;
    jsonSchema?: JSONSchemaInputType;
    fixedInputBindings?: Record<string, unknown>;
  }) => {
    const description = [name, intro].filter(Boolean).join(': ');
    // 仅数字开头的工具名需要补前缀，避免破坏 runtime 使用原始 tool id 反查工具。
    const formatToolId = /^\d/.test(toolId) ? `t${toolId}` : toolId;

    return compileToolRuntime({
      toolId: formatToolId,
      name: description,
      inputs,
      jsonSchema,
      fixedInputBindings
    });
  };

  return Promise.all(
    tools.map<Promise<SubAppInitType[]>>(async (tool) => {
      try {
        const { pluginId, authAppId, source: idSource } = splitCombineToolId(tool.id);
        const runtimeSource =
          tool.source ??
          tool.toolConfig?.systemTool?.source ??
          tool.toolConfig?.systemToolSet?.source;
        // 工具间整体并发；单个 App 类工具必须先鉴权拿到 app，才能读取对应版本节点。
        const authAppPromise = authAppId
          ? authAppByTmbId({
              tmbId,
              appId: authAppId,
              per: ReadPermissionVal
            })
          : Promise.resolve(undefined);

        const [authResult, toolNode] = await Promise.all([
          authAppPromise,
          authAppPromise.then((authResult) =>
            getRuntimeToolNode({
              idSource,
              runtimeSource,
              pluginId,
              app: authResult?.app,
              toolId: tool.id,
              versionId: tool.version
            })
          )
        ]);
        const authApp = authResult?.app;
        if (
          !validateToolConfiguration({
            toolTemplate: toolNode,
            isAppTool: true
          })
        ) {
          getLogger(LogCategories.MODULE.AI.AGENT).warn(`[Agent] tool has unsupported inputs`, {
            toolId: tool.id,
            toolName: toolNode.name
          });
          return [];
        }
        if (tool.toolConfig) {
          const runtimeMcpToolSet = toolNode.toolConfig?.mcpToolSet;
          toolNode.toolConfig = {
            ...tool.toolConfig,
            // MCP URL 与密钥仅存在运行态，历史 preview 快照不能覆盖。
            ...(runtimeMcpToolSet ? { mcpToolSet: runtimeMcpToolSet } : {})
          };
        }

        const legacyDefaultMode =
          tool.inputs === undefined
            ? isSystemOrCommercialToolId(tool.id)
              ? ('allAgentGenerated' as const)
              : toolNode.flowNodeType === FlowNodeTypeEnum.pluginModule
                ? ('toolDescription' as const)
                : undefined
            : undefined;
        const savedInputConfigMap = new Map(
          (tool.inputs ?? []).flatMap((input) => {
            const result = AgentToolInputConfigSchema.safeParse(input);
            return result.success ? [[result.data.key, result.data] as const] : [];
          })
        );
        toolNode.inputs = toolNode.inputs.map((input) =>
          initAgentToolInputType({
            input,
            mode: savedInputConfigMap.get(input.key)?.mode,
            legacyDefaultMode
          })
        );
        const configuredParams = filterToolConfiguredParams({
          params: tool.config,
          inputs: toolNode.inputs
        });
        /**
         * JSON Editor 的历史配置或编辑结果可能是 JSON 文本，也可能已经是原生值。
         * 运行边界统一转换，避免对象、数组或字符串字面量以序列化文本进入工具。
         */
        const getRuntimeConfiguredValue = ({
          input,
          value
        }: {
          input: FlowNodeInputItemType;
          value: unknown;
        }) => {
          if (getToolInputManualRenderType(input) !== FlowNodeInputTypeEnum.JSONEditor) {
            return value;
          }

          // 可选 JSON Editor 的历史配置可能保存为空白文本；与表单语义保持一致，按未配置处理。
          if (typeof value === 'string' && value.trim() === '') return undefined;

          const parsedValue = parseJsonEditorValue(value);
          if (!parsedValue.success) {
            throw new Error(`Invalid JSON editor value: ${input.key}`);
          }
          return parsedValue.value;
        };

        // 合并用户在 Agent 工具面板里保存的配置；false/0/空字符串也是有效配置值。
        toolNode.inputs.forEach((input) => {
          if (Object.prototype.hasOwnProperty.call(configuredParams, input.key)) {
            const value = getRuntimeConfiguredValue({
              input,
              value: configuredParams[input.key]
            });
            if (value === undefined) {
              delete configuredParams[input.key];
              return;
            }
            configuredParams[input.key] = value;
            input.value = value;
          }
        });

        // 缺少必填运行配置时，不把该工具注册给模型，避免模型调用后才失败。
        const configStatus = getToolConfigStatus({
          tool: toolNode
        });
        if (configStatus.status === 'waitingForConfig') {
          getLogger(LogCategories.MODULE.AI.AGENT).warn(`[Agent] tool config incomplete`, {
            toolId: tool.id,
            toolName: toolNode.name
          });
          return [];
        }

        const toolType = (() => {
          // 工作流系统工具在列表中 source 可能被归一为 system，但 ID 仍保留 commercial 前缀。
          // 运行时必须按 commercialTool 处理，才能通过 associatedPluginId 找到真实工作流。
          if (
            idSource === AppToolSourceEnum.commercial ||
            runtimeSource === AppToolSourceEnum.commercial
          ) {
            return 'commercialTool';
          }
          if (toolNode.flowNodeType === FlowNodeTypeEnum.appModule) {
            return 'workflow';
          }
          if (toolNode.flowNodeType === FlowNodeTypeEnum.pluginModule) {
            return 'toolWorkflow';
          }
          return 'tool';
        })();

        // toolset 展开后的子工具统一走 tool 执行；params 仍继承父工具配置。
        const promptReference = runtimeSource
          ? {
              id: getToolIdentityKey(tool.id, runtimeSource),
              legacyId: tool.id,
              name: toolNode.name
            }
          : {
              id: tool.id,
              name: toolNode.name
            };
        const buildSubApp = (child: RuntimeNodeItemType, id = child.nodeId): SubAppInitType => {
          const runtimeId = getAgentRuntimeToolId({ pluginId: id, source: runtimeSource });
          const inputs = initToolInputsTypeByDefaultMode(
            child.inputs.map((input) => ({
              ...input,
              defaultToAgentGenerated: true
            })),
            { forceDefaultMode: true, allowUserChatInputAgentGenerated: true }
          );
          const compiledRuntime = compileRuntimeTool({
            toolId: runtimeId,
            inputs,
            name: child.name,
            intro: child.intro,
            jsonSchema: child.jsonSchema,
            fixedInputBindings: filterToolConfiguredParams({ params: configuredParams, inputs })
          });

          return {
            type: 'tool',
            id: runtimeId,
            name: child.name,
            avatar: child.avatar,
            // MCP/HTTP 子工具节点默认 version 为空；固定版本由父工具集决定。
            version: toolNode.version ?? child.version,
            toolConfig: child.toolConfig,
            inputs,
            agentGeneratedInputKeys: compiledRuntime.agentGeneratedKeys,
            promptReference,
            params: compiledRuntime.fixedInputBindings,
            requestSchema: compiledRuntime.modelTool
          };
        };

        if (toolNode.flowNodeType === FlowNodeTypeEnum.toolSet) {
          const systemToolId = toolNode.toolConfig?.systemToolSet?.toolId;
          const mcpToolsetVal = toolNode.toolConfig?.mcpToolSet;
          const httpToolsetVal = toolNode.toolConfig?.httpToolSet;
          const isLegacyMcpToolSet =
            authApp?.type === AppTypeEnum.mcpToolSet && !toolNode.toolConfig?.mcpToolSet;

          if (systemToolId) {
            // System toolset 的子工具由系统工具仓库展开，可能包含内置运行配置。
            const children = await getSystemToolRunTimeNodeFromSystemToolset({
              toolSetNode: {
                toolConfig: toolNode.toolConfig,
                inputs: toolNode.inputs,
                nodeId: pluginId,
                version: toolNode.version
              },
              teamId: isTeamPluginSource(runtimeSource) ? await getCurrentTeamId() : undefined,
              lang
            });

            return children.map((child) => buildSubApp(child));
          } else if (mcpToolsetVal || isLegacyMcpToolSet) {
            // 新版 MCP toolset 在当前版本节点保存 toolList；旧版数据只有子 App 存 toolData。
            const finalToolList = await getMcpToolListWithRuntimeSchema({
              app: authApp,
              toolList: mcpToolsetVal?.toolList
            });

            const toolSetId = toolNode.pluginId || pluginId;
            const children = finalToolList.map((tool, index) => {
              const newToolNode = getMCPToolRuntimeNode({
                toolSetId,
                toolsetName: toolNode.name,
                nodeId: `${toolSetId}${index}`,
                avatar: toolNode.avatar,
                tool,
                mcpToolSet: buildMcpRuntimeToolSet({
                  mcpToolSet: mcpToolsetVal,
                  toolList: finalToolList as RuntimeMcpTool[],
                  selectedTool: tool as RuntimeMcpTool
                })
              });
              return newToolNode;
            });

            return children.map((child) => buildSubApp(child));
          } else if (httpToolsetVal) {
            // HTTP toolset 的 requestSchema 在 getHTTPToolRuntimeNode 中写入 jsonSchema。
            const children = httpToolsetVal.toolList.map((tool: HttpToolConfigType, index) => {
              const newToolNode = getHTTPToolRuntimeNode({
                tool,
                nodeId: `${pluginId}${index}`,
                avatar: toolNode.avatar,
                toolSetId: pluginId,
                toolsetName: toolNode.name
              });
              return newToolNode;
            });

            return children.map((child) => buildSubApp(child));
          }

          return [];
        } else {
          // 模型 schema、runtime map 和 dispatch 共用 source-aware ID。
          const runtimeToolId = getAgentRuntimeToolId({ pluginId, source: runtimeSource });
          const inputs = initToolInputsTypeByDefaultMode(toolNode.inputs, {
            allowUserChatInputAgentGenerated: true
          });
          const compiledRuntime = compileRuntimeTool({
            toolId: runtimeToolId,
            inputs,
            name: toolNode.name,
            intro: toolNode.intro,
            jsonSchema: toolNode.jsonSchema,
            fixedInputBindings: filterToolConfiguredParams({ params: configuredParams, inputs })
          });

          return [
            {
              type: toolType,
              id: runtimeToolId,
              name: toolNode.name,
              avatar: toolNode.avatar,
              version: toolNode.version,
              toolConfig: toolNode.toolConfig,
              inputs,
              agentGeneratedInputKeys: compiledRuntime.agentGeneratedKeys,
              promptReference,
              params: compiledRuntime.fixedInputBindings,
              requestSchema: compiledRuntime.modelTool
            }
          ];
        }
      } catch (error) {
        getLogger(LogCategories.MODULE.AI.AGENT).warn(`[Agent] tool load error`, {
          toolId: tool.id,
          error: getErrText(error)
        });
        return [];
      }
    })
  ).then((res) => res.flat());
};
