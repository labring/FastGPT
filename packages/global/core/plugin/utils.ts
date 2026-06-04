import type { PluginTagType } from '../../sdk/fastgpt-plugin';
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
