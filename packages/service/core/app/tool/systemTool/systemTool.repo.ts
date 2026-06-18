import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { LangEnum } from '@fastgpt/global/common/i18n/type';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import {
  jsonSchema2SecretInput,
  nodeInputs2JsonSchema,
  nodeOutputs2JsonSchema
} from '@fastgpt/global/core/app/jsonschema';
import { SystemToolCodec } from '@fastgpt/global/core/app/tool/systemTool/codec';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { filterPluginTags } from '@fastgpt/global/core/plugin/utils';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
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
import { Types } from '../../../../common/mongo';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

type SystemToolRuntimeType = {
  id: string;
  version?: string;
  currentCost: number;
  systemKeyCost: number;
  secretsVal?: Record<string, any>;
  permissions?: PluginPermissionEnumType[];
};

type SystemToolDisplayChildType = Pick<
  SystemToolChildDetailType,
  | 'id'
  | 'name'
  | 'status'
  | 'description'
  | 'toolDescription'
  | 'icon'
  | 'currentCost'
  | 'systemKeyCost'
>;

type SystemToolDisplayInfoType = Pick<
  SystemToolListItemType,
  | 'id'
  | 'version'
  | 'status'
  | 'source'
  | 'isToolSet'
  | 'avatar'
  | 'name'
  | 'intro'
  | 'author'
  | 'tags'
  | 'toolDescription'
  | 'userGuide'
  | 'readmeUrl'
  | 'courseUrl'
  | 'pluginOrder'
  | 'originCost'
  | 'currentCost'
  | 'systemKeyCost'
  | 'hasTokenFee'
  | 'hasSystemSecret'
  | 'systemSecretStatus'
  | 'hideTags'
  | 'promoteTags'
> & {
  children?: SystemToolDisplayChildType[];
};

const getChildIconMap = (children?: { id: string; icon?: string }[]) =>
  new Map(
    (children ?? []).flatMap((child) => (child.icon ? ([[child.id, child.icon]] as const) : []))
  );

const workflowToolNodes2JsonSchema = ({ nodes }: { nodes: StoreNodeItemType[] }) => {
  const pluginInput = nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput);
  const pluginOutput = nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginOutput);

  return {
    inputSchema: nodeInputs2JsonSchema({ inputs: pluginInput?.inputs ?? [] }),
    outputSchema: nodeOutputs2JsonSchema({
      outputs:
        pluginOutput?.inputs.map((item) => ({
          id: item.key,
          type: FlowNodeOutputTypeEnum.static,
          key: item.key,
          valueType: item.valueType,
          label: item.label || item.key,
          description: item.description,
          required: item.required
        })) ?? []
    })
  };
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

  /**
   * listTools 的子工具 DTO 可能只保留名称/描述，不带 icon；展开工具集展示子工具列表时
   * 补读 detail 拿头像。detail 里的 schema 只用于取 icon，不会继续透传到展示结构。
   */
  private async getToolsetChildIconMap({
    pluginId,
    source
  }: {
    pluginId: string;
    source: string;
  }): Promise<Map<string, string>> {
    try {
      const detail = await pluginClient.getTool({ pluginId, source });
      return getChildIconMap(detail.children);
    } catch {
      return new Map();
    }
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

      const { inputSchema, outputSchema } = workflowToolNodes2JsonSchema({
        nodes: appVersion.nodes
      });

      return {
        id: pluginId,
        name: dbTool.customConfig.name,
        status: dbTool.status,
        toolDescription: dbTool.customConfig.toolDescription ?? dbTool.customConfig.intro ?? '',
        version: appVersion.versionId,
        versionLabel: appVersion.versionName,
        intro: dbTool.customConfig.intro ?? '',
        tags: dbTool.customConfig.tags ?? [],
        author: dbTool.customConfig.author ?? global.feConfigs.systemTitle ?? '',
        avatar: app.avatar,
        hasSystemSecret: false,
        systemSecretStatus: SystemToolCodec.getSystemSecretStatus({ hasSecret: false }),
        inputSchema,
        outputSchema,
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
            status: dbChild?.status ?? PluginStatusEnum.Normal,
            description: parseI18nString(item.description, lang),
            systemKeyCost: dbChild?.systemKeyCost ?? 0,
            currentCost: dbChild?.currentCost ?? 0,
            icon: item.icon,
            inputSchema: item.inputSchema,
            outputSchema: item.outputSchema
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
      secretSchema: tool.secretSchema,
      isLatestVersion: tool.isLatestVersion,
      ...(childPluginId
        ? {
            inputSchema: child!.inputSchema,
            outputSchema: child!.outputSchema
          }
        : {
            inputSchema: tool.inputSchema,
            outputSchema: tool.outputSchema
          }),
      permissions: tool.permission
    };

    return toolDetail;
  };

  /**
   * 获取系统工具的轻量展示信息，仅用于路径、模板列表这类 UI 元数据场景。
   *
   * 这个方法刻意不返回 input/output/secret schema，也不会为工作流工具加载 app
   * version 生成 workflow JSON Schema；需要运行或配置详情时仍使用 getSystemToolDetail。
   */
  getSystemToolDisplayInfo = async ({
    pluginId,
    source = 'system',
    lang
  }: {
    pluginId: string;
    source?: string;
    lang?: `${LangEnum}`;
  }): Promise<SystemToolDisplayInfoType> => {
    const { pluginId: rawPluginId, source: toolSource } = splitCombineToolId(pluginId);
    const [parentPluginId, childPluginId] = rawPluginId.split('/');

    const exactDbTool = await MongoSystemTool.findOne({ pluginId });
    if (!childPluginId && exactDbTool?.customConfig?.associatedPluginId) {
      return {
        id: pluginId,
        version: exactDbTool.customConfig.version,
        status: exactDbTool.status ?? PluginStatusEnum.Normal,
        source: 'system',
        isToolSet: false,
        avatar: exactDbTool.customConfig.avatar ?? '',
        name: exactDbTool.customConfig.name,
        intro: exactDbTool.customConfig.intro ?? '',
        author: exactDbTool.customConfig.author ?? global.feConfigs.systemTitle ?? '',
        tags: exactDbTool.customConfig.tags ?? [],
        toolDescription:
          exactDbTool.customConfig.toolDescription ?? exactDbTool.customConfig.intro ?? '',
        userGuide: exactDbTool.customConfig.userGuide,
        pluginOrder: exactDbTool.pluginOrder ?? 0,
        originCost: exactDbTool.originCost ?? 0,
        currentCost: exactDbTool.currentCost ?? 0,
        systemKeyCost: exactDbTool.systemKeyCost ?? 0,
        hasTokenFee: exactDbTool.hasTokenFee ?? false,
        hasSystemSecret: false,
        systemSecretStatus: SystemToolCodec.getSystemSecretStatus({ hasSecret: false }),
        hideTags: exactDbTool.hideTags ?? [],
        promoteTags: exactDbTool.promoteTags ?? []
      };
    }

    const pluginSource =
      source === AppToolSourceEnum.commercial ? AppToolSourceEnum.commercial : 'system';
    const tools = await pluginClient.listTools({
      sources: [pluginSource]
    });
    const tool = tools.find((item) => item.pluginId === parentPluginId);
    if (!tool) return Promise.reject(PluginErrEnum.unExist);

    const parentCombinedPluginId = [
      AppToolSourceEnum.systemTool,
      AppToolSourceEnum.commercial
    ].includes(toolSource)
      ? `${toolSource}-${parentPluginId}`
      : parentPluginId;
    const parentConfigIds = Array.from(
      new Set([
        parentCombinedPluginId,
        parentPluginId,
        SystemToolCodec.getDBPluginId(parentPluginId)
      ])
    );
    const childConfigIds =
      tool.children?.flatMap((child) => [
        `${parentCombinedPluginId}/${child.id}`,
        `${parentPluginId}/${child.id}`,
        `${SystemToolCodec.getDBPluginId(parentPluginId)}/${child.id}`
      ]) ?? [];
    const dbTools = await MongoSystemTool.find({
      pluginId: {
        $in: [...parentConfigIds, ...childConfigIds]
      }
    });
    const dbToolsMap = new Map(dbTools.map((item) => [item.pluginId, item]));
    const parentConfig = parentConfigIds.map((id) => dbToolsMap.get(id)).find(Boolean);
    const parent = SystemToolCodec.attachToolConfig({
      tool,
      config: parentConfig,
      lang
    });
    const listChildIconMap = getChildIconMap(tool.children);

    const children =
      tool.children?.map<SystemToolDisplayChildType>((item) => {
        const childIcon = listChildIconMap.get(item.id);
        const childConfig = [
          `${parentCombinedPluginId}/${item.id}`,
          `${parentPluginId}/${item.id}`,
          `${SystemToolCodec.getDBPluginId(parentPluginId)}/${item.id}`
        ]
          .map((id) => dbToolsMap.get(id))
          .find(Boolean);

        return {
          id: item.id,
          name: parseI18nString(item.name, lang),
          status: childConfig?.status ?? PluginStatusEnum.Normal,
          description: parseI18nString(item.description, lang),
          toolDescription: childConfig?.customConfig?.toolDescription ?? item.toolDescription,
          icon: childIcon,
          currentCost: childConfig?.currentCost ?? 0,
          systemKeyCost: childConfig?.systemKeyCost ?? 0
        };
      }) ?? [];

    if (childPluginId) {
      const child = children.find((item) => item.id === childPluginId);
      if (!child) return Promise.reject(PluginErrEnum.unExist);

      return {
        ...parent,
        id: pluginId,
        isToolSet: false,
        avatar: child.icon ?? parent.avatar,
        name: child.name,
        intro: child.description ?? '',
        toolDescription: child.toolDescription ?? '',
        currentCost: child.currentCost,
        systemKeyCost: child.systemKeyCost
      };
    }

    return {
      ...parent,
      id: pluginId,
      children: parent.isToolSet ? children : undefined
    };
  };

  /**
   * 获取工具集展开后的子工具展示信息。仅展开列表需要子工具自己的 icon，因此在这个入口
   * 对 listTools 缺失的 child icon 补读 detail，避免路径、面包屑等轻量场景额外拉取 detail。
   */
  getSystemToolDisplayInfoWithChildIcons = async ({
    pluginId,
    source = 'system',
    lang
  }: {
    pluginId: string;
    source?: string;
    lang?: `${LangEnum}`;
  }): Promise<SystemToolDisplayInfoType> => {
    const parent = await this.getSystemToolDisplayInfo({ pluginId, source, lang });
    const missingChildIcon = parent.children?.some((child) => !child.icon) === true;
    if (!parent.isToolSet || !parent.children || !missingChildIcon) return parent;

    const { pluginId: rawPluginId } = splitCombineToolId(pluginId);
    const [parentPluginId, childPluginId] = rawPluginId.split('/');
    if (!parentPluginId || childPluginId) return parent;

    const pluginSource =
      source === AppToolSourceEnum.commercial ? AppToolSourceEnum.commercial : 'system';
    const childIconMap = await this.getToolsetChildIconMap({
      pluginId: parentPluginId,
      source: pluginSource
    });
    if (childIconMap.size === 0) return parent;

    return {
      ...parent,
      children: parent.children.map((child) => {
        const icon = childIconMap.get(child.id);
        return child.icon || !icon
          ? child
          : {
              ...child,
              icon
            };
      })
    };
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
    const tool = await MongoSystemTool.findOne({ pluginId });
    if (tool?.customConfig?.associatedPluginId) {
      const { associatedPluginId } = tool.customConfig;
      const appVersions = await MongoAppVersion.find(
        {
          appId: new Types.ObjectId(associatedPluginId),
          $or: [{ isAutoSave: false }, { isAutoSave: undefined }]
        },
        {
          versionName: 1
        }
      ).sort({ time: -1, _id: -1 });

      return appVersions.map((item) => ({
        version: String(item._id),
        versionDescription: item.versionName
      }));
    }

    const parentToolId = rawPluginId.split('/')[0];

    const versions = await pluginClient.listPluginVersions({
      pluginId: parentToolId,
      source: pluginSource === AppToolSourceEnum.commercial ? AppToolSourceEnum.commercial : source
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
      currentCost: tool.currentCost,
      associatedPluginId
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
