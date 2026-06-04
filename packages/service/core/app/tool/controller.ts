import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { getHTTPToolRuntimeNode } from '@fastgpt/global/core/app/tool/httpTool/utils';
import { getMCPToolRuntimeNode } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeTypeEnum,
  FlowNodeOutputTypeEnum
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
import { getMCPChildren } from '../mcp';
import { MongoApp } from '../schema';
import { getAppVersionById, checkIsLatestVersion } from '../version/controller';
import { getToolPreviewNode } from './presenter';
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

export async function getChildAppPreviewNode({
  appId,
  versionId,
  lang = 'en',
  source: toolSource = 'system'
}: {
  appId: string;
  versionId?: string;
  lang?: localeType;
  source?: string;
}): Promise<FlowNodeTemplateType> {
  const { source, pluginId } = splitCombineToolId(appId);

  if (source === AppToolSourceEnum.systemTool || source === AppToolSourceEnum.commercial) {
    return getToolPreviewNode({ pluginId: appId, versionId, lang, source: toolSource });
  }

  // 存在 app 里面的插件的情况
  const app: AppToolType = await (async () => {
    // App / Mcp toolset / Http toolset
    if (source === AppToolSourceEnum.personal) {
      const item = await MongoApp.findById(pluginId).lean();
      if (!item) return Promise.reject(PluginErrEnum.unExist);
      if (AppFolderTypeList.includes(item.type)) return Promise.reject(PluginErrEnum.unExist);

      const version = await getAppVersionById({ appId: pluginId, versionId, app: item });

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

        version: versionId ? version?.versionId : '',
        versionLabel: version?.versionName,
        isLatestVersion: isLatest,

        originCost: 0,
        currentCost: 0,
        hasTokenFee: false,
        pluginOrder: 0
      };
    }
    // mcp tool
    else if (source === AppToolSourceEnum.mcp) {
      const [parentId, toolName] = pluginId.split('/');
      // 1. get parentApp
      const item = await MongoApp.findById(parentId).lean();
      if (!item) return Promise.reject(PluginErrEnum.unExist);

      const version = await getAppVersionById({ appId: parentId, versionId, app: item });
      const toolConfig = version.nodes[0].toolConfig?.mcpToolSet;
      const tool = await (async () => {
        if (toolConfig?.toolList) {
          // new mcp toolset
          return toolConfig.toolList.find((item) => item.name === toolName);
        }
        // old mcp toolset
        return (await getMCPChildren(item)).find((item) => item.name === toolName);
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
      const [parentId, toolName] = pluginId.split('/');
      const item = await MongoApp.findById(parentId).lean();
      if (!item) return Promise.reject(PluginErrEnum.unExist);

      const version = await getAppVersionById({ appId: parentId, versionId, app: item });
      const toolConfig = version.nodes[0].toolConfig?.httpToolSet;
      const tool = await (async () => {
        if (toolConfig?.toolList) {
          return toolConfig.toolList.find((item) => item.name === toolName);
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
}
