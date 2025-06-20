import { type FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node.d';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getHandleConfig } from '@fastgpt/global/core/workflow/template/utils';
import {
  appData2FlowNodeIO,
  pluginData2FlowNodeIO,
  toolData2FlowNodeIO,
  toolSetData2FlowNodeIO
} from '@fastgpt/global/core/workflow/utils';
import { MongoApp } from '../schema';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { type SystemPluginTemplateItemType } from '@fastgpt/global/core/workflow/type';
import {
  checkIsLatestVersion,
  getAppLatestVersion,
  getAppVersionById
} from '../version/controller';
import { type PluginRuntimeType } from '@fastgpt/global/core/plugin/type';
import { MongoSystemPlugin } from './systemPluginSchema';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getSystemToolList } from '../tool/api';
import { Types } from '../../../common/mongo';
import type { SystemPluginConfigSchemaType } from './type';

/**
  plugin id rule:
  - personal: id
  - commercial: commercial-id
  - systemtool: systemTool-id
  (deprecated) community: community-id
*/
export function splitCombineToolId(id: string) {
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
  if (source === 'community' || id === 'commercial-dalle3') {
    // HINT: 兼容性问题 commercial-dalle3
    return { source: PluginSourceEnum.systemTool, pluginId: id };
  }
  return { source, pluginId: id };
}

type ChildAppType = SystemPluginTemplateItemType & {
  teamId?: string;
  tmbId?: string;
  inputs?: FlowNodeInputItemType[];
  outputs?: FlowNodeOutputItemType[];
};

export const getSystemPluginByIdAndVersionId = async (
  pluginId: string,
  versionId?: string
): Promise<ChildAppType> => {
  const plugin = await (async () => {
    const plugin = await getSystemPluginById(pluginId);
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
    return plugin;
  })();

  return {
    ...plugin,
    version: undefined,
    isLatestVersion: true
  };
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
  const { source, pluginId } = splitCombineToolId(appId);
  const app: ChildAppType = await (async () => {
    if (source === PluginSourceEnum.personal) {
      const item = await MongoApp.findById(appId).lean();
      if (!item) return Promise.reject(PluginErrEnum.unExist);

      const version = await getAppVersionById({ appId, versionId, app: item });

      const isLatest =
        version.versionId && Types.ObjectId.isValid(version.versionId)
          ? await checkIsLatestVersion({
              appId,
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
      } as ChildAppType;
    } else {
      return getSystemPluginByIdAndVersionId(pluginId, versionId);
    }
  })();

  const { isSystemTool, isPlugin, isTool, isToolSet } = (() => {
    const isSystemTool = source === PluginSourceEnum.systemTool;
    if (isSystemTool) {
      return { isSystemTool };
    }

    const isPlugin = !!app.workflow.nodes.find(
      (node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput
    );

    const isTool =
      !!app.workflow.nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.tool) &&
      app.workflow.nodes.length === 1;

    const isToolSet =
      !!app.workflow.nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.toolSet) &&
      app.workflow.nodes.length === 1;

    return { isSystemTool, isPlugin, isTool, isToolSet };
  })();

  const { flowNodeType, nodeIOConfig } = (() => {
    if (isToolSet)
      return {
        flowNodeType: FlowNodeTypeEnum.toolSet,
        nodeIOConfig: toolSetData2FlowNodeIO({ nodes: app.workflow.nodes })
      };
    if (isTool)
      return {
        flowNodeType: FlowNodeTypeEnum.tool,
        nodeIOConfig: toolData2FlowNodeIO({ nodes: app.workflow.nodes })
      };
    if (isPlugin)
      return {
        flowNodeType: FlowNodeTypeEnum.pluginModule,
        nodeIOConfig: pluginData2FlowNodeIO({ nodes: app.workflow.nodes })
      };
    if (isSystemTool) {
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
    showStatus: app.showStatus,
    isTool: true,

    version: app.version,
    versionLabel: app.versionLabel,
    isLatestVersion: app.isLatestVersion,
    sourceHandle: getHandleConfig(true, true, true, true),
    targetHandle: getHandleConfig(true, true, true, true),

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
    const { source, pluginId } = splitCombineToolId(id);

    if (source === PluginSourceEnum.personal) {
      const item = await MongoApp.findById(id).lean();
      if (!item) return Promise.reject(PluginErrEnum.unExist);

      const version = await getAppVersionById({
        appId: id,
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
      // System
      return getSystemPluginByIdAndVersionId(pluginId, versionId);
    }
  })();

  return {
    id: app.id,
    teamId: app.teamId,
    tmbId: app.tmbId,
    name: parseI18nString(app.name, lang),
    avatar: app.avatar || '',
    showStatus: app.showStatus,
    currentCost: app.currentCost,
    nodes: app.workflow.nodes,
    edges: app.workflow.edges,
    hasTokenFee: app.hasTokenFee
  };
}

export function overridePluginConfig(
  item: Awaited<ReturnType<typeof getSystemToolList>>[0],
  dbPluginConfig: SystemPluginConfigSchemaType
) {
  item.isActive = dbPluginConfig.isActive ?? item.isActive ?? true;
  item.originCost = dbPluginConfig.originCost ?? 0;
  item.currentCost = dbPluginConfig.currentCost ?? 0;
  item.hasTokenFee = dbPluginConfig.hasTokenFee ?? false;
  item.pluginOrder = dbPluginConfig.pluginOrder ?? 0;
  // !dueprecated
  // @ts-ignore
  item.customWorkflow = dbPluginConfig.customConfig;

  // item.inputs = [
  //   ...item.inputs,
  //   ...(dbPluginConfig.inputConfig?.map((item) => ({
  //     key: item.key,
  //     label: item.label,
  //     description: item.description,
  //     value: item.value,
  //     renderTypeList: [FlowNodeInputTypeEnum.hidden],
  //     valueType:
  //       item.valueType === 'string'
  //         ? WorkflowIOValueTypeEnum.string
  //         : WorkflowIOValueTypeEnum.object
  //   })) ?? [])
  // ];
  // item.inputs.find((item) => item.key === 'system_input_config').value = dbPluginConfig.inputConfig?.map(()=> {})

  //@ts-ignore
  item.inputConfig = dbPluginConfig.inputConfig;

  // return {
  //   ...item,
  //   isActive: pluginConfig.isActive ?? false,
  //   originCost: pluginConfig.originCost ?? 0,
  //   currentCost: pluginConfig.currentCost ?? 0,
  //   hasTokenFee: pluginConfig.hasTokenFee ?? false,
  //   pluginOrder: pluginConfig.pluginOrder ?? 0,
  //   customWorkflow: pluginConfig.customConfig,
  //   inputs: [
  //     ...(pluginConfig.inputConfig?.map((item) => ({
  //       key: item.key,
  //       label: item.label,
  //       description: item.description,
  //       value: item.value
  //     })) ?? [])
  //   ]
  // };
}

const dbPluginFormat = (item: SystemPluginConfigSchemaType) => {
  const {
    name,
    avatar,
    intro,
    version,
    weight,
    workflow,
    templateType,
    associatedPluginId,
    userGuide
  } = item.customConfig!;
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
    showStatus: true,
    weight,
    isTool: true,
    templateType,
    inputConfig: item.inputConfig,
    workflow,
    originCost: item.originCost,
    currentCost: item.currentCost,
    hasTokenFee: item.hasTokenFee,
    pluginOrder: item.pluginOrder,
    associatedPluginId,
    userGuide
  };
};

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
  if (getCachedSystemPlugins().expires > Date.now() && process.env.NODE_ENV === 'production') {
    return getCachedSystemPlugins().data;
  } else {
    const tools = await getSystemToolList();

    // 从数据库里加载插件配置进行替换
    const systemPlugins = await MongoSystemPlugin.find({}).lean();
    tools.forEach((tool) => {
      // 如果有插件的配置信息，则需要进行替换

      // if tools.inputs has system_input_config, covert it into inputConfig
      const inputConfig = tool.inputs.find((item) => item.key === 'system_input_config');
      if (inputConfig) {
        // inputConfig?: {
        //   // Render config input form. Find the corresponding node and replace the variable directly
        //   key: string;
        //   label: string;
        //   description: string;
        //   value?: any;
        // }[];
        // @ts-ignore
        tool.inputConfig = inputConfig.inputList?.map((item) => ({
          key: item.key,
          label: item.label,
          description: item.description,
          valueType: item.inputType
        }));
      }

      const dbPluginConfig = systemPlugins.find((config) => config.pluginId === tool.id);

      if (dbPluginConfig) {
        const children = tools.filter((item) => item.parentId === tool.id);
        const list = [tool, ...children];
        list.forEach((item) => {
          overridePluginConfig(item, dbPluginConfig);
        });
      }
    });
    const dbPlugins = systemPlugins
      .filter((item) => item.customConfig)
      .map((item) => dbPluginFormat(item));

    const plugins = [...tools, ...dbPlugins];
    plugins.sort((a, b) => (a.pluginOrder ?? 0) - (b.pluginOrder ?? 0));
    global.systemPlugins_cache = {
      expires: Date.now() + 30 * 60 * 1000, // 30 minutes
      data: plugins
    };
    return plugins as SystemPluginTemplateItemType[];
  }
};

export const getSystemPluginById = async (
  pluginId: string
): Promise<SystemPluginTemplateItemType> => {
  const { source } = splitCombineToolId(pluginId);
  if (source === PluginSourceEnum.systemTool) {
    const tools = await getSystemPlugins();
    const tool = tools.find((item) => item.id === pluginId);
    if (tool) {
      return tool;
    }
  }
  const dbPlugin = await MongoSystemPlugin.findOne({ pluginId }).lean();
  return dbPluginFormat(dbPlugin!);
};

declare global {
  var systemPlugins_cache:
    | {
        expires: number;
        data: SystemPluginTemplateItemType[];
      }
    | undefined;
}
