import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { LangEnum } from '@fastgpt/global/common/i18n/type';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import {
  jsonSchema2NodeInput,
  jsonSchema2NodeOutput,
  jsonSchema2SecretInput
} from '@fastgpt/global/core/app/jsonschema';
import { SystemToolCodec } from '@fastgpt/global/core/app/tool/systemTool/codec';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { filterPluginTags } from '@fastgpt/global/core/plugin/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { PluginListParamsType } from '@fastgpt/global/sdk/fastgpt-plugin';
import { pluginClient } from '../../../../thirdProvider/fastgptPlugin';
import { MongoSystemTool } from '../../../plugin/tool/systemToolSchema';
import { MongoApp } from '../../schema';
import {
  getAppVersionById,
  getAppLatestVersion,
  checkIsLatestVersion
} from '../../version/controller';
import type {
  SystemToolListItemType,
  SystemToolDetailType
} from '@fastgpt/global/core/app/tool/systemTool/type';
import type {
  SystemToolVersionType,
  SystemToolChildDetailType
} from '@fastgpt/global/core/app/tool/systemTool/type/base';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { MongoAppVersion } from '../../version/schema';
import type { SystemPluginToolCollectionType } from '@fastgpt/global/core/plugin/tool/type';
import type { AppToolRuntimeType } from '@fastgpt/global/core/app/tool/type';
import type { PluginPermissionEnumType } from '@fastgpt/global/sdk/fastgpt-plugin';
import { pluginData2FlowNodeIO } from '@fastgpt/global/core/workflow/utils';
import { Types } from '../../../../common/mongo';

type SystemToolRuntimeType = {
  id: string;
  version?: string;
  currentCost: number;
  systemKeyCost: number;
  secretsVal?: Record<string, any>;
  permissions?: PluginPermissionEnumType[];
};

/**
 * SystemTool Repo
 * 系统工具仓储层
 * 1. 管理系统工具的来源：plugin service 获取 / mongo 中存的
 * 2. @unimplement 对于业务层透明的缓存
 */
export class SystemToolRepo {
  private static _instance: SystemToolRepo;
  private constructor() {}

  public static getInstance(): SystemToolRepo {
    if (!SystemToolRepo._instance) {
      SystemToolRepo._instance = new SystemToolRepo();
    }
    return SystemToolRepo._instance;
  }

  // TODO: 缓存
  private async getSystemToolRecord(pluginId: string): Promise<SystemPluginToolCollectionType> {
    const rec = await MongoSystemTool.findOne({ pluginId });
    if (!rec) {
      return Promise.reject(new Error(`System tool not found: ${pluginId}`));
    }
    return rec;
  }

  // TODO: 缓存
  private async getAllSystemToolRecords(): Promise<SystemPluginToolCollectionType[]> {
    return MongoSystemTool.find({});
  }

  /** 获取系统工具列表，归一化为一个相同的列表类型，业务层做 pick */
  getSystemToolList = async ({
    op,
    sources,
    tags,
    lang
  }: {
    tags?: string[];
    op?: PluginListParamsType['op'];
    sources?: PluginListParamsType['sources'];
    lang?: `${LangEnum}`;
  }): Promise<SystemToolListItemType[]> => {
    // 1. get all tools from plugin by sources
    const filteredTags = tags ? filterPluginTags(tags) : undefined;
    const tools = await pluginClient.listTools({
      op,
      sources,
      tags: filteredTags
    });

    // 2. 加载数据库中的插件配置，将所有插件 normalize
    const DBPlugins = await this.getAllSystemToolRecords();
    const DBPluginsMap = new Map(DBPlugins.map((plugin) => [plugin.pluginId, plugin]));

    const formattedTools = tools.map((tool) =>
      SystemToolCodec.attachToolConfig({
        tool,
        config:
          DBPluginsMap.get(SystemToolCodec.getDBPluginId(tool.pluginId)) ??
          DBPluginsMap.get(tool.pluginId),
        lang
      })
    );

    /** 工作流插件，admin 后台配的 */
    const DBWorkflowPlugins = DBPlugins.filter((item) => item.customConfig?.associatedPluginId);

    const concatTools = [
      ...formattedTools,
      ...DBWorkflowPlugins.map(SystemToolCodec.fromDBTypeToListItemType)
    ];

    concatTools.sort(createSystemToolSorter(tags));

    return concatTools;
  };

  /** 获取单一插件的 Detail 信息 */
  getSystemToolDetail = async ({
    pluginId,
    version,
    source = 'system',
    lang,
    fallbackLatestVersion = false
  }: {
    pluginId: string;
    version?: string;
    source?: string;
    lang?: `${LangEnum}`;
    fallbackLatestVersion?: boolean;
  }): Promise<SystemToolDetailType> => {
    const { pluginId: rawPluginId } = splitCombineToolId(pluginId);
    const [parentPluginId, childPluginId] = rawPluginId.split('/');
    const getChildToolDetail = !!childPluginId;

    const dbTool = await MongoSystemTool.findOne({
      pluginId
    });

    if (!childPluginId && dbTool?.customConfig?.associatedPluginId) {
      // 说明是 workflow 工具，需要拿这个 app
      const associatedPluginId = dbTool.customConfig.associatedPluginId;
      const app = await MongoApp.findById(associatedPluginId).lean();
      if (!app) return Promise.reject(PluginErrEnum.unExist);
      const appVersion = version
        ? await getAppVersionById({
            appId: associatedPluginId,
            versionId: version,
            app
          })
        : await getAppLatestVersion(associatedPluginId, app);
      if (!appVersion.versionId) return Promise.reject(new UserError('App version not found'));

      const isLatest = appVersion.versionId
        ? await checkIsLatestVersion({
            appId: associatedPluginId,
            versionId: appVersion.versionId
          })
        : true;

      return {
        id: pluginId,
        name: dbTool.customConfig.name,
        status: dbTool.status,
        toolDescription: dbTool.customConfig.toolDescription ?? dbTool.customConfig.intro ?? '',
        version: dbTool.customConfig.version ?? '',
        intro: dbTool.customConfig.intro ?? '',
        tags: dbTool.customConfig.tags ?? [],
        author: dbTool.customConfig.author ?? global.feConfigs.systemTitle ?? '',
        avatar: app.avatar,
        hasSystemSecret: false,
        systemSecretStatus: SystemToolCodec.getSystemSecretStatus({ hasSecret: false }),
        ...pluginData2FlowNodeIO({
          nodes: appVersion.nodes
        }),
        isToolSet: false,
        currentCost: dbTool.currentCost ?? 0,
        hasTokenFee: dbTool.hasTokenFee ?? false,
        systemKeyCost: dbTool.systemKeyCost ?? 0,
        pluginOrder: dbTool.pluginOrder ?? 0,
        hideTags: dbTool.hideTags ?? [],
        promoteTags: dbTool.promoteTags ?? [],
        source: 'system',
        isLatestVersion: isLatest,
        associatedPluginId: dbTool.customConfig.associatedPluginId ?? undefined,
        originCost: dbTool.originCost ?? 0,
        userGuide: dbTool.customConfig.userGuide ?? undefined
      } satisfies SystemToolDetailType;
    }

    // System tool
    const tool = await pluginClient.getTool({
      pluginId: parentPluginId,
      version,
      source,
      ...(fallbackLatestVersion ? { fallbackLatestVersion: true } : {})
    });

    const getToolParent = tool.isToolset && !getChildToolDetail;

    const child = getChildToolDetail
      ? tool.children?.find((item) => item.id === childPluginId)
      : undefined;

    if (getChildToolDetail && !child) return Promise.reject(PluginErrEnum.unExist);

    const childrenPluginIds = getToolParent
      ? tool.children?.map((item) => `${pluginId}/${item.id}`)
      : [];

    const dbChildren = await MongoSystemTool.find({
      pluginId: {
        $in: childrenPluginIds
      }
    });

    const dbChildrenMap = new Map(dbChildren.map((item) => [item.pluginId, item]));
    const children = tool.isToolset
      ? tool.children?.map((item) => {
          const dbChild = dbChildrenMap.get(`${pluginId}/${item.id}`);
          return {
            id: item.id,
            name: parseI18nString(item.name, lang),
            description: parseI18nString(item.description, lang),
            systemKeyCost: dbChild?.systemKeyCost ?? 0,
            currentCost: dbChild?.currentCost ?? 0,
            icon: item.icon,
            inputs: jsonSchema2NodeInput({
              jsonSchema: item.inputSchema,
              schemaType: 'systemTool'
            }),
            outputs: jsonSchema2NodeOutput({ jsonSchema: item.outputSchema })
          } satisfies SystemToolChildDetailType;
        })
      : undefined;

    const secrets = jsonSchema2SecretInput({ jsonSchema: tool.secretSchema });
    const configuredSecretsVal = SystemToolCodec.getConfiguredSecretsVal(dbTool);
    const hasSystemSecret = !!configuredSecretsVal;

    const toolDetail: SystemToolDetailType = {
      id: pluginId,
      author: tool.author ?? global.feConfigs.systemTitle ?? '',
      avatar: childPluginId ? (child?.icon ?? tool.icon) : tool.icon,
      currentCost: dbTool?.currentCost ?? 0,
      hasSystemSecret,
      systemSecretStatus: SystemToolCodec.getSystemSecretStatus({
        hasSecret: !!secrets?.length,
        hasSystemSecret
      }),
      secretsVal: configuredSecretsVal,
      hasTokenFee: dbTool?.hasTokenFee ?? false,
      intro:
        dbTool?.customConfig?.intro ??
        (childPluginId
          ? parseI18nString(child?.description, lang)
          : parseI18nString(tool.description, lang)),
      isToolSet: tool.isToolset && !childPluginId,
      ...(children ? { children } : {}),
      name:
        dbTool?.customConfig?.name ??
        parseI18nString(childPluginId ? child!.name : tool.name, lang),

      status: dbTool?.status ?? PluginStatusEnum.Normal,
      systemKeyCost: dbTool?.systemKeyCost ?? 0,
      tags: dbTool?.customConfig?.tags ?? tool.tags ?? [],
      source: tool.source,
      userGuide: dbTool?.customConfig?.userGuide,
      toolDescription:
        dbTool?.customConfig?.toolDescription ??
        (childPluginId ? child!.toolDescription : tool.toolDescription),
      // courseUrl: dbTool?.customConfig?.courseUrl ?? tool.tutorialUrl,
      courseUrl: tool.tutorialUrl,
      readmeUrl: tool.readmeUrl,
      version: tool.version,
      hideTags: dbTool?.hideTags ?? [],
      promoteTags: dbTool?.promoteTags ?? [],
      pluginOrder: dbTool?.pluginOrder,
      secrets,
      isLatestVersion: tool.isLatestVersion,
      ...(childPluginId
        ? {
            inputs: jsonSchema2NodeInput({
              jsonSchema: child!.inputSchema,
              schemaType: 'systemTool'
            }),
            outputs: jsonSchema2NodeOutput({ jsonSchema: child!.outputSchema })
          }
        : {
            inputs: tool.inputSchema
              ? jsonSchema2NodeInput({ jsonSchema: tool.inputSchema, schemaType: 'systemTool' })
              : [],
            outputs: tool.outputSchema
              ? jsonSchema2NodeOutput({ jsonSchema: tool.outputSchema })
              : []
          }),
      permissions: tool.permission
    };

    return toolDetail;
  };

  getVersions = async ({
    pluginId,
    source = 'system'
  }: {
    pluginId: string;
    source?: string;
    lang?: `${LangEnum}`;
  }): Promise<SystemToolVersionType[]> => {
    const { pluginId: rawPluginId, source: pluginSource } = splitCombineToolId(pluginId);
    if (pluginSource === AppToolSourceEnum.commercial) {
      const tool = await this.getSystemToolRecord(pluginId);

      if (!tool || !tool.customConfig?.associatedPluginId) {
        return Promise.reject('Plugin is not associated with a app');
      }

      const { associatedPluginId } = tool.customConfig;
      const appVersions = await MongoAppVersion.find(
        {
          appId: new Types.ObjectId(associatedPluginId),
          $or: [{ isAutoSave: false }, { isAutoSave: undefined }]
        },
        {
          versionName: 1
        }
      );

      return appVersions.map((item) => ({
        version: item.versionName
      }));
    }

    const parentToolId = rawPluginId.split('/')[0];

    const versions = await pluginClient.listPluginVersions({
      pluginId: parentToolId,
      source
    });

    return versions.map((item) => ({
      version: item.version
    }));
  };

  getSystemToolRuntime = async ({
    pluginId,
    version,
    source = 'system'
  }: {
    pluginId: string;
    version?: string;
    source?: string;
  }): Promise<SystemToolRuntimeType> => {
    const { pluginId: rawPluginId } = splitCombineToolId(pluginId);
    const [parentPluginId] = rawPluginId.split('/');

    const dbTool = await MongoSystemTool.findOne({ pluginId }).lean();

    if (!dbTool?.customConfig?.associatedPluginId) {
      const tool = await pluginClient.getTool({
        pluginId: parentPluginId,
        version,
        source,
        fallbackLatestVersion: true
      });

      return {
        id: pluginId,
        version: tool.version,
        currentCost: dbTool?.currentCost ?? 0,
        systemKeyCost: dbTool?.systemKeyCost ?? 0,
        secretsVal: SystemToolCodec.getConfiguredSecretsVal(dbTool),
        permissions: tool.permission
      };
    }

    return {
      id: pluginId,
      version,
      currentCost: dbTool.currentCost ?? 0,
      systemKeyCost: dbTool.systemKeyCost ?? 0,
      secretsVal: SystemToolCodec.getConfiguredSecretsVal(dbTool)
    };
  };

  async getSystemToolWorkflowRuntime({
    pluginId,
    version
  }: {
    pluginId: string;
    version?: string;
  }): Promise<AppToolRuntimeType> {
    // 1. pluginId 必须 commercial- 开头
    if (!pluginId.startsWith('commercial-')) {
      return Promise.reject('Invalid pluginId');
    }

    const tool = await this.getSystemToolRecord(pluginId);

    if (!tool || !tool.customConfig?.associatedPluginId) {
      return Promise.reject('Plugin is not associated with a app');
    }

    const { associatedPluginId } = tool.customConfig;

    const appVersion = await getAppVersionById({
      appId: associatedPluginId,
      versionId: version
    });

    if (!appVersion) {
      return Promise.reject('Invalid version');
    }

    return {
      avatar: tool.customConfig.avatar ?? '',
      edges: appVersion.edges,
      id: pluginId,
      name: tool.customConfig.name,
      nodes: appVersion.nodes,
      currentCost: tool.currentCost
    };
  }
}

const getTagMatchedCount = (tool: SystemToolListItemType, tags?: string[]) => {
  if (!tags?.length) return 0;

  const targetTags = new Set(tags);
  return [...new Set(tool.tags)].filter((tag) => targetTags.has(tag)).length;
};

const createSystemToolSorter =
  (tags?: string[]) => (a: SystemToolListItemType, b: SystemToolListItemType) => {
    const orderDiff = (a.pluginOrder ?? 999) - (b.pluginOrder ?? 999);
    if (!tags?.length) return orderDiff;

    const matchedCountDiff = getTagMatchedCount(b, tags) - getTagMatchedCount(a, tags);
    return matchedCountDiff || orderDiff;
  };
