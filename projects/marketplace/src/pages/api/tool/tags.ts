import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ToolTagsNameMap } from '@fastgpt/global/sdk/fastgpt-plugin';
import type { SystemPluginToolTagType } from '@fastgpt/global/core/plugin/type';

export type TagListQuery = {};
export type TagListBody = {};
export type TagListResponse = SystemPluginToolTagType[];

async function handler(
  req: ApiRequestProps<TagListBody, TagListQuery>,
  res: ApiResponseType<any>
): Promise<TagListResponse> {
  const arr: SystemPluginToolTagType[] = [];
  for (const key of Object.keys(ToolTagsNameMap)) {
    arr.push({
      isSystem: true,
      tagId: key,
      tagName: ToolTagsNameMap[key as keyof typeof ToolTagsNameMap],
      tagOrder: arr.length
    });
  }
  return arr;
}
export default NextAPI(handler);
