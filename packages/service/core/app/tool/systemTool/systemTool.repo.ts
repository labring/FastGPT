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
import { isDebugToolSource, splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import { PluginStatusEnum, type PluginStatusType } from '@fastgpt/global/core/plugin/type';
import { filterPluginTags } from '@fastgpt/global/core/plugin/utils';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { PluginListParamsType } from '@fastgpt/global/sdk/fastgpt-plugin';
import { pluginClient, withPluginClientLocale } from '../../../../thirdProvider/fastgptPlugin';
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
    inputSchema: nodeInputs2JsonSchema({
      inputs: pluginInput?.inputs ?? [],
      includeNodeMetadata: true,
      filterInternalInputs: true
    }),
    outputSchema: nodeOutputs2JsonSchema({
      outputs:
        pluginOutput?.inputs.map((item) => ({
          id: item.key,
          type: FlowNodeOutputTypeEnum.static,
          key: item.key,
          valueType: item.valueType,
          label: item.label || item.key,
          description: item.description,
          required: item.required,
          valueDesc: item.valueDesc,
          defaultValue: item.defaultValue,
          customFieldConfig: item.customInputConfig,
          deprecated: item.deprecated
        })) ?? [],
      includeNodeMetadata: true
    })
  };
};

const getPluginClientSource = ({
  idSource,
  runtimeSource = 'system'
}: {
  idSource?: string;
  runtimeSource?: string;
}) => {
  if (isDebugToolSource(runtimeSource)) return runtimeSource;
  if (idSource === AppToolSourceEnum.commercial) return AppToolSourceEnum.commercial;
  return runtimeSource || 'system';
};

const normalizeOptionalJsonSchema = <T>(schema: T | null | undefined) => schema ?? undefined;

const getSystemToolConfigIds = (pluginId: string) => {
  const systemToolPrefix = `${AppToolSourceEnum.systemTool}-`;
  const commercialPrefix = `${AppToolSourceEnum.commercial}-`;

  if (pluginId.startsWith(systemToolPrefix)) {
    const rawPluginId = pluginId.slice(systemToolPrefix.length);
    return Array.from(new Set([pluginId, rawPluginId]));
  }

  if (pluginId.startsWith(commercialPrefix)) {
    const rawPluginId = pluginId.slice(commercialPrefix.length);
    return Array.from(new Set([pluginId, rawPluginId, SystemToolCodec.getDBPluginId(rawPluginId)]));
  }

  return Array.from(new Set([SystemToolCodec.getDBPluginId(pluginId), pluginId]));
};

const getFirstSystemToolConfig = (
  configMap: Map<string, SystemPluginToolCollectionType>,
  pluginId: string
) =>
  getSystemToolConfigIds(pluginId)
    .map((id) => configMap.get(id))
    .find(Boolean);

const getSystemToolConfig = async (pluginId: string) => {
  const configIds = getSystemToolConfigIds(pluginId);
  if (configIds[0] === pluginId) {
    const exactConfig = await MongoSystemTool.findOne({ pluginId });
    if (exactConfig) return exactConfig;
  }

  return getFirstSystemToolConfig(
    new Map(
      (
        await MongoSystemTool.find({
          pluginId: {
            $in: configIds
          }
        })
      ).map((item) => [item.pluginId, item])
    ),
    pluginId
  );
};

const parseSystemToolId = ({ pluginId, source }: { pluginId: string; source?: string }) => {
  if (isDebugToolSource(source)) {
    try {
      return splitCombineToolId(pluginId);
    } catch {
      return {
        source: undefined,
        pluginId
      };
    }
  }

  return splitCombineToolId(pluginId);
};

const getVisiblePluginStatus = ({
  status,
  source
}: {
  status?: PluginStatusType;
  source?: string;
}): PluginStatusType => {
  if (isDebugToolSource(source)) return PluginStatusEnum.Normal;
  return status ?? PluginStatusEnum.Normal;
};

const assertSystemToolRunnable = ({
  tool,
  source
}: {
  tool?: SystemPluginToolCollectionType | null;
  source?: string;
}) => {
  if (isDebugToolSource(source)) return;
  if (tool?.status === PluginStatusEnum.Offline) {
    return Promise.reject(PluginErrEnum.unExist);
  }
};

const getParentSystemToolConfig = async ({
  pluginId,
  idSource,
  parentPluginId
}: {
  pluginId: string;
  idSource?: string;
  parentPluginId: string;
}) => {
  if (!pluginId.includes('/')) return;
  if (idSource === AppToolSourceEnum.systemTool || idSource === AppToolSourceEnum.commercial) {
    return getSystemToolConfig(`${idSource}-${parentPluginId}`);
  }
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
    source,
    lang
  }: {
    pluginId: string;
    source: string;
    lang?: `${LangEnum}`;
  }): Promise<Map<string, string>> {
    try {
      const detail = await withPluginClientLocale(lang, () =>
        pluginClient.getTool({ pluginId, source })
      );
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
    const tools = await withPluginClientLocale(lang, () =>
      pluginClient.listTools({
        op,
        sources,
        tags: filteredTags
      })
    );

    // 2. 加载数据库中的插件配置，将所有插件 normalize
    const DBPlugins = await this.getAllSystemToolRecords();
    const DBPluginsMap = new Map(DBPlugins.map((plugin) => [plugin.pluginId, plugin]));

    const formattedTools = tools.map((tool) => {
      const item = SystemToolCodec.attachToolConfig({
        tool,
        config: getFirstSystemToolConfig(DBPluginsMap, tool.pluginId),
        lang
      });

      return {
        ...item,
        status: getVisiblePluginStatus({
          status: item.status,
          source: tool.source
        })
      };
    });

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
    source: toolSource = 'system',
    lang,
    fallbackLatestVersion = false
  }: {
    pluginId: string;
    version?: string;
    source?: string;
    lang?: `${LangEnum}`;
    fallbackLatestVersion?: boolean;
  }): Promise<SystemToolDetailType> => {
    const isDebugSource = isDebugToolSource(toolSource);
    const { pluginId: rawPluginId, source: idSource } = parseSystemToolId({
      pluginId,
      source: toolSource
    });
    const [parentPluginId, childPluginId] = rawPluginId.split('/');
    const getChildToolDetail = !!childPluginId;

    const dbTool = await getSystemToolConfig(pluginId);

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
        status: getVisiblePluginStatus({ status: dbTool.status, source: toolSource }),
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
    const pluginSource = getPluginClientSource({ idSource, runtimeSource: toolSource });
    const tool = await withPluginClientLocale(lang, () =>
      pluginClient.getTool({
        pluginId: parentPluginId,
        version,
        source: pluginSource,
        ...(fallbackLatestVersion ? { fallbackLatestVersion: true } : {})
      })
    );

    const getToolParent = tool.isToolset && !getChildToolDetail;

    const child = getChildToolDetail
      ? tool.children?.find((item) => item.id === childPluginId)
      : undefined;

    if (getChildToolDetail && !child) return Promise.reject(PluginErrEnum.unExist);

    const childrenPluginIds = getToolParent
      ? tool.children?.flatMap((item) => getSystemToolConfigIds(`${pluginId}/${item.id}`))
      : [];

    const dbChildren = await MongoSystemTool.find({
      pluginId: {
        $in: childrenPluginIds
      }
    });

    const dbChildrenMap = new Map(dbChildren.map((item) => [item.pluginId, item]));
    const children = tool.isToolset
      ? tool.children?.map((item) => {
          const dbChild = getFirstSystemToolConfig(dbChildrenMap, `${pluginId}/${item.id}`);
          const inputSchema = normalizeOptionalJsonSchema(item.inputSchema);
          const outputSchema = normalizeOptionalJsonSchema(item.outputSchema);

          return {
            id: item.id,
            name: parseI18nString(item.name, lang),
            status: getVisiblePluginStatus({
              status: dbChild?.status,
              source: toolSource
            }),
            description: parseI18nString(item.description, lang),
            systemKeyCost: dbChild?.systemKeyCost ?? 0,
            currentCost: dbChild?.currentCost ?? 0,
            icon: item.icon,
            ...(inputSchema !== undefined ? { inputSchema } : {}),
            ...(outputSchema !== undefined ? { outputSchema } : {})
          } satisfies SystemToolChildDetailType;
        })
      : undefined;

    const secretSchema = normalizeOptionalJsonSchema(tool.secretSchema);
    const inputSchema = normalizeOptionalJsonSchema(
      childPluginId ? child!.inputSchema : tool.inputSchema
    );
    const outputSchema = normalizeOptionalJsonSchema(
      childPluginId ? child!.outputSchema : tool.outputSchema
    );
    const secrets = jsonSchema2SecretInput({ jsonSchema: secretSchema });
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

      status: getVisiblePluginStatus({
        status: dbTool?.status,
        source: isDebugSource ? toolSource : undefined
      }),
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
      ...(secretSchema !== undefined ? { secretSchema } : {}),
      isLatestVersion: tool.isLatestVersion,
      ...(inputSchema !== undefined ? { inputSchema } : {}),
      ...(outputSchema !== undefined ? { outputSchema } : {}),
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
    const isDebugSource = isDebugToolSource(source);
    const { pluginId: rawPluginId, source: idSource } = parseSystemToolId({ pluginId, source });
    const [parentPluginId, childPluginId] = rawPluginId.split('/');

    const exactDbTool = await getSystemToolConfig(pluginId);
    if (!childPluginId && exactDbTool?.customConfig?.associatedPluginId) {
      return {
        id: pluginId,
        version: exactDbTool.customConfig.version,
        status: getVisiblePluginStatus({ status: exactDbTool.status, source }),
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

    const pluginSource = getPluginClientSource({ idSource, runtimeSource: source });
    const tools = await withPluginClientLocale(lang, () =>
      pluginClient.listTools({
        sources: [pluginSource]
      })
    );
    const tool = tools.find((item) => item.pluginId === parentPluginId);
    if (!tool) return Promise.reject(PluginErrEnum.unExist);

    const requestedParentPluginId = pluginId.split('/')[0];
    const parentConfigIds = getSystemToolConfigIds(requestedParentPluginId);
    const childConfigIds =
      tool.children?.flatMap((child) =>
        getSystemToolConfigIds(`${requestedParentPluginId}/${child.id}`)
      ) ?? [];
    const dbTools = await MongoSystemTool.find({
      pluginId: {
        $in: [...parentConfigIds, ...childConfigIds]
      }
    });
    const dbToolsMap = new Map(dbTools.map((item) => [item.pluginId, item]));
    const parentConfig = !childPluginId
      ? (exactDbTool ?? getFirstSystemToolConfig(dbToolsMap, requestedParentPluginId))
      : getFirstSystemToolConfig(dbToolsMap, requestedParentPluginId);
    const parent = SystemToolCodec.attachToolConfig({
      tool,
      config: parentConfig,
      lang
    });
    parent.status = getVisiblePluginStatus({
      status: parent.status,
      source: isDebugSource ? source : undefined
    });
    const listChildIconMap = getChildIconMap(tool.children);

    const children =
      tool.children?.map<SystemToolDisplayChildType>((item) => {
        const childIcon = listChildIconMap.get(item.id);
        const childConfig = getFirstSystemToolConfig(
          dbToolsMap,
          `${requestedParentPluginId}/${item.id}`
        );

        return {
          id: item.id,
          name: parseI18nString(item.name, lang),
          status: getVisiblePluginStatus({
            status: childConfig?.status,
            source: isDebugSource ? source : undefined
          }),
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
        status: child.status,
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

    const { pluginId: rawPluginId } = parseSystemToolId({ pluginId, source });
    const [parentPluginId, childPluginId] = rawPluginId.split('/');
    if (!parentPluginId || childPluginId) return parent;

    const { source: idSource } = parseSystemToolId({ pluginId, source });
    const pluginSource = getPluginClientSource({ idSource, runtimeSource: source });
    const childIconMap = await this.getToolsetChildIconMap({
      pluginId: parentPluginId,
      source: pluginSource,
      lang
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
    source = 'system',
    lang
  }: {
    pluginId: string;
    source?: string;
    lang?: `${LangEnum}`;
  }): Promise<SystemToolVersionType[]> => {
    const { pluginId: rawPluginId, source: idSource } = parseSystemToolId({ pluginId, source });
    const tool = await getSystemToolConfig(pluginId);
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

    const versions = await withPluginClientLocale(lang, () =>
      pluginClient.listPluginVersions({
        pluginId: parentToolId,
        source: getPluginClientSource({ idSource, runtimeSource: source })
      })
    );

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
    const { pluginId: rawPluginId, source: idSource } = parseSystemToolId({ pluginId, source });
    const pluginSource = getPluginClientSource({ idSource, runtimeSource: source });
    const isDebugSource = isDebugToolSource(pluginSource);
    const [parentPluginId] = rawPluginId.split('/');

    const dbTool = await getSystemToolConfig(pluginId);
    await assertSystemToolRunnable({ tool: dbTool, source: pluginSource });
    const parentDbTool = await getParentSystemToolConfig({
      pluginId,
      idSource,
      parentPluginId
    });
    await assertSystemToolRunnable({ tool: parentDbTool, source: pluginSource });

    if (!dbTool?.customConfig?.associatedPluginId) {
      const tool = await pluginClient.getTool({
        pluginId: parentPluginId,
        version,
        source: pluginSource,
        fallbackLatestVersion: true
      });

      return {
        id: pluginId,
        version: tool.version,
        currentCost: dbTool?.currentCost ?? 0,
        systemKeyCost: dbTool?.systemKeyCost ?? 0,
        secretsVal: isDebugSource ? undefined : SystemToolCodec.getConfiguredSecretsVal(dbTool),
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
    await assertSystemToolRunnable({ tool });

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
      chatConfig: appVersion.chatConfig,
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
