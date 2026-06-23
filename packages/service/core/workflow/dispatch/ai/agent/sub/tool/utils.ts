import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';
import {
  getToolNameCandidates,
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
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import {
  jsonSchema2NodeInput,
  jsonSchema2NodeOutput,
  jsonSchema2SecretInput,
  nodeInputs2JsonSchema,
  type JSONSchemaInputType
} from '@fastgpt/global/core/app/jsonschema';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type {
  McpToolConfigType,
  McpToolDataType
} from '@fastgpt/global/core/app/tool/mcpTool/type';
import type { HttpToolConfigType } from '@fastgpt/global/core/app/tool/httpTool/type';
import type { SubAppInitType } from '../type';
import { getToolConfigStatus } from '@fastgpt/global/core/app/formEdit/utils';
import { getLogger, LogCategories } from '../../../../../../../common/logger';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import {
  appData2FlowNodeIO,
  pluginData2FlowNodeIO,
  toolData2FlowNodeIO
} from '@fastgpt/global/core/workflow/utils';
import type { AppSchemaType } from '@fastgpt/global/core/app/type';
import { getAppVersionById } from '../../../../../../app/version/controller';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { SystemToolRepo } from '../../../../../../app/tool/systemTool/systemTool.repo';
import { Output_Template_Error_Message } from '@fastgpt/global/core/workflow/template/output';
import type { NodeToolConfigType } from '@fastgpt/global/core/workflow/type/node';

type AgentRuntimeNode = RuntimeNodeItemType & {
  currentCost?: number;
  hasSystemSecret?: boolean;
  hasTokenFee?: boolean;
  systemKeyCost?: number;
};

/**
 * 将 Agent 选择的工具配置转换成 LLM function calling 与 runtime 执行共用的工具描述。
 *
 * 这里刻意不调用面向前端预览的 getClientToolPreviewNode：Agent runtime 只关心鉴权后的执行
 * 节点、toolConfig 和 JSON Schema。App 类工具统一读取当前发布版本；MCP/HTTP 工具集只使用
 * 当前版本节点里保存的 toolList，不额外兼容旧版 MCP 数据源。
 */
export const getAgentRuntimeTools = async ({
  tools,
  tmbId,
  lang
}: {
  tools: SkillToolType[];
  tmbId: string;
  lang?: localeType;
}): Promise<SubAppInitType[]> => {
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
    source
  }: {
    toolId: string;
    nodeId: string;
    source: AppToolSourceEnum.systemTool | AppToolSourceEnum.commercial;
  }): Promise<AgentRuntimeNode> => {
    const systemToolRepo = SystemToolRepo.getInstance();
    const toolDetail = await systemToolRepo.getSystemToolDetail({
      pluginId: toolId,
      lang,
      source: source === AppToolSourceEnum.commercial ? AppToolSourceEnum.commercial : 'system'
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
      ...schemaInputs
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
      toolDescription: toolDetail.toolDescription,
      version: '',
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
                      toolId
                    }
                  })
            }
          })
    };
  };

  // 当前 Agent 工具始终取 App 的当前发布版本；没有发布版本时由 controller 回落到 app.modules。
  const getVersionNodes = async ({ app }: { app: AppSchemaType }) => {
    const version = await getAppVersionById({
      appId: String(app._id),
      app
    });

    return {
      ...version,
      nodes: version.nodes
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
    app
  }: {
    app: AppSchemaType;
  }): Promise<AgentRuntimeNode> => {
    if (AppFolderTypeList.includes(app.type)) {
      return Promise.reject(PluginErrEnum.unExist);
    }

    const version = await getVersionNodes({ app });
    const nodes = version.nodes;
    const baseNode = {
      nodeId: String(app._id),
      pluginId: String(app._id),
      avatar: app.avatar,
      name: parseI18nString(app.name, lang),
      intro: parseI18nString(app.intro, lang),
      version: '',
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
   * 只读取当前版本 toolConfig.mcpToolSet.toolList；不再通过 getMCPChildren 补旧版数据。
   */
  const formatMcpToolNode = async ({
    app,
    pluginId
  }: {
    app: AppSchemaType;
    pluginId: string;
  }): Promise<AgentRuntimeNode> => {
    const { toolName } = splitToolsetToolPluginId(pluginId);
    const version = await getVersionNodes({ app });
    const toolList = version.nodes[0]?.toolConfig?.mcpToolSet?.toolList ?? [];
    const tool = getToolNameCandidates(toolName)
      .map((name) => toolList.find((item) => item.name === name))
      .find(Boolean);
    if (!tool) return Promise.reject(PluginErrEnum.unExist);

    const node = getMCPToolRuntimeNode({
      nodeId: pluginId.replace(/[^a-zA-Z0-9_-]/g, ''),
      toolSetId: String(app._id),
      toolsetName: app.name,
      avatar: app.avatar,
      tool
    });

    // 单独选择子工具时，模型侧展示子工具名即可，不需要带 toolset 前缀。
    return {
      ...node,
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
    pluginId
  }: {
    app: AppSchemaType;
    pluginId: string;
  }): Promise<AgentRuntimeNode> => {
    const { toolName } = splitToolsetToolPluginId(pluginId);
    const version = await getVersionNodes({ app });
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
      name: tool.name,
      intro: tool.description
    };
  };

  const getRuntimeToolNode = async ({
    source,
    pluginId,
    toolId,
    app
  }: {
    source: AppToolSourceEnum;
    pluginId: string;
    toolId: string;
    app?: AppSchemaType;
  }): Promise<AgentRuntimeNode> => {
    // Agent 运行时只需要节点执行和 schema 信息，不能依赖面向前端展示的 preview controller。
    if (source === AppToolSourceEnum.systemTool || source === AppToolSourceEnum.commercial) {
      return formatSystemToolNode({
        toolId,
        nodeId: pluginId,
        source
      });
    }
    if (!app) return Promise.reject(PluginErrEnum.unExist);
    if (source === AppToolSourceEnum.mcp) {
      return formatMcpToolNode({ app, pluginId });
    }
    if (source === AppToolSourceEnum.http) {
      return formatHttpToolNode({ app, pluginId });
    }
    return formatPersonalAppNode({ app });
  };

  /**
   * 生成 OpenAI-compatible function schema。
   * schema 优先级：显式 jsonSchema > toolData.inputSchema > 带 toolDescription 的普通 inputs。
   */
  const formatSchema = ({
    toolId,
    inputs,
    flowNodeType,
    name,
    toolDescription,
    intro,
    jsonSchema
  }: {
    toolId: string;
    inputs: FlowNodeInputItemType[];
    flowNodeType: FlowNodeTypeEnum;
    name: string;
    toolDescription?: string;
    intro?: string;
    jsonSchema?: JSONSchemaInputType;
  }): ChatCompletionTool => {
    const toolParams: FlowNodeInputItemType[] = [];
    let schema = jsonSchema;

    for (const input of inputs) {
      // 没有 JSON Schema 的普通工具，用 toolDescription 标识哪些 input 可以交给模型填写。
      if (input.toolDescription) {
        toolParams.push(input);
      }

      if (!schema && input.key === NodeInputKeyEnum.toolData) {
        schema = (input.value as McpToolDataType)?.inputSchema;
      }
    }

    const description = [name, toolDescription || intro].filter(Boolean).join(': ');
    // 仅数字开头的工具名需要补前缀，避免破坏 runtime 使用原始 tool id 反查工具。
    const formatToolId = /^\d/.test(toolId) ? `t${toolId}` : toolId;

    if (schema) {
      return {
        type: 'function',
        function: {
          name: formatToolId,
          description,
          parameters: schema
        }
      };
    }

    return {
      type: 'function',
      function: {
        name: formatToolId,
        description,
        parameters: nodeInputs2JsonSchema({ inputs: toolParams })
      }
    };
  };

  return Promise.all(
    tools.map<Promise<SubAppInitType[]>>(async (tool) => {
      try {
        const { pluginId, authAppId, source } = splitCombineToolId(tool.id);
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
              source,
              pluginId,
              app: authResult?.app,
              toolId: tool.id
            })
          )
        ]);
        const authApp = authResult?.app;

        // 合并用户在 Agent 工具面板里保存的配置；false/0/空字符串也是有效配置值。
        toolNode.inputs.forEach((input) => {
          if (Object.prototype.hasOwnProperty.call(tool.config, input.key)) {
            const value = tool.config[input.key];
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
          if (source === AppToolSourceEnum.commercial) {
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
        const promptReference = {
          id: tool.id,
          name: toolNode.name
        };
        const buildSubApp = (child: RuntimeNodeItemType, id = child.nodeId): SubAppInitType => ({
          type: 'tool',
          id,
          name: child.name,
          avatar: child.avatar,
          version: child.version,
          toolConfig: child.toolConfig,
          promptReference,
          params: tool.config,
          requestSchema: formatSchema({
            toolId: id,
            inputs: child.inputs,
            flowNodeType: child.flowNodeType,
            name: child.name,
            toolDescription: child.toolDescription,
            intro: child.intro,
            jsonSchema: child.jsonSchema
          })
        });

        if (toolNode.flowNodeType === FlowNodeTypeEnum.toolSet) {
          const systemToolId = toolNode.toolConfig?.systemToolSet?.toolId;
          const mcpToolsetVal = toolNode.toolConfig?.mcpToolSet ?? toolNode.inputs[0]?.value;
          const httpToolsetVal = toolNode.toolConfig?.httpToolSet;

          if (systemToolId) {
            // System toolset 的子工具由系统工具仓库展开，可能包含内置运行配置。
            const children = await getSystemToolRunTimeNodeFromSystemToolset({
              toolSetNode: {
                toolConfig: toolNode.toolConfig,
                inputs: toolNode.inputs,
                nodeId: pluginId,
                version: toolNode.version
              },
              lang
            });

            return children.map((child) => buildSubApp(child));
          } else if (mcpToolsetVal) {
            // MCP toolset 已在当前版本节点保存 toolList；展开时不再触发 DB 查询。
            const toolList: McpToolConfigType[] = mcpToolsetVal.toolList ?? [];

            const toolSetId = mcpToolsetVal.toolId || toolNode.pluginId || pluginId;
            const children = toolList.map((tool, index) => {
              const newToolNode = getMCPToolRuntimeNode({
                toolSetId,
                toolsetName: toolNode.name,
                nodeId: `${toolSetId}${index}`,
                avatar: toolNode.avatar,
                tool
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
          // OpenAI function name 不能包含斜杠等字符，runtime map 也使用同一份清洗后的 id。
          const cleanedPluginId = pluginId.replace(/[^a-zA-Z0-9_-]/g, '');

          return [
            {
              type: toolType,
              id: cleanedPluginId,
              name: toolNode.name,
              avatar: toolNode.avatar,
              version: toolNode.version,
              toolConfig: toolNode.toolConfig,
              promptReference,
              params: tool.config,
              requestSchema: formatSchema({
                toolId: cleanedPluginId,
                inputs: toolNode.inputs,
                flowNodeType: toolNode.flowNodeType,
                name: toolNode.name,
                toolDescription: toolNode.toolDescription,
                intro: toolNode.intro,
                jsonSchema: toolNode.jsonSchema
              })
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
