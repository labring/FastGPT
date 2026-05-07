import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { pluginTagList } from '@fastgpt/global/sdk/fastgpt-plugin';
import type { SystemPluginToolTagType } from '@fastgpt/global/core/plugin/type';

export type TagListQuery = {};
export type TagListBody = {};
export type TagListResponse = SystemPluginToolTagType[];

async function handler(
  req: ApiRequestProps<TagListBody, TagListQuery>,
  res: ApiResponseType<any>
): Promise<TagListResponse> {
  return pluginTagList.map((tag, index) => ({
    isSystem: true,
    tagId: tag.id,
    tagName: tag.name,
    tagOrder: index
  }));
}
export default NextAPI(handler);
