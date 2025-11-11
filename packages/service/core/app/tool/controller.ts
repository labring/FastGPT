import type {
  NodeToolConfigType,
  FlowNodeTemplateType
} from '@fastgpt/global/core/workflow/type/node.d';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  appData2FlowNodeIO,
  pluginData2FlowNodeIO,
  toolData2FlowNodeIO,
  toolSetData2FlowNodeIO
} from '@fastgpt/global/core/workflow/utils';
import { MongoApp } from '../schema';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { WorkflowTemplateBasicType } from '@fastgpt/global/core/workflow/type';
import {
  checkIsLatestVersion,
  getAppLatestVersion,
  getAppVersionById
} from '../version/controller';
import type {
  AppToolRuntimeType,
  AppToolTemplateItemType
} from '@fastgpt/global/core/app/tool/type';
import { MongoSystemTool } from '../../plugin/tool/systemToolSchema';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum
} from '@fastgpt/global/core/workflow/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { APIGetSystemToolList } from './api';
import { Types } from '../../../common/mongo';
import type { SystemPluginToolCollectionType } from '@fastgpt/global/core/plugin/tool/type';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import { Output_Template_Error_Message } from '@fastgpt/global/core/workflow/template/output';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import { getMCPToolRuntimeNode } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import { getHTTPToolRuntimeNode } from '@fastgpt/global/core/app/tool/httpTool/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getMCPChildren } from '../mcp';
import { cloneDeep } from 'lodash';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getCachedData } from '../../../common/cache';
import { SystemCacheKeyEnum } from '../../../common/cache/type';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { MongoTeamInstalledPlugin } from '../../plugin/schema/teamInstalledPluginSchema';

type ChildAppType = AppToolTemplateItemType & {
  teamId?: string;
  tmbId?: string;
  workflow?: WorkflowTemplateBasicType;
  versionLabel?: string; // Auto computed
  isLatestVersion?: boolean; // Auto computed
};

export const getSystemTools = () => getCachedData(SystemCacheKeyEnum.systemTool);

export const getSystemToolsWithInstalled = async ({
  teamId,
  isRoot
}: {
  teamId: string;
  isRoot: boolean;
}) => {
  const [tools, { installedSet, uninstalledSet }] = await Promise.all([
    getSystemTools(),
    MongoTeamInstalledPlugin.find({ teamId, pluginType: 'tool' }, 'pluginId installed')
      .lean()
      .then((res) => {
        const installedSet = new Set<string>();
        const uninstalledSet = new Set<string>();
        res.forEach((item) => {
          if (item.installed) {
            installedSet.add(item.pluginId);
          } else {
            uninstalledSet.add(item.pluginId);
          }
        });
        return { installedSet, uninstalledSet };
      })
  ]);

  return tools.map((tool) => {
    const installed = (() => {
      if (installedSet.has(tool.id)) {
        return true;
      }
      if (isRoot && !uninstalledSet.has(tool.id)) {
        return true;
      }
      if (tool.defaultInstalled && !uninstalledSet.has(tool.id)) {
        return true;
      }
      return false;
    })();

    return {
      ...tool,
      installed
    };
  });
};

export const getSystemToolByIdAndVersionId = async (
  pluginId: string,
  versionId?: string
): Promise<ChildAppType> => {
  const tool = await getSystemToolById(pluginId);

  // App type system tool
  if (tool.associatedPluginId) {
    // The verification tool is set as a system tool
    const systemPlugin = await MongoSystemTool.findOne(
      { pluginId: tool.id, 'customConfig.associatedPluginId': tool.associatedPluginId },
      'associatedPluginId'
    ).lean();
    if (!systemPlugin) return Promise.reject(PluginErrEnum.unExist);

    const app = await MongoApp.findById(tool.associatedPluginId).lean();
    if (!app) return Promise.reject(PluginErrEnum.unExist);

    const version = versionId
      ? await getAppVersionById({
          appId: tool.associatedPluginId,
          versionId,
          app
        })
      : await getAppLatestVersion(tool.associatedPluginId, app);
    if (!version.versionId) return Promise.reject(new UserError('App version not found'));
    const isLatest = version.versionId
      ? await checkIsLatestVersion({
          appId: tool.associatedPluginId,
          versionId: version.versionId
        })
      : true;

    return {
      ...tool,
      workflow: {
        nodes: version.nodes,
        edges: version.edges,
        chatConfig: version.chatConfig
      },
      version: versionId ? version?.versionId : '',
      versionLabel: version?.versionName,
      isLatestVersion: isLatest,
      teamId: String(app.teamId),
      tmbId: String(app.tmbId)
    };
  }

  // System toolset
  if (tool.isFolder) {
    return {
      ...tool,
      inputs: [],
      outputs: [],
      inputList: tool.inputList,
      version: '',
      isLatestVersion: true
    };
  }

  // System tool
  const versionList = (tool.versionList as AppToolTemplateItemType['versionList']) || [];

  if (versionList.length === 0) {
    return Promise.reject(new UserError('Can not find tool version list'));
  }

  const version = versionId
    ? versionList.find((item) => item.value === versionId) ?? versionList[0]
    : versionList[0];
  const lastVersion = versionList[0];

  // concat parent (if exists) input config
  const parent = tool.parentId ? await getSystemToolById(tool.parentId) : undefined;
  if (parent?.inputList) {
    version?.inputs?.unshift({
      key: NodeInputKeyEnum.systemInputConfig,
      label: '',
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      inputList: parent.inputList
    });
  }

  return {
    ...tool,
    inputs: version.inputs ?? [],
    outputs: version.outputs ?? [],
    version: versionId ? version?.value : '',
    versionLabel: versionId ? version?.value : '',
    isLatestVersion: !version || !lastVersion || version.value === lastVersion?.value
  };
};

/*
  Format plugin to workflow preview node data
  Persion workflow/plugin: objectId
  Persion mcptoolset: objectId
  Persion mcp tool: mcp-parentId/name
  System tool/toolset: system-toolId
*/
export async function getChildAppPreviewNode({
  appId,
  versionId,
  lang = 'en'
}: {
  appId: string;
  versionId?: string;
  lang?: localeType;
}): Promise<FlowNodeTemplateType> {
  const { source, pluginId } = splitCombineToolId(appId);

  const app: ChildAppType = await (async () => {
    // 1. App
    // 2. MCP ToolSets
    if (source === AppToolSourceEnum.personal) {
      const item = await MongoApp.findById(pluginId).lean();
      if (!item) return Promise.reject(PluginErrEnum.unExist);

      const version = await getAppVersionById({ appId: pluginId, versionId, app: item });

      const isLatest =
        version.versionId && Types.ObjectId.isValid(version.versionId)
          ? await checkIsLatestVersion({
              appId: pluginId,
              versionId: version.versionId
            })
          : true;

      if (item.type === AppTypeEnum.mcpToolSet) {
        const children = await getMCPChildren(item);
        version.nodes[0].toolConfig = {
          mcpToolSet: {
            toolId: pluginId,
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
              tool: {
                description: tool.description,
                inputSchema: tool.inputSchema,
                name: tool.name
              },
              avatar: item.avatar,
              parentId: item._id
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
              tool: {
                description: tool.description,
                inputSchema: tool.inputSchema,
                outputSchema: tool.outputSchema,
                name: `${item.name}/${tool.name}`
              },
              avatar: item.avatar,
              parentId: item._id
            })
          ],
          edges: []
        },
        version: '',
        isLatestVersion: true
      };
    }
    // 1. System Tools
    // 2. System Plugins configured in Pro (has associatedPluginId)
    else {
      return getSystemToolByIdAndVersionId(pluginId, versionId);
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
    if (source === AppToolSourceEnum.systemTool) {
      // system Tool or Toolsets
      const children = app.isFolder
        ? (await getSystemTools()).filter((item) => item.parentId === pluginId)
        : [];

      return {
        flowNodeType: app.isFolder ? FlowNodeTypeEnum.toolSet : FlowNodeTypeEnum.tool,
        nodeIOConfig: {
          inputs: [
            ...(app.inputList
              ? [
                  {
                    key: NodeInputKeyEnum.systemInputConfig,
                    label: '',
                    renderTypeList: [FlowNodeInputTypeEnum.hidden],
                    inputList: app.inputList
                  }
                ]
              : []),
            ...(app.inputs ?? [])
          ],
          outputs: app.outputs ?? [],
          toolConfig: {
            ...(app.isFolder
              ? {
                  systemToolSet: {
                    toolId: app.id,
                    toolList: children
                      .filter((item) => item.status === 1 || item.status === undefined)
                      .map((item) => ({
                        toolId: item.id,
                        name: parseI18nString(item.name, lang),
                        description: parseI18nString(item.intro, lang)
                      }))
                  }
                }
              : { systemTool: { toolId: app.id } })
          },
          showSourceHandle: app.isFolder ? false : true,
          showTargetHandle: app.isFolder ? false : true
        }
      };
    }

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
    templateType: app.templateType ?? FlowNodeTemplateTypeEnum.tools,
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

/**
  Get runtime plugin data
  System plugin: plugin id
  Personal plugin: Version id
*/
export async function getChildAppRuntimeById({
  id,
  versionId,
  lang = 'en'
}: {
  id: string;
  versionId?: string;
  lang?: localeType;
}): Promise<AppToolRuntimeType> {
  const app = await (async () => {
    const { source, pluginId } = splitCombineToolId(id);

    if (source === AppToolSourceEnum.personal) {
      const item = await MongoApp.findById(pluginId).lean();
      if (!item) return Promise.reject(PluginErrEnum.unExist);

      const version = await getAppVersionById({
        appId: pluginId,
        versionId,
        app: item
      });

      return {
        id: String(item._id),
        teamId: String(item.teamId),
        tmbId: String(item.tmbId),
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

        originCost: 0,
        currentCost: 0,
        systemKeyCost: 0,
        hasTokenFee: false,
        pluginOrder: 0
      };
    } else {
      return getSystemToolByIdAndVersionId(pluginId, versionId);
    }
  })();

  return {
    id: app.id,
    teamId: app.teamId,
    tmbId: app.tmbId,
    name: parseI18nString(app.name, lang),
    avatar: app.avatar || '',
    showStatus: true,
    currentCost: app.currentCost,
    systemKeyCost: app.systemKeyCost,
    nodes: app.workflow.nodes,
    edges: app.workflow.edges,
    hasTokenFee: app.hasTokenFee
  };
}

/* FastsGPT-tool api: */
export const refreshSystemTools = async (): Promise<AppToolTemplateItemType[]> => {
  const workflowToolFormat = (item: SystemPluginToolCollectionType): AppToolTemplateItemType => {
    const {
      name,
      avatar,
      intro,
      toolDescription,
      version,
      associatedPluginId,
      userGuide,
      author = '',
      tags
    } = item.customConfig!;

    return {
      id: item.pluginId,
      status: item.status ?? PluginStatusEnum.Normal,
      defaultInstalled: item.defaultInstalled ?? false,
      isFolder: false,
      parentId: null,
      author,
      version,
      name,
      avatar,
      intro,
      toolDescription,
      tags,
      templateType: FlowNodeTemplateTypeEnum.tools,
      originCost: item.originCost,
      currentCost: item.currentCost,
      hasTokenFee: item.hasTokenFee,
      pluginOrder: item.pluginOrder,
      systemKeyCost: item.systemKeyCost,
      associatedPluginId,
      userGuide,
      workflow: {
        nodes: [],
        edges: []
      }
    };
  };

  const tools = await APIGetSystemToolList();

  // 从数据库里加载插件配置进行替换
  const systemToolsArray = await MongoSystemTool.find({}).lean();
  const systemTools = new Map(systemToolsArray.map((plugin) => [plugin.pluginId, plugin]));

  const formatTools = tools.map<AppToolTemplateItemType>((item) => {
    const dbPluginConfig = systemTools.get(item.id);
    const isFolder = tools.some((tool) => tool.parentId === item.id);

    const versionList = (item.versionList as AppToolTemplateItemType['versionList']) || [];

    return {
      id: item.id,
      parentId: item.parentId,
      isFolder,
      name: item.name,
      avatar: item.avatar,
      intro: item.description,
      toolDescription: item.toolDescription,
      author: item.author,
      courseUrl: item.courseUrl,
      instructions: dbPluginConfig?.customConfig?.userGuide,
      tags: item.tags,
      workflow: {
        nodes: [],
        edges: []
      },
      versionList,
      showStatus: true,
      status: dbPluginConfig?.status ?? 1,
      defaultInstalled: dbPluginConfig?.defaultInstalled ?? false,
      inputList: item?.secretInputConfig,
      hasSystemSecret: !!dbPluginConfig?.inputListVal,

      originCost: dbPluginConfig?.originCost ?? 0,
      currentCost: dbPluginConfig?.currentCost ?? 0,
      systemKeyCost: dbPluginConfig?.systemKeyCost ?? 0,
      hasTokenFee: dbPluginConfig?.hasTokenFee ?? false,
      pluginOrder: dbPluginConfig?.pluginOrder
    };
  });

  const dbPlugins = systemToolsArray
    .filter((item) => item.customConfig?.associatedPluginId)
    .map((item) => workflowToolFormat(item));

  const concatTools = [...formatTools, ...dbPlugins];
  concatTools.sort((a, b) => (a.pluginOrder ?? 999) - (b.pluginOrder ?? 999));

  return concatTools;
};

export const getSystemToolById = async (id: string): Promise<AppToolTemplateItemType> => {
  const { pluginId } = splitCombineToolId(id);
  const tools = await getSystemTools();
  const tool = tools.find((item) => item.id === pluginId);
  if (tool) {
    return cloneDeep(tool);
  }
  return Promise.reject(PluginErrEnum.unExist);
};
