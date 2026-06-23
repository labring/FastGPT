import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  jsonSchema2NodeInput,
  jsonSchema2NodeOutput,
  jsonSchema2SecretInput
} from '@fastgpt/global/core/app/jsonschema';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { getHTTPToolRuntimeNode } from '@fastgpt/global/core/app/tool/httpTool/utils';
import { getMCPToolRuntimeNode } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import {
  getToolNameCandidates,
  splitCombineToolId,
  splitToolsetToolPluginId
} from '@fastgpt/global/core/app/tool/utils';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeInputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { Output_Template_Error_Message } from '@fastgpt/global/core/workflow/template/output';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import type {
  FlowNodeTemplateType,
  NodeToolConfigType
} from '@fastgpt/global/core/workflow/type/node';
import {
  pluginData2FlowNodeIO,
  toolSetData2FlowNodeIO,
  toolData2FlowNodeIO,
  appData2FlowNodeIO
} from '@fastgpt/global/core/workflow/utils';
import { Types } from 'mongoose';
import { getMCPChildren } from '../../mcp';
import { MongoApp } from '../../schema';
import { getAppVersionById, checkIsLatestVersion } from '../../version/controller';
import { SystemToolRepo } from '../systemTool/systemTool.repo';
import type {
  WorkflowTemplateBasicType,
  WorkflowTemplateType
} from '@fastgpt/global/core/workflow/type';
import type { PluginStatusType } from '@fastgpt/global/core/plugin/type';
import type { UserTagsType } from '@fastgpt/global/support/user/type';

type AppToolType = WorkflowTemplateType & {
  status?: PluginStatusType;
  // FastGPT-plugin tool
  inputs?: FlowNodeInputItemType[];
  outputs?: FlowNodeOutputItemType[];

  // Admin workflow tool
  associatedPluginId?: string;
  userGuide?: string;
  readmeUrl?: string;

  // commercial plugin config
  originCost?: number; // n points/one time
  currentCost?: number;
  systemKeyCost?: number;
  hasTokenFee?: boolean;
  pluginOrder?: number;

  tags?: string[] | null;
  isOfficial?: boolean;

  // Admin config
  inputList?: FlowNodeInputItemType['inputList'];
  inputListVal?: Record<string, any>;
  hasSystemSecret?: boolean;

  // User tag filtering
  hideTags?: UserTagsType[] | null;
  promoteTags?: UserTagsType[] | null;

  /** @deprecated */
  isActive?: boolean; //use tags instead
  /** @deprecated */
  templateType?: string;
} & {
  teamId?: string;
  tmbId?: string;
  workflow?: WorkflowTemplateBasicType;
  versionLabel?: string; // Auto computed
  isLatestVersion?: boolean; // Auto computed
};

const omitRuntimeJsonSchemaField = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => omitRuntimeJsonSchemaField(item)) as T;
  }

  if (!value || typeof value !== 'object') return value;

  const { jsonSchema, ...rest } = value as Record<string, any>;

  return Object.fromEntries(
    Object.entries(rest).map(([key, item]) => [key, omitRuntimeJsonSchemaField(item)])
  ) as T;
};

const omitClientPreviewSchemaFields = <T extends Record<string, any>>(value: T): T => {
  const { inputSchema, outputSchema, secretSchema, ...rest } = value;
  return omitRuntimeJsonSchemaField(rest) as T;
};

/**
 * 构建返回给客户端的系统工具预览节点。
 *
 * 该节点只用于前端 UI 展示、工具选择和插入画布；服务端会用 JSON Schema
 * 转成节点 IO，但响应中不携带原始 schema，避免把运行时契约混进客户端预览数据。
 */
export async function getClientSystemToolPreviewNode({
  pluginId,
  versionId,
  getLatestVersion,
  lang = 'en',
  source: toolSource = 'system'
}: {
  pluginId: string;
  versionId?: string;
  getLatestVersion?: boolean;
  lang?: localeType;
  source?: string;
}): Promise<FlowNodeTemplateType> {
  const systemToolRepo = SystemToolRepo.getInstance();
  const toolDetail = await systemToolRepo.getSystemToolDetail({
    pluginId,
    version: versionId || undefined,
    lang,
    source: toolSource
  });
  const shouldReturnVersion = versionId ? true : versionId === undefined && getLatestVersion;
  const secrets = jsonSchema2SecretInput({ jsonSchema: toolDetail.secretSchema });
  const schemaInputs = jsonSchema2NodeInput({
    jsonSchema: toolDetail.inputSchema,
    schemaType: 'systemTool'
  });
  const schemaOutputs = jsonSchema2NodeOutput({ jsonSchema: toolDetail.outputSchema });

  const inputs = [
    ...(secrets?.length
      ? [
          {
            key: NodeInputKeyEnum.systemInputConfig,
            label: '',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            inputList: secrets
          }
        ]
      : []),
    ...schemaInputs
  ];
  const isWorkflowTool = !!toolDetail.associatedPluginId;

  return {
    id: getNanoid(),
    pluginId: pluginId,
    flowNodeType: isWorkflowTool
      ? FlowNodeTypeEnum.pluginModule
      : toolDetail.isToolSet
        ? FlowNodeTypeEnum.toolSet
        : FlowNodeTypeEnum.tool,
    avatar: toolDetail.avatar,
    name: toolDetail.name,
    intro: toolDetail.intro,
    toolDescription: toolDetail.toolDescription,
    courseUrl: toolDetail.courseUrl,
    readmeUrl: toolDetail.readmeUrl,
    userGuide: toolDetail.userGuide ?? undefined,
    showStatus: true,
    isTool: true,
    catchError: false,

    version: shouldReturnVersion ? toolDetail.version : '',
    versionLabel: shouldReturnVersion ? (toolDetail.versionLabel ?? toolDetail.version) : undefined,
    isLatestVersion: toolDetail.isLatestVersion,
    showSourceHandle: true,
    showTargetHandle: true,

    currentCost: toolDetail.currentCost,
    systemKeyCost: toolDetail.systemKeyCost,
    hasTokenFee: toolDetail.hasTokenFee,
    hasSystemSecret: toolDetail.hasSystemSecret,
    isFolder: !isWorkflowTool && toolDetail.isToolSet,
    status: toolDetail.status,
    inputs,

    outputs: schemaOutputs
      ? schemaOutputs.some((item) => item.type === FlowNodeOutputTypeEnum.error)
        ? schemaOutputs
        : [...schemaOutputs, Output_Template_Error_Message]
      : [],

    ...(isWorkflowTool
      ? {}
      : {
          toolConfig: {
            ...(toolDetail.isToolSet
              ? {
                  systemToolSet: {
                    toolId: pluginId,
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
                    toolId: pluginId
                  }
                })
          }
        })
  } satisfies FlowNodeTemplateType;
}

/**
 * 构建返回给客户端的工具预览节点。
 *
 * 该结果只用于前端 UI 展示、工具选择和插入画布。运行时 JSON Schema 只在服务端
 * 内部用于转换节点 IO，返回前会被裁剪，避免客户端依赖执行阶段的 schema contract。
 */
export async function getClientToolPreviewNode({
  appId,
  versionId,
  getLatestVersion,
  lang = 'en',
  source: toolSource = 'system'
}: {
  appId: string;
  versionId?: string;
  getLatestVersion?: boolean;
  lang?: localeType;
  source?: string;
}): Promise<FlowNodeTemplateType> {
  const { source, pluginId } = splitCombineToolId(appId);

  const data = await (async () => {
    if (source === AppToolSourceEnum.systemTool || source === AppToolSourceEnum.commercial) {
      return getClientSystemToolPreviewNode({
        pluginId: appId,
        versionId,
        getLatestVersion,
        lang,
        source: source === AppToolSourceEnum.commercial ? AppToolSourceEnum.commercial : toolSource
      });
    }

    // 存在 app 里面的插件的情况
    const app: AppToolType = await (async () => {
      // App / Mcp toolset / Http toolset
      if (source === AppToolSourceEnum.personal) {
        const item = await MongoApp.findById(pluginId).lean();
        if (!item) return Promise.reject(PluginErrEnum.unExist);
        if (AppFolderTypeList.includes(item.type)) return Promise.reject(PluginErrEnum.unExist);

        const version = await getAppVersionById({
          appId: pluginId,
          versionId: versionId || undefined,
          app: item
        });

        const isLatest =
          version.versionId && Types.ObjectId.isValid(version.versionId)
            ? await checkIsLatestVersion({
                appId: pluginId,
                versionId: version.versionId
              })
            : true;

        // Adapt
        if (item.type === AppTypeEnum.mcpToolSet && !version.nodes[0].toolConfig) {
          const children = await getMCPChildren(item);
          version.nodes[0].toolConfig = {
            mcpToolSet: {
              toolList: children,
              url: '',
              headerSecret: {}
            }
          };
        }

        const shouldReturnVersion = versionId ? true : versionId === undefined && getLatestVersion;

        return {
          id: String(item._id),
          teamId: String(item.teamId),
          name: item.name,
          avatar: item.avatar,
          intro: item.intro,
          showStatus: true,
          workflow: {
            nodes: version.nodes,
            edges: version.edges,
            chatConfig: version.chatConfig
          },
          templateType: FlowNodeTemplateTypeEnum.teamApp,

          version: shouldReturnVersion ? (version.versionId ?? '') : '',
          versionLabel: shouldReturnVersion ? version.versionName : undefined,
          isLatestVersion: isLatest,

          originCost: 0,
          currentCost: 0,
          hasTokenFee: false,
          pluginOrder: 0
        };
      }
      // mcp tool
      else if (source === AppToolSourceEnum.mcp) {
        const { parentId, toolName } = splitToolsetToolPluginId(pluginId);
        // 1. get parentApp
        const item = await MongoApp.findById(parentId).lean();
        if (!item) return Promise.reject(PluginErrEnum.unExist);

        const version = await getAppVersionById({
          appId: parentId,
          versionId: versionId || undefined,
          app: item
        });
        const toolConfig = version.nodes[0].toolConfig?.mcpToolSet;
        const tool = await (async () => {
          const matchTool = <T extends { name: string }>(tools: T[]) =>
            getToolNameCandidates(toolName)
              .map((name) => tools.find((item) => item.name === name))
              .find(Boolean);

          if (toolConfig?.toolList) {
            // new mcp toolset
            return matchTool(toolConfig.toolList);
          }
          // old mcp toolset
          return matchTool(await getMCPChildren(item));
        })();
        if (!tool) return Promise.reject(PluginErrEnum.unExist);
        return {
          avatar: item.avatar,
          id: appId,
          name: tool.name,
          templateType: FlowNodeTemplateTypeEnum.tools,
          workflow: {
            nodes: [
              getMCPToolRuntimeNode({
                nodeId: getNanoid(6),
                toolSetId: item._id,
                toolsetName: item.name,
                avatar: item.avatar,
                tool: {
                  description: tool.description,
                  inputSchema: tool.inputSchema,
                  name: tool.name
                }
              })
            ],
            edges: []
          },
          version: '',
          isLatestVersion: true
        };
      }
      // http tool
      else if (source === AppToolSourceEnum.http) {
        const { parentId, toolName } = splitToolsetToolPluginId(pluginId);
        const item = await MongoApp.findById(parentId).lean();
        if (!item) return Promise.reject(PluginErrEnum.unExist);

        const version = await getAppVersionById({
          appId: parentId,
          versionId: versionId || undefined,
          app: item
        });
        const toolConfig = version.nodes[0].toolConfig?.httpToolSet;
        const tool = await (async () => {
          if (toolConfig?.toolList) {
            return getToolNameCandidates(toolName)
              .map((name) => toolConfig.toolList.find((item) => item.name === name))
              .find(Boolean);
          }
          return undefined;
        })();
        if (!tool) return Promise.reject(PluginErrEnum.unExist);
        return {
          avatar: item.avatar,
          id: appId,
          name: tool.name,
          templateType: FlowNodeTemplateTypeEnum.tools,
          workflow: {
            nodes: [
              getHTTPToolRuntimeNode({
                nodeId: getNanoid(6),
                toolSetId: item._id,
                toolsetName: item.name,
                tool: {
                  description: tool.description,
                  inputSchema: tool.inputSchema,
                  outputSchema: tool.outputSchema,
                  name: tool.name
                },
                avatar: item.avatar
              })
            ],
            edges: []
          },
          version: '',
          isLatestVersion: true
        };
      }
      // System Tools/ Commercial system tools
      else {
        return Promise.reject('unknown tool source');
      }
    })();

    const { flowNodeType, nodeIOConfig } = await (async (): Promise<{
      flowNodeType: FlowNodeTypeEnum;
      nodeIOConfig: {
        inputs: FlowNodeInputItemType[];
        outputs: FlowNodeOutputItemType[];
        toolConfig?: NodeToolConfigType;
        showSourceHandle?: boolean;
        showTargetHandle?: boolean;
      };
    }> => {
      // Plugin workflow
      if (!!app.workflow.nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput)) {
        // plugin app
        return {
          flowNodeType: FlowNodeTypeEnum.pluginModule,
          nodeIOConfig: pluginData2FlowNodeIO({ nodes: app.workflow.nodes })
        };
      }

      // Mcp
      if (
        !!app.workflow.nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.toolSet) &&
        app.workflow.nodes.length === 1
      ) {
        // mcp tools
        return {
          flowNodeType: FlowNodeTypeEnum.toolSet,
          nodeIOConfig: toolSetData2FlowNodeIO({ nodes: app.workflow.nodes })
        };
      }

      if (
        !!app.workflow.nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.tool) &&
        app.workflow.nodes.length === 1
      ) {
        return {
          flowNodeType: FlowNodeTypeEnum.tool,
          nodeIOConfig: toolData2FlowNodeIO({ nodes: app.workflow.nodes })
        };
      }

      // Chat workflow
      return {
        flowNodeType: FlowNodeTypeEnum.appModule,
        nodeIOConfig: appData2FlowNodeIO({ chatConfig: app.workflow.chatConfig })
      };
    })();

    return {
      id: getNanoid(),
      pluginId: app.id,
      flowNodeType,
      avatar: app.avatar,
      name: parseI18nString(app.name, lang),
      intro: parseI18nString(app.intro, lang),
      toolDescription: app.toolDescription,
      courseUrl: app.courseUrl,
      userGuide: app.userGuide,
      showStatus: true,
      isTool: true,
      catchError: false,

      version: app.version,
      versionLabel: app.versionLabel,
      isLatestVersion: app.isLatestVersion,
      showSourceHandle: true,
      showTargetHandle: true,

      currentCost: app.currentCost,
      systemKeyCost: app.systemKeyCost,
      hasTokenFee: app.hasTokenFee,
      hasSystemSecret: app.hasSystemSecret,
      isFolder: app.isFolder,
      status: app.status,

      ...nodeIOConfig,
      outputs: nodeIOConfig.outputs.some((item) => item.type === FlowNodeOutputTypeEnum.error)
        ? nodeIOConfig.outputs
        : [...nodeIOConfig.outputs, Output_Template_Error_Message]
    };
  })();

  return omitClientPreviewSchemaFields(data);
}
