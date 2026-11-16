import { isProduction } from '@fastgpt/global/common/system/constants';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { type AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import { MongoAppTemplate } from './templateSchema';
import { pluginClient } from '../../../thirdProvider/fastgptPlugin';
import { VersionedDataCache } from '../../../common/cache/versionedDataCache';
import { SystemCacheKeyEnum } from '../../../common/cache/type';
import { serviceEnv } from '../../../env';
import { getLogger, LogCategories } from '../../../common/logger';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import type { ClientSession } from '../../../common/mongo';
import { getS3AvatarSource } from '../../../common/s3/sources/avatar';
import { MongoTemplateTypes } from './templateTypeSchema';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { AppTemplateStorageSchemaType } from '@fastgpt/global/core/app/type';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { migrateAppTemplateWorkflowToCurrent } from './utils';

type PluginSystemTemplateDbConfig = Pick<AppTemplateSchemaType, 'templateId'> &
  Partial<
    Pick<
      AppTemplateSchemaType,
      | 'isActive'
      | 'isPromoted'
      | 'promoteTags'
      | 'hideTags'
      | 'recommendText'
      | 'experienceUrl'
      | 'isQuickTemplate'
      | 'order'
    >
  >;

const getFileTemplates = async (): Promise<AppTemplateSchemaType[]> => {
  return (await pluginClient.listWorkflows()).map((template) => ({
    ...template,
    avatar: template.avatar ?? '',
    intro: template.intro ?? ''
  })) as AppTemplateSchemaType[];
};

/**
 * 归一化模版头像地址。plugin 返回的地址浏览器可直接访问，原样透传；
 * 只兜底空值与不带前导斜杠的相对图标 key。
 */
const formatTemplateAvatar = (avatar?: string | null) => {
  if (!avatar) {
    return '';
  }

  if (avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('/')) {
    return avatar;
  }

  return `/${avatar}`;
};

/**
 * 社区模板由 fastgpt-plugin 维护内容，Mongo 只保存平台运营态配置。
 */
export const pickPluginSystemTemplateDbConfig = (config: PluginSystemTemplateDbConfig) => ({
  ...Object.fromEntries(
    Object.entries({
      isActive: config.isActive,
      isPromoted: config.isPromoted,
      promoteTags: config.promoteTags,
      hideTags: config.hideTags,
      recommendText: config.recommendText,
      experienceUrl: config.experienceUrl,
      isQuickTemplate: config.isQuickTemplate,
      order: config.order
    }).filter(([, value]) => value !== undefined)
  )
});

export const pluginSystemTemplateDbUnsetFields = {
  name: '',
  intro: '',
  avatar: '',
  author: '',
  tags: '',
  type: '',
  userGuide: '',
  workflow: ''
} as const;

const getAppTemplates = async () => {
  const originCommunityTemplates = await getFileTemplates();
  const communityTemplates = originCommunityTemplates.map((template) => {
    return {
      ...template,
      avatar: formatTemplateAvatar(template.avatar),
      templateId: `${AppToolSourceEnum.community}-${template.templateId.split('.')[0]}`
    };
  });

  const dbTemplates = await MongoAppTemplate.find().read('primary').lean();

  // Merge db data to community templates
  const communityTemplateConfig = communityTemplates.map((template) => {
    const config = dbTemplates.find((t) => t.templateId === template.templateId);

    if (config) {
      return {
        ...config,
        ...template,
        ...pickPluginSystemTemplateDbConfig(config)
      };
    }

    return template;
  });
  const res = [
    ...communityTemplateConfig,
    ...dbTemplates.filter((t) => isCommercialTemaplte(t.templateId))
  ]
    .map((template) => ({
      ...template,
      avatar: template.avatar ?? '',
      intro: template.intro ?? ''
    }))
    .map(migrateAppTemplateWorkflowToCurrent)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return res;
};

export const isCommercialTemaplte = (templateId: string) => {
  return templateId.startsWith(`${AppToolSourceEnum.commercial}-`);
};

/**
 * 判断模板是否来自 fastgpt-plugin 的系统模板列表。
 * 系统模板的 workflow 和 userGuide 由 plugin 服务维护，本地数据库只保存展示和上下线等覆盖配置。
 */
export const isPluginSystemTemplate = (templateId: string) => {
  return templateId.startsWith(`${AppToolSourceEnum.community}-`);
};

type TemplateContent = Omit<
  AppTemplateStorageSchemaType,
  'templateId' | 'isQuickTemplate' | 'order' | 'workflow'
> & {
  // 简易应用保存表单，工作流应用保存节点图；迁移与返回时再按类型归一化。
  workflow: AppTemplateStorageSchemaType['workflow'] | AppFormEditFormType;
};
const logger = getLogger(LogCategories.MODULE.APP.TEMPLATE);

/**
 * 应用模板统一读写入口。Mongo 内容和 Plugin 模板按运营字段合并，缓存按共享版本刷新。
 * 写入自建事务时在提交后通知；传入外部 session 时由调用方在外层提交后调用 refreshVersion。
 */
export class AppTemplateData extends VersionedDataCache<AppTemplateSchemaType[]> {
  constructor() {
    super({
      key: SystemCacheKeyEnum.appTemplates,
      maxAgeMs: isProduction && !serviceEnv.DISABLE_CACHE ? 30 * 60 * 1000 : 0
    });
  }

  protected load() {
    return getAppTemplates();
  }

  /** 外部 session 的提交时机不可在此推断；自建事务只在成功提交后发布版本。 */
  private async mutate(
    operation: (session: ClientSession) => Promise<void>,
    session?: ClientSession
  ) {
    if (session) {
      await operation(session);
      return;
    }
    await mongoSessionRun(operation);
    try {
      await this.refreshVersion();
    } catch (error) {
      // 数据已提交，不能向用户报告保存失败。下次读取重试通知，其他实例还有 TTL 兜底。
      logger.warn('App templates saved but cache invalidation failed', { error });
    }
  }

  /** 创建商业模板并在同一事务中保留头像。 */
  async create(data: TemplateContent, session?: ClientSession) {
    await this.mutate(async (session) => {
      await MongoAppTemplate.create(
        [{ ...data, templateId: `${AppToolSourceEnum.commercial}-${getNanoid(12)}` }],
        { session }
      );
      await getS3AvatarSource().refreshAvatar(data.avatar, undefined, session);
    }, session);
  }

  /** 社区模板只保存运营字段；商业模板更新内容，保持旧接口的增量更新语义。 */
  async update(
    { templateId, ...data }: Partial<TemplateContent> & { templateId: string },
    session?: ClientSession
  ) {
    await this.mutate(async (session) => {
      const isCommunity = isPluginSystemTemplate(templateId);
      await MongoAppTemplate.updateOne(
        { templateId },
        isCommunity
          ? {
              $set: pickPluginSystemTemplateDbConfig({ templateId, ...data }),
              $unset: pluginSystemTemplateDbUnsetFields
            }
          : { $set: data },
        { upsert: true, session }
      );
      if (!isCommunity && data.avatar) {
        await getS3AvatarSource().refreshAvatar(data.avatar, undefined, session);
      }
    }, session);
  }

  /** 删除模板，提交后使所有进程的模板快照失效。 */
  async delete(templateId: string, session?: ClientSession) {
    await this.mutate(async (session) => {
      await MongoAppTemplate.deleteOne({ templateId }, { session });
    }, session);
  }

  /** 按传入列表顺序排序；Plugin 模板不存在运营记录时创建覆盖记录。 */
  async updateOrder(templates: { templateId: string }[], session?: ClientSession) {
    if (templates.length === 0) return;
    await this.mutate(async (session) => {
      await MongoAppTemplate.bulkWrite(
        templates.map(({ templateId }, order) => ({
          updateOne: {
            filter: { templateId },
            update: isPluginSystemTemplate(templateId)
              ? { $set: { order }, $unset: pluginSystemTemplateDbUnsetFields }
              : { $set: { order } },
            upsert: true
          }
        })),
        { session }
      );
    }, session);
  }

  /** 全量替换快捷模板集合，既清除旧选择，也为 Plugin 模板创建运营记录。 */
  async updateQuickTemplates(templateIds: string[], session?: ClientSession) {
    await this.mutate(async (session) => {
      const templates = await MongoAppTemplate.find({}, 'templateId').session(session).lean();
      const ids = [
        ...new Set([
          ...templates.map(({ templateId }) => templateId),
          ...templateIds.filter(isPluginSystemTemplate)
        ])
      ];
      if (ids.length === 0) return;
      await MongoAppTemplate.bulkWrite(
        ids.map((templateId) => ({
          updateOne: {
            filter: { templateId },
            update: {
              $set: { isQuickTemplate: templateIds.includes(templateId) },
              ...(isPluginSystemTemplate(templateId)
                ? { $unset: pluginSystemTemplateDbUnsetFields }
                : {})
            },
            upsert: isPluginSystemTemplate(templateId)
          }
        })),
        { session }
      );
    }, session);
  }

  /** 删除分类会同时删除关联模板，必须在同一事务提交后刷新模板版本。 */
  async deleteType(typeId: string, session?: ClientSession) {
    await this.mutate(async (session) => {
      await MongoTemplateTypes.deleteOne({ typeId }, { session });
      await MongoAppTemplate.deleteMany({ tags: typeId }, { session });
    }, session);
  }
}

/** 跨 Next.js 模块实例共享当前进程的模板数据类。 */
export const getAppTemplateData = () => {
  global.appTemplateData ??= new AppTemplateData();
  return global.appTemplateData;
};
