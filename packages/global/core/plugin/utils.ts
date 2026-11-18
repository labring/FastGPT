import { parseI18nString } from '../../common/i18n/utils';
import type { PluginInstallFailureType, PluginTagType } from '../../sdk/fastgpt-plugin';
import { pluginTagList } from '../../sdk/fastgpt-plugin';

/**
 * 过滤静态的 Tags：Plugin built-in 的 Tags 是静态的，FastGPT 系统内允许动态配置 Tags
 * @param tags 传入 string 类型的 tags
 * @returns 过滤后的静态的 tags
 */
export const filterPluginTags = (tags: string[]): PluginTagType[] => {
  const staticTags = pluginTagList.map((tag) => tag.id);
  return tags.filter((tag) => staticTags.includes(tag)) as PluginTagType[];
};

/**
 * 将插件安装失败明细中的多语言原因去重拼接为可读文案；无有效失败原因时返回 `undefined`。
 */
export const formatPluginInstallFailureReasons = ({
  failed,
  lang
}: {
  failed?: PluginInstallFailureType[];
  lang?: string;
}): string | undefined => {
  if (!failed || failed.length === 0) return undefined;

  const reasons = Array.from(
    new Set(failed.map((item) => parseI18nString(item.reason, lang).trim()).filter(Boolean))
  );

  return reasons.length > 0 ? reasons.join('; ') : undefined;
};
