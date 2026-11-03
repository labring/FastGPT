import { pluginClient, withPluginClientLocale } from './index';
import type { LangEnum } from '@fastgpt/global/common/i18n/type';
import type {
  ModerationCheckParamsType,
  ModerationDetailType
} from '@fastgpt/global/sdk/fastgpt-plugin';

/**
 * 获取审查插件列表。只请求 `types: ['moderation']`，避免把工具插件混进来。
 *
 * 再在客户端按 `type` 过滤一层：plugin service 侧已经在 `list()` 的查询里按 types 过滤，
 * 这里保留一道防御，避免它以后放宽过滤时审查插件混进工具列表（反之亦然）。
 *
 * 返回的是轻量列表结构（不含 secretSchema 与 meta），渲染配置表单需要调用 getModeration。
 */
export const listModerationPlugins = async ({
  lang
}: {
  lang?: `${LangEnum}`;
} = {}) => {
  const plugins = await withPluginClientLocale(lang, () =>
    pluginClient.listPlugins({ types: ['moderation'] })
  );

  return plugins.filter((plugin) => plugin.type === 'moderation');
};

/** 获取单个审查插件详情（含 secretSchema 与 meta.provider） */
export const getModerationPluginDetail = ({
  pluginId,
  version,
  source,
  lang,
  fallbackLatestVersion
}: {
  pluginId: string;
  version?: string;
  source?: string;
  lang?: `${LangEnum}`;
  fallbackLatestVersion?: boolean;
}): Promise<ModerationDetailType> =>
  withPluginClientLocale(lang, () =>
    pluginClient.getModeration({
      pluginId,
      version,
      source,
      ...(fallbackLatestVersion ? { fallbackLatestVersion: true } : {})
    })
  );

/** 执行一次同步审查。secrets 必须是已解密的明文配置 */
export const checkModerationContent = (params: ModerationCheckParamsType) =>
  pluginClient.checkModeration(params);
