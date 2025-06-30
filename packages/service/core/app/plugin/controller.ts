import { type FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node.d';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
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
import { type SystemPluginTemplateItemType } from '@fastgpt/global/core/app/plugin/type';
import {
  checkIsLatestVersion,
  getAppLatestVersion,
  getAppVersionById
} from '../version/controller';
import { type PluginRuntimeType } from '@fastgpt/global/core/app/plugin/type';
import { MongoSystemPlugin } from './systemPluginSchema';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { PluginSourceEnum } from '@fastgpt/global/core/app/plugin/constants';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum
} from '@fastgpt/global/core/workflow/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getSystemToolList } from '../tool/api';
import { Types } from '../../../common/mongo';
import type { SystemPluginConfigSchemaType } from './type';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import { isProduction } from '@fastgpt/global/common/system/constants';

/**
  plugin id rule:
  - personal: ObjectId
  - commercial: commercial-ObjectId
  - systemtool: systemTool-id
  (deprecated) community: community-id
*/
export function splitCombinePluginId(id: string) {
  const splitRes = id.split('-');
  if (splitRes.length === 1) {
    // app id
    return {
      source: PluginSourceEnum.personal,
      pluginId: id
    };
  }

  const [source, pluginId] = id.split('-') as [PluginSourceEnum, string | undefined];
  if (!source || !pluginId) throw new Error('pluginId not found');

  // 兼容4.10.0 之前的插件
  if (source === 'community' || id === 'commercial-dalle3') {
    return {
      source: PluginSourceEnum.systemTool,
      pluginId: `${PluginSourceEnum.systemTool}-${pluginId}`
    };
  }

  return { source, pluginId: id };
}

type ChildAppType = SystemPluginTemplateItemType & {
  teamId?: string;
  tmbId?: string;
  workflow?: WorkflowTemplateBasicType;
  versionLabel?: string; // Auto computed
  isLatestVersion?: boolean; // Auto computed
};

export const getSystemPluginByIdAndVersionId = async (
  pluginId: string,
  versionId?: string
): Promise<ChildAppType> => {
  const plugin = await (async (): Promise<ChildAppType> => {
    const plugin = await getSystemPluginById(pluginId);

    // Admin selected system tool
    if (plugin.associatedPluginId) {
      // The verification plugin is set as a system plugin
      const systemPlugin = await MongoSystemPlugin.findOne(
        { pluginId: plugin.id, 'customConfig.associatedPluginId': plugin.associatedPluginId },
        'associatedPluginId'
      ).lean();
      if (!systemPlugin) return Promise.reject(PluginErrEnum.unExist);

      const app = await MongoApp.findById(plugin.associatedPluginId).lean();
      if (!app) return Promise.reject(PluginErrEnum.unExist);

      const version = versionId
        ? await getAppVersionById({
            appId: plugin.associatedPluginId,
            versionId,
            app
          })
        : await getAppLatestVersion(plugin.associatedPluginId, app);
      if (!version.versionId) return Promise.reject('App version not found');
      const isLatest = version.versionId
        ? await checkIsLatestVersion({
            appId: plugin.associatedPluginId,
            versionId: version.versionId
          })
        : true;

      return {
        ...plugin,
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

    const version = versionId
      ? plugin.versionList?.find((item) => item.value === versionId)
      : plugin.versionList?.[0];
    const lastVersion = plugin.versionList?.[0];

    return {
      ...plugin,
      version: versionId ? version?.value : '',
      versionLabel: version ? version?.value : '',
      isLatestVersion: !version || !lastVersion || version.value === lastVersion?.value
    };
  })();

  return plugin;
};

/* Format plugin to workflow preview node data */
export async function getChildAppPreviewNode({
  appId,
  versionId,
  lang = 'en'
}: {
  appId: string;
  versionId?: string;
  lang?: localeType;
}): Promise<FlowNodeTemplateType> {
  const { source, pluginId } = splitCombinePluginId(appId);

  const app: ChildAppType = await (async () => {
    if (source === PluginSourceEnum.personal) {
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
    } else {
      return getSystemPluginByIdAndVersionId(pluginId, versionId);
    }
  })();

  const { flowNodeType, nodeIOConfig } = await (async () => {
    if (source === PluginSourceEnum.systemTool) {
      return {
        flowNodeType: FlowNodeTypeEnum.tool,
        nodeIOConfig: {
          inputs: app.inputs!,
          outputs: app.outputs!,
          toolConfig: {
            systemTool: {
              toolId: app.id
            }
          }
        }
      };
    }

    if (!!app.workflow.nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput)) {
      return {
        flowNodeType: FlowNodeTypeEnum.pluginModule,
        nodeIOConfig: pluginData2FlowNodeIO({ nodes: app.workflow.nodes })
      };
    }

    if (
      !!app.workflow.nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.toolSet) &&
      app.workflow.nodes.length === 1
    ) {
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

    return {
      flowNodeType: FlowNodeTypeEnum.appModule,
      nodeIOConfig: appData2FlowNodeIO({ chatConfig: app.workflow.chatConfig })
    };
  })();

  return {
    id: getNanoid(),
    pluginId: app.id,
    templateType: app.templateType,
    flowNodeType,
    avatar: app.avatar,
    name: parseI18nString(app.name, lang),
    intro: parseI18nString(app.intro, lang),
    courseUrl: app.courseUrl,
    userGuide: app.userGuide,
    showStatus: true,
    isTool: true,

    version: app.version,
    versionLabel: app.versionLabel,
    isLatestVersion: app.isLatestVersion,
    showSourceHandle: true,
    showTargetHandle: true,

    currentCost: app.currentCost,
    hasTokenFee: app.hasTokenFee,
    hasSystemSecret: app.hasSystemSecret,

    ...nodeIOConfig
  };
}

/**
  Get runtime plugin data
  System plugin: plugin id
  Personal plugin: Version id
*/
export async function getChildAppRuntimeById(
  id: string,
  versionId?: string,
  lang: localeType = 'en'
): Promise<PluginRuntimeType> {
  const app = await (async () => {
    const { source, pluginId } = splitCombinePluginId(id);

    if (source === PluginSourceEnum.personal) {
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
        hasTokenFee: false,
        pluginOrder: 0
      };
    } else {
      return getSystemPluginByIdAndVersionId(pluginId, versionId);
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
    nodes: app.workflow.nodes,
    edges: app.workflow.edges,
    hasTokenFee: app.hasTokenFee
  };
}

const dbPluginFormat = (item: SystemPluginConfigSchemaType): SystemPluginTemplateItemType => {
  const { name, avatar, intro, version, weight, templateType, associatedPluginId, userGuide } =
    item.customConfig!;

  return {
    id: item.pluginId,
    isActive: item.isActive,
    isFolder: false,
    parentId: null,
    author: item.customConfig?.author || '',
    version,
    name,
    avatar,
    intro,
    weight,
    templateType,
    originCost: item.originCost,
    currentCost: item.currentCost,
    hasTokenFee: item.hasTokenFee,
    pluginOrder: item.pluginOrder,
    associatedPluginId,
    userGuide,
    workflow: {
      nodes: [],
      edges: []
    }
  };
};

/* FastsGPT-Pluign api: */
function getCachedSystemPlugins() {
  if (!global.systemPlugins_cache) {
    global.systemPlugins_cache = {
      expires: 0,
      data: [] as SystemPluginTemplateItemType[]
    };
  }
  return global.systemPlugins_cache;
}

const cleanSystemPluginCache = () => {
  global.systemPlugins_cache = undefined;
};

export const refetchSystemPlugins = () => {
  const changeStream = MongoSystemPlugin.watch();

  changeStream.on('change', () => {
    try {
      cleanSystemPluginCache();
    } catch (error) {}
  });
};

export const getSystemPlugins = async (): Promise<SystemPluginTemplateItemType[]> => {
  if (getCachedSystemPlugins().expires > Date.now() && isProduction) {
    return getCachedSystemPlugins().data;
  } else {
    const tools = await getSystemToolList();

    // 从数据库里加载插件配置进行替换
    const systemPluginsArray = await MongoSystemPlugin.find({}).lean();
    const systemPlugins = new Map(systemPluginsArray.map((plugin) => [plugin.pluginId, plugin]));

    tools.forEach((tool) => {
      // 如果有插件的配置信息，则需要进行替换
      const dbPluginConfig = systemPlugins.get(tool.id);

      if (dbPluginConfig) {
        const children = tools.filter((item) => item.parentId === tool.id);
        const list = [tool, ...children];
        list.forEach((item) => {
          item.isActive = dbPluginConfig.isActive ?? item.isActive ?? true;
          item.originCost = dbPluginConfig.originCost ?? 0;
          item.currentCost = dbPluginConfig.currentCost ?? 0;
          item.hasTokenFee = dbPluginConfig.hasTokenFee ?? false;
          item.pluginOrder = dbPluginConfig.pluginOrder ?? 0;
        });
      }
    });

    const formatTools = tools.map<SystemPluginTemplateItemType>((item) => {
      const dbPluginConfig = systemPlugins.get(item.id);
      const inputs = item.versionList[0]?.inputs as FlowNodeInputItemType[];
      const outputs = item.versionList[0]?.outputs as FlowNodeOutputItemType[];

      return {
        isActive: item.isActive,
        id: item.id,
        parentId: item.parentId,
        isFolder: tools.some((tool) => tool.parentId === item.id),
        name: item.name,
        avatar: item.avatar,
        intro: item.intro,
        author: item.author,
        courseUrl: item.courseUrl,
        showStatus: true,
        weight: item.weight,
        templateType: item.templateType,
        originCost: item.originCost,
        currentCost: item.currentCost,
        hasTokenFee: item.hasTokenFee,
        pluginOrder: item.pluginOrder,

        workflow: {
          nodes: [],
          edges: []
        },
        versionList: item.versionList,
        inputs,
        outputs,

        inputList: inputs?.find((input) => input.key === NodeInputKeyEnum.systemInputConfig)
          ?.inputList as any,
        hasSystemSecret: !!dbPluginConfig?.inputListVal
      };
    });

    const dbPlugins = systemPluginsArray
      .filter((item) => item.customConfig)
      .map((item) => dbPluginFormat(item));

    const plugins = [...formatTools, ...dbPlugins];
    plugins.sort((a, b) => (a.pluginOrder ?? 0) - (b.pluginOrder ?? 0));

    global.systemPlugins_cache = {
      expires: Date.now() + 30 * 60 * 1000, // 30 minutes
      data: plugins
    };

    return plugins;
  }
};

export const getSystemPluginById = async (id: string): Promise<SystemPluginTemplateItemType> => {
  const { source, pluginId } = splitCombinePluginId(id);
  if (source === PluginSourceEnum.systemTool) {
    const tools = await getSystemPlugins();
    const tool = tools.find((item) => item.id === pluginId);
    if (tool) {
      return tool;
    }
    return Promise.reject(PluginErrEnum.unExist);
  }

  const dbPlugin = await MongoSystemPlugin.findOne({ pluginId }).lean();
  if (!dbPlugin) return Promise.reject(PluginErrEnum.unExist);
  return dbPluginFormat(dbPlugin);
};

declare global {
  var systemPlugins_cache:
    | {
        expires: number;
        data: SystemPluginTemplateItemType[];
      }
    | undefined;
}
